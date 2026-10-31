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


LEVEL_FRAMES = {"IM3": {"IM"}, "IH": {"IM", "IH"}, "AL": {"IH", "AL"}}


def check_topic_patterns(path, t, frames, frame_levels=None):
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
        lv = p.get("level")
        if lv is not None:
            if lv not in LEVEL_FRAMES:
                err(f"{rel}: patterns[{i}] level 은 IM3/IH/AL 중 하나여야 합니다 ('{lv}')")
            elif frame_levels and frame_levels.get(p.get("pid")) not in LEVEL_FRAMES[lv]:
                err(f"{rel}: patterns[{i}] {lv} 에는 {sorted(LEVEL_FRAMES[lv])} 레벨 패턴만 쓸 수 있습니다 (pid '{p.get('pid')}' 는 {frame_levels.get(p.get('pid'))})")
            q = next((x for x in t.get("questions", []) if x.get("id") == p.get("q")), None)
            if q and p.get("en", "").strip() not in split_sentences((q.get("answers") or {}).get(lv, "")):
                err(f"{rel}: patterns[{i}] 문장이 '{p.get('q')}' 의 {lv} 모범답안에 그대로 들어 있지 않습니다")
        words, it = norm(p.get("en", "")), 0
        for w in norm(frame.replace("___", " ")):
            while it < len(words) and words[it] != w:
                it += 1
            if it >= len(words):
                err(f"{rel}: patterns[{i}] 문장에 패턴 틀 '{frame}' 의 단어 '{w}' 가 없습니다")
                break
            it += 1
    levels = [p.get("level") for p in t.get("patterns", []) if p.get("level")]
    if levels:
        for lv in LEVEL_FRAMES:
            if levels.count(lv) != 6:
                err(f"{rel}: patterns 의 {lv} 문장은 6개여야 합니다 (현재 {levels.count(lv)}개)")


def check_combos(path, t, frames, frame_levels, frame_sets):
    """패턴 조합: 레벨별 2개(IM3·IH·AL), 조합마다 두 패턴 세트를 섞고, 각 문장이 패턴 틀을 지키는지."""
    combos = t.get("combos")
    if combos is None:
        return
    rel = path.relative_to(ROOT)
    qids = {q.get("id") for q in t.get("questions", [])}
    norm = lambda x: [w for w in "".join(c.lower() if c.isalnum() or c in " '" else " " for c in x).split() if w]
    levels = [c.get("level") for c in combos]
    for lv in LEVEL_FRAMES:
        if levels.count(lv) != 2:
            err(f"{rel}: combos 의 {lv} 조합은 2개여야 합니다 (현재 {levels.count(lv)}개)")
    for i, c in enumerate(combos):
        if c.get("q") not in qids:
            err(f"{rel}: combos[{i}] q '{c.get('q')}' 가 이 주제의 질문 id 가 아닙니다")
        if not c.get("title"):
            err(f"{rel}: combos[{i}] title 누락")
        parts = c.get("parts") or []
        if not 3 <= len(parts) <= 4:
            err(f"{rel}: combos[{i}] parts 는 3~4개여야 합니다 (현재 {len(parts)}개)")
        sets = {frame_sets.get(p.get("pid")) for p in parts}
        if "kang" not in sets or not any(str(x).startswith("im3") for x in sets):
            err(f"{rel}: combos[{i}] 는 만능패턴 72(kang)와 IM3 필수 패턴(im3·im3b)을 섞어야 합니다")
        for k, p in enumerate(parts):
            frame = frames.get(p.get("pid"))
            if frame is None:
                err(f"{rel}: combos[{i}].parts[{k}] pid '{p.get('pid')}' 가 data/patterns.json 에 없습니다")
                continue
            if not p.get("en") or not p.get("ko"):
                err(f"{rel}: combos[{i}].parts[{k}] en/ko 누락")
            if len(split_sentences(p.get("en", ""))) != 1:
                err(f"{rel}: combos[{i}].parts[{k}] en 은 한 문장이어야 합니다")
            words, it = norm(p.get("en", "")), 0
            for w in norm(frame.replace("___", " ")):
                while it < len(words) and words[it] != w:
                    it += 1
                if it >= len(words):
                    err(f"{rel}: combos[{i}].parts[{k}] 문장에 패턴 틀 '{frame}' 의 단어 '{w}' 가 없습니다")
                    break
                it += 1


