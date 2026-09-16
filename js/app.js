import { CONFIG } from './config.js';
import { store } from './store.js';
import { stopSpeaking } from './speech.js';
import { html, raw } from './util.js';

const views = {
  home: () => import('./views/home.js'),
  topics: () => import('./views/topics.js'),
  focus: () => import('./views/focus.js'),
  topic: () => import('./views/topic.js'),
  practice: () => import('./views/practice.js'),
  drill: () => import('./views/drill.js'),
  mock: () => import('./views/mock.js'),
  progress: () => import('./views/progress.js'),
  plan: () => import('./views/plan.js'),
  settings: () => import('./views/settings.js'),
  review: () => import('./views/practice.js'),
};

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');
let currentCleanup = null;

export function navigate(hash) { location.hash = hash; }

export function header(title, { back = true, right = '' } = {}) {
  return html`<header class="topbar">
    ${back ? raw(`<button class="icon-btn" data-back aria-label="뒤로">‹</button>`) : ''}
    <div class="title">${title}</div>
    ${raw(right)}
  </header>`;
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [pathPart, queryPart] = h.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { name: parts[0] || 'home', parts: parts.slice(1), query };
}

async function render() {
  const route = parseHash();
  stopSpeaking();
  if (currentCleanup) { try { currentCleanup(); } catch { /* ignore */ } currentCleanup = null; }
  const loader = views[route.name] || views.home;
  $view.innerHTML = '<div class="empty">불러오는 중…</div>';
  try {
    const mod = await loader();
    const fn = route.name === 'review' ? mod.renderReview : mod.render;
    $view.className = 'page' + (mod.noNav?.(route) ? ' no-nav' : '');
    $view.scrollTop = 0; window.scrollTo(0, 0);
    currentCleanup = await fn($view, route) || null;
    $view.classList.add('fade-in');
  } catch (err) {
    console.error(err);
    $view.innerHTML = `<div class="empty">화면을 불러오지 못했습니다.<br><small>${err.message}</small><br><br><a class="btn" href="#/home">홈으로</a></div>`;
  }
  // nav active
  const top = route.name === 'topic' || route.name === 'practice' || route.name === 'focus' ? 'topics' : route.name === 'review' ? 'drill' : route.name;
  $nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.nav === top));
  $nav.style.display = $view.classList.contains('no-nav') ? 'none' : '';
}

document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (back) { e.preventDefault(); if (history.length > 1) history.back(); else navigate('#/home'); }
});

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// 서비스워커
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            import('./util.js').then(({ toast }) => toast('새 버전이 준비됐어요. 앱을 다시 열면 적용됩니다.', 4000));
          }
        });
      });
    }).catch(() => {});
  });
}

// 설치 (PWA)
// Chrome이 설치 가능하다고 판단하면 beforeinstallprompt 가 옵니다. preventDefault 를 부르지 않아
// Chrome 자체 배너도 그대로 뜨고, 추가로 앱 하단에 우리 설치 바를 띄워 어디서든 설치할 수 있게 합니다.
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
window.deferredInstall = null;
const $installbar = document.getElementById('installbar');
const $installMsg = document.getElementById('installbar-msg');
const $installBtn = document.getElementById('installbar-btn');

function showInstallBar(msg, btnText) {
  if (!$installbar || isStandalone() || sessionStorage.getItem('installbar-dismissed')) return;
  $installMsg.textContent = msg;
  $installBtn.textContent = btnText;
  $installbar.classList.remove('hidden');
  document.body.classList.add('has-installbar');
}
function hideInstallBar() {
  $installbar?.classList.add('hidden');
  document.body.classList.remove('has-installbar');
}

export async function promptInstall() {
  const p = window.deferredInstall;
  if (p) {
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') window.deferredInstall = null;
    return outcome;
  }
  const { toast } = await import('./util.js');
  if (isStandalone()) toast('이미 앱으로 실행 중이에요');
  else if (isIOS) toast('Safari 하단 공유 버튼 → "홈 화면에 추가"를 누르세요', 3500);
  else toast('Chrome 오른쪽 위 ⋮ 메뉴 → "홈 화면에 추가" 또는 "앱 설치"를 누르세요', 3500);
  return 'unavailable';
}

window.addEventListener('beforeinstallprompt', (e) => {
  window.deferredInstall = e;
  showInstallBar('홈 화면에 앱으로 설치하면 전체 화면·오프라인으로 쓸 수 있어요.', '설치');
});
window.addEventListener('appinstalled', () => {
  window.deferredInstall = null;
  hideInstallBar();
  import('./util.js').then(({ toast }) => toast('설치 완료! 홈 화면의 OPIc Coach 아이콘으로 실행하세요.', 4000));
});
$installBtn?.addEventListener('click', promptInstall);
document.getElementById('installbar-close')?.addEventListener('click', () => { sessionStorage.setItem('installbar-dismissed', '1'); hideInstallBar(); });
// 이벤트가 안 오는 브라우저(삼성 인터넷, 앱 내 브라우저, iOS Safari)에는 안내만 띄웁니다.
setTimeout(() => {
  if (window.deferredInstall || isStandalone() || location.protocol === 'file:') return;
  if (isIOS) showInstallBar('Safari 공유 버튼 → "홈 화면에 추가"로 설치할 수 있어요.', '방법');
  else if (isAndroid) showInstallBar('Chrome ⋮ 메뉴 → "홈 화면에 추가"로 설치할 수 있어요.', '방법');
}, 4000);

// 테마
const theme = store.settings.theme;
if (theme) document.documentElement.dataset.theme = theme;

console.log(`${CONFIG.appName} ${CONFIG.version}`);
