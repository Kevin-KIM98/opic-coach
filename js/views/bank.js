import { html, raw, fmtTime } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { header } from '../app.js';
import { iconFor } from './topic.js';
import { renderQuestion } from './practice.js';

// 실전 답변 모음: 유튜브 영상 속 답변(IM · IH–AL)을 주제별로 모아 섀도잉 · 채점.
// #/bank            목록 (?g=<그룹 id> 로 주제 필터)
// #/bank/<문항 id>   문항 하나 — 주제 질문과 같은 '모범답안 · 섀도잉 / 직접 답변 · 채점' 화면 (레벨 전환)
export async function render(root, route) {
  const bank = await data.bank();
  if (route.parts[0]) return renderItem(root, bank, route.parts[0], route.query);
  renderList(root, bank, route.query.g || 'all');
}

const qidOf = (item) => `bank:${item.id}`;
const practiced = (item) => store.state.practice.some(p => p.qid === qidOf(item));
const allItems = (bank) => bank.groups.flatMap(g => g.items.map(it => ({ ...it, group: g })));
// 영상의 그 문항 위치로 바로 가는 링크
export const videoAt = (src, t) => `${src.url}${src.url.includes('?') ? '&' : '?'}t=${Math.max(0, Math.floor(t || 0))}`;
// 목표 등급에 맞는 레벨을 먼저 연다: IM3 → IM, IH·AL → IH–AL (없으면 첫 레벨)
// 문항에서 레벨을 바꾸면 기억해 두고 다음 문항도 그 레벨로 연다
function defaultLevel(bank, it) {
  const ids = bank.levels.map(l => l.id).filter(id => it.answers[id]);
  if (ids.includes(store.settings.bankLevel)) return store.settings.bankLevel;
  const want = (store.settings.target || 'IM3') === 'IM3' ? ids.find(id => id.startsWith('IM')) : ids.find(id => !id.startsWith('IM'));
  return want || ids[0];
}

function renderList(root, bank, g) {
  const items = allItems(bank);
  const done = items.filter(practiced).length;
  const groups = g === 'all' ? bank.groups : bank.groups.filter(x => x.id === g);
  root.innerHTML = html`
    ${raw(header(bank.title))}
    <div class="card mt12">
      <div class="xs ink2">${bank.intro}</div>
      ${raw(bank.levels.map(l => `<div class="row between mt12"><div class="grow"><div class="xs muted">📺 ${l.source.channel} · <b>${l.id}</b></div><div class="small mt8" style="font-weight:600">${l.source.title}</div></div><a class="btn sm ghost" href="${l.source.url}" target="_blank" rel="noopener">▶ 영상</a></div>`).join(''))}
      <div class="row between mt12 small"><span class="muted">답변 연습</span><span><b>${done}</b> / ${items.length}</span></div>
      <div class="bar mt8"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
    </div>
    <div class="chips mt12">${raw([['all', `전체 ${items.length}`], ...bank.groups.map(x => [x.id, `${x.emoji} ${x.title} ${x.items.length}`])].map(([k, v]) => `<a class="chip ${k === g ? 'active' : ''}" href="#/bank?g=${k}" data-replace>${v}</a>`).join(''))}</div>
    ${raw(groups.map(x => `
      <div class="section-title">${x.emoji} ${x.title} <span class="xs muted" style="font-weight:500">${x.items.filter(practiced).length}/${x.items.length}</span></div>
      <div class="list">${x.items.map(it => `<a class="list-row" href="#/bank/${it.id}"><div class="emoji">${practiced(it) ? '✅' : iconFor(it.type)}</div><div class="grow"><div class="t">${it.ko}</div><div class="s">${TYPE_LABEL[it.type] || it.type} · ${bank.levels.filter(l => it.answers[l.id]).map(l => l.id).join(' · ')}</div></div><span class="chev">›</span></a>`).join('')}</div>`).join(''))}`;
  // 주제 칩은 기록에 쌓지 않는다 (뒤로 가기 한 번이면 이전 화면)
  root.querySelectorAll('[data-replace]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.replace(a.getAttribute('href')); }));
}

async function renderItem(root, bank, id, query) {
  const items = allItems(bank);
  const i = items.findIndex(x => x.id === id);
  if (i < 0) { root.innerHTML = '<div class="empty">문항을 찾을 수 없습니다.<br><br><a class="btn" href="#/bank">실전 답변 목록</a></div>'; return; }
  const it = items[i];
  const prev = items[i - 1], next = items[i + 1];
  const patterns = await data.patterns();
  // 레벨 순서는 bank.levels 를 따른다 (IM → IH–AL)
  const order = bank.levels.map(l => l.id).filter(lv => it.answers[lv]);
  const q = {
    id: qidOf(it), type: it.type, en: it.en, ko: it.ko, tips: it.tips || [],
    answers: Object.fromEntries(order.map(lv => [lv, it.answers[lv]])), answersKo: it.answersKo,
  };
  const topic = { id: 'bank', title: bank.title, expressions: [] };
  const nav = (x, label) => x ? `<a class="btn sm ghost grow" href="#/bank/${x.id}" data-replace>${label}</a>` : '<span class="grow"></span>';
  const videos = bank.levels.filter(l => it.t?.[l.id] != null)
    .map(l => `<a class="btn sm grow" href="${videoAt(l.source, it.t[l.id])}" target="_blank" rel="noopener">▶ ${l.id} 영상 ${fmtTime(it.t[l.id])}</a>`).join('');
  const extra = `<div class="row mt12" style="gap:6px">${videos}</div>
    <div class="row mt8" style="gap:6px">${nav(prev, '‹ 이전 문항')}${nav(next, '다음 문항 ›')}</div>
    <div class="xs muted center mt8">${it.group.emoji} ${it.group.title} · ${i + 1} / ${items.length} · ${order.join(' · ')} 실전 답변</div>`;
  const cleanup = renderQuestion(root, {
    title: `${it.group.emoji} ${it.group.title}`, topic, q, extra,
    query: { ...query, level: query.level || defaultLevel(bank, it) },
    exprBank: patterns.groups.flatMap(g => g.items.map(x => x.en)),
    onLevel: (lv) => store.setSetting('bankLevel', lv),
  });
  // 이전/다음 문항은 기록에 쌓지 않는다 — 뒤로 가기 한 번이면 목록으로
  root.querySelectorAll('[data-replace]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.replace(a.getAttribute('href')); }));
  return cleanup;
}
