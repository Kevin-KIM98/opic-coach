"""앱이 읽어 주는 모든 영어 문장을 미리 녹음해 data/audio/<키>.mp3 로 만든다 (Kokoro TTS).

브라우저 음성 합성(speechSynthesis)은 화면이 꺼지면 멈춘다. 녹음 파일은 <audio> 로 재생하므로
화면이 꺼져도 계속 들리고, 이어폰이 빠지면 안드로이드가 알아서 일시정지한다.
앱(js/speech.js)은 문장의 키가 data/audio/index.json 에 있으면 녹음 파일을, 없으면 음성 합성을 쓴다.

  키 = sha1(공백을 하나로 줄인 문장) 앞 16자리  — js/speech.js audioKey() 와 같아야 한다

실행 (Kokoro 설치 필요: ~/.cache/kokoro/venv):
  ~/.cache/kokoro/venv/bin/python -I tools/make-audio.py            # 없는 파일만 새로 만든다
  ~/.cache/kokoro/venv/bin/python -I tools/make-audio.py --prune    # 더는 쓰지 않는 파일도 지운다
  python3 tools/make-audio.py --list                                # 녹음할 문장 수만 센다 (Kokoro 불필요)
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "audio"
VOICE = "af_heart"
# 설정 화면 '🔊 테스트' 문장 (js/views/settings.js)
EXTRA = ["Hi, I'm your OPIc coach. Let's start the interview now. Tell me a little about yourself."]


def split_sentences(text):
    """앱(js/util.js splitSentences)과 같은 규칙."""
    return [x.strip() for x in re.findall(r'[^.!?]+[.!?]+["\']?|[^.!?]+$', text or "") if x.strip()]


def norm(text):
    return " ".join(str(text).split())


def audio_key(text):
    return hashlib.sha1(norm(text).encode("utf-8")).hexdigest()[:16]


def collect():
    """앱 화면에서 speak() 로 읽는 모든 문장."""
    out = list(EXTRA)
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    for entry in index["topics"]:
        t = json.loads((DATA / entry["file"]).read_text(encoding="utf-8"))
        out += [e["en"] for e in t.get("expressions", [])]
        out += [p["en"] for p in t.get("patterns", [])]
        for c in t.get("combos", []):
            out.append(" ".join(p["en"] for p in c["parts"]))       # 조합 ▶ 는 이어 붙인 단락
        for q in t.get("questions", []):
            out.append(q["en"])
            for a in (q.get("answers") or {}).values():
                out += split_sentences(a)
    pats = json.loads((DATA / "patterns.json").read_text(encoding="utf-8"))
    for g in pats.get("groups", []):
        for it in g.get("items", []):
            out.append(it["en"])
            out += it.get("examples", [])
    bank_path = DATA / "answer-bank.json"
    if bank_path.exists():
        bank = json.loads(bank_path.read_text(encoding="utf-8"))
        for g in bank["groups"]:
            for it in g["items"]:
                out.append(it["en"])
                for a in (it.get("answers") or {}).values():
                    out += split_sentences(a)
    seen, uniq = set(), []
    for s in out:
        s = norm(s)
        if s and s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="문장 수와 아직 없는 파일 수만 출력")
    ap.add_argument("--prune", action="store_true", help="지금 쓰지 않는 녹음 파일 삭제")
    ap.add_argument("--limit", type=int, default=0, help="이번에 만들 최대 개수 (0 = 전부)")
    a = ap.parse_args()

    texts = collect()
    keys = {audio_key(t): t for t in texts}
    OUT.mkdir(parents=True, exist_ok=True)
    missing = [(k, t) for k, t in keys.items() if not (OUT / f"{k}.mp3").exists()]
    print(f"문장 {len(keys)}개 · 녹음 없음 {len(missing)}개")
    if a.list:
        return

    if missing:
        import soundfile as sf
        from kokoro_onnx import Kokoro
        home = os.environ.get("KOKORO_HOME", os.path.expanduser("~/.cache/kokoro"))
        kokoro = Kokoro(f"{home}/kokoro-v1.0.onnx", f"{home}/voices-v1.0.bin")
        todo = missing[: a.limit] if a.limit else missing
        start = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "x.wav")
            for n, (k, t) in enumerate(todo, 1):
                samples, rate = kokoro.create(t, voice=VOICE, speed=1.0, lang="en-us")
                sf.write(wav, samples, rate)
                # 말소리용: 모노 24kHz 32kbps (약 4KB/초)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-ar", "24000", "-b:a", "32k",
                                str(OUT / f"{k}.mp3")], check=True)
                if n % 50 == 0 or n == len(todo):
                    el = time.time() - start
                    print(f"{n}/{len(todo)} · {el / 60:.1f}분 · 남은 시간 약 {el / n * (len(todo) - n) / 60:.0f}분", flush=True)

    if a.prune:
        gone = [p for p in OUT.glob("*.mp3") if p.stem not in keys]
        for p in gone:
            p.unlink()
        print(f"쓰지 않는 파일 {len(gone)}개 삭제")

    have = sorted(p.stem for p in OUT.glob("*.mp3") if p.stem in keys)
    (OUT / "index.json").write_text(json.dumps({"voice": VOICE, "keys": have}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"index.json: {len(have)}개")


if __name__ == "__main__":
    sys.exit(main())
