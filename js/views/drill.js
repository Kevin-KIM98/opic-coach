import { html, raw } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';
import { stopSpeaking } from '../speech.js';
import { bindPlay, flashcards } from './topic.js';
import { speakQuiz } from './quiz.js';
import { createAutoPlay } from '../autoplay.js';
import { editLinkHtml } from '../config.js';
import { openMode, closeMode } from '../app.js';

export async function render(root, route) {
  root.innerHTML = html`
    <header class="topbar"><div class="title">만능 패턴 72</div><a class="icon-btn" href="#/review" title="복습">🔁</a></header>
    <div id="dbody" class="mt12"></div>`;
  const body = root.querySelector('#dbody');
  // 화면을 떠나면 자동 재생을 멈춘다
  let player = null;
  const setPlayer = (p) => { player = p; };
  await renderPatterns(body, route.query.group, setPlayer, route.query.mode);
  return () => { player?.destroy(); stopSpeaking(); };
}

const GROUP_EMOJI = ['🚀', '🖼️', '🔁', '📖', '⚖️', '💬', '🧩', '🏁', '🎯', '🌟', '📌', '🗣️'];
const patLearned = (cards) => cards.filter(c => store.exprInfo(c.id).box >= 3).length;

async function renderPatterns(body, groupId, setPlayer = () => {}, mode = '') {
  const p = await data.patterns();
  const all = p.groups.flatMap(g => g.items.map((it, i) => ({ ...it, note: it.note || (it.pattern ? `패턴: ${it.pattern}` : ''), id: `pat:${g.id}#${i}`, group: g.title, no: 0 })));
  all.forEach((c, i) => { c.no = i + 1; });
  const group = groupId === 'all' ? { id: 'all', title: `전체 ${all.length}문장`, desc: '처음부터 끝까지 순서대로' } : p.groups.find(g => g.id === groupId) || null;

  if (!group) {
    const learned = patLearned(all);
    const src = p.source;
    body.innerHTML = html`<p class="small ink2 mb12">${p.intro}</p>
      ${src ? raw(`<div class="card soft mb12"><div class="xs muted">📺 학습 출처</div><div class="h3 mt8">${src.title}</div>${src.note ? `<div class="xs ink2 mt8">${src.note}</div>` : ''}<a class="btn sm mt12" href="${src.url}" target="_blank" rel="noopener">▶ 영상 보기</a></div>`) : ''}
      <div class="card mb12"><div class="row between"><div class="h3">진행률</div><div class="small"><b>${learned}</b> / ${all.length} 문장</div></div>
        <div class="bar teal mt8"><i style="width:${all.length ? learned / all.length * 100 : 0}%"></i></div>
        <div class="btn-row mt12"><a class="btn dark" href="#/drill?tab=patterns&group=all">▶ ${all.length}문장 순서대로</a><a class="btn teal" href="#/drill?tab=patterns&group=all&mode=quiz">🎙️ 말하기 퀴즈</a></div>
        <p class="xs muted mt8">퀴즈: 한국어 패턴을 보고 빈칸에 내 주제를 넣어 영어로 말하면, 음성 인식으로 채점해 복습 상자에 반영해요.</p></div>
      <div class="list">${raw(p.groups.map((g, gi) => {
        const cards = g.items.map((_, i) => ({ id: `pat:${g.id}#${i}` }));
        return `<a class="list-row" href="#/drill?tab=patterns&group=${g.id}"><div class="emoji">${g.emoji || GROUP_EMOJI[gi % GROUP_EMOJI.length]}</div><div class="grow"><div class="t">${g.title} <span class="xs muted">${patLearned(cards)}/${g.items.length}</span></div><div class="s">${g.desc}</div><div class="bar teal mt8" style="height:5px"><i style="width:${patLearned(cards) / g.items.length * 100}%"></i></div></div><span class="chev">›</span></a>`;
      }).join(''))}</div>
      ${raw(editLinkHtml('data/patterns.json', '✏️ GitHub에서 패턴 수정'))}`;
    return;
  }
  const cards = group.id === 'all' ? all : all.filter(c => c.id.startsWith(`pat:${group.id}#`));
  const list = () => {
    body.innerHTML = html`
      <div class="row between mb12"><div><div class="h3">${group.title}</div><div class="xs muted">${group.desc} · 학습 완료 ${patLearned(cards)}/${cards.length}</div></div><span class="row" style="gap:6px"><button class="btn sm" data-quiz>🎙️ 퀴즈</button><button class="btn sm dark" data-flash>카드</button></span></div>
      <div class="chips mb12"><a class="chip ${group.id === 'all' ? 'active' : ''}" href="#/drill?tab=patterns&group=all">전체</a>${raw(p.groups.map(g => `<a class="chip ${g.id === group.id ? 'active' : ''}" href="#/drill?tab=patterns&group=${g.id}">${g.title}</a>`).join(''))}</div>
      <div data-autoplay></div>
      <div class="list mt12" data-list>${raw(cards.map(c => patRow(c)).join(''))}</div>`;
    bindPlay(body);
    const player = createAutoPlay(body.querySelector('[data-autoplay]'), body.querySelector('[data-list]'));
    setPlayer(player);
    // 카드·퀴즈는 기록을 남겨 열어서, 뒤로 가기 한 번이면 이 목록으로 돌아온다
    body.querySelector('[data-flash]').addEventListener('click', () => { player.destroy(); openMode(`${base}&mode=cards`); });
    body.querySelector('[data-quiz]').addEventListener('click', () => { player.destroy(); openMode(`${base}&mode=quiz`); });
  };
  const base = `#/drill?tab=patterns&group=${group.id}`;
  if (mode === 'quiz') setPlayer(speakQuiz(body, cards, () => closeMode(base)));
  else if (mode === 'cards') setPlayer(flashcards(body, cards, () => closeMode(base)));
  else list();
}

// 패턴 행: 번호 · 패턴 틀(___) · 뜻 · 예문 3개 (예문마다 🔊 — 자동 재생은 예문을 순서대로 읽는다)
function patRow(c) {
  const info = store.exprInfo(c.id);
  const dot = info.box >= 3 ? '✅' : info.box > 0 ? '🟡' : '';
  const ex = [c.en, ...(c.examples || [])];
  const head = c.pattern || c.en;
  return `<div class="expr pat"><div class="grow">
      <div class="en"><span class="muted">${c.no}.</span> ${head} <span class="xs">${dot}</span> <span class="badge ${c.level || 'IM'}">${c.level || 'IM'}</span></div>
      <div class="ko">${c.ko}</div>
      <div class="pat-ex mt8">${ex.map(e => `<div class="row" style="gap:8px;align-items:center"><button class="play sm" data-say="${encodeURIComponent(e)}">🔊</button><span class="small">${e}</span></div>`).join('')}</div>
    </div></div>`;
}
