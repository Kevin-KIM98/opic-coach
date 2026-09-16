import { html, raw, shuffle, pick, fmtTime, levelColor, sheet } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking } from '../speech.js';
import { header } from '../app.js';
import { createRecorderUI } from '../recorder-ui.js';
import { keepAwake } from '../wake-lock.js';
import { analyze, aggregateMock, LEVELS } from '../scoring.js';
import { resultCard, skeleton } from './practice.js';
import { ring } from './home.js';

export function noNav(route) { return route.parts[0] === 'run'; }

export async function render(root, route) {
  const sub = route.parts[0];
  if (sub === 'run') return runMock(root, route.parts[1], route.query);
  if (sub === 'result') return showResult(root, route.parts[1]);
  return list(root);
}

async function list(root) {
  const sets = await data.mockSets();
  const recent = store.state.mocks.slice(0, 3);
  root.innerHTML = html`
    <header class="topbar"><div class="title">모의고사</div><a class="icon-btn" href="#/settings">⚙️</a></header>
    <p class="small ink2">${sets.intro}</p>
    <div class="list mt12">${raw(sets.sets.map(s => `<a class="list-row" href="#/mock/run/${s.id}"><div class="emoji">${s.id === 'opic-full' ? '📝' : s.id === 'opic-mini' ? '⚡' : '🎲'}</div><div class="grow"><div class="t">${s.title}</div><div class="s">${s.desc}</div></div><span class="chev">›</span></a>`).join(''))}</div>
    <div class="section-title">등급 기준 (추정)</div>
    <div class="card"><table class="lvtable"><tr><th>OPIc</th><th>점수</th><th>특징</th></tr>${raw(sets.levels.opic.map(l => `<tr><td><b style="color:${levelColor(l.level)}">${l.level}</b></td><td>${l.min}+</td><td class="xs">${l.desc}</td></tr>`).join(''))}</table></div>
    ${recent.length ? raw(`<div class="section-title">최근 결과</div><div class="list">${recent.map(m => `<a class="list-row" href="#/mock/result/${m.id}"><div class="emoji" style="color:${levelColor(m.level)};font-weight:800;font-size:15px">${m.level}</div><div class="grow"><div class="t">${m.title}</div><div class="s">${new Date(m.date).toLocaleDateString('ko-KR')} · ${m.score}점</div></div><span class="chev">›</span></a>`).join('')}</div>`) : ''}`;
}

// 세트 정의 → 실제 문항 배열
async function buildQuestions(set, opts = {}) {
  const topics = await data.topics();
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const surveyTopics = topics.filter(t => t.category === 'survey' && t.id !== 'self-intro');
  const items = [];
  for (const slot of set.slots) {
    const prep = slot.prepSeconds ?? set.prepSeconds ?? 0;
    const ans = slot.answerSeconds ?? set.answerSeconds ?? 120;
    if (slot.pick === 'survey') {
      const chosen = opts.topics?.length ? opts.topics.map(id => byId[id]).filter(Boolean) : pick(surveyTopics, slot.count || 3);
      for (const t of chosen) {
        for (const type of slot.types) {
          const q = (t.questions || []).find(q => q.type === type) || t.questions?.[0];
          if (q) items.push({ kind: 'q', topic: t, q, prep, ans, type: q.type });
        }
      }
      continue;
    }
    const t = byId[slot.topic];
    if (!t) continue;
    let pool = (t.questions || []).filter(q => !slot.type || q.type === slot.type);
    pick(pool, slot.count || 1).forEach(q => items.push({ kind: 'q', topic: t, q, prep, ans, type: q.type }));
  }
  return items;
}

let recUI = null;

