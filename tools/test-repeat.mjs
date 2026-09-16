// 반복 재생 테스트 (Chromium).
//
// 🔁 이 켜져 있으면 멈출 때까지 계속 반복되고, 끄면 설정한 횟수만큼만 읽고 멈추는지 확인합니다.
//
//   npm i -D playwright && npx playwright install chromium
//   python3 -m http.server 8777 &
//   node tools/test-repeat.mjs
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

// speechSynthesis 를 결정적인 가짜로 대체 (40ms 뒤 onend, 말한 내용 기록)
async function open(route, { repeat = 2, gap = 0, loop = true } = {}) {
  const page = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = [];
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    let timer = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        getVoices: () => [{ name: 'Fake US', lang: 'en-US' }],
        speak(u) { window.__spoken.push(u.text); timer = setTimeout(() => u.onend?.(), 40); },
        cancel() { clearTimeout(timer); },
        onvoiceschanged: null,
      },
    });
  });
  await page.addInitScript(([r, g, l]) => {
    const key = 'opic-coach:v1';
    const cur = JSON.parse(localStorage.getItem(key) || '{}');
    cur.settings = { ...(cur.settings || {}), repeatCount: r, repeatGap: g, repeatLoop: l };
    localStorage.setItem(key, JSON.stringify(cur));
  }, [repeat, gap, loop]);
  await page.goto(BASE + route);
  await page.reload();
  await page.waitForTimeout(900);
  return { page, errs };
}
const spoken = (page) => page.evaluate(() => window.__spoken.length);

// ---- 1. 주제 카드 모드: 🔁 켜짐 → 멈출 때까지 계속 ----
{
  const { page, errs } = await open('#/topic/self-intro?tab=expr', { repeat: 2, loop: true });
  await page.click('[data-flash]');
  await page.waitForTimeout(150);
  check('카드 모드: 🔁 칩이 켜져 있다', await page.evaluate(() => document.querySelector('[data-loop]')?.classList.contains('active')));
  check('카드 모드: 멈춤 버튼이 재생 상태', (await page.textContent('[data-toggle]')).includes('멈춤'));

  await page.waitForTimeout(900);
  const n1 = await spoken(page);
  check(`반복 2회를 넘겨 계속 읽는다 (${n1}회)`, n1 > 2, `${n1}회만 읽음`);
  await page.waitForTimeout(600);
  const n2 = await spoken(page);
  check(`기다리면 계속 늘어난다 (${n1} → ${n2})`, n2 > n1);
  const texts = await page.evaluate(() => new Set(window.__spoken).size);
  check('같은 카드만 반복한다 (다음 카드로 안 넘어감)', texts === 1);

  // 멈춤 버튼
  await page.click('[data-toggle]');
  await page.waitForTimeout(200);
  const n3 = await spoken(page);
  await page.waitForTimeout(500);
  check('⏸ 을 누르면 멈춘다', (await spoken(page)) === n3);
  check('멈추면 버튼이 ▶ 다시 듣기', (await page.textContent('[data-toggle]')).includes('다시 듣기'));
  await page.click('[data-toggle]');
  await page.waitForTimeout(300);
  check('▶ 을 다시 누르면 재생된다', (await spoken(page)) > n3);
  check('오류 없음', errs.length === 0, errs.join('\n     '));
  await page.close();
}

// ---- 2. 주제 카드 모드: 🔁 꺼짐 → 설정 횟수만큼만 ----
{
  const { page, errs } = await open('#/topic/self-intro?tab=expr', { repeat: 2, loop: false });
  await page.click('[data-flash]');
  await page.waitForTimeout(1200);
  const n = await spoken(page);
  check(`🔁 꺼짐: 딱 2번만 읽는다 (${n}회)`, n === 2, `${n}회 읽음`);
  check('끝나면 버튼이 ▶ 다시 듣기', (await page.textContent('[data-toggle]')).includes('다시 듣기'));
  // 칩을 눌러 켜면 바로 계속 반복으로 바뀐다
  await page.click('[data-loop]');
  await page.waitForTimeout(900);
  check('🔁 을 켜면 다시 계속 반복된다', (await spoken(page)) > n + 2);
  check('오류 없음', errs.length === 0, errs.join('\n     '));
  await page.close();
}

// ---- 3. 표현 목록 자동 재생 ----
{
  const { page, errs } = await open('#/topic/self-intro?tab=expr', { repeat: 1, loop: false });
  const total = await page.evaluate(() => document.querySelectorAll('[data-list] [data-say]:not([data-slow])').length);
  await page.click('.autoplay [data-toggle]');
  await page.waitForTimeout(total * 90 + 900);
  const n = await spoken(page);
  check(`목록: 🔁 꺼짐이면 한 바퀴(${total}개)로 끝난다 (${n}회)`, n === total, `${n}회 / ${total}개`);
  check('끝나면 안내가 뜬다', (await page.textContent('.autoplay [data-status]')).includes('🔁'));
  await page.close();

  const { page: p2 } = await open('#/topic/self-intro?tab=expr', { repeat: 1, loop: true });
  await p2.click('.autoplay [data-toggle]');
  await p2.waitForTimeout(total * 90 + 1200);
  const n2 = await spoken(p2);
  check(`목록: 🔁 켜짐이면 한 바퀴를 넘어 계속된다 (${n2}회 > ${total}개)`, n2 > total);
  await p2.close();
  check('오류 없음', errs.length === 0, errs.join('\n     '));
}

// ---- 4. 섀도잉 전체 듣기 ----
{
  const { page, errs } = await open('#/topic/self-intro?tab=q', { repeat: 1, loop: true });
  const first = await page.$$eval('a[href*="/practice/"]', as => (as[0] ? as[0].getAttribute('href') : ''));
  if (first) {
    await page.goto(BASE + first);
    await page.waitForTimeout(900);
    const sents = await page.evaluate(() => document.querySelectorAll('.sent').length);
    await page.click('[data-all]');
    await page.waitForTimeout(sents * 90 + 1200);
    const n = await spoken(page);
    check(`섀도잉: 문장 ${sents}개를 넘어 계속 반복한다 (${n}회)`, n > sents, `${n}회 / ${sents}문장`);
    check('재생 중 버튼은 ⏸ 멈춤', (await page.textContent('[data-all]')).includes('멈춤'));
    await page.click('[data-all]');
    await page.waitForTimeout(200);
    const n2 = await spoken(page);
    await page.waitForTimeout(500);
    check('⏸ 으로 멈춘다', (await spoken(page)) === n2);
  } else {
    check('연습 화면 링크를 찾음', false);
  }
  check('오류 없음', errs.length === 0, errs.join('\n     '));
  await page.close();
}

// ---- 5. 좁은 화면에서 컨트롤이 가로 스크롤을 만들지 않는다 ----
{
  const { page } = await open('#/topic/self-intro?tab=expr', { repeat: 2, loop: true });
  await page.click('[data-flash]');
  await page.waitForTimeout(200);
  check('카드 모드: 가로 스크롤 없음', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
