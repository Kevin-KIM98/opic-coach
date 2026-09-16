// 앱 전역 설정.
// 저장소 정보는 소스에 박아 두지 않는다. 편집자 모드(이 기기에서만 켜지는 숨은 설정)일 때만
// 현재 주소(GitHub Pages)에서 owner/repo 를 유추해 "콘텐츠 수정" 링크를 만든다.
// 편집자 모드가 꺼져 있으면 앱 어디에도 저장소 주소·계정이 드러나지 않는다.
export const CONFIG = {
  appName: 'OPIc Coach',
  version: '1.3.1',
  // 기본 설정값 (설정 화면에서 변경 가능)
  defaults: {
    target: 'IM3',          // IM3 | IH | AL
    plan: '8w',             // 4w | 8w | 12w
    ttsRate: 0.95,
    ttsVoice: '',
    examDate: '',
    repeatCount: 2,         // 자동 재생: 한 항목을 읽는 횟수
    repeatGap: 1.5,         // 자동 재생: 따라 말할 간격(초)
  },
};

// ---- 편집자 모드 (이 기기 브라우저에만 저장, 기본 꺼짐) ----
const EDITOR_KEY = 'opic-coach:editor';

export function isEditor() {
  try { return localStorage.getItem(EDITOR_KEY) === '1'; } catch { return false; }
}

export function setEditor(on) {
  try {
    if (on) localStorage.setItem(EDITOR_KEY, '1');
    else localStorage.removeItem(EDITOR_KEY);
  } catch { /* 저장 불가 시 무시 */ }
  return isEditor();
}

// 현재 주소가 GitHub Pages 일 때만 {owner, name} 을 돌려준다. 그 외에는 null.
function repoFromLocation() {
  try {
    const host = location.hostname.toLowerCase();
    const m = host.match(/^([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\.github\.io$/);
    if (!m) return null;
    const owner = m[1];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    // 사용자 페이지(owner.github.io 루트)면 저장소 이름은 owner.github.io
    return { owner, name: seg || `${owner}.github.io`, branch: 'main' };
  } catch {
    return null;
  }
}

function repo() {
  return isEditor() ? repoFromLocation() : null;
}

// 편집자 모드가 아니거나 주소를 유추할 수 없으면 null → 호출부에서 링크를 그리지 않는다.
export function githubEditUrl(path) {
  const r = repo();
  if (!r) return null;
  return `https://github.com/${r.owner}/${r.name}/edit/${r.branch}/${path}`;
}

export function githubUrl(path = '') {
  const r = repo();
  if (!r) return null;
  return `https://github.com/${r.owner}/${r.name}/${path}`;
}

export function contentBranch() {
  return repo()?.branch || 'main';
}

// 편집 링크 마크업. 편집자 모드가 아니면 빈 문자열이라 화면에 흔적이 남지 않는다.
export function editLinkHtml(path, label, cls = 'btn ghost block mt16') {
  const url = githubEditUrl(path);
  if (!url) return '';
  return `<a class="${cls}" href="${url}" target="_blank" rel="noopener">${label}</a>`;
}
