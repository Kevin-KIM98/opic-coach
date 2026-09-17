// 답변 전사(transcript)를 분석해 OPIc 등급을 추정하는 휴리스틱 채점기.
// 실제 채점 기준(과제 수행·문맥·정확성·구성·유창성)을 근사한 것으로, 학습 방향을 잡는 용도입니다.

const CONNECTORS = ['because', 'so', 'but', 'and then', 'after that', 'first', 'then', 'also', 'however', 'for example',
  'when', 'while', 'since', 'although', 'actually', 'especially', 'compared to', 'than', 'used to', 'in the past', 'nowadays',
  'these days', 'on the other hand', 'in addition', 'on top of that', 'the thing is', 'to be honest', 'even though', 'whenever',
  'as a result', 'that\'s why', 'in the end', 'at first', 'finally', 'overall', 'anyway', 'speaking of', 'what i like most'];

const IRREGULAR_PAST = ['went', 'was', 'were', 'had', 'took', 'got', 'saw', 'came', 'made', 'did', 'said', 'felt', 'bought', 'ate',
  'met', 'found', 'told', 'thought', 'left', 'lost', 'spent', 'gave', 'knew', 'began', 'ran', 'drove', 'flew', 'sat', 'stood', 'woke',
  'slept', 'brought', 'built', 'caught', 'chose', 'forgot', 'heard', 'kept', 'paid', 'put', 'read', 'sent', 'sold', 'taught', 'wore',
  'won', 'wrote', 'became', 'broke', 'fell', 'grew', 'held', 'led', 'rode', 'shook', 'spoke', 'swam', 'threw', 'understood', 'could', 'would'];

const ADV_STRUCTS = ['have been', 'has been', 'had been', 'used to', 'would', 'if i', 'which', 'who', 'that i', 'what i', 'the reason',
  'not only', 'as if', 'ever since', 'even though', 'whenever', 'i\'ve never', 'one of the', 'the best', 'the most', 'much more',
  'a lot more', 'in order to', 'so that', 'as soon as', 'by the time', 'looking back', 'long story short', 'ended up', 'turned out'];

const FILLERS = /\b(um+|uh+|uhm+|hmm+|er+|ah+)\b/gi;

const TYPE_MARKERS = {
  describe: ['there is', 'there are', 'it has', 'located', 'next to', 'on the left', 'on the right', 'in front of', 'behind', 'when you walk in', 'my favorite', 'it looks', 'it feels', 'big', 'small', 'cozy', 'quiet', 'clean', 'in the middle'],
  routine: ['usually', 'always', 'every', 'sometimes', 'often', 'first', 'then', 'after', 'before', 'in the morning', 'after work', 'on weekends', 'twice', 'once a', 'times a'],
  experience: ['ago', 'last', 'when i', 'one day', 'at first', 'in the end', 'after that', 'finally', 'i remember', 'that day', 'happened', 'it was'],
  comparison: ['than', 'used to', 'compared', 'nowadays', 'these days', 'in the past', 'back then', 'now', 'difference', 'both', 'while', 'whereas', 'more', 'less', 'better', 'prefer'],
  opinion: ['i think', 'i believe', 'in my opinion', 'because', 'first', 'second', 'for example', 'reason', 'agree', 'disagree', 'personally', 'that\'s why', 'prefer'],
  'roleplay-ask': ['could you', 'can you', 'do you', 'is there', 'are there', 'how much', 'what time', 'when', 'where', 'how many', 'i was wondering', 'i\'d like to', 'i have a few questions', 'i\'m calling'],
  'roleplay-solve': ['sorry', 'problem', 'afraid', 'unfortunately', 'could we', 'how about', 'instead', 'would it be possible', 'another', 'refund', 'exchange', 'reschedule', 'is there any way', 'i understand'],
  'roleplay-experience': ['ago', 'last', 'when i', 'one day', 'at first', 'in the end', 'after that', 'happened', 'similar', 'i remember'],
};

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function count(text, phrase) {
  const re = new RegExp(`(^|[^a-z'])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z']|$)`, 'g');
  return (text.match(re) || []).length;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function ramp(x, x0, x1, y0, y1) { if (x <= x0) return y0; if (x >= x1) return y1; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }

export const LEVELS = [
  { level: 'NL/NM', min: 0, score: 0 },
  { level: 'IL', min: 25, score: 1 },
  { level: 'IM1', min: 40, score: 2 },
  { level: 'IM2', min: 52, score: 3 },
  { level: 'IM3', min: 63, score: 4 },
  { level: 'IH', min: 78, score: 5 },
  { level: 'AL', min: 90, score: 6 },
];
export function toLevel(score) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (score >= l.min) cur = l;
  return cur;
}
export function levelIndex(level) { return LEVELS.findIndex(l => l.level === level); }

