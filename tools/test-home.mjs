// 홈(주제별 집중 학습) · 주제 화면 4단계 · 주제 패턴 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-home.mjs
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
  const page = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
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

// ---- 홈: 처음 ----
{
  const { page, errs } = await open('#/home');
  const txt = await page.innerText('#view');
  check('홈: 처음이면 자기소개부터 안내', txt.includes('처음이라면') && txt.includes('자기소개'), txt.slice(0, 300));
  check('홈: 주제 타일 15개', (await page.$$('.tile')).length === 15);
  check('홈: 예전 학습 일정 없음', !txt.includes('오늘의 학습') && !txt.includes('밀린 과제') && !txt.includes('집중 학습 — 서베이'));
  check('홈: 모의고사 · 복습 버튼', txt.includes('모의고사') && txt.includes('복습'));
  check('홈: 잘못된 링크 없음', (await page.evaluate(() => [...document.querySelectorAll('#view a[href^="#/"]')].map(a => a.getAttribute('href'))
    .filter(h => !/^#\/(topic|topics|drill|mock|home|settings|progress|review|practice)(\/|\?|$)/.test(h)))).length === 0);
  check('홈: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  await page.close();
}

// ---- 주제 화면 4단계 + 이어서 학습 ----
{
  const { page, errs } = await open('#/topic/park');
  const tabs = await page.$$eval('#tabs button', bs => bs.map(x => x.textContent));
  check('주제: 4단계 탭', JSON.stringify(tabs) === JSON.stringify(['① 표현', '② 패턴', '③ 답안', '④ 팁']), JSON.stringify(tabs));
  check('주제: 진행 단계 표시', (await page.innerText('[data-steps]')).includes('패턴 0/8'));
  await page.click('#tabs button[data-tab="pat"]');
  await page.waitForTimeout(300);
  check('패턴: 8개 문장', (await page.$$('[data-list] .expr')).length === 8);
  check('패턴: 패턴 틀 표시', (await page.$$('.pat-frame')).length === 8);
  check('패턴: 답변 질문으로 연결', (await page.$$('[data-list] a.note[href^="#/practice/park/"]')).length === 8);
  if (OUT) await page.screenshot({ path: `${OUT}/topic-pat.png`, fullPage: true });
  await page.click('[data-quiz]');
  await page.waitForTimeout(300);
  check('패턴: 퀴즈 1 / 8', (await page.innerText('#view')).includes('1 / 8'));
  await page.click('[data-show]');
  const expr = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).expr);
  check('패턴: 퀴즈 결과가 주제 패턴 id 로 기록', Object.keys(expr).some(k => /^park#p\d$/.test(k)), JSON.stringify(expr));
  await page.click('#tabs button[data-tab="tips"]');
  await page.waitForTimeout(300);
  const tips = await page.innerText('#tabbody');
  check('팁: 전략 + 발음', tips.includes('출제 경향') && tips.includes('발음 체크'));
  check('주제: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForTimeout(800);
  const home = await page.innerText('#view');
  check('홈: 이어서 학습에 마지막 주제', home.includes('이어서 학습') && home.includes('공원'), home.slice(0, 300));
  if (OUT) await page.screenshot({ path: `${OUT}/home-continue.png` });
  await page.close();
}

// ---- 예전 링크 호환 ----
{
  const { page, errs } = await open('#/topic/housing?tab=guide');
  check('예전 ?tab=guide 는 팁 탭으로', (await page.$eval('#tabs button.active', x => x.dataset.tab)) === 'tips');
  check('예전 링크 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
  const r = await open('#/plan');
  check('없어진 #/plan 은 홈으로', (await r.page.innerText('#view')).includes('주제별 집중 학습'));
  await r.page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
