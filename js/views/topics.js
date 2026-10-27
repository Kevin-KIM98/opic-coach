import { html, raw } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';
import { bankCard } from './home.js';

export async function render(root, route) {
  const [idx, topics, bank] = await Promise.all([data.index(), data.topics(), data.bank().catch(() => null)]);
  const cat = route.query.cat || 'all';
  const cats = [['all', '전체'], ...Object.entries(idx.categories).map(([k, v]) => [k, v.title])];
  const list = cat === 'all' ? topics : topics.filter(t => t.category === cat);

  root.innerHTML = html`
    <header class="topbar"><div class="title">주제별 학습</div><a class="icon-btn" href="#/settings">⚙️</a></header>
    <div class="chips">${raw(cats.map(([k, v]) => `<a class="chip ${k === cat ? 'active' : ''}" href="#/topics?cat=${k}">${v}</a>`).join(''))}</div>
    ${idx.persona ? raw(personaCard(idx)) : ''}
    ${bank ? raw(bankCard(bank)) : ''}
    <p class="small muted mt12">${idx.categories[cat]?.desc || '설문 주제는 OPIc 2~10번, 롤플레이 11~13번, 고난도 14~15번에 출제됩니다. 우선순위 순으로 정렬되어 있어요.'}</p>
    <div class="list mt12">
      ${raw(list.map(t => topicRow(t)).join(''))}
    </div>
    ${list.length < idx.topics.length && cat === 'all' ? raw(`<p class="xs muted mt12 center">일부 주제 파일을 불러오지 못했습니다 (${idx.topics.length - list.length}개).</p>`) : ''}
  `;
}

// 모든 모범답안이 공유하는 페르소나 · 답변 흐름 (출처 영상)
function personaCard(idx) {
  const src = idx.source;
  return `<div class="card mt12"><div class="xs muted">🧑‍💼 모범답안 속 '나'</div><div class="small mt8">${idx.persona}</div>
    ${idx.flow ? `<div class="xs muted mt12">답변 흐름</div><div class="small mt8">${idx.flow.map((f, i) => `<b>${i + 1}</b> ${f}`).join(' → ')}</div>` : ''}
    ${src ? `<div class="xs ink2 mt12">${src.note || ''}</div><a class="btn sm mt12" href="${src.url}" target="_blank" rel="noopener">▶ ${src.title}</a>` : ''}</div>`;
}

function topicRow(t) {
  const p = store.topicProgress(t);
  return `<a class="list-row" href="#/topic/${t.id}">
    <div class="emoji">${t.emoji || '📘'}</div>
    <div class="grow"><div class="t">${t.title} <span class="xs muted" style="font-weight:500">${t.titleEn}</span></div>
      <div class="s">표현 ${p.expr[0]}/${p.expr[1]} · 패턴 ${p.pat[0]}/${p.pat[1]} · 답안 연습 ${p.ans[0]}/${p.ans[1]}</div>
      <div class="bar teal mt8" style="height:5px"><i style="width:${p.pct}%"></i></div></div>
    <span class="chev">›</span></a>`;
}
