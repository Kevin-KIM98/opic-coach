import { html, raw } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';
import { speak, stopSpeaking } from '../speech.js';
import { exprRow, bindPlay, flashcards, quickCheck } from './topic.js';
import { createAutoPlay } from '../autoplay.js';
import { editLinkHtml } from '../config.js';

export async function render(root, route) {
  const tab = route.query.tab || 'patterns';
  root.innerHTML = html`
    <header class="topbar"><div class="title">패턴 · 발음</div><a class="icon-btn" href="#/review" title="복습">🔁</a></header>
    <div class="tabs" id="dtabs"><button data-t="patterns" class="${tab === 'patterns' ? 'active' : ''}">만능 패턴</button><button data-t="pron" class="${tab === 'pron' ? 'active' : ''}">발음 훈련</button></div>
    <div id="dbody" class="mt12"></div>`;
  const body = root.querySelector('#dbody');
  // 탭을 바꾸거나 화면을 떠나면 자동 재생을 멈춘다
  let player = null;
  const setPlayer = (p) => { player = p; };
  const show = async (t) => {
    root.querySelectorAll('#dtabs button').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    player?.destroy(); player = null;
    stopSpeaking();
    if (t === 'patterns') await renderPatterns(body, route.query.group, setPlayer);
    else await renderPron(body, route.query.set, setPlayer);
  };
  root.querySelectorAll('#dtabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
  show(tab);
  return () => { player?.destroy(); stopSpeaking(); };
}

async function renderPatterns(body, groupId, setPlayer = () => {}) {
  const p = await data.patterns();
  const group = p.groups.find(g => g.id === groupId) || null;
  if (!group) {
    body.innerHTML = html`<p class="small ink2 mb12">${p.intro}</p>
      <div class="list">${raw(p.groups.map(g => {
        const learned = g.items.filter((it, i) => store.exprInfo(`pat:${g.id}#${i}`).box >= 3).length;
        return `<a class="list-row" href="#/drill?tab=patterns&group=${g.id}"><div class="emoji">${{ opener: '🚀', describe: '🖼️', routine: '🔁', experience: '📖', compare: '⚖️', opinion: '💬', closing: '🏁', filler: '🧩' }[g.id] || '🧩'}</div><div class="grow"><div class="t">${g.title}</div><div class="s">${g.desc}</div><div class="bar teal mt8" style="height:5px"><i style="width:${learned / g.items.length * 100}%"></i></div></div><span class="chev">›</span></a>`;
      }).join(''))}</div>
      ${raw(editLinkHtml('data/patterns.json', '✏️ GitHub에서 패턴 수정'))}`;
    return;
  }
  const cards = group.items.map((it, i) => ({ ...it, id: `pat:${group.id}#${i}` }));
  const list = () => {
    body.innerHTML = html`
      <div class="row between mb12"><div><div class="h3">${group.title}</div><div class="xs muted">${group.desc}</div></div><button class="btn sm dark" data-flash>카드</button></div>
      <div class="chips mb12">${raw(p.groups.map(g => `<a class="chip ${g.id === group.id ? 'active' : ''}" href="#/drill?tab=patterns&group=${g.id}">${g.title}</a>`).join(''))}</div>
      <div data-autoplay></div>
      <div class="list mt12" data-list>${raw(cards.map(c => exprRow(c, c.id)).join(''))}</div>`;
    bindPlay(body);
    const player = createAutoPlay(body.querySelector('[data-autoplay]'), body.querySelector('[data-list]'));
    setPlayer(player);
    body.querySelector('[data-flash]').addEventListener('click', () => {
      player.destroy();
      setPlayer(flashcards(body, cards, list));   // 카드 모드도 탭 이동 시 함께 멈추도록
    });
  };
  list();
}

