import { html, raw, splitSentences, toast, sheet } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking, isSpeaking } from '../speech.js';
import { editLinkHtml } from '../config.js';
import { header } from '../app.js';
import { createRecorderUI } from '../recorder-ui.js';
import { createAutoPlay, createSequencePlayer, repeatCount, gapLabel, cycleRepeat, cycleGap, repeatLoop, toggleLoop, loopLabel } from '../autoplay.js';
import { compareToText } from '../scoring.js';

export async function render(root, route) {
  const id = route.parts[0];
  const topic = await data.topic(id);
  const tab = route.query.tab || 'expr';
  const level = route.query.level || store.settings.target || 'IM3';

  root.innerHTML = html`
    ${raw(header(`${topic.emoji} ${topic.title}`, { right: editLinkHtml(topic.file, '✏️', 'icon-btn') }))}
    <div class="tabs" id="tabs">
      <button data-tab="expr" class="${tab === 'expr' ? 'active' : ''}">표현 ${topic.expressions?.length || 0}</button>
      <button data-tab="q" class="${tab === 'q' ? 'active' : ''}">질문·답안 ${topic.questions?.length || 0}</button>
      <button data-tab="pron" class="${tab === 'pron' ? 'active' : ''}">발음</button>
      <button data-tab="guide" class="${tab === 'guide' ? 'active' : ''}">전략</button>
    </div>
    <div id="tabbody" class="mt12"></div>`;

  const body = root.querySelector('#tabbody');
  let player = null;
  const renderTab = (t) => {
    root.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    player?.destroy(); player = null;
    stopSpeaking();
    if (t === 'expr') player = renderExpr(body, topic);
    else if (t === 'q') renderQuestions(body, topic, level, route.query);
    else if (t === 'pron') player = renderPron(body, topic);
    else renderGuide(body, topic);
  };
  root.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => renderTab(b.dataset.tab)));
  renderTab(tab);
  return () => { player?.destroy(); stopSpeaking(); };
}

