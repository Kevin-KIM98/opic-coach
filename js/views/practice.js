import { html, raw, splitSentences, toast, levelColor } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking } from '../speech.js';
import { header } from '../app.js';
import { createRecorderUI } from '../recorder-ui.js';
import { analyze, compareToText } from '../scoring.js';
import { bindPlay, flashcards, quickCheck } from './topic.js';
import { ring } from './home.js';

let recUI = null;

export async function render(root, route) {
  const [topicId, qid] = route.parts;
  const topic = await data.topic(topicId);
  const q = (topic.questions || []).find(x => x.id === qid);
  const ra = (topic.readAloud || []).find(x => x.id === qid);
  if (!q && !ra) { root.innerHTML = '<div class="empty">질문을 찾을 수 없습니다.</div>'; return; }
  if (ra) return renderReadAloud(root, topic, ra);

  const mode = route.query.mode || 'model';
  let level = route.query.level || store.settings.target || 'IM3';
  const patterns = await data.patterns();
  const exprBank = [...(topic.expressions || []).map(e => e.en), ...patterns.groups.flatMap(g => g.items.map(i => i.en))];

  root.innerHTML = html`
    ${raw(header(topic.title))}
    <div class="qcard">
      <div class="row between mb8"><span class="badge type">${TYPE_LABEL[q.type] || q.type}</span><button class="play sm" data-say="${encodeURIComponent(q.en)}">🔊</button></div>
      <div class="q-en">${q.en}</div>
      <div class="q-ko">${q.ko}</div>
      <div class="mt12">${raw((q.tips || []).map(t => `<div class="tip">💡 ${t}</div>`).join(''))}</div>
    </div>
    <div class="tabs mt12" id="ptabs"><button data-m="model" class="${mode === 'model' ? 'active' : ''}">모범답안 · 섀도잉</button><button data-m="speak" class="${mode === 'speak' ? 'active' : ''}">직접 답변 · 채점</button></div>
    <div id="pbody" class="mt12"></div>`;
  bindPlay(root);

  const body = root.querySelector('#pbody');
  const show = (m) => {
    root.querySelectorAll('#ptabs button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    stopSpeaking(); recUI?.destroy(); recUI = null;
    if (m === 'model') renderModel(body, q, level, (lv) => { level = lv; renderModel(body, q, level, arguments[2]); });
    else renderSpeak(body, topic, q, exprBank);
  };
  root.querySelectorAll('#ptabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.m)));
  show(mode);
  return () => { stopSpeaking(); recUI?.destroy(); recUI = null; };
}

// ---------- 모범답안 섀도잉 ----------
function renderModel(body, q, level, setLevel) {
  const answers = q.answers || {};
  const levels = ['IM3', 'IH', 'AL'].filter(l => answers[l]);
  if (!answers[level]) level = levels[0];
  const sents = splitSentences(answers[level]);
  const words = answers[level].split(/\s+/).length;
  body.innerHTML = html`
    <div class="seg">${raw(levels.map(l => `<button data-lv="${l}" class="${l === level ? 'active' : ''}" style="${l === level ? `color:${levelColor(l)}` : ''}">${l}</button>`).join(''))}</div>
    <div class="card mt12">
      <div class="xs muted mb8">${words}단어 · ${sents.length}문장 · 문장을 탭하면 재생</div>
      <div class="row mb12" style="gap:6px"><button class="btn sm" data-all>▶ 전체 듣기</button><button class="btn sm" data-slow>🐢 느리게</button><button class="btn sm ghost" data-hide>🙈 가리기</button></div>
      <div class="answer" data-answer>${raw(sents.map((s, i) => `<span class="sent" data-i="${i}">${s}</span> `).join(''))}</div>
    </div>
    <div class="card soft mt12">
      <div class="h3 mb8">섀도잉 체크</div>
      <p class="small ink2">한 문장씩: 🔊 듣고 → 🎙️ 눌러 따라 말하면 인식률을 알려줍니다. 80% 이상이면 다음 문장으로.</p>
      <div class="row mt12"><button class="btn grow" data-prev>‹</button><div class="grow center small" data-cur>1 / ${sents.length}</div><button class="btn grow" data-next>›</button></div>
      <div class="card mt12" style="padding:14px"><div class="en" data-cur-text style="font-weight:700;font-size:16px;line-height:1.5">${sents[0]}</div><div class="xs mt8" data-result></div></div>
      <div class="btn-row mt12"><button class="btn" data-say-cur>🔊 듣기</button><button class="btn primary" data-check-cur>🎙️ 따라 말하기</button></div>
    </div>
    <p class="xs muted center mt12">모범답안은 예시일 뿐입니다. 자신의 실제 정보로 바꿔 말하는 연습을 하세요.</p>`;

  body.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lv, setLevel)));
  const $sents = body.querySelectorAll('.sent');
  let cur = 0;
  const setCur = (i) => { cur = (i + sents.length) % sents.length; body.querySelector('[data-cur]').textContent = `${cur + 1} / ${sents.length}`; body.querySelector('[data-cur-text]').textContent = sents[cur]; body.querySelector('[data-result]').textContent = ''; $sents.forEach((s, k) => s.classList.toggle('on', k === cur)); };
  $sents.forEach(s => s.addEventListener('click', async () => { setCur(Number(s.dataset.i)); await speak(sents[cur]); }));
  body.querySelector('[data-prev]').addEventListener('click', () => setCur(cur - 1));
  body.querySelector('[data-next]').addEventListener('click', () => setCur(cur + 1));
  body.querySelector('[data-say-cur]').addEventListener('click', () => speak(sents[cur]));
  body.querySelector('[data-check-cur]').addEventListener('click', (e) => quickCheck(e.currentTarget, sents[cur], body.querySelector('[data-result]')));
  body.querySelector('[data-hide]').addEventListener('click', (e) => { const a = body.querySelector('[data-answer]'); const hidden = a.style.filter; a.style.filter = hidden ? '' : 'blur(6px)'; e.currentTarget.textContent = hidden ? '🙈 가리기' : '👀 보기'; });
  const playAll = async (rate) => {
    for (let i = 0; i < sents.length; i++) { setCur(i); const ok = await speak(sents[i], { rate }); if (!ok) break; }
  };
  body.querySelector('[data-all]').addEventListener('click', () => playAll());
  body.querySelector('[data-slow]').addEventListener('click', () => playAll(0.72));
  store.logActivity(1);
}

