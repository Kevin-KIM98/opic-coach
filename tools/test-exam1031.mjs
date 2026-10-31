// 10/31 기출: 홈 기출 타일 · 주제 화면 · 기출 모의고사 17문항 순서 (Chromium)
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

const IDS = ['exam1031-intro', 'exam1031-home-describe', 'exam1031-home-room', 'exam1031-bookstore-describe', 'exam1031-bookstore-routine', 'exam1031-bookstore-particular', 'exam1031-golf-describe', 'exam1031-golf-routine', 'exam1031-golf-experience', 'exam1031-neighbor-describe', 'exam1031-neighbor-new', 'exam1031-rp-golf-ask', 'exam1031-rp-golf-solve', 'exam1031-rp-golf-exp', 'exam1031-holiday-describe', 'exam1031-holiday-experience', 'exam1031-holiday-compare'];

{
  const { page, errs } = await open('#/home');
  const txt = await page.innerText('#view');
  check('홈: 시험 기출 섹션 · 10/31 타일', txt.includes('시험 기출') && await page.$('.tile[href="#/topic/exam-1031"]') !== null);
  check('홈: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// 기출 주제: 질문·답안이 첫 탭, 빈 패턴 탭은 없음, 질문마다 레벨별 모범답안이 붙어 있음
{
  const { page, errs } = await open('#/topic/exam-1031');
  const tabs = await page.$$eval('#tabs button', bs => bs.map(x => x.textContent));
  check('기출 주제: 탭은 질문·답안 → 표현 → 팁', JSON.stringify(tabs) === JSON.stringify(['① 질문·답안', '② 표현', '③ 팁']), JSON.stringify(tabs));
  check('기출 주제: 처음 열면 질문·답안 탭', (await page.$eval('#tabs button.active', x => x.dataset.tab)) === 'q');
  check('기출 주제: 패턴 0/0 진행 막대 없음', !(await page.innerText('[data-steps]')).includes('패턴'));
  check('기출 주제: 질문 카드 17개', (await page.$$('.qa')).length === 17);
  check('기출 주제: 모의고사 바로 가기', (await page.$('a[href="#/mock/run/exam-1031"]')) !== null);
  await page.click('.qa >> nth=1 >> summary');
  const ans = await page.innerText('.qa >> nth=1 >> .answer');
  check('기출 주제: Q2 아래 IM3 집 묘사 답안', ans.startsWith("Okay, let me tell you about my home.") && ans.includes('There are two rooms'), ans.slice(0, 120));
  await page.click('[data-lv="IH"]'); await page.waitForTimeout(300);
  check('기출 주제: IH 로 바꾸면 IH 답안', (await page.innerText('.qa >> nth=1 >> summary')).includes('IH') && (await page.$eval('.qa >> nth=1 >> .answer', e => e.textContent)).includes('ladder') === false && (await page.$eval('.qa >> nth=1 >> .answer', e => e.textContent)).includes('south'));
  check('기출 주제: 레벨이 주소에 남음', page.url().includes('level=IH'));
  check('기출 주제: 연습 링크', (await page.$$('.qa a[href^="#/practice/exam-1031/"]')).length === 17);
  check('기출 주제: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/exam-qa.png` });
  await page.close();
}

for (const tab of ['expr', 'q', 'tips']) {
  const { page, errs } = await open(`#/topic/exam-1031?tab=${tab}`);
  const txt = await page.innerText('#view');
  check(`주제(${tab}): 제목`, txt.includes('10/31 시험 기출'), txt.slice(0, 200));
  if (tab === 'q') check('주제(답안): 서점 particular · 골프장 롤플레이 질문', txt.includes('particular book') && txt.includes('new neighbor') && txt.includes('recommended a golf course') && !txt.includes('Introduce yourself to your neighbor'), txt.slice(0, 400));
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
  check('기출 모의고사: 17문항이 정해진 순서로', JSON.stringify(seen) === JSON.stringify(expected), JSON.stringify(seen));
  await page.waitForTimeout(1500);
  check('기출 모의고사: 결과 화면', page.url().includes('#/mock/result/'), page.url());
  check('기출 모의고사: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
