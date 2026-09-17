// 녹음 + 음성 인식 + 타이머 위젯 (연습 / 모의고사 / 섀도잉 공용)
import { Recognizer, Recorder, support, stopSpeaking, sttDiagnosis } from './speech.js';
import { fmtTime } from './util.js';
import { keepAwake } from './wake-lock.js';
import { store } from './store.js';

// 인식 실패 원인 + 해결 단계를 카드로 (녹음 중 · 채점 결과 공용)
export function sttHelpHtml(err) {
  const d = sttDiagnosis(err);
  return `<div class="fb bad"><span class="k">❌</span><span><b>${d.title}</b><ul class="xs" style="padding-left:16px;margin:6px 0 0">${d.steps.map(x => `<li>${x}</li>`).join('')}</ul></span></div>`;
}

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
  let releaseWake = null;   // 준비·녹음 중에는 화면이 꺼지지 않게 유지

  container.innerHTML = `
    <div class="rec-wrap">
      <div class="timer" data-timer>${prep ? fmtTime(prep) : fmtTime(0)}</div>
      <div class="xs muted mt8" data-status>${prep ? '준비 시간' : `최대 ${fmtTime(maxSeconds)}`}</div>
      <div class="bars hidden mt8" data-bars><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mt12"><button class="rec-btn" data-rec aria-label="녹음">🎙️</button></div>
      <div class="xs muted mt8" data-hint>${prep ? '준비 시간이 끝나면 자동으로 녹음이 시작됩니다' : '탭하여 답변 시작'}</div>
      <div class="transcript mt12" data-transcript>${support.stt ? '' : '<span class="muted">이 브라우저는 음성 인식을 지원하지 않습니다. 녹음 후 직접 들어보고 자가 평가하세요. (Android Chrome 권장)</span>'}</div>
      <div class="mt8 hidden" data-warn></div>
      <audio class="mt8 hidden" controls data-audio style="width:100%"></audio>
    </div>`;

  const $timer = container.querySelector('[data-timer]');
  const $status = container.querySelector('[data-status]');
  const $bars = container.querySelector('[data-bars]');
  const $btn = container.querySelector('[data-rec]');
  const $hint = container.querySelector('[data-hint]');
  const $tr = container.querySelector('[data-transcript]');
  const $audio = container.querySelector('[data-audio]');
  const $warn = container.querySelector('[data-warn]');

  function setTranscript(t) { if (support.stt) { $tr.textContent = t || '…'; $tr.classList.add('live'); } }
  function warn(html) { $warn.innerHTML = html; $warn.classList.toggle('hidden', !html); }

  // 말은 계속하는데 20초가 지나도록 한 마디도 안 잡히면 그 자리에서 알려 준다
  // (2분을 다 말한 뒤에야 "인식 실패" 를 보는 상황을 막는다)
  let silenceWatch = null;

  async function start() {
    if (state === 'rec') return;
    clearInterval(prepTick);
    stopSpeaking();
    releaseWake ||= keepAwake();
    state = 'rec';
    startedAt = Date.now();
    warn('');
    recognizer = new Recognizer({ onUpdate: (t) => { setTranscript(t); if (t) warn(''); }, onError: (code) => warn(sttHelpHtml(code)) });
    recorder = new Recorder();
    // 안드로이드에서는 녹음(getUserMedia)이 마이크를 잡고 있으면 음성 인식이 막히기도 한다.
    // 설정에서 녹음을 끄면 인식만 쓰게 된다. iOS 도 동시 사용이 안 될 수 있어 녹음 실패해도 진행한다.
    if (store.settings.recordAudio !== false) await recorder.start();
    recognizer.start();
    clearTimeout(silenceWatch);
    if (support.stt) silenceWatch = setTimeout(() => {
      if (state === 'rec' && recognizer && !recognizer.heard) warn(sttHelpHtml(recognizer.error));
    }, 20000);
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
    clearTimeout(silenceWatch);
    releaseWake?.(); releaseWake = null;
    const seconds = (Date.now() - startedAt) / 1000;
    const { transcript, segments, error } = recognizer.stop();
    const audioUrl = await recorder.stop();
    $btn.classList.remove('on'); $btn.textContent = '🎙️';
    $bars.classList.add('hidden');
    $status.textContent = `완료 · ${fmtTime(seconds)}`;
    $hint.textContent = '다시 탭하면 새로 녹음합니다';
    if (audioUrl) { $audio.src = audioUrl; $audio.classList.remove('hidden'); }
    if (support.stt) $tr.textContent = transcript || '(인식된 음성이 없습니다)';
    // 녹음은 됐는데 인식만 실패했다면 마이크 경합일 가능성이 크다 → 결과 화면에서 안내한다
    const sttError = transcript ? null : (error || (support.stt ? 'no-speech' : 'unsupported'));
    warn('');
    opts.onDone?.({ transcript, seconds, segments, audioUrl, sttError, recorded: !!audioUrl });
  }

  function startPrep() {
    releaseWake ||= keepAwake();
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
    destroy() {
      clearInterval(tick); clearInterval(prepTick); clearTimeout(silenceWatch);
      releaseWake?.(); releaseWake = null;
      try { recognizer?.stop(); recorder?.stop(); } catch { /* ignore */ }
    },
  };
}
