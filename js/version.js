// 지금 실행 중인 앱 버전 · 업데이트 시각, 그리고 서버에 더 새 버전이 올라왔는지 확인.
// 버전을 올릴 때는 js/config.js 의 version · updated 와 sw.js 의 VERSION 을 함께 바꾼다 (validate.py 가 검사).
import { CONFIG } from './config.js';

// '2026-10-27 11:34' (한국 시간) → '10월 27일 11:34'
export function fmtUpdated(s = CONFIG.updated) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일 ${m[4]}` : '';
}

export const versionLabel = () => `v${CONFIG.version}${CONFIG.updated ? ` · ${fmtUpdated()} 업데이트` : ''}`;

/** 서버의 js/config.js 를 캐시 없이 읽어 버전이 다르면 {version, updated} 를, 같거나 확인 못 하면 null */
export async function checkForUpdate() {
  try {
    const res = await fetch(`js/config.js?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const version = text.match(/version:\s*'([^']+)'/)?.[1];
    const updated = text.match(/updated:\s*'([^']+)'/)?.[1] || '';
    if (!version || (version === CONFIG.version && updated === (CONFIG.updated || ''))) return null;
    return { version, updated };
  } catch { return null; }   // 오프라인
}

/** 새 서비스워커를 받고, 예전 앱 파일 캐시를 지운 뒤 다시 연다 */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage('skipWaiting');
  } catch { /* ignore */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('opic-shell-')).map(k => caches.delete(k)));
  } catch { /* ignore */ }
  location.reload();
}
