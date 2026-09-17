// 음성 합성(TTS) · 음성 인식(STT) · 녹음. 모두 브라우저 내장 API만 사용 (서버 없음).
import { store } from './store.js';

const synth = window.speechSynthesis;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const support = {
  tts: !!synth,
  stt: !!SR,
  recorder: !!(navigator.mediaDevices && window.MediaRecorder),
};

// ---------- TTS ----------
let voices = [];
function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang));
}
loadVoices();
if (synth) synth.onvoiceschanged = loadVoices;

export function englishVoices() { loadVoices(); return voices; }

function pickVoice() {
  loadVoices();
  const want = store.settings.ttsVoice;
  if (want) { const v = voices.find(v => v.name === want); if (v) return v; }
  // 선호 순서: 미국 영어 자연스러운 음성
  const prefs = [/Samantha/i, /Google US English/i, /Microsoft (Aria|Jenny|Guy)/i, /en-US/i, /en_US/i, /en-GB/i];
  for (const p of prefs) { const v = voices.find(v => p.test(v.name) || p.test(v.lang)); if (v) return v; }
  return voices[0] || null;
}

let currentUtter = null;
export function speak(text, { rate, onBoundary } = {}) {
  return new Promise(resolve => {
    if (!synth) return resolve(false);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-US';
    u.rate = rate ?? store.settings.ttsRate ?? 0.95;
    u.pitch = 1;
    // 일부 기기에서 onend 가 오지 않는 경우를 대비한 안전 타이머
    const watchdog = setTimeout(() => { currentUtter = null; resolve(true); }, (2000 + text.length * 100) / u.rate);
    u.onend = () => { clearTimeout(watchdog); currentUtter = null; resolve(true); };
    u.onerror = () => { clearTimeout(watchdog); currentUtter = null; resolve(false); };
    if (onBoundary) u.onboundary = onBoundary;
    currentUtter = u;
    synth.speak(u);
  });
}
export function stopSpeaking() { if (synth) synth.cancel(); currentUtter = null; }
export function isSpeaking() { return !!synth && synth.speaking; }

// ---------- STT ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// 재시작해도 소용없는 오류 — 원인을 알려주고 멈춘다
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

/**
 * 인식 실패 원인을 사람 말로 풀어 준다. (recorder-ui / 채점 피드백 공용)
 * @param {string|null} err Recognizer.error
 * @returns {{code:string, title:string, steps:string[]}}
 */
export function sttDiagnosis(err) {
  if (!support.stt) return {
    code: 'unsupported',
    title: '이 브라우저는 음성 인식을 지원하지 않아요.',
    steps: ['Android는 Chrome, iPhone은 Safari로 열어 보세요.', '녹음은 되니 직접 들어 보며 자가 평가하거나, 아래에 답변을 입력해 채점받을 수 있어요.'],
  };
  if (err === 'not-allowed' || err === 'service-not-allowed') return {
    code: 'permission',
    title: '마이크 권한이 거부돼 있어요.',
    steps: ['주소창 왼쪽 자물쇠 → 권한 → 마이크 → 허용', '홈 화면 앱으로 설치했다면 폰 설정 → 앱 → 마이크 권한도 확인하세요.', '허용한 뒤 화면을 새로고침하세요.'],
  };
  if (err === 'audio-capture') return {
    code: 'mic',
    title: '마이크에서 소리를 가져오지 못했어요.',
    steps: ['다른 앱(통화·녹음·화상회의)이 마이크를 쓰고 있지 않은지 확인하세요.', '이어폰을 뺐다 다시 꽂거나, 블루투스 마이크 대신 폰 마이크로 시도해 보세요.'],
  };
  if (err === 'network' || !navigator.onLine) return {
    code: 'offline',
    title: '음성 인식은 인터넷 연결이 필요해요.',
    steps: ['Wi-Fi 또는 데이터가 켜져 있는지 확인하세요.', '연결 후 다시 녹음하면 됩니다. (듣기·표현 학습은 오프라인에서도 돼요)'],
  };
  return {
    code: 'no-speech',
    title: '말소리가 잡히지 않았어요.',
    steps: ['마이크에 조금 더 가까이, 평소 대화 크기로 말해 보세요.', '조용한 곳에서 이어폰 마이크를 쓰면 인식률이 올라갑니다.', '계속 안 되면 설정에서 "답변 오디오 녹음"을 끄고 인식만 써 보세요.'],
  };
}

// 안드로이드 Chrome 은 resultIndex 가 0 으로 고정된 채 누적 결과("hi" → "hi my" → "hi my name" …)를
// 이벤트마다 다시 보내고 isFinal 도 반복 표시한다. 앞 항목이 뒤 항목의 접두어(또는 동일)이면 접어서 하나로 만든다.
function collapse(items) {
  const out = [];
  for (const it of items) {
    const n = norm(it.text);
    if (!n) continue;
    const prev = out[out.length - 1];
    if (prev && n.startsWith(norm(prev.text))) { out[out.length - 1] = { ...it, t: prev.t }; continue; }
    if (prev && norm(prev.text).startsWith(n)) continue;
    out.push(it);
  }
  return out;
}

