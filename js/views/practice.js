import { html, raw, splitSentences, toast, levelColor } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking, sttDiagnosis } from '../speech.js';
import { createSequencePlayer, repeatCount, gapLabel, cycleRepeat, cycleGap, repeatLoop, toggleLoop, loopLabel } from '../autoplay.js';
import { header } from '../app.js';
import { createRecorderUI, sttHelpHtml } from '../recorder-ui.js';
import { analyze } from '../scoring.js';
import { bindPlay, flashcards, quickCheck, patternSentenceMap } from './topic.js';
import { ring } from './home.js';

let recUI = null;
let shadowPlayer = null;   // 섀도잉 전체 듣기 플레이어 (탭 이동·화면 이탈 시 정리)

export async function render(root, route) {
  const [topicId, qid] = route.parts;
  const topic = await data.topic(topicId);
  const q = (topic.questions || []).find(x => x.id === qid);
  if (!q) { root.innerHTML = '<div class="empty">질문을 찾을 수 없습니다.</div>'; return; }
  const patterns = await data.patterns();
  const exprBank = [...(topic.expressions || []).map(e => e.en), ...patterns.groups.flatMap(g => g.items.map(i => i.en))];
  return renderQuestion(root, { title: topic.title, topic, q, exprBank, query: route.query, patternMap: (lv) => patternSentenceMap(topic, patterns, lv) });
}

