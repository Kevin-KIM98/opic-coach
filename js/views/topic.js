import { html, raw, splitSentences, toast, sheet } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking, isSpeaking } from '../speech.js';
import { editLinkHtml } from '../config.js';
import { header, replaceQuery, openMode, closeMode } from '../app.js';
import { createRecorderUI } from '../recorder-ui.js';
import { createAutoPlay, createSequencePlayer, repeatCount, gapLabel, cycleRepeat, cycleGap, repeatLoop, toggleLoop, loopLabel } from '../autoplay.js';
import { compareToText } from '../scoring.js';
import { speakQuiz } from './quiz.js';

// 주제 화면: ① 표현 → ② 이 주제에 쓰는 패턴 → ③ 모범답안·직접 말하기 → ④ 팁(출제 경향·전략)
const TABS = [['expr', '표현'], ['pat', '패턴'], ['q', '답안'], ['tips', '팁']];
const NUM = ['①', '②', '③', '④'];

// 기출 주제는 질문·모범답안이 먼저, 패턴이 없는 주제는 패턴 탭을 뺀다
function tabsFor(topic) {
  let tabs = TABS.filter(([k]) => k !== 'pat' || (topic.patterns || []).length);
  if (topic.category === 'exam') tabs = [['q', '질문·답안'], ...tabs.filter(([k]) => k !== 'q')];
  return tabs.map(([k, t], i) => [k, `${NUM[i]} ${t}`]);
}

export async function render(root, route) {
  const id = route.parts[0];
  const [topic, patterns] = await Promise.all([data.topic(id), data.patterns()]);
  const tabs = tabsFor(topic);
  let tab = route.query.tab || tabs[0][0];
  if (tab === 'pron' || tab === 'guide') tab = 'tips';   // 예전 링크 호환
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  let level = route.query.level || store.settings.target || 'IM3';
  store.setLastTopic(topic.id);

  root.innerHTML = html`
    ${raw(header(`${topic.emoji} ${topic.title}`, { right: editLinkHtml(topic.file, '✏️', 'icon-btn') }))}
    <div class="topic-steps" data-steps></div>
    <div class="tabs mt12" id="tabs">${raw(tabs.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${t}</button>`).join(''))}</div>
    <div id="tabbody" class="mt12"></div>`;

  const drawSteps = () => {
    const p = store.topicProgress(topic);
    root.querySelector('[data-steps]').innerHTML = [['expr', '표현'], ['pat', '패턴'], ['ans', '답안 연습']].filter(([k]) => p[k][1])
      .map(([k, l]) => `<div class="s"><i style="width:${p[k][1] ? p[k][0] / p[k][1] * 100 : 0}%"></i><span>${l} ${p[k][0]}/${p[k][1]}</span></div>`).join('');
  };
  drawSteps();

  const body = root.querySelector('#tabbody');
  let player = null;
  const renderTab = (t, mode = '') => {
    root.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    player?.destroy(); player = null;
    stopSpeaking();
    drawSteps();
    const base = `#/topic/${topic.id}?tab=${t}`;
    if (t === 'expr') player = renderExpr(body, topic, mode, base);
    else if (t === 'pat') player = renderTopicPatterns(body, topic, patterns, drawSteps, mode, level, (lv) => {
      level = lv; replaceQuery(`#/topic/${topic.id}?tab=pat&level=${lv}`); renderTab('pat');
    });
    else if (t === 'q') renderQuestions(body, topic, level, route.query, (lv) => {
      level = lv; replaceQuery(`#/topic/${topic.id}?tab=q&level=${lv}`); renderTab('q');
    });
    else player = renderTips(body, topic);
  };
  root.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    replaceQuery(`#/topic/${topic.id}?tab=${b.dataset.tab}`);   // 탭은 기록에 쌓지 않는다
    renderTab(b.dataset.tab);
  }));
  renderTab(tab, route.query.mode || '');
  return () => { player?.destroy(); stopSpeaking(); };
}