def check_bank(path, d):
    """실전 답변 모음: 레벨(영상)·그룹·문항 id, 질문 유형, 레벨별 답변과 문장별 한글 해석 개수."""
    rel = path.relative_to(ROOT)
    for key in ("title", "levels", "groups"):
        if key not in d:
            err(f"{rel}: '{key}' 필드가 없습니다")
    levels = [l.get("id") for l in d.get("levels", [])]
    for l in d.get("levels", []):
        if not l.get("id") or not str((l.get("source") or {}).get("url", "")).startswith("https://"):
            err(f"{rel}: levels 의 각 항목에 id 와 source.url 이 필요합니다 ({l.get('id')})")
    topic_ids = {e["id"] for e in (load(DATA / "index.json") or {}).get("topics", [])}
    ids = set()
    for g in d.get("groups", []):
        gid = g.get("id")
        if not gid or not g.get("title") or not g.get("emoji"):
            err(f"{rel}: 그룹 '{gid}' 에 id/title/emoji 가 필요합니다")
        for t in g.get("topics", []):
            if t not in topic_ids:
                err(f"{rel}: 그룹 '{gid}' topics 의 '{t}' 는 index.json 의 주제가 아닙니다")
        for i, it in enumerate(g.get("items", [])):
            where = f"{rel}: {gid}.items[{i}]"
            if not it.get("id"):
                err(f"{where} id 누락")
            elif it["id"] in ids:
                err(f"{where} id 중복 '{it['id']}'")
            ids.add(it.get("id"))
            if it.get("type") not in TYPES:
                err(f"{where} type '{it.get('type')}' 은 허용되지 않습니다. 가능: {sorted(TYPES)}")
            for key in ("en", "ko"):
                if not it.get(key):
                    err(f"{where} {key} 누락")
            answers, ko, ts = it.get("answers") or {}, it.get("answersKo") or {}, it.get("t") or {}
            if not answers:
                err(f"{where} answers 가 비어 있습니다")
            for lv, text in answers.items():
                if lv not in levels:
                    err(f"{where} answers 의 레벨 '{lv}' 가 levels 에 없습니다")
                if not isinstance(ts.get(lv), int) or ts[lv] < 0:
                    err(f"{where} t.{lv}(영상 시작 초)는 0 이상의 정수여야 합니다")
                sents = split_sentences(text)
                for piece in sents:
                    if len(piece) < 4:
                        err(f"{where} answers.{lv} 에 잘린 문장 조각 '{piece}' 이 있습니다")
                arr = ko.get(lv)
                if not isinstance(arr, list) or len(arr) != len(sents) or not all(isinstance(x, str) and x.strip() for x in arr):
                    err(f"{where} answersKo.{lv} 는 영어 답변 문장 수({len(sents)})와 같은 개수의 한글 문장이어야 합니다 (현재 {len(arr) if isinstance(arr, list) else '없음'})")


def check_version():
    """js/config.js 의 version · updated 와 sw.js 의 VERSION 이 맞는지 (홈 상단 버전 표시 · 캐시 갱신)."""
    cfg = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    v = re.search(r"version:\s*'([^']+)'", cfg)
    u = re.search(r"updated:\s*'([^']+)'", cfg)
    s = re.search(r"const VERSION = 'v([^']+)'", sw)
    if not v or not s or v.group(1) != s.group(1):
        err(f"js/config.js version({v and v.group(1)}) 과 sw.js VERSION({s and s.group(1)}) 이 다릅니다 — 함께 올리세요")
    if not u or not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", u.group(1)):
        err("js/config.js 의 updated 는 'YYYY-MM-DD HH:MM' (한국 시간) 이어야 합니다")


