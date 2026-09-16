import { html, raw, fmtDate, levelColor } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { currentPlan, dayIndexFor, planDay, taskTitle, taskMinutes, carriedOver, planProgress, examCountdown, taskNames } from '../plan.js';
import { aggregateMock, levelIndex } from '../scoring.js';

export async function render(root) {
  const [{ plan, meta }, topics, names] = await Promise.all([currentPlan(), data.topics(), taskNames()]);
  const topicsById = Object.fromEntries(topics.map(t => [t.id, t]));
  const s = store.settings;
  const todayNo = dayIndexFor(plan);
  const day = planDay(plan, todayNo);
  const done = store.doneTasks(plan.id, todayNo);
  const carried = carriedOver(plan, todayNo);
  const prog = planProgress(plan);
  const dday = examCountdown();
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
      <div class="big">${dday != null ? (dday >= 0 ? `D-${dday || 'day'}` : `D+${-dday}`) : `Day ${todayNo}`}</div>
      <div class="sub">목표 <b>${s.target}</b>${dday != null ? ` · 시험일 ${fmtDate(s.examDate)}` : ' · 설정에서 시험일을 등록하세요'} · ${plan.title} ${Math.ceil(todayNo / 7)}주차</div>
      <div class="row mt16" style="gap:8px">
        ${lastMock ? raw(`<span class="chip" style="background:rgba(255,255,255,.14);color:#fff">최근 모의고사 ${lastMock.level} (${lastMock.score}점)</span>`) : raw(`<a class="chip" href="#/mock" style="background:rgba(255,255,255,.14);color:#fff">첫 모의고사로 현재 레벨 확인 →</a>`)}
      </div>
    </section>

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
