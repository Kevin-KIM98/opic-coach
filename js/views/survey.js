import { html, raw, todayKey, fmtDate, toast } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';
import { header } from '../app.js';

// Background Survey 체크: 시험에서 실제로 고른 항목을 시험일별로 저장한다.
// 4~7번(여가·취미·운동·휴가)은 합쳐서 12개 이상 골라야 한다.
export async function render(root, route) {
  const [survey, topics] = await Promise.all([data.survey(), data.topics()]);
  const topicById = Object.fromEntries(topics.map(t => [t.id, t]));
  const saved = store.state.surveys || {};
  let date = route.query.date || Object.keys(saved).sort().pop() || store.settings.examDate || todayKey();

  const draw = () => {
    const picks = new Set(store.surveyPicks(date));
    const counted = survey.questions.filter(q => q.count);
    const total = counted.reduce((n, q) => n + q.options.filter(o => picks.has(o.id)).length, 0);
    const linked = [...new Set(survey.questions.flatMap(q => q.options.filter(o => picks.has(o.id) && o.topic).map(o => o.topic)))].filter(id => topicById[id]);
    const missing = counted.flatMap(q => q.options.filter(o => picks.has(o.id) && !o.topic));
    const dates = Object.keys(store.state.surveys || {}).sort().reverse();

    root.innerHTML = html`
      ${raw(header('서베이 체크'))}
      <div class="card">
        <div class="field"><label for="sdate">시험일</label><input id="sdate" type="date" value="${date}"></div>
        ${dates.length > 1 ? raw(`<div class="chips mt12">${dates.map(d => `<button class="chip ${d === date ? 'active' : ''}" data-date="${d}">${fmtDate(d)}</button>`).join('')}</div>`) : ''}
        <p class="xs muted mt12">${survey.desc}</p>
      </div>

      <div class="card soft mt12 survey-total">
        <div class="row between"><b>4~7번 선택</b><span class="badge ${total >= survey.minTotal ? 'ok' : 'warn'}">${total} / ${survey.minTotal}개 이상</span></div>
        <div class="bar teal mt8" style="height:6px"><i style="width:${Math.min(100, total / survey.minTotal * 100)}%"></i></div>
      </div>

      ${raw(survey.questions.map(q => questionBlock(q, picks, topicById)).join(''))}

      <div class="section-title">선택한 주제로 연습하기</div>
      ${linked.length ? raw(`<div class="list">${linked.map(id => { const t = topicById[id]; return `<a class="list-row" href="#/topic/${t.id}"><div class="emoji">${t.emoji || '📘'}</div><div class="grow"><div class="t">${t.title}</div><div class="s">${t.titleEn || ''}</div></div><span class="chev">›</span></a>`; }).join('')}</div>`) : raw('<p class="small muted">체크한 항목 중 앱에 연습 주제가 있는 것이 여기에 모입니다.</p>')}
      ${missing.length ? raw(`<p class="xs muted mt12">앱에 아직 주제가 없는 항목: ${missing.map(o => o.label).join(' · ')}</p>`) : ''}

      <div class="btn-row mt16">
        <button class="btn" id="copy">📋 선택 내용 복사</button>
        <button class="btn ghost" id="clear">선택 지우기</button>
      </div>
    `;

    root.querySelector('#sdate').addEventListener('change', e => { if (e.target.value) { date = e.target.value; draw(); } });
    root.querySelectorAll('[data-date]').forEach(b => b.addEventListener('click', () => { date = b.dataset.date; draw(); }));
    root.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      const q = survey.questions.find(x => x.id === b.dataset.q);
      const next = new Set(picks);
      if (next.has(b.dataset.opt)) next.delete(b.dataset.opt);
      else {
        if (q.type === 'single') q.options.forEach(o => next.delete(o.id));
        next.add(b.dataset.opt);
      }
      store.setSurveyPicks(date, [...next]);
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }));
    root.querySelector('#copy').addEventListener('click', async () => {
      const text = summaryText(survey, picks, date);
      try { await navigator.clipboard.writeText(text); toast('선택 내용을 복사했어요'); }
      catch { prompt('아래 내용을 복사하세요', text); }
    });
    root.querySelector('#clear').addEventListener('click', () => {
      if (picks.size && !confirm(`${fmtDate(date)} 서베이 선택을 지울까요?`)) return;
      store.setSurveyPicks(date, []);
      draw();
    });
  };
  draw();
}

function questionBlock(q, picks, topicById) {
  const n = q.options.filter(o => picks.has(o.id)).length;
  const need = q.min && n < q.min ? `<span class="badge warn">${q.min}개 이상</span>` : q.type === 'multi' ? `<span class="badge ok">${n}개</span>` : '';
  return `<div class="section-title row between"><span>${q.no}. ${q.q}</span>${need}</div>
    <div class="list survey-opts">${q.options.map(o => {
      const on = picks.has(o.id);
      const t = o.topic && topicById[o.topic];
      return `<button class="task ${on ? 'on' : ''}" role="${q.type === 'single' ? 'radio' : 'checkbox'}" aria-checked="${on}" data-q="${q.id}" data-opt="${o.id}">
        <span class="check ${q.type === 'single' ? 'round' : ''}">${on ? '✓' : ''}</span>
        <span class="grow t">${o.label}</span>${t ? `<span class="xs muted">${t.emoji || '📚'} 연습</span>` : ''}</button>`;
    }).join('')}</div>`;
}

export function summaryText(survey, picks, date) {
  const lines = [`OPIc 서베이 (${date})`];
  for (const q of survey.questions) {
    const sel = q.options.filter(o => picks.has(o.id)).map(o => o.label);
    if (sel.length) lines.push(`${q.no}. ${sel.join(', ')}`);
  }
  return lines.join('\n');
}
