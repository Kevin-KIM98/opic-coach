// 만능 패턴 72문장 화면 · 말하기 퀴즈 · 예전 패턴/주제 기록 정리 · 주제 목록 페르소나 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-patterns.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const OUT = process.env.SHOT_DIR || '';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

async function open(hash, seed = null) {
  const page = await b.newPage({ serviceWorkers: 'block', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  // 녹음 파일 대신 음성 합성(목업)으로 읽게 한다 — 녹음 재생은 test-background.mjs 에서 따로 본다
  await page.route('**/data/audio/index.json', r => r.fulfill({ json: { keys: [] } }));
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript((s) => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 30); };
    if (s && !sessionStorage.getItem('seeded')) { localStorage.setItem('opic-coach:v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); }
  }, seed);
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.waitForTimeout(1200);
  return { page, errs };
}

// ---- 개요 ----
{
  const { page, errs } = await open('#/drill?tab=patterns');
  const txt = await page.innerText('#view');
  check('개요: 72 · 25 두 세트 진행률', /0\s*\/\s*72/.test(txt) && /0\s*\/\s*25/.test(txt), txt.slice(0, 400));
  check('개요: 두 영상 출처 링크', await page.$('a[href="https://www.youtube.com/watch?v=378IPmgXaWc"]') !== null && await page.$('a[href="https://www.youtube.com/watch?v=yFvkBuldv1Y"]') !== null);
  check('개요: 12개 테마 + IM3 Part 1·2 각 4개 그룹', (await page.$$('#dbody .list .list-row')).length === 20);
  check('개요: Part 2 영상 링크', await page.$('a[href="https://www.youtube.com/watch?v=Ivwc3Ou0Z9E"]') !== null);
  check('개요: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/patterns.png`, fullPage: true });
  await page.close();
}

// ---- 테마: 패턴 6개 · 예문 18개 ----
{
  const { page, errs } = await open('#/drill?tab=patterns&group=like');
  check('테마: 패턴 6개', (await page.$$('[data-list] .expr')).length === 6);
  check('테마: 예문 18개', (await page.$$('[data-list] [data-say]')).length === 18);
  check('테마: 패턴 틀(___) 표시', (await page.innerText('[data-list]')).includes('I really enjoy ___ in my free time.'));
  check('테마: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/patterns-group.png`, fullPage: true });
  await page.close();
}

// ---- 전체 순서대로 ----
{
  const { page } = await open('#/drill?tab=patterns&group=all');
  check('전체: 72개 패턴', (await page.$$('[data-list] .expr')).length === 72);
  check('전체: 216개 예문', (await page.$$('[data-list] [data-say]')).length === 216);
  await page.close();
}

// ---- IM3 필수 패턴 25 (영상 예문 4개씩) ----
{
  const { page, errs } = await open('#/drill?tab=patterns&group=all:im3');
  check('IM3 25: 패턴 25개', (await page.$$('[data-list] .expr')).length === 25);
  check('IM3 25: 예문 100개', (await page.$$('[data-list] [data-say]')).length === 100);
  check('IM3 25: 영상 예문', (await page.innerText('[data-list]')).includes('After work, I usually go to the gym.'));
  check('IM3 25: 같은 세트 그룹 칩만', (await page.$$eval('.chips .chip', xs => xs.map(x => x.textContent))).every(t => t === '전체' || t.startsWith('IM3')));
  await page.close();
}
{
  const { page, errs } = await open('#/drill?tab=patterns&group=all:im3b');
  check('Part 2: 패턴 25개 · 예문 100개', (await page.$$('[data-list] .expr')).length === 25 && (await page.$$('[data-list] [data-say]')).length === 100);
  check('Part 2: 영상 예문', (await page.innerText('[data-list]')).includes('Out of nowhere, it started raining.'));
  check('Part 2: 같은 세트 그룹 칩만', (await page.$$eval('.chips .chip', xs => xs.map(x => x.textContent))).every(t => t === '전체' || t.startsWith('Part 2')));
  check('Part 2: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  check('IM3 25: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 말하기 퀴즈 ----
{
  const { page, errs } = await open('#/drill?tab=patterns&group=all&mode=quiz');
  const txt = await page.innerText('#view');
  check('퀴즈: 1 / 72', txt.includes('1 / 72'), txt.slice(0, 200));
  check('퀴즈: 한국어 패턴이 문제로 나온다', txt.includes('여가 시간에 ___를 정말 즐겨요'));
  check('퀴즈: 정답은 처음에 숨김', await page.$eval('[data-ans]', e => e.classList.contains('hidden')));
  await page.click('[data-show]');
  check('퀴즈: 정답 보기 → 패턴 공개', !(await page.$eval('[data-ans]', e => e.classList.contains('hidden'))));
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).expr['pat:like#0']);
  check('퀴즈: 정답을 먼저 보면 "몰라요"로 기록', st && st.box === 1, JSON.stringify(st));
  await page.click('[data-next]');
  check('퀴즈: 다음 문제', (await page.innerText('#view')).includes('2 / 72'));
  check('퀴즈: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/patterns-quiz.png`, fullPage: true });
  await page.close();
}

// ---- 예전 패턴 기록 정리 ----
{
  const seed = { expr: { 'pat:opener#0': { box: 3, due: 0, seen: 2 }, 'pat:filler#2': { box: 1, due: 0, seen: 1 }, 'pat:like#1': { box: 4, due: 0, seen: 3 }, 'housing#e0': { box: 2, due: 0, seen: 1 } }, topicContentVersion: 5, resetVersion: 1 };
  const { page } = await open('#/home', seed);
  await page.waitForTimeout(500);
  const expr = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).expr);
  check('정리: 예전 패턴 기록 삭제', !expr['pat:opener#0'] && !expr['pat:filler#2'], JSON.stringify(expr));
  check('정리: 새 패턴 기록은 유지', expr['pat:like#1']?.box === 4);
  check('정리: 주제 표현 기록은 유지', expr['housing#e0']?.box === 2);
  await page.close();
}

// ---- 주제 내용 교체: 예전 주제 표현 기록 한 번 정리 ----
{
  const seed = { expr: { 'housing#e0': { box: 3, due: 0, seen: 2 }, 'pat:like#1': { box: 4, due: 0, seen: 3 } }, resetVersion: 1 };
  const { page, errs } = await open('#/topics', seed);
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')));
  check('주제 교체: 예전 주제 표현 기록 삭제', !st.expr['housing#e0'], JSON.stringify(st.expr));
  check('주제 교체: 패턴 기록은 유지', st.expr['pat:like#1']?.box === 4);
  check('주제 교체: 버전 기록', st.topicContentVersion === 5);
  const txt = await page.innerText('#view');
  check('주제 목록: 페르소나 카드', txt.includes('20년차') && txt.includes('답변 흐름'), txt.slice(0, 400));
  check('주제 목록: 출처 영상 링크', await page.$('a[href="https://youtu.be/fG3VEfKBkgw"]') !== null);
  check('주제 목록: 직장 주제', txt.includes('직장 · 업무'));
  check('주제 목록: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/topics.png`, fullPage: true });
  // 같은 버전에서 다시 학습한 기록은 지우지 않는다
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('opic-coach:v1')); s.expr['housing#e1'] = { box: 2, due: 0, seen: 1 }; localStorage.setItem('opic-coach:v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(800);
  check('주제 교체: 새 기록은 다시 지우지 않음', await page.evaluate(() => !!JSON.parse(localStorage.getItem('opic-coach:v1')).expr['housing#e1']));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
