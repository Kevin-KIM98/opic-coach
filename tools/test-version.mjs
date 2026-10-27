// 홈 상단 버전 · 업데이트 시각 표시, 서버에 새 버전이 있을 때 '새 버전 적용' 버튼 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-version.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
import { readFileSync } from 'node:fs';
const cfg = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const version = cfg.match(/version:\s*'([^']+)'/)[1];
const updated = cfg.match(/updated:\s*'([^']+)'/)[1];
const [, mo, d, hm] = updated.match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})$/);
const label = `v${version} · ${Number(mo)}월 ${Number(d)}일 ${hm} 업데이트`;

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, dd = '') => { if (!c) { fails++; console.log(`FAIL ${l}${dd ? '\n     ' + dd : ''}`); } else console.log(`ok   ${l}`); };

async function open(hash, serverConfig = null) {
  const page = await b.newPage({ serviceWorkers: 'block', viewport: { width: 412, height: 915 } });
  // 녹음 파일 대신 음성 합성(목업)으로 읽게 한다 — 녹음 재생은 test-background.mjs 에서 따로 본다
  await page.route('**/data/audio/index.json', r => r.fulfill({ json: { keys: [] } }));
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  if (serverConfig) await page.route(/js\/config\.js\?check=/, r => r.fulfill({ contentType: 'text/javascript', body: serverConfig }));
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.waitForTimeout(1500);
  return { page, errs };
}

{
  const { page, errs } = await open('#/home');
  check('홈: 버전 · 업데이트 시각', (await page.innerText('[data-ver]')) === label, await page.innerText('[data-ver]'));
  check('홈: 최신이면 업데이트 버튼 없음', !(await page.$('[data-update]')));
  check('오류 없음', !errs.length, errs.join('\n'));
  await page.close();
}
{
  const newer = cfg.replace(`version: '${version}'`, "version: '99.0.0'").replace(`updated: '${updated}'`, "updated: '2099-01-02 03:04'");
  const { page, errs } = await open('#/home', newer);
  const btn = await page.$('[data-update]');
  check('홈: 서버에 새 버전이 있으면 적용 버튼', !!btn && (await btn.innerText()).includes('v99.0.0') && (await btn.innerText()).includes('1월 2일 03:04'));
  check('오류 없음 (새 버전)', !errs.length, errs.join('\n'));
  await page.close();
}
{
  const { page } = await open('#/settings');
  check('설정: 버전 · 업데이트 시각', (await page.innerText('#about')).includes(label));
  await page.close();
}

await b.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
