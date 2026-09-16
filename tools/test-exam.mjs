// js/exam.js 날짜 계산 테스트. 실행: node tools/test-exam.mjs
// store / data 를 흉내낸 최소 스텁을 끼워 넣어 브라우저 없이 로직만 검증합니다.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const schedule = JSON.parse(readFileSync(join(root, 'data/exam-schedule.json'), 'utf8'));

// exam.js 의 import 를 스텁으로 바꿔 임시 파일로 로드
const dir = mkdtempSync(join(tmpdir(), 'exam-test-'));
const settings = { examDate: '' };
writeFileSync(join(dir, 'store.js'), `export const store = { settings: ${JSON.stringify(settings)} };`);
writeFileSync(join(dir, 'data.js'), 'export const data = { examSchedule: async () => { throw new Error("stub"); } };');
writeFileSync(join(dir, 'util.js'), readFileSync(join(root, 'js/util.js'), 'utf8'));
writeFileSync(join(dir, 'exam.js'), readFileSync(join(root, 'js/exam.js'), 'utf8'));

const { resolveExam, nextOpenDay, isOpenDay } = await import(join(dir, 'exam.js'));
const { store } = await import(join(dir, 'store.js'));

let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}

// --- 휴무일 판정 -------------------------------------------------------
eq('평일은 시험일', isOpenDay('2026-09-17', schedule), true);            // 목
eq('일요일은 휴무', isOpenDay('2026-09-20', schedule), false);           // 일
eq('추석 당일은 휴무', isOpenDay('2026-09-25', schedule), false);
eq('추석 연휴 토요일도 휴무', isOpenDay('2026-09-26', schedule), false);
eq('추석 다음 월요일은 시험일', isOpenDay('2026-09-28', schedule), true); // 대체공휴일 아님
eq('개천절 대체공휴일 휴무', isOpenDay('2026-10-05', schedule), false);
eq('한글날 휴무', isOpenDay('2026-10-09', schedule), false);

// --- 다음 응시 가능일 --------------------------------------------------
eq('연휴 첫날에서 다음 영업일', nextOpenDay('2026-09-24', schedule), '2026-09-28');
eq('토요일은 시험일', nextOpenDay('2026-10-10', schedule), '2026-10-10');
eq('개천절 연휴 건너뛰기', nextOpenDay('2026-10-03', schedule), '2026-10-06');

// --- resolveExam: 시험일 미등록 (자동) ---------------------------------
store.settings.examDate = '';
{
  const x = resolveExam(schedule, '2026-09-16');   // 수
  eq('자동: 접수 마감 여유 2일 뒤', x.date, '2026-09-18');
  eq('자동: source', x.source, 'auto');
  eq('자동: D-2', x.dday, 2);
  eq('자동: 접수 마감은 오늘', x.registration.closes, '2026-09-16');
  eq('자동: 오늘 마감이라 접수 가능', x.registration.open, true);
  eq('자동: 만료 아님', x.stale, false);
}
{
  // 추석 연휴 직전: 2일 뒤가 연휴라 연휴 다음 영업일로 밀린다
  const x = resolveExam(schedule, '2026-09-23');
  eq('연휴 직전 자동 날짜', x.date, '2026-09-28');
  eq('연휴 직전 D-day', x.dday, 5);
}

// --- resolveExam: 사용자가 시험일 등록 ---------------------------------
store.settings.examDate = '2026-10-20';
{
  const x = resolveExam(schedule, '2026-09-16');
  eq('사용자 지정 날짜 우선', x.date, '2026-10-20');
  eq('사용자 지정 source', x.source, 'user');
  eq('사용자 지정 D-34', x.dday, 34);
  eq('접수 마감 = 시험 2일 전', x.registration.closes, '2026-10-18');
  eq('권장 접수 = 14일 전', x.registration.recommend, '2026-10-06');
  eq('rolledOver 아님', x.rolledOver, false);
}
{
  const x = resolveExam(schedule, '2026-10-20');   // 시험 당일
  eq('당일 D-0', x.dday, 0);
  eq('당일도 사용자 날짜 유지', x.source, 'user');
  eq('당일은 접수 마감됨', x.registration.open, false);
}

// --- 시험일이 지나면 자동으로 다음 날짜 --------------------------------
{
  const x = resolveExam(schedule, '2026-10-21');   // 시험 다음 날
  eq('지난 뒤 자동 전환', x.source, 'auto');
  eq('지난 뒤 rolledOver 표시', x.rolledOver, true);
  eq('지난 뒤 다음 응시 가능일', x.date, '2026-10-23');
}

// --- 공휴일 데이터 만료 -------------------------------------------------
// coverageUntil 은 워크플로가 늘려 주므로, 하드코딩하지 않고 파일에서 끌어온다
store.settings.examDate = '';
{
  const past = new Date(schedule.coverageUntil + 'T00:00:00');
  past.setDate(past.getDate() + 1);
  const key = past.toISOString().slice(0, 10);
  eq('coverage 이전은 stale 아님', resolveExam(schedule, schedule.coverageUntil).stale, false);
  eq('coverage 이후 stale', resolveExam(schedule, key).stale, true);

  // 일요일은 공휴일 데이터가 없어도 항상 휴무
  const sunday = new Date(past); sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7));
  eq('stale 이어도 일요일은 제외', isOpenDay(sunday.toISOString().slice(0, 10), schedule), false);
}

// --- 일정 파일을 못 읽어도 동작 ----------------------------------------
{
  const x = resolveExam(null, '2026-09-16');
  eq('폴백: 날짜 계산됨', x.date, '2026-09-18');
  eq('폴백: stale 로 표시', x.stale, true);
}

console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
