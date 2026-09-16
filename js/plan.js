// 학습 일정 로직: 현재 플랜, 오늘의 Day, 밀린 과제 이월, 진행률
import { data } from './data.js';
import { store } from './store.js';
import { todayKey, daysBetween } from './util.js';

export async function currentPlan() {
  const plans = await data.plans();
  const id = store.settings.plan || '8w';
  return { plan: plans.plans.find(p => p.id === id) || plans.plans[1], meta: plans };
}

// 플랜 시작일 기준 오늘이 몇 번째 Day 인지 (1부터). 범위를 넘으면 마지막 날.
export function dayIndexFor(plan, dateKey = todayKey()) {
  const start = store.settings.planStart || todayKey();
  const diff = daysBetween(start, dateKey);
  return Math.max(1, Math.min(plan.days.length, diff + 1));
}

export function planDay(plan, dayNo) {
  return plan.days[Math.max(0, Math.min(plan.days.length, dayNo) - 1)];
}

export function taskTitle(task, meta, topicsById, names = {}) {
  const tt = meta.taskTypes[task.type] || { title: task.type };
  const topic = task.topic ? topicsById?.[task.topic] : null;
  const name = topic ? `${topic.emoji} ${topic.title}` : task.topic || '';
  switch (task.type) {
    case 'learn': return { title: `${name} 표현 학습`, sub: tt.desc, href: `#/topic/${task.topic}?tab=expr` };
    case 'shadow': return { title: `${name} 섀도잉 (${task.level || 'IM3'})`, sub: tt.desc, href: `#/topic/${task.topic}?tab=q&level=${task.level || 'IM3'}` };
    case 'speak': return { title: `${name} 직접 답변`, sub: tt.desc, href: `#/topic/${task.topic}?tab=q&mode=speak` };
    case 'pattern': return { title: `만능 패턴 · ${names[task.group] || task.group}`, sub: tt.desc, href: `#/drill?tab=patterns&group=${task.group}` };
    case 'pron': return { title: `발음 훈련 · ${names[task.set] || task.set}`, sub: tt.desc, href: `#/drill?tab=pron&set=${task.set}` };
    case 'mock': return { title: `모의고사 · ${task.set}`, sub: tt.desc, href: `#/mock/run/${task.set}` };
    case 'review': return { title: '복습 (간격 반복)', sub: tt.desc, href: '#/review' };
    default: return { title: tt.title, sub: tt.desc, href: '#/home' };
  }
}

export async function taskNames() {
  const [p, pr] = await Promise.all([data.patterns(), data.pronunciation()]);
  const names = {};
  p.groups.forEach(g => { names[g.id] = g.title; });
  pr.sets.forEach(s => { names[s.id] = s.title; });
  return names;
}

export function taskMinutes(task, meta) { return meta.taskTypes[task.type]?.minutes || 10; }

// 이월: 오늘 이전 날들 중 미완료 과제 (최근 3일까지만)
export function carriedOver(plan, todayNo) {
  const out = [];
  for (let d = Math.max(1, todayNo - 3); d < todayNo; d++) {
    const day = planDay(plan, d);
    const done = store.doneTasks(plan.id, d);
    day.tasks.forEach((t, i) => { if (!done.includes(i) && t.type !== 'review') out.push({ day: d, idx: i, task: t }); });
  }
  return out.slice(0, 4);
}

export function planProgress(plan) {
  let total = 0, done = 0;
  for (const day of plan.days) { total += day.tasks.length; done += store.doneTasks(plan.id, day.day).length; }
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

export function examCountdown() {
  const ex = store.settings.examDate;
  if (!ex) return null;
  return daysBetween(todayKey(), ex);
}
