// 녹음 + 음성 인식 + 타이머 위젯 (연습 / 모의고사 / 섀도잉 공용)
import { Recognizer, Recorder, support, stopSpeaking } from './speech.js';
import { fmtTime } from './util.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts {maxSeconds, prepSeconds, autoStart, onDone(res), onStart, label}
 * res: {transcript, seconds, segments, audioUrl}
 */
export function createRecorderUI(container, opts = {}) {
  const maxSeconds = opts.maxSeconds || 120;
  let prep = opts.prepSeconds || 0;
  let state = 'idle'; // idle | prep | rec | done
  let recognizer = null, recorder = null, startedAt = 0, tick = null, prepTick = null;

  container.innerHTML = `
    <div class="rec-wrap">
      <div class="timer" data-timer>${prep ? fmtTime(prep) : fmtTime(0)}</div>
      <div class="xs muted mt8" data-status>${prep ? '준비 시간' : `최대 ${fmtTime(maxSeconds)}`}</div>
      <div class="bars hidden mt8" data-bars><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mt12"><button class="rec-btn" data-rec aria-label="녹음">🎙️</button></div>
      <div class="xs muted mt8" data-hint>${prep ? '준비 시간이 끝나면 자동으로 녹음이 시작됩니다' : '탭하여 답변 시작'}</div>
      <div class="transcript mt12" data-transcript>${support.stt ? '' : '<span class="muted">이 브라우저는 음성 인식을 지원하지 않습니다. 녹음 후 직접 들어보고 자가 평가하세요. (Android Chrome 권장)</span>'}</div>
      <audio class="mt8 hidden" controls data-audio style="width:100%"></audio>
    </div>`;

  const $timer = container.querySelector('[data-timer]');
  const $status = container.querySelector('[data-status]');
  const $bars = container.querySelector('[data-bars]');
  const $btn = container.querySelector('[data-rec]');
  const $hint = container.querySelector('[data-hint]');
  const $tr = container.querySelector('[data-transcript]');
  const $audio = container.querySelector('[data-audio]');

  function setTranscript(t) { if (support.stt) { $tr.textContent = t || '…'; $tr.classList.add('live'); } }

  async function start() {
    if (state === 'rec') return;
    clearInterval(prepTick);
    stopSpeaking();
    state = 'rec';
    startedAt = Date.now();
    recognizer = new Recognizer({ onUpdate: setTranscript });
    recorder = new Recorder();
    // iOS 에서는 STT 와 녹음이 동시에 안 될 수 있음 → 녹음 실패해도 진행
    await recorder.start();
    recognizer.start();
    $btn.classList.add('on'); $btn.textContent = '■';
    $bars.classList.remove('hidden');
    $status.textContent = '녹음 중 · 탭하여 종료';
    $hint.textContent = '영어로 답변하세요. 막히면 "Well, let me think..." 로 이어가세요.';
    setTranscript('');
    opts.onStart?.();
    tick = setInterval(() => {
      const s = (Date.now() - startedAt) / 1000;
      const left = maxSeconds - s;
      $timer.textContent = fmtTime(left);
      $timer.classList.toggle('warn', left < 15);
      if (left <= 0) stop();
    }, 250);
  }

  async function stop() {
    if (state !== 'rec') return;
    state = 'done';
    clearInterval(tick);
    const seconds = (Date.now() - startedAt) / 1000;
    const { transcript, segments } = recognizer.stop();
    const audioUrl = await recorder.stop();
    $btn.classList.remove('on'); $btn.textContent = '🎙️';
    $bars.classList.add('hidden');
    $status.textContent = `완료 · ${fmtTime(seconds)}`;
    $hint.textContent = '다시 탭하면 새로 녹음합니다';
    if (audioUrl) { $audio.src = audioUrl; $audio.classList.remove('hidden'); }
    if (support.stt) $tr.textContent = transcript || '(인식된 음성이 없습니다)';
    opts.onDone?.({ transcript, seconds, segments, audioUrl, sttError: recognizer.error });
  }

  function startPrep() {
    state = 'prep';
    let left = prep;
    $timer.textContent = fmtTime(left);
    $status.textContent = '준비 시간';
    prepTick = setInterval(() => {
      left -= 1; $timer.textContent = fmtTime(left);
      if (left <= 0) { clearInterval(prepTick); start(); }
    }, 1000);
  }

  $btn.addEventListener('click', () => {
    if (state === 'rec') stop();
    else start();
  });

  if (opts.autoStart) { if (prep) startPrep(); else start(); }

  return {
    start, stop, startPrep,
    get state() { return state; },
    destroy() { clearInterval(tick); clearInterval(prepTick); try { recognizer?.stop(); recorder?.stop(); } catch { /* ignore */ } },
  };
}