async function runMock(root, setId, query) {
  const sets = await data.mockSets();
  const set = sets.sets.find(s => s.id === setId);
  if (!set) { root.innerHTML = '<div class="empty">모의고사를 찾을 수 없습니다.</div>'; return; }
  const patterns = await data.patterns();
  const patternBank = patterns.groups.flatMap(g => g.items.map(i => i.en));

  // 시작 화면: 설문 주제 선택 (opic-full / mini)
  const topics = await data.topics();
  const survey = topics.filter(t => t.category === 'survey' && t.id !== 'self-intro');
  const needsPick = set.slots.some(s => s.pick === 'survey');
  const startedAt = Date.now();
  // 시험이 시작되면 끝날 때까지 화면을 켜 둔다 (문제 읽기·준비 시간 포함)
  let releaseWake = null;

  const showIntro = () => {
    root.innerHTML = html`
      ${raw(header(set.title))}
      <div class="card"><div class="h3">${set.title}</div><p class="small ink2 mt8">${set.desc}</p>
        <ul class="small ink2 mt8" style="padding-left:18px;margin:0"><li>질문은 음성으로 1회 읽어 줍니다 (실제 시험처럼 🔁 다시 듣기 1회 가능)</li><li>답변은 자동 녹음·전사되고, 시간이 끝나면 다음 문항으로 넘어갑니다</li><li>조용한 곳에서 이어폰 마이크를 쓰면 인식률이 올라갑니다</li></ul></div>
      ${needsPick ? raw(`<div class="section-title">설문 주제 선택 (${set.slots.find(s => s.pick === 'survey').count}개, 비우면 랜덤)</div><div class="chips" id="pickchips" style="flex-wrap:wrap">${survey.map(t => `<button class="chip" data-pick="${t.id}">${t.emoji} ${t.title}</button>`).join('')}</div>`) : ''}
      <button class="btn primary lg block mt24" id="start">시작하기</button>
      <a class="btn ghost block mt8" href="#/mock">돌아가기</a>`;
    const picked = new Set();
    root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.pick; const max = set.slots.find(s => s.pick === 'survey').count;
      if (picked.has(id)) picked.delete(id); else if (picked.size < max) picked.add(id);
      b.classList.toggle('active', picked.has(id));
    }));
    root.querySelector('#start').addEventListener('click', async () => {
      const items = await buildQuestions(set, { topics: [...picked] });
      releaseWake ||= keepAwake();
      runItems(items);
    });
  };

  const runItems = (items) => {
    let i = 0;
    const results = [];
    const step = () => {
      recUI?.destroy(); recUI = null; stopSpeaking();
      if (i >= items.length) return finish(items);
      const it = items[i];
      const bank = [...(it.topic.expressions || []).map(e => e.en), ...patternBank];
      root.innerHTML = html`
        <header class="topbar"><button class="icon-btn" id="quit">✕</button><div class="title">${set.title} · ${i + 1} / ${items.length}</div><button class="icon-btn" id="replay" title="다시 듣기">🔁</button></header>
        <div class="bar mb12"><i style="width:${(i) / items.length * 100}%"></i></div>
        <div class="qcard">
          <div class="row between mb8"><span class="badge type">${TYPE_LABEL[it.type] || it.type}</span><span class="xs muted">${it.topic.emoji} ${it.topic.title}</span></div>
          ${raw(`<div class="q-en">${it.q.en}</div><div class="q-ko muted" id="qko" style="filter:blur(5px)" title="탭하면 해석">${it.q.ko}</div>`)}
        </div>
        <div class="card mt12"><div id="rec"></div></div>
        <div class="card soft mt12 small ink2">💡 ${skeleton(it.type)}</div>
        <div class="btn-row mt12"><button class="btn" id="skip">건너뛰기</button><button class="btn dark" id="next" disabled>다음 문항 ›</button></div>`;
      root.querySelector('#qko')?.addEventListener('click', e => { e.currentTarget.style.filter = ''; });
      root.querySelector('#quit').addEventListener('click', () => { if (confirm('모의고사를 중단할까요? 지금까지 답한 문항만 채점됩니다.')) finish(items.slice(0, i)); });
      let replays = 1;
      root.querySelector('#replay').addEventListener('click', () => { if (replays-- > 0) speak(it.q.en); });
      const $next = root.querySelector('#next');
      let done = false;
      const onDone = (res) => {
        const result = analyze(res.transcript, res.seconds, { type: it.type, expressions: bank, segments: res.segments });
        it.result = result; it.transcript = res.transcript; it.seconds = Math.round(res.seconds);
        done = true; $next.disabled = false;
        // 자동 진행 (3초 후)
        setTimeout(() => { if (root.contains($next) && items[i] === it) { i++; step(); } }, 2500);
      };
      // 녹음 위젯은 즉시 표시 (버튼으로 바로 시작 가능), 질문 음성이 끝나면 자동 시작
      recUI = createRecorderUI(root.querySelector('#rec'), { maxSeconds: it.ans, prepSeconds: it.prep, onDone });
      const ui = recUI;
      speak(it.q.en).then(() => { if (ui === recUI && ui.state === 'idle') { if (it.prep) ui.startPrep(); else ui.start(); } });
      root.querySelector('#skip').addEventListener('click', () => { recUI?.destroy(); i++; step(); });
      $next.addEventListener('click', () => { if (done) { i++; step(); } });
    };
    step();
  };

  const finish = (items) => {
    recUI?.destroy(); recUI = null; stopSpeaking();
    const agg = aggregateMock(items.filter(it => it.kind === 'q'));
    const rec = store.addMock({
      set: set.id, title: set.title, kind: set.kind, score: agg.score, level: agg.level,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      items: items.map(it => ({ id: it.q?.id || it.id, topic: it.topic.id, topicTitle: it.topic.title, type: it.type, question: it.q?.en || it.text, score: it.result?.score ?? null, level: it.result?.level ?? null, words: it.result?.metrics?.words ?? 0, seconds: it.seconds || 0, transcript: it.transcript || '', feedback: it.result?.feedback || [] })),
    });
    releaseWake?.(); releaseWake = null;
    location.hash = `#/mock/result/${rec.id}`;
  };

  showIntro();
  return () => { recUI?.destroy(); recUI = null; releaseWake?.(); releaseWake = null; stopSpeaking(); };
}

