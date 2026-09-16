import { html, raw } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';

export async function render(root, route) {
  const [idx, topics] = await Promise.all([data.index(), data.topics()]);
  const cat = route.query.cat || 'all';
  const cats = [['all', '전체'], ...Object.entries(idx.categories).map(([k, v]) => [k, v.title])];
  const list = cat === 'all' ? topics : topics.filter(t => t.category === cat);

  root.innerHTML = html`
    <header class="topbar"><div class="title">주제별 학습</div><a class="icon-btn" href="#/settings">⚙️</a></header>
    <div class="chips">${raw(cats.map(([k, v]) => `<a class="chip ${k === cat ? 'active' : ''}" href="#/topics?cat=${k}">${v}</a>`).join(''))}</div>
    <a class="card soft mt12 row between" href="#/focus">
      <div class="grow"><div class="h3">⚡ 시간이 없다면</div>
        <div class="xs muted mt8">목표 등급까지 필요한 주제만 골라 둔 집중 학습 + 서베이 추천 조합</div></div>
      <span class="chev">›</span></a>
    <p class="small muted mt12">${idx.categories[cat]?.desc || '설문 주제는 OPIc 2~10번, 롤플레이 11~13번, 고난도 14~15번에 출제됩니다. 우선순위 순으로 정렬되어 있어요.'}</p>
    <div class="list mt12">
      ${raw(list.map(t => topicRow(t)).join(''))}
    </div>
    ${list.length < idx.topics.length && cat === 'all' ? raw(`<p class="xs muted mt12 center">일부 주제 파일을 불러오지 못했습니다 (${idx.topics.length - list.length}개).</p>`) : ''}
  `;
}

function topicRow(t) {
  const learned = (t.expressions || []).filter((e, i) => store.exprInfo(`${t.id}#e${i}`).box >= 3).length;
  const total = (t.expressions || []).length;
  const practiced = store.state.practice.filter(p => p.topicId === t.id).length;
  return `<a class="list-row" href="#/topic/${t.id}">
    <div class="emoji">${t.emoji || '📘'}</div>
    <div class="grow"><div class="t">${t.title} <span class="xs muted" style="font-weight:500">${t.titleEn}</span></div>
      <div class="s">표현 ${learned}/${total} 익힘 · 질문 ${(t.questions || []).length}개 · 답변 연습 ${practiced}회</div>
      <div class="bar teal mt8" style="height:5px"><i style="width:${total ? learned / total * 100 : 0}%"></i></div></div>
    <span class="chev">›</span></a>`;
}