// 인식 실패 결과: 모든 항목 0점 · 등급 표시 없음 · 원인 안내만.
// ctx.sttNote 로 화면에서 진단한 원인 한 줄을 받는다 (speech.js 의 sttDiagnosis().title).
function failedResult(seconds, ctx = {}) {
  return {
    score: 0, level: '-', failed: true,
    metrics: { words: 0, wpm: 0, connectors: 0, pastRatio: 0, ttr: 0, fillers: 0, longPauses: 0, questionCount: 0, advUsed: [], exprHits: 0, seconds: Math.round(seconds || 0) },
    parts: { volume: 0, structure: 0, grammar: 0, vocab: 0, fluency: 0, bonus: 0 },
    feedback: [{ kind: 'bad', text: ctx.sttNote || '음성이 인식되지 않아 채점하지 못했어요. 마이크 권한과 인터넷 연결(음성 인식은 온라인 필요)을 확인하세요.' }],
  };
}

/**
 * @param {string} transcript
 * @param {number} seconds 발화 시간
 * @param {object} ctx {type, expressions:[string], segments:[{t}], answerSeconds}
 */
export function analyze(transcript, seconds, ctx = {}) {
  const type = ctx.type || 'describe';
  const text = norm(transcript);
  const tokens = text ? text.split(' ') : [];
  const words = tokens.length;

  // 인식된 말이 하나도 없으면 채점 자체가 성립하지 않는다.
  // 기본 점수를 준 항목(문법·어휘·유창성)만 막대가 차 있어 "0점인데 7/15" 처럼 보이던 문제를 막는다.
  if (words === 0) return failedResult(seconds, ctx);

  const minutes = Math.max(seconds || 1, 5) / 60;
  const wpm = words / minutes;

  // 연결어
  let connectors = 0;
  const usedConnectors = [];
  for (const c of CONNECTORS) { const n = count(text, c); if (n) { connectors += n; usedConnectors.push(c); } }

  // 과거시제
  const edWords = tokens.filter(w => w.length > 3 && /ed$/.test(w) && !/(need|bed|red|feed|speed|wed|shed)$/.test(w));
  const irregular = tokens.filter(w => IRREGULAR_PAST.includes(w));
  const pastCount = edWords.length + irregular.length;
  const verbsApprox = Math.max(1, Math.round(words / 7));
  const pastRatio = pastCount / verbsApprox;

  // 고급 구조
  const advUsed = ADV_STRUCTS.filter(p => count(text, p) > 0);

  // 어휘 다양성
  const uniq = new Set(tokens.filter(w => w.length > 2));
  const ttr = words ? uniq.size / Math.sqrt(words) : 0; // 길이 보정 TTR (root TTR)
  const longWords = tokens.filter(w => w.length >= 7).length / Math.max(1, words);

  // 필러 · 침묵
  const fillers = (transcript.match(FILLERS) || []).length;
  let longPauses = 0;
  if (ctx.segments && ctx.segments.length > 1) {
    for (let i = 1; i < ctx.segments.length; i++) if (ctx.segments[i].t - ctx.segments[i - 1].t > 6) longPauses++;
  }

  // 유형별 마커
  const markers = TYPE_MARKERS[type] || TYPE_MARKERS.describe;
  const markerHits = markers.filter(m => count(text, m) > 0);
  const questionCount = (text.match(/\b(could you|can you|do you|is there|are there|how much|how many|what time|when does|when is|where is|where can|does it|will there|would it)\b/g) || []).length;

  // 학습 표현 사용
  const exprHits = [];
  for (const e of ctx.expressions || []) {
    const ne = norm(e).split(' ').filter(w => w.length > 1);
    for (let i = 0; i + 3 <= ne.length; i++) {
      const gram = ne.slice(i, i + 3).join(' ');
      if (count(text, gram) > 0) { exprHits.push(e); break; }
    }
  }

  // ---------- 점수 ----------
  // 1. 발화량 (30)
  const target = type.startsWith('roleplay-ask') ? 80 : 170;
  let volume = 26 * Math.sqrt(clamp(words / target, 0, 1)) + ramp(words, target, target * 1.3, 0, 4);
  if (wpm < 55 && words > 10) volume *= 0.8;

  // 2. 구성·연결 (25)
  let structure = clamp(connectors * 2.5, 0, 14) + clamp(markerHits.length * 2.2, 0, 11);
  if (type === 'roleplay-ask') structure = clamp(questionCount * 4, 0, 16) + clamp(markerHits.length * 1.5, 0, 9);

  // 짧은 답변일수록 기본 점수를 깎는다 (25단어 미만은 비례해서 축소)
  const cover = clamp(words / 25, 0, 1);

  // 3. 문법·시제 (15)
  let grammar;
  if (/experience/.test(type)) grammar = clamp(pastRatio * 22, 0, 12) + (advUsed.length ? 3 : 0);
  else if (type === 'comparison') grammar = 7 + (count(text, 'used to') || count(text, 'than') || count(text, 'compared') ? 5 : 0) + (advUsed.length ? 3 : 0);
  else grammar = 7 + clamp(advUsed.length * 2, 0, 8);
  grammar *= cover;

  // 4. 어휘 (15)
  let vocab = (clamp(ramp(ttr, 2.5, 7.5, 2, 11), 0, 11) + clamp(longWords * 25, 0, 4)) * cover;

  // 5. 유창성 (15)
  let fluency = (ramp(wpm, 40, 110, 4, 12) + 3) * cover;
  fluency -= clamp(fillers * 0.7, 0, 5);
  fluency -= clamp(longPauses * 2, 0, 6);
  fluency = clamp(fluency, 0, 15);

  // 보너스: 학습 표현 사용
  const bonus = clamp(exprHits.length * 1.5, 0, 5);

  const score = Math.round(clamp(volume + structure + grammar + vocab + fluency + bonus, 0, 100));
  const level = toLevel(score);

  // ---------- 피드백 ----------
  const fb = [];
  if (words < target * 0.5) fb.push({ kind: 'bad', text: `발화량이 부족해요 (${words}단어). 목표는 ${target}단어 이상. '이유 + 예시 + 느낌' 한 세트를 더 붙이세요.` });
  else if (words >= target) fb.push({ kind: 'good', text: `발화량 충분 (${words}단어). 이제 디테일의 질을 올릴 차례예요.` });
  if (wpm > 0 && wpm < 70 && words > 15) fb.push({ kind: 'warn', text: `말하기 속도가 느려요 (${Math.round(wpm)} wpm). 섀도잉으로 문장을 통째로 입에 붙이면 빨라집니다. 목표 100 wpm.` });
  if (connectors < 3) fb.push({ kind: 'warn', text: '연결어가 적어요. because / so / and then / after that / actually 를 문장 사이에 넣어 보세요.' });
  else fb.push({ kind: 'good', text: `연결어 ${connectors}회 사용: ${usedConnectors.slice(0, 5).join(', ')}` });
  if (/experience/.test(type) && pastRatio < 0.4) fb.push({ kind: 'bad', text: '경험 질문인데 과거시제가 부족해요. went / was / had / took / felt 로 끝까지 과거로 말하세요.' });
  if (type === 'comparison' && !count(text, 'used to') && !count(text, 'than') && !count(text, 'compared')) fb.push({ kind: 'warn', text: "비교 표현이 없어요. 'used to ~, but now ~' 또는 'A is more ~ than B' 를 꼭 넣으세요." });
  if (type === 'roleplay-ask' && questionCount < 3) fb.push({ kind: 'bad', text: `질문이 ${questionCount}개만 인식됐어요. 롤플레이 11번은 질문 3~4개가 필수: Could you tell me ~? / Do you have ~? / How much ~?` });
  if (type === 'roleplay-solve' && !markerHits.some(m => ['how about', 'instead', 'could we', 'would it be possible', 'is there any way'].includes(m))) fb.push({ kind: 'warn', text: "대안 제시 표현을 넣으세요: 'How about ~ instead?' / 'Would it be possible to ~?'" });
  if (fillers >= 4) fb.push({ kind: 'warn', text: `'um/uh' 가 ${fillers}회. 대신 'Well,' 'Actually,' 'Let me think,' 같은 영어 필러로 바꾸세요.` });
  if (longPauses >= 2) fb.push({ kind: 'warn', text: `긴 침묵이 ${longPauses}회 있었어요. 막히면 'The thing is,' 로 시간을 벌고 이어 가세요.` });
  if (advUsed.length) fb.push({ kind: 'good', text: `고급 구조 사용: ${advUsed.slice(0, 4).join(', ')}` });
  else if (words > 40) fb.push({ kind: 'tip', text: "IH를 노리려면 'which / who' 관계절, 'have been ~ing', 'one of the best ~' 를 한 번씩 넣으세요." });
  if (exprHits.length) fb.push({ kind: 'good', text: `학습 표현 ${exprHits.length}개 활용` });
  if (ttr < 3.2 && words > 40) fb.push({ kind: 'tip', text: '같은 단어가 반복돼요. good → great / amazing / relaxing, like → enjoy / love 로 바꿔 보세요.' });

  return {
    score, level: level.level, failed: false,
    metrics: { words, wpm: Math.round(wpm), connectors, pastRatio: +pastRatio.toFixed(2), ttr: +ttr.toFixed(2), fillers, longPauses, questionCount, advUsed, exprHits: exprHits.length, seconds: Math.round(seconds || 0) },
    parts: { volume: Math.round(volume), structure: Math.round(structure), grammar: Math.round(grammar), vocab: Math.round(vocab), fluency: Math.round(fluency), bonus: Math.round(bonus) },
    feedback: fb,
  };
}

