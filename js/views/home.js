import { html, raw, fmtDate, levelColor } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { currentPlan, dayIndexFor, planDay, taskTitle, taskMinutes, carriedOver, planProgress, taskNames } from '../plan.js';
import { examInfo } from '../exam.js';
import { aggregateMock, levelIndex } from '../scoring.js';

export async function render(root) {
  const [{ plan, meta }, topics, names, exam] = await Promise.all([currentPlan(), data.topics(), taskNames(), examInfo()]);
  const topicsById = Object.fromEntries(topics.map(t => [t.id, t]));
  const s = store.settings;
  const todayNo = dayIndexFor(plan);
  const day = planDay(plan, todayNo);
  const done = store.doneTasks(plan.id, todayNo);
  const carried = carriedOver(plan, todayNo);
  const prog = planProgress(plan);
  const lastMock = store.state.mocks[0];
  const streak = store.streak();
  const totalMin = todayMinutes();
  const dueCount = store.dueExprs().length;

  const greeting = (() => { const h = new Date().getHours(); return h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })();

  root.innerHTML = html`
    <header class="topbar">
      <div class="title">OPIc Coach</div>
      <a class="icon-btn" href="#/settings" aria-label="설정">⚙️</a>
    </header>

    <section class="hero">
      <div class="eyebrow">${greeting}${s.name ? `, ${s.name}` : ''}</div>
      <div class="big">${exam ? (exam.dday > 0 ? `D-${exam.dday}` : 'D-day') : `Day ${todayNo}`}</div>
      <div class="sub">${exam ? `${exam.name} ${fmtDate(exam.date)}` : '시험일을 불러오지 못했어요'} · 목표 <b>${s.target}</b> · ${plan.title} ${Math.ceil(todayNo / 7)}주차</div>
      <div class="row mt16" style="gap:8px;flex-wrap:wrap">
        ${exam?.source === 'auto' ? raw(`<span class="chip" style="background:rgba(255,255,255,.14);color:#fff">가장 빠른 응시 가능일</span>`) : ''}
        ${lastMock ? raw(`<span class="chip" style="background:rgba(255,255,255,.14);color:#fff">최근 모의고사 ${lastMock.level} (${lastMock.score}점)</span>`) : raw(`<a class="chip" href="#/mock" style="background:rgba(255,255,255,.14);color:#fff">첫 모의고사로 현재 레벨 확인 →</a>`)}
      </div>
    </section>

    ${exam ? raw(examCard(exam)) : ''}

    <div class="stats mt12">
      <div class="stat"><b>${streak}🔥</b><span>연속 학습일</span></div>
      <div class="stat"><b>${Math.round(totalMin)}분</b><span>오늘 학습</span></div>
      <div class="stat"><b>${prog.pct}%</b><span>과정 진행률</span></div>
    </div>

    <div class="section-title row between"><span>오늘의 학습 · Day ${todayNo}</span><a class="chip" href="#/plan">전체 일정</a></div>
    <div class="list" id="tasks">
      ${raw(day.tasks.map((t, i) => taskRow(t, i, done.includes(i), meta, topicsById, plan.id, todayNo, false, names)).join(''))}
    </div>
    ${carried.length ? raw(`<div class="section-title">밀린 과제</div><div class="list">${carried.map(c => taskRow(c.task, c.idx, false, meta, topicsById, plan.id, c.day, true, names)).join('')}</div>`) : ''}

    ${dueCount ? raw(`<a class="card soft mt16 row" href="#/review"><div class="grow"><div class="h3">복습할 표현 ${dueCount}개</div><div class="small muted">간격 반복으로 외운 표현이 잊히기 전에 확인</div></div><span class="chev">›</span></a>`) : ''}

    <div class="section-title">빠른 시작</div>
    <div class="grid-2">
      <a class="card" href="#/mock/run/opic-mini"><div style="font-size:26px">⚡</div><div class="h3 mt8">15분 미니 모의고사</div><div class="xs muted">출퇴근길 실전 감각</div></a>
      <a class="card" href="#/drill?tab=patterns"><div style="font-size:26px">🧩</div><div class="h3 mt8">만능 패턴</div><div class="xs muted">어떤 주제든 뼈대 문장</div></a>
      <a class="card" href="#/drill?tab=pron"><div style="font-size:26px">👄</div><div class="h3 mt8">발음 교정</div><div class="xs muted">R/L · F/P · TH · 연음</div></a>
      <a class="card" href="#/topics"><div style="font-size:26px">📚</div><div class="h3 mt8">주제별 학습</div><div class="xs muted">${topics.length}개 주제 · IM3/IH/AL 답안</div></a>
    </div>

    ${lastMock ? raw(levelCard(lastMock, s.target)) : ''}
  `;

  root.querySelectorAll('[data-task]').forEach(el => {
    el.querySelector('.check').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const { planId, day, idx, min } = el.dataset;
      const nowDone = store.toggleTask(planId, Number(day), Number(idx), Number(min));
      el.classList.toggle('done', nowDone);
    });
  });
}