export class Recognizer {
  constructor({ onUpdate, onError } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.onError = onError || (() => {});
    this.done = [];        // 이전 인식 세션(자동 재시작 전)들의 확정 결과 {text, t}
    this.session = [];     // 현재 세션의 확정 결과 — 이벤트마다 e.results 전체로 다시 계산
    this.sessionT = [];    // 현재 세션 결과별 최초 확정 시각
    this.interim = '';
    this.active = false;
    this.startedAt = 0;
    this.rec = null;
    this.error = null;
    this.heard = false;    // 한 번이라도 결과가 들어왔는지 (실패 원인 판별용)
    this.restarts = 0;     // 자동 재시작 횟수 — 폭주 방지
    this.retryTimer = null;
  }
  get finals() { return collapse(this.done.concat(this.session)); }
  get transcript() {
    const parts = this.finals;
    if (this.interim) parts.push({ text: this.interim, t: 0 });
    return collapse(parts).map(f => f.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  start() {
    if (!SR) { this.error = 'unsupported'; return false; }
    this.active = true;
    this.startedAt = Date.now();
    this.restarts = 0;
    this._spawn();
    return true;
  }
  _fail(code) {
    this.error = code;
    this.active = false;
    clearTimeout(this.retryTimer);
    try { this.rec?.abort?.(); } catch { /* ignore */ }
    this.onError(code);
  }
  _spawn() {
    const rec = new SR();
    const spawnedAt = Date.now();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // 이전 세션 결과를 done 으로 넘기고 새 세션 시작
    this.done = this.finals;
    this.session = [];
    this.sessionT = [];
    rec.onresult = (e) => {
      // 증분(resultIndex) 대신 e.results 전체로 매번 재구성 → 같은 결과가 두 번 쌓이지 않는다
      this.heard = true;
      this.restarts = 0;   // 소리가 잡히면 재시작 카운터를 되돌린다
      if (this.error && this.error !== 'not-allowed' && this.error !== 'service-not-allowed') this.error = null;
      const finals = [];
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const text = (r[0]?.transcript || '').trim();
        if (!text) continue;
        if (r.isFinal) {
          if (this.sessionT[i] == null) this.sessionT[i] = (Date.now() - this.startedAt) / 1000;
          finals.push({ text, t: this.sessionT[i] });
        } else interim += ' ' + text;
      }
      this.session = collapse(finals);
      this.interim = interim.replace(/\s+/g, ' ').trim();
      this.onUpdate(this.transcript);
    };
    rec.onerror = (e) => {
      // 권한·마이크 오류는 재시작해도 같은 결과 → 즉시 원인을 알리고 멈춘다.
      // no-speech / aborted 는 안드로이드에서 정상적으로 자주 나오므로 재시작에 맡긴다.
      if (FATAL_ERRORS.has(e.error)) return this._fail(e.error);
      // network 는 한 번 더 시도해 보고 계속 실패하면 오프라인으로 본다
      if (e.error === 'network') this.error = 'network';
      else if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') this.error = e.error;
    };
    rec.onend = () => {
      if (!this.active) return;
      // 안드로이드는 침묵 시 자동 종료되므로 활성 상태면 재시작한다.
      // 다만 시작하자마자 끝나는 상태가 이어지면(마이크 점유·서비스 미설치) 폭주하므로 횟수를 제한한다.
      if (Date.now() - spawnedAt < 400) this.restarts++;
      if (this.restarts >= 8) return this._fail(this.error || (navigator.onLine ? 'audio-capture' : 'network'));
      const delay = Math.min(1000, this.restarts * 150);
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => { if (this.active) { try { this._spawn(); } catch { /* ignore */ } } }, delay);
    };
    this.rec = rec;
    try { rec.start(); } catch { /* already started */ }
  }
  stop() {
    this.active = false;
    clearTimeout(this.retryTimer);
    try { this.rec?.stop(); } catch { /* ignore */ }
    if (this.interim) { this.session.push({ text: this.interim, t: (Date.now() - this.startedAt) / 1000 }); this.interim = ''; }
    this.done = this.finals;
    this.session = [];
    this.sessionT = [];
    const transcript = this.transcript;
    // 아무것도 못 알아들었는데 뚜렷한 오류도 없으면 "말소리 없음" 으로 본다
    if (!transcript && !this.error) this.error = navigator.onLine ? 'no-speech' : 'network';
    return { transcript, segments: this.done.slice(), error: transcript ? null : this.error };
  }
}

// ---------- Recorder ----------
export class Recorder {
  constructor() { this.chunks = []; this.mr = null; this.stream = null; this.url = null; }
  async start() {
    if (!support.recorder) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.chunks = [];
      this.mr.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.mr.start(250);
      return true;
    } catch (err) {
      this.error = err;
      return false;
    }
  }
  stop() {
    return new Promise(resolve => {
      if (!this.mr || this.mr.state === 'inactive') { this._release(); return resolve(this.url); }
      this.mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mr.mimeType || 'audio/webm' });
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = blob.size ? URL.createObjectURL(blob) : null;
        this._release();
        resolve(this.url);
      };
      try { this.mr.stop(); } catch { this._release(); resolve(null); }
    });
  }
  _release() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
}

// 마이크 권한 사전 요청 (첫 사용 시 안내용)
export async function requestMic() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); return true; }
  catch { return false; }
}
