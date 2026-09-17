// 채점기 회귀 테스트 (브라우저 없이 node 로 실행)
//   node tools/test-scoring.mjs
import { analyze, aggregateMock, compareToText, toLevel } from '../js/scoring.js';

let fails = 0;
const check = (label, cond, detail = '') => {
  if (!cond) { fails++; console.log(`FAIL ${label}${detail ? '\n     ' + detail : ''}`); }
  else console.log(`ok   ${label}`);
};

// ---- 인식 실패: 모든 항목 0 · 등급 없음 · 원인 안내 1줄 ----
const empty = analyze('', 95, { type: 'describe' });
check('빈 전사는 failed 플래그', empty.failed === true);
check('빈 전사는 0점', empty.score === 0);
check('빈 전사는 등급을 매기지 않는다', empty.level === '-', `level=${empty.level}`);
check('빈 전사는 모든 항목 0점 (문법·어휘·유창성 포함)',
  Object.values(empty.parts).every(v => v === 0), JSON.stringify(empty.parts));
check('빈 전사 피드백은 원인 1줄만', empty.feedback.length === 1 && empty.feedback[0].kind === 'bad',
  JSON.stringify(empty.feedback));
check('빈 전사는 연결어 잔소리를 하지 않는다',
  !empty.feedback.some(f => /연결어/.test(f.text)));
check('진단 문구를 넘기면 그대로 쓴다',
  analyze('', 90, { sttNote: '마이크 권한이 거부돼 있어요.' }).feedback[0].text === '마이크 권한이 거부돼 있어요.');
check('공백·기호만 있어도 실패로 본다', analyze('   ...  ', 30).failed === true);

// ---- 짧은 답변: 점수가 급락 없이 비례해서 낮아진다 ----
const tiny = analyze('I like my house.', 60, { type: 'describe' });
check('4단어 답변은 채점되지만 매우 낮다', tiny.failed === false && tiny.score < 20, `score=${tiny.score}`);
check('4단어 답변 유창성은 바닥 점수를 받지 않는다', tiny.parts.fluency <= 3, `fluency=${tiny.parts.fluency}`);
const short10 = analyze('I live in a small apartment near the subway station with my family.', 60, { type: 'describe' });
check('12단어 > 4단어', short10.score > tiny.score, `${short10.score} vs ${tiny.score}`);

// ---- 제대로 된 답변은 여전히 잘 나온다 ----
const good = analyze(`I live in a small apartment in Seoul because it is close to my office.
  There are two bedrooms and a living room, and the kitchen is right next to the entrance.
  Actually, my favorite part is the balcony, so I usually drink coffee there in the morning.
  After that I water my plants, and then I get ready for work. It feels really cozy and quiet,
  especially on weekends when the neighborhood is calm. I used to live in a bigger house,
  but these days I prefer this place because it is much easier to clean and it is one of the
  best locations I have ever had. That's why I am planning to stay here for a few more years.`, 90,
  { type: 'describe' });
check('충실한 답변은 IM 이상', good.score >= 52, `score=${good.score} level=${good.level}`);
check('충실한 답변은 failed 아님', good.failed === false);
check('연결어가 잡힌다', good.metrics.connectors >= 5, `connectors=${good.metrics.connectors}`);
check('항목 점수가 만점을 넘지 않는다',
  good.parts.volume <= 30 && good.parts.structure <= 25 && good.parts.grammar <= 15 &&
  good.parts.vocab <= 15 && good.parts.fluency <= 15, JSON.stringify(good.parts));

// ---- 모의고사 집계: 인식 실패 문항은 평균에서 빠진다 ----
const agg = aggregateMock([
  { type: 'describe', result: { score: 70, failed: false } },
  { type: 'describe', result: { score: 60, failed: false } },
  { type: 'describe', result: { score: 0, failed: true } },
]);
check('실패 문항은 평균을 끌어내리지 않는다', agg.score === 65, `score=${agg.score}`);
check('전부 실패면 0점', aggregateMock([{ type: 'describe', result: { score: 0, failed: true } }]).score === 0);

// ---- 기존 동작 유지 ----
check('등급 경계', toLevel(63).level === 'IM3' && toLevel(62).level === 'IM2' && toLevel(90).level === 'AL');
check('섀도잉 비교', compareToText('i live in seoul', 'I live in Seoul.').score === 100);

console.log(fails ? `\n${fails}개 실패` : '\n전부 통과');
process.exit(fails ? 1 : 0);
