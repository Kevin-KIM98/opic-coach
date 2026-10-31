// 10/31 기출: 홈 기출 타일 · 주제 화면 · 기출 모의고사 15문항 순서 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-exam1031.mjs
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

const IDS = ['exam1031-intro', 'exam1031-home-describe', 'exam1031-home-room', 'exam1031-bookstore-describe', 'exam1031-bookstore-routine', 'exam1031-bookstore-particular',
  'exam1031-golf-describe', 'exam1031-golf-routine', 'exam1031-golf-experience',
  'exam1031-neighbor-describe', 'exam1031-neighbor-new', 'exam1031-neighbor-roleplay',
  'exam1031-holiday-describe', 'exam1031-holiday-experience', 'exam1031-holiday-compare'];

{
  const { page, errs } = await open('#/home');
  const txt = await page.innerText('#view');
  check('홈: 시험 기출 섹션 · 10/31 타일', txt.includes('시험 기출') && await page.$('.tile[href="#/topic/exam-1031"]') !== null);
  check('홈: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

for (const tab of ['expr', 'pat', 'q', 'tips']) {
  const { page, errs } = await open(`#/topic/exam-1031?tab=${tab}`);
  const txt = await page.innerText('#view');
  check(`주제(${tab}): 제목`, txt.includes('10/31 시험 기출'), txt.slice(0, 200));
  if (tab === 'q') check('주제(답안): 13문항 · 서점 particular 질문', txt.includes('particular book') && txt.includes('new neighbor') && txt.includes('golf'), txt.slice(0, 400));
  if (tab === 'q') check('주제(답안): 집 · 방 묘사 질문', txt.includes('Describe your home') && txt.includes('favorite room in your home'));
  if (tab === 'tips') check('주제(팁): 혼자 사는 페르소나 안내', txt.includes('혼자 살고'));
  check(`주제(${tab}): 콘솔 오류 없음`, errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/exam-${tab}.png` });
  await page.close();
}

{
  const { page, errs } = await open('#/mock');
  const sets = await page.$$eval('#view a[href^="#/mock/run/"]', a => a.map(x => x.getAttribute('href')));
  check('모의고사: 10/31 기출 세트가 맨 위', sets[0] === '#/mock/run/exam-1031', JSON.stringify(sets));
  await page.goto('http://localhost:8777/index.html#/mock/run/exam-1031');
  await page.waitForTimeout(1200);
  check('기출 모의고사: 설문 주제 고르기 없음', !(await page.$('#pickchips')));
  await page.click('#start');
  await page.waitForTimeout(1000);
  const seen = [];
  for (let i = 0; i < 30; i++) {
    const q = await page.$('.qcard .q-en');
    if (!q) break;
    seen.push((await q.innerText()).slice(0, 30));
    await page.click('#skip');
    await page.waitForTimeout(350);
  }
  const t = await import('fs').then(fs => JSON.parse(fs.readFileSync('data/topics/exam-1031.json', 'utf8')));
  const expected = IDS.map(id => t.questions.find(q => q.id === id).en.slice(0, 30));
  check('기출 모의고사: 15문항이 정해진 순서로', JSON.stringify(seen) === JSON.stringify(expected), JSON.stringify(seen));
  await page.waitForTimeout(1500);
  check('기출 모의고사: 결과 화면', page.url().includes('#/mock/result/'), page.url());
  check('기출 모의고사: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