// 섀도잉: 원문과 전사 비교 (단어 정확도)
export function compareToText(transcript, text) {
  const a = norm(text).split(' ').filter(Boolean);
  const b = norm(transcript).split(' ').filter(Boolean);
  if (!a.length) return { accuracy: 0, missing: [], score: 0 };
  // LCS 기반 일치율
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  // 매칭된 단어 표시
  const matched = new Array(a.length).fill(false);
  let i = a.length, j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { matched[i - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  const accuracy = dp[a.length][b.length] / a.length;
  const missing = a.filter((w, k) => !matched[k]);
  const score = Math.round(accuracy * 100);
  return { accuracy, missing, matched, words: a, score };
}

// 모의고사 전체 점수 → 등급 (문항 평균, 롤플레이/고난도 가중)
export function aggregateMock(items) {
  // 인식 실패 문항은 "0점" 이 아니라 "미응답" — 평균을 끌어내리지 않는다
  const scored = items.filter(i => i.result && !i.result.failed);
  if (!scored.length) return { score: 0, level: 'NL/NM' };
  let sum = 0, w = 0;
  for (const it of scored) {
    const weight = /roleplay|advanced|opinion/.test(it.type || '') ? 1.2 : 1;
    sum += it.result.score * weight; w += weight;
  }
  const score = Math.round(sum / w);
  const lv = toLevel(score);
  return { score, level: lv.level };
}