// ---------- 주제 패턴: 만능 패턴 72문장을 이 주제 내용으로 채운 문장 ----------
export function topicPatternCards(topic, patterns) {
  const frames = {};
  (patterns.groups || []).forEach(g => g.items.forEach((it, i) => { frames[`${g.id}#${i}`] = { pattern: it.pattern, level: it.level, group: g.title }; }));
  return (topic.patterns || []).map((p, i) => {
    const f = frames[p.pid] || {};
    // level: 이 문장을 쓰는 답안 레벨(IM3·IH·AL). 예전 데이터처럼 없으면 패턴 틀 레벨(IM·IH·AL)
    return { ...p, id: `${topic.id}#p${i}`, no: i + 1, pattern: f.pattern, answerLevel: p.level || '', level: f.level || 'IM', group: f.group || '', note: f.pattern ? `패턴: ${f.pattern}` : '' };
  });
}

// ---------- 패턴 조합: 두 영상의 패턴을 이어 붙여 만든 답변 한 단락 ----------
function comboSection(topic, patterns, level, qById) {
  const frames = {};
  (patterns.groups || []).forEach(g => g.items.forEach((it, i) => { frames[`${g.id}#${i}`] = { pattern: it.pattern || it.en, set: g.set || 'kang' }; }));
  const combos = (topic.combos || []).filter(c => !level || c.level === level);
  if (!combos.length) return '';
  const setName = { kang: '만능 72', im3: 'IM3 Part 1', im3b: 'IM3 Part 2', daily54: '일반회화 54' };
  return `<div class="section-title">🔗 패턴 조합 · ${level || ''}</div>
    <p class="xs muted mb12">패턴 여러 개를 이어 붙이면 답변 한 단락이 됩니다. ▶ 로 통째로 듣고 따라 말해 보세요.</p>
    <div class="list">${combos.map(c => {
      const q = qById[c.q];
      const text = c.parts.map(p => p.en).join(' ');
      return `<div class="combo">
        <div class="row between"><div class="h3">${c.title}</div><button class="play" data-say="${encodeURIComponent(text)}" aria-label="조합 듣기">▶</button></div>
        <div class="combo-chain mt8">${c.parts.map((p, k) => `${k ? '<span class="plus">+</span>' : ''}<span class="link ${frames[p.pid]?.set || ''}" title="${setName[frames[p.pid]?.set] || ''}">${(frames[p.pid]?.pattern || '').replace(/_{2,}\.?/g, '…')}</span>`).join('')}</div>
        <div class="combo-body mt12">${c.parts.map(p => `<div class="combo-line"><div class="en">${p.en}</div><div class="ko">${p.ko}</div></div>`).join('')}</div>
        ${q ? `<a class="note mt8" href="#/practice/${topic.id}/${q.id}?level=${c.level}">💬 ${TYPE_LABEL[q.type] || q.type} ${c.level} 답안으로 ›</a>` : ''}
      </div>`;
    }).join('')}</div>`;
}

// 모범답안에서 패턴 문장 찾기: { 영어 문장: 패턴 틀 } (그 레벨에 적용한 문장만)
export function patternSentenceMap(topic, patterns, level) {
  const out = {};
  topicPatternCards(topic, patterns).filter(c => c.answerLevel === level && c.pattern).forEach(c => { out[c.en.trim()] = c.pattern; });
  return out;
}

const LEVELS = ['IM3', 'IH', 'AL'];

