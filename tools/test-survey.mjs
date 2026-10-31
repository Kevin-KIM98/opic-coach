// 서베이 체크: 체크박스 선택 · 단일 선택 · 12개 카운트 · 시험일별 저장 · 주제 연결 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-survey.mjs
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

{
  const { page, errs } = await open('#/survey?date=2026-10-31');
  const txt = await page.innerText('#view');
  check('서베이: 상단 제목', (await page.innerText('.topbar .title')) === '서베이 체크' && !txt.includes('<header'));
  check('서베이: 1~7번 문항', ['1. 현재 귀하는', '3. 현재 귀하는 어디에', '4. 여가', '7. 휴가'].every(s => txt.includes(s)), txt.slice(0, 300));
  check('서베이: 체크박스 89개', (await page.$$('[data-opt]')).length === 89);
  check('서베이: 처음엔 0 / 12', txt.includes('0 / 12개 이상'));

  // 단일 선택: 거주지는 하나만
  await page.click('[data-opt="home1"]'); await page.click('[data-opt="home3"]');
  check('서베이: 단일 선택은 하나만', await page.$eval('[data-opt="home1"]', e => e.getAttribute('aria-checked')) === 'false'
    && await page.$eval('[data-opt="home3"]', e => e.getAttribute('aria-checked')) === 'true');

  // 다중 선택: 4~7번 합계
  for (const id of ['lei1', 'lei6', 'lei12', 'lei20', 'hob2', 'spo16', 'spo17', 'tra3', 'tra4', 'tra5', 'lei22', 'hob10']) await page.click(`[data-opt="${id}"]`);
  check('서베이: 12개 선택하면 12 / 12', (await page.innerText('#view')).includes('12 / 12개 이상'));
  await page.click('[data-opt="lei22"]');
  check('서베이: 다시 누르면 해제', (await page.innerText('#view')).includes('11 / 12개 이상'));

  const linked = await page.$$eval('a.list-row[href^="#/topic/"]', as => as.map(a => a.getAttribute('href')));
  check('서베이: 선택한 주제 연습 링크', ['housing', 'movies', 'park', 'cafe', 'music', 'jogging', 'vacation-home', 'travel-domestic', 'travel-overseas'].every(id => linked.includes(`#/topic/${id}`)), JSON.stringify(linked));
  check('서베이: 앱에 없는 주제 안내', (await page.innerText('#view')).includes('앱에 아직 주제가 없는 항목: TV 시청하기'));

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).surveys['2026-10-31']);
  check('서베이: 시험일별 저장', saved.length === 12 && saved.includes('home3'), JSON.stringify(saved));
  await page.reload(); await page.waitForTimeout(1000);
  check('서베이: 새로고침 후 유지', (await page.innerText('#view')).includes('11 / 12개 이상'));

  await page.goto('http://localhost:8777/index.html#/home'); await page.waitForTimeout(1000);
  check('홈: 서베이 체크 카드', (await page.innerText('#view')).includes('10월 31일 시험 · 12개 선택'));
  check('서베이: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.goto('http://localhost:8777/index.html#/survey'), await page.waitForTimeout(800), await page.screenshot({ path: `${OUT}/survey.png`, fullPage: false });
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
