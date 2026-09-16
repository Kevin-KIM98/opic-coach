"""Generate data/plans.json (4-, 8-, 12-week study schedules).

Run:  python tools/gen_plans.py
The output file is plain JSON and can also be edited by hand (or from the GitHub mobile app).
"""
import json
from pathlib import Path

SURVEY = [
    "self-intro", "housing", "neighborhood", "movies", "music", "park",
    "jogging", "travel-domestic", "travel-overseas", "cafe", "work", "vacation-home",
]
PRON = ["sound-rl", "sound-fp", "sound-vb", "sound-th", "sound-zj", "sound-vowel",
        "stress", "linking", "intonation", "twisters"]
PATTERNS = ["opener", "describe", "routine", "experience", "compare", "opinion", "closing", "filler"]


def t(type_, **kw):
    d = {"type": type_}
    d.update(kw)
    return d


def build(plan_id, title, weeks, minutes, desc, phases):
    """phases: list of (week_from, week_to, phase_title, day_builder)"""
    days = []
    week_meta = []
    day_no = 0
    for (w_from, w_to, ptitle, builder) in phases:
        for w in range(w_from, w_to + 1):
            week_meta.append({"week": w, "title": ptitle})
            for d in range(7):
                day_no += 1
                tasks = builder(w, d, day_no)
                days.append({"day": day_no, "week": w, "weekday": d, "tasks": tasks})
    return {"id": plan_id, "title": title, "weeks": weeks, "dailyMinutes": minutes,
            "desc": desc, "weekMeta": week_meta, "days": days}


# ---------- 4-week intensive ----------

def four_week():
    order = SURVEY  # 12 topics over weeks 1-3 (4/week)
    def learn_phase(w, d, n):
        base = (w - 1) * 4
        topics = order[base:base + 4]
        tasks = []
        if d < 4:
            tp = topics[d]
            tasks += [t("learn", topic=tp), t("shadow", topic=tp, level="IM3"), t("speak", topic=tp)]
        elif d == 4:
            tasks += [t("review"), t("shadow", topic=topics[0], level="IH"), t("speak", topic=topics[1])]
        elif d == 5:
            tasks += [t("speak", topic=topics[2]), t("speak", topic=topics[3]), t("review")]
        else:
            tasks += [t("mock", set="opic-mini"), t("review")]
        tasks.append(t("pattern", group=PATTERNS[(n - 1) % len(PATTERNS)]))
        tasks.append(t("pron", set=PRON[(n - 1) % len(PRON)]))
        return tasks

    def final_phase(w, d, n):
        sched = [
            [t("learn", topic="roleplay"), t("shadow", topic="roleplay", level="IM3"), t("speak", topic="roleplay")],
            [t("learn", topic="unexpected"), t("speak", topic="unexpected"), t("pattern", group="opener")],
            [t("learn", topic="advanced"), t("speak", topic="advanced"), t("pattern", group="compare")],
            [t("mock", set="opic-full"), t("review")],
            [t("mock", set="opic-mini"), t("review")],
            [t("mock", set="opic-full"), t("speak", topic="roleplay")],
            [t("mock", set="opic-mini"), t("review"), t("pron", set="intonation")],
        ]
        return sched[d]

    return build("4w", "4주 집중 과정", 4, 75,
                 "하루 60~90분. 3주 안에 전 주제를 훑고 마지막 주는 롤플레이·돌발·모의고사로 마무리. 시험이 한 달 남았을 때.",
                 [(1, 3, "설문 주제 정복", learn_phase), (4, 4, "롤플레이 · 돌발 · 실전", final_phase)])


# ---------- 8-week standard ----------

def eight_week():
    def learn_phase(w, d, n):
        base = (w - 1) * 2
        a, b = SURVEY[base], SURVEY[base + 1]
        sched = [
            [t("learn", topic=a), t("shadow", topic=a, level="IM3")],
            [t("speak", topic=a), t("shadow", topic=a, level="IH")],
            [t("learn", topic=b), t("shadow", topic=b, level="IM3")],
            [t("speak", topic=b), t("shadow", topic=b, level="IH")],
            [t("speak", topic=a), t("speak", topic=b), t("review")],
            [t("mock", set="opic-mini")],
            [t("review"), t("pattern", group=PATTERNS[(w - 1) % len(PATTERNS)])],
        ]
        tasks = list(sched[d])
        tasks.append(t("pron", set=PRON[(n - 1) % len(PRON)]))
        if d in (0, 2):
            tasks.append(t("pattern", group=PATTERNS[(n - 1) % len(PATTERNS)]))
        return tasks

    def final_phase(w, d, n):
        if w == 7:
            sched = [
                [t("learn", topic="roleplay"), t("shadow", topic="roleplay", level="IM3")],
                [t("speak", topic="roleplay"), t("pattern", group="opener")],
                [t("learn", topic="unexpected"), t("speak", topic="unexpected")],
                [t("mock", set="opic-unexpected"), t("review")],
                [t("learn", topic="advanced"), t("speak", topic="advanced"), t("pattern", group="compare")],
                [t("mock", set="opic-full")],
                [t("review"), t("pron", set="intonation")],
            ]
        else:
            sched = [
                [t("mock", set="opic-mini"), t("review")],
                [t("mock", set="opic-full"), t("review")],
                [t("speak", topic="roleplay"), t("speak", topic="unexpected"), t("review")],
                [t("mock", set="opic-mini"), t("pron", set="linking")],
                [t("mock", set="opic-full"), t("review")],
                [t("review"), t("pattern", group="closing"), t("pron", set="twisters")],
                [t("mock", set="opic-mini"), t("review")],
            ]
        return sched[d]

    return build("8w", "8주 표준 과정", 8, 50,
                 "하루 45~60분. 주당 주제 2개를 깊게 익히고 매주 미니 모의고사. IM3를 안정적으로, IH까지 노리는 표준 코스.",
                 [(1, 6, "설문 주제 정복", learn_phase), (7, 8, "롤플레이 · 돌발 · 실전", final_phase)])