function renderTopicPatterns(body, topic, patterns, onChange, mode = '', level = 'IM3', setLevel = () => {}) {
  const every = topicPatternCards(topic, patterns);
  const leveled = every.some(c => c.answerLevel);
  if (leveled && !LEVELS.includes(level)) level = 'IM3';
  // 레벨별로 적용한 패턴이면 고른 레벨 것만 — 같은 패턴 틀도 레벨이 오를수록 더 길고 풍부하게 채워진다
  const cards = (leveled ? every.filter(c => c.answerLevel === level) : every).map((c, k) => ({ ...c, no: k + 1 }));
  const base = `#/topic/${topic.id}?tab=pat${leveled ? `&level=${level}` : ''}`;
  const qById = Object.fromEntries((topic.questions || []).map(q => [q.id, q]));
  const handle = { stop() {}, destroy() {} };
  const list = () => {
    onChange();
    body.innerHTML = html`
      ${leveled ? raw(`<div class="seg mb12" data-levels>${LEVELS.map(l => `<button data-lv="${l}" class="${l === level ? 'active' : ''}">${l}${l === (store.settings.target || 'IM3') ? ' 🎯' : ''}</button>`).join('')}</div>`) : ''}
      <div class="row between mb12"><div class="small muted">${leveled ? `${level} 모범답안에 실제로 들어간 만능 패턴 문장이에요.` : `만능 패턴을 ${topic.title} 답변에 맞춰 채웠어요.`} 빈칸(___)만 바꾸면 내 이야기가 됩니다.</div>
        <span class="row" style="gap:6px"><button class="btn sm" data-quiz>🎙️ 퀴즈</button><button class="btn sm dark" data-flash>카드</button></span></div>
      <div data-autoplay></div>
      <div class="list mt12" data-list>${raw(cards.map(c => {
        const info = store.exprInfo(c.id);
        const dot = info.box >= 3 ? '✅' : info.box > 0 ? '🟡' : '';
        const q = qById[c.q];
        return `<div class="expr"><button class="play" data-say="${encodeURIComponent(c.en)}">🔊</button>
          <div class="grow">${c.pattern ? `<div class="pat-frame">${c.no}. ${c.pattern}</div>` : ''}<div class="en">${c.en} <span class="xs">${dot}</span></div><div class="ko">${c.ko}</div>
          ${q ? `<a class="note" href="#/practice/${topic.id}/${q.id}${c.answerLevel ? `?level=${c.answerLevel}` : ''}">💬 ${TYPE_LABEL[q.type] || q.type} ${c.answerLevel ? `${c.answerLevel} 답안에서 보기` : '답변에 쓰기'} ›</a>` : ''}</div>
          <span class="badge ${c.level}">${c.level}</span></div>`;
      }).join(''))}</div>
      ${cards.length ? '' : raw('<div class="empty">이 주제에는 아직 패턴이 없어요.</div>')}
      ${raw(comboSection(topic, patterns, leveled ? level : null, qById))}
      <a class="btn ghost block mt12" href="#/drill?tab=patterns">🧩 만능 패턴 전체 보기 (72 · IM3 25 · 일반회화 54)</a>`;
    bindPlay(body);
    const player = createAutoPlay(body.querySelector('[data-autoplay]'), body.querySelector('[data-list]'));
    handle.stop = () => player.stop(); handle.destroy = () => player.destroy();
    body.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { if (b.dataset.lv !== level) { player.destroy(); setLevel(b.dataset.lv); } }));
    body.querySelector('[data-flash]')?.addEventListener('click', () => { player.destroy(); openMode(`${base}&mode=cards`); });
    body.querySelector('[data-quiz]')?.addEventListener('click', () => { player.destroy(); openMode(`${base}&mode=quiz`); });
  };
  const back = () => closeMode(base);
  if (mode === 'cards' && cards.length) { const p = flashcards(body, cards, back); handle.stop = p.stop; handle.destroy = p.destroy; }
  else if (mode === 'quiz' && cards.length) { const p = speakQuiz(body, cards, back); handle.stop = p.stop; handle.destroy = p.destroy; }
  else list();
  return handle;
}

// ---------- 표현: 리스트 + 플래시카드 ----------
function renderExpr(body, topic, mode = '', base = '') {
  const exprs = topic.expressions || [];
  if (mode === 'cards' && exprs.length) return flashcards(body, exprs.map((e, i) => ({ ...e, id: `${topic.id}#e${i}` })), () => closeMode(base));
  body.innerHTML = html`
    <div class="row between mb12">
      <div class="small muted">${exprs.length}개 표현 · 🔊 탭하면 발음, 카드 모드로 암기</div>
      <button class="btn sm dark" data-flash>카드 모드</button>
    </div>
    <div data-autoplay></div>
    <div class="list mt12" data-list>${raw(exprs.map((e, i) => exprRow(e, `${topic.id}#e${i}`)).join(''))}</div>`;

  bindPlay(body);
  const list = body.querySelector('[data-list]');
  const player = createAutoPlay(body.querySelector('[data-autoplay]'), list);
  const handle = { stop: () => player.stop(), destroy: () => player.destroy() };
  // 카드 모드는 기록을 남겨 열어서, 뒤로 가기 한 번이면 이 목록으로 돌아온다
  body.querySelector('[data-flash]').addEventListener('click', () => { player.destroy(); openMode(`${base}&mode=cards`); });
  return handle;
}