// ---------- 표현: 리스트 + 플래시카드 ----------
function renderExpr(body, topic) {
  const exprs = topic.expressions || [];
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
  body.querySelector('[data-flash]').addEventListener('click', () => {
    player.destroy();
    // 카드 모드 플레이어로 교체해 탭 이동·화면 이탈 시 함께 멈추도록 한다
    const fc = flashcards(body, exprs.map((e, i) => ({ ...e, id: `${topic.id}#e${i}` })), () => renderExpr(body, topic));
    handle.stop = fc.stop; handle.destroy = fc.destroy;
  });
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
      <div class="btn-row mt8"><button class="btn ghost" data-prev>‹ 이전</button><button class="btn ghost" data-exit>목록으로</button><button class="btn ghost" data-next>다음 ›</button></div>`;
    bindPlay(body);
    body.querySelector('[data-reveal]').addEventListener('click', () => { showKo = !showKo; body.querySelectorAll('[data-ko]').forEach(x => x.classList.toggle('hidden', !showKo)); body.querySelector('[data-reveal]').textContent = showKo ? '뜻 숨기기' : '뜻 보기'; });
    body.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { store.rateExpr(c.id, b.dataset.rate === '1'); next(); }));
    body.querySelector('[data-next]').addEventListener('click', next);
    body.querySelector('[data-prev]').addEventListener('click', () => { i = (i - 1 + cards.length) % cards.length; showKo = false; draw(); });
    body.querySelector('[data-exit]').addEventListener('click', () => { player.stop(); stopSpeaking(); onExit(); });
    body.querySelector('[data-repeat]').addEventListener('click', () => { cycleRepeat(); draw(); });
    body.querySelector('[data-gap]').addEventListener('click', () => { cycleGap(); draw(); });

    const $toggle = body.querySelector('[data-toggle]');
    const setPlayUI = (on) => { $toggle.textContent = on ? '⏸ 멈춤' : '▶ 다시 듣기'; $toggle.classList.toggle('on', on); };
    const play = () => { setPlayUI(true); player.run([c.en], { loop: repeatLoop(), onEnd: () => setPlayUI(false) }); };
    $toggle.addEventListener('click', () => { if (player.playing) { player.stop(); setPlayUI(false); } else play(); });
    body.querySelector('[data-loop]').addEventListener('click', () => { toggleLoop(); draw(); });
    // 🔊 / 🐢 를 직접 누르면 자동 반복은 비켜 준다
    body.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => { player.stop(); setPlayUI(false); }, true));
    play();
  };
  const next = () => { if (i + 1 >= cards.length) { toast('한 바퀴 완료! 🎉'); i = 0; } else i++; showKo = false; draw(); };
  draw();
  return { stop: () => player.stop(), destroy: () => player.stop() };
}

// ---------- 질문·모범답안 ----------
function renderQuestions(body, topic, level, query) {
  const qs = topic.questions || [];
  body.innerHTML = html`
    <p class="small muted mb12">질문을 탭하면 IM3 / IH / AL 모범답안을 문장별로 듣고 섀도잉하거나, 직접 녹음해 채점받을 수 있어요.</p>
    <div class="list">${raw(qs.map(q => `<a class="list-row" href="#/practice/${topic.id}/${q.id}${query.mode === 'speak' ? '?mode=speak' : `?level=${level}`}"><div class="emoji">${iconFor(q.type)}</div><div class="grow"><div class="t">${q.en}</div><div class="s">${TYPE_LABEL[q.type] || q.type} · ${practiceCount(q.id)}회 연습</div></div><span class="chev">›</span></a>`).join(''))}</div>
`;
}
function practiceCount(qid) { return store.state.practice.filter(p => p.qid === qid).length; }
export function iconFor(type) {
  return { describe: '🖼️', routine: '🔁', experience: '📖', comparison: '⚖️', opinion: '💬', 'roleplay-ask': '📞', 'roleplay-solve': '🛠️', 'roleplay-experience': '📖' }[type] || '❔';
}

// ---------- 발음 ----------
function renderPron(body, topic) {
  const items = topic.pronunciation || [];
  body.innerHTML = html`
    <p class="small muted mb12">이 주제에서 한국인이 자주 틀리는 단어. 🔊 듣고 🎙️ 녹음하면 인식 결과로 발음을 확인합니다.</p>
    <div data-autoplay></div>
    <div class="list mt12" data-list>${raw(items.map((p, i) => `<div class="expr" data-pron="${i}"><button class="play" data-say="${encodeURIComponent(p.word)}">🔊</button><div class="grow"><div class="en">${p.word} <span class="small muted" style="font-weight:500">${p.ipa || ''}</span></div><div class="ko">${p.tip || ''}</div><div class="xs mt8" data-result></div></div><button class="play" data-check="${i}">🎙️</button></div>`).join(''))}</div>`;
  bindPlay(body);
  body.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => quickCheck(b, items[Number(b.dataset.check)].word, body.querySelector(`[data-pron="${b.dataset.check}"] [data-result]`))));
  return items.length ? createAutoPlay(body.querySelector('[data-autoplay]'), body.querySelector('[data-list]')) : null;
}

// 단어/문장 발음 빠른 확인: 4초 녹음 → 인식 결과 비교
export async function quickCheck(btn, text, $out) {
  const { Recognizer, support, sttDiagnosis } = await import('../speech.js');
  if (!support.stt) { $out.textContent = '이 브라우저는 음성 인식을 지원하지 않아요.'; return; }
  btn.classList.add('on'); btn.textContent = '■'; $out.textContent = '듣는 중… 말하세요';
  const rec = new Recognizer({ onUpdate: t => { $out.textContent = t; } });
  rec.start();
  await new Promise(r => setTimeout(r, Math.min(8000, 2500 + text.split(' ').length * 500)));
  const { transcript, error } = rec.stop();
  btn.classList.remove('on'); btn.textContent = '🎙️';
  // 인식 자체가 안 된 경우에는 "일치 0%" 대신 원인을 알려 준다
  if (!transcript) { const d = sttDiagnosis(error); $out.innerHTML = `❌ ${d.title} <span class="muted">${d.steps[0]}</span>`; return; }
  const cmp = compareToText(transcript, text);
  const ok = cmp.score >= 80;
  $out.innerHTML = `${ok ? '✅' : cmp.score >= 50 ? '🟡' : '❌'} 인식: "<b>${transcript || '(없음)'}</b>" · 일치 ${cmp.score}%${cmp.missing.length ? ` · 놓친 단어: ${cmp.missing.slice(0, 5).join(', ')}` : ''}`;
  store.logActivity(0.5);
}

// ---------- 전략 ----------
function renderGuide(body, topic) {
  body.innerHTML = html`
    <div class="card"><div class="h3 mb8">출제 경향 & 전략</div><p class="small ink2">${topic.intro}</p>
    <ul class="small ink2" style="padding-left:18px;margin:10px 0 0">${raw((topic.strategy || []).map(s => `<li>${s}</li>`).join(''))}</ul></div>
    <div class="card soft mt12"><div class="h3 mb8">이 주제 학습 루틴 (15분)</div>
      <ol class="small ink2" style="padding-left:18px;margin:0">
        <li>표현 탭 → 카드 모드로 15개 듣고 따라 말하기 (5분)</li>
        <li>질문 탭 → 목표 레벨 모범답안 문장별 섀도잉 (5분)</li>
        <li>같은 질문에 직접 녹음 답변 → 채점 → 피드백 반영해 한 번 더 (5분)</li>
      </ol></div>
    ${raw(editLinkHtml(topic.file, '✏️ GitHub에서 이 주제 내용 수정', 'btn ghost block mt12'))}`;
}
