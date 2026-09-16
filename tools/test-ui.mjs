// 자동 반복 재생 · 화면 유지 · 가로 화면 UI 테스트 (Chromium).
//
// 이 저장소는 의존성 없이 돌아가므로 playwright 는 CI 에 넣지 않았습니다.
// 돌려 보려면 한 번만 설치하세요:
//   npm i -D playwright && npx playwright install chromium
//   python3 -m http.server 8777 &
//   node tools/test-ui.mjs            # SHOT_DIR=/tmp/shots 를 주면 스크린샷도 남김
//
// TTS 와 Wake Lock 은 결정적인 가짜로 바꿔 타이밍에 흔들리지 않게 합니다.
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

async function open(url, { landscape = false, repeat = 2, gap = 0 } = {}) {
  const page = await b.newPage({
    viewport: landscape ? { width: 915, height: 412 } : { width: 412, height: 915 },
    deviceScaleFactor: 2,
  });
  const errs = [];
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });

  // speechSynthesis 를 결정적인 가짜로 대체: 말한 순서를 기록하고 40ms 뒤 onend
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__cancels = 0;
    class FakeUtter {
      constructor(text) { this.text = text; }
    }
    window.SpeechSynthesisUtterance = FakeUtter;
    let timer = null;
    window.__wake = { requests: 0, releases: 0, held: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => {
        window.__wake.requests++; window.__wake.held++;
        return { release: async () => { window.__wake.releases++; window.__wake.held--; }, addEventListener() {} };
      } },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        getVoices: () => [{ name: 'Fake US', lang: 'en-US' }],
        speak(u) { window.__spoken.push(u.text); timer = setTimeout(() => u.onend?.(), 40); },
        cancel() { window.__cancels++; clearTimeout(timer); },
        onvoiceschanged: null,
      },
    });
  });
  // 케이스 간 설정이 새지 않도록 매번 고정값을 심는다 (gap 0 = 결정적 타이밍)
  await page.addInitScript(([r, g]) => {
    const key = 'opic-coach:v1';
    const cur = JSON.parse(localStorage.getItem(key) || '{}');
    cur.settings = { ...(cur.settings || {}), repeatCount: r, repeatGap: g };
    localStorage.setItem(key, JSON.stringify(cur));
  }, [repeat, gap]);
  await page.goto(url);
  await page.reload();
  await page.waitForTimeout(900);
  return { page, errs };
}

// ---- 1. 주제 표현 탭: 자동 반복 ----
{
  const { page, errs } = await open('http://localhost:8777/index.html#/topic/self-intro?tab=expr', { repeat: 2, gap: 0 });
  const bar = await page.$('.autoplay');
  check('표현 탭에 자동 재생 바가 있다', !!bar);
  check('반복 2회 표시', (await page.textContent('[data-repeat]')) === '반복 2회');
  check('간격 0 이면 "간격 없음"', (await page.textContent('[data-gap]')) === '간격 없음');

  await page.click('[data-toggle]');
  await page.waitForTimeout(150);
  check('재생 중 버튼이 멈춤으로 바뀐다', (await page.textContent('[data-toggle]')).includes('멈춤'));
  check('wake lock 을 요청한다', (await page.evaluate(() => window.__wake.requests)) >= 1);
  check('현재 항목이 강조된다', (await page.$$('.saying')).length === 1);

  await page.waitForTimeout(600);
  const spoken = await page.evaluate(() => window.__spoken);
  // 같은 문장을 2회씩 읽고 다음으로 넘어가야 한다
  check('같은 항목을 2번 읽는다', spoken[0] === spoken[1] && spoken[0] !== undefined, JSON.stringify(spoken.slice(0, 4)));
  check('다음 항목으로 넘어간다', spoken[2] !== undefined && spoken[2] !== spoken[0], JSON.stringify(spoken.slice(0, 4)));

  // 스크롤이 계속 움직여도 멈춤 버튼을 실제로 누를 수 있어야 한다
  await page.click('[data-toggle]', { timeout: 4000 });
  await page.waitForTimeout(200);
  const n = await page.evaluate(() => window.__spoken.length);
  check('재생 중에도 멈춤 버튼을 누를 수 있다', true);
  check('멈추면 버튼이 되돌아온다', (await page.textContent('[data-toggle]')).includes('자동 재생'));
  check('멈추면 강조가 사라진다', (await page.$$('.saying')).length === 0);
  check('멈추면 wake lock 을 놓는다', (await page.evaluate(() => window.__wake.held)) === 0);
  await page.waitForTimeout(700);
  check('멈춘 뒤 더 읽지 않는다', (await page.evaluate(() => window.__spoken.length)) === n,
    `이전 ${n} → 현재 ${await page.evaluate(() => window.__spoken.length)}`);

  // 반복/간격 설정 순환 + 저장
  await page.click('[data-repeat]');
  check('반복 설정이 순환한다', (await page.textContent('[data-repeat]')) === '반복 3회');
  await page.click('[data-gap]');
  check('간격 설정이 순환한다', (await page.textContent('[data-gap]')) === '간격 0.8초');
  // 새로고침은 테스트용 초기화 스크립트가 값을 덮어쓰므로 저장소를 직접 확인한다
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).settings);
  check('설정이 저장소에 남는다', saved.repeatCount === 3 && saved.repeatGap === 0.8, JSON.stringify(saved));

  check('콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/ap-expr.png` });
  await page.close();
}

