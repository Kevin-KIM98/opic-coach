// 저장소 노출 방지 테스트 (Chromium).
//
// 평소(편집자 모드 꺼짐)에는 앱 어느 화면에도 GitHub 주소·계정명이 나오면 안 된다.
// 편집자 모드는 설정의 버전 표시를 7번 눌러야만 켜지고, 그때만 편집 링크가 생긴다.
//
//   npm i -D playwright && npx playwright install chromium
//   python3 -m http.server 8777 &
//   node tools/test-privacy.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const BASE = process.env.BASE || 'http://localhost:8777/index.html';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

const page = await b.newPage({ viewport: { width: 412, height: 915 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });

async function go(route) {
  await page.goto(BASE + route);
  await page.waitForTimeout(700);
  const hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href') || ''));
  const text = await page.evaluate(() => document.body.innerText);
  return { hrefs, text };
}

// 1. 기본 상태: 어느 화면에도 저장소 흔적이 없다
const routes = ['#/home', '#/settings', '#/topics', '#/drill?tab=patterns', '#/drill?tab=pron', '#/plan', '#/progress'];
for (const r of routes) {
  const { hrefs, text } = await go(r);
  const leaked = hrefs.filter(h => /github\.com/i.test(h));
  check(`${r}: GitHub 링크 없음`, leaked.length === 0, leaked.join(', '));
  check(`${r}: 저장소 안내 문구 없음`, !/콘텐츠 · 저장소|GitHub에서/.test(text));
}
// 주제 상세 화면(✏️ 아이콘이 있던 자리)도 확인
await page.goto(BASE + '#/topics');
await page.waitForTimeout(700);
const first = await page.$$eval('a[href^="#/topic"]', as => (as[0] ? as[0].getAttribute('href') : ''));
if (first) {
  const { hrefs, text } = await go(first);
  check('주제 상세: GitHub 링크 없음', !hrefs.some(h => /github\.com/i.test(h)));
  check('주제 상세: 편집 버튼 없음', !/GitHub에서/.test(text));
}

// 2. 설정: 버전만 남고 저장소 정보는 사라졌다
const s = await go('#/settings');
check('설정: 저장소 섹션 제거됨', !s.text.includes('콘텐츠 · 저장소'));
check('설정: 버전 표시는 남음', /OPIc Coach v\d+\.\d+\.\d+/.test(s.text));
check('설정: 계정/저장소 이름 없음', !/github/i.test(s.text));

// 3. 숨은 제스처(7번 탭)로만 편집자 모드가 켜진다
await page.click('#about'); await page.click('#about'); await page.click('#about');
await page.waitForTimeout(300);
check('3번만 눌러서는 켜지지 않음', !(await page.$('#editorOff')));
await page.waitForTimeout(1700);   // 연속 탭 판정 시간이 지나면 초기화된다
for (let i = 0; i < 7; i++) await page.click('#about');
await page.waitForTimeout(400);
check('7번 누르면 편집자 모드가 켜짐', !!(await page.$('#editorOff')));
check('편집자 모드는 이 기기에만 저장됨', await page.evaluate(() => localStorage.getItem('opic-coach:editor') === '1'));

// 4. 다시 끄면 흔적 없이 사라진다
await page.click('#editorOff');
await page.waitForTimeout(400);
check('끄면 편집자 카드가 사라짐', !(await page.$('#editorOff')));
check('끄면 저장값도 지워짐', await page.evaluate(() => localStorage.getItem('opic-coach:editor') === null));

// 5. 소스에 계정명이 박혀 있지 않다
const cfg = await (await fetch(new URL('js/config.js', BASE).href)).text();
check('js/config.js 에 하드코딩된 owner/repo 없음', !/owner:\s*['"]/.test(cfg), cfg.match(/owner:.*/)?.[0] || '');

check('콘솔/페이지 오류 없음', errs.length === 0, errs.join('\n     '));

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
