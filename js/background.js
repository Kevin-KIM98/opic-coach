// 화면이 꺼져도 자동 재생이 이어지게 하고, 이어폰을 빼면 멈춘다.
//
// TTS(speechSynthesis)는 '미디어 재생'으로 치지 않아서, 화면이 꺼지면 브라우저가 페이지를 멈추거나
// 타이머(문장 사이 간격)를 늦춰 재생이 끊긴다. 재생하는 동안 거의 들리지 않는 소리를 <audio> 로
// 반복 재생해 페이지를 '미디어 재생 중'으로 만들고, Media Session 으로 잠금 화면에 ⏸ 버튼을 띄운다.
//
// 이어폰(유선·블루투스)이 빠지면 안드로이드가 '소리가 스피커로 샐 상황'(becoming noisy)으로 보고
// 미디어를 일시정지한다. 우리가 멈추지 않았는데 <audio> 가 멈추면 이어폰이 빠진 것으로 보고 재생을
// 멈춘다. 오디오 장치 목록이 줄어드는 경우(devicechange)도 함께 본다.
import { store } from './store.js';

export const backgroundSupported = typeof Audio !== 'undefined';
export const bgPlayOn = () => store.settings.bgPlay ?? true;
export const stopOnUnplugOn = () => store.settings.stopOnUnplug ?? true;

let audio = null;
let session = null;        // 지금 재생 중인 세션 {onStop}
let pausingOnPurpose = false;
let outputs = null;        // 시작할 때의 오디오 장치 id 목록

// 1초짜리 아주 작은 잡음(약 -66 dBFS) WAV. 완전한 무음은 브라우저가 '소리 없음'으로 보고 재생 중으로 치지 않는다.
function keepAliveUrl() {
  const rate = 8000, n = rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((Math.random() * 2 - 1) * 16), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(keepAliveUrl());
  audio.loop = true;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  // 우리가 멈추지 않았는데 멈췄다 = 이어폰 분리(becoming noisy) 또는 다른 앱이 오디오를 가져감
  // pause 이벤트는 비동기로 온다: 우리가 멈췄다가 곧바로 다시 튼 경우(다음 카드 등)엔 이미 재생 중이므로 무시
  audio.addEventListener('pause', () => {
    if (pausingOnPurpose || !session?.audio || !audio.paused) return;
    interrupt(stopOnUnplugOn() ? 'unplug' : null);
  });
  return audio;
}

async function audioOutputs() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    // 권한이 없으면 id 가 비어 있어 구분할 수 없다 → 이 경우는 <audio> pause 로만 판단
    const ids = list.filter(d => d.kind === 'audiooutput' || d.kind === 'audioinput').map(d => d.deviceId).filter(Boolean);
    return ids.length ? ids : null;
  } catch { return null; }
}

navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
  if (!session || !outputs || !stopOnUnplugOn()) return;
  const now = await audioOutputs();
  if (now && outputs.some(id => !now.includes(id))) interrupt('unplug');
  else if (now) outputs = now;
});

// '화면 꺼져도 계속 재생'을 끈 경우: 화면이 꺼지거나 다른 앱으로 가면 멈춘다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && session && !bgPlayOn()) interrupt('hidden');
});

function interrupt(reason) {
  const s = session;
  if (!s) return;
  if (reason === null) { resumeAudio(); return; }    // 이어폰 분리 감지를 끈 경우: 다시 이어서 재생
  end();
  s.onStop(reason);
}

function resumeAudio() { audio?.play().catch(() => {}); }

function end() {
  session = null;
  outputs = null;
  if (audio && !audio.paused) { pausingOnPurpose = true; audio.pause(); pausingOnPurpose = false; }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
    try { navigator.mediaSession.metadata = null; } catch { /* ignore */ }
  }
}

/**
 * 백그라운드 재생 시작. 반환 함수를 부르면 끝난다 (여러 번 불러도 한 번만 반영).
 * 반드시 사용자 탭(재생 버튼) 안에서 불러야 <audio> 재생이 허용된다.
 * @param {{onStop(reason:'unplug'|'remote'):void, title?:string}} opts
 */
export function startBackground({ onStop, title = 'OPIc Coach' }) {
  if (!backgroundSupported) return () => {};
  const mine = { onStop, audio: bgPlayOn() || stopOnUnplugOn() };
  session = mine;
  if (mine.audio) {
    const a = ensureAudio();
    pausingOnPurpose = false;
    a.play().catch(() => { /* 자동 재생 정책 등: 백그라운드 유지만 포기 */ });
  }
  audioOutputs().then(ids => { if (session === mine) outputs = ids; });
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'OPIc Coach', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    } catch { /* ignore */ }
    navigator.mediaSession.playbackState = 'playing';
    // 잠금 화면 ▶ 는 무시 (TTS 는 앱 화면의 재생 버튼으로 다시 시작) — 기본 동작은 무음 오디오만 다시 튼다
    try { navigator.mediaSession.setActionHandler('play', () => {}); } catch { /* ignore */ }
    // 잠금 화면 · 이어폰 버튼의 ⏸ / ⏹
    for (const act of ['pause', 'stop']) {
      try { navigator.mediaSession.setActionHandler(act, () => { if (session === mine) { end(); onStop('remote'); } }); } catch { /* ignore */ }
    }
  }
  return () => { if (session === mine) end(); };
}

/** 잠금 화면에 지금 읽는 문장을 보여 준다 */
export function nowPlaying(text) {
  if (!session || !('mediaSession' in navigator) || !navigator.mediaSession.metadata) return;
  try { navigator.mediaSession.metadata.title = text.slice(0, 80); } catch { /* ignore */ }
}

/** 멈춘 이유를 사람 말로 */
export function stopReasonText(reason) {
  return { unplug: '🎧 이어폰이 빠졌거나 다른 앱이 소리를 가져가서 멈췄어요.', remote: '잠금 화면에서 멈췄어요.', hidden: '화면이 꺼져서 멈췄어요. (설정에서 화면이 꺼져도 계속 재생을 켤 수 있어요)' }[reason] || '';
}