export function exprRow(e, id) {
  const info = store.exprInfo(id);
  const dot = info.box >= 3 ? '✅' : info.box > 0 ? '🟡' : '';
  return `<div class="expr"><button class="play" data-say="${encodeURIComponent(e.en)}">🔊</button>
    <div class="grow"><div class="en">${e.en} <span class="xs">${dot}</span></div><div class="ko">${e.ko}</div>${e.note ? `<div class="note">💡 ${e.note}</div>` : ''}</div>
    <span class="badge ${e.level || 'IM'}">${e.level || 'IM'}</span></div>`;
}

export function bindPlay(scope) {
  scope.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', async () => {
    const text = decodeURIComponent(b.dataset.say);
    if (b.classList.contains('on')) { stopSpeaking(); b.classList.remove('on'); return; }
    scope.querySelectorAll('.play.on').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    await speak(text, { rate: b.dataset.slow ? 0.7 : undefined });
    b.classList.remove('on');
  }));
}

export function flashcards(body, cards, onExit) {
  let i = 0, showKo = false;
  const trail = [];   // 지나온 카드 순서 — '이전'은 바로 직전에 본 카드로만 간다
  const player = createSequencePlayer();   // 카드마다 반복 재생 + 화면 유지 (🔁 켜져 있으면 멈출 때까지 계속)
  const due = new Set(store.dueExprs());
  // 복습 대상 우선, 그 다음 미학습, 마지막 학습완료
  cards = cards.slice().sort((a, b) => rank(a) - rank(b));
  function rank(c) { const inf = store.exprInfo(c.id); if (due.has(c.id)) return 0; if (inf.box === 0) return 1; return 2 + inf.box; }

  const draw = () => {
    const c = cards[i];
    const info = store.exprInfo(c.id);
    body.innerHTML = html`
      <div class="flash">
        <span class="badge lvl ${c.level || 'IM'}">${c.level || 'IM'}</span>
        <span class="idx">${i + 1} / ${cards.length} · 상자 ${info.box}</span>
        <div class="en">${c.en}</div>
        <div class="ko ${showKo ? '' : 'hidden'}" data-ko>${c.ko}</div>
        ${c.note ? raw(`<div class="note ${showKo ? '' : 'hidden'}" data-ko>💡 ${c.note}</div>`) : ''}
        <div class="row mt8"><button class="play" data-say="${encodeURIComponent(c.en)}">🔊</button><button class="play" data-say="${encodeURIComponent(c.en)}" data-slow="1">🐢</button><button class="btn sm grow" data-reveal>${showKo ? '뜻 숨기기' : '뜻 보기'}</button></div>
      </div>
      <div class="row between wrap mt8"><button class="btn sm" data-toggle>⏸ 멈춤</button>
        <span class="row" style="gap:6px"><button class="chip ${repeatLoop() ? 'active' : ''}" data-loop title="멈출 때까지 계속 반복">${loopLabel()}</button><button class="chip" data-repeat>반복 ${repeatCount()}회</button><button class="chip" data-gap>${gapLabel()}</button></span></div>
      <div class="xs muted mt8">${repeatLoop() ? '멈추거나 카드를 넘길 때까지 계속 반복해요.' : `이 카드를 ${repeatCount()}번 읽고 멈춰요.`}</div>
      <p class="xs muted center mt12">듣고 → 소리 내어 따라 말한 뒤 → 뜻을 보지 않고 말할 수 있으면 "알아요"</p>
      <div class="btn-row mt12"><button class="btn" data-rate="0">🙈 아직 몰라요</button><button class="btn teal" data-rate="1">✅ 알아요</button></div>
      <div class="btn-row mt8"><button class="btn ghost" data-prev ${trail.length ? '' : 'disabled'}>‹ 이전</button><button class="btn ghost" data-exit>목록으로</button><button class="btn ghost" data-next>다음 ›</button></div>`;
    bindPlay(body);
    body.querySelector('[data-reveal]').addEventListener('click', () => { showKo = !showKo; body.querySelectorAll('[data-ko]').forEach(x => x.classList.toggle('hidden', !showKo)); body.querySelector('[data-reveal]').textContent = showKo ? '뜻 숨기기' : '뜻 보기'; });
    body.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { store.rateExpr(c.id, b.dataset.rate === '1'); next(); }));
    body.querySelector('[data-next]').addEventListener('click', next);
    body.querySelector('[data-prev]').addEventListener('click', () => { if (!trail.length) return; i = trail.pop(); showKo = false; draw(); });
    body.querySelector('[data-exit]').addEventListener('click', () => { player.stop(); stopSpeaking(); onExit(); });
    body.querySelector('[data-repeat]').addEventListener('click', () => { cycleRepeat(); draw(); });
    body.querySelector('[data-gap]').addEventListener('click', () => { cycleGap(); draw(); });

    const $toggle = body.querySelector('[data-toggle]');
    const setPlayUI = (on) => { $toggle.textContent = on ? '⏸ 멈춤' : '▶ 다시 듣기'; $toggle.classList.toggle('on', on); };
    const play = () => { setPlayUI(true); player.run([c.en], { loop: repeatLoop(), onEnd: () => setPlayUI(false), onInterrupt: (msg) => { setPlayUI(false); if (msg) toast(msg, 3000); } }); };
    $toggle.addEventListener('click', () => { if (player.playing) { player.stop(); setPlayUI(false); } else play(); });
    body.querySelector('[data-loop]').addEventListener('click', () => { toggleLoop(); draw(); });
    // 🔊 / 🐢 를 직접 누르면 자동 반복은 비켜 준다
    body.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => { player.stop(); setPlayUI(false); }, true));
    play();
  };
  const next = () => { trail.push(i); if (i + 1 >= cards.length) { toast('한 바퀴 완료! 🎉'); i = 0; } else i++; showKo = false; draw(); };
  draw();
  return { stop: () => player.stop(), destroy: () => player.stop() };
}

