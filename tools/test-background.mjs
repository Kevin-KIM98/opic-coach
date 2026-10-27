// 화면이 꺼져도 계속 재생 · 이어폰을 빼면 멈춤 (Chromium)
//
// 이어폰 분리는 안드로이드가 미디어를 일시정지하는 것(becoming noisy)과 같으므로, 백그라운드 재생용
// <audio> 를 바깥에서 pause() 해서 흉내 낸다. 화면 꺼짐은 visibilitychange(hidden) 로 흉내 낸다.
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-background.mjs
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 가 없습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
// 녹음 재생 테스트용: 만능 패턴 문장 전부를 '녹음 있음'으로 하고, 파일은 실제 짧은 녹음 하나로 대신한다
const pats = JSON.parse(readFileSync(new URL('../data/patterns.json', import.meta.url), 'utf8'));
const keyOf = (t) => createHash('sha1').update(t.split(/\s+/).filter(Boolean).join(' ')).digest('hex').slice(0, 16);
const patKeys = pats.groups.flatMap(g => g.items.flatMap(it => [it.en, ...(it.examples || [])])).map(keyOf);
const audioDir = new URL('../data/audio/', import.meta.url);
const sampleMp3 = readdirSync(audioDir).find(f => f.endsWith('.mp3'));

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let fails = 0;
const check = (l, c, d = '') => { if (!c) { fails++; console.log(`FAIL ${l}${d ? '\n     ' + d : ''}`); } else console.log(`ok   ${l}`); };

async function open(hash, settings = {}, { recorded = false } = {}) {
  const page = await b.newPage({ serviceWorkers: 'block', viewport: { width: 412, height: 915 } });
  // 기본은 음성 합성(목업)으로 읽게 하고, recorded 면 녹음 파일로 읽게 한다
  await page.route('**/data/audio/index.json', r => r.fulfill({ json: { keys: recorded ? patKeys : [] } }));
  if (recorded) await page.route('**/data/audio/*.mp3', r => r.fulfill({ contentType: 'audio/mpeg', body: readFileSync(new URL(sampleMp3, audioDir)) }));
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript((st) => {
    window.__spoken = [];
    window.__audios = [];
    // TTS 는 0.4초 걸리는 척, 취소되면 끝난 것으로
    let cur = null;
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); cur = setTimeout(() => u.onend?.(), 400); };
    window.speechSynthesis.cancel = () => { clearTimeout(cur); };
    const play = HTMLMediaElement.prototype.play;
    window.__plays = 0;
    HTMLMediaElement.prototype.play = function () { if (!window.__audios.includes(this)) window.__audios.push(this); if (!this.loop) window.__plays++; return play.call(this); };
    // 숨김 상태를 흉내 낼 수 있게
    let vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
    window.__hide = () => { vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); };
    if (Object.keys(st).length && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('opic-coach:v1', JSON.stringify({ settings: { target: 'IM3', ...st } }));
      sessionStorage.setItem('seeded', '1');
    }
  }, settings);
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.waitForTimeout(1200);
  return { page, errs };
}
const spokenCount = (page) => page.evaluate(() => window.__spoken.length);

