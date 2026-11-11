"""声の一覧（collect.py の lines.json）に、voice_src の行（17・18行目。cut_voice_src.py が切った本人の声）を行の順に差し込む。
build_edit.py は voice_src の行の声も声の一覧から読む（AI の声は作らない）。collect.py を回し直したら毎回これも回す。
python3 -I shorts/videos/kunXt2sXnFQ/p1/add_vsrc_lines.py <spec.json> <lines.json> <vsrc の置き場>
"""
import json, sys
from pathlib import Path

spec = json.load(open(sys.argv[1])); p = Path(sys.argv[2]); vs = json.load(open(Path(sys.argv[3]) / "vsrc.json"))
d = json.load(open(p))
items = d["lines"] if isinstance(d, dict) else d
items = [x for x in items if not x.get("voice_src")]
for n, r in enumerate(spec["rows"], 1):
    if not r.get("voice_src"):
        continue
    v = vs[f"{n:02d}"]
    items.append({"key": f"{spec['id']}/{n:02d}", "plan": spec["id"], "n": n, "caption": r["line"], "file": v["file"],
                  "wav": v["file"], "duration_s": v["duration"], "voice_src": True,
                  "match": "本人の声（配信の音）", "segments": v["segments"]})
items.sort(key=lambda x: (x.get("plan", ""), x["n"]))
json.dump(items if not isinstance(d, dict) else {**d, "lines": items}, open(p, "w"), ensure_ascii=False, indent=1)
print([x["key"] for x in items])