# ---------- 12-week relaxed ----------

def twelve_week():
    def learn_phase(w, d, n):
        tp = SURVEY[w - 1]
        sched = [
            [t("learn", topic=tp)],
            [t("shadow", topic=tp, level="IM3")],
            [t("speak", topic=tp), t("pattern", group=PATTERNS[(w - 1) % len(PATTERNS)])],
            [t("shadow", topic=tp, level="IH")],
            [t("speak", topic=tp), t("review")],
            [t("mock", set="opic-mini")] if w % 2 == 0 else [t("review"), t("speak", topic=SURVEY[max(0, w - 2)])],
            [t("review")],
        ]
        tasks = list(sched[d])
        tasks.append(t("pron", set=PRON[(n - 1) % len(PRON)]))
        return tasks

    # weeks 10-12: roleplay/unexpected, advanced/tos, full mocks
    def final_phase(w, d, n):
        plans = {
            10: [
                [t("learn", topic="roleplay")], [t("shadow", topic="roleplay", level="IM3")],
                [t("speak", topic="roleplay")], [t("learn", topic="unexpected")],
                [t("speak", topic="unexpected")], [t("mock", set="opic-unexpected")], [t("review")],
            ],
            11: [
                [t("learn", topic="advanced")], [t("speak", topic="advanced"), t("pattern", group="compare")],
                [t("speak", topic="unexpected"), t("review")], [t("mock", set="opic-mini"), t("pattern", group="opinion")],
                [t("mock", set="opic-full")], [t("review"), t("speak", topic="roleplay")], [t("review")],
            ],
            12: [
                [t("mock", set="opic-full")], [t("review"), t("pron", set="intonation")],
                [t("mock", set="opic-mini")], [t("speak", topic="unexpected"), t("review")],
                [t("mock", set="opic-full")], [t("review"), t("pattern", group="closing")],
                [t("mock", set="opic-mini"), t("review")],
            ],
        }
        return plans[w][d]

    return build("12w", "12주 여유 과정", 12, 35,
                 "하루 30~45분. 주당 주제 1개, 충분한 반복과 격주 모의고사. 기초부터 차근차근 IM3 이상을 만드는 코스.",
                 [(1, 9, "설문 주제 정복", learn_phase), (10, 12, "롤플레이 · 돌발 · 실전", final_phase)])


def main():
    out = {
        "intro": "시험 D-day에 맞춰 과정을 고르면 오늘 할 일이 자동으로 정해집니다. 완료 체크는 폰에 저장되며, 밀린 날은 다음 날로 자동 이월됩니다.",
        "taskTypes": {
            "learn": {"title": "표현 학습", "minutes": 15, "desc": "핵심 표현 듣고 따라 말하기"},
            "shadow": {"title": "모범답안 섀도잉", "minutes": 15, "desc": "모범답안을 문장 단위로 듣고 따라 말하기"},
            "speak": {"title": "직접 답변하기", "minutes": 15, "desc": "질문에 녹음으로 답하고 채점받기"},
            "pattern": {"title": "만능 패턴", "minutes": 8, "desc": "주제 무관 뼈대 문장 암기"},
            "pron": {"title": "발음 훈련", "minutes": 7, "desc": "소리·강세·연음 집중"},
            "mock": {"title": "모의고사", "minutes": 25, "desc": "실전 형식으로 채점"},
            "review": {"title": "복습", "minutes": 10, "desc": "틀리거나 약한 표현 다시 보기"}
        },
        "plans": [four_week(), eight_week(), twelve_week()],
    }
    path = Path(__file__).resolve().parent.parent / "data" / "plans.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", path, "days:", [len(p["days"]) for p in out["plans"]])


if __name__ == "__main__":
    main()