// 질문 하나의 '모범답안 · 섀도잉' / '직접 답변 · 채점' 화면. 주제 질문과 실전 답변 모음(bank)이 같이 쓴다.
// extra: 질문 카드 아래에 붙일 HTML (영상 링크·이전/다음 문항 등)
// onLevel: 레벨을 바꿨을 때 알림 (실전 답변 모음은 고른 레벨을 다음 문항에도 쓴다)
export function renderQuestion(root, { title, topic, q, exprBank = [], query = {}, patternMap = () => ({}), extra = '', onLevel = () => {} }) {
  const mode = query.mode || 'model';
  let level = query.level || store.settings.target || 'IM3';

  root.innerHTML = html`
    ${raw(header(title))}
    <div class="qcard">
      <div class="row between mb8"><span class="badge type">${TYPE_LABEL[q.type] || q.type}</span><button class="play sm" data-say="${encodeURIComponent(q.en)}">🔊</button></div>
      <div class="q-en">${q.en}</div>
      <div class="q-ko">${q.ko}</div>
      <div class="mt12">${raw((q.tips || []).map(t => `<div class="tip">💡 ${t}</div>`).join(''))}</div>
    </div>
    ${raw(extra)}
    <div class="tabs mt12" id="ptabs"><button data-m="model" class="${mode === 'model' ? 'active' : ''}">모범답안 · 섀도잉</button><button data-m="speak" class="${mode === 'speak' ? 'active' : ''}">직접 답변 · 채점</button></div>
    <div id="pbody" class="mt12"></div>`;
  bindPlay(root);

  const body = root.querySelector('#pbody');
  // 레벨(IM3·IH·AL)은 몇 번이든 바꿀 수 있어야 한다 — 바꿀 때마다 같은 콜백으로 다시 그린다
  const showModel = () => {
    stopSpeaking(); shadowPlayer?.stop(); shadowPlayer = null;
    level = renderModel(body, q, level, (lv) => { if (lv !== level) { level = lv; onLevel(lv); showModel(); } }, patternMap);
  };
  const show = (m) => {
    root.querySelectorAll('#ptabs button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    stopSpeaking(); recUI?.destroy(); recUI = null; shadowPlayer?.stop(); shadowPlayer = null;
    if (m === 'model') { showModel(); store.logActivity(1); }
    else renderSpeak(body, topic, q, exprBank);
  };
  root.querySelectorAll('#ptabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.m)));
  show(mode);
  return () => { stopSpeaking(); recUI?.destroy(); recUI = null; shadowPlayer?.stop(); shadowPlayer = null; };
}

// ---------- 모범답안 섀도잉 ----------
// 선택된 레벨로 섀도잉 화면을 그리고, 실제로 사용한 레벨을 돌려준다
function renderModel(body, q, level, setLevel, patternMap = () => ({})) {
  const answers = q.answers || {};
  // 주제 질문은 IM3·IH·AL, 실전 답변 모음은 레벨 하나('IH–AL')
  const levels = [...['IM3', 'IH', 'AL'].filter(l => answers[l]), ...Object.keys(answers).filter(l => !['IM3', 'IH', 'AL'].includes(l))];
  if (!answers[level]) level = levels[0];
  const sents = splitSentences(answers[level]);
  const words = answers[level].split(/\s+/).length;
  // 문장별 한글 해석 (answersKo) — 영어 문장 수와 맞을 때만 쓴다
  const koArr = q.answersKo?.[level];
  const ko = Array.isArray(koArr) && koArr.length === sents.length ? koArr : null;
  let showKo = store.settings.showAnswerKo !== false;   // 해석 보이기 (기본 켬)
  let koFirst = !!store.settings.koFirst;               // 한→영: 한글만 보고 영어로 말하기
  // 이 레벨 답안에 들어간 만능 패턴 문장 → 강조 표시
  const pats = patternMap(level);
  const patCount = sents.filter(s => pats[s.trim()]).length;
  body.innerHTML = html`
    <div class="seg ${levels.length > 1 ? '' : 'hidden'}">${raw(levels.map(l => `<button data-lv="${l}" class="${l === level ? 'active' : ''}" style="${l === level ? `color:${levelColor(l)}` : ''}">${l}</button>`).join(''))}</div>
    <div class="card mt12">
      <div class="xs muted mb8">${words}단어 · ${sents.length}문장${patCount ? ` · 🧩 만능 패턴 ${patCount}문장` : ''} · 문장을 탭하면 재생</div>
      <div class="row mb12 wrap" style="gap:6px"><button class="btn sm" data-all>▶ 전체 듣기</button><button class="btn sm" data-slow>🐢 느리게</button><button class="btn sm ghost" data-hide>🙈 가리기</button>${ko ? raw(`<button class="btn sm ghost" data-ko-toggle>${showKo ? '🇰🇷 해석 숨기기' : '🇰🇷 해석 보기'}</button>`) : ''}</div>
      <div class="row between wrap mb12"><span class="xs muted" data-loop-hint>${repeatLoop() ? '전체 듣기는 멈출 때까지 계속 반복돼요' : '전체 듣기는 한 바퀴만 읽고 멈춰요'}</span>
        <span class="row" style="gap:6px"><button class="chip ${repeatLoop() ? 'active' : ''}" data-loop title="멈출 때까지 계속 반복">${loopLabel()}</button><button class="chip" data-repeat>반복 ${repeatCount()}회</button><button class="chip" data-gap>${gapLabel()}</button></span></div>
      <div class="answer ${ko ? 'with-ko' : ''} ${showKo ? '' : 'ko-off'}" data-answer>${raw(sents.map((s, i) => ko
        ? `<div class="ans-pair"><span class="sent ${pats[s.trim()] ? 'pat' : ''}" data-i="${i}">${s}</span><div class="sent-ko">${ko[i]}</div>${pats[s.trim()] ? `<div class="sent-pat">🧩 ${pats[s.trim()]}</div>` : ''}</div>`
        : `<span class="sent ${pats[s.trim()] ? 'pat' : ''}" data-i="${i}">${s}</span> `).join(''))}</div>
    </div>
    <div class="card soft mt12">
      <div class="h3 mb8">섀도잉 체크</div>
      <p class="small ink2">한 문장씩: 🔊 듣고 → 🎙️ 눌러 따라 말하면 인식률을 알려줍니다. 80% 이상이면 다음 문장으로.</p>
      ${ko ? raw(`<div class="row between mt12"><span class="xs muted" data-kofirst-hint>${koFirst ? '한글만 보고 영어로 말해 보세요' : '영어 문장을 보고 따라 말해요'}</span><button class="chip ${koFirst ? 'active' : ''}" data-kofirst>🇰🇷→🇺🇸 한글 보고 말하기</button></div>`) : ''}
      <div class="row mt12"><button class="btn grow" data-prev>‹</button><div class="grow center small" data-cur>1 / ${sents.length}</div><button class="btn grow" data-next>›</button></div>
      <div class="card mt12" style="padding:14px"><div class="ko-cue ${ko ? '' : 'hidden'}" data-cur-ko>${ko ? ko[0] : ''}</div><div class="en" data-cur-text style="font-weight:700;font-size:16px;line-height:1.5">${sents[0]}</div>${ko ? raw('<button class="btn sm ghost mt8 hidden" data-reveal-en>👀 영어 보기</button>') : ''}<div class="xs mt8" data-result></div></div>
      <div class="btn-row mt12"><button class="btn" data-say-cur>🔊 듣기</button><button class="btn primary" data-check-cur>🎙️ 따라 말하기</button></div>
    </div>
    <p class="xs muted center mt12">모범답안은 예시일 뿐입니다. 자신의 실제 정보로 바꿔 말하는 연습을 하세요.</p>`;

  body.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lv)));
  const $sents = body.querySelectorAll('.sent');
  let cur = 0;
  // 한→영 모드에서는 영어 문장을 가리고 한글 해석만 보여 준다 (말하고 나거나 '영어 보기'를 누르면 공개)
  const applyCue = (revealed = false) => {
    if (!ko) return;
    body.querySelector('[data-cur-ko]').textContent = ko[cur];
    body.querySelector('[data-cur-text]').classList.toggle('hidden', koFirst && !revealed);
    body.querySelector('[data-reveal-en]').classList.toggle('hidden', !koFirst || revealed);
  };
  const setCur = (i) => { cur = Math.max(0, Math.min(sents.length - 1, i)); body.querySelector('[data-cur]').textContent = `${cur + 1} / ${sents.length}`; body.querySelector('[data-cur-text]').textContent = sents[cur]; body.querySelector('[data-result]').textContent = ''; $sents.forEach((s, k) => s.classList.toggle('on', k === cur)); applyCue(); };
  applyCue();
  body.querySelector('[data-reveal-en]')?.addEventListener('click', () => applyCue(true));
  body.querySelector('[data-kofirst]')?.addEventListener('click', (e) => {
    koFirst = !koFirst; store.setSetting('koFirst', koFirst);
    e.currentTarget.classList.toggle('active', koFirst);
    body.querySelector('[data-kofirst-hint]').textContent = koFirst ? '한글만 보고 영어로 말해 보세요' : '영어 문장을 보고 따라 말해요';
    applyCue();
  });
  body.querySelector('[data-ko-toggle]')?.addEventListener('click', (e) => {
    showKo = !showKo; store.setSetting('showAnswerKo', showKo);
    body.querySelector('[data-answer]').classList.toggle('ko-off', !showKo);
    e.currentTarget.textContent = showKo ? '🇰🇷 해석 숨기기' : '🇰🇷 해석 보기';
  });
  $sents.forEach(s => s.addEventListener('click', async () => { setCur(Number(s.dataset.i)); await speak(sents[cur]); }));
  body.querySelector('[data-prev]').addEventListener('click', () => setCur(cur - 1));
  body.querySelector('[data-next]').addEventListener('click', () => setCur(cur + 1));
  body.querySelector('[data-say-cur]').addEventListener('click', () => speak(sents[cur]));
  body.querySelector('[data-check-cur]').addEventListener('click', async (e) => { await quickCheck(e.currentTarget, sents[cur], body.querySelector('[data-result]')); applyCue(true); });
  body.querySelector('[data-hide]').addEventListener('click', (e) => { const a = body.querySelector('[data-answer]'); const hidden = a.style.filter; a.style.filter = hidden ? '' : 'blur(6px)'; e.currentTarget.textContent = hidden ? '🙈 가리기' : '👀 보기'; });
  // 전체 듣기: 문장마다 설정한 횟수만큼 반복하고, 🔁 이 켜져 있으면 끝나도 처음부터 다시 — 멈출 때까지 계속.
  // 재생 중에는 화면을 켜 둔다
  const player = createSequencePlayer();
  const $all = body.querySelector('[data-all]');
  const $slow = body.querySelector('[data-slow]');
  const setPlayingUI = (on, which) => {
    $all.textContent = on && which === 'all' ? '⏸ 멈춤' : '▶ 전체 듣기';
    $slow.textContent = on && which === 'slow' ? '⏸ 멈춤' : '🐢 느리게';
    $all.classList.toggle('on', on && which === 'all');
    $slow.classList.toggle('on', on && which === 'slow');
  };
  const playAll = (rate, which) => {
    if (player.playing) { player.stop(); setPlayingUI(false); return; }
    setPlayingUI(true, which);
    player.run(sents, { rate, loop: repeatLoop(), onItem: (i) => setCur(i), onEnd: () => setPlayingUI(false), onInterrupt: (msg) => { setPlayingUI(false); if (msg) toast(msg, 3000); } });
  };
  $all.addEventListener('click', () => playAll(undefined, 'all'));
  $slow.addEventListener('click', () => playAll(0.72, 'slow'));
  const $loop = body.querySelector('[data-loop]');
  $loop.addEventListener('click', () => {
    toggleLoop();
    $loop.textContent = loopLabel();
    $loop.classList.toggle('active', repeatLoop());
    body.querySelector('[data-loop-hint]').textContent = repeatLoop()
      ? '전체 듣기는 멈출 때까지 계속 반복돼요' : '전체 듣기는 한 바퀴만 읽고 멈춰요';
    // 재생 중이면 바뀐 설정으로 이어서 재생한다
    if (player.playing) { const slow = $slow.classList.contains('on'); player.stop(); playAll(slow ? 0.72 : undefined, slow ? 'slow' : 'all'); }
  });
  body.querySelector('[data-repeat]').addEventListener('click', (e) => { cycleRepeat(); e.currentTarget.textContent = `반복 ${repeatCount()}회`; });
  body.querySelector('[data-gap]').addEventListener('click', (e) => { cycleGap(); e.currentTarget.textContent = gapLabel(); });
  shadowPlayer = player;
  return level;
}

