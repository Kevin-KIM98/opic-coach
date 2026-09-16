import { html, raw, fmtDate, todayKey } from '../util.js';
import { store } from '../store.js';
import { data } from '../data.js';
import { currentPlan, dayIndexFor, taskTitle, taskMinutes, planProgress, taskNames } from '../plan.js';
import { header } from '../app.js';
import { githubEditUrl } from '../config.js';

export async function render(root, route) {
  const [{ plan, meta }, topics, names] = await Promise.all([currentPlan(), data.topics(), taskNames()]);
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const todayNo = dayIndexFor(plan);
  const week = Number(route.query.week) || Math.ceil(todayNo / 7);
  const prog = planProgress(plan);
  const weekDays = plan.days.filter(d => d.week === week);
  const start = new Date(store.settings.planStart || todayKey());
  const dateOf = (dayNo) => { const d = new Date(start); d.setDate(d.getDate() + dayNo - 1); return d; };
  const wd = ['일', '월', '화', '수', '목', '금', '토'];

  root.innerHTML = html`
    ${raw(header('학습 일정', { right: `<a class="icon-btn" href="#/settings">⚙️</a>` }))}
    <div class="card"><div class="row between"><div><div class="h3">${plan.title}</div><div class="xs muted">${plan.desc}</div></div></div>
      <div class="row between small mt12"><span>하루 약 ${plan.dailyMinutes}분 · 시작 ${fmtDate(store.settings.planStart)}</span><b>${prog.pct}%</b></div><div class="bar mt8"><i style="width:${prog.pct}%"></i></div></div>
    <div class="chips mt12">${raw(plan.weekMeta.map(w => `<a class="chip ${w.week === week ? 'active' : ''}" href="#/plan?week=${w.week}">${w.week}주 ${w.week === Math.ceil(todayNo / 7) ? '•' : ''}</a>`).join(''))}</div>
    <div class="section-title">${week}주차 · ${plan.weekMeta.find(w => w.week === week)?.title || ''}</div>
    <div class="stack">${raw(weekDays.map(d => {
      const done = store.doneTasks(plan.id, d.day);
      const dt = dateOf(d.day);
      const isToday = d.day === todayNo;
      const allDone = done.length >= d.tasks.length;
      return `<div class="card ${isToday ? '' : 'soft'}" style="padding:14px">
        <div class="row between mb8"><div class="small"><b>Day ${d.day}</b> <span class="muted">· ${dt.getMonth() + 1}/${dt.getDate()} (${wd[dt.getDay()]})</span> ${isToday ? '<span class="badge IM">오늘</span>' : ''}</div><span class="xs muted">${allDone ? '✅ 완료' : `${done.length}/${d.tasks.length}`} · ${d.tasks.reduce((a, t) => a + taskMinutes(t, meta), 0)}분</span></div>
        <div class="list" style="gap:6px">${d.tasks.map((t, i) => { const info = taskTitle(t, meta, byId, names); const ok = done.includes(i); return `<a class="task ${ok ? 'done' : ''}" style="padding:8px 10px;box-shadow:none;background:${isToday ? 'var(--surface-2)' : 'var(--surface)'}" href="${info.href}" data-task data-day="${d.day}" data-idx="${i}" data-min="${taskMinutes(t, meta)}"><span class="check" style="width:22px;height:22px;font-size:12px">${ok ? '✓' : ''}</span><div class="grow"><div class="t" style="font-size:13px">${info.title}</div></div></a>`; }).join('')}</div></div>`;
    }).join(''))}</div>
    <div class="card soft mt16 small ink2"><b>일정 규칙</b><ul style="padding-left:18px;margin:6px 0 0"><li>하루 과제를 못 끝내면 홈의 '밀린 과제'에 3일간 표시됩니다.</li><li>시험일이 바뀌면 설정에서 과정(4·8·12주)과 시작일을 바꾸세요. 완료 기록은 유지됩니다.</li><li>일정 자체를 바꾸려면 <a href="${githubEditUrl('data/plans.json')}" target="_blank" rel="noopener" style="text-decoration:underline">plans.json</a>을 수정하거나 <code>tools/gen_plans.py</code>를 고쳐 재생성하세요.</li></ul></div>`;

  root.querySelectorAll('[data-task] .check').forEach(c => c.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = c.closest('[data-task]');
    const nowDone = store.toggleTask(plan.id, Number(el.dataset.day), Number(el.dataset.idx), Number(el.dataset.min));
    el.classList.toggle('done', nowDone);
  }));
}