// ---------- 질문·모범답안 ----------
// 질문과 모범답안을 세트로: 레벨을 고르면 질문마다 그 레벨 답안을 바로 펼쳐 볼 수 있다
function renderQuestions(body, topic, level, query, setLevel = () => {}) {
  const qs = topic.questions || [];
  const levels = ['IM3', 'IH', 'AL'].filter(l => qs.some(q => q.answers?.[l]));
  if (!levels.includes(level)) level = levels[0];
  const href = (q) => `#/practice/${topic.id}/${q.id}${query.mode === 'speak' ? '?mode=speak' : `?level=${level}`}`;
  body.innerHTML = html`
    <div data-mock-link></div>
    <p class="small muted mb12">질문 ${qs.length}개 · 레벨을 고르고 <b>모범답안 보기</b>를 누르면 질문 바로 아래에 답안이 나와요. <b>🎙️ 연습</b>에서는 문장별로 듣고 섀도잉하거나 직접 녹음해 채점받을 수 있어요.</p>
    <div class="seg mb12" data-levels>${raw(levels.map(l => `<button data-lv="${l}" class="${l === level ? 'active' : ''}">${l} 모범답안</button>`).join(''))}</div>
    <div class="list qa-list">${raw(qs.map((q, i) => {
      const ans = q.answers?.[level] || '';
      const ko = q.answersKo?.[level];
      return `<div class="card qa">
        <div class="row between"><span class="xs muted">${iconFor(q.type)} Q${i + 1} · ${TYPE_LABEL[q.type] || q.type}</span><span class="xs muted">${practiceCount(q.id)}회 연습</span></div>
        <div class="q-en mt8">${q.en}</div>
        ${q.ko ? `<div class="small ink2 mt8">${q.ko}</div>` : ''}
        <details class="mt12" data-qa><summary class="btn sm">💡 ${level} 모범답안 보기</summary>
          <p class="answer mt12">${ans}</p>
          ${ko ? `<details class="mt8"><summary class="xs muted">한글 해석</summary><p class="small ink2 mt8">${ko.join(' ')}</p></details>` : ''}
        </details>
        <div class="btn-row mt12"><button class="btn sm" data-say="${encodeURIComponent(ans)}">🔊 답안 듣기</button><a class="btn sm primary" href="${href(q)}">🎙️ 연습 ›</a></div>
      </div>`;
    }).join(''))}</div>
    <div data-bank-link></div>
`;
  body.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lv)));
  body.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => {
    if (isSpeaking()) { stopSpeaking(); return; }
    speak(decodeURIComponent(b.dataset.say));
  }));
  // 이 주제 문항만으로 짠 모의고사(기출 다시 보기)가 있으면 맨 위에 바로 가기
  data.mockSets().then(ms => {
    const set = ms.sets.find(st => st.slots.some(sl => sl.topic === topic.id && sl.ids));
    const $m = body.querySelector('[data-mock-link]');
    if (set && $m) $m.innerHTML = `<a class="btn primary block mb12" href="#/mock/run/${set.id}">🎯 ${set.title} · 실전처럼 풀기</a>`;
  }).catch(() => {});
  // 같은 주제의 실전 답변(영상 속 IH–AL 답변)이 있으면 바로 가기
  data.bank().then(bank => {
    const gs = bank.groups.filter(g => (g.topics || []).includes(topic.id));
    const n = gs.reduce((a, g) => a + g.items.length, 0);
    const $l = body.querySelector('[data-bank-link]');
    if (!n || !$l) return;
    $l.innerHTML = gs.map(g => `<a class="btn ghost block mt12" href="#/bank?g=${g.id}">${g.emoji} 실전 답변 · ${g.title} ${g.items.length}문항 (${bank.levels.map(l => l.id).join(' · ')})</a>`).join('');
  }).catch(() => {});
}
function practiceCount(qid) { return store.state.practice.filter(p => p.qid === qid).length; }
export function iconFor(type) {
  return { describe: '🖼️', routine: '🔁', experience: '📖', comparison: '⚖️', opinion: '💬', 'roleplay-ask': '📞', 'roleplay-solve': '🛠️', 'roleplay-experience': '📖' }[type] || '❔';
}

