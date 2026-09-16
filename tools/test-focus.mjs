// 집중 학습 화면 · 서베이 추천 · 토익스피킹 제거 확인 (Chromium)
//
// 이 저장소는 의존성 없이 돌아가므로 playwright 는 CI 에 넣지 않았습니다.
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-focus.mjs
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

async function open(hash, { target = 'IM3', landscape = false } = {}) {
  const page = await b.newPage({ viewport: landscape ? { width: 915, height: 412 } : { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript((tg) => {
    const key = 'opic-coach:v1';
    const cur = JSON.parse(localStorage.getItem(key) || '{}');
    cur.settings = { ...(cur.settings || {}), target: tg };
    localStorage.setItem(key, JSON.stringify(cur));
  }, target);
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.reload();
  await page.waitForTimeout(1400);
  return { page, errs };
}

// ---- 집중 학습 화면 ----
for (const [target, days, nTopics] of [['IM3', 14, 6], ['IH', 28, 10], ['AL', 42, 13]]) {
  const { page, errs } = await open('#/focus', { target });
  const txt = await page.innerText('#view');
  check(`${target}: 코스 기간 표시`, txt.includes(`${days}일`), txt.slice(0, 120));
  check(`${target}: 주제 개수`, txt.includes(`이 주제만 하세요 (${nTopics}개)`), txt.match(/이 주제만 하세요[^\n]*/)?.[0]);
  check(`${target}: 달성 조건 섹션`, txt.includes(`${target} 달성 조건`));
  check(`${target}: 서베이 추천/회피 모두 표시`, txt.includes('피하세요') && txt.includes('여가활동'));
  check(`${target}: HTML 이 텍스트로 새지 않음`, !/<div|&lt;/.test(txt));
  check(`${target}: 콘솔 오류 없음`, errs.length === 0, JSON.stringify(errs));
  // 링크가 모두 실재하는 화면을 가리키는지
  const bad = await page.evaluate(() => [...document.querySelectorAll('#view a[href^="#/"]')]
    .map(a => a.getAttribute('href'))
    .filter(h => !/^#\/(topic|topics|drill|mock|focus|home|settings|plan|progress|review)(\/|\?|$)/.test(h)));
  check(`${target}: 잘못된 링크 없음`, bad.length === 0, JSON.stringify(bad));
  if (target === 'IM3') await page.screenshot({ path: `${OUT}/focus.png`, fullPage: true });
  await page.close();
}

// ---- 체크 저장 ----
{
  const { page } = await open('#/focus', { target: 'IM3' });
  const before = await page.$$eval('[data-check].done', els => els.length);
  await page.click('[data-check]');
  await page.waitForTimeout(300);
  check('달성 조건 체크가 켜진다', (await page.$$eval('[data-check].done', e => e.length)) === before + 1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).focusChecks);
  check('체크가 저장된다', Array.isArray(saved) && saved.length === 1 && saved[0].startsWith('IM3#'), JSON.stringify(saved));
  check('진행률이 반영된다', (await page.innerText('#view')).includes('1 / 5'), (await page.innerText('#view')).match(/\d+ \/ \d+ 완료/)?.[0]);

  await page.click('[data-pick]');
  await page.waitForTimeout(300);
  const picks = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).surveyPicks);
  check('서베이 선택이 저장된다', Array.isArray(picks) && picks.length === 1, JSON.stringify(picks));
  await page.reload(); await page.waitForTimeout(1400);
  check('새로고침 후에도 유지된다', (await page.$$eval('[data-check].done, [data-pick].done', e => e.length)) === 2);
  await page.close();
}

// ---- 홈 · 주제 목록의 진입점 ----
for (const [name, hash] of [['홈', '#/home'], ['주제 목록', '#/topics']]) {
  const { page, errs } = await open(hash);
  const href = await page.$eval('#view a[href="#/focus"]', a => a.textContent.trim()).catch(() => null);
  check(`${name}에 집중 학습 입구가 있다`, !!href, String(href));
  check(`${name} 콘솔 오류 없음`, errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 가로 화면 ----
{
  const { page, errs } = await open('#/focus', { landscape: true });
  const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  check('가로: 가로 스크롤 없음', m.s <= m.c + 1, `${m.s} > ${m.c}`);
  check('가로: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/focus-land.png` });
  await page.close();
}

// ---- 토익스피킹 흔적이 UI 에 남아 있지 않은지 ----
for (const hash of ['#/home', '#/topics', '#/mock', '#/progress', '#/settings', '#/focus', '#/topic/self-intro?tab=q']) {
  const { page, errs } = await open(hash);
  const txt = await page.innerText('body');
  check(`${hash}: 토익/토스 표기 없음`, !/토익|토스|TOS |파트 ?1/.test(txt), txt.match(/.{0,30}(토익|토스|TOS).{0,30}/)?.[0]);
  check(`${hash}: 콘솔 오류 없음`, errs.length === 0, JSON.stringify(errs));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
