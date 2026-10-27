// 화면 어둡게: 재생 중 화면을 검게 덮어 '꺼진 것처럼' 두고 계속 듣는다.
//
// 폰의 음성 합성(TTS)은 화면이 꺼지면 브라우저가 멈춘다. 그래서 화면은 켜 둔 채(wake lock)
// 검은 화면으로 덮는다 — OLED 화면은 검은 부분이 거의 꺼진 것과 같아 눈부시지 않고 배터리도 적게 쓴다.
// 재생하는 동안 🌙 버튼이 뜨고, 설정에서 정한 시간 동안 화면을 만지지 않으면 저절로 어두워진다.
// 두 번 탭하면 원래 화면으로 돌아오고, 재생이 끝나면 저절로 걷힌다.
import { store } from './store.js';

export const AUTO_DIM = [0, 15, 30, 60];          // 초 (0 = 자동으로 어둡게 하지 않음)
export const autoDimSec = () => store.settings.autoDim ?? 0;

let holders = 0;
let btn = null, overlay = null, autoTimer = null, moveTimer = null;

function ensureButton() {
  if (btn) return btn;
  btn = document.createElement('button');
  btn.className = 'dim-btn hidden';
  btn.type = 'button';
  btn.textContent = '🌙 화면 어둡게';
  btn.setAttribute('aria-label', '화면 어둡게 (재생은 계속)');
  btn.addEventListener('click', (e) => { e.stopPropagation(); dim(); });
  document.body.appendChild(btn);
  return btn;
}

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'dim-overlay hidden';
  overlay.setAttribute('role', 'button');
  overlay.setAttribute('aria-label', '두 번 탭하면 화면이 돌아와요');
  overlay.innerHTML = '<div class="dim-hint">🌙 재생 중<br>두 번 탭하면 화면이 돌아와요</div>';
  // 주머니 속에서 한 번 스친 것으로는 풀리지 않게 두 번 탭해야 걷힌다
  let last = 0;
  overlay.addEventListener('pointerup', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - last < 450) { undim(); last = 0; } else last = now;
  });
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(overlay);
  return overlay;
}

// 안내 문구 위치를 가끔 옮긴다 (같은 자리에 오래 떠 있으면 OLED 잔상이 생길 수 있다)
function moveHint() {
  const h = overlay?.querySelector('.dim-hint');
  if (!h) return;
  h.style.top = `${15 + Math.random() * 65}%`;
  h.style.left = `${10 + Math.random() * 40}%`;
}

export function isDimmed() { return !!overlay && !overlay.classList.contains('hidden'); }

export function dim() {
  if (!holders) return;
  ensureOverlay().classList.remove('hidden');
  btn?.classList.add('hidden');
  document.body.classList.add('dimmed');
  moveHint();
  clearInterval(moveTimer);
  moveTimer = setInterval(moveHint, 30000);
  clearTimeout(autoTimer);
}

export function undim() {
  overlay?.classList.add('hidden');
  document.body.classList.remove('dimmed');
  clearInterval(moveTimer);
  if (holders) { ensureButton().classList.remove('hidden'); scheduleAuto(); }
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  const sec = autoDimSec();
  if (sec && holders && !isDimmed()) autoTimer = setTimeout(dim, sec * 1000);
}

// 화면을 만지면 자동 어둡게 타이머를 처음부터 다시 센다
document.addEventListener('pointerdown', (e) => {
  if (holders && !isDimmed() && e.target !== btn) scheduleAuto();
}, true);

/** 재생 시작 시 부른다. 반환 함수를 부르면 끝 (여러 번 불러도 한 번만 반영) */
export function holdDim() {
  holders++;
  ensureButton().classList.remove('hidden');
  if (isDimmed()) btn.classList.add('hidden');
  scheduleAuto();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders = Math.max(0, holders - 1);
    if (holders) return;
    clearTimeout(autoTimer);
    btn?.classList.add('hidden');
    if (isDimmed()) undim();
  };
}
