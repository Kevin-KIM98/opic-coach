import { CONFIG } from './config.js';
import { todayKey } from './util.js';

const KEY = 'opic-coach:v1';

const defaultState = () => ({
  settings: { ...CONFIG.defaults, name: '' },
  // 표현 학습 (간격 반복): id -> {box, due, seen}
  expr: {},
  // 연습 답변 기록
  practice: [],
  // 모의고사 결과
  mocks: [],
  // 학습 활동 일자: {date: minutes}
  activity: {},
  bookmarks: [],
  // 마지막으로 공부한 주제 (홈의 '이어서 학습')
  lastTopic: null,
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
  // 만능 패턴을 교체하면 예전 패턴(pat:*) 학습 기록은 더 이상 가리킬 문장이 없다.
  // 현재 patterns.json 에 없는 pat:* 기록을 지워 복습 대기·학습 완료 수가 부풀지 않게 한다.
  prunePatterns(validIds) {
    const valid = new Set(validIds);
    let n = 0;
    for (const k of Object.keys(state.expr)) if (k.startsWith('pat:') && !valid.has(k)) { delete state.expr[k]; n++; }
    if (n) save();
    return n;
  },
  // 학습 기록 일괄 초기화 (data/index.json 의 resetVersion 이 바뀌면 한 번만)
  // 진도·연습·모의고사·학습일·이어서 학습을 지우고, 설정(목표 등급·시험일·음성)은 그대로 둔다.
  syncReset(version) {
    if (!version || state.resetVersion === version) return false;
    const fresh = state.resetVersion === undefined && !Object.keys(state.expr).length && !state.practice.length && !state.mocks.length;
    Object.assign(state, { expr: {}, practice: [], mocks: [], activity: {}, bookmarks: [], lastTopic: null, resetVersion: version });
    save();
    return !fresh;
  },
  // 주제별 학습 내용(data/index.json 의 contentVersion)이 바뀌면 예전 주제 표현 기록은 다른 문장을 가리킨다.
  // 버전이 달라졌을 때 한 번만 주제 표현 기록(<topic>#eN)을 지운다. 패턴(pat:*) 기록은 prunePatterns 가 따로 관리.
  syncTopicContent(version) {
    if (!version || state.topicContentVersion === version) return 0;
    let n = 0;
    for (const k of Object.keys(state.expr)) if (!k.startsWith('pat:')) { delete state.expr[k]; n++; }
    state.topicContentVersion = version;
    save();
    return n;
  },
  // ---- 주제별 집중 학습 ----
  setLastTopic(id) { if (state.lastTopic !== id) { state.lastTopic = id; save(); } },
  // 주제 진행률: 표현 · 주제 패턴 익힘(상자 3 이상) + 질문별 답변 연습 여부
  topicProgress(t) {
    const learned = (prefix, n) => Array.from({ length: n }, (_, i) => this.exprInfo(`${t.id}#${prefix}${i}`).box >= 3).filter(Boolean).length;
    const ex = (t.expressions || []).length, pt = (t.patterns || []).length, qs = (t.questions || []).length;
    const practiced = new Set(state.practice.filter(p => p.topicId === t.id).map(p => p.qid));
    const p = { expr: [learned('e', ex), ex], pat: [learned('p', pt), pt], ans: [(t.questions || []).filter(q => practiced.has(q.id)).length, qs] };
    const done = p.expr[0] + p.pat[0] + p.ans[0], total = ex + pt + qs;
    p.pct = total ? Math.round(done / total * 100) : 0;
    return p;
  },
  learnedCount() { return Object.values(state.expr).filter(v => v.box >= 3).length; },

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
