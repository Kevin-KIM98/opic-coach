// data/exam-schedule.json 의 공휴일 목록을 자동 갱신합니다.
// 실행: node tools/update-exam-schedule.mjs [--check] [--years 2026,2027]
//   --check  : 파일을 쓰지 않고 남은 커버리지만 점검 (커버리지 부족하면 exit 1)
// GitHub Actions 에서 매달 돌리며, 네트워크·응답이 이상하면 파일을 건드리지 않고 실패합니다.
//
// 출처: date.nager.at 공개 API (한국 공휴일). 정부 임시공휴일처럼 뒤늦게 지정되는 날은
// 반영이 늦을 수 있으므로, 확인되면 holidays 에 직접 추가해도 됩니다 (다음 실행 때 병합됩니다).
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/exam-schedule.json', import.meta.url);
const API = (y) => `https://date.nager.at/api/v3/PublicHolidays/${y}/KR`;
const MIN_COVERAGE_DAYS = 60;   // 남은 커버리지가 이보다 짧으면 경고
const MIN_HOLIDAYS_PER_YEAR = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const yearsArg = args[args.indexOf('--years') + 1];
const thisYear = new Date().getUTCFullYear();
const years = args.includes('--years') && yearsArg
  ? yearsArg.split(',').map(y => Number(y.trim()))
  : [thisYear, thisYear + 1];

const schedule = JSON.parse(readFileSync(FILE, 'utf8'));
const todayKey = new Date().toISOString().slice(0, 10);
const daysLeft = Math.round((Date.parse(schedule.coverageUntil + 'T00:00:00Z') - Date.parse(todayKey + 'T00:00:00Z')) / 86400000);

if (checkOnly) {
  console.log(`coverageUntil=${schedule.coverageUntil} (${daysLeft}일 남음), 공휴일 ${schedule.holidays.length}건`);
  if (daysLeft < MIN_COVERAGE_DAYS) {
    console.error(`::error::공휴일 커버리지가 ${daysLeft}일 남았습니다. tools/update-exam-schedule.mjs 로 갱신하세요.`);
    process.exit(1);
  }
  console.log('✅ 커버리지 충분');
  process.exit(0);
}

async function fetchYear(year) {
  const res = await fetch(API(year), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${API(year)} → HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`${year}: 배열이 아닌 응답`);

  const out = [];
  for (const h of body) {
    // 공공기관 휴무일만 (nager 는 지역/종교 기념일도 함께 내려줍니다)
    if (h.global === false) continue;
    if (!DATE_RE.test(h.date || '')) throw new Error(`${year}: 날짜 형식 이상 '${h.date}'`);
    if (!String(h.date).startsWith(String(year))) throw new Error(`${year}: 연도가 다른 날짜 '${h.date}'`);
    out.push({ date: h.date, name: (h.localName || h.name || '공휴일').trim() });
  }
  if (out.length < MIN_HOLIDAYS_PER_YEAR) {
    throw new Error(`${year}: 공휴일이 ${out.length}건뿐입니다 (최소 ${MIN_HOLIDAYS_PER_YEAR}건 기대). 응답 형식이 바뀌었을 수 있습니다.`);
  }
  return out;
}

const fetched = [];
for (const y of years) fetched.push(...await fetchYear(y));

// 기존 목록 중 수동으로 추가한 날(임시공휴일 등)은 유지하고, 같은 날짜는 API 값으로 덮어씁니다.
const merged = new Map(schedule.holidays.map(h => [h.date, h]));
for (const h of fetched) merged.set(h.date, h);

const holidays = [...merged.values()]
  .filter(h => DATE_RE.test(h.date))
  .sort((a, b) => a.date.localeCompare(b.date));

const next = {
  ...schedule,
  updatedAt: todayKey,
  coverageUntil: `${Math.max(...years)}-12-31`,
  holidays,
};

if (JSON.stringify(next) === JSON.stringify(schedule)) {
  console.log('변경 없음');
  process.exit(0);
}

writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
console.log(`✅ 갱신: 공휴일 ${holidays.length}건, coverageUntil=${next.coverageUntil}`);
