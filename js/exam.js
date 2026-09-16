// 시험일 계산: OPIc 은 상시시험이라 고정된 시험일 목록이 없습니다.
// data/exam-schedule.json 의 휴무 규칙(일요일·공휴일)으로 "다음 응시 가능일" 을 구하고,
// 접수 마감일을 함께 계산합니다. 시험일이 지나면 자동으로 다음 날짜로 넘어갑니다.
import { data } from './data.js';
import { store } from './store.js';
import { todayKey, daysBetween } from './util.js';

const FALLBACK = {
  updatedAt: '', coverageUntil: '',
  exam: { name: 'OPIc', closedWeekdays: [0], officialUrl: 'https://www.opic.or.kr' },
  registration: { closesDaysBefore: 2, recommendDaysBefore: 14 },
  holidays: [],
};

function addDays(key, n) {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

function weekday(key) { return new Date(key + 'T00:00:00').getDay(); }

/** 그 날 시험이 열리는지 (일요일·공휴일 제외) */
export function isOpenDay(key, schedule) {
  const closed = schedule.exam?.closedWeekdays || [0];
  if (closed.includes(weekday(key))) return false;
  return !(schedule.holidays || []).some(h => h.date === key);
}

/** fromKey(포함) 이후 처음으로 시험이 열리는 날. 1년 안에 못 찾으면 null */
export function nextOpenDay(fromKey, schedule) {
  let k = fromKey;
  for (let i = 0; i < 366; i++) {
    if (isOpenDay(k, schedule)) return k;
    k = addDays(k, 1);
  }
  return null;
}

/**
 * 오늘 기준 시험 정보를 정리한다.
 * - 사용자가 설정에서 시험일을 넣었고 아직 지나지 않았으면 그 날짜 (source: 'user')
 * - 없거나 이미 지났으면 지금 접수해서 볼 수 있는 가장 빠른 날 (source: 'auto')
 */
export function resolveExam(schedule, today = todayKey()) {
  const sc = { ...FALLBACK, ...(schedule || {}) };
  const reg = { ...FALLBACK.registration, ...(sc.registration || {}) };
  // 접수 마감이 지나지 않은 가장 빠른 시험일 = 오늘 + 마감 여유일
  const auto = nextOpenDay(addDays(today, reg.closesDaysBefore), sc);
  const userDate = store.settings.examDate;
  const userValid = !!userDate && daysBetween(today, userDate) >= 0;

  const date = userValid ? userDate : auto;
  if (!date) return null;

  const closes = addDays(date, -reg.closesDaysBefore);
  const recommend = addDays(date, -reg.recommendDaysBefore);
  const closesIn = daysBetween(today, closes);

  return {
    date,
    source: userValid ? 'user' : 'auto',
    // 사용자가 넣은 시험일이 지나서 자동 날짜로 넘어간 경우
    rolledOver: !!userDate && !userValid,
    dday: daysBetween(today, date),
    name: sc.exam?.name || 'OPIc',
    note: sc.exam?.note || '',
    openDay: isOpenDay(date, sc),
    nextOpen: auto,
    registration: {
      closes,
      recommend,
      closesIn,
      recommendIn: daysBetween(today, recommend),
      open: closesIn >= 0,
      note: reg.note || '',
      url: reg.url || sc.exam?.officialUrl,
    },
    // 공휴일 데이터가 오늘을 못 덮으면 계산이 부정확해질 수 있음
    stale: !sc.coverageUntil || daysBetween(today, sc.coverageUntil) < 0,
    coverageUntil: sc.coverageUntil,
    officialUrl: sc.exam?.officialUrl,
    scheduleUrl: sc.exam?.scheduleUrl || sc.exam?.officialUrl,
  };
}

export async function examInfo() {
  let schedule = null;
  try { schedule = await data.examSchedule(); } catch { /* 오프라인이면 기본 규칙으로 계산 */ }
  return resolveExam(schedule);
}