def check_survey(path, d, topic_ids):
    """서베이 체크: 문항·보기 id 가 겹치지 않고, 연결한 주제가 index.json 에 있는지."""
    rel = path.relative_to(ROOT)
    seen = set()
    for q in d.get("questions", []):
        if q.get("type") not in ("single", "multi"):
            err(f"{rel}: 문항 '{q.get('id')}' type 은 single | multi 여야 합니다")
        if not q.get("options"):
            err(f"{rel}: 문항 '{q.get('id')}' 보기가 비어 있습니다")
        for o in q.get("options", []):
            if o.get("id") in seen:
                err(f"{rel}: 보기 id '{o.get('id')}' 가 중복됩니다")
            seen.add(o.get("id"))
            if not o.get("label"):
                err(f"{rel}: 보기 '{o.get('id')}' label 이 없습니다")
            if o.get("topic") and o["topic"] not in topic_ids:
                err(f"{rel}: 보기 '{o.get('id')}' 의 topic '{o['topic']}' 는 index.json 의 주제가 아닙니다")


def main():
    pats = load(DATA / "patterns.json") or {}
    frames = {f"{g.get('id')}#{i}": it.get("pattern") or it.get("en", "") for g in pats.get("groups", []) for i, it in enumerate(g.get("items", []))}
    frame_levels = {f"{g.get('id')}#{i}": it.get("level", "IM") for g in pats.get("groups", []) for i, it in enumerate(g.get("items", []))}
    frame_sets = {f"{g.get('id')}#{i}": g.get("set", "kang") for g in pats.get("groups", []) for i, it in enumerate(g.get("items", []))}
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
                check_topic_patterns(p, t, frames, frame_levels)
                check_combos(p, t, frames, frame_levels, frame_sets)
        listed = {e["file"] for e in index.get("topics", [])}
        for p in (DATA / "topics").glob("*.json"):
            if f"topics/{p.name}" not in listed:
                err(f"{p.relative_to(ROOT)}: index.json 에 등록되지 않았습니다")
    bank_path = DATA / "answer-bank.json"
    if bank_path.exists():
        bank = load(bank_path)
        if bank:
            check_bank(bank_path, bank)
    for name in ("patterns.json", "mock-sets.json"):
        d = load(DATA / name)
        if d is None:
            continue
        if name == "mock-sets.json":
            for st in d.get("sets", []):
                for slot in st.get("slots", []):
                    if not slot.get("ids"):
                        continue
                    entry = next((e for e in (index or {}).get("topics", []) if e["id"] == slot.get("topic")), None)
                    qids = {q.get("id") for q in ((load(DATA / entry["file"]) or {}).get("questions", []) if entry else [])}
                    for qid in slot["ids"]:
                        if qid not in qids:
                            err(f"data/mock-sets.json: 세트 '{st.get('id')}' 의 문항 '{qid}' 가 주제 '{slot.get('topic')}' 에 없습니다")
        if name == "patterns.json":
            for g in d.get("groups", []):
                for i, it in enumerate(g.get("items", [])):
                    if not it.get("en") or not it.get("ko"):
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] en/ko 누락")
                    if it.get("pattern") is not None and "___" not in it["pattern"]:
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] pattern 에 빈칸(___)이 없습니다")
                    if not isinstance(it.get("examples", []), list):
                        err(f"data/patterns.json: group '{g.get('id')}' items[{i}] examples 는 문장 목록이어야 합니다")
    survey_path = DATA / "survey.json"
    if survey_path.exists():
        survey = load(survey_path)
        if survey:
            check_survey(survey_path, survey, {e["id"] for e in (index or {}).get("topics", [])})
    check_version()
    if errors:
        print("❌ 검증 실패:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("✅ 모든 데이터 파일이 유효합니다")


if __name__ == "__main__":
    main()
