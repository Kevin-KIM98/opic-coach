import { CONFIG } from './config.js';
import { store } from './store.js';
import { stopSpeaking } from './speech.js';
import { html, raw } from './util.js';

const views = {
  home: () => import('./views/home.js'),
  topics: () => import('./views/topics.js'),
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
  const top = route.name === 'topic' || route.name === 'practice' ? 'topics' : route.name === 'review' ? 'drill' : route.name;
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

// 설치 프롬프트 보관
window.deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.deferredInstall = e; });

// 테마
const theme = store.settings.theme;
if (theme) document.documentElement.dataset.theme = theme;

console.log(`${CONFIG.appName} ${CONFIG.version}`);
