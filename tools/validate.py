"""Validate all data/*.json files against the app's content schema.
Run: python tools/validate.py   (exit code 1 on any error)
Used by GitHub Actions on every push so edits made from the phone are checked automatically.
"""
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TYPES = {"describe", "routine", "experience", "comparison", "opinion", "roleplay-ask", "roleplay-solve",
         "roleplay-experience", "tos-qa", "tos-opinion"}
LEVELS = {"IM", "IH", "AL"}
errors = []


def err(msg):
    errors.append(msg)


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"{path.relative_to(ROOT)}: JSON 파싱 실패 - {e}")
        return None


def check_topic(path, t):
    rel = path.relative_to(ROOT)
    for key in ("id", "title", "titleEn", "emoji", "category", "intro", "expressions", "questions"):
        if key not in t:
            err(f"{rel}: '{key}' 필드가 없습니다")
    if t.get("id") != path.stem:
        err(f"{rel}: id '{t.get('id')}' 가 파일명 '{path.stem}' 과 다릅니다")
    for i, e in enumerate(t.get("expressions", [])):
        if not e.get("en") or not e.get("ko"):
            err(f"{rel}: expressions[{i}] en/ko 누락")
        if e.get("level") and e["level"] not in LEVELS:
            err(f"{rel}: expressions[{i}] level 은 IM/IH/AL 중 하나여야 합니다 ('{e['level']}')")
    ids = set()
    for i, q in enumerate(t.get("questions", [])):
        qid = q.get("id")
        if not qid:
            err(f"{rel}: questions[{i}] id 누락")
        elif qid in ids:
            err(f"{rel}: questions[{i}] id 중복 '{qid}'")
        ids.add(qid)
        if q.get("type") not in TYPES:
            err(f"{rel}: questions[{i}] type '{q.get('type')}' 은 허용되지 않습니다. 가능: {sorted(TYPES)}")
        if not q.get("en"):
            err(f"{rel}: questions[{i}] en 누락")
        ans = q.get("answers") or {}
        for lv in ("IM3", "IH", "AL"):
            if not ans.get(lv):
                err(f"{rel}: questions[{i}] answers.{lv} 누락")
    for i, r in enumerate(t.get("readAloud", [])):
        if not r.get("id") or not r.get("text"):
            err(f"{rel}: readAloud[{i}] id/text 누락")


def main():
    index = load(DATA / "index.json")
    if index:
        for entry in index.get("topics", []):
            p = DATA / entry["file"]
            if not p.exists():
                err(f"data/index.json: '{entry['file']}' 파일이 없습니다")
                continue
            t = load(p)
            if t:
                check_topic(p, t)
        listed = {e["file"] for e in index.get("topics", [])}
        for p in (DATA / "topics").glob("*.json"):
            if f"topics/{p.name}" not in listed:
                err(f"{p.relative_to(ROOT)}: index.json 에 등록되지 않았습니다")
    for name in ("patterns.json", "pronunciation.json", "plans.json", "mock-sets.json"):
        d = load(DATA / name)
        if d is None:
            continue
        if name == "patterns.json":
            for g in d.get("groups", []):
                for i, it in enumerate(g.get("items", [])):
                    if not it.get("en") or not it.get("ko"):
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] en/ko 누락")
        if name == "plans.json":
            for p in d.get("plans", []):
                for day in p.get("days", []):
                    for task in day.get("tasks", []):
                        if task.get("type") not in d.get("taskTypes", {}):
                            err(f"data/plans.json: plan '{p.get('id')}' day {day.get('day')} 알 수 없는 task type '{task.get('type')}'")
    if errors:
        print("❌ 검증 실패:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("✅ 모든 데이터 파일이 유효합니다")


if __name__ == "__main__":
    main()
