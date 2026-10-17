# 콘텐츠 수정 가이드

모든 학습 자료는 `data/` 폴더의 JSON 파일입니다. 코드를 몰라도 폰에서 수정할 수 있습니다.

## 폰에서 수정하는 법

0. 먼저 **편집자 모드**를 켭니다: 설정 화면 맨 아래 버전 표시(`OPIc Coach v…`)를 7번 연속으로 누르세요.
   (평소에는 저장소 링크가 전부 숨겨져 있어서, 앱을 쓰는 다른 사람에게는 보이지 않습니다. 끄려면 설정 →
   편집자 모드 → **🔒 편집자 모드 끄기**. 이 설정은 그 기기 브라우저에만 저장됩니다.)
1. 앱에서 주제 화면 오른쪽 위 **✏️** 를 누르면 GitHub 편집 화면이 열립니다. (GitHub 앱이 설치되어 있으면 앱으로, 아니면 웹으로)
2. 내용을 고치고 아래 **Commit changes** 를 누릅니다.
3. 1~3분 뒤 앱을 새로고침(당겨서 새로고침 또는 앱 재실행)하면 반영됩니다.

> 팁: GitHub 모바일 앱 → 저장소 → `data/topics` → 파일 → 연필 아이콘. 편집기에서 검색(🔍)으로 원하는 문장을 찾으면 빠릅니다.

## 꼭 지켜야 할 규칙

- 따옴표는 **직선 큰따옴표 `"`** 만 사용합니다. 문장 안에 큰따옴표가 필요하면 `\"` 로 씁니다. 작은따옴표(`'`, I'm 등)는 그대로 써도 됩니다.
- 항목 사이에는 쉼표 `,` 가 있어야 하고, **마지막 항목 뒤에는 쉼표가 없어야** 합니다.
- 줄바꿈을 문장 안에 넣지 마세요. 한 답안은 한 줄에 씁니다.
- 저장 후 저장소의 **Actions** 탭이 ✅ 이면 정상, ❌ 이면 어느 파일 몇 번째 항목이 잘못됐는지 알려줍니다.

## 주제 파일 형식 (`data/topics/*.json`)

```json
{
  "id": "housing",               ← 파일명과 같아야 함
  "title": "집 · 거주지",         ← 앱에 표시되는 한국어 제목
  "titleEn": "Housing",
  "emoji": "🏠",
  "category": "survey",          ← survey | roleplay | advanced | unexpected
  "priority": 1,                 ← 목록 정렬 순서 (작을수록 위)
  "intro": "출제 경향과 전략 설명 (한국어)",
  "strategy": ["전략 1", "전략 2", "전략 3"],
  "expressions": [
    {"en": "영어 문장", "ko": "한국어 뜻", "level": "IM", "note": "선택: 문법·사용 팁"}
  ],
  "questions": [
    {
      "id": "housing-describe",  ← 주제 안에서 고유
      "type": "describe",        ← 아래 표 참고
      "en": "영어 질문",
      "ko": "한국어 해석",
      "tips": ["구조 힌트", "표현 힌트"],
      "answers": {"IM3": "...", "IH": "...", "AL": "..."}
    }
  ],
  "pronunciation": [
    {"word": "apartment", "ipa": "/əˈpɑːrt.mənt/", "tip": "한국어 발음 팁"}
  ]
}
```

### 질문 `type` 값

| type | 의미 | 채점에서 보는 것 |
|---|---|---|
| `describe` | 묘사 | 위치·there is·느낌 표현 |
| `routine` | 습관·루틴 | 빈도 부사, 순서 연결어 |
| `experience` | 경험 | **과거시제** 비율, 시간 표현 |
| `comparison` | 비교·변화 | used to, than, compared to |
| `opinion` | 의견 | I think, 이유 나열 |
| `roleplay-ask` | 롤플레이 질문하기 | **질문 문장 3개 이상** |
| `roleplay-solve` | 롤플레이 문제 해결 | 사과 + 대안 제시 표현 |
| `roleplay-experience` | 롤플레이 관련 경험 | 과거시제 |

### 표현 `level` 값
`IM` (IM3 목표 필수) · `IH` · `AL`. 카드 배지 색으로 표시됩니다.

## 모범답안을 내 이야기로 바꾸기 (강력 추천)

모범답안의 인물은 "서울 12층 아파트에 사는 회사원, 지하철 20분 통근, 커피·영화·조깅 취미" 입니다.
**자신의 실제 정보(동네·직업·취미)로 IM3 답안을 고쳐 두면** 시험장에서 떠올리기 훨씬 쉽습니다.
문장 수와 구조는 유지하고 명사·형용사만 바꾸면 됩니다.

## 새 주제 추가

1. `data/topics/새주제.json` 파일을 위 형식으로 만듭니다 (`id` = 파일명).
2. `data/index.json` 의 `topics` 배열에 `{"id": "새주제", "file": "topics/새주제.json"}` 을 추가합니다.

## 다른 파일

- 주제 모범답안은 `data/index.json` 의 `persona`(한 사람의 설정)와 `flow`(답변 흐름)를 따릅니다. 주제 내용을 크게 바꿨다면 `contentVersion` 을 1 올리세요 — 앱이 예전 주제 표현 학습 기록을 한 번 지웁니다.
- `data/patterns.json` – 만능 패턴 72문장 (12 스토리 테마 × 6패턴). `groups[].items[]` 는 `{en, ko, level, pattern, examples}`.
  `pattern` 은 빈칸(`___`)이 있는 패턴 틀, `en` + `examples`(2개)가 예문 3개입니다. 말하기 퀴즈는 `pattern` 에서 빈칸을 뺀 단어로 채점합니다.
  그룹 id·순서를 바꾸면 주제 파일의 `patterns[].pid` 도 함께 바꾸세요.
  지금 파일에 없는 패턴의 학습 기록(`pat:*`)은 앱이 자동으로 지웁니다.
- `data/pronunciation.json` – 발음 세트. `kind` 가 `minimal-pairs` 면 `pairs`, 그 외는 `words`/`sentences`.
- `data/mock-sets.json` – 모의고사 구성. `slots` 로 문항 조합, `levels` 로 등급 커트라인.
- 질문의 `answersKo` – 모범답안 한글 해석. `{"IM3": [...], "IH": [...], "AL": [...]}` 로, 영어 답안을 문장(. ! ? 기준)으로 나눈 개수와 **같은 개수**의 한글 문장 배열입니다. 영어 답안을 고치면 해석 개수도 맞추세요. `a.m.` 같은 약어는 문장이 잘리니 `in the morning` 처럼 풀어 씁니다.
- 주제 파일의 `patterns` – 만능 패턴을 이 주제에 맞춰 채운 문장 8개. `{pid, en, ko, q}`: `pid` 는 `<그룹 id>#<번호>`(예: `like#0`), `en` 은 패턴 틀의 단어를 그대로 두고 빈칸만 채운 문장, `q` 는 이 문장을 쓰는 질문 id. `validate.py` 가 셋 다 검사합니다.
  과제 `type`: `learn` `shadow` `speak` `pattern` `pron` `mock` `review`.

## 로컬에서 검증

```bash
python tools/validate.py
```

