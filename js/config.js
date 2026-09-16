// 앱 전역 설정. 저장소 정보는 "콘텐츠 수정" 링크(GitHub 모바일 편집)에 사용됩니다.
export const CONFIG = {
  appName: 'OPIc Coach',
  version: '1.0.1',
  repo: {
    owner: 'Kevin-KIM98',
    name: 'opic-coach',
    branch: 'main',
  },
  // 기본 설정값 (설정 화면에서 변경 가능)
  defaults: {
    target: 'IM3',          // IM3 | IH | AL
    plan: '8w',             // 4w | 8w | 12w
    ttsRate: 0.95,
    ttsVoice: '',
    examDate: '',
  },
};

export function githubEditUrl(path) {
  const { owner, name, branch } = CONFIG.repo;
  return `https://github.com/${owner}/${name}/edit/${branch}/${path}`;
}

export function githubUrl(path = '') {
  const { owner, name } = CONFIG.repo;
  return `https://github.com/${owner}/${name}/${path}`;
}