// 단어/문장 발음 빠른 확인: 4초 녹음 → 인식 결과 비교
export async function quickCheck(btn, text, $out, { listenText = text } = {}) {
  const { Recognizer, support, sttDiagnosis } = await import('../speech.js');
  if (!support.stt) { $out.textContent = '이 브라우저는 음성 인식을 지원하지 않아요.'; return null; }
  btn.classList.add('on'); btn.textContent = '■'; $out.textContent = '듣는 중… 말하세요';
  const rec = new Recognizer({ onUpdate: t => { $out.textContent = t; } });
  rec.start();
  await new Promise(r => setTimeout(r, Math.min(8000, 2500 + listenText.split(' ').length * 500)));
  const { transcript, error } = rec.stop();
  btn.classList.remove('on'); btn.textContent = '🎙️';
  // 인식 자체가 안 된 경우에는 "일치 0%" 대신 원인을 알려 준다
  if (!transcript) { const d = sttDiagnosis(error); $out.innerHTML = `❌ ${d.title} <span class="muted">${d.steps[0]}</span>`; return null; }
  const cmp = compareToText(transcript, text);
  const ok = cmp.score >= 80;
  $out.innerHTML = `${ok ? '✅' : cmp.score >= 50 ? '🟡' : '❌'} 인식: "<b>${transcript || '(없음)'}</b>" · 일치 ${cmp.score}%${cmp.missing.length ? ` · 놓친 단어: ${cmp.missing.slice(0, 5).join(', ')}` : ''}`;
  store.logActivity(0.5);
  return cmp.score;   // 인식 실패 시 null — 말하기 퀴즈가 채점 불가로 처리한다
}

// ---------- 팁: 출제 경향 · 답변 전략 ----------
function renderTips(body, topic) {
  renderGuide(body, topic);
  return null;
}

function renderGuide(body, topic) {
  body.innerHTML = html`
    <div class="card"><div class="h3 mb8">출제 경향 & 전략</div><p class="small ink2">${topic.intro}</p>
    <ul class="small ink2" style="padding-left:18px;margin:10px 0 0">${raw((topic.strategy || []).map(s => `<li>${s}</li>`).join(''))}</ul></div>
    <div class="card soft mt12"><div class="h3 mb8">이 주제 학습 루틴 (20분)</div>
      <ol class="small ink2" style="padding-left:18px;margin:0">
        <li>① 표현 → 카드 모드로 15개 듣고 따라 말하기 (5분)</li>
        <li>② 패턴 → 이 주제용 패턴 문장을 퀴즈로 입에 붙이기 (5분)</li>
        <li>③ 답안 → 목표 레벨 모범답안 섀도잉 후 직접 녹음 · 채점 (10분)</li>
      </ol></div>
    ${raw(editLinkHtml(topic.file, '✏️ GitHub에서 이 주제 내용 수정', 'btn ghost block mt12'))}`;
}
