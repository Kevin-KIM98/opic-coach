import { html, raw, toast } from '../util.js';
import { store } from '../store.js';
import { speak, stopSpeaking } from '../speech.js';
import { quickCheck } from './topic.js';

// 말하기 퀴즈: 한국어 뜻 → 영어로 말하기 → 일치율 80% 이상이면 "알아요"
export function speakQuiz(body, cards, onExit) {
  const due = new Set(store.dueExprs());
  const rank = (c) => { const inf = store.exprInfo(c.id); return due.has(c.id) ? 0 : inf.box === 0 ? 1 : 2 + inf.box; };
  const deck = cards.slice().sort((a, b) => rank(a) - rank(b) || a.no - b.no);
  let i = 0, right = 0, tried = 0, busy = false;
  const trail = [];   // '이전'은 바로 직전에 푼 문제로만
  const draw = () => {
    const c = deck[i];
    const frame = c.pattern || c.en;
    const target = frame.replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();   // 빈칸은 내 주제로 채우면 되므로 채점에서 뺀다
    const hint = frame.split(/\s+/).slice(0, 2).join(' ') + ' …';
    body.innerHTML = html`
      <div class="flash">
        <span class="badge lvl ${c.level || 'IM'}">${c.level || 'IM'}</span>
        <span class="idx">${i + 1} / ${deck.length} · 상자 ${store.exprInfo(c.id).box}</span>
        <div class="xs muted">${c.no}번 · ${c.group}</div>
        <div class="en" style="font-size:19px">${c.ko}</div>
        <div class="ko hidden" data-hint>힌트: ${hint}</div>
        ${c.pattern ? raw('<div class="xs muted">빈칸(___)은 아무 주제로나 채워서 말하세요</div>') : ''}
        <div class="ko hidden" data-ans><b>${frame}</b><br>예) ${c.en}</div>
        <div class="xs" data-result></div>
      </div>
      <div class="btn-row mt12"><button class="btn primary" data-speak>🎙️ 영어로 말하기</button></div>
      <div class="btn-row mt8"><button class="btn ghost" data-hint-btn>💡 힌트</button><button class="btn ghost" data-show>정답 보기</button></div>
      <div class="btn-row mt8"><button class="btn ghost" data-prev ${trail.length ? '' : 'disabled'}>‹ 이전</button><button class="btn ghost" data-exit>목록으로</button><button class="btn ghost" data-next>다음 ›</button></div>
      <p class="xs muted center mt12">${tried ? `이번 퀴즈 ${right} / ${tried} 통과` : '일치율 80% 이상이면 통과 · 정답을 먼저 보면 "아직 몰라요"로 기록돼요'}</p>`;
    const $res = body.querySelector('[data-result]');
    const reveal = () => { body.querySelector('[data-ans]').classList.remove('hidden'); speak(c.en); };
    body.querySelector('[data-hint-btn]').addEventListener('click', () => body.querySelector('[data-hint]').classList.remove('hidden'));
    body.querySelector('[data-show]').addEventListener('click', () => { if (!busy) { store.rateExpr(c.id, false); reveal(); } });
    body.querySelector('[data-next]').addEventListener('click', next);
    body.querySelector('[data-prev]').addEventListener('click', () => { if (busy || !trail.length) return; stopSpeaking(); i = trail.pop(); draw(); });
    body.querySelector('[data-exit]').addEventListener('click', () => { stopSpeaking(); onExit(); });
    const $sp = body.querySelector('[data-speak]');
    $sp.addEventListener('click', async () => {
      if (busy) return;
      busy = true; stopSpeaking();
      const score = await quickCheck($sp, target, $res, { listenText: c.en });
      busy = false; $sp.textContent = '🎙️ 다시 말하기';
      if (score == null) return;           // 인식 실패: 채점하지 않음
      tried++; if (score >= 80) right++;
      store.rateExpr(c.id, score >= 80);
      reveal();
    });
  };
  const next = () => { stopSpeaking(); trail.push(i); if (i + 1 >= deck.length) { toast(`퀴즈 한 바퀴 완료! ${right}/${tried} 통과 🎉`); i = 0; } else i++; draw(); };
  draw();
  return { stop: () => stopSpeaking(), destroy: () => stopSpeaking() };
}
