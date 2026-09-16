// 학습 중 화면이 꺼지지 않게 유지 (Screen Wake Lock API).
// 여러 화면이 동시에 요청할 수 있으므로 참조 카운트로 관리합니다.
// 탭이 백그라운드로 가면 브라우저가 락을 자동 해제하므로 돌아올 때 다시 잡습니다.

export const wakeLockSupported = 'wakeLock' in navigator;

let sentinel = null;
let holders = 0;
let acquiring = null;

async function acquire() {
  if (!wakeLockSupported || sentinel || document.visibilityState !== 'visible') return;
  if (acquiring) return acquiring;
  acquiring = navigator.wakeLock.request('screen').then(s => {
    sentinel = s;
    // 시스템이 먼저 해제했을 수 있으므로 상태를 비워 둔다 (재요청은 visibilitychange 에서)
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
  }).catch(() => { /* 권한 거부·저전력 모드 등: 조용히 포기 */ })
    .finally(() => { acquiring = null; });
  return acquiring;
}

function drop() {
  const s = sentinel;
  sentinel = null;
  try { s?.release(); } catch { /* ignore */ }
}

/** 화면 유지 시작. 반환된 함수를 부르면 해제됩니다 (여러 번 불러도 한 번만 반영). */
export function keepAwake() {
  holders++;
  acquire();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) drop();
  };
}

export function isAwake() { return !!sentinel; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && holders > 0) acquire();
});