async function showResult(root, id) {
  const m = store.state.mocks.find(x => x.id === id);
  if (!m) { root.innerHTML = '<div class="empty">결과를 찾을 수 없습니다.</div>'; return; }
  const answered = m.items.filter(it => it.score != null);
  const weak = answered.filter(it => it.level && it.level !== '-').sort((a, b) => a.score - b.score).slice(0, 3);
  const target = store.settings.target;
  const byType = {};
  answered.forEach(it => { if (it.level === '-') return; const k = it.type.split('-')[0]; (byType[k] ||= []).push(it.score); });
  root.innerHTML = html`
    ${raw(header('모의고사 결과', { right: '<a class="icon-btn" href="#/mock">✕</a>' }))}
    <div class="card"><div class="score-hero"><div class="xs muted">${m.title} · ${new Date(m.date).toLocaleString('ko-KR')}</div>
      <div class="lvl" style="color:${levelColor(m.level)}">${m.level}</div><div class="num">추정 OPIc 등급 · ${m.score}점 · 목표 ${target}</div></div>
      <div class="row" style="justify-content:center;gap:16px"><div class="ring">${raw(ring(m.score, levelColor(m.level)))}</div></div>
      <p class="small ink2 center mt12">${raw(verdict(m, target))}</p></div>

    <div class="section-title">유형별 평균</div>
    <div class="metrics">${raw(Object.entries(byType).map(([k, arr]) => `<div class="metric"><b>${Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)}</b><span>${TYPE_LABEL[k] || k}</span></div>`).join(''))}</div>

    ${weak.length ? raw(`<div class="section-title">우선 보완할 문항</div><div class="list">${weak.map(it => `<a class="list-row" href="#/practice/${it.topic}/${it.id}?mode=speak"><div class="emoji" style="font-weight:800;font-size:14px;color:${levelColor(it.level)}">${it.level}</div><div class="grow"><div class="t">${it.question}</div><div class="s">${it.topicTitle} · ${it.words}단어 · ${it.score}점</div></div><span class="chev">›</span></a>`).join('')}</div>`) : ''}

    <div class="section-title">문항별 상세</div>
    <div class="list">${raw(m.items.map((it, i) => `<div class="card" style="padding:14px"><div class="row between"><div class="grow"><div class="xs muted">${i + 1}. ${it.topicTitle} · ${TYPE_LABEL[it.type] || it.type}</div><div class="small" style="font-weight:700">${it.question}</div></div><div style="text-align:right"><b style="color:${levelColor(it.level)}">${it.level ?? '-'}</b><div class="xs muted">${it.score ?? '—'}점</div></div></div>
      ${it.transcript ? `<details class="mt8"><summary class="xs muted">전사 · ${it.words}단어 · ${fmtTime(it.seconds)}</summary><p class="small ink2 mt8">${it.transcript}</p>${it.feedback.map(f => `<div class="fb ${f.kind} mt8"><span class="k">${{ good: '✅', bad: '❌', warn: '⚠️', tip: '💡' }[f.kind]}</span><span>${f.text}</span></div>`).join('')}</details>` : '<div class="xs muted mt8">답변 없음</div>'}</div>`).join(''))}</div>
    <div class="btn-row mt16"><a class="btn" href="#/mock">목록</a><a class="btn primary" href="#/mock/run/${m.set}">다시 도전</a></div>`;
}

function verdict(m, target) {
  const idx = LEVELS.findIndex(l => l.level === m.level), t = LEVELS.findIndex(l => l.level === target);
  if (idx < 0) return '';
  if (idx >= t) return `🎉 목표 <b>${target}</b> 수준입니다. 실전에서도 같은 발화량을 유지하도록 매일 미니 모의고사로 컨디션을 관리하세요.`;
  const next = LEVELS[idx + 1];
  return `현재 <b>${m.level}</b>, 다음 단계 <b>${next.level}</b>까지 ${next.min - m.score}점. ${idx <= 2 ? '먼저 모든 문항에서 60초 이상, 70단어 이상 말하는 것에 집중하세요.' : idx === 3 ? '연결어(because, so, after that)와 과거시제를 안정시키면 IM3가 됩니다.' : '디테일(숫자·이름·느낌)과 비교 표현(used to, compared to)을 추가하면 IH가 보입니다.'}`;
}