// ---------- 직접 답변 채점 ----------
function renderSpeak(body, topic, q, exprBank) {
  body.innerHTML = html`
    <div class="card"><div id="rec"></div></div>
    <div id="result" class="mt12"></div>
    <div class="card soft mt12 small ink2">💡 <b>답변 뼈대</b>: ${raw(skeleton(q.type))}</div>`;
  const maxSeconds = /tos-qa/.test(q.type) ? 60 : /roleplay-ask/.test(q.type) ? 60 : 120;
  recUI = createRecorderUI(body.querySelector('#rec'), {
    maxSeconds,
    onDone: (res) => {
      const result = analyze(res.transcript, res.seconds, { type: q.type, expressions: exprBank, segments: res.segments });
      store.addPractice({ qid: q.id, topicId: topic.id, type: q.type, score: result.score, level: result.level, words: result.metrics.words, seconds: result.metrics.seconds, transcript: res.transcript });
      body.querySelector('#result').innerHTML = resultCard(result, q);
      body.querySelector('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
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
    'tos-qa': 'Q5·Q6는 2문장(답 + 이유/디테일), Q7은 입장 + 이유 2개 + 예시',
    'tos-opinion': 'I agree/disagree that... → First, ... (예시) → Second, ... (예시) → For these reasons, ...',
  }[type] || '핵심 답 → 이유 → 예시 → 느낌';
}

export function resultCard(r, q) {
  const parts = [['발화량', r.parts.volume, 30], ['구성·연결', r.parts.structure, 25], ['문법·시제', r.parts.grammar, 15], ['어휘', r.parts.vocab, 15], ['유창성', r.parts.fluency, 15]];
  return `<div class="card">
    <div class="score-hero"><div class="lvl" style="color:${levelColor(r.level)}">${r.level}</div><div class="num">추정 OPIc 등급 · 토익스피킹 레벨 ${r.tos} · ${r.score}점</div></div>
    <div class="metrics"><div class="metric"><b>${r.metrics.words}</b><span>단어</span></div><div class="metric"><b>${r.metrics.wpm}</b><span>분당 단어</span></div><div class="metric"><b>${r.metrics.connectors}</b><span>연결어</span></div></div>
    <div class="parts mt12">${parts.map(([n, v, m]) => `<div class="p"><span class="muted">${n}</span><div class="bar"><i style="width:${v / m * 100}%"></i></div><b>${v}/${m}</b></div>`).join('')}</div>
    <div class="divider"></div>
    ${r.feedback.map(f => `<div class="fb ${f.kind}"><span class="k">${{ good: '✅', bad: '❌', warn: '⚠️', tip: '💡' }[f.kind]}</span><span>${f.text}</span></div>`).join('')}
    ${q ? `<button class="btn ghost block mt12" onclick="document.querySelector('#ptabs [data-m=model]')?.click()">모범답안과 비교하기</button>` : ''}
  </div>`;
}

// ---------- 토익스피킹 파트1 읽기 ----------
function renderReadAloud(root, topic, ra) {
  root.innerHTML = html`
    ${raw(header('파트 1 · 읽기'))}
    <div class="qcard"><div class="row between mb8"><span class="badge type">Read Aloud · 준비 45초 · 답변 45초</span><button class="play sm" data-say="${encodeURIComponent(ra.text)}">🔊</button></div>
      <div class="answer" style="font-size:17px">${ra.text}</div>
      <div class="mt12">${raw((ra.tips || []).map(t => `<div class="tip">💡 ${t}</div>`).join(''))}</div></div>
    <div class="card mt12"><div id="rec"></div></div>
    <div id="result" class="mt12"></div>`;
  bindPlay(root);
  recUI = createRecorderUI(root.querySelector('#rec'), {
    maxSeconds: 45,
    onDone: (res) => {
      const cmp = compareToText(res.transcript, ra.text);
      const wpm = Math.round(cmp.words.length / Math.max(res.seconds, 5) * 60);
      const marked = cmp.words.map((w, i) => `<span style="${cmp.matched[i] ? '' : 'color:var(--bad);text-decoration:underline'}">${w}</span>`).join(' ');
      root.querySelector('#result').innerHTML = `<div class="card"><div class="score-hero"><div class="lvl" style="color:${cmp.score >= 90 ? 'var(--good)' : cmp.score >= 75 ? 'var(--gold)' : 'var(--bad)'}">${cmp.score}%</div><div class="num">단어 일치율 · ${res.seconds.toFixed(0)}초 · ${wpm} wpm (목표 130~150)</div></div>
        <p class="small answer">${marked}</p>
        <div class="fb ${cmp.score >= 85 ? 'good' : 'warn'} mt12"><span class="k">${cmp.score >= 85 ? '✅' : '⚠️'}</span><span>${cmp.score >= 85 ? '발음이 명확하게 인식됐어요. 이제 억양과 끊어 읽기에 집중하세요.' : `빨간 단어가 인식되지 않았어요. 🔊로 다시 듣고 그 단어만 3번씩 반복하세요.`}</span></div></div>`;
      store.addPractice({ qid: ra.id, topicId: topic.id, type: 'read-aloud', score: cmp.score, level: '-', words: cmp.words.length, seconds: Math.round(res.seconds), transcript: res.transcript });
    },
  });
  return () => { stopSpeaking(); recUI?.destroy(); recUI = null; };
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
