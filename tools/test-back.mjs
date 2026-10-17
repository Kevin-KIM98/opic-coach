// 뒤로 가기 · '이전' 버튼이 바로 직전 화면/카드로만 가는지 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-back.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };
const wait = (p, ms = 500) => p.waitForTimeout(ms);

async function open(hash) {
  const page = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript(() => { window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 20); });
  await page.goto('http://localhost:8777/index.html' + hash);
  await wait(page, 1200);
  return { page, errs };
}
const activeTab = (page) => page.$eval('#tabs button.active', x => x.dataset.tab).catch(() => null);
const back = async (page) => { await page.goBack(); await wait(page, 700); };

// ---- 홈 → 주제 → 탭 → 카드 → 뒤로 ----
{
  const { page, errs } = await open('#/home');
  await page.click('a.tile[href="#/topic/park"]'); await wait(page, 900);
  await page.click('#tabs button[data-tab="pat"]'); await wait(page);
  check('탭을 바꾸면 주소에 반영(기록은 안 쌓음)', page.url().includes('tab=pat'));
  await page.click('[data-flash]'); await wait(page, 800);
  check('카드 모드 진입', !!(await page.$('.flash')));
  await back(page);
  check('뒤로 → 카드에서 패턴 목록으로', !(await page.$('.flash')) && (await activeTab(page)) === 'pat' && (await page.$$('[data-list] .expr')).length === 6);
  await back(page);
  check('뒤로 한 번 더 → 홈 (탭 수만큼 되돌아가지 않음)', page.url().includes('#/home'), page.url());
  check('콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 카드 '목록으로' 버튼 / 헤더 뒤로 ----
{
  const { page } = await open('#/topics');
  await page.click('a[href="#/topic/movies"]'); await wait(page, 900);
  await page.click('[data-flash]'); await wait(page, 800);
  await page.click('[data-exit]'); await wait(page, 800);
  check('목록으로 → 표현 목록', !(await page.$('.flash')) && (await activeTab(page)) === 'expr');
  await page.click('[data-back]'); await wait(page, 800);
  check('헤더 ‹ → 주제 목록 (바로 직전 화면)', page.url().includes('#/topics'), page.url());
  await page.close();
}

// ---- 답안 연습 → 뒤로 → 보던 탭 그대로 ----
{
  const { page } = await open('#/topic/housing');
  await page.click('#tabs button[data-tab="q"]'); await wait(page);
  await page.click('a.list-row[href^="#/practice/housing/"]'); await wait(page, 900);
  check('질문 연습 화면', page.url().includes('#/practice/housing/'));
  await back(page);
  check('뒤로 → 보던 ③ 답안 탭', (await activeTab(page)) === 'q', String(await activeTab(page)));
  await page.close();
}

// ---- 카드 '‹ 이전' 은 바로 직전 카드 ----
{
  const { page } = await open('#/topic/park?tab=expr&mode=cards');
  const en = () => page.$eval('.flash .en', x => x.textContent);
  check('첫 카드에서는 이전 버튼 비활성', await page.$eval('[data-prev]', x => x.disabled));
  const first = await en();
  await page.click('[data-next]'); await wait(page, 300);
  await page.click('[data-next]'); await wait(page, 300);
  const third = await en();
  await page.click('[data-prev]'); await wait(page, 300);
  await page.click('[data-prev]'); await wait(page, 300);
  check('이전 두 번 → 첫 카드', (await en()) === first && third !== first);
  check('다시 첫 카드에서 이전 비활성', await page.$eval('[data-prev]', x => x.disabled));
  await page.close();
}

// ---- 퀴즈 '‹ 이전' ----
{
  const { page } = await open('#/topic/park?tab=pat&mode=quiz');
  check('퀴즈 첫 문제 이전 비활성', await page.$eval('[data-prev]', x => x.disabled));
  await page.click('[data-next]'); await wait(page, 300);
  check('퀴즈 다음 → 2 / 6', (await page.innerText('.flash')).includes('2 / 6'));
  await page.click('[data-prev]'); await wait(page, 300);
  check('퀴즈 이전 → 1 / 6', (await page.innerText('.flash')).includes('1 / 6'));
  await page.close();
}

// ---- 만능 패턴 화면도 같은 규칙 ----
{
  const { page } = await open('#/drill?tab=patterns');
  await page.click('a.list-row[href="#/drill?tab=patterns&group=like"]'); await wait(page, 800);
  await page.click('[data-quiz]'); await wait(page, 800);
  check('패턴 그룹 퀴즈 진입', (await page.innerText('#dbody')).includes('1 / 6'));
  await back(page);
  check('뒤로 → 그룹 목록', (await page.$$('[data-list] .expr')).length === 6);
  await back(page);
  check('뒤로 → 만능 패턴 개요', (await page.$$('#dbody .list .list-row')).length === 20);
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
