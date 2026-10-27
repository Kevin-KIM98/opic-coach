// 레벨(IM3 · IH · AL) 전환 테스트 (Chromium).
//
// 섀도잉 화면에서 레벨을 몇 번이든 계속 바꿀 수 있어야 합니다.
// (예전에는 한 번 바꾸면 그다음부터 버튼이 먹지 않았습니다.)
//
//   npm i -D playwright && npx playwright install chromium
//   python3 -m http.server 8777 &
//   node tools/test-level.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const BASE = process.env.BASE || 'http://localhost:8777/index.html';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

const page = await b.newPage({ viewport: { width: 412, height: 915 } });
const errs = [];
page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });

// speechSynthesis 는 결정적인 가짜로 (레벨 전환만 보면 되므로 말은 바로 끝난다)
await page.addInitScript(() => {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  let timer = null;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speaking: false,
      getVoices: () => [{ name: 'Fake US', lang: 'en-US' }],
      speak(u) { window.__spoken.push(u.text); timer = setTimeout(() => u.onend?.(), 30); },
      cancel() { clearTimeout(timer); },
      onvoiceschanged: null,
    },
  });
});

// 자기소개 첫 질문의 섀도잉 화면으로 이동
await page.goto(BASE + '#/topic/self-intro?tab=q');
await page.waitForTimeout(900);
const first = await page.$$eval('a[href*="/practice/"]', as => (as[0] ? as[0].getAttribute('href') : ''));
if (!first) { console.log('FAIL 연습 화면 링크를 찾음'); await b.close(); process.exit(1); }
await page.goto(BASE + first);
await page.waitForTimeout(900);

const active = () => page.evaluate(() => document.querySelector('[data-lv].active')?.dataset.lv || '');
const words = () => page.evaluate(() => document.querySelector('.xs.muted')?.textContent || '');
const levels = await page.$$eval('[data-lv]', bs => bs.map(x => x.dataset.lv));
check(`레벨 버튼이 3개 (${levels.join(' · ')})`, levels.length === 3, levels.join(','));

// 한 바퀴를 두 번 — 같은 버튼 순서를 반복해도 매번 바뀌어야 한다
const seen = [];
for (const lv of [...levels, ...levels, levels[1], levels[0], levels[2]]) {
  await page.click(`[data-lv="${lv}"]`);
  await page.waitForTimeout(150);
  const now = await active();
  seen.push(now);
  check(`${lv} 선택 → 활성 표시가 ${lv}`, now === lv, `활성: ${now || '없음'}`);
}
check('레벨을 9번 연속으로 바꿨다', seen.length === 9);

// 본문도 실제로 레벨마다 달라진다
const texts = {};
for (const lv of levels) {
  await page.click(`[data-lv="${lv}"]`);
  await page.waitForTimeout(150);
  texts[lv] = await page.evaluate(() => document.querySelector('[data-answer]')?.textContent.trim() || '');
}
check('레벨마다 모범답안 본문이 다르다', new Set(Object.values(texts)).size === levels.length,
  Object.entries(texts).map(([k, v]) => `${k}: ${v.slice(0, 40)}…`).join('\n     '));
check('단어·문장 수 안내도 함께 갱신된다', /단어 · \d+문장/.test(await words()));

// 전체 듣기 중에 레벨을 바꾸면 이전 레벨 재생이 멈춘다
await page.click(`[data-lv="${levels[0]}"]`);
await page.waitForTimeout(150);
await page.click('[data-all]');
await page.waitForTimeout(200);
await page.click(`[data-lv="${levels[2]}"]`);
await page.waitForTimeout(150);
check('레벨을 바꾸면 전체 듣기 버튼이 ▶ 로 돌아온다', (await page.textContent('[data-all]')).includes('전체 듣기'));
const n = await page.evaluate(() => window.__spoken.length);
await page.waitForTimeout(500);
check('이전 레벨 재생이 멈춘다', (await page.evaluate(() => window.__spoken.length)) === n);

// 바꾼 뒤에도 섀도잉 체크가 새 본문을 따라간다
const curText = await page.evaluate(() => document.querySelector('[data-cur-text]')?.textContent.trim() || '');
check('섀도잉 체크 문장이 바뀐 레벨의 첫 문장', texts[levels[2]].startsWith(curText.slice(0, 20)), `현재: ${curText.slice(0, 40)}…`);

check('오류 없음', errs.length === 0, errs.join('\n     '));
await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
