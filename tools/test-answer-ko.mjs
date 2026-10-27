// 모범답안 문장별 한글 해석 · 한글 보고 말하기 모드 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-answer-ko.mjs
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

const page = await b.newPage({ serviceWorkers: 'block', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
// 녹음 파일 대신 음성 합성(목업)으로 읽게 한다 — 녹음 재생은 test-background.mjs 에서 따로 본다
await page.route('**/data/audio/index.json', r => r.fulfill({ json: { keys: [] } }));
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
await page.addInitScript(() => { window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 20); });
await page.goto('http://localhost:8777/index.html#/practice/self-intro/self-intro-general?level=IM3');
await page.waitForTimeout(1200);

const nSent = (await page.$$('.answer .sent')).length;
const nKo = (await page.$$('.answer .sent-ko')).length;
check('문장마다 한글 해석', nSent > 0 && nSent === nKo, `${nSent} / ${nKo}`);
check('첫 문장 해석 내용', (await page.$eval('.answer .sent-ko', x => x.textContent)).length > 3);
check('현재 문장 한글 큐 표시', !(await page.$eval('[data-cur-ko]', x => x.classList.contains('hidden'))));
if (OUT) await page.screenshot({ path: `${OUT}/answer-ko.png`, fullPage: true });

await page.click('[data-ko-toggle]'); await page.waitForTimeout(200);
check('해석 숨기기', await page.$eval('[data-answer]', x => x.classList.contains('ko-off')));
await page.click('[data-ko-toggle]'); await page.waitForTimeout(200);
check('해석 다시 보기', !(await page.$eval('[data-answer]', x => x.classList.contains('ko-off'))));

await page.click('[data-kofirst]'); await page.waitForTimeout(200);
check('한→영 모드: 영어 문장 가림', await page.$eval('[data-cur-text]', x => x.classList.contains('hidden')));
check('한→영 모드: 영어 보기 버튼', !(await page.$eval('[data-reveal-en]', x => x.classList.contains('hidden'))));
await page.click('[data-next]'); await page.waitForTimeout(200);
check('다음 문장에서도 가림 유지', await page.$eval('[data-cur-text]', x => x.classList.contains('hidden')));
await page.click('[data-reveal-en]'); await page.waitForTimeout(200);
check('영어 보기 → 공개', !(await page.$eval('[data-cur-text]', x => x.classList.contains('hidden'))));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).settings.koFirst);
check('한→영 설정 저장', saved === true);
await page.click('[data-prev]'); await page.click('[data-prev]'); await page.waitForTimeout(200);
check('첫 문장에서 이전은 마지막으로 넘어가지 않음', (await page.textContent('[data-cur]')).startsWith('1 /'));

// 레벨을 바꿔도 해석이 맞게 따라온다
await page.click('[data-lv="AL"]'); await page.waitForTimeout(400);
check('AL 도 문장 수 = 해석 수', (await page.$$('.answer .sent')).length === (await page.$$('.answer .sent-ko')).length);
check('콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
