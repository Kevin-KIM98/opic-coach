"""Validate all data/*.json files against the app's content schema.
Run: python tools/validate.py   (exit code 1 on any error)
Used by GitHub Actions on every push so edits made from the phone are checked automatically.
"""
import json
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TYPES = {"describe", "routine", "experience", "comparison", "opinion", "roleplay-ask", "roleplay-solve",
         "roleplay-experience"}
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


def split_sentences(text):
    """앱(js/util.js splitSentences)과 같은 규칙으로 문장을 나눈다."""
    return [x.strip() for x in re.findall(r'[^.!?]+[.!?]+["\']?|[^.!?]+$', text or "") if x.strip()]


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
        for lv in ("IM3", "IH", "AL"):
            for piece in split_sentences(ans.get(lv, "")):
                if len(piece) < 4:
                    err(f"{rel}: questions[{i}] answers.{lv} 에 잘린 문장 조각 '{piece}' 이 있습니다 (a.m., Mr. 같은 약어 대신 'in the morning' 처럼 풀어 쓰세요)")
        ko = q.get("answersKo")
        if ko is None:
            err(f"{rel}: questions[{i}] answersKo(문장별 한글 해석) 누락")
        else:
            for lv in ("IM3", "IH", "AL"):
                n = len(split_sentences(ans.get(lv, "")))
                arr = ko.get(lv)
                if not isinstance(arr, list) or len(arr) != n or not all(isinstance(x, str) and x.strip() for x in arr):
                    err(f"{rel}: questions[{i}] answersKo.{lv} 는 영어 답안 문장 수({n})와 같은 개수의 한글 문장이어야 합니다 (현재 {len(arr) if isinstance(arr, list) else '없음'})")


def check_topic_patterns(path, t, frames):
    """주제 패턴: pid 가 patterns.json 에 있고, 패턴 틀의 단어가 문장에 순서대로 들어 있는지."""
    rel = path.relative_to(ROOT)
    qids = {q.get("id") for q in t.get("questions", [])}
    norm = lambda x: [w for w in "".join(c.lower() if c.isalnum() or c in " '" else " " for c in x).split() if w]
    for i, p in enumerate(t.get("patterns", [])):
        if not p.get("en") or not p.get("ko"):
            err(f"{rel}: patterns[{i}] en/ko 누락")
        frame = frames.get(p.get("pid"))
        if frame is None:
            err(f"{rel}: patterns[{i}] pid '{p.get('pid')}' 가 data/patterns.json 에 없습니다")
            continue
        if p.get("q") and p["q"] not in qids:
            err(f"{rel}: patterns[{i}] q '{p['q']}' 가 이 주제의 질문 id 가 아닙니다")
        words, it = norm(p.get("en", "")), 0
        for w in norm(frame.replace("___", " ")):
            while it < len(words) and words[it] != w:
                it += 1
            if it >= len(words):
                err(f"{rel}: patterns[{i}] 문장에 패턴 틀 '{frame}' 의 단어 '{w}' 가 없습니다")
                break
            it += 1


def main():
    pats = load(DATA / "patterns.json") or {}
    frames = {f"{g.get('id')}#{i}": it.get("pattern") or it.get("en", "") for g in pats.get("groups", []) for i, it in enumerate(g.get("items", []))}
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
                check_topic_patterns(p, t, frames)
        listed = {e["file"] for e in index.get("topics", [])}
        for p in (DATA / "topics").glob("*.json"):
            if f"topics/{p.name}" not in listed:
                err(f"{p.relative_to(ROOT)}: index.json 에 등록되지 않았습니다")
    for name in ("patterns.json", "mock-sets.json"):
        d = load(DATA / name)
        if d is None:
            continue
        if name == "patterns.json":
            for g in d.get("groups", []):
                for i, it in enumerate(g.get("items", [])):
                    if not it.get("en") or not it.get("ko"):
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] en/ko 누락")
                    if it.get("pattern") is not None and "___" not in it["pattern"]:
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] pattern 에 빈칸(___)이 없습니다")
                    if not isinstance(it.get("examples", []), list):
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] examples 는 문장 목록이어야 합니다")
    if errors:
        print("❌ 검증 실패:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("✅ 모든 데이터 파일이 유효합니다")


if __name__ == "__main__":
    main()
