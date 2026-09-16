// 모의고사 전 과정 진행 확인 (Chromium, TTS·녹음·인식을 가짜로 대체)
//
// 이 저장소는 의존성 없이 돌아가므로 playwright 는 CI 에 넣지 않았습니다.
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-mock.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

const page = await b.newPage({ viewport: { width: 412, height: 915 } });
const errs = [];
page.on('pageerror', e => { if (!/Failed to fetch/.test(e.message)) errs.push('pageerror: ' + e.message); });
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });

// TTS·녹음·인식을 가짜로 대체해 모의고사를 끝까지 돌린다
await page.addInitScript(() => {
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speaking: false, getVoices: () => [{ name: 'F', lang: 'en-US' }],
    speak(u) { setTimeout(() => u.onend?.(), 10); }, cancel() {}, onvoiceschanged: null } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release: async () => {}, addEventListener() {} }) } });
  // 음성 인식: 시작하면 바로 그럴듯한 답변을 확정 결과로 돌려준다
  const SAMPLE = 'Well, I usually go to the park near my house because it is really quiet and green. Last weekend I went there with my friend and we walked for about an hour, and after that we had coffee. It was really nice, so I think I will go again soon.';
  class FakeSR {
    constructor() { this.continuous = true; this.interimResults = true; }
    start() { setTimeout(() => this.onresult?.({ results: Object.assign([[{ transcript: SAMPLE }]], { 0: Object.assign([{ transcript: SAMPLE }], { isFinal: true }) }) }), 30); }
    stop() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeSR;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
});

await page.goto('http://localhost:8777/index.html#/mock');
await page.waitForTimeout(1200);
const listTxt = await page.innerText('#view');
check('모의고사 목록에 토스 세트가 없다', !/토익|토스/.test(listTxt));
check('등급표에 토스 열이 없다', !listTxt.includes('토스'));
const sets = await page.$$eval('#view a[href^="#/mock/run/"]', a => a.map(x => x.getAttribute('href')));
check('남은 세트는 OPIc 뿐', sets.every(h => !h.includes('tos')), JSON.stringify(sets));
console.log('   세트:', JSON.stringify(sets));

// 미니 모의고사를 끝까지 (건너뛰기로 빠르게)
await page.goto('http://localhost:8777/index.html#/mock/run/opic-mini');
await page.waitForTimeout(1200);
await page.click('#start');
await page.waitForTimeout(1200);
check('첫 문항이 뜬다', !!(await page.$('.qcard .q-en')), await page.innerText('#view').catch(() => ''));

let steps = 0;
while (steps++ < 30) {
  const skip = await page.$('#skip');
  if (!skip) break;
  await skip.click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);
const url = page.url();
check('끝까지 진행되어 결과 화면으로 간다', url.includes('#/mock/result/'), url);
const res = await page.innerText('#view');
check('결과에 토스 레벨 표기가 없다', !/토익|토스/.test(res), res.match(/.{0,30}(토익|토스).{0,30}/)?.[0]);
check('결과 화면이 그려진다', res.includes('추정 OPIc 등급'), res.slice(0, 150));
check('모의고사 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));

await page.goto('http://localhost:8777/index.html#/progress');
await page.waitForTimeout(1200);
const prog = await page.innerText('#view');
check('기록 화면에 모의고사가 반영된다', prog.includes('1회 응시'), prog.match(/\d+회 응시/)?.[0] || prog.slice(0, 120));
check('기록 화면 토스 표기 없음', !/토익|토스/.test(prog));

await page.close(); await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
