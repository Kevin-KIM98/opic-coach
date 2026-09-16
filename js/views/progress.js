import { html, raw, levelColor, todayKey } from '../util.js';
import { store } from '../store.js';
import { data, TYPE_LABEL } from '../data.js';
import { LEVELS, levelIndex } from '../scoring.js';
import { currentPlan, planProgress } from '../plan.js';

export async function render(root) {
  const [{ plan }, topics] = await Promise.all([currentPlan(), data.topics()]);
  const st = store.state;
  const prog = planProgress(plan);
  const mocks = st.mocks.slice().reverse(); // 오래된 → 최근
  const practice = st.practice;
  const learned = store.learnedCount();
  const totalExpr = topics.reduce((a, t) => a + (t.expressions || []).length, 0);

  // 최근 14일 활동
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = todayKey(d); days.push({ k, min: st.activity[k] || 0 }); }
  const maxMin = Math.max(30, ...days.map(d => d.min));

  // 유형별 평균 (최근 30개 연습)
  const byType = {};
  practice.slice(0, 60).forEach(p => { if (p.level === '-') return; (byType[p.type] ||= []).push(p.score); });
  const typeRows = Object.entries(byType).map(([k, arr]) => [k, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), arr.length]).sort((a, b) => a[1] - b[1]);

  // 주제별 연습 현황
  const topicRows = topics.map(t => {
    const ps = practice.filter(p => p.topicId === t.id && p.level !== '-');
    const avg = ps.length ? Math.round(ps.reduce((a, b) => a + b.score, 0) / ps.length) : null;
    const lv = (t.expressions || []).filter((e, i) => store.exprInfo(`${t.id}#e${i}`).box >= 3).length;
    return { t, avg, n: ps.length, lv };
  });

  root.innerHTML = html`
    <header class="topbar"><div class="title">나의 기록</div><a class="icon-btn" href="#/settings">⚙️</a></header>
    <div class="stats">
      <div class="stat"><b>${store.streak()}🔥</b><span>연속 학습</span></div>
      <div class="stat"><b>${Math.round(store.totalMinutes())}분</b><span>총 학습 시간</span></div>
      <div class="stat"><b>${learned}/${totalExpr}</b><span>익힌 표현</span></div>
    </div>

    <div class="section-title">최근 14일</div>
    <div class="card"><div class="spark">${raw(days.map(d => `<i class="${d.min ? 'on' : ''}" style="height:${Math.max(6, d.min / maxMin * 100)}%" title="${d.k}: ${Math.round(d.min)}분"></i>`).join(''))}</div>
      <div class="row between xs muted mt8"><span>${days[0].k.slice(5)}</span><span>오늘</span></div></div>

    <div class="section-title">모의고사 추이</div>
    <div class="card">${mocks.length ? raw(`<div class="spark">${mocks.slice(-12).map(m => `<i class="t" style="height:${Math.max(6, m.score)}%" title="${m.level} ${m.score}"></i>`).join('')}</div>
      <div class="row between mt8 small"><span class="muted">${mocks.length}회 응시</span><span>최근 <b style="color:${levelColor(st.mocks[0].level)}">${st.mocks[0].level}</b> · 최고 <b>${Math.max(...mocks.map(m => m.score))}점</b></span></div>
      <div class="mt12">${levelLadder(st.mocks[0].level, store.settings.target)}</div>`) : '<div class="empty">아직 모의고사 기록이 없어요.<br><a class="btn primary sm mt12" href="#/mock">첫 모의고사 보기</a></div>'}</div>

    ${typeRows.length ? raw(`<div class="section-title">유형별 평균 (낮은 순)</div><div class="card parts">${typeRows.map(([k, v, n]) => `<div class="p"><span class="muted xs">${TYPE_LABEL[k] || k}</span><div class="bar"><i style="width:${v}%;background:${v >= 63 ? 'var(--teal)' : 'var(--accent)'}"></i></div><b>${v}</b></div>`).join('')}</div>`) : ''}

    <div class="section-title">주제별 현황</div>
    <div class="list">${raw(topicRows.map(({ t, avg, n, lv }) => `<a class="list-row" href="#/topic/${t.id}"><div class="emoji">${t.emoji}</div><div class="grow"><div class="t">${t.title}</div><div class="s">표현 ${lv}/${(t.expressions || []).length} · 답변 연습 ${n}회${avg != null ? ` · 평균 ${avg}점` : ''}</div></div>${avg != null ? `<b style="color:${avg >= 63 ? 'var(--teal)' : 'var(--accent)'}">${avg}</b>` : '<span class="chev">›</span>'}</a>`).join(''))}</div>

    <div class="section-title">과정 진행</div>
    <div class="card"><div class="row between small"><span>${plan.title}</span><b>${prog.done}/${prog.total} 과제</b></div><div class="bar mt8"><i style="width:${prog.pct}%"></i></div><a class="btn ghost block mt12" href="#/plan">전체 일정 보기</a></div>`;
}

function levelLadder(cur, target) {
  const ci = levelIndex(cur), ti = levelIndex(target);
  return `<div class="row" style="gap:4px">${LEVELS.map((l, i) => `<div style="flex:1;text-align:center"><div style="height:6px;border-radius:3px;background:${i <= ci ? levelColor(l.level) : 'var(--surface-2)'};${i === ti ? 'outline:2px solid var(--ink);outline-offset:2px' : ''}"></div><div class="xs muted mt8" style="font-size:10px">${l.level}</div></div>`).join('')}</div><div class="xs muted mt8">테두리 = 목표 등급</div>`;
}
