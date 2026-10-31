// 홈(주제별 집중 학습) · 주제 화면 4단계 · 주제 패턴 (Chromium)
//
// 돌려 보려면: npm i -D playwright && npx playwright install chromium
//              python3 -m http.server 8777 &
//              node tools/test-home.mjs
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

async function open(hash, seed = null) {
  const page = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(t)) errs.push('console: ' + t); });
  await page.addInitScript((s) => {
    window.__spoken = [];
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 30); };
    if (s && !sessionStorage.getItem('seeded')) { localStorage.setItem('opic-coach:v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); }
  }, seed);
  await page.goto('http://localhost:8777/index.html' + hash);
  await page.waitForTimeout(1200);
  return { page, errs };
}

// ---- 홈: 처음 ----
{
  const { page, errs } = await open('#/home');
  const txt = await page.innerText('#view');
  check('홈: 처음이면 자기소개부터 안내', txt.includes('처음이라면') && txt.includes('자기소개'), txt.slice(0, 300));
  check('홈: 주제 타일 17개 (일반회화 · 기출 포함)', (await page.$$('.tile')).length === 17);
  check('홈: 일반회화 섹션 · 일상 대화 타일', txt.includes('일반회화') && await page.$('.tile[href="#/topic/daily-talk"]') !== null);
  check('홈: 예전 학습 일정 없음', !txt.includes('오늘의 학습') && !txt.includes('밀린 과제') && !txt.includes('집중 학습 — 서베이'));
  check('홈: 모의고사 · 복습 버튼', txt.includes('모의고사') && txt.includes('복습'));
  check('홈: 잘못된 링크 없음', (await page.evaluate(() => [...document.querySelectorAll('#view a[href^="#/"]')].map(a => a.getAttribute('href'))
    .filter(h => !/^#\/(topic|topics|drill|mock|home|settings|progress|review|practice|bank|survey)(\/|\?|$)/.test(h)))).length === 0);
  check('홈: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  await page.close();
}

// ---- 주제 화면 4단계 + 이어서 학습 ----
{
  const { page, errs } = await open('#/topic/park');
  const tabs = await page.$$eval('#tabs button', bs => bs.map(x => x.textContent));
  check('주제: 4단계 탭', JSON.stringify(tabs) === JSON.stringify(['① 표현', '② 패턴', '③ 답안', '④ 팁']), JSON.stringify(tabs));
  check('주제: 진행 단계 표시', (await page.innerText('[data-steps]')).includes('패턴 0/6'));
  await page.click('#tabs button[data-tab="pat"]');
  await page.waitForTimeout(300);
  check('패턴: 목표 레벨 6개 문장', (await page.$$('[data-list] .expr')).length === 6);
  check('패턴: 패턴 틀 표시', (await page.$$('.pat-frame')).length === 6);
  check('패턴: 같은 레벨 답안으로 연결', (await page.$$('[data-list] a.note[href*="level=IM3"]')).length === 6);
  if (OUT) await page.screenshot({ path: `${OUT}/topic-pat.png`, fullPage: true });
  await page.click('[data-quiz]');
  await page.waitForTimeout(300);
  check('패턴: 퀴즈 1 / 8', (await page.innerText('#view')).includes('1 / 6'));
  await page.click('[data-show]');
  const expr = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')).expr);
  check('패턴: 퀴즈 결과가 주제 패턴 id 로 기록', Object.keys(expr).some(k => /^park#p\d$/.test(k)), JSON.stringify(expr));
  await page.click('#tabs button[data-tab="tips"]');
  await page.waitForTimeout(300);
  const tips = await page.innerText('#tabbody');
  check('팁: 출제 경향 (발음 훈련 없음)', tips.includes('출제 경향') && !tips.includes('발음 체크'));
  check('주제: 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForTimeout(800);
  const home = await page.innerText('#view');
  check('홈: 이어서 학습에 마지막 주제', home.includes('이어서 학습') && home.includes('공원'), home.slice(0, 300));
  if (OUT) await page.screenshot({ path: `${OUT}/home-continue.png` });
  await page.close();
}

// ---- 레벨별 패턴 · 답안 속 패턴 강조 ----
{
  const { page, errs } = await open('#/topic/park?tab=pat');
  const im = await page.$$eval('[data-list] .en', xs => xs.map(x => x.textContent));
  await page.click('[data-lv="AL"]'); await page.waitForTimeout(400);
  const al = await page.$$eval('[data-list] .en', xs => xs.map(x => x.textContent));
  check('레벨 전환: AL 패턴 6개, IM3 와 다른 문장', al.length === 6 && al[0] !== im[0]);
  check('레벨 전환: 주소에 레벨', page.url().includes('level=AL'));
  const combos = await page.$$('.combo');
  check('패턴 조합: AL 조합 2개', combos.length === 2, String(combos.length));
  check('패턴 조합: 두 패턴 세트 체인', (await page.$$('.combo .combo-chain .link.im3')).length >= 2 && (await page.$$('.combo .combo-chain .link.kang')).length >= 2);
  check('패턴 조합: 문장마다 한글', (await page.$$('.combo .combo-line .ko')).length === (await page.$$('.combo .combo-line .en')).length);
  if (OUT) await page.screenshot({ path: `${OUT}/combo.png`, fullPage: true });
  check('AL 은 IH·AL 패턴 틀만', (await page.$$eval('[data-list] .badge', xs => xs.map(x => x.textContent))).every(t => t === 'IH' || t === 'AL'));
  await page.click('[data-list] a.note'); await page.waitForTimeout(900);
  check('패턴 → AL 답안으로 이동', page.url().includes('level=AL'));
  const n = await page.$$eval('.answer .sent.pat', xs => xs.length);
  check('답안에 패턴 문장 강조', n >= 1, String(n));
  check('강조 문장 아래 패턴 틀', (await page.$$('.answer .sent-pat')).length === n);
  check('레벨 패턴 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  if (OUT) await page.screenshot({ path: `${OUT}/answer-pat.png`, fullPage: true });
  await page.close();
}

// ---- 예전 링크 호환 ----
{
  const { page, errs } = await open('#/topic/housing?tab=guide');
  check('예전 ?tab=guide 는 팁 탭으로', (await page.$eval('#tabs button.active', x => x.dataset.tab)) === 'tips');
  check('예전 링크 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
  const r = await open('#/plan');
  check('없어진 #/plan 은 홈으로', (await r.page.innerText('#view')).includes('주제별 집중 학습'));
  await r.page.close();
}

// ---- 학습 기록 일괄 초기화 (resetVersion) ----
{
  const seed = {
    settings: { target: 'AL', examDate: '2030-01-05' },
    expr: { 'park#e0': { box: 4, due: 0, seen: 3 }, 'pat:like#0': { box: 3, due: 0, seen: 2 } },
    practice: [{ qid: 'park-describe', topicId: 'park', score: 70, date: '2026-01-01T00:00:00Z' }],
    mocks: [{ id: 'x', title: 'mini', score: 60, level: 'IM2', date: '2026-01-01T00:00:00Z' }],
    activity: { '2026-01-01': 30 }, lastTopic: 'park',
  };
  const { page, errs } = await open('#/home', seed);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('opic-coach:v1')));
  check('초기화: 진도·연습·모의고사·학습일 삭제', !Object.keys(st.expr).length && !st.practice.length && !st.mocks.length && !Object.keys(st.activity).length && !st.lastTopic, JSON.stringify(st).slice(0, 300));
  check('초기화: 설정은 유지', st.settings.target === 'AL' && st.settings.examDate === '2030-01-05');
  check('초기화: 버전 기록', st.resetVersion === 1);
  const home = await page.innerText('#view');
  check('초기화 후 홈은 처음 상태', home.includes('처음이라면') && home.includes('목표 AL'), home.slice(0, 200));
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('opic-coach:v1')); s.expr['park#e1'] = { box: 1, due: 0, seen: 1 }; localStorage.setItem('opic-coach:v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(900);
  check('초기화는 한 번만 (새 기록은 유지)', await page.evaluate(() => !!JSON.parse(localStorage.getItem('opic-coach:v1')).expr['park#e1']));
  check('초기화 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

// ---- 발음 훈련 화면은 없어짐 ----
{
  const { page, errs } = await open('#/drill?tab=pron&set=sound-rl');
  const txt = await page.innerText('#view');
  check('발음 훈련 대신 만능 패턴', txt.includes('만능패턴 72문장') && !txt.includes('발음 훈련'), txt.slice(0, 200));
  check('하단 메뉴: 만능 패턴', (await page.innerText('#nav')).includes('만능 패턴'));
  check('발음 링크 콘솔 오류 없음', errs.length === 0, JSON.stringify(errs));
  await page.close();
}

await b.close();
console.log(fails ? `\n❌ ${fails}개 실패` : '\n✅ 모두 통과');
process.exit(fails ? 1 : 0);