// ---- 만능 패턴 자동 재생: 이어폰 분리 → 멈춤 ----
{
  const { page, errs } = await open('#/drill?tab=patterns&group=all:im3');
  await page.click('[data-toggle]');
  await page.waitForTimeout(900);
  const playing = await page.evaluate(() => window.__audios.some(a => !a.paused && a.loop));
  check('자동 재생: 백그라운드 오디오 재생 중', playing);
  check('자동 재생: 잠금 화면 정보', await page.evaluate(() => navigator.mediaSession.playbackState === 'playing' && !!navigator.mediaSession.metadata?.title));
  await page.evaluate(() => window.__audios.find(a => a.loop).pause());   // 이어폰 분리 = 미디어 일시정지
  await page.waitForTimeout(200);
  const n = await spokenCount(page);
  await page.waitForTimeout(1500);
  check('이어폰 분리: 더 읽지 않음', (await spokenCount(page)) === n, `${n} → ${await spokenCount(page)}`);
  const status = await page.innerText('[data-status]');
  check('이어폰 분리: 안내 문구', status.includes('이어폰이 빠졌'), status);
  check('이어폰 분리: 버튼이 다시 ▶', (await page.innerText('[data-toggle]')).includes('자동 재생'));
  check('이어폰 분리: 잠금 화면 정보 지움', await page.evaluate(() => navigator.mediaSession.playbackState === 'none'));
  // 직접 멈추면 이어폰 안내가 나오지 않는다
  await page.click('[data-toggle]');
  await page.waitForTimeout(600);
  await page.click('[data-toggle]');
  await page.waitForTimeout(300);
  check('직접 멈춤: 이어폰 안내 없음', !(await page.innerText('[data-status]')).includes('이어폰이 빠졌'));
  check('직접 멈춤: 백그라운드 오디오도 멈춤', await page.evaluate(() => window.__audios.every(a => a.paused)));
  check('오류 없음 (자동 재생)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 화면 꺼짐(hidden): 기본값은 계속 재생 ----
{
  const { page, errs } = await open('#/drill?tab=patterns&group=all:im3');
  await page.click('[data-toggle]');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__hide());
  const n = await spokenCount(page);
  await page.waitForTimeout(2500);
  check('화면 꺼짐: 계속 읽음', (await spokenCount(page)) > n, `${n} → ${await spokenCount(page)}`);
  check('오류 없음 (화면 꺼짐)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 화면 꺼짐 + '계속 재생' 끔: 멈춤 ----
{
  const { page } = await open('#/drill?tab=patterns&group=all:im3', { bgPlay: false });
  await page.click('[data-toggle]');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__hide());
  await page.waitForTimeout(200);
  const n = await spokenCount(page);
  await page.waitForTimeout(1500);
  check('계속 재생 끔: 화면 꺼지면 멈춤', (await spokenCount(page)) === n);
  await page.close();
}

// ---- 모범답안 전체 듣기에서도 이어폰 분리 → 멈춤 ----
{
  const { page, errs } = await open('#/practice/housing/housing-describe');
  await page.click('[data-all]');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__audios.find(a => a.loop).pause());
  await page.waitForTimeout(300);
  check('전체 듣기: 이어폰 분리 시 버튼 복귀', (await page.innerText('[data-all]')).includes('전체 듣기'));
  check('전체 듣기: 안내 토스트', ((await page.textContent('#toast')) || '').includes('이어폰이 빠졌'));
  check('오류 없음 (전체 듣기)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 녹음된 음성: <audio> 로 재생 → 화면이 꺼져도 계속, 이어폰 분리 시 멈춤 ----
if (sampleMp3) {
  const { page, errs } = await open('#/drill?tab=patterns&group=all:im3', {}, { recorded: true });
  await page.click('[data-toggle]');
  await page.waitForTimeout(800);
  const voiceSrc = () => page.evaluate(() => window.__audios.filter(a => !a.loop).map(a => a.currentSrc));
  const srcs = await voiceSrc();
  check('녹음 음성: 녹음 파일로 재생', srcs.some(x => /data\/audio\/[0-9a-f]{16}\.mp3$/.test(x)), srcs.join(' '));
  check('녹음 음성: 음성 합성은 쓰지 않음', (await spokenCount(page)) === 0);
  const plays = () => page.evaluate(() => window.__plays);
  await page.evaluate(() => window.__hide());
  const n = await plays();
  await page.waitForTimeout(4000);
  check('녹음 음성: 화면 꺼져도 다음 문장 재생', (await plays()) > n, `${n} → ${await plays()}`);
  // 이어폰 분리: 안드로이드는 재생 중인 미디어를 모두 일시정지한다
  await page.evaluate(() => window.__audios.forEach(a => a.pause()));
  await page.waitForTimeout(300);
  const m = await plays();
  await page.waitForTimeout(2500);
  check('녹음 음성: 이어폰 분리 시 멈춤', (await plays()) === m, `${m} → ${await plays()}`);
  check('녹음 음성: 안내 문구', (await page.innerText('[data-status]')).includes('이어폰이 빠졌'));
  check('오류 없음 (녹음 음성)', !errs.length, errs.join('\n'));
  await page.close();
} else console.log('skip 녹음 음성 (data/audio 에 mp3 없음)');

// ---- 설정: 두 옵션 ----
{
  const { page } = await open('#/settings');
  await page.click('#unplug [data-v="0"]');
  check('설정: 이어폰 옵션 저장', await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).settings.stopOnUnplug === false));
  await page.click('#bgplay [data-v="0"]');
  check('설정: 계속 재생 옵션 저장', await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).settings.bgPlay === false));
  await page.close();
}

await b.close();
console.log(fails ? `\n${fails} FAIL` : '\nall ok');
process.exit(fails ? 1 : 0);
