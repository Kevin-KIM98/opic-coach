import { html, raw, fmtDate } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { examInfo } from '../exam.js';
import { versionLabel, checkForUpdate, applyUpdate, fmtUpdated } from '../version.js';

// 홈: D-day · 이어서 학습 · 주제 고르기. 주제 하나를 골라 끝까지 파는 흐름만 남겼다.
export async function render(root) {
  const [idx, topics, exam, bank] = await Promise.all([data.index(), data.topics(), examInfo().catch(() => null), data.bank().catch(() => null)]);
  const s = store.settings;
  const streak = store.streak();
  const dueCount = store.dueExprs().length;
  const last = topics.find(t => t.id === store.state.lastTopic);
  const byCat = (c) => topics.filter(t => t.category === c);

  root.innerHTML = html`
    <header class="topbar">
      <div class="title">OPIc Coach<div class="ver" data-ver>${versionLabel()}</div></div>
      <a class="icon-btn" href="#/settings" aria-label="설정">⚙️</a>
    </header>

    <section class="hero home-hero">
      <div class="row between">
        <div><div class="eyebrow">${s.name ? `${s.name} · ` : ''}목표 ${s.target}</div>
          <div class="big">${exam ? (exam.dday > 0 ? `D-${exam.dday}` : 'D-day') : 'OPIc'}</div>
          <div class="sub">${exam ? `${fmtDate(exam.date)} 시험` : '설정에서 시험일을 등록하세요'}</div></div>
        <div class="streak"><b>${streak}</b><span>일 연속 🔥</span></div>
      </div>
    </section>

    ${raw(last ? continueCard(last) : startCard(topics))}
    ${raw(surveyCard())}

    ${byCat('exam').length ? raw(`<div class="section-title">시험 기출 · 반복 학습</div>
    <div class="topic-grid">${byCat('exam').map(topicTile).join('')}</div>`) : ''}

    <div class="section-title">주제별 집중 학습</div>
    <div class="topic-grid">${raw(byCat('survey').map(topicTile).join(''))}</div>

    <div class="section-title">실전 유형</div>
    <div class="topic-grid">${raw([...byCat('roleplay'), ...byCat('unexpected'), ...byCat('advanced')].map(topicTile).join(''))}</div>

    ${byCat('general').length ? raw(`<div class="section-title">일반회화 · 오픽 외 기본 영어</div>
    <div class="topic-grid">${byCat('general').map(topicTile).join('')}</div>`) : ''}

    ${raw(bank ? bankCard(bank) : '')}

    <div class="btn-row mt16">
      <a class="btn" href="#/mock">🎯 모의고사</a>
      <a class="btn" href="#/review">🔁 복습${dueCount ? ` ${dueCount}` : ''}</a>
    </div>
    ${idx.persona ? raw(`<p class="xs muted center mt16">모범답안 속 '나' — ${idx.persona.split(' · ').slice(0, 3).join(' · ')}</p>`) : ''}
  `;
  // 서버에 더 새 버전이 있으면 알려 주고, 누르면 바로 적용
  checkForUpdate().then(nv => {
    const $v = root.querySelector('[data-ver]');
    if (!nv || !$v) return;
    $v.insertAdjacentHTML('afterend', `<button class="chip active ver-update" data-update>🔄 새 버전 v${nv.version}${nv.updated ? ` (${fmtUpdated(nv.updated)})` : ''} 적용</button>`);
    root.querySelector('[data-update]').addEventListener('click', (e) => { e.currentTarget.textContent = '적용 중…'; applyUpdate(); });
  });
}

const STEPS = [['expr', '표현'], ['pat', '패턴'], ['ans', '답안']];

// 이어서 학습: 다음에 할 단계로 바로 보낸다
function continueCard(t) {
  const p = store.topicProgress(t);
  const next = STEPS.find(([k]) => p[k][0] < p[k][1]) || STEPS[2];
  const tab = { expr: 'expr', pat: 'pat', ans: 'q' }[next[0]];
  return `<a class="card accent mt12 continue" href="#/topic/${t.id}?tab=${tab}">
    <div class="xs" style="opacity:.75">이어서 학습</div>
    <div class="row between mt8"><div class="h2">${t.emoji} ${t.title}</div><span class="chev" style="color:inherit;opacity:.7">›</span></div>
    <div class="steps mt12">${STEPS.map(([k, label]) => `<div class="step ${p[k][0] >= p[k][1] && p[k][1] ? 'done' : k === next[0] ? 'now' : ''}"><i style="width:${p[k][1] ? p[k][0] / p[k][1] * 100 : 0}%"></i><span>${label} ${p[k][0]}/${p[k][1]}</span></div>`).join('')}</div>
  </a>`;
}

function startCard(topics) {
  const first = topics.find(t => t.id === 'self-intro') || topics[0];
  return first ? `<a class="card accent mt12 continue" href="#/topic/${first.id}">
    <div class="xs" style="opacity:.75">처음이라면</div>
    <div class="row between mt8"><div class="h2">${first.emoji} ${first.title}부터</div><span class="chev" style="color:inherit;opacity:.7">›</span></div>
    <div class="xs mt8" style="opacity:.8">주제 하나를 골라 표현 → 패턴 → 답안 순서로 끝까지 연습하세요</div>
  </a>` : '';
}

// 실전 답변 모음 (영상 속 IH–AL 답변) 바로 가기
export function bankCard(bank) {
  const items = bank.groups.flatMap(g => g.items);
  const done = new Set(store.state.practice.map(p => p.qid));
  const n = items.filter(it => done.has(`bank:${it.id}`)).length;
  return `<a class="list-row mt12 bank-card" href="#/bank">
    <div class="emoji">🗂️</div>
    <div class="grow"><div class="t">${bank.title}</div><div class="s">${bank.subtitle} · 연습 ${n}/${items.length}</div>
      <div class="bar teal mt8" style="height:5px"><i style="width:${items.length ? n / items.length * 100 : 0}%"></i></div></div>
    <span class="chev">›</span></a>`;
}

// 서베이 체크 바로 가기: 가장 최근 시험일의 선택 수
function surveyCard() {
  const surveys = store.state.surveys || {};
  const last = Object.keys(surveys).sort().pop();
  return `<a class="list-row mt12" href="#/survey">
    <div class="emoji">☑️</div>
    <div class="grow"><div class="t">서베이 체크</div><div class="s">${last ? `${fmtDate(last)} 시험 · ${surveys[last].length}개 선택` : '시험에서 고른 Background Survey 항목 체크'}</div></div>
    <span class="chev">›</span></a>`;
}

function topicTile(t) {
  const p = store.topicProgress(t);
  return `<a class="tile" href="#/topic/${t.id}">
    <div class="emoji">${t.emoji || '📘'}</div>
    <div class="t">${t.title}</div>
    <div class="bar teal mt8" style="height:5px"><i style="width:${p.pct}%"></i></div>
    <div class="xs muted mt8">${p.pct ? `${p.pct}%` : '시작 전'}</div>
  </a>`;
}

export function ring(pct, color = 'var(--accent)') {
  const r = 36, c = 2 * Math.PI * r;
  return `<svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg><div class="val">${pct}<small>점</small></div>`;
}