async function renderPron(body, setId, setPlayer = () => {}) {
  const p = await data.pronunciation();
  const set = p.sets.find(s => s.id === setId);
  if (!set) {
    body.innerHTML = html`<p class="small ink2 mb12">${p.intro}</p>
      <div class="list">${raw(p.sets.map(s => `<a class="list-row" href="#/drill?tab=pron&set=${s.id}"><div class="emoji">${{ 'minimal-pairs': '👂', stress: '🎯', linking: '🔗', intonation: '🎵', twisters: '👅' }[s.kind] || '👄'}</div><div class="grow"><div class="t">${s.title}</div><div class="s">${s.tip.slice(0, 48)}…</div></div><span class="chev">›</span></a>`).join(''))}</div>
      ${raw(editLinkHtml('data/pronunciation.json', '✏️ GitHub에서 발음 자료 수정'))}`;
    return;
  }
  let inner = '';
  if (set.kind === 'minimal-pairs') {
    inner = `<div class="section-title">최소 대립쌍 · 탭하면 발음</div><div class="stack">${set.pairs.map(([a, b]) => `<div class="pair"><button data-say="${encodeURIComponent(a)}">${a}</button><button data-say="${encodeURIComponent(b)}">${b}</button></div>`).join('')}</div>
      <div class="section-title">듣기 테스트</div><div class="card soft"><p class="small ink2">🔊 재생되는 단어가 왼쪽/오른쪽 중 어느 것인지 맞혀 보세요.</p><div class="row mt12"><button class="btn primary grow" data-quiz>🎲 문제 내기</button></div><div class="pair mt12 hidden" data-quiz-pair><button data-ans="0"></button><button data-ans="1"></button></div><div class="xs mt8 center" data-quiz-result></div><div class="xs muted center mt8" data-quiz-score></div></div>`;
  } else if (set.words) {
    inner = `<div class="section-title">${set.kind === 'linking' ? '연음 덩어리' : set.kind === 'intonation' ? '문장 강세' : '강세 위치'}</div><div class="list">${set.words.map((w, i) => `<div class="expr" data-w="${i}"><button class="play" data-say="${encodeURIComponent(w.word)}">🔊</button><div class="grow"><div class="en">${w.word}</div><div class="ko"><b>${w.stressed}</b>${w.tip ? ` · ${w.tip}` : ''}</div><div class="xs mt8" data-result></div></div><button class="play" data-check="${i}">🎙️</button></div>`).join('')}</div>`;
  }
  const sentences = set.sentences ? `<div class="section-title">문장 연습 · 🔊 듣고 🎙️ 따라 말하기</div><div class="list">${set.sentences.map((s, i) => `<div class="expr" data-s="${i}"><button class="play" data-say="${encodeURIComponent(s)}">🔊</button><div class="grow"><div class="en">${s}</div><div class="xs mt8" data-result></div></div><button class="play" data-check-s="${i}">🎙️</button></div>`).join('')}</div>` : '';

  body.innerHTML = html`
    <div class="chips mb12">${raw(p.sets.map(s => `<a class="chip ${s.id === set.id ? 'active' : ''}" href="#/drill?tab=pron&set=${s.id}">${s.title}</a>`).join(''))}</div>
    <div class="card"><div class="h3 mb8">${set.title}</div><p class="small ink2">${set.tip}</p></div>
    <div class="mt12" data-autoplay></div>
    <div data-drill>${raw(inner)}${raw(sentences)}</div>`;
  bindPlay(body);
  // 듣기 퀴즈 버튼은 자동 재생 대상이 아니므로 연습 항목만 범위로 잡는다
  setPlayer(createAutoPlay(body.querySelector('[data-autoplay]'), body.querySelector('[data-drill]')));
  body.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => quickCheck(b, set.words[Number(b.dataset.check)].word, body.querySelector(`[data-w="${b.dataset.check}"] [data-result]`))));
  body.querySelectorAll('[data-check-s]').forEach(b => b.addEventListener('click', () => quickCheck(b, set.sentences[Number(b.dataset.checkS)], body.querySelector(`[data-s="${b.dataset.checkS}"] [data-result]`))));

  // 최소대립쌍 듣기 퀴즈
  if (set.kind === 'minimal-pairs') {
    let quiz = null, right = 0, total = 0;
    const $pair = body.querySelector('[data-quiz-pair]'), $res = body.querySelector('[data-quiz-result]'), $score = body.querySelector('[data-quiz-score]');
    body.querySelector('[data-quiz]').addEventListener('click', async () => {
      const pair = set.pairs[Math.floor(Math.random() * set.pairs.length)];
      quiz = { pair, answer: Math.random() < 0.5 ? 0 : 1 };
      $pair.classList.remove('hidden'); $pair.children[0].textContent = pair[0]; $pair.children[1].textContent = pair[1]; $res.textContent = '';
      await speak(pair[quiz.answer], { rate: 0.9 });
    });
    $pair.querySelectorAll('[data-ans]').forEach(b => b.addEventListener('click', () => {
      if (!quiz) return;
      total++; const ok = Number(b.dataset.ans) === quiz.answer; if (ok) right++;
      $res.textContent = ok ? `✅ 정답! "${quiz.pair[quiz.answer]}"` : `❌ 정답은 "${quiz.pair[quiz.answer]}"`;
      $score.textContent = `${right} / ${total} 정답`;
      store.logActivity(0.2);
      quiz = null;
    }));
  }
  store.logActivity(1);
}
