#!/usr/bin/env python3
"""画と言葉の検査: カットに「写っている物」（`shows`）と「素材の種類」（`kind`）を持たせ、その行の言葉と突き合わせる。

    python3 tools/shorts/qa/scene.py <edit_X.json> [--only id,id] [--verdicts V.json] [--no-judge] [--follows edit_prev.json]
                                     [--human qa_X.md] [--json out.json] [--md out.md]
    # 書き出しの前（指示書だけ）に回す。check.py も同じ検査を時間割（work/plan.json）で回す

あやと（2026-11-27、#1451 本屋の回）:

> ここらへんの素材選びが何度言っても弱いので、絶対ルールとして、全くセリフと関係のない配信の切り抜き素材を使わない。

帳面の画の項目のうち、2回以上言われたのに当てる場所が人の目だけだったもの（F-014 4回・F-058 4回・F-060 3回・F-064・
F-080・F-086〜F-089・F-096・F-104〜F-106）を、ここで数える。どれも「どの素材を、どの行に、何秒」で決まるので、
画素を読まずに時間割と指示書で決まるものが多い（判定の速さは時間割の字を読む `line_breaks` と同じ）。

## カットに書くもの（指示書・時間割のカット。`build_edit.py` が spec・overrides から運ぶ）

- `shows`（**必須**）: そのカットに写っている物・場所の短い言葉（「cărturești の白い吹き抜けと棚」「鼻声で話す本人の自撮り」）。
  狙い（`note`）ではなく、コマに写っている物を書く。無いカットは `shows_tag` が落とす
- `kind`: 素材の種類。`stream`（配信の画）・`footage`（あやとの撮影の動画）・`card`（あやと島カードの写真）・
  `island`（あやと島の画面の録画）・`map`（地図の動画。`hookmap.py`）・`art`（描いた絵・生成した絵）・`stock`（商用可の素材）・
  `screen`（ほかの画面の録画: YouTube・Google マップ）。書かなければ、撮影の素材の印 → `footage`、取り込みの台帳の
  `art`（card → `card`・free → `stock`・island → `island`・ほか → `art`）、台帳の `range` が `hook-map` → `map`、画像のファイル → `art`、
  どれでもなければ `stream`（**配信の画とみなす側に倒す。** 島の画面・カードを印なしで使うと、配信の画の決まりで落ちる）
- `event`（任意）: 出来事そのものが要る画（食べる瞬間の本人・驚いた顔）。自撮りと配信の画の例外の理由
- `order_ok`（任意）: 配信の起きた順と逆に置く理由（答えを先に見せる、など）

## 検査（id・帳面の項目・何で落ちるか）

| id | 項目 | 落ち |
| --- | --- | --- |
| `shows_tag` | F-104・F-014 | `shows` の無いカットが1本でもある |
| `scene_match` | F-104・F-014・F-088 | `claude -p` の検査役（コマ1〜2枚と行の字と `shows` を渡し、決まった型の JSON を返させる）が、**配信の画**で「行の言葉と関係無い」と言ったカットが1本でもある。配信の外の素材で「関係無い」・`shows` がコマと食い違う・配信の画で自撮り（下の `selfie_rows` に渡す）は人が見る |
| `preface_scene` | F-104 | 旅の前置きの行（「東欧を旅してて」「〜を回ってる」）に、配信の外の綺麗な画（撮影の動画・カード・商用可の素材）が1本も無い |
| `island_scene` | F-105・F-088 | 行に「あやと島」「ガイド（サイト・ページ・で見た…。ガイドブック・ガイドさんは除く）」があるのに、その行にあやと島の画面（`island`）のカットが無い |
| `selfie_rows` | F-058 | 自撮りのカット（`shows` に自撮り・話す本人・本人の顔。検査役が自撮りと言ったもの）が、顔が話の中身になる印（カットか行の `event`・本人の声の行・顔のほかに物を見せる＝検査役の `face_event`、無ければ `shows` に食べる・見せる・持ち上げる）の無い行に当たる |
| `badge_text` | F-064 | 様式の `live_badge.enabled` が true／題の札・テロップ・注・札の字に「LIVE」「YouTube ライブ」「ライブ配信中」などライブの札の字がある（終わりの注 `※YouTubeで毎日22時から配信` は F-042 の決めなので数えない） |
| `hook_still` | F-086 | 0〜3秒に、止め絵（カード・絵・画像のファイル・止め絵の印・画面の6割以上を覆う札）を1枚で 1.5秒より長く置く |
| `voice_rows` | F-087 | 本人の声の行（`orig_voice`・`voice_src`）に、配信の画（本人の映像）でないカットがある／札が2枚以上重なる |
| `series_reuse` | F-089 | 続きものの前の回（spec の `follows`、`--follows`）と、同じ撮影の素材の同じ区間・同じ配信の同じ秒（2秒以内）・同じカード／絵のファイルを使う |
| `time_order` | F-096 | フックの後ろで、人の様子の画（`shows` に本人・顔・店員・食べる…）が、隣の前の行で使った同じ配信の秒より 30〜600秒前に戻る。`order_ok`・本人の声の行・「」で言葉を言う瞬間の画は落とさない |
| `note_words` | F-106 | 段の見出しの札（番号つきのテロップ・注。`◆` の注は行き先・手順の札なので数えない。vxy-p5-v6「◆国民の館へ」は道中の画の上で正しい）の言葉（「は」の後ろ）が、見出しの出ている間のカットの `shows` に、出ている時間の6割以上で写らない。字で決まらないときは検査役に聞き、写っている中身の名前でないと言えば落ち |
| `hook_map` | F-060 | 街を回る回（spec の `tour: true`、無ければ題に「回って・巡って・散策・街歩き・1日」）のフック（題の札の間）に、地図（`map`）のカットが無い |
| `photo_look` | F-082 | 全面に置いた差し込みの画（`card`・`art`・`stock`）を、検査役が水彩画・描いた絵の見た目と言った |
| `human_table` | F-020・F-082 | （`--human` を渡したときだけ）人の目の表（`qa_X.md`）に、機械にできない項目の行が無い・印（○・✕・－）が無い |

F-094（本編の粗い配信の画）・F-080 は `sharp.py`（`sharpness`）が数える。

## 検査役（`scene_match`・`note_words`）

`claude -p` を1本の動画に1回だけ起こす（`tools/shorts/script/critic.py` と同じく道具も MCP も持たせず、リポジトリの外の
空の置き場で）。カットごとに字なしの版（無ければ仕上がり・無ければ元の素材）のコマを 216x384 に縮めて渡す。返事は
`scene_schema.json` の型で、カットごとに `related`（行の言葉と関係あるか）・`shows_true`（`shows` がコマと合うか）・
`selfie`（本人が大きく写る自撮りか）・`why`。答えは中身の指紋（行の字・`shows`・種類・コマの sha1）ごとに控え
（`--verdicts`、check.py では `work/scene_verdicts.json`）に貯め、同じものは2度聞かない。

- 検査役を起こせない箱（Actions のランナー）で答えが無いカットは **not-checkable**（通したことにしない）。
  作業箱で `scene.py <edit.json> --stamp` を回すと、答えを指示書のカット（`scene`。見出しは `scene_headings`）に押す。
  書き出しはカットの欄をそのまま時間割へ運ぶので、Actions の check.py も同じ答えで判定する。指紋（行の番号と字・入りと尻・
  `shows`・種類）がずれた答えは使わない（`shows` や行を直したら聞き直す）
- 撮影の素材（`footage`）のカットは、手元の私有の置き場の作業用（`SHORTS_FOOTAGE_DIR`、既定 ~/.cache/shorts/footage の
  `<ID>.mp4`。書き出しの `render.py` と同じ道）のコマを渡す（2026-11-27。前は道が無く、担当が道を足した写しで答えを取っていた）
- **コマの無い答えは使わない・残さない**（2026-11-27）。コマを渡さずに得た答え（`frames` が 0）は、控えから読んでも・指示書に
  押してあっても数えず、控えにも指示書にも書かない（⑦で1回、「コマ無し」の答えが控えと指示書に残った）
- `SHORTS_SCENE_JUDGE=0` で起こさない（selftest は偽の検査役を差し込む）。起こした回数は `measured.judge_calls`

## 線と例外（なぜその線か）

- `time_order` は隣の行どうしを比べる（1行の中の並びは見ない）。フックと最後の行（問い・輪）は外す。30秒: 同じ場面の中で、
  言う順と画の順が少し入れ替わるのは普通。**数えるのは人の様子の画だけ**: あやとが通した6本は、物・場所の紹介の画（乗るバス・
  宿のキッチン・空いた座席）を後の時刻から持ってくるのが普通で、全部の配信の画で数えると6本中5本が落ちた（README の実測）。
  F-096 が言うのは「出来事のあとの顔を、前の行に当てない」で、人の様子は出来事の前後で変わる。600秒より大きく戻るのは別の場面
- `note_words` の6割: 見出しの出ている間の半分を越えて、見出しの言葉が写っていればよい（「1階はクリスマス」は
  クリスマスの売り場が出ているのが半分ほどで、ほかは雑貨の棚）
- 旅の前置きは「綺麗な画が1本も無い」で落とす（行の後半が本人の話で、配信の画が要ることがある。国民の館 v6 の
  「東欧を旅してて、…完全に風邪ひいた」は撮影の動画のあとに鼻声の自撮り）
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import FAIL, HUMAN, NA, PASS, SEVERITY, Ctx, clip_entry, hms, result, stream_of  # noqa: E402

KINDS = ("stream", "footage", "card", "island", "map", "art", "stock", "screen")
PRETTY = ("footage", "card", "stock")          # 旅の前置きに当てる、配信の外の綺麗な画
STILL_KINDS = ("card", "art")                   # 1枚の絵（寄せて動かしても、止め絵）
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".avif"}
ART_KIND = {"card": "card", "free": "stock", "island": "island"}    # 取り込みの台帳の art の印 → 種類（ほかは art）

HOOK_S = 3.0          # F-086 の「0〜3秒」
HOOK_STILL_S = 1.5    # F-086「1.5秒より長く1枚で置かない」
STICKER_STILL = 0.6   # 札が画面のこれ以上を覆えば止め絵（still.py の STICKER_COVER_STILL と同じ）
ORDER_TOL_S = 30.0    # F-096 の逆戻りの線（上の「線と例外」）
SCENE_S = 600.0       # これより大きく戻るのは、別の場面の画（物・場所の紹介）として数えない
SAME_SEC = 2.0        # F-089: 同じ配信のこれ以内の秒は、同じ画
NOTE_SHARE = 0.6      # F-106: 見出しの言葉が写っていればよい時間の割合
MAX_STICKERS_VOICE = 1  # F-087「札を重ねるなら小さく1枚まで」

PREFACE = re.compile(r"(旅して|旅をして|旅しなが|旅の途中|を回って|を回りなが|を周って|周遊して)")
ISLAND = re.compile(r"(あやと島|ガイド(?!ブック|さん|の人))")
SELFIE = re.compile(r"(自撮り|話す本人|本人が話|本人の顔|顔の寄り|本人の寄り|話している本人)")
# 顔のほかに物が写っていて、それがその行の出来事になっている自撮り（F-058 の 2026-11-11 の追記。食べている・物を見せている）
SELFIE_OK = re.compile(r"(食べ|飲む|飲ん|かぶりつ|頬張|見せ|持ち上げ|手に持|掲げ)")
# 人の様子（顔・表情・動き）が写るカット。起きた順（F-096）は、人の様子が出来事の前後で変わる画だけを数える
PERSON = re.compile(r"(本人|顔|表情|反応|おばちゃん|おばあちゃん|おじさん|おっちゃん|店員|スタッフ|運転手|お客|人が|人の|手で|手に|食べ|飲|笑|驚)")
BADGE = re.compile(r"(\bLIVE\b|ＬＩＶＥ|YouTube\s*ライブ|ユーチューブ\s*ライブ|ライブ配信中|生配信中|LIVE配信|配信アーカイブ)", re.I)
TOUR = re.compile(r"(回って|巡って|巡り|散策|街歩き|1日で|一日で|1日観光|観光してみた)")
HEADING = re.compile(r"^\s*[0-9０-９]+\s*[.．、:：)）]")   # 段の見出し（「1. 1階は雑貨」）。◆ の注は行き先・手順の札なので数えない
_DROP = re.compile(r"[\s　◆※・、。，．,.!！?？「」『』（）()〜~\-ー:：0-9０-９]")

MODEL = os.environ.get("SHORTS_SCENE_MODEL", "opus")  # 記録には書かない（リポジトリにモデル名を残さない）
EFFORT = os.environ.get("SHORTS_SCENE_EFFORT", "medium")
THUMB = (216, 384)
MAX_IMAGES = 60       # 1回の検査役に渡すコマの上限（越えたら2回に分ける）
SYSTEM = ("あなたは縦型ショートの画の検査役。渡された字とコマだけを見て、決まった型の JSON だけを返す。"
          "ファイル・道具は使わない。甘く見ない: 行の言葉と関係の無い画は、尺の穴埋めでも『関係無い』と言う。")


# ---------------------------------------------------------------- 時間割を読む

def cut_kind(c: dict) -> str:
    """カットの素材の種類（上の「カットに書くもの」の順で決める）。"""
    k = c.get("kind")
    if k in KINDS:
        return k
    if c.get("footage"):
        return "footage"
    p = c.get("path")
    if p:
        ent = clip_entry(Path(p))
        if ent.get("art"):
            return ART_KIND.get(ent["art"], "art")
        if ent.get("kind") in KINDS:
            return ent["kind"]
        if ent.get("range") == "hook-map":
            return "map"
        if Path(p).suffix.lower() in IMAGE_EXT:
            return "art"
    return "stream"


def plan_from_edit(edit: dict, edit_path: Path | None = None) -> dict:
    """指示書（edit_X.json）から、検査が読む時間割の形を組む（書き出しの前に回すため）。

    カットの頭（at）は指示書の並びの足し算。配信の秒は窓の頭（sources の t0）＋入りのコマ。配信の id は、
    素材の置き場の index.json（あれば）→ 道の中の配信の id らしい名前 → 指示書の id の順で決める。"""
    fps = float((edit.get("meta") or {}).get("fps") or 30)
    base = edit_path.parent if edit_path else Path.cwd()
    # 道に配信の id が無い窓（作業の置き場の win/ など）は、spec の置き場（shorts/videos/<配信>/pN/）の回とみなす
    sp = (edit.get("meta") or {}).get("spec")
    episode = Path(sp).parent.parent.name if sp and re.fullmatch(r"[A-Za-z0-9_-]{11}", Path(sp).parent.parent.name) else None
    cuts, t = [], 0
    for c in edit.get("cuts") or []:
        src = (edit.get("sources") or {}).get(c.get("src"), {})
        n = int(c["out"]) - int(c["in"])
        cut = {**c, "at": t, "frames": n}
        if src.get("footage"):
            cut["footage"] = src["footage"]
            cut["video"] = f"footage:{src['footage']}"
            cut["src_from"] = c["in"] / fps
        if src.get("path"):
            p = Path(src["path"])
            cut["path"] = str(p if p.is_absolute() else base / p)
            vid = None
            if (Path(cut["path"]).parent / "index.json").exists():
                vid, _ = stream_of(Path(cut["path"]))
            if not vid or vid == cut["path"]:
                ids = [x for x in Path(cut["path"]).parts if re.fullmatch(r"[A-Za-z0-9_-]{11}", x)]
                vid = ids[-1] if ids else episode or str(Path(cut["path"]).parent)
            cut["video"] = vid
            cut["src_from"] = float(src.get("t0") or 0.0) + c["in"] / fps
        cut["src_to"] = cut.get("src_from", 0.0) + n / fps
        cuts.append(cut)
        t += n
    narr = (edit.get("narration") or {}).get("lines") or []
    title = edit.get("title") or {}
    titles = [{"from": int(title.get("from", 0)), "to": int(title.get("to") or t), "text": title.get("text", "")}] \
        if title.get("look") == "card" or title.get("to") else []
    style = {}
    if edit.get("style"):
        for cand in (base / edit["style"], HERE.parent / "render" / edit["style"]):
            try:
                style = json.loads(Path(cand).read_text(encoding="utf-8"))
                break
            except (OSError, ValueError):
                continue
    return {"fps": fps, "frames": t, "cuts": cuts, "narration": [dict(x) for x in narr], "titles": titles,
            "telops": edit.get("telops") or [], "notes": edit.get("notes") or [], "stickers": edit.get("stickers") or [],
            "style": style, "follows": edit.get("follows") or [], "tour": edit.get("tour"), "_edit": True}


def rows(plan: dict) -> list[dict]:
    """読み上げの行ごとに、字・時間（コマ）・本人の声か・その行のカット（時間割の番号）。"""
    total = int(plan.get("frames") or sum(int(c.get("frames") or 0) for c in plan.get("cuts") or []))
    lines = plan.get("narration") or []
    if isinstance(lines, dict):
        lines = lines.get("lines") or []
    starts = [int(ln.get("caption_from", ln.get("at", 0))) for ln in lines]
    out = []
    for i, ln in enumerate(lines):
        a = starts[i]
        b = starts[i + 1] if i + 1 < len(lines) else total
        out.append({"row": i, "text": str(ln.get("text") or ""), "from": a, "to": b,
                    "voice": bool(ln.get("orig_voice") or ln.get("voice_src")), "cuts": []})
    for k, c in enumerate(plan.get("cuts") or []):
        r = c.get("row")
        if r is None:
            mid = int(c.get("at", 0)) + int(c.get("frames", 0)) // 2
            r = next((x["row"] for x in out if x["from"] <= mid < x["to"]), None)
        if r is not None and 0 <= int(r) < len(out):
            out[int(r)]["cuts"].append(k)
    return out


def hook_to(plan: dict) -> int:
    return max([int(t.get("to", 0)) for t in plan.get("titles") or []] + [0])


def src_of(c: dict) -> tuple[str, float, float]:
    """カットの（配信の id, 元の頭の秒, 尻の秒）。時間割（plan.json）では取り込みの台帳から、指示書では組んだ値から。"""
    if "video" in c and "src_from" in c:
        return str(c["video"]), float(c["src_from"]), float(c["src_to"])
    if c.get("footage"):
        fps = 30.0
        return f"footage:{c['footage']}", c["in"] / fps, c["out"] / fps
    if not c.get("path"):
        return "", 0.0, 0.0
    vid, t0 = stream_of(Path(c["path"]))
    fps = 30.0
    return vid, t0 + c["in"] / fps, t0 + c["out"] / fps


def where_cut(plan: dict, k: int) -> str:
    c = plan["cuts"][k]
    fps = float(plan.get("fps") or 30)
    vid, a, _ = src_of(c)
    s = f"{c['at'] / fps:.2f}〜{(c['at'] + c['frames']) / fps:.2f}秒（{c.get('row', '?')}行目・{cut_kind(c)}"
    if cut_kind(c) == "stream" and vid:
        s += f"・配信 {vid} の {hms(a)}"
    elif c.get("footage"):
        s += f"・撮影の素材 {c['footage']}"
    return s + "）"


def _row_text(plan: dict, rs: list[dict], c: dict) -> str:
    r = c.get("row")
    return rs[int(r)]["text"] if r is not None and int(r) < len(rs) else ""


# ---------------------------------------------------------------- 検査（字と時間割だけ）

def _nocuts(cid: str, title: str, plan: dict | None) -> dict | None:
    if not plan or not plan.get("cuts"):
        return result(cid, title, NA, "時間割（cuts）が無い")
    return None


def check_shows_tag(ctx: Ctx) -> dict:
    cid, title = "shows_tag", "カットに写っている物の札（shows）"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    miss = [k for k, c in enumerate(plan["cuts"]) if not str(c.get("shows") or "").strip()]
    n = len(plan["cuts"])
    m = {"cuts": n, "missing": miss, "kinds": {k: sum(cut_kind(c) == k for c in plan["cuts"]) for k in KINDS}}
    probs = [f"{where_cut(plan, k)}: shows が無い → そのカットに写っている物・場所を書く（狙いではなく写っている物）"
             for k in miss[:20]]
    summ = f"shows の無いカット {len(miss)} / {n}"
    return result(cid, title, FAIL if miss else PASS, summ, measured=m, problems=probs)


def check_preface_scene(ctx: Ctx) -> dict:
    cid, title = "preface_scene", "旅の前置きの行の画"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    rs = rows(plan)
    hit, bad = [], []
    for x in rs:
        if not PREFACE.search(x["text"]) or not x["cuts"]:
            continue
        kinds = [cut_kind(plan["cuts"][k]) for k in x["cuts"]]
        hit.append({"row": x["row"], "text": x["text"], "kinds": kinds})
        if not any(k in PRETTY for k in kinds):
            bad.append(x)
    probs = [f"{x['row']}行目「{x['text']}」: 旅の前置きなのに、画が配信の画など（{'・'.join(cut_kind(plan['cuts'][k]) for k in x['cuts'])}）だけ"
             f" → 綺麗な街の画（撮影の動画・あやと島カード・商用可の素材）を当てる（F-104）" for x in bad]
    summ = f"旅の前置きの行 {len(hit)}・綺麗な画の無い行 {len(bad)}"
    return result(cid, title, FAIL if bad else PASS, summ, measured={"rows": hit},
                  thresholds={"preface": PREFACE.pattern, "pretty_kinds": PRETTY}, problems=probs)


def check_island_scene(ctx: Ctx) -> dict:
    cid, title = "island_scene", "あやと島・ガイドと言う行の画"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    hit, bad = [], []
    for x in rows(plan):
        if not ISLAND.search(x["text"]):
            continue
        kinds = [cut_kind(plan["cuts"][k]) for k in x["cuts"]]
        hit.append({"row": x["row"], "text": x["text"], "kinds": kinds})
        if "island" not in kinds:
            bad.append(hit[-1])
    probs = [f"{x['row']}行目「{x['text']}」: あやと島・ガイドと言うのに、あやと島の画面のカットが無い（{'・'.join(x['kinds'])}）"
             f" → 本番の URL からその場所が載っている所を撮って当て、カットに kind: island（F-105）" for x in bad]
    return result(cid, title, FAIL if bad else PASS, f"あやと島・ガイドと言う行 {len(hit)}・島の画面の無い行 {len(bad)}",
                  measured={"rows": hit}, thresholds={"words": ISLAND.pattern}, problems=probs)


def is_selfie(c: dict, verdict: dict | None = None) -> bool:
    return bool(c.get("selfie") or SELFIE.search(str(c.get("shows") or "")) or (verdict or {}).get("selfie"))


def check_selfie_rows(ctx: Ctx) -> dict:
    cid, title = "selfie_rows", "自撮りを当てた行"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    rs = rows(plan)
    fps = float(plan.get("fps") or 30)
    verdicts = cached_verdicts(ctx)
    found, bad = [], []
    for k, c in enumerate(plan["cuts"]):
        if cut_kind(c) != "stream" or not is_selfie(c, verdicts.get(item_key(plan, rs, k))):
            continue
        r = c.get("row")
        row = rs[int(r)] if r is not None and int(r) < len(rs) else None
        ans = verdicts.get(item_key(plan, rs, k)) or {}
        shown = ans.get("face_event") if "face_event" in ans else bool(SELFIE_OK.search(str(c.get("shows") or "")))
        ok = bool(c.get("event")) or bool(row and row["voice"]) or bool(shown)
        found.append({"k": k, "row": r, "sec": round(c["frames"] / fps, 2), "ok": ok, "event": c.get("event")})
        if not ok:
            bad.append(k)
    probs = [f"{where_cut(plan, k)}「{_row_text(plan, rs, plan['cuts'][k])}」: 自撮り（{plan['cuts'][k].get('shows', '')}）を、"
             f"顔が話の中身になる印（event・本人の声）の無い行に当てた → その場でいちばん魅力的な画に替えるか、"
             f"顔が出来事なら event に理由を書く（F-058）" for k in bad]
    summ = f"自撮りのカット {len(found)}（{sum(x['sec'] for x in found):.1f}秒）・印の無い行に当てたもの {len(bad)}"
    return result(cid, title, FAIL if bad else PASS, summ, measured={"selfies": found},
                  thresholds={"selfie_words": SELFIE.pattern}, problems=probs)


def check_badge_text(ctx: Ctx) -> dict:
    cid, title = "badge_text", "ライブの札の字"
    plan = ctx.plan or {}
    style = ctx.style or plan.get("style") or {}
    end = str((style.get("end_note") or {}).get("text") or "※YouTubeで毎日22時から配信")
    probs, seen = [], 0
    if (style.get("live_badge") or {}).get("enabled"):
        probs.append("様式の live_badge.enabled が true → false に戻す（配信の切り抜きと分かる札は入れない。F-064）")
    for key in ("titles", "telops", "notes", "stickers"):
        for o in plan.get(key) or []:
            if not isinstance(o, dict) or o.get("end_note"):
                continue
            txt = " ".join(str(o.get(f) or "") for f in ("text", "label")) + " " + " ".join(map(str, o.get("lines") or []))
            txt = txt.replace(end, "")
            seen += 1
            m = BADGE.search(txt)
            if m:
                probs.append(f"{key} の「{txt.strip()[:40]}」に「{m.group(0)}」→ ライブの札の字を入れない（F-064）")
    return result(cid, title, FAIL if probs else PASS, f"字の札 {seen} 枚・ライブの札の字 {len(probs)}",
                  measured={"texts": seen}, thresholds={"words": BADGE.pattern, "allowed_end_note": end}, problems=probs)


def _still_why(c: dict) -> str | None:
    k = cut_kind(c)
    if k in STILL_KINDS:
        return f"素材が {k}（1枚の絵）"
    if c.get("still") or c.get("image"):
        return "時間割に止め絵の印"
    if c.get("path") and Path(c["path"]).suffix.lower() in IMAGE_EXT:
        return "素材が画像のファイル"
    ent = clip_entry(Path(c["path"])) if c.get("path") else {}
    if ent.get("source_png") or ent.get("source_image") or ent.get("still"):
        return "取り込みの台帳に止め絵の印"
    return None


def sticker_cover(s: dict, plan: dict) -> float:
    """札が画面を覆う割合。書き出しの外接矩形（footprint）があればそれ、指示書の札は中心（x, y）と幅（w）から
    （高さは h、無ければ幅と同じとみなす）、どれも無ければ全面。"""
    W, H = (plan.get("size") or [1080, 1920])[:2]
    if s.get("footprint"):
        x0, y0, x1, y1 = s["footprint"]
    elif s.get("w") and "x" in s and "y" in s:
        w, h = float(s["w"]), float(s.get("h") or s["w"])
        x0, y0, x1, y1 = s["x"] - w / 2, s["y"] - h / 2, s["x"] + w / 2, s["y"] + h / 2
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    return max(0, min(W, x1) - max(0, x0)) * max(0, min(H, y1) - max(0, y0)) / float(W * H)


def check_hook_still(ctx: Ctx) -> dict:
    cid, title = "hook_still", "フックの止め絵"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    fps = float(plan.get("fps") or 30)
    lim = round(HOOK_S * fps)
    cuts = plan["cuts"]
    runs: list[dict] = []
    for c in sorted(range(len(cuts)), key=lambda i: cuts[i]["at"]):
        cc = cuts[c]
        if cc["at"] >= lim:
            break
        why = _still_why(cc)
        if not why:
            continue
        same = runs and runs[-1]["path"] == (cc.get("path") or cc.get("src")) and runs[-1]["end"] == cc["at"]
        a, b = cc["at"], min(cc["at"] + cc["frames"], lim)
        if same:
            runs[-1]["end"] = cc["at"] + cc["frames"]
            runs[-1]["in_hook"] += b - a
        else:
            runs.append({"path": cc.get("path") or cc.get("src"), "from": a, "end": cc["at"] + cc["frames"],
                         "in_hook": b - a, "k": c, "why": why})
    for s in plan.get("stickers") or []:
        cover = sticker_cover(s, plan)
        if cover >= STICKER_STILL and s["from"] < lim:
            runs.append({"path": s.get("image") or s.get("path"), "from": s["from"], "end": s["to"],
                         "in_hook": min(s["to"], lim) - s["from"], "k": None, "why": f"札が画面の {cover:.0%} を覆う"})
    bad = [x for x in runs if x["in_hook"] / fps > HOOK_STILL_S + 1e-6]
    probs = [f"{x['from'] / fps:.2f}秒から {x['in_hook'] / fps:.2f}秒（{x['why']}）: フックの止め絵が1枚で {HOOK_STILL_S}秒を越える"
             f" → 配信の動く画を先に・止め絵は短く切り替える（F-086）" for x in bad]
    m = {"stills": [{**{k: v for k, v in x.items() if k != "path"}, "sec": round(x["in_hook"] / fps, 2)} for x in runs]}
    return result(cid, title, FAIL if bad else PASS,
                  f"0〜{HOOK_S:g}秒の止め絵 {len(runs)}・{HOOK_STILL_S}秒を越えるもの {len(bad)}",
                  measured=m, thresholds={"hook_s": HOOK_S, "max_still_s": HOOK_STILL_S}, problems=probs)


def check_voice_rows(ctx: Ctx) -> dict:
    cid, title = "voice_rows", "本人の声の行の画"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    rs = [x for x in rows(plan) if x["voice"]]
    probs, m = [], []
    for x in rs:
        other = [k for k in x["cuts"] if cut_kind(plan["cuts"][k]) != "stream"]
        st = [s for s in plan.get("stickers") or [] if s["from"] < x["to"] and s["to"] > x["from"]]
        m.append({"row": x["row"], "cuts": len(x["cuts"]), "not_stream": other, "stickers": len(st)})
        for k in other:
            probs.append(f"{where_cut(plan, k)}「{x['text']}」: 本人の声の行の全面が配信の画でない"
                         f"（{cut_kind(plan['cuts'][k])}）→ 声を出している本人の映像にする（F-087）")
        if len(st) > MAX_STICKERS_VOICE:
            probs.append(f"{x['row']}行目「{x['text']}」: 本人の声の行に札が {len(st)} 枚 → 1枚までにする（F-087）")
    return result(cid, title, FAIL if probs else PASS, f"本人の声の行 {len(rs)}・直すところ {len(probs)}",
                  measured={"rows": m}, thresholds={"max_stickers": MAX_STICKERS_VOICE}, problems=probs)


def _uses(plan: dict) -> list[dict]:
    out = []
    for k, c in enumerate(plan.get("cuts") or []):
        vid, a, b = src_of(c)
        ent = clip_entry(Path(c["path"])) if c.get("path") else {}
        art = ent.get("art_sha256") or ent.get("art_image")
        out.append({"k": k, "kind": cut_kind(c), "video": vid, "a": a, "b": b,
                    "file": art or (Path(c["path"]).name if cut_kind(c) in STILL_KINDS + ("island",) and c.get("path") else None)})
    return out


def load_follows(plan: dict, extra: list[str] | None = None) -> list[tuple[str, dict]]:
    out = []
    for p in list(plan.get("follows") or []) + list(extra or []):
        path = Path(p) if Path(p).is_absolute() else (HERE.parents[2] / p)
        try:
            out.append((str(p), plan_from_edit(json.loads(path.read_text(encoding="utf-8")), path)))
        except (OSError, ValueError) as e:
            out.append((str(p), {"_error": str(e)}))
    return out


def check_series_reuse(ctx: Ctx) -> dict:
    cid, title = "series_reuse", "続きものの素材の使い回し"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    prev = load_follows(plan, ctx.memo("scene_follows", lambda: []))
    if not prev:
        return result(cid, title, PASS, "続きものの前の回の印（spec の follows）が無い（続きものでない回）",
                      measured={"follows": []})
    errs = [f"{p}: 読めない（{q['_error']}）" for p, q in prev if "_error" in q]
    if errs:
        return result(cid, title, NA, "前の回の指示書を読めない", problems=errs)
    mine = _uses(plan)
    probs, hits = [], []
    for p, q in prev:
        for u in mine:
            for v in _uses(q):
                same = (u["file"] and u["file"] == v["file"]) or (
                    u["video"] and u["video"] == v["video"] and u["kind"] not in STILL_KINDS
                    and u["a"] < v["b"] + SAME_SEC and v["a"] < u["b"] + SAME_SEC)
                if same:
                    hits.append({"k": u["k"], "prev": p, "prev_k": v["k"]})
                    probs.append(f"{where_cut(plan, u['k'])}: 前の回 {Path(p).parent.name}/{Path(p).name} の"
                                 f" {v['k']}本目のカットと同じ素材 → 前の回と被らない画にする（F-089）")
                    break
    return result(cid, title, FAIL if hits else PASS, f"前の回 {len(prev)} 本と被るカット {len(hits)} / {len(mine)}",
                  measured={"follows": [p for p, _ in prev], "hits": hits}, thresholds={"same_sec": SAME_SEC},
                  problems=probs)


def check_time_order(ctx: Ctx) -> dict:
    cid, title = "time_order", "配信の起きた順"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    rs = rows(plan)
    h = hook_to(plan)
    prev: dict[str, tuple[float, int]] = {}   # 1つ前の行（フックの後ろ）で使った、配信ごとのいちばん後ろの秒
    bad, seen = [], 0
    for x in rs:
        if x["from"] < h or x["row"] == len(rs) - 1:
            continue   # フック（題の札の間）は答えを先に見せる所（F-020）、最後の行は問い・0秒目へ戻す輪（F-091）
        mine: dict[str, tuple[float, int]] = {}
        for k in x["cuts"]:
            c = plan["cuts"][k]
            if cut_kind(c) != "stream":
                continue
            vid, a, b = src_of(c)
            seen += 1
            shows = str(c.get("shows") or "")
            person = bool(PERSON.search(shows)) and "「" not in shows   # 「」は、その言葉を言っている瞬間の画
            back = prev[vid][0] - a if vid in prev else 0.0
            if (person and ORDER_TOL_S < back <= SCENE_S and not x["voice"]
                    and not (c.get("order_ok") or c.get("same_as_prev"))):
                bad.append({"k": k, "row": x["row"], "src": hms(a), "after": hms(prev[vid][0]), "after_row": prev[vid][1],
                            "back_s": round(back, 1)})
            if vid not in mine or b > mine[vid][0]:
                mine[vid] = (b, x["row"])
        if mine:
            prev = mine   # 比べるのは隣の行どうし（1行の中の並びは見ない）
    probs = [f"{where_cut(plan, z['k'])}「{rs[z['row']]['text']}」: 人の様子の画（配信の {z['src']}）が、{z['after_row']}行目で使った"
             f" {z['after']} より {z['back_s']:.0f}秒前に戻る → 行が言っている時点の画にするか、理由を order_ok に書く（F-096）"
             for z in bad]
    return result(cid, title, FAIL if bad else PASS, f"フックの後ろの配信の画 {seen}・人の様子が起きた順と逆 {len(bad)}",
                  measured={"back": bad}, thresholds={"tolerance_s": ORDER_TOL_S, "same_scene_s": SCENE_S,
                                                       "person_words": PERSON.pattern}, problems=probs)


def heading_key(text: str) -> str:
    s = HEADING.sub("", str(text)).strip()
    if "は" in s:
        s = s.rsplit("は", 1)[1]
    return _DROP.sub("", s)


def _contains(key: str, shows: str) -> bool:
    shows = _DROP.sub("", shows)
    if not key:
        return True
    if key in shows:
        return True
    grams = {key[i:i + 2] for i in range(len(key) - 1)}
    return bool(grams) and sum(g in shows for g in grams) / len(grams) >= 0.6


def headings(plan: dict) -> list[dict]:
    out = []
    for key in ("telops", "notes"):
        for o in plan.get(key) or []:
            if not isinstance(o, dict) or o.get("end_note") or not HEADING.match(str(o.get("text") or "")):
                continue
            out.append({"kind": key, "text": str(o["text"]), "from": int(o["from"]), "to": int(o["to"]),
                        "key": heading_key(o["text"])})
    return out


def check_note_words(ctx: Ctx) -> dict:
    cid, title = "note_words", "見出しの札の言葉"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    hs = headings(plan)
    run_judge(ctx)   # 1回に1度だけ起こす（scene_match と同じ呼び。控えに答えがあれば起こさない）
    verdicts = cached_verdicts(ctx)
    rows_m, probs, human = [], [], []
    for n, hd in enumerate(hs):
        span = max(1, hd["to"] - hd["from"])
        hitf = 0
        shows = []
        for c in plan["cuts"]:
            a, b = max(c["at"], hd["from"]), min(c["at"] + c["frames"], hd["to"])
            if b <= a:
                continue
            shows.append(str(c.get("shows") or ""))
            if _contains(hd["key"], str(c.get("shows") or "")):
                hitf += b - a
        share = hitf / span
        row = {"text": hd["text"], "key": hd["key"], "share": round(share, 2), "shows": shows}
        if share < NOTE_SHARE:
            v = verdicts.get(heading_item_key(hd, shows))
            row["judge"] = v
            if v is None:
                human.append(row)
                probs.append(f"見出し「{hd['text']}」: 言葉「{hd['key']}」が写るのは出ている間の {share:.0%}（線 {NOTE_SHARE:.0%}）。"
                             f"検査役の答えが無い → 写っている中身の名前かを人が見る（F-106）")
            elif not v.get("names_content"):
                probs.append(f"見出し「{hd['text']}」: 写っている中身の名前でない（検査役: {v.get('why', '')}）"
                             f" → 写る物・場所の名前で言う（F-106）")
                row["fail"] = True
        rows_m.append(row)
    fails = [x for x in rows_m if x.get("fail")]
    status = FAIL if fails else HUMAN if human else PASS
    return result(cid, title, status, f"見出しの札 {len(hs)}・中身の名前でないもの {len(fails)}・人が見るもの {len(human)}",
                  measured={"headings": rows_m}, thresholds={"share": NOTE_SHARE}, problems=probs)


def is_tour(plan: dict) -> bool:
    if plan.get("tour") is not None:
        return bool(plan["tour"])
    return any(TOUR.search(str(t.get("text") or "")) for t in plan.get("titles") or [])


def check_hook_map(ctx: Ctx) -> dict:
    cid, title = "hook_map", "街を回る回のフックの地図"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    if not is_tour(plan):
        return result(cid, title, PASS, "街を回る回ではない（spec の tour・題の言葉）", measured={"tour": False},
                      thresholds={"tour_words": TOUR.pattern})
    h = hook_to(plan) or round(HOOK_S * float(plan.get("fps") or 30))
    maps = [k for k, c in enumerate(plan["cuts"]) if c["at"] < h and cut_kind(c) == "map"]
    probs = [] if maps else ["街を回る回なのに、フック（題の札の間）に地図のカット（kind: map・hookmap.py）が無い"
                             " → その街が国のどこにあるかと、その日の道のりを地図で動かす（F-060）"]
    return result(cid, title, PASS if maps else FAIL, f"街を回る回・フックの地図のカット {len(maps)}",
                  measured={"tour": True, "map_cuts": maps}, thresholds={"tour_words": TOUR.pattern}, problems=probs)


# ---------------------------------------------------------------- 検査役（claude -p）

_FRAMES: dict = {}


def _frame_bytes(path: Path, t: float) -> bytes | None:
    """素材か動画の t 秒のコマを、検査役に渡す大きさの JPEG にする（画像のファイルは頭のコマ）。同じファイル
    （大きさと更新の時刻で見る）の同じ秒は2度読まない。"""
    if Path(path).suffix.lower() in IMAGE_EXT:
        t = 0.0
    st = Path(path).stat()
    key = (str(path), st.st_size, st.st_mtime_ns, round(t, 3))
    if key not in _FRAMES:
        _FRAMES[key] = _read_frame(Path(path), t)
    return _FRAMES[key]


def _read_frame(path: Path, t: float) -> bytes | None:
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(path),
                            "-frames:v", "1", "-vf", f"scale={THUMB[0]}:{THUMB[1]}:force_original_aspect_ratio=increase,"
                            f"crop={THUMB[0]}:{THUMB[1]}", "-f", "image2", "-c:v", "mjpeg", "-q:v", "5", "-"],
                           capture_output=True, timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 and r.stdout else None


def footage_file(fid: str) -> Path:
    """撮影の素材の作業用（手元の私有の置き場。`render.py` の source_path と同じ道）。"""
    return Path(os.environ.get("SHORTS_FOOTAGE_DIR") or "~/.cache/shorts/footage").expanduser() / f"{fid}.mp4"


def with_frames(key: str, ans) -> bool:
    """控え・指示書から読んでよい答えか（カットの答えは、コマを渡して得たものだけ）。"""
    return isinstance(ans, dict) and (not str(key).startswith("c:") or bool(ans.get("frames")))


def cut_frames(ctx: Ctx, k: int) -> list[bytes]:
    """カットのコマ（1秒以上なら2枚、短ければ1枚）。字なしの版 → 仕上がり → 元の素材 → 撮影の素材の作業用の順に探す。"""
    def load():
        plan = ctx.plan
        c = plan["cuts"][k]
        fps = float(plan.get("fps") or 30)
        fr = [0.5] if c["frames"] < fps else [1 / 3, 2 / 3]
        for src, base, step in ((ctx.plate, c["at"], 1), (ctx.mp4 if ctx.mp4 and ctx.mp4.suffix == ".mp4" else None, c["at"], 1),
                                (Path(c["path"]) if c.get("path") else None, c["in"], 1),
                                (footage_file(c["footage"]) if c.get("footage") else None, c["in"], 1)):
            if src is None or not Path(src).exists():
                continue
            got = [_frame_bytes(Path(src), (base + f * c["frames"]) / fps) for f in fr]
            got = [g for g in got if g]
            if got:
                return got
        return []
    return ctx.memo(f"scene_frames_{k}", load)


def item_key(plan: dict, rs: list[dict], k: int) -> str:
    """検査役の答えの指紋: 行の番号と字・カットの入りと尻のコマ・shows・種類。コマの画素は入れない（書き出しの前に
    元の素材のコマで聞いた答えを、Actions の書き出しのあと字なしの版で回す check.py でも引けるように）。"""
    c = plan["cuts"][k]
    base = [c.get("row"), _row_text(plan, rs, c), int(c.get("in", 0)), int(c.get("out", 0)),
            str(c.get("shows") or ""), cut_kind(c)]
    return "c:" + hashlib.sha1(json.dumps(base, ensure_ascii=False).encode()).hexdigest()[:16]


def heading_item_key(hd: dict, shows: list[str]) -> str:
    return "h:" + hashlib.sha1(json.dumps([hd["text"], shows], ensure_ascii=False).encode()).hexdigest()[:16]


def verdict_path(ctx: Ctx) -> Path:
    env = os.environ.get("SHORTS_SCENE_VERDICTS")
    if env:
        return Path(env)
    if ctx.work:
        return Path(ctx.work) / "scene_verdicts.json"
    return Path(ctx.out_dir) / "scene_verdicts.json"


def cached_verdicts(ctx: Ctx) -> dict:
    """控え（verdict_path）の答えに、カットに押した答え（`scene`。`scene.py --stamp` が指示書に書き、書き出しが時間割へ運ぶ）を
    足したもの。カットの答えは指紋（`key`）が今のカットと合うときだけ使う（shows や行の字を直したら、聞き直す）。"""
    def load():
        try:
            v = json.loads(verdict_path(ctx).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            v = {}
        v = {k: a for k, a in (v.items() if isinstance(v, dict) else []) if with_frames(k, a)}
        plan = ctx.plan or {}
        rs = rows(plan) if plan.get("cuts") else []
        for k, c in enumerate(plan.get("cuts") or []):
            st = c.get("scene")
            if isinstance(st, dict) and st.get("key") == item_key(plan, rs, k) and with_frames(st["key"], st):
                v.setdefault(st["key"], {x: y for x, y in st.items() if x != "key"})
            for hd in c.get("scene_headings") or []:   # 見出しの答えは、見出しの出はじめに掛かるカットに押す
                if isinstance(hd, dict) and hd.get("key"):
                    v.setdefault(hd["key"], {x: y for x, y in hd.items() if x != "key"})
        return v
    return ctx.memo("scene_verdicts", load)


def save_verdicts(ctx: Ctx, v: dict) -> None:
    p = verdict_path(ctx)
    v = {k: a for k, a in v.items() if with_frames(k, a)}   # コマの無い答えは控えに残さない
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(v, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        pass


def judge_enabled() -> bool:
    return os.environ.get("SHORTS_SCENE_JUDGE", "1") != "0" and shutil.which("claude") is not None


# selftest が差し替える（偽の検査役）。items → {id: 答え}
JUDGE = None


def claude_judge(items: list[dict], heads: list[dict]) -> tuple[dict, dict]:
    """検査役を1回起こす。items は {id, text, shows, kind, frames}、heads は {id, text, shows}。"""
    schema = (HERE / "scene_schema.json").read_text(encoding="utf-8")
    content = [{"type": "text", "text": (
        "縦型ショートのカットごとに、その行の読み上げの字（行の言葉）と、担当が書いた「写っている物」（shows）と、"
        "カットのコマ（1〜2枚）を渡す。カットごとに次を答える。\n"
        "- related: このコマが、行の言葉が言っている物・場所・出来事を見せているか。行が言う場所や出来事の、その場の画"
        "（着いた街の街並み・入った店の中）なら true。言葉と関係の無い画（歩く足元・ただの道中・言葉の物が無い自撮り・"
        "別の場所）なら false。尺の穴埋めに見える画は false\n"
        "- shows_true: shows の言葉が、コマに写っている物と合っているか\n"
        "- selfie: 本人（カメラを持つ人）の顔が画面の大きな部分を占める自撮りか\n"
        "- face_event: 自撮りなら、顔のほかに物が写っていて、それが行の出来事（食べている・物を見せている）になっているか。"
        "話しているだけ・笑っているだけの顔は false。自撮りでなければ false\n"
        "- painted: 写真ではなく、水彩画・イラスト・描いた絵の見た目か（写真の見た目に描いた絵は false）\n"
        "- why: 30字以内の理由\n"
        "見出し（headings）は、見出しの札の言葉が、その間に写る物・場所の名前（中身の名前）になっているかを names_content で答える"
        "（季節や飾りの言葉・気持ちの言葉なら false）。")}]
    for it in items:
        content.append({"type": "text", "text": f"[{it['id']}] 行の言葉: {it['text']}\n写っている物（shows）: {it['shows']}\n"
                                                f"素材の種類: {it['kind']}\nコマ {len(it['frames'])} 枚:"})
        for b in it["frames"]:
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                        "data": base64.b64encode(b).decode()}})
    if heads:
        content.append({"type": "text", "text": "見出し:\n" + "\n".join(
            f"[{h['id']}] 見出しの札: {h['text']} ／ その間のカットの shows: {' ・ '.join(h['shows'])}" for h in heads)})
    msg = {"type": "user", "message": {"role": "user", "content": content}}
    cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
           "--system-prompt", SYSTEM, "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
           "--no-session-persistence", "--json-schema", schema, "--model", MODEL]
    if EFFORT:
        cmd += ["--effort", EFFORT]
    with tempfile.TemporaryDirectory(prefix="scene-") as empty:
        r = subprocess.run(cmd, input=json.dumps(msg, ensure_ascii=False) + "\n", capture_output=True, text=True,
                           timeout=900, cwd=empty, check=False)
    data = None
    for line in r.stdout.splitlines():
        try:
            j = json.loads(line)
        except ValueError:
            continue
        if j.get("type") == "result":
            data = j.get("structured_output")
            if data is None:
                try:
                    data = json.loads(j.get("result") or "")
                except ValueError:
                    data = None
    if not isinstance(data, dict):
        raise RuntimeError(f"検査役の返事が JSON でない: {(r.stdout + r.stderr)[-300:]}")
    cuts = {str(x.get("id")): x for x in data.get("cuts") or []}
    hds = {str(x.get("id")): x for x in data.get("headings") or []}
    return cuts, hds


def run_judge(ctx: Ctx) -> dict:
    """控えに答えの無いカットと見出しだけを検査役に聞き、控えに足す。返すのは {呼んだ回数, 聞いた数, 誤り}。"""
    def go():
        plan = ctx.plan
        rs = rows(plan)
        v = dict(cached_verdicts(ctx))
        need, keys, noframe = [], {}, []
        for k, c in enumerate(plan["cuts"]):
            if not str(c.get("shows") or "").strip():
                continue
            key = item_key(plan, rs, k)
            if key in v:
                continue
            fr = cut_frames(ctx, k)
            if not fr:
                noframe.append(k)   # コマの無いカットは字だけで聞かない（検査役は確かめられず「関係無い」と言う）
                continue
            keys[f"c{k:02d}"] = key
            need.append({"id": f"c{k:02d}", "text": _row_text(plan, rs, c), "shows": c["shows"], "kind": cut_kind(c),
                         "frames": fr})
        heads = []
        for n, hd in enumerate(headings(plan)):
            shows = [str(c.get("shows") or "") for c in plan["cuts"]
                     if min(c["at"] + c["frames"], hd["to"]) > max(c["at"], hd["from"])]
            hk = heading_item_key(hd, shows)
            if hk not in v:
                heads.append({"id": f"h{n:02d}", "text": hd["text"], "shows": shows, "_key": hk})
        if not need and not heads:
            return {"calls": 0, "asked": 0, "noframe": noframe}
        fn = JUDGE or (claude_judge if judge_enabled() else None)
        if fn is None:
            return {"calls": 0, "asked": 0, "error": "検査役を起こせない（claude が無い・SHORTS_SCENE_JUDGE=0）"}
        calls, err = 0, None
        batches, cur, n_img = [], [], 0
        for it in need:
            if cur and n_img + len(it["frames"]) > MAX_IMAGES:
                batches.append(cur)
                cur, n_img = [], 0
            cur.append(it)
            n_img += len(it["frames"])
        batches.append(cur)
        for bi, b in enumerate(batches):
            try:
                cuts, hds = fn(b, heads if bi == 0 else [])
            except (RuntimeError, OSError, subprocess.TimeoutExpired) as e:
                err = str(e)
                break
            calls += 1
            for it in b:
                ans = cuts.get(it["id"])
                if ans is None:
                    continue
                rec = {"related": bool(ans.get("related")), "shows_true": bool(ans.get("shows_true", True)),
                       "selfie": bool(ans.get("selfie")), "face_event": bool(ans.get("face_event")),
                       "painted": bool(ans.get("painted")),
                       "why": str(ans.get("why") or ""), "frames": len(it["frames"]),
                       "judge": "claude" if fn is claude_judge else "fake", "at": time.strftime("%Y-%m-%d")}
                v[keys[it["id"]]] = rec
            if bi == 0:
                for h in heads:
                    ans = hds.get(h["id"])
                    if ans is not None:
                        v[h["_key"]] = {"names_content": bool(ans.get("names_content")), "why": str(ans.get("why") or "")}
        ctx._cache["scene_verdicts"] = v
        save_verdicts(ctx, v)
        out = {"calls": calls, "asked": len(need) + len(heads), "noframe": noframe}
        if err:
            out["error"] = err
        return out
    return ctx.memo("scene_judge_run", go)


def check_scene_match(ctx: Ctx) -> dict:
    cid, title = "scene_match", "行の言葉と画（検査役）"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    run = run_judge(ctx)
    v = cached_verdicts(ctx)
    rs = rows(plan)
    fails, humans, missing, rows_m = [], [], [], []
    for k, c in enumerate(plan["cuts"]):
        if not str(c.get("shows") or "").strip():
            continue   # shows_tag が落とす
        ans = v.get(item_key(plan, rs, k))
        kind = cut_kind(c)
        rows_m.append({"k": k, "row": c.get("row"), "kind": kind, "shows": c.get("shows"), "verdict": ans})
        if ans is None:
            missing.append(k)
        elif not ans["related"] and kind == "stream" and not c.get("event"):
            fails.append((k, ans))
        elif not ans["related"] or not ans.get("shows_true", True) or not ans.get("frames"):
            humans.append((k, ans))
    probs = [f"{where_cut(plan, k)}「{_row_text(plan, rs, plan['cuts'][k])}」: 配信の画（{plan['cuts'][k]['shows']}）が"
             f"行の言葉と関係無い（検査役: {a['why']}）→ 言葉の物が写る画か、配信の外の素材に替える（F-104）" for k, a in fails]
    for k, a in humans:
        what = ("shows がコマと合わない" if not a.get("shows_true", True) else
                "コマが無く字だけで当てた" if not a.get("frames") else "関係無いと言われた（配信の外の素材）")
        probs.append(f"{where_cut(plan, k)}「{_row_text(plan, rs, plan['cuts'][k])}」: {what}（{a['why']}）→ 人が見る")
    if missing:
        nf = len([k for k in missing if k in set(run.get("noframe") or [])])
        why = run.get("error") or ("コマが読めない（素材も字なしの版も無い）" if nf == len(missing) else "控えに無い")
        probs.append(f"検査役の答えが無いカット {len(missing)} 本（{why}）"
                     f" → 素材のある作業箱で scene.py --stamp を回す")
    status = FAIL if fails else NA if missing else HUMAN if humans else PASS
    summ = (f"配信の画で関係無い {len(fails)}・人が見る {len(humans)}・答えの無い {len(missing)} / {len(rows_m)} カット"
            f"（検査役 {run.get('calls', 0)} 回）")
    return result(cid, title, status, summ, measured={"cuts": rows_m, "judge_calls": run.get("calls", 0),
                                                     "judge_asked": run.get("asked", 0)},
                  thresholds={"fail_if": "配信の画で related が false（event の無いカット）"}, problems=probs)


def check_photo_look(ctx: Ctx) -> dict:
    cid, title = "photo_look", "差し込む画の見た目（写真か）"
    plan = ctx.plan
    if (r := _nocuts(cid, title, plan)) is not None:
        return r
    run_judge(ctx)
    v = cached_verdicts(ctx)
    rs = rows(plan)
    art = [k for k, c in enumerate(plan["cuts"]) if cut_kind(c) in ("card", "art", "stock")]
    painted, missing = [], []
    for k in art:
        ans = v.get(item_key(plan, rs, k))
        if ans is None or "painted" not in ans:
            missing.append(k)
        elif ans["painted"]:
            painted.append(k)
    probs = [f"{where_cut(plan, k)}: 全面の画が水彩画・絵の見た目（検査役: {v[item_key(plan, rs, k)].get('why', '')}）"
             f" → 配信の綺麗な画か、写真（カード・フリーの写真・写真の見た目で描いた絵）にする（F-082）" for k in painted]
    if missing:
        probs.append(f"検査役の答えの無い差し込みの画 {len(missing)} 本 → 作業箱で scene.py を回す")
    status = FAIL if painted else NA if missing else PASS
    return result(cid, title, status, f"全面の差し込みの画 {len(art)}・絵の見た目 {len(painted)}・答えの無い {len(missing)}",
                  measured={"art_cuts": art, "painted": painted}, problems=probs)


# ---------------------------------------------------------------- 人の目の表（機械にできない項目）

HUMAN_ONLY = ("F-020", "F-082")   # 機械にできない理由は帳面の各項目


def check_human_table(ctx: Ctx, md: Path | None) -> dict:
    cid, title = "human_table", "人の目の表の埋まり具合"
    if md is None:
        return result(cid, title, NA, "人の目の表（qa_X.md）を渡していない")
    try:
        txt = Path(md).read_text(encoding="utf-8")
    except OSError as e:
        return result(cid, title, NA, f"人の目の表を読めない: {e}")
    got, probs = {}, []
    for fid in HUMAN_ONLY:
        line = next((ln for ln in txt.splitlines() if ln.startswith("|") and fid in ln), None)
        cells = [x.strip() for x in line.strip("|").split("|")] if line else []
        mark = next((x for x in cells[1:] if x[:1] in ("○", "✕", "－", "-")), None) if cells else None
        got[fid] = mark
        if line is None:
            probs.append(f"{fid}: 人の目の表に行が無い → production.md 3 の行を写して ○・✕・－ と理由を書く")
        elif mark is None:
            probs.append(f"{fid}: 行はあるが印（○・✕・－）が無い")
    return result(cid, title, FAIL if probs else PASS, f"機械にできない項目 {len(HUMAN_ONLY)}・埋まった行 "
                  f"{sum(1 for v in got.values() if v)}", measured={"marks": got}, problems=probs)


# ---------------------------------------------------------------- まとめ

CHECKS = {
    "shows_tag": check_shows_tag,
    "scene_match": check_scene_match,
    "preface_scene": check_preface_scene,
    "island_scene": check_island_scene,
    "selfie_rows": check_selfie_rows,
    "badge_text": check_badge_text,
    "hook_still": check_hook_still,
    "voice_rows": check_voice_rows,
    "series_reuse": check_series_reuse,
    "time_order": check_time_order,
    "note_words": check_note_words,
    "hook_map": check_hook_map,
    "photo_look": check_photo_look,
}
# 検査役を起こさず、時間割の字だけで決まるもの（下書きの段でも回す）
PLAN_ONLY = tuple(k for k in CHECKS if k not in ("scene_match", "photo_look", "note_words"))


def edit_ctx(edit_path: Path, out_dir: Path | None = None, follows: list[str] | None = None,
             plate: Path | None = None) -> Ctx:
    edit = json.loads(Path(edit_path).read_text(encoding="utf-8"))
    plan = plan_from_edit(edit, Path(edit_path))
    ctx = Ctx(mp4=Path(edit_path), work=None, style=plan.get("style") or {},
              out_dir=out_dir or Path(edit_path).with_suffix(".scene"), plate=plate, plan=plan,
              fps=plan["fps"], nframes=plan["frames"], W=1080, H=1920)
    ctx._cache["scene_follows"] = list(follows or [])
    return ctx


def stamp(edit_path: Path, ctx: Ctx) -> int:
    """検査役の答えを、指示書のカットに押す（`scene`・見出しは出はじめのカットの `scene_headings`）。書き出しが時間割へ運ぶので、
    検査役を起こせない Actions の check.py でも同じ答えで判定できる。押した数を返す。"""
    edit = json.loads(Path(edit_path).read_text(encoding="utf-8"))
    plan = ctx.plan
    rs = rows(plan)
    v = cached_verdicts(ctx)
    n = 0
    for k, c in enumerate(edit.get("cuts") or []):
        key = item_key(plan, rs, k)
        c.pop("scene", None)
        c.pop("scene_headings", None)
        if key in v and with_frames(key, v[key]):   # コマの無い答えは指示書に押さない
            c["scene"] = {"key": key, **v[key]}
            n += 1
    for hd in headings(plan):
        shows = [str(c.get("shows") or "") for c in plan["cuts"]
                 if min(c["at"] + c["frames"], hd["to"]) > max(c["at"], hd["from"])]
        hk = heading_item_key(hd, shows)
        first = next((k for k, c in enumerate(plan["cuts"]) if c["at"] <= hd["from"] < c["at"] + c["frames"]), None)
        if hk in v and first is not None:
            edit["cuts"][first].setdefault("scene_headings", []).append({"key": hk, **v[hk]})
            n += 1
    Path(edit_path).write_text(json.dumps(edit, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("edit", type=Path)
    ap.add_argument("--only")
    ap.add_argument("--skip")
    ap.add_argument("--verdicts", type=Path, help="検査役の答えの控え（既定: <edit>.scene/scene_verdicts.json）")
    ap.add_argument("--no-judge", action="store_true", help="検査役を起こさない（答えの無いカットは not-checkable）")
    ap.add_argument("--follows", action="append", default=[], help="続きものの前の回の指示書（spec の follows に足す）")
    ap.add_argument("--plate", type=Path, help="字なしの書き出し（あれば検査役にそのコマを渡す）")
    ap.add_argument("--human", type=Path, help="人の目の表（qa_X.md）。機械にできない項目の行が埋まっているかを数える")
    ap.add_argument("--stamp", action="store_true",
                    help="検査役の答えを指示書のカットに押す（書き出しのあとの check.py が同じ答えで判定する）")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--md", type=Path)
    a = ap.parse_args()
    if a.verdicts:
        os.environ["SHORTS_SCENE_VERDICTS"] = str(a.verdicts)
    if a.no_judge:
        os.environ["SHORTS_SCENE_JUDGE"] = "0"
    ctx = edit_ctx(a.edit, follows=a.follows, plate=a.plate)
    only = [s for s in (a.only or "").split(",") if s]
    skip = [s for s in (a.skip or "").split(",") if s]
    res = []
    for cid, fn in CHECKS.items():
        if (only and cid not in only) or cid in skip:
            continue
        res.append(fn(ctx))
    if a.human or "human_table" in only:
        res.append(check_human_table(ctx, a.human))
    worst = max((r["status"] for r in res), key=lambda s: SEVERITY[s], default=NA)
    rep = {"file": str(a.edit), "overall": worst, "checks": res}
    if a.stamp:
        print(f"検査役の答えを指示書に押した: {stamp(a.edit, ctx)} 件（{a.edit}）", file=sys.stderr)
    if a.json:
        a.json.write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    lines = [f"## 画と言葉の検査: `{a.edit.name}`", "", "| 検査 | 判定 | 測った値 |", "| --- | --- | --- |"]
    lines += [f"| {r['id']} | {r['status']} | {str(r['summary']).replace('|', '／')} |" for r in res]
    for r in res:
        if r["problems"]:
            lines += ["", f"- **{r['id']}**"] + [f"  - {p}" for p in r["problems"][:12]]
    md = "\n".join(lines) + "\n"
    if a.md:
        a.md.write_text(md, encoding="utf-8")
    print(md)
    return {PASS: 0, FAIL: 1, HUMAN: 3, NA: 3}[worst]


if __name__ == "__main__":
    sys.exit(main())