// 접수 안내 카드: 접수 마감 · 좌석 권장일 · 다음 응시 가능일
function examCard(x) {
  const r = x.registration;
  const state = !r.open ? { cls: 'bad', label: '접수 마감' }
    : r.closesIn === 0 ? { cls: 'bad', label: '오늘 자정 마감' }
    : r.closesIn <= 3 ? { cls: 'warn', label: `마감 D-${r.closesIn}` }
    : r.recommendIn < 0 ? { cls: 'warn', label: '좌석 조기 마감 주의' }
    : { cls: 'ok', label: '접수 가능' };

  const line = !r.open
    ? `이 날짜는 접수가 마감됐어요. 다음 응시 가능일은 <b>${fmtDate(x.nextOpen)}</b>입니다.`
    : `접수 <b>${fmtDate(r.closes)}</b>까지${r.closesIn > 0 ? ` (D-${r.closesIn})` : ' · 오늘 자정'}`;

  // 좌석 안내는 사용자가 직접 등록한 시험일에서만 의미가 있습니다
  // (자동 날짜는 늘 2~3일 뒤라 "권장일이 지났다" 가 항상 참이라 소음이 됩니다)
  const tip = x.source !== 'user' || !r.open ? ''
    : r.recommendIn >= 0 ? `좌석이 빨리 차니 ${fmtDate(r.recommend)}까지 접수하는 걸 권장해요.`
    : '지역별 좌석이 이미 마감됐을 수 있어요. 접수 화면에서 자리를 확인하세요.';

  const notes = [
    x.source === 'auto' ? 'OPIc은 일요일·공휴일을 뺀 연중 상시 시험입니다. 설정에서 시험일을 등록하면 그 날짜로 D-day를 셉니다.' : '',
    x.rolledOver ? '등록해 둔 시험일이 지나서 다음 응시 가능일로 넘어갔어요.' : '',
  ].filter(Boolean);

  return `<div class="card mt12">
    <div class="row between"><div class="xs muted">시험 접수</div><span class="badge ${state.cls}">${state.label}</span></div>
    <div class="small mt8">${line}</div>
    ${tip ? `<div class="xs muted mt8">${tip}</div>` : ''}
    ${notes.map(n => `<div class="xs muted mt8">${n}</div>`).join('')}
    ${x.stale ? `<div class="xs mt8" style="color:var(--bad)">공휴일 데이터가 ${x.coverageUntil || '미상'}까지만 있어 날짜가 정확하지 않을 수 있어요.</div>` : ''}
    <div class="btn-row mt12"><a class="btn sm" href="${r.url}" target="_blank" rel="noopener">접수하러 가기</a><a class="btn ghost sm" href="#/settings">시험일 변경</a></div>
  </div>`;
}

function todayMinutes() {
  const k = new Date().toISOString().slice(0, 10);
  return store.state.activity[k] || 0;
}

function taskRow(task, idx, done, meta, topicsById, planId, dayNo, carried = false, names = {}) {
  const info = taskTitle(task, meta, topicsById, names);
  const min = taskMinutes(task, meta);
  return `<a class="task ${done ? 'done' : ''}" href="${info.href}" data-task data-plan-id="${planId}" data-day="${dayNo}" data-idx="${idx}" data-min="${min}">
    <span class="check">${done ? '✓' : ''}</span>
    <div class="grow"><div class="t">${info.title}</div><div class="s">${carried ? `Day ${dayNo} · ` : ''}${info.sub} · ${min}분</div></div>
    <span class="chev">›</span></a>`;
}

function levelCard(mock, target) {
  const cur = levelIndex(mock.level), tgt = levelIndex(target);
  const gap = tgt - cur;
  const msg = gap <= 0 ? `목표 ${target}에 도달했어요. 이제 안정적으로 유지하는 훈련을 하세요.` : gap === 1 ? `목표까지 한 단계. 발화량과 연결어를 늘리면 충분히 넘습니다.` : `목표까지 ${gap}단계. 매일 섀도잉 + 직접 답변을 꾸준히 하면 좁혀집니다.`;
  return `<div class="card mt16"><div class="row between"><div><div class="xs muted">최근 추정 레벨</div><div class="h2" style="color:${levelColor(mock.level)}">${mock.level} <span class="small muted">/ 토스 ${mock.tos}</span></div></div><div class="ring">${ring(mock.score)}</div></div><p class="small ink2 mt8">${msg}</p></div>`;
}

export function ring(pct, color = 'var(--accent)') {
  const r = 36, c = 2 * Math.PI * r;
  return `<svg width="84" height="84" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg><div class="val">${pct}<small>점</small></div>`;
}
