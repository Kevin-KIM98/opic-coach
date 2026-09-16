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
    const watchdog = setTimeout(() => { currentUtter = null; resolve(true); }, (3000 + text.length * 130) / u.rate);
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
export class Recognizer {
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.finals = [];      // {text, t}
    this.interim = '';
    this.active = false;
    this.startedAt = 0;
    this.rec = null;
    this.error = null;
  }
  get transcript() {
    return (this.finals.map(f => f.text).join(' ') + ' ' + this.interim).replace(/\s+/g, ' ').trim();
  }
  start() {
    if (!SR) return false;
    this.active = true;
    this.startedAt = Date.now();
    this._spawn();
    return true;
  }
  _spawn() {
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finals.push({ text: r[0].transcript.trim(), t: (Date.now() - this.startedAt) / 1000 });
        else interim += r[0].transcript;
      }
      this.interim = interim.trim();
      this.onUpdate(this.transcript);
    };
    rec.onerror = (e) => {
      // no-speech / aborted 는 재시작, 권한 거부는 종료
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.error = e.error; this.active = false; }
    };
    rec.onend = () => {
      // 안드로이드는 침묵 시 자동 종료되므로 활성 상태면 재시작
      if (this.active) { try { this._spawn(); } catch { /* ignore */ } }
    };
    this.rec = rec;
    try { rec.start(); } catch { /* already started */ }
  }
  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    if (this.interim) { this.finals.push({ text: this.interim, t: (Date.now() - this.startedAt) / 1000 }); this.interim = ''; }
    return { transcript: this.transcript, segments: this.finals.slice() };
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