// ---- 2. 탭을 옮기면 멈춘다 ----
{
  const { page } = await open('http://localhost:8777/index.html#/topic/self-intro?tab=expr');
  await page.click('[data-toggle]');
  await page.waitForTimeout(200);
  await page.click('#tabs button[data-tab="guide"]');
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.__spoken.length);
  await page.waitForTimeout(600);
  check('탭을 바꾸면 재생이 멈춘다', (await page.evaluate(() => window.__spoken.length)) === n);
  check('탭을 바꾸면 wake lock 해제', (await page.evaluate(() => window.__wake.held)) === 0);
  await page.close();
}

// ---- 3. 화면을 떠나면 멈춘다 ----
{
  const { page } = await open('http://localhost:8777/index.html#/topic/self-intro?tab=expr');
  await page.click('[data-toggle]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.__spoken.length);
  await page.waitForTimeout(600);
  check('다른 화면으로 가면 멈춘다', (await page.evaluate(() => window.__spoken.length)) === n);
  check('떠나면 wake lock 해제', (await page.evaluate(() => window.__wake.held)) === 0);
  await page.close();
}

// ---- 4. 발음 훈련 (drill) ----
{
  const { page, errs } = await open('http://localhost:8777/index.html#/drill?tab=pron&set=sound-rl');
  const hasBar = await page.$('.autoplay');
  check('발음 훈련에 자동 재생 바가 있다', !!hasBar);
  if (hasBar) {
    await page.click('[data-toggle]');
    await page.waitForTimeout(900);
    check('발음 훈련도 자동 재생된다', (await page.evaluate(() => window.__spoken.length)) >= 2);
    await page.click('[data-toggle]');
  }
  check('발음 훈련 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/ap-pron.png` });
  await page.close();
}

// ---- 5. 만능 패턴 ----
{
  const { page, errs } = await open('http://localhost:8777/index.html#/drill?tab=patterns&group=opener');
  check('만능 패턴에 자동 재생 바가 있다', !!(await page.$('.autoplay')));
  await page.click('[data-toggle]');
  await page.waitForTimeout(900);
  check('패턴도 자동 재생된다', (await page.evaluate(() => window.__spoken.length)) >= 2);
  await page.click('[data-toggle]');
  check('패턴 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 7. 카드 모드: 카드마다 자동 반복 ----
{
  const { page, errs } = await open('http://localhost:8777/index.html#/topic/self-intro?tab=expr', { repeat: 3, gap: 0 });
  await page.click('[data-flash]');
  await page.waitForTimeout(600);
  const spoken = await page.evaluate(() => window.__spoken);
  check('카드 모드가 3번 반복한다', spoken.length >= 3 && spoken[0] === spoken[2], JSON.stringify(spoken));
  check('카드 모드도 화면을 켜 둔다', (await page.evaluate(() => window.__wake.requests)) >= 1);

  await page.evaluate(() => { window.__spoken = []; });
  await page.click('[data-next]');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__spoken);
  check('다음 카드도 자동 재생된다', after.length >= 2 && after[0] === after[1], JSON.stringify(after));
  check('다음 카드는 다른 문장', after[0] !== spoken[0]);

  await page.click('[data-exit]');
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => window.__spoken.length);
  await page.waitForTimeout(500);
  check('목록으로 나가면 멈춘다', (await page.evaluate(() => window.__spoken.length)) === n);
  check('카드 모드 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 8. 섀도잉 전체 듣기 ----
{
  const { page, errs } = await open('http://localhost:8777/index.html#/practice/self-intro/self-intro-general?level=IM3', { repeat: 2, gap: 0 });
  const $all = await page.$('[data-all]');
  check('섀도잉에 전체 듣기 버튼이 있다', !!$all);
  if ($all) {
    await page.click('[data-all]');
    await page.waitForTimeout(500);
    const spoken = await page.evaluate(() => window.__spoken);
    check('전체 듣기가 문장마다 2번 읽는다', spoken.length >= 2 && spoken[0] === spoken[1], JSON.stringify(spoken.slice(0, 3)));
    check('재생 중 버튼이 멈춤으로 바뀐다', (await page.textContent('[data-all]')).includes('멈춤'));
    check('섀도잉도 화면을 켜 둔다', (await page.evaluate(() => window.__wake.held)) >= 1);
    await page.click('[data-all]', { timeout: 4000 });
    await page.waitForTimeout(200);
    const n = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(500);
    check('다시 누르면 멈춘다', (await page.evaluate(() => window.__spoken.length)) === n);
    check('멈추면 화면 유지 해제', (await page.evaluate(() => window.__wake.held)) === 0);
  }
  check('섀도잉 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 9. 반복 설정은 화면끼리 공유된다 ----
{
  const { page } = await open('http://localhost:8777/index.html#/drill?tab=patterns&group=opener', { repeat: 5, gap: 0 });
  check('패턴 화면에도 같은 설정이 보인다', (await page.textContent('[data-repeat]')) === '반복 5회');
  await page.close();
}

// ---- 6. 가로 화면 ----
for (const [name, url] of [
  ['홈', '#/home'], ['주제 표현', '#/topic/self-intro?tab=expr'],
  ['발음 훈련', '#/drill?tab=pron&set=sound-rl'], ['설정', '#/settings'],
]) {
  const { page, errs } = await open('http://localhost:8777/index.html' + url, { landscape: true });
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    navH: document.querySelector('.nav')?.getBoundingClientRect().height,
    cols: getComputedStyle(document.querySelector('.list') || document.body).gridTemplateColumns,
  }));
  check(`가로 ${name}: 가로 스크롤 없음`, m.scrollW <= m.clientW + 1, `${m.scrollW} > ${m.clientW}`);
  check(`가로 ${name}: 하단 탭이 작아짐`, !m.navH || m.navH <= 52, String(m.navH));
  check(`가로 ${name}: 콘솔 오류 없음`, errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/land-${name}.png` });
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
