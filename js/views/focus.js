// 집중 학습: 목표 등급까지 가장 빠른 길 — Background Survey 추천 조합 + 좁힌 주제 + 달성 체크리스트.
// 주제별 전체 학습(#/topics)은 그대로 두고, 여기서는 "무엇만 하면 되는지" 만 보여 줍니다.
import { html, raw } from '../util.js';
import { data } from '../data.js';
import { store } from '../store.js';
import { header } from '../app.js';

export async function render(root) {
  const [focus, topics, patterns, pron] = await Promise.all([
    data.focus(), data.topics(), data.patterns(), data.pronunciation(),
  ]);
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const target = store.settings.target || 'IM3';
  const track = focus.tracks.find(t => t.level === target) || focus.tracks[0];

  const draw = () => {
    root.innerHTML = html`
      ${raw(header('집중 학습'))}

      <div class="card accent">
        <div class="xs" style="opacity:.75">목표 ${target} · 최단 코스</div>
        <div class="h2 mt8">${track.days}일 · 하루 ${track.minutesPerDay}분</div>
        <p class="small mt8" style="opacity:.85">${track.summary}</p>
      </div>
      <p class="xs muted mt8">목표 등급은 설정에서 바꿀 수 있고, 바꾸면 이 구성도 함께 바뀝니다.</p>

      <div class="section-title">1. 서베이 이렇게 고르세요</div>
      <p class="small ink2 mb12">${focus.intro}</p>
      <div class="card soft">
        <div class="row between"><b class="small">난이도 선택</b><span class="badge ok">${focus.difficulty.recommend}</span></div>
        <p class="xs muted mt8">${focus.difficulty.note}</p>
      </div>
      ${raw(focus.survey.map(surveyGroup).join(''))}

      <div class="card soft mt12">
        <div class="row between"><b class="small">${focus.always.title}</b><span class="xs muted">${focus.always.topics.length}개</span></div>
        <p class="xs muted mt8">${focus.always.note}</p>
        <div class="chips mt8" style="flex-wrap:wrap">${raw(focus.always.topics.map(id =>
          `<a class="chip" href="#/topic/${id}">${byId[id]?.emoji || '📘'} ${byId[id]?.title || id}</a>`).join(''))}</div>
      </div>

      <div class="section-title">2. 이 주제만 하세요 (${track.topics.length}개)</div>
      <p class="small ink2 mb12">전체 ${topics.length}개 주제 중 ${track.topics.length}개입니다. 여기부터 끝내고 시간이 남으면 나머지를 보세요.</p>
      <div class="list">${raw(track.topics.map(id => topicRow(byId[id], id)).join(''))}</div>

      <div class="section-title">3. 같이 해야 하는 패턴 · 발음</div>
      <div class="list">
        ${raw(track.patterns.map(id => {
          const g = patterns.groups.find(x => x.id === id);
          return drillRow(`#/drill?tab=patterns&group=${id}`, '🧩', g?.title || id, g?.desc || '');
        }).join(''))}
        ${raw(track.pron.map(id => {
          const s = pron.sets.find(x => x.id === id);
          return drillRow(`#/drill?tab=pron&set=${id}`, '👄', s?.title || id, (s?.tip || '').slice(0, 44));
        }).join(''))}
      </div>

      <div class="section-title">4. ${target} 달성 조건</div>
      <p class="small ink2 mb12">모의고사 점수보다 이 목록이 먼저입니다. 전부 체크되면 실전에서 ${target}가 나올 준비가 된 겁니다.</p>
      <div class="card stack">
        ${raw(track.checklist.map((text, i) => {
          const key = `${track.level}#${i}`;
          const done = store.isFocusChecked(key);
          return `<button class="checkrow ${done ? 'done' : ''}" data-check="${key}">
            <span class="check">${done ? '✓' : ''}</span><span class="grow small">${text}</span></button>`;
        }).join(''))}
        <div class="bar teal mt8"><i style="width:${checkedPct(track)}%"></i></div>
        <div class="xs muted center">${countChecked(track)} / ${track.checklist.length} 완료</div>
      </div>

      <a class="btn primary block mt16" href="#/mock/run/opic-mini">준비됐는지 미니 모의고사로 확인 →</a>
      <a class="btn ghost block mt8" href="#/topics">전체 주제 보기</a>`;

    root.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => {
      store.toggleFocusCheck(b.dataset.check);
      draw();
    }));
    root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      store.toggleSurveyPick(b.dataset.pick);
      draw();
    }));
  };

  const countChecked = (t) => t.checklist.filter((_, i) => store.isFocusChecked(`${t.level}#${i}`)).length;
  const checkedPct = (t) => Math.round(countChecked(t) / t.checklist.length * 100);

  function surveyGroup(g) {
    return `<div class="card mt12">
      <div class="row between"><b class="small">${g.title}</b><span class="xs muted">${g.min}</span></div>
      <div class="stack mt12">${g.pick.map(p => {
        const on = store.isSurveyPicked(p.label);
        // 체크(선택 기록)와 주제 열기는 다른 동작이므로 버튼과 링크를 나란히 둔다
        return `<div class="pickrow">
          <button class="checkrow grow ${on ? 'done' : ''}" data-pick="${encodeURIComponent(p.label)}">
            <span class="check">${on ? '✓' : ''}</span>
            <span class="grow"><span class="small" style="font-weight:700">${p.label}</span>
              <span class="xs muted" style="display:block;margin-top:2px">${p.why}</span></span>
          </button>
          ${p.topic ? `<a class="chip" href="#/topic/${p.topic}" title="${byId[p.topic]?.title || p.topic} 학습">학습 →</a>` : ''}
        </div>`;
      }).join('')}</div>
      ${g.avoid.length ? `<div class="mt12"><div class="xs muted mb8">피하세요</div>${g.avoid.map(a =>
        `<div class="avoid"><span>✕</span><span><b>${a.label}</b><span class="xs muted" style="display:block">${a.why}</span></span></div>`).join('')}</div>` : ''}
    </div>`;
  }

  function topicRow(t, id) {
    if (!t) return '';
    const exprs = t.expressions || [];
    const learned = exprs.filter((e, i) => store.exprInfo(`${id}#e${i}`).box >= 3).length;
    const practiced = store.state.practice.filter(p => p.topicId === id).length;
    return `<a class="list-row" href="#/topic/${id}"><div class="emoji">${t.emoji || '📘'}</div>
      <div class="grow"><div class="t">${t.title}</div>
        <div class="s">표현 ${learned}/${exprs.length} · 답변 연습 ${practiced}회</div>
        <div class="bar teal mt8" style="height:5px"><i style="width:${exprs.length ? learned / exprs.length * 100 : 0}%"></i></div></div>
      <span class="chev">›</span></a>`;
  }

  function drillRow(href, emoji, title, sub) {
    return `<a class="list-row" href="${href}"><div class="emoji">${emoji}</div>
      <div class="grow"><div class="t">${title}</div><div class="s">${sub}</div></div><span class="chev">›</span></a>`;
  }

  draw();
}
