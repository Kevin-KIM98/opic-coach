import { html, raw, fmtTime } from '../util.js';
import { data, TYPE_LABEL } from '../data.js';
import { store } from '../store.js';
import { header } from '../app.js';
import { iconFor } from './topic.js';
import { renderQuestion } from './practice.js';
import { createSequencePlayer, repeatCount, gapLabel, cycleRepeat, cycleGap, repeatLoop, toggleLoop, loopLabel } from '../autoplay.js';

// 실전 답변 모음: 유튜브 영상 속 답변(IM · IH–AL)을 주제별로 모아 섀도잉 · 채점.
// #/bank            목록 (?g=<그룹 id> 로 주제 필터)
// #/bank/<문항 id>   문항 하나 — 주제 질문과 같은 '모범답안 · 섀도잉 / 직접 답변 · 채점' 화면 (레벨 전환)
export async function render(root, route) {
  const bank = await data.bank();
  if (route.parts[0]) return renderItem(root, bank, route.parts[0], route.query);
  return renderList(root, bank, route.query.g || 'all');
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
    <div class="autoplay mt12" data-bank-play></div>
    <div class="chips mt12">${raw([['all', `전체 ${items.length}`], ...bank.groups.map(x => [x.id, `${x.emoji} ${x.title} ${x.items.length}`])].map(([k, v]) => `<a class="chip ${k === g ? 'active' : ''}" href="#/bank?g=${k}" data-replace>${v}</a>`).join(''))}</div>
    ${raw(groups.map(x => `
      <div class="section-title">${x.emoji} ${x.title} <span class="xs muted" style="font-weight:500">${x.items.filter(practiced).length}/${x.items.length}</span></div>
      <div class="list">${x.items.map(it => `<a class="list-row" href="#/bank/${it.id}" data-id="${it.id}"><div class="emoji">${practiced(it) ? '✅' : iconFor(it.type)}</div><div class="grow"><div class="t">${it.ko}</div><div class="s">${TYPE_LABEL[it.type] || it.type} · ${bank.levels.filter(l => it.answers[l.id]).map(l => l.id).join(' · ')}</div></div><span class="chev">›</span></a>`).join('')}</div>`).join(''))}`;
  // 주제 칩은 기록에 쌓지 않는다 (뒤로 가기 한 번이면 이전 화면)
  root.querySelectorAll('[data-replace]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.replace(a.getAttribute('href')); }));
  return listPlayer(root.querySelector('[data-bank-play]'), root, bank, groups.flatMap(x => x.items));
}

// 목록 전체 듣기: 지금 보이는 문항을 순서대로 — 질문(한 번) → 고른 레벨 답변을 문장마다 반복.
// 🔁 이 켜져 있으면 멈출 때까지 처음부터 다시. 재생 중인 문항을 표시하고, 🌙 화면 어둡게도 쓸 수 있다.
function listPlayer(mount, root, bank, items) {
  const player = createSequencePlayer();
  const lvs = bank.levels.map(l => l.id);
  let level = lvs.includes(store.settings.bankLevel) ? store.settings.bankLevel
    : ((store.settings.target || 'IM3') === 'IM3' ? lvs.find(l => l.startsWith('IM')) : lvs.find(l => !l.startsWith('IM'))) || lvs[0];
  let withQ = store.settings.bankPlayQ ?? true;
  let plan = [];      // [{text, once, idx}] — idx 는 items 의 몇 번째 문항인지

  mount.innerHTML = `
    <div class="row between">
      <button class="btn primary sm" data-toggle>▶ 전체 듣기</button>
      <div class="row" style="gap:6px">
        <button class="chip" data-loop title="멈출 때까지 처음부터 계속 반복"></button>
        <button class="chip" data-repeat title="한 문장을 몇 번 읽을지"></button>
        <button class="chip" data-gap title="따라 말할 시간"></button>
      </div>
    </div>
    <div class="row mt8" style="gap:6px;flex-wrap:wrap">
      ${lvs.map(l => `<button class="chip" data-lv="${l}">${l}</button>`).join('')}
      <button class="chip" data-q title="문항마다 질문을 먼저 한 번 읽기">❓ 질문도 읽기</button>
    </div>
    <div class="xs muted mt8" data-status></div>`;
  const $toggle = mount.querySelector('[data-toggle]');
  const $status = mount.querySelector('[data-status]');
  const draw = () => {
    mount.querySelector('[data-loop]').textContent = loopLabel();
    mount.querySelector('[data-loop]').classList.toggle('active', repeatLoop());
    mount.querySelector('[data-repeat]').textContent = `반복 ${repeatCount()}회`;
    mount.querySelector('[data-gap]').textContent = gapLabel();
    mount.querySelectorAll('[data-lv]').forEach(b => b.classList.toggle('active', b.dataset.lv === level));
    mount.querySelector('[data-q]').classList.toggle('active', withQ);
  };
  const clearMark = () => root.querySelectorAll('.list-row.saying').forEach(x => x.classList.remove('saying'));
  const idle = (msg) => {
    $toggle.textContent = '▶ 전체 듣기';
    $toggle.classList.remove('on');
    mount.classList.remove('on');
    clearMark();
    $status.textContent = msg ?? `${items.length}문항 · ${level} 답변을 순서대로 들어요. 재생 중 🌙 화면 어둡게로 끈 것처럼 둘 수 있어요.`;
  };
  // 고난도처럼 고른 레벨 답변이 없는 문항은 있는 레벨로 읽는다
  const build = () => items.flatMap((it, idx) => {
    const lv = it.answers[level] ? level : lvs.find(l => it.answers[l]);
    const sents = (it.answers[lv] || '').match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map(x => x.trim()).filter(Boolean) || [];
    return [...(withQ ? [{ text: it.en, once: true, idx }] : []), ...sents.map(text => ({ text, idx }))];
  });
  let lastIdx = -1;
  const start = () => {
    plan = build();
    if (!plan.length) { idle('읽을 문항이 없어요.'); return; }
    lastIdx = -1;
    $toggle.textContent = '⏸ 멈춤';
    $toggle.classList.add('on');
    mount.classList.add('on');
    player.run(plan, {
      loop: repeatLoop(),
      onItem: (i) => {
        const { idx } = plan[i];
        if (idx === lastIdx) return;
        lastIdx = idx;
        const it = items[idx];
        clearMark();
        const row = root.querySelector(`.list-row[data-id="${it.id}"]`);
        if (row) { row.classList.add('saying'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        $status.textContent = `${idx + 1} / ${items.length} · ${it.ko}`;
        if (idx === 0) store.logActivity(0.5);
      },
      onEnd: () => idle('한 바퀴 다 들었어요. 🔁 을 켜면 멈출 때까지 계속 반복해요.'),
      onInterrupt: (msg) => idle(msg),
    });
  };
  const restartIfPlaying = () => { draw(); if (player.playing) start(); };
  $toggle.addEventListener('click', () => { if (player.playing) { player.stop(); idle(); } else start(); });
  mount.querySelector('[data-loop]').addEventListener('click', () => { toggleLoop(); restartIfPlaying(); });
  mount.querySelector('[data-repeat]').addEventListener('click', () => { cycleRepeat(); draw(); });
  mount.querySelector('[data-gap]').addEventListener('click', () => { cycleGap(); draw(); });
  mount.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { level = b.dataset.lv; store.setSetting('bankLevel', level); restartIfPlaying(); if (!player.playing) idle(); }));
  mount.querySelector('[data-q]').addEventListener('click', () => { withQ = !withQ; store.setSetting('bankPlayQ', withQ); restartIfPlaying(); });
  draw();
  idle();
  return () => player.stop();
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
