// 자동 반복 재생: 문장 목록을 순서대로, 각 문장을 설정한 횟수만큼 읽어 줍니다.
// 🔁 켜져 있으면 목록 끝까지 간 뒤 처음부터 다시 — 멈출 때까지 계속 반복합니다(기본값).
// 버튼을 매번 누르지 않아도 듣고 → 따라 말하기를 반복할 수 있게 하는 것이 목적입니다.
// 재생 중에는 화면이 꺼지지 않도록 wake lock 을 잡고, 🌙 화면 어둡게(dim.js)로 화면을 끈 것처럼 둘 수 있습니다.
// 이어폰을 빼면 멈춥니다 (background.js).
import { speak, stopSpeaking, support } from './speech.js';
import { store } from './store.js';
import { keepAwake, wakeLockSupported } from './wake-lock.js';
import { startBackground, nowPlaying, stopReasonText } from './background.js';
import { holdDim } from './dim.js';

const REPEATS = [1, 2, 3, 5];
const GAPS = [0, 0.8, 1.5, 2.5];

export const repeatCount = () => store.settings.repeatCount ?? 2;
export const repeatGap = () => store.settings.repeatGap ?? 1.5;
export const cycleRepeat = () => store.setSetting('repeatCount', REPEATS[(REPEATS.indexOf(repeatCount()) + 1) % REPEATS.length]);
export const cycleGap = () => store.setSetting('repeatGap', GAPS[(GAPS.indexOf(repeatGap()) + 1) % GAPS.length]);
export const gapLabel = () => (repeatGap() ? `간격 ${repeatGap()}초` : '간격 없음');

// 🔁 계속 반복: 멈추기 전까지 처음부터 다시 재생한다.
export const repeatLoop = () => store.settings.repeatLoop ?? true;
export const toggleLoop = () => store.setSetting('repeatLoop', !repeatLoop());
export const loopLabel = () => (repeatLoop() ? '🔁 계속' : '🔂 한 번');

/**
 * 반복 재생 엔진. 한 번에 하나의 재생만 살아 있고, stop() 하면 남은 대기까지 즉시 끊습니다.
 */
export function createSequencePlayer() {
  let token = 0;          // 세대 번호 — 늘어나면 진행 중인 루프는 스스로 빠져나온다
  let release = null;     // wake lock 해제
  let releaseBg = null;   // 백그라운드 재생 해제
  let releaseDim = null;  // 🌙 화면 어둡게 버튼 해제
  let cancelWait = null;
  let playing = false;

  const wait = (sec) => new Promise(res => {
    if (!sec) return res();
    const finish = () => { clearTimeout(timer); cancelWait = null; res(); };
    const timer = setTimeout(finish, sec * 1000);
    cancelWait = finish;
  });

  function stop() {
    token++;
    playing = false;
    stopSpeaking();
    cancelWait?.();
    release?.(); release = null;
    releaseBg?.(); releaseBg = null;
    releaseDim?.(); releaseDim = null;
  }

  /**
   * @param {Function|Array<string|{text:string, once?:boolean}>} texts 문장 배열 또는 매번 새로 계산할 함수
   * @param {object} opts {rate, loop, onItem(i, total), onEnd(completed), onInterrupt(message)}
   *   onInterrupt: 이어폰 분리 · 잠금 화면 ⏸ 등으로 밖에서 멈췄을 때 (없으면 onEnd(false))
   */
  async function run(texts, opts = {}) {
    if (!support.tts) return;
    stop();
    const my = ++token;
    playing = true;
    release = keepAwake();
    releaseDim = holdDim();
    releaseBg = startBackground({
      onStop: (reason) => {
        if (!live()) return;
        releaseBg = null;
        stop();
        if (opts.onInterrupt) opts.onInterrupt(stopReasonText(reason)); else opts.onEnd?.(false);
      },
    });
    const list = () => (typeof texts === 'function' ? texts() : texts);
    const live = () => my === token;

    do {
      const items = list();
      if (!items.length) break;
      for (let i = 0; i < items.length; i++) {
        if (!live()) return;
        opts.onItem?.(i, items.length);
        // 항목은 문장 또는 {text, once} — once 면 반복 횟수와 상관없이 한 번만 읽는다 (예: 질문)
        const text = typeof items[i] === 'string' ? items[i] : items[i].text;
        const n = items[i].once ? 1 : repeatCount();
        for (let r = 0; r < n; r++) {
          if (!live()) return;
          nowPlaying(text);
          const ok = await speak(text, { rate: opts.rate });
          if (!live()) return;
          if (!ok) { stop(); return; }                       // TTS 실패 시 무한 루프 방지
          const last = r === n - 1 && i === items.length - 1;
          if (!last || opts.loop) await wait(repeatGap());
        }
      }
    } while (opts.loop && live());
    if (live()) { opts.onEnd?.(true); stop(); }
  }

  return { run, stop, get playing() { return playing; } };
}

