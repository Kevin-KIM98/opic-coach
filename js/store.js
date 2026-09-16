import { CONFIG } from './config.js';
import { todayKey } from './util.js';

const KEY = 'opic-coach:v1';

const defaultState = () => ({
  settings: { ...CONFIG.defaults, planStart: todayKey(), name: '' },
  // 표현 학습 (간격 반복): id -> {box, due, seen}
  expr: {},
  // 학습 일정 완료: "planId:day" -> [taskIndex...]
  tasks: {},
  // 연습 답변 기록
  practice: [],
  // 모의고사 결과
  mocks: [],
  // 학습 활동 일자: {date: minutes}
  activity: {},
  bookmarks: [],
  // 집중 학습: 서베이에서 고르기로 한 항목 · 등급별 달성 체크
  surveyPicks: [],
  focusChecks: [],
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings || {}) } };
  } catch {
    return defaultState();
  }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
}

export const store = {
  get state() { return state; },
  get settings() { return state.settings; },
  setSetting(k, v) { state.settings[k] = v; save(); },

  // ---- 활동 기록 / 스트릭 ----
  logActivity(minutes = 1) {
    const k = todayKey();
    state.activity[k] = (state.activity[k] || 0) + minutes;
    save();
  },
  streak() {
    let n = 0;
    const d = new Date();
    // 오늘 활동이 없으면 어제부터 센다
    if (!state.activity[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (state.activity[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  totalMinutes() { return Object.values(state.activity).reduce((a, b) => a + b, 0); },

  // ---- 표현 간격 반복 (Leitner 5 box) ----
  exprInfo(id) { return state.expr[id] || { box: 0, due: 0, seen: 0 }; },
  rateExpr(id, ok) {
    const info = this.exprInfo(id);
    const intervals = [0, 1, 3, 7, 14, 30];
    const box = ok ? Math.min(5, info.box + 1) : 1;
    const due = Date.now() + intervals[box] * 86400000;
    state.expr[id] = { box, due, seen: info.seen + 1 };
    this.logActivity(0.3);
    save();
  },
  dueExprs() {
    const now = Date.now();
    return Object.entries(state.expr).filter(([, v]) => v.due <= now && v.box < 5).map(([k]) => k);
  },
  learnedCount() { return Object.values(state.expr).filter(v => v.box >= 3).length; },

  // ---- 학습 일정 ----
  taskKey(planId, day) { return `${planId}:${day}`; },
  doneTasks(planId, day) { return state.tasks[this.taskKey(planId, day)] || []; },
  toggleTask(planId, day, idx, minutes = 10) {
    const k = this.taskKey(planId, day);
    const arr = state.tasks[k] || [];
    const i = arr.indexOf(idx);
    if (i >= 0) arr.splice(i, 1); else { arr.push(idx); this.logActivity(minutes); }
    state.tasks[k] = arr;
    save();
    return i < 0;
  },
  markTask(planId, day, idx, minutes = 10) {
    const k = this.taskKey(planId, day);
    const arr = state.tasks[k] || [];
    if (!arr.includes(idx)) { arr.push(idx); this.logActivity(minutes); }
    state.tasks[k] = arr;
    save();
  },

  // ---- 연습 / 모의고사 ----
  addPractice(rec) {
    state.practice.unshift({ ...rec, date: new Date().toISOString() });
    state.practice = state.practice.slice(0, 300);
    this.logActivity(3);
    save();
  },
  addMock(rec) {
    const r = { ...rec, id: Date.now().toString(36), date: new Date().toISOString() };
    state.mocks.unshift(r);
    state.mocks = state.mocks.slice(0, 100);
    this.logActivity(Math.round((rec.durationSec || 600) / 60));
    save();
    return r;
  },
  isSurveyPicked(label) { return state.surveyPicks.includes(label); },
  toggleSurveyPick(encoded) {
    const label = decodeURIComponent(encoded);
    const i = state.surveyPicks.indexOf(label);
    if (i >= 0) state.surveyPicks.splice(i, 1); else state.surveyPicks.push(label);
    save();
    return i < 0;
  },
  isFocusChecked(key) { return state.focusChecks.includes(key); },
  toggleFocusCheck(key) {
    const i = state.focusChecks.indexOf(key);
    if (i >= 0) state.focusChecks.splice(i, 1); else state.focusChecks.push(key);
    save();
    return i < 0;
  },
  toggleBookmark(id) {
    const i = state.bookmarks.indexOf(id);
    if (i >= 0) state.bookmarks.splice(i, 1); else state.bookmarks.push(id);
    save();
    return i < 0;
  },
  isBookmarked(id) { return state.bookmarks.includes(id); },

  // ---- 백업 ----
  exportJSON() { return JSON.stringify(state, null, 1); },
  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.settings) throw new Error('형식이 올바르지 않습니다');
    state = { ...defaultState(), ...parsed };
    save();
  },
  reset() { state = defaultState(); save(); },
};
