export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 태그드 템플릿: 값은 자동 이스케이프, raw() 로 감싼 값은 그대로 삽입
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => {
    const v = vals[i - 1];
    let piece;
    if (v == null || v === false) piece = '';
    else if (v instanceof Raw) piece = v.s;
    else if (Array.isArray(v)) piece = v.map(x => (x instanceof Raw ? x.s : esc(x))).join('');
    else piece = esc(v);
    return out + piece + s;
  });
}
class Raw { constructor(s) { this.s = s; } }
export const raw = s => new Raw(s);

export function el(htmlString) {
  const t = document.createElement('template');
  t.innerHTML = htmlString.trim();
  return t.content.firstElementChild;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(a, b) {
  const A = new Date(a); A.setHours(0, 0, 0, 0);
  const B = new Date(b); B.setHours(0, 0, 0, 0);
  return Math.round((B - A) / 86400000);
}

export function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, n = 1) {
  return shuffle(arr).slice(0, n);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function levelColor(level) {
  if (!level) return 'var(--muted)';
  const l = String(level).toUpperCase();
  if (l.startsWith('AL')) return 'var(--violet)';
  if (l.startsWith('IH')) return 'var(--indigo)';
  if (l.startsWith('IM')) return 'var(--teal)';
  if (l.startsWith('IL')) return 'var(--gold)';
  return 'var(--muted)';
}

export function splitSentences(text) {
  return String(text).match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [text];
}

let toastTimer;
export function toast(msg, ms = 2200) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function sheet(contentHtml, { onClose } = {}) {
  const wrap = el(`<div class="sheet-backdrop"><div class="sheet" role="dialog"><div class="sheet-handle"></div><div class="sheet-body"></div></div></div>`);
  wrap.querySelector('.sheet-body').innerHTML = contentHtml;
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 200); onClose?.(); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return { el: wrap, close };
}