/**
 * 목록 화면용 자동 재생 컨트롤 바. scope 안의 [data-say] 를 순서대로 읽습니다.
 * @param {HTMLElement} mount 컨트롤 바를 넣을 자리
 * @param {HTMLElement} scope [data-say] 를 찾을 범위
 */
export function createAutoPlay(mount, scope, opts = {}) {
  if (!support.tts || !mount || !scope) return { stop() {}, destroy() {} };

  const player = createSequencePlayer();
  const rows = () => [...scope.querySelectorAll('[data-say]')]
    .filter(el => !el.hasAttribute('data-slow') && !el.closest('.hidden'));

  mount.className = 'autoplay';
  mount.innerHTML = `
    <div class="row between">
      <button class="btn primary sm" data-toggle>▶ 자동 재생</button>
      <div class="row" style="gap:6px">
        <button class="chip" data-loop title="멈출 때까지 처음부터 계속 반복">🔁</button>
        <button class="chip" data-repeat title="한 항목을 몇 번 읽을지">반복 —</button>
        <button class="chip" data-gap title="따라 말할 시간">간격 —</button>
      </div>
    </div>
    <div class="xs muted mt8" data-status></div>`;

  const $toggle = mount.querySelector('[data-toggle]');
  const $loop = mount.querySelector('[data-loop]');
  const $repeat = mount.querySelector('[data-repeat]');
  const $gap = mount.querySelector('[data-gap]');
  const $status = mount.querySelector('[data-status]');

  const drawSettings = () => {
    $loop.textContent = loopLabel();
    $loop.classList.toggle('active', repeatLoop());
    $repeat.textContent = `반복 ${repeatCount()}회`;
    $gap.textContent = gapLabel();
  };

  const clearHighlight = () => scope.querySelectorAll('.saying').forEach(x => x.classList.remove('saying'));

  function highlight(el) {
    clearHighlight();
    const row = el.closest('.expr, .pair, .list-row, .flash') || el;
    row.classList.add('saying');
    // 이미 잘 보이는 항목은 스크롤하지 않는다 — 계속 스크롤하면 멈춤 버튼을 누르기 어렵다
    const r = row.getBoundingClientRect();
    if (r.top < mount.getBoundingClientRect().bottom || r.bottom > window.innerHeight - 72) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function idle(msg) {
    $toggle.textContent = '▶ 자동 재생';
    $toggle.classList.remove('on');
    mount.classList.remove('on');
    clearHighlight();
    $status.textContent = msg ?? '재생 중에는 화면이 꺼지지 않아요. 🌙 화면 어둡게로 끈 것처럼 두고 들을 수 있어요 · 이어폰을 빼면 멈춰요.';
  }

  function start() {
    if (!rows().length) { idle('읽을 항목이 없어요.'); return; }
    $toggle.textContent = '⏸ 멈춤';
    $toggle.classList.add('on');
    mount.classList.add('on');
    player.run(() => rows().map(el => decodeURIComponent(el.dataset.say)), {
      rate: opts.rate,
      loop: repeatLoop(),
      onItem: (i, total) => {
        const el = rows()[i];
        if (el) highlight(el);
        $status.textContent = `${i + 1} / ${total} · ${decodeURIComponent(el?.dataset.say || '').slice(0, 40)}`;
        if (i === 0) store.logActivity(0.5);
      },
      onEnd: () => idle('한 바퀴 다 읽었어요. 🔁 을 켜면 멈출 때까지 계속 반복해요.'),
      onInterrupt: (msg) => idle(msg),
    });
  }

  function stop(msg) { player.stop(); idle(msg); }

  $toggle.addEventListener('click', () => (player.playing ? stop() : start()));
  // 재생 중에 🔁 을 바꾸면 바로 반영되도록 다시 시작한다
  $loop.addEventListener('click', () => { toggleLoop(); drawSettings(); if (player.playing) start(); });
  $repeat.addEventListener('click', () => { cycleRepeat(); drawSettings(); });
  $gap.addEventListener('click', () => { cycleGap(); drawSettings(); });

  // 개별 🔊 버튼을 누르면 자동 재생은 비켜 준다
  scope.addEventListener('click', (e) => {
    if (player.playing && e.target.closest('[data-say]')) stop('직접 재생해서 자동 재생을 멈췄어요.');
  }, true);

  drawSettings();
  idle();
  return { stop, destroy: () => stop() };
}
