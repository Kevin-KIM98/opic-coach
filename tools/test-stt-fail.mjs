// 음성 인식이 실패했을 때의 화면 동작 확인 (Chromium).
//
// 이 저장소는 의존성 없이 돌아가므로 playwright 는 CI 에 넣지 않았습니다.
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-stt-fail.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };
const BASE = process.env.BASE || 'http://localhost:8777';

// 인식은 시나리오대로 실패시키고, TTS·녹음·Wake Lock 은 가짜로 대체한다
async function openApp(scenario) {
  const page = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = [];
  page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
  await page.addInitScript(({ scenario }) => {
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, getVoices: () => [{ name: 'F', lang: 'en-US' }],
      speak(u) { setTimeout(() => u.onend?.(), 5); }, cancel() {}, onvoiceschanged: null } });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true,
      value: { request: async () => ({ release: async () => {}, addEventListener() {} }) } });
    // 녹음은 성공하는 척 (마이크 경합 안내 조건을 만들기 위해)
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    window.MediaRecorder = class {
      constructor() { this.state = 'recording'; this.mimeType = 'audio/webm'; }
      start() {} stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 5); }
    };
    window.MediaRecorder.isTypeSupported = () => true;
    if (scenario === 'offline') Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    // 음성 인식: 항상 결과 없이 끝나거나(no-speech) 권한 거부
    window.SpeechRecognition = class {
      start() {
        setTimeout(() => {
          if (scenario === 'denied') this.onerror?.({ error: 'not-allowed' });
          else if (scenario === 'offline') this.onerror?.({ error: 'network' });
          this.onend?.();
        }, 5);
      }
      stop() { this.onend?.(); }
      abort() {}
    };
  }, { scenario });
  return { page, errs };
}

async function recordNothing(page) {
  await page.click('.rec-btn');                 // 시작
  await page.waitForTimeout(600);
  await page.click('.rec-btn');                 // 종료
  await page.waitForTimeout(400);
}

// 1) 연습 화면: 인식 실패 시 등급·막대 대신 원인 + 직접 입력
{
  const { page, errs } = await openApp('denied');
  await page.goto(`${BASE}/#/practice/housing/housing-describe?mode=speak`);
  await page.waitForSelector('.rec-btn');
  await recordNothing(page);
  const body = await page.textContent('#result');
  check('권한 거부: 원인을 알려 준다', /마이크 권한/.test(body), body.slice(0, 160));
  check('권한 거부: NL\/NM 등급을 매기지 않는다', !/NL\/NM/.test(body), body.slice(0, 160));
  check('점수 막대를 그리지 않는다', (await page.locator('#result .parts .p').count()) === 0);
  check('직접 입력 채점 경로가 있다', await page.locator('#result [data-manual]').count() === 1);

  // 직접 입력하면 정상 채점된다
  await page.fill('#result [data-manual]',
    'I live in a small apartment in Seoul because it is close to my office. There are two bedrooms and a living room, and actually my favorite part is the balcony, so I usually drink coffee there in the morning. After that I water my plants and then I get ready for work.');
  await page.click('#result [data-score]');
  await page.waitForTimeout(200);
  const scored = await page.textContent('#result');
  check('직접 입력하면 채점된다', /추정 OPIc 등급/.test(scored), scored.slice(0, 120));
  check('직접 입력 결과는 기록에 남는다',
    await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).practice.length) === 1);
  check('인식 실패는 기록에 남지 않았다',
    await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).practice.every(p => p.words > 0)));
  check('콘솔 오류 없음', errs.length === 0, errs.join('\n'));
  await page.close();
}

// 2) 오프라인이면 인터넷 연결을 원인으로 짚는다
{
  const { page } = await openApp('offline');
  await page.goto(`${BASE}/#/practice/housing/housing-describe?mode=speak`);
  await page.waitForSelector('.rec-btn');
  await recordNothing(page);
  const body = await page.textContent('#result');
  check('오프라인: 인터넷 연결을 원인으로 짚는다', /인터넷 연결/.test(body), body.slice(0, 160));
  await page.close();
}

// 3) 설정의 음성 인식 점검 · 녹음 끄기
{
  const { page } = await openApp('denied');
  await page.goto(`${BASE}/#/settings`);
  await page.waitForSelector('#sttcheck');
  await page.click('#recaudio button[data-v="0"]');
  await page.waitForTimeout(200);
  check('녹음 끄기가 저장된다',
    await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).settings.recordAudio) === false);
  await page.click('#sttcheck');
  await page.waitForTimeout(5400);
  const out = await page.textContent('#sttresult');
  check('점검 버튼이 원인을 알려 준다', /마이크 권한/.test(out), out.slice(0, 160));
  await page.close();
}

await b.close();
console.log(fails ? `\n${fails}개 실패` : '\n전부 통과');
process.exit(fails ? 1 : 0);
