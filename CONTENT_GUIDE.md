# 콘텐츠 수정 가이드

모든 학습 자료는 `data/` 폴더의 JSON 파일입니다. 코드를 몰라도 폰에서 수정할 수 있습니다.

## 폰에서 수정하는 법

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
  "category": "survey",          ← survey | roleplay | advanced | unexpected | tos
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
| `tos-qa` | 토스 파트3 | 짧은 답 + 이유 |
| `tos-opinion` | 토스 파트5 | 입장 + 이유 2개 + 예시 |

### 표현 `level` 값
`IM` (IM3 목표 필수) · `IH` · `AL`. 카드 배지 색으로 표시됩니다.

## 모범답안을 내 이야기로 바꾸기 (강력 추천)

모범답안의 인물은 "서울 12층 아파트에 사는 회사원, 지하철 20분 통근, 커피·영화·조깅 취미" 입니다.
**자신의 실제 정보(동네·직업·취미)로 IM3 답안을 고쳐 두면** 시험장에서 떠올리기 훨씬 쉽습니다.
문장 수와 구조는 유지하고 명사·형용사만 바꾸면 됩니다.

## 새 주제 추가

1. `data/topics/새주제.json` 파일을 위 형식으로 만듭니다 (`id` = 파일명).
2. `data/index.json` 의 `topics` 배열에 `{"id": "새주제", "file": "topics/새주제.json"}` 을 추가합니다.
3. 학습 일정에 넣고 싶으면 `data/plans.json` 의 원하는 날 `tasks` 에 `{"type": "learn", "topic": "새주제"}` 를 추가합니다.

## 다른 파일

- `data/patterns.json` – 만능 패턴. `groups[].items[]` 에 `{en, ko, level, note}` 추가.
- `data/pronunciation.json` – 발음 세트. `kind` 가 `minimal-pairs` 면 `pairs`, 그 외는 `words`/`sentences`.
- `data/mock-sets.json` – 모의고사 구성. `slots` 로 문항 조합, `levels` 로 등급 커트라인.
- `data/plans.json` – 일정. 손으로 고쳐도 되고, `tools/gen_plans.py` 를 수정해 다시 생성해도 됩니다.
  과제 `type`: `learn` `shadow` `speak` `pattern` `pron` `mock` `review`.

## 로컬에서 검증

```bash
python tools/validate.py
```