// ---------- 직접 답변 채점 ----------
function renderSpeak(body, topic, q, exprBank) {
  body.innerHTML = html`
    <div class="card"><div id="rec"></div></div>
    <div id="result" class="mt12"></div>
    <div class="card soft mt12 small ink2">💡 <b>답변 뼈대</b>: ${raw(skeleton(q.type))}</div>`;
  const maxSeconds = /roleplay-ask/.test(q.type) ? 60 : 120;
  const $result = body.querySelector('#result');

  // 전사(말한 것 또는 직접 입력한 것)를 채점하고 기록한다
  const score = (transcript, res, manual = false) => {
    const sttNote = manual
      ? '영어 단어를 찾지 못했어요. 답변을 영어로 입력해 주세요.'
      : sttDiagnosis(res.sttError).title;
    const result = analyze(transcript, res.seconds, { type: q.type, expressions: exprBank, segments: res.segments, sttNote });
    // 채점이 성립한 답변만 기록에 남긴다 (0점 기록이 추이 그래프를 망가뜨리지 않게)
    if (!result.failed) store.addPractice({ qid: q.id, topicId: topic.id, type: q.type, score: result.score, level: result.level, words: result.metrics.words, seconds: result.metrics.seconds, transcript });
    $result.innerHTML = resultCard(result, q);
    $result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  recUI = createRecorderUI(body.querySelector('#rec'), {
    maxSeconds,
    onStart: () => { $result.innerHTML = ''; },   // 다시 녹음하면 지난 결과·안내를 지운다
    onDone: (res) => {
      // 인식 실패는 "0점 NL/NM" 이 아니다 — 기록에 남기지 않고 원인과 대안을 보여 준다
      if (!res.transcript.trim()) { showSttFailure($result, res, (text) => score(text, res, true)); return; }
      score(res.transcript, res);
    },
  });
}

// 인식 실패 화면: 원인 · 해결 단계 · 직접 입력 채점
function showSttFailure($result, res, onManual) {
  const micConflict = res.recorded && res.sttError === 'no-speech';
  $result.innerHTML = `
    <div class="card">
      <div class="h3 mb8">채점하지 못했어요</div>
      ${sttHelpHtml(res.sttError)}
      ${micConflict ? '<div class="fb warn mt8"><span class="k">⚠️</span><span>녹음 파일은 만들어졌는데 인식만 실패했어요. 안드로이드에서는 녹음이 마이크를 잡고 있으면 인식이 막히기도 합니다. <a href="#/settings">설정</a>에서 <b>답변 오디오 녹음</b>을 끄고 다시 시도해 보세요.</span></div>' : ''}
      <div class="divider"></div>
      <div class="small ink2 mb8">말한 내용을 기억한다면 <b>직접 입력해서 채점</b>받을 수 있어요. (말한 시간 ${Math.round(res.seconds)}초 기준으로 속도도 계산합니다)</div>
      <textarea class="textarea" data-manual placeholder="I live in a small apartment in Seoul. It has two rooms..."></textarea>
      <button class="btn primary block mt8" data-score>입력한 답변으로 채점</button>
    </div>`;
  const $ta = $result.querySelector('[data-manual]');
  $result.querySelector('[data-score]').addEventListener('click', () => {
    const text = $ta.value.trim();
    if (!text) { toast('답변을 입력하세요'); return; }
    onManual(text);
  });
  $result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function skeleton(type) {
  return {
    describe: '전체 소개 → 위치별 세부 2~3개 → 제일 좋아하는 부분 + 이유 → 느낌 한 줄',
    routine: '빈도(usually, twice a week) → 순서(First / Then / After that) → 이유 → 마무리',
    experience: '언제·어디서(ago, last year) → 무슨 일(과거시제) → 내가 한 행동 → 결과 → 느낌/교훈',
    comparison: '과거(used to) → 현재(nowadays) → 가장 큰 차이 → 내 선호 + 이유',
    opinion: '내 입장 → 이유 1 + 예시 → 이유 2 → 결론(That\'s why...)',
    'roleplay-ask': '인사 + 목적(I\'m calling to ask about...) → 질문 3~4개 → 감사 인사',
    'roleplay-solve': '사과/상황 설명(I\'m afraid...) → 대안 2~3개(How about... / Would it be possible...) → 마무리',
    'roleplay-experience': '비슷한 경험 소개 → 언제·무슨 일 → 어떻게 해결 → 결과·느낌',
  }[type] || '핵심 답 → 이유 → 예시 → 느낌';
}

export function resultCard(r, q) {
  const parts = [['발화량', r.parts.volume, 30], ['구성·연결', r.parts.structure, 25], ['문법·시제', r.parts.grammar, 15], ['어휘', r.parts.vocab, 15], ['유창성', r.parts.fluency, 15]];
  // 인식 실패는 등급·막대를 그리지 않는다 (0점인데 항목만 차 있는 모순 방지)
  if (r.failed) return `<div class="card">
    <div class="score-hero"><div class="lvl" style="color:var(--muted)">—</div><div class="num">인식된 답변이 없어 채점하지 못했어요</div></div>
    ${r.feedback.map(f => `<div class="fb ${f.kind}"><span class="k">${{ good: '✅', bad: '❌', warn: '⚠️', tip: '💡' }[f.kind]}</span><span>${f.text}</span></div>`).join('')}
  </div>`;
  return `<div class="card">
    <div class="score-hero"><div class="lvl" style="color:${levelColor(r.level)}">${r.level}</div><div class="num">추정 OPIc 등급 · ${r.score}점</div></div>
    <div class="metrics"><div class="metric"><b>${r.metrics.words}</b><span>단어</span></div><div class="metric"><b>${r.metrics.wpm}</b><span>분당 단어</span></div><div class="metric"><b>${r.metrics.connectors}</b><span>연결어</span></div></div>
    <div class="parts mt12">${parts.map(([n, v, m]) => `<div class="p"><span class="muted">${n}</span><div class="bar"><i style="width:${v / m * 100}%"></i></div><b>${v}/${m}</b></div>`).join('')}</div>
    <div class="divider"></div>
    ${r.feedback.map(f => `<div class="fb ${f.kind}"><span class="k">${{ good: '✅', bad: '❌', warn: '⚠️', tip: '💡' }[f.kind]}</span><span>${f.text}</span></div>`).join('')}
    ${q ? `<button class="btn ghost block mt12" onclick="document.querySelector('#ptabs [data-m=model]')?.click()">모범답안과 비교하기</button>` : ''}
  </div>`;
}

// ---------- 복습 (간격 반복) ----------
export async function renderReview(root) {
  const all = await data.allExpressions();
  const due = new Set(store.dueExprs());
  let cards = all.filter(e => due.has(e.id));
  const bookmarked = all.filter(e => store.isBookmarked(e.id));
  root.innerHTML = html`${raw(header('복습'))}<div id="rbody"></div>`;
  const body = root.querySelector('#rbody');
  if (!cards.length) {
    // 복습 대상이 없으면 학습 중인 표현(상자 1~4) 또는 랜덤 20개
    const learning = all.filter(e => { const b = store.exprInfo(e.id).box; return b > 0 && b < 5; });
    cards = (learning.length ? learning : all).slice(0, 20);
    body.innerHTML = html`<div class="card soft mb12"><div class="h3">오늘 복습할 표현이 없어요 🎉</div><p class="small ink2 mt8">${learning.length ? `학습 중인 표현 ${learning.length}개 중 20개를 다시 봅니다.` : '아직 학습한 표현이 없어 랜덤 20개를 보여드려요.'}</p></div><div id="cards"></div>`;
    flashcards(body.querySelector('#cards'), cards, () => { location.hash = '#/home'; });
  } else {
    body.innerHTML = html`<p class="small muted mb12">복습 ${cards.length}개 · 잊기 직전의 표현을 다시 봅니다${bookmarked.length ? ` · 북마크 ${bookmarked.length}개` : ''}</p><div id="cards"></div>`;
    flashcards(body.querySelector('#cards'), cards, () => { location.hash = '#/home'; });
  }
  return () => stopSpeaking();
}
