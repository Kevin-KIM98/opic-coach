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
  check('목록: 영상 링크 (레벨별)', (await Promise.all(bank.levels.map(l => page.$(`a[href="${l.source.url}"]`)))).every(Boolean));
  await page.click('a.chip[href="#/bank?g=roleplay"]');
  await page.waitForTimeout(600);
  const rp = bank.groups.find(g => g.id === 'roleplay').items.length;
  check('목록: 롤플레이 필터', (await page.$$('#view .list-row')).length === rp);
  check('오류 없음 (목록)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- 문항: 레벨 전환 · 해석 · 섀도잉 · 이전/다음 ----
{
  const it = items.find(x => Object.keys(x.answers).length > 1) || items[1];
  const idx = items.indexOf(it);
  const lvs = bank.levels.map(l => l.id).filter(l => it.answers[l]);
  const { page, errs } = await open(`#/bank/${it.id}`);
  const txt = await page.innerText('#view');
  check('문항: 질문 · 해석', txt.includes(it.en.slice(0, 30)) && txt.includes(it.ko.slice(0, 10)));
  // 목표 등급 기본값 IM3 → IM 답변부터
  const first = lvs.find(l => l.startsWith('IM')) || lvs[0];
  check('문항: 기본 레벨 IM', (await page.$$('.sent')).length === it.answersKo[first].length && (await page.$$('.sent-ko')).length === it.answersKo[first].length);
  const hrefs = await page.$$eval('a[target=_blank]', as => as.map(a => a.href));
  check('문항: 레벨별 영상 시작 시간 링크', lvs.every(l => hrefs.some(h => h.endsWith(`t=${it.t[l]}`))), hrefs.join(' '));
  if (lvs.length > 1) {
    const other = lvs.find(l => l !== first);
    await page.click(`[data-lv="${other}"]`);
    await page.waitForTimeout(300);
    check('문항: 레벨 전환', (await page.$$('.sent')).length === it.answersKo[other].length && (await page.innerText('[data-answer]')).includes(it.answers[other].slice(0, 25)));
    await page.click('text=다음 문항 ›');
    await page.waitForTimeout(800);
    check('문항: 다음 문항으로', page.url().endsWith(`#/bank/${items[idx + 1].id}`));
    const nx = items[idx + 1];
    if (nx.answers[other]) check('문항: 고른 레벨 유지', (await page.innerText('[data-answer]')).includes(nx.answers[other].slice(0, 25)));
  }
  await page.click('.sent[data-i="0"]');
  await page.waitForTimeout(300);
  check('문항: 문장 탭하면 재생', (await page.evaluate(() => window.__spoken)).length > 0);
  await page.click('#ptabs [data-m=speak]');
  await page.waitForTimeout(300);
  check('문항: 직접 답변 탭', !!(await page.$('#rec')));
  check('오류 없음 (문항)', !errs.length, errs.join('\n'));
  await page.close();
}

// ---- IH–AL 만 있는 문항: 레벨 버튼 숨김 ----
{
  const it = items.find(x => Object.keys(x.answers).length === 1);
  if (it) {
    const { page, errs } = await open(`#/bank/${it.id}`);
    check('단일 레벨 문항: 레벨 버튼 숨김', await page.$eval('.seg', el => el.classList.contains('hidden')));
    check('오류 없음 (단일 레벨)', !errs.length, errs.join('\n'));
    await page.close();
  }
}

// ---- 목록 전체 듣기: 질문 한 번 → 답변 문장, 재생 중 문항 표시, 레벨 · 필터 ----
{
  const split = (t) => t.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g).map(x => x.trim()).filter(Boolean);
  const { page, errs } = await open('#/bank?g=housing');
  const hs = bank.groups.find(g => g.id === 'housing').items;
  check('전체 듣기: 버튼', !!(await page.$('[data-bank-play] [data-toggle]')));
  // 간격 1.5초 → 2.5초 → 없음
  await page.click('[data-bank-play] [data-gap]');
  await page.click('[data-bank-play] [data-gap]');
  await page.click('[data-bank-play] [data-lv="IM"]');
  await page.click('[data-bank-play] [data-toggle]');
  await page.waitForTimeout(700);
  const spoken = await page.evaluate(() => window.__spoken);
  check('전체 듣기: 질문부터 한 번', spoken[0] === hs[0].en && spoken[1] !== hs[0].en, JSON.stringify(spoken.slice(0, 3)));
  check('전체 듣기: 이어서 IM 답변 첫 문장', spoken[1] === split(hs[0].answers.IM)[0], JSON.stringify(spoken.slice(0, 3)));
  // 목업 음성은 문장당 30ms 라 이미 몇 문항 지났을 수 있다 — 표시가 하나뿐이고 상태와 맞는지 본다
  const marked = await page.$$eval('.list-row.saying', els => els.map(e => e.dataset.id));
  const status = await page.innerText('[data-bank-play] [data-status]');
  const n = hs.findIndex(x => x.id === marked[0]) + 1;
  check('전체 듣기: 재생 중 문항 표시', marked.length === 1 && n > 0, JSON.stringify(marked));
  check('전체 듣기: 상태 문구', status.startsWith(`${n} / ${hs.length}`), status);
  check('전체 듣기: 🌙 버튼', await page.$eval('.dim-btn', el => !el.classList.contains('hidden')));
  // 레벨을 바꾸면 그 레벨로 처음부터
  await page.evaluate(() => { window.__spoken = []; });
  await page.click('[data-bank-play] [data-lv="IH–AL"]');
  await page.waitForTimeout(700);
  const sp2 = await page.evaluate(() => window.__spoken);
  check('전체 듣기: IH–AL 로 바꾸면 그 답변', sp2.includes(split(hs[0].answers['IH–AL'])[0]), JSON.stringify(sp2.slice(0, 3)));
  await page.click('[data-bank-play] [data-toggle]');
  await page.waitForTimeout(200);
  check('전체 듣기: 멈춤', (await page.innerText('[data-bank-play] [data-toggle]')).includes('전체 듣기'));
  check('전체 듣기: 멈추면 표시 지움', !(await page.$('.list-row.saying')));
  // 질문 끄기
  await page.click('[data-bank-play] [data-q]');
  await page.evaluate(() => { window.__spoken = []; });
  await page.click('[data-bank-play] [data-toggle]');
  await page.waitForTimeout(500);
  check('전체 듣기: 질문 끄면 답변부터', (await page.evaluate(() => window.__spoken[0])) === split(hs[0].answers['IH–AL'])[0]);
  // 다른 주제로 바꾸면 멈춘다
  await page.click('a.chip[href="#/bank?g=shopping"]');
  await page.waitForTimeout(800);
  check('전체 듣기: 주제를 바꾸면 멈춤', (await page.innerText('[data-bank-play] [data-toggle]')).includes('전체 듣기'));
  check('오류 없음 (전체 듣기)', !errs.length, errs.join('\n'));
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
