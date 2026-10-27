// 실전 답변 모음 (목록 · 문항 섀도잉 · 이전/다음 · 주제 ③ 답안 바로 가기) (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-bank.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
import { readFileSync } from 'node:fs';
const bank = JSON.parse(readFileSync(new URL('../data/answer-bank.json', import.meta.url), 'utf8'));
const items = bank.groups.flatMap(g => g.items);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

async function open(hash) {
  const page = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 30); };
  });
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.waitForTimeout(1200);
  return { page, errs };
}

// ---- 홈 · 주제 목록에서 들어가기 ----
{
  const { page, errs } = await open('#/home');
  check('홈: 실전 답변 카드', (await page.innerText('#view')).includes(bank.title));
  await page.click('a[href="#/bank"]');
  await page.waitForTimeout(800);
  const txt = await page.innerText('#view');
  check('목록: 전체 문항 수', txt.includes(`전체 ${items.length}`));
  check('목록: 문항 행 수', (await page.$$('#view .list-row')).length === items.length);
  check('목록: 영상 링크', !!(await page.$(`a[href="${bank.source.url}"]`)));
  await page.click('a.chip[href="#/bank?g=roleplay"]');
  await page.waitForTimeout(600);
  const rp = bank.groups.find(g => g.id === 'roleplay').items.length;
  check('목록: 롤플레이 필터', (await page.$$('#view .list-row')).length === rp);
  check('오류 없음 (목록)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 문항: 해석 · 섀도잉 · 이전/다음 ----
{
  const it = items[1];
  const { page, errs } = await open(`#/bank/${it.id}`);
  const txt = await page.innerText('#view');
  check('문항: 질문 · 해석', txt.includes(it.en.slice(0, 30)) && txt.includes(it.ko.slice(0, 10)));
  check('문항: 문장 수 = 해석 수', (await page.$$('.sent')).length === it.answerKo.length && (await page.$$('.sent-ko')).length === it.answerKo.length);
  check('문항: 레벨 버튼 숨김', await page.$eval('.seg', el => el.classList.contains('hidden')));
  const vid = await page.$eval('a[target=_blank]', a => a.href);
  check('문항: 영상 시작 시간 링크', vid.endsWith(`t=${it.t}`), vid);
  await page.click('.sent[data-i="0"]');
  await page.waitForTimeout(300);
  check('문항: 문장 탭하면 재생', (await page.evaluate(() => window.__spoken)).length > 0);
  await page.click('text=다음 ›');
  await page.waitForTimeout(800);
  check('문항: 다음 문항으로', page.url().endsWith(`#/bank/${items[2].id}`));
  await page.click('#ptabs [data-m=speak]');
  await page.waitForTimeout(300);
  check('문항: 직접 답변 탭', !!(await page.$('#rec')));
  check('오류 없음 (문항)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 주제 ③ 답안 탭의 바로 가기 ----
{
  const { page, errs } = await open('#/topic/housing?tab=q');
  await page.waitForTimeout(600);
  check('주제: 실전 답변 바로 가기', !!(await page.$('a[href="#/bank?g=housing"]')));
  check('오류 없음 (주제)', !errs.length, errs.join('\n'));
  await page.close();
}

await b.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
