"""spec の voice_src の行（声だけを配信の別の秒から取った本人の声）に、指示書の narration.lines で
orig_voice の印を付ける。書き出し（render.py）が元の声として整えて、AI の声の真ん中 +0.5dB に揃えるため。
build_edit.py は orig_voice の行しか印を付けないので、組んだあとに足す。python3 -I shorts/videos/totoro-cat/p2/mark_voice_src.py <spec> <edit>（build_edit.py のあとに毎回）"""
import json, sys
spec = json.load(open(sys.argv[1])); p = sys.argv[2]; e = json.load(open(p))
lines = e["narration"]["lines"]
assert len(lines) == len(spec["rows"])
done = []
for i, r in enumerate(spec["rows"]):
    if r.get("voice_src"):
        assert lines[i]["text"].replace(" ", "") == r["line"].replace(" ", ""), (i, lines[i]["text"])
        lines[i]["orig_voice"] = True
        lines[i]["voice_src"] = True
        done.append(i + 1)
e.setdefault("_note", "")
e["_note"] = (e["_note"] + " " if e["_note"] else "") + f"原稿の {'・'.join(map(str, done))} 行目は voice_src（本人の声を配信の別の秒から取った行）なので、組んだあとに narration.lines へ orig_voice の印を足した（書き出しが元の声として整えて揃える）"
json.dump(e, open(p, "w"), ensure_ascii=False, indent=1)
print("marked", done)
