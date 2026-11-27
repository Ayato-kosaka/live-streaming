"""**画と言葉の検査（`scene.py`）が、落ちるときに落ちるか。** 書き出しは通さない（時間割と小さい合成の素材だけ）。

    python3 tools/shorts/qa/scene_selftest.py [--keep DIR]

あやと（2026-11-27、#1451）「絶対ルールとして、全くセリフと関係のない配信の切り抜き素材を使わない」。帳面の画の項目
（F-014・F-058・F-060・F-064・F-082・F-086〜F-089・F-096・F-104〜F-106）を数える検査ごとに、壊していない時間割（clean）を
1か所だけ壊した足を作り、**壊したところを見る検査だけが落ちる**ことを当てる。検査役（`claude -p`）は偽物に差し替える
（`shows` の字で答える: 「足元」「道中」→ 関係無い・「自撮り」→ 自撮り・「水彩」→ 絵の見た目・見出しの「クリスマス」→ 中身の名前でない）。

| 足 | 壊し方 | 落ちる検査 |
| --- | --- | --- |
| clean | 題の札 0〜4秒（撮影の動画 → 配信の看板）・旅の前置きに撮影の動画と島の画面・本人の声の行に食べる自撮り・見出し「2. 上の階は本」 | どれも pass |
| shows_missing | 1本の shows を消す | `shows_tag` |
| scene_unrelated | 配信の画の shows が「歩く足元の道中」（検査役が関係無いと言う） | `scene_match` |
| scene_unrelated_footage | 撮影の動画で同じ | `scene_match` が needs-human（配信の画でなければ落とさず人に） |
| scene_event | 配信の画で関係無いが、カットに event | `scene_match` が needs-human |
| preface_stream_only | 旅の前置きの行の撮影の動画を配信の画に | `preface_scene` |
| island_missing | 「ガイドサイトで見た」行の島の画面をカードに | `island_scene` |
| guidebook_ok | 行の字が「ガイドブックが無い」で島の画面なし | どれも pass |
| selfie_bad | 本編の配信の画を「話す本人の自撮り」に | `selfie_rows` |
| selfie_event | 同じで、カットに event | どれも pass |
| selfie_shows_thing | 顔のほかに物を見せる自撮り（検査役の face_event） | どれも pass |
| badge_telop | テロップ「● LIVE 配信中」 | `badge_text` |
| badge_enabled | 様式の live_badge.enabled を true | `badge_text` |
| hook_still | 0〜2秒をカードの写真1枚 | `hook_still` |
| hook_still_short | カードの写真を 1.33秒 | どれも pass |
| voice_footage | 本人の声の行を撮影の動画に | `voice_rows` |
| voice_stickers | 本人の声の行に札を2枚 | `voice_rows` |
| series_same | 前の回が同じ撮影の素材の同じ区間 | `series_reuse` |
| series_other | 前の回は別の撮影の素材 | どれも pass |
| time_back | 本編の人の様子の画（本を並べる店員）が、前の行（0:11:42）より 42秒前に戻る | `time_order` |
| time_back_ok | 同じで、カットに order_ok | どれも pass |
| time_small | 10秒だけ戻る（線 30秒の内） | どれも pass |
| time_far | 600秒より大きく戻る（別の場面の画） | どれも pass |
| time_object | 42秒戻るが、人の様子でなく物（本棚）の画 | どれも pass |
| note_bad | 見出し「2. 上の階はクリスマス」 | `note_words` |
| hook_map_missing | 題が「街を回ってみた」でフックに地図が無い | `hook_map` |
| hook_map_ok | 同じで、フックに地図のカット | どれも pass |
| tour_false | 題は同じだが spec の tour が false | どれも pass |
| photo_painted | 本編の差し込みの絵が「水彩の吹き抜けの絵」 | `photo_look` |

ほかに3つ: 人の目の表（`human_table`）が F-020・F-082 の行と印で通り、行が無いと落ちる／検査役の答えを指示書に押す
（`--stamp`）と、検査役を起こせない箱でも同じ答えで通り、`shows` を直すと答えを使わず not-checkable になる／
**検査を1本ずつ外す**（`scene.CHECKS` のその検査を「いつも合格」に差し替える）と、その検査を落とすはずの足だけが外れる。

終了コード 0=思ったとおり / 1=思ったとおりでない / 2=数えるものが無い（ffmpeg）。
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import scene  # noqa: E402
from common import FAIL, HUMAN, NA, PASS, Ctx, result  # noqa: E402

FPS = 30


def fake_judge(items: list[dict], heads: list[dict]) -> tuple[dict, dict]:
    cuts = {}
    for it in items:
        sh = it["shows"]
        cuts[it["id"]] = {"related": not any(w in sh for w in ("足元", "道中")), "shows_true": True,
                          "selfie": "自撮り" in sh, "face_event": "食べ" in sh, "painted": "水彩" in sh, "why": f"偽の検査役（{sh}）"}
    hs = {h["id"]: {"names_content": "クリスマス" not in h["text"], "why": "偽の検査役"} for h in heads}
    fake_judge.calls += 1
    return cuts, hs


fake_judge.calls = 0


def clean_plan(src: Path) -> dict:
    """壊していない時間割。行の頭は 0・120・240・330・390・480（コマ）、全部で 540（18秒）。"""
    def cut(at, n, row, kind, shows, **kw):
        c = {"path": str(src), "in": 0, "out": n, "at": at, "frames": n, "row": row, "kind": kind, "shows": shows}
        if kind == "footage":
            c.update(footage=kw.pop("fid", "ffsyn0001"), video=f"footage:{kw.pop('fid2', 'ffsyn0001')}",
                     src_from=0.0, src_to=n / FPS)
        elif kind == "stream":
            t = kw.pop("t", 600.0)
            c.update(video="SYNTHvid001", src_from=t, src_to=t + n / FPS)
        c.update(kw)
        return c
    cuts = [cut(0, 60, 0, "footage", "白い吹き抜けの本屋"),
            cut(60, 60, 0, "stream", "本屋の白い建物と看板", t=580.0),
            cut(120, 60, 1, "footage", "旧市街の綺麗な街並み", fid="ffsyn0002", fid2="ffsyn0002"),
            cut(180, 60, 1, "island", "あやと島のブカレストのガイドの頁"),
            cut(240, 90, 2, "stream", "白い吹き抜けと棚", t=600.0),
            cut(330, 60, 3, "stream", "ケーキを食べる本人の自撮り", t=700.0),
            cut(390, 90, 4, "stream", "上の階の本棚と本を並べる店員", t=800.0),
            cut(480, 60, 5, "stream", "吹き抜けを見下ろす", t=650.0)]
    texts = ["ルーマニアの本屋さんに行ってみた！", "東欧を旅してて、ガイドサイトで見た本屋さんへ！", "中に入ると、白い吹き抜け！",
             "うまっ！", "上の階は本！", "みんなも行ってみたい？"]
    starts = [0, 120, 240, 330, 390, 480]
    narr = [{"at": a, "text": t, **({"orig_voice": True} if i == 3 else {})} for i, (a, t) in enumerate(zip(starts, texts))]
    return {"fps": FPS, "size": [1080, 1920], "frames": 540, "cuts": cuts, "narration": narr,
            "titles": [{"from": 0, "to": 120, "text": "🇷🇴ルーマニアの本屋さんに行ってみた！"}],
            "telops": [{"from": 390, "to": 480, "text": "2. 上の階は本"}], "notes": [], "stickers": [],
            "style": {"live_badge": {"enabled": False}, "end_note": {"text": "※YouTubeで毎日22時から配信"}}}


def legs(box: Path) -> list[tuple[str, str | None, str, callable]]:
    """（名前, 落ちるはずの検査, その検査の判定, 時間割を壊す関数）。落ちるはずの検査が None なら全部 pass。"""
    prev_same = box / "prev_same.json"
    prev_same.write_text(json.dumps({"sources": {"f": {"footage": "ffsyn0001"}},
                                     "cuts": [{"src": "f", "in": 0, "out": 60, "row": 0, "shows": "前の回の吹き抜け"}]}))
    prev_other = box / "prev_other.json"
    prev_other.write_text(json.dumps({"sources": {"f": {"footage": "ffsyn0099"}},
                                      "cuts": [{"src": "f", "in": 0, "out": 60, "row": 0, "shows": "前の回の別の画"}]}))

    def set_cut(k, **kw):
        def f(p):
            p["cuts"][k].update(kw)
            for key in [x for x, v in kw.items() if v is None]:
                p["cuts"][k].pop(key)
        return f

    def stream_at(k, t):
        def f(p):
            c = p["cuts"][k]
            c.update(kind="stream", video="SYNTHvid001", src_from=t, src_to=t + c["frames"] / FPS)
            c.pop("footage", None)
        return f

    def both(*fs):
        def f(p):
            for g in fs:
                g(p)
        return f

    def resplit(p):   # 題の行のカットを 40 + 80 コマに（カードの写真を 1.33秒）
        p["cuts"][0].update(kind="card", shows="吹き抜けのカードの写真", out=40, frames=40)
        p["cuts"][0].pop("footage", None)
        p["cuts"][1].update(at=40, out=80, frames=80)

    return [
        ("clean", None, PASS, lambda p: None),
        ("shows_missing", "shows_tag", FAIL, set_cut(7, shows="")),
        ("scene_unrelated", "scene_match", FAIL, set_cut(4, shows="歩く足元の道中")),
        ("scene_unrelated_footage", "scene_match", HUMAN, set_cut(2, shows="歩く足元の道中")),
        ("scene_event", "scene_match", HUMAN, set_cut(4, shows="歩く足元の道中", event="着いた瞬間の道")),
        ("preface_stream_only", "preface_scene", FAIL, stream_at(2, 590.0)),
        ("island_missing", "island_scene", FAIL, set_cut(3, kind="card", shows="旧市街のカードの写真")),
        ("guidebook_ok", None, PASS, both(set_cut(3, kind="card", shows="旧市街のカードの写真"),
                                         lambda p: p["narration"][1].update(text="東欧を旅してても、ガイドブックが無いねん！"))),
        ("selfie_bad", "selfie_rows", FAIL, set_cut(4, shows="吹き抜けで話す本人の自撮り")),
        ("selfie_event", None, PASS, set_cut(4, shows="吹き抜けで驚く本人の自撮り", event="入った瞬間に驚く顔")),
        ("selfie_shows_thing", None, PASS, set_cut(4, shows="本を見せる本人の自撮り（食べ物ではない）")),
        ("badge_telop", "badge_text", FAIL, lambda p: p["telops"].append({"from": 0, "to": 60, "text": "● LIVE 配信中"})),
        ("badge_enabled", "badge_text", FAIL, lambda p: p["style"]["live_badge"].update(enabled=True)),
        ("hook_still", "hook_still", FAIL, both(set_cut(0, kind="card", shows="吹き抜けのカードの写真"),
                                               lambda p: p["cuts"][0].pop("footage", None))),
        ("hook_still_short", None, PASS, resplit),
        ("voice_footage", "voice_rows", FAIL, set_cut(5, kind="footage", footage="ffsyn0003", video="footage:ffsyn0003",
                                                      shows="ケーキの棚", src_from=0.0, src_to=2.0)),
        ("voice_stickers", "voice_rows", FAIL, lambda p: p["stickers"].extend(
            [{"from": 330, "to": 390, "x": 300, "y": 1300, "w": 200, "image": f"s{i}.png"} for i in range(2)])),
        ("series_same", "series_reuse", FAIL, lambda p: p.update(follows=[str(prev_same)])),
        ("series_other", None, PASS, lambda p: p.update(follows=[str(prev_other)])),
        ("time_back", "time_order", FAIL, stream_at(6, 660.0)),
        ("time_back_ok", None, PASS, both(stream_at(6, 660.0), set_cut(6, order_ok="答えの棚を先に見せる"))),
        ("time_small", None, PASS, stream_at(6, 692.0)),
        ("time_far", None, PASS, stream_at(6, 30.0)),
        ("time_object", None, PASS, both(stream_at(6, 660.0), set_cut(6, shows="上の階の本棚"))),
        ("note_bad", "note_words", FAIL, lambda p: p["telops"][0].update(text="2. 上の階はクリスマス")),
        ("hook_map_missing", "hook_map", FAIL, lambda p: p["titles"][0].update(text="ブカレストの街を回ってみた！")),
        ("hook_map_ok", None, PASS, both(lambda p: p["titles"][0].update(text="ブカレストの街を回ってみた！"),
                                         set_cut(1, kind="map", shows="ルーマニアの地図とブカレストへの道のり"))),
        ("tour_false", None, PASS, lambda p: p.update(tour=False, titles=[{**p["titles"][0], "text": "ブカレストの街を回ってみた！"}])),
        ("photo_painted", "photo_look", FAIL, set_cut(4, kind="art", shows="水彩の吹き抜けの絵")),
    ]


def run_leg(box: Path, src: Path, name: str, breaker, checks: dict) -> dict:
    plan = clean_plan(src)
    breaker(plan)
    os.environ["SHORTS_SCENE_VERDICTS"] = str(box / f"{name}.verdicts.json")
    Path(os.environ["SHORTS_SCENE_VERDICTS"]).unlink(missing_ok=True)
    ctx = Ctx(mp4=box / f"{name}.json", work=None, style=plan["style"], out_dir=box / name, plan=plan, fps=FPS)
    return {cid: fn(ctx) for cid, fn in checks.items()}


def judge(box: Path, src: Path, ls: list, checks: dict) -> list[str]:
    """足を全部回し、思ったとおりでない足の名前と理由。"""
    bad = []
    for name, target, want, breaker in ls:
        got = run_leg(box, src, name, breaker, checks)
        wrong = [f"{cid}: {r['status']}（欲しいのは {want if cid == target else PASS}）{r['problems'][:1]}"
                 for cid, r in got.items() if r["status"] != (want if cid == target else PASS)]
        if wrong:
            bad.append(f"{name}: " + " ／ ".join(wrong))
    return bad


def leg_stamp(box: Path, src: Path) -> list[str]:
    """検査役の答えを指示書に押す → 検査役を起こせない箱でも通る → shows を直すと答えを使わない。"""
    out = []
    edit = {"meta": {"fps": FPS}, "sources": {"s": {"path": str(src), "t0": 600.0}},
            "narration": {"lines": [{"at": 0, "text": "吹き抜けがすごい！"}, {"at": 60, "text": "上の階は本！"}]},
            "title": {"text": "題", "look": "card", "from": 0, "to": 30},
            "telops": [{"from": 60, "to": 120, "text": "1. 上の階は本"}],
            "cuts": [{"src": "s", "in": 0, "out": 60, "row": 0, "shows": "白い吹き抜け"},
                     {"src": "s", "in": 0, "out": 60, "row": 1, "shows": "上の階の本棚"}]}
    p = box / "stamp_edit.json"
    p.write_text(json.dumps(edit, ensure_ascii=False))
    os.environ["SHORTS_SCENE_VERDICTS"] = str(box / "stamp.verdicts.json")
    ctx = scene.edit_ctx(p, out_dir=box / "stamp")
    r1 = scene.check_scene_match(ctx)
    n = scene.stamp(p, ctx)
    if r1["status"] != PASS or n != 3:
        out.append(f"stamp: 検査役に聞いて押す（{r1['status']}・押した {n} 件。欲しいのは pass・カット2と見出し1）")
    os.environ["SHORTS_SCENE_VERDICTS"] = str(box / "stamp_empty.verdicts.json")
    saved, scene.JUDGE = scene.JUDGE, None
    os.environ["SHORTS_SCENE_JUDGE"] = "0"
    try:
        r2 = scene.check_scene_match(scene.edit_ctx(p, out_dir=box / "stamp2"))
        e = json.loads(p.read_text())
        e["cuts"][0]["shows"] = "直した吹き抜け"
        p.write_text(json.dumps(e, ensure_ascii=False))
        r3 = scene.check_scene_match(scene.edit_ctx(p, out_dir=box / "stamp3"))
    finally:
        scene.JUDGE = saved
        os.environ.pop("SHORTS_SCENE_JUDGE", None)
    if r2["status"] != PASS:
        out.append(f"stamp: 押した答えだけで通る（{r2['status']}・{r2['summary']}）")
    if r3["status"] != NA:
        out.append(f"stamp: shows を直したら押した答えを使わない（{r3['status']}・欲しいのは not-checkable）")
    return out


def leg_human(box: Path) -> list[str]:
    out = []
    ok = box / "qa_ok.md"
    ok.write_text("| 項目 | 当否 | 理由 |\n| --- | --- | --- |\n| F-020 冒頭3秒 | ○ | 答えの画 |\n| F-082 写真の見た目 | － | 差し込み無し |\n")
    ng = box / "qa_ng.md"
    ng.write_text("| 項目 | 当否 | 理由 |\n| --- | --- | --- |\n| F-020 冒頭3秒 | | |\n")
    a = scene.check_human_table(None, ok)
    b = scene.check_human_table(None, ng)
    if a["status"] != PASS:
        out.append(f"human_table: 2つの行と印があれば通る（{a['status']}・{a['problems']}）")
    if b["status"] != FAIL or len(b["problems"]) != 2:
        out.append(f"human_table: 印の無い行と無い行で落ちる（{b['status']}・{b['problems']}）")
    return out


def run(keep: Path | None) -> int:
    if not shutil.which("ffmpeg"):
        print("✕ ffmpeg が無い（数えるものが無い）")
        return 2
    tmp = Path(tempfile.mkdtemp(prefix="scene_selftest_"))
    box = keep or tmp
    box.mkdir(parents=True, exist_ok=True)
    src = box / "src.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"testsrc2=size=108x192:rate={FPS}:duration=4", "-c:v", "libx264", "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p", str(src)], check=True)
    scene.JUDGE = fake_judge
    ls = legs(box)
    bad = judge(box, src, ls, dict(scene.CHECKS))
    for b in bad:
        print(f"✕ {b}")
    print(f"{'○' if not bad else '✕'} 足 {len(ls)} 本（検査 {len(scene.CHECKS)} 本）")
    extra = leg_stamp(box, src) + leg_human(box)
    for b in extra:
        print(f"✕ {b}")
    print(f"{'○' if not extra else '✕'} 指示書に押す答え・人の目の表")
    # 検査を1本ずつ外す: その検査を落とすはずの足だけが外れる
    off_bad = []
    for cid in scene.CHECKS:
        checks = dict(scene.CHECKS)
        checks[cid] = lambda ctx, _c=cid: result(_c, _c, PASS, "外した")
        fell = {b.split(":")[0] for b in judge(box, src, ls, checks)}
        want = {n for n, t, w, _ in ls if t == cid and w != PASS}
        if fell != want or not want:
            off_bad.append(f"{cid} を外すと外れた足 {sorted(fell)}（欲しいのは {sorted(want)}・1本以上）")
    for b in off_bad:
        print(f"✕ {b}")
    print(f"{'○' if not off_bad else '✕'} 検査を1本ずつ外すと、その検査の足だけが外れる（{len(scene.CHECKS)} 本）")
    print(f"  偽の検査役を起こした回数 {fake_judge.calls}")
    if keep is None:
        shutil.rmtree(tmp, ignore_errors=True)
    n = len(bad) + len(extra) + len(off_bad)
    print("○ 思ったとおり" if not n else f"✕ {n} 件が思ったとおりでない")
    return 1 if n else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=Path)
    sys.exit(run(ap.parse_args().keep))
