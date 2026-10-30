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
    <header class="topbar"><div class="title">만능 패턴</div><a class="icon-btn" href="#/review" title="복습">🔁</a></header>
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

// 패턴 세트: 강지완 만능패턴 72(kang) · Sarah IM3 필수 패턴 25(im3) · 일반회화 기본 패턴 54(daily54). 예전 데이터에 sets 가 없으면 하나로 본다
function patternSets(p) {
  const sets = p.sets?.length ? p.sets : [{ id: 'kang', title: '만능 패턴', desc: p.intro || '' }];
  return sets.map(st => {
    const groups = p.groups.filter(g => (g.set || 'kang') === st.id);
    return { ...st, groups };
  }).filter(st => st.groups.length);
}

async function renderPatterns(body, groupId, setPlayer = () => {}, mode = '') {
  const p = await data.patterns();
  const sets = patternSets(p);
  const cardsOf = (groups) => {
    const out = groups.flatMap(g => g.items.map((it, i) => ({ ...it, note: it.note || (it.pattern ? `패턴: ${it.pattern}` : ''), id: `pat:${g.id}#${i}`, group: g.title, no: 0 })));
    out.forEach((c, i) => { c.no = i + 1; });
    return out;
  };
  // group: 그룹 id · 'all:<세트>' (세트 전체 순서대로) · 예전 'all' (만능패턴 72 전체)
  const allKey = groupId === 'all' ? `all:${(sets.find(st => st.id === 'kang') || sets[0]).id}` : groupId;
  const setOfAll = allKey?.startsWith('all:') ? sets.find(st => `all:${st.id}` === allKey) : null;
  const group = setOfAll ? { id: allKey, title: `${setOfAll.title} · 전체`, desc: '처음부터 끝까지 순서대로', set: setOfAll }
    : (() => { const g = p.groups.find(x => x.id === groupId); return g ? { ...g, set: sets.find(st => st.id === (g.set || 'kang')) } : null; })();

  if (!group) {
    body.innerHTML = html`<p class="small ink2 mb12">유튜브 영상의 패턴입니다. 주제 화면의 ② 패턴에서는 이 패턴들을 주제·레벨에 맞게 조합해 연습해요.</p>
      ${raw(sets.map(st => {
        const all = cardsOf(st.groups);
        const learned = patLearned(all);
        return `<section class="pat-set">
          <div class="card set-head">
            <div class="row between"><div><div class="xs muted">📺 ${st.id === 'im3' ? 'IM3 기초' : st.id === 'daily54' ? '일반회화 · 오픽 외' : '답변 뼈대'}</div><div class="h3 mt8">${st.title}</div></div>${st.url ? `<a class="btn sm ghost" href="${st.url}" target="_blank" rel="noopener">▶ ${st.id === 'daily54' ? '참고 영상' : '영상'}</a>` : ''}</div>
            ${st.desc ? `<div class="xs ink2 mt8">${st.desc}</div>` : ''}
            <div class="row between mt12 small"><span class="muted">진행률</span><span><b>${learned}</b> / ${all.length}</span></div>
            <div class="bar mt8"><i style="width:${all.length ? learned / all.length * 100 : 0}%"></i></div>
            <div class="btn-row mt12"><a class="btn sm dark" href="#/drill?tab=patterns&group=all:${st.id}">▶ ${all.length}개 순서대로</a><a class="btn sm primary" href="#/drill?tab=patterns&group=all:${st.id}&mode=quiz">🎙️ 말하기 퀴즈</a></div>
          </div>
          <div class="list mt12">${st.groups.map((g, gi) => {
            const cards = g.items.map((_, i) => ({ id: `pat:${g.id}#${i}` }));
            return `<a class="list-row" href="#/drill?tab=patterns&group=${g.id}"><div class="emoji">${g.emoji || GROUP_EMOJI[gi % GROUP_EMOJI.length]}</div><div class="grow"><div class="t">${g.title} <span class="xs muted">${patLearned(cards)}/${g.items.length}</span></div><div class="s">${g.desc}</div><div class="bar mt8" style="height:5px"><i style="width:${patLearned(cards) / g.items.length * 100}%"></i></div></div><span class="chev">›</span></a>`;
          }).join('')}</div>
        </section>`;
      }).join(''))}
      <p class="xs muted mt12">퀴즈: 한국어 패턴을 보고 빈칸에 내 이야기를 넣어 영어로 말하면, 음성 인식으로 채점해 복습 상자에 반영해요.</p>
      ${raw(editLinkHtml('data/patterns.json', '✏️ GitHub에서 패턴 수정'))}`;
    return;
  }
  const cards = setOfAll ? cardsOf(setOfAll.groups) : cardsOf([p.groups.find(g => g.id === group.id)]);
  const sameSet = group.set ? group.set.groups : p.groups;
  const list = () => {
    body.innerHTML = html`
      <div class="row between mb12"><div><div class="h3">${group.title}</div><div class="xs muted">${group.desc} · 학습 완료 ${patLearned(cards)}/${cards.length}</div></div><span class="row" style="gap:6px"><button class="btn sm" data-quiz>🎙️ 퀴즈</button><button class="btn sm dark" data-flash>카드</button></span></div>
      <div class="chips mb12">${group.set ? raw(`<a class="chip ${setOfAll ? 'active' : ''}" href="#/drill?tab=patterns&group=all:${group.set.id}">전체</a>`) : ''}${raw(sameSet.map(g => `<a class="chip ${g.id === group.id ? 'active' : ''}" href="#/drill?tab=patterns&group=${g.id}">${g.title}</a>`).join(''))}</div>
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
