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
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.done = [];        // 이전 인식 세션(자동 재시작 전)들의 확정 결과 {text, t}
    this.session = [];     // 현재 세션의 확정 결과 — 이벤트마다 e.results 전체로 다시 계산
    this.sessionT = [];    // 현재 세션 결과별 최초 확정 시각
    this.interim = '';
    this.active = false;
    this.startedAt = 0;
    this.rec = null;
    this.error = null;
  }
  get finals() { return collapse(this.done.concat(this.session)); }
  get transcript() {
    const parts = this.finals;
    if (this.interim) parts.push({ text: this.interim, t: 0 });
    return collapse(parts).map(f => f.text).join(' ').replace(/\s+/g, ' ').trim();
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
    // 이전 세션 결과를 done 으로 넘기고 새 세션 시작
    this.done = this.finals;
    this.session = [];
    this.sessionT = [];
    rec.onresult = (e) => {
      // 증분(resultIndex) 대신 e.results 전체로 매번 재구성 → 같은 결과가 두 번 쌓이지 않는다
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
    if (this.interim) { this.session.push({ text: this.interim, t: (Date.now() - this.startedAt) / 1000 }); this.interim = ''; }
    this.done = this.finals;
    this.session = [];
    this.sessionT = [];
    return { transcript: this.transcript, segments: this.done.slice() };
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
