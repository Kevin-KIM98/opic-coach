// 서비스워커: 모든 동일 출처 파일은 네트워크 우선(오프라인 시 캐시). CDN 폰트는 캐시 우선.
const VERSION = 'v4.12.0';
const SHELL = `opic-shell-${VERSION}`;
const DATA = `opic-data`;
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/config.js', './js/util.js', './js/store.js', './js/data.js', './js/speech.js', './js/scoring.js', './js/exam.js', './js/recorder-ui.js', './js/autoplay.js', './js/wake-lock.js', './js/background.js', './js/version.js', './js/dim.js',
  './js/views/home.js', './js/views/topics.js', './js/views/topic.js', './js/views/practice.js', './js/views/drill.js', './js/views/quiz.js',
  './js/views/mock.js', './js/views/progress.js', './js/views/settings.js', './js/views/bank.js', './js/views/survey.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('opic-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 데이터: 네트워크 우선
  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then(res => { const copy = res.clone(); caches.open(DATA).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // 폰트/CDN: 캐시 후 네트워크 (stale-while-revalidate)
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.open(DATA).then(async c => {
        const cached = await c.match(e.request);
        const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }
  // 앱 셸: 네트워크 우선 (배포 즉시 반영), 오프라인이면 캐시.
  // 브라우저 HTTP 캐시(GitHub Pages 는 10분)에 남은 예전 파일을 쓰지 않도록 매번 서버에 확인한다 (바뀌지 않았으면 304)
  const req = e.request.mode === 'navigate' ? new Request(e.request.url, { credentials: 'same-origin' }) : e.request;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
