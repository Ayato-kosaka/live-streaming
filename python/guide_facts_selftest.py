"""**「実際に行った」の道具（`python/guide_facts.py`）が、守りを1つ外したファイルを、その札だけで落とすか。**

    python3 python/guide_facts_selftest.py

ネットワークも鍵も要らない。一時ディレクトリに小さな `streams/`（字幕・チャット・議事録）と
寄せる表をこしらえて、`--root` `--table` で差し替えて当てる。本物の `streams/` には触らない。
名前は全部こしらえたもの（視聴者さんの名前を見張りに書かない）。

## なぜ要るか

`check` が緑を返すと、束ねる側（`city`）と面を作る担当は、その額と一言を「配信で本人が言ったもの」
として使う。**`check` が何も見ていなくても、緑は同じ緑に見える。** だから札を1つずつ、
「その1点だけ崩したファイル」を作って、**その札だけが**出ることを確かめる
（ほかの札まで一緒に出るなら、何が効いて落ちたのか分からない）。

通るはずのもの——読み上げではない本人の一言・ほかの項目が名乗っている額・補い `[ ]` と中略 `…` の
入った言い回し——が落ちないことも見る。落ちすぎる道具は、印（verify）を付けて黙らせる癖を生む。

## 対照

`guide_facts.py` の比較を1つ壊して（例: `±90秒` の幅を広げる・読み上げの `>=` を `>` に）、
ここが赤くなることを確かめてある。`python3 python/mutation_drill.py python/guide_facts_selftest.py`
でも当てられる。

## 抜く道具（`python/guide_extract.py`）も、ここで見る

`claude -p` を呼ぶ所（`call_model`）は**偽物に差し替える**（本物は呼ばない。鍵もネットワークも要らない）。
見るのは5つ——1枚に視聴者さんの素性が無い（チャットは本文だけ・呼びかけと @名前 と投げ銭の額は `〇〇`）／
伏せ残しの見張りが、残った名前を見つける／NG の行を添えて直させると2回目で直る／直させるのは1回まで／
2回目も落ちた項目だけを落として残りを置く／項目が0件になった回は置かない。

**守りを1つずつ外して、その守りの対照だけが落ちることも、ここで当てる**（`DRILL`）。
`mutation_drill.py` は `guide_extract.py` を当て先にしない（隣の selftest の名前で選ぶので）。だから外しかたを
ここに1件ずつ書いた。チャットの投稿者名を出したときだけは、伏せ残しの見張りが呼び出しそのものを止めるので、
抜く側の対照もいっしょに落ちる（守りが2枚あることの表れ。期待する集まりにそう書いてある）。
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_extract as ge  # noqa: E402
import guide_facts as gf  # noqa: E402

ok: list[str] = []
ng: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        ok.append(name)
        print(f"  ok  {name}")
    else:
        ng.append(f"{name}: 欲しい {want!r} / 出た {got!r}")
        print(f"  NG  {name}\n       欲しい {want!r}\n       出た   {got!r}")


STEM = "2026-10-18_2202_AAA"

TRANSCRIPT = """# 見本の配信で旧市街へ
# https://www.youtube.com/watch?v=AAA
# 開始: 2026-10-18 22:02 JST
# 字幕: 自動
# 行数: 10（30秒ごと）

[0:00:00] こんばんは。今日は旧止街を歩きます。
[0:00:30] バスは60番です。片道50デナールやった。
[0:01:00] めっちゃ綺麗やんか。[笑い]いや、ほんまに来てよかったわ。バスは60番やったな。
[0:01:30] パスタが75円。コーラは100円やな。
[0:02:00] スーパーで紫のラベルの梨ジュース飲んで欲しい。うまいらしい。梨ジュースは90円。
[0:02:30] クッキーは180円ぐらい。60デナールで108円。
[0:03:00] [音楽]
[0:03:30] ボートは600やって。320円のお菓子も買った。
[0:04:00] たろうさん、こんばんは。はなちゃん、こんばんは。今日も来てくれてありがとう。ランチにします。
[0:04:30] ほなまた明日。こっちの道はめっちゃキレイに見えるんちゃうか。帰りも歩いて帰ろうかなと思ってます。
"""

CHAT = """# 見本の配信で旧市街へ
# https://www.youtube.com/watch?v=AAA
# 開始: 2026-10-18 22:02 JST

[0:00:10] @たろう-x1y: こんばんは
[0:00:12] ラン: やっほー
[0:00:15] @あやとグルメアプリ: 【:hammer_and_wrench:定期】アプリは月50デナールから
[0:01:50] Hanako_はなこ: スーパーで紫のラベルの梨ジュース飲んでほしい！うまいらしいぞ！
[0:03:20] ¥320 @jiro1685: おやつ代
[0:04:05] @はなこ: こっちの道めっちゃきれいに見えるんじゃない？
[0:04:10] @たろう-x1y: 帰りは歩いて、ゆっくり帰ろうかな
"""

NOTES = """# 2026-10-18 22:02 見本の配信で旧市街へ
- URL: https://www.youtube.com/watch?v=AAA / 長さ 0:04:30
- 場所: テスト国・タウン（旧市街→スーパー→ボート乗り場）
- チャット 7件
- 投げ銭 1件（¥320）: jiro1685 ¥320

## ひとことで
旧市街を歩いた回。

## 流れ
### [0:00:00] 旧市街へ
60番のバス。@さぶろう「いってらっしゃい」。
### [0:01:30] スーパー
パスタとコーラの値段。
### [0:03:00] ボート
乗り場まで。

## 視聴者さん
- @たろう-x1y

## 持ち越し・決まったこと
なし
"""

TABLE = {
    "money": {"円": []},
    "countries": {
        "testland": {
            "name": "テスト国", "tz": "Europe/Skopje", "heads": ["テスト国"],
            "money": {"デナール": ["デナル"]}, "base": "town", "no_city": ["滞在中の宿"],
            "cities": {"town": {"name": "タウン", "heads": ["タウン"], "places": {"旧市街": ["バザール"]},
                                "trips": {"lake": {"name": "みずうみ"}}}},
        }
    },
}

HEAD = {"schema": 1, "video_id": "AAA", "start_jst": "2026-10-18 22:02", "date_local": "2026-10-18",
        "country": "testland", "city": "town", "place_line": "テスト国・タウン"}
OLD = {"name": "旧市街", "heard": ["旧止街"]}

GOOD = [
    {"kind": "move", "text": "バスは60番。片道50デナール。", "t": 30,
     "src": {"lines": ["0:00:30"], "notes": "[0:00:00] 旧市街へ"}, "what": "バス（片道）",
     "measured": {"what": "バスに乗ってから降りるまで", "from": "0:00:30", "to": "0:03:30"},
     "amounts": [{"value": 50, "unit": "デナール", "as": "said"},
                 {"value": 150, "unit": "円", "as": "converted", "from": {"value": 50, "unit": "デナール"}, "rate": 3}]},
    {"kind": "place", "text": "旧市街を歩いた。", "t": 60,
     "src": {"lines": ["0:00:00", "0:01:00"], "notes": "[0:00:00] 旧市街へ"}, "place": OLD,
     # 空白・句読点の差、補い [ ]、中略 … は許す
     "quote": "めっちゃ 綺麗やんか…来てよかった[です]わ"},
    {"kind": "price", "text": "パスタは75円。", "t": 90,
     "src": {"lines": ["0:01:30"], "notes": "[0:01:30] スーパー"}, "what": "パスタ",
     "amounts": [{"value": 75, "unit": "円", "as": "said"}],
     "other_amounts": [{"value": 100, "unit": "円", "what": "コーラ"}]},
    {"kind": "food", "text": "クッキーは60デナール。円では180円とも108円とも言っている。", "t": 150,
     "src": {"lines": ["0:02:30"], "notes": "[0:01:30] スーパー"}, "what": "クッキー",
     "amounts": [{"value": 60, "unit": "デナール", "as": "said"}, {"value": 180, "unit": "円", "as": "said"},
                 {"value": 108, "unit": "円", "as": "said"}],
     "verify": "円の額が割れている"},
    {"kind": "quote", "about": "place", "text": "旧市街に着いたときの一言。", "t": 60,
     "src": {"lines": ["0:01:00"], "notes": "[0:00:00] 旧市街へ"}, "place": OLD, "quote": "ほんまに来てよかったわ"},
    {"kind": "price", "text": "ボートは600。", "t": 210,
     "src": {"lines": ["0:03:30"], "notes": "[0:03:00] ボート"}, "what": "ボート",
     "amounts": [{"value": 600, "unit": None, "as": "said"}], "verify": "単位を言っていない", "trip": "lake"},
    # 隣の行（0:01:30 と 0:02:30）の項目から見ると「近くの額」。ここが名乗っているので、あちらは落ちない
    {"kind": "price", "text": "梨ジュースは90円。", "t": 120,
     "src": {"lines": ["0:02:00"], "notes": "[0:01:30] スーパー"}, "what": "梨ジュース",
     "amounts": [{"value": 90, "unit": "円", "as": "said"}]},
    # チャットが先に言い、本人は認めただけの話。一言は付けない
    {"kind": "fact", "text": "旧市街は朝が静か。", "t": 0,
     "src": {"lines": ["0:00:00"], "notes": "[0:00:00] 旧市街へ"}, "via": "chat"},
    # 日帰りの遠出の項目
    {"kind": "place", "text": "乗り場まで歩いた。", "t": 210,
     "src": {"lines": ["0:03:30"], "notes": "[0:03:00] ボート"},
     "place": {"name": "ボート乗り場", "heard": ["ボート"]}, "trip": "lake"},
]
MEASURED = {"what": "バスに乗ってから降りるまで", "from": "0:00:30", "to": "0:03:30"}


def make_root(d: Path) -> tuple[Path, Path]:
    root = d / "streams"
    m = root / "2026" / "10"
    m.mkdir(parents=True)
    (m / f"{STEM}.transcript.txt").write_text(TRANSCRIPT, encoding="utf-8")
    (m / f"{STEM}.chat.txt").write_text(CHAT, encoding="utf-8")
    (m / f"{STEM}.md").write_text(NOTES, encoding="utf-8")
    table = d / "cities.json"
    table.write_text(json.dumps(TABLE, ensure_ascii=False), encoding="utf-8")
    return root, table


def run(root: Path, table: Path, *argv: str) -> tuple[int, str]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
        rc = gf.main(["--root", str(root), "--table", str(table), *argv])
    return rc, buf.getvalue()


def put(root: Path, items, head: dict | None = None) -> Path:
    p = root / "2026" / "10" / f"{STEM}.facts.json"
    p.write_text(json.dumps({**(head or HEAD), "items": items}, ensure_ascii=False), encoding="utf-8")
    return p


def codes(root: Path, table: Path, items, head: dict | None = None) -> tuple[int, set[str]]:
    """そのファイルを check にかけて（終了コード, 出た札の集まり）。"""
    p = put(root, items, head)
    rc, _ = run(root, table, "check", STEM)
    r = gf.check_file(p, gf.load_table(table))
    return rc, {c for _, c, _ in r.ng}


def edit(i: int, **kw) -> list:
    """GOOD の i 番目の欄を差し替えたもの。None を渡した欄は消す。"""
    items = copy.deepcopy(GOOD)
    for k, v in kw.items():
        if v is None:
            items[i].pop(k, None)
        else:
            items[i][k] = v
    return items


def extra(**it) -> list:
    """GOOD の尻に1項目足したもの。"""
    base = {"kind": "fact", "text": "見本。", "t": 0, "src": {"lines": ["0:00:00"], "notes": "[0:00:00] 旧市街へ"}}
    return copy.deepcopy(GOOD) + [{**base, **it}]


def check_units() -> None:
    check("数字: カンマ・万・全角を同じ形に",
          [gf.numval("1,500"), gf.numval("1万5000"), gf.numval("2万"), sorted(gf.numbers_in("１００円と1.5倍"))],
          ["1500", "15000", "20000", ["1.5", "100"]])
    long, short = gf.name_forms({"@たろう-x1y", "Hanako_はなこ", "@jiro1685", "@あやとグルメアプリ", "ラン"})
    check("名前: 尻尾と区切りを落とした頭も探す", {"たろう", "hanako", "はなこ", "jiro1685"} <= long, True)
    check("名前: 短い切れ端は敬称つきのときだけ", ("jiro" in long, "ラン" in short, "ラン" in long), (True, True, False))
    check("名前: 配信者の側のアカウントは名前に数えない", any("あやと" in n for n in long | short), False)
    check("読み上げ: 何字続けば同じ文と見るか（短い5字は4字、長いものは8字）",
          [gf.overlap_need("詐欺やんけ"), gf.overlap_need("あ" * 10), gf.overlap_need("あ" * 30)], [4, 7, 8])
    check("読み上げ: 続いた共通の字を数える", gf.lcs("紫のラベルの梨ジュース飲んで欲しい", "紫のラベルの梨ジュース飲んでほしい"), 14)
    check("読み上げ: 同じ話題の語が1つ重なるだけ（より安いよ）なら、同じ文と見ない",
          gf.same_sentence(gf.squash("アルバニアより安いよ"), gf.squash("日本より安いよ")), False)


def check_table() -> None:
    real = gf.load_table(gf.TABLE)
    got = [gf.resolve_place(h, real) for h in
           ["北マケドニア・スコピエ", "北マケドニア", "北マケドニア・滞在中の宿", "北マケドニア・オフリド", "ジョージア・トビリシ"]]
    check("寄せる表（本物）: 北マケドニアの頭の書きかた", got,
          [("north-macedonia", "skopje", "名前"), ("north-macedonia", "skopje", "拠点"),
           ("north-macedonia", "skopje", "拠点"), ("north-macedonia", None, "表に無い街"), (None, None, "表に無い国")])
    units = gf.money_units(real, "north-macedonia")
    check("寄せる表（本物）: 額は単位つきの形だけ拾う",
          gf.money_in("60マケドニア通貨で180円ぐらい、600やって", units), [("60", "デナール"), ("180", "円")])
    check("現地の日付: JST の深夜は前の日", gf.local_date("2026-10-16 01:06", "Europe/Skopje"), "2026-10-15")


def check_good(root: Path, table: Path) -> None:
    put(root, GOOD)
    rc, out = run(root, table, "check", STEM)
    check("通る形: 終了 0", rc, 0)
    check("通る形: 辿れない項目を数えて 0件と出す", "辿れない項目 0件 / NG 0件" in out, True)
    check("通る形: 種類ごとの数", "項目 9件（move1 price3 place2 food1 fact1 quote1）額つき 5・確かめが要る 2・チャットが出どころ 1・測った値 1" in out, True)
    rc, _ = run(root, table, "check", "--month", "2026-10")
    check("月で指すと同じものを見る", rc, 0)
    rc, _ = run(root, table, "check", "--country", "testland", "--city", "town")
    check("国と街で指すと同じものを見る", rc, 0)
    # 寄せる表の places は「正の名前 → 別の書きかた」。どちらで書いても表に在る（city が正の名前に寄せる）
    items = extra(kind="place", text="バザールを歩いた。", place={"name": "バザール", "heard": []})
    r = gf.check_file(put(root, items), gf.load_table(table))
    check("寄せる表: 表に無い場所の名前だけを数える（別の書きかたは表に在る）", sorted(r.off_table), ["ボート乗り場"])
    put(root, GOOD)


def check_guards(root: Path, table: Path) -> None:
    cases = [
        # --- 時刻
        ("time: 根拠の行が文字起こしに無い", edit(2, src={"lines": ["0:01:45"], "notes": "[0:01:30] スーパー"}), {"time"}),
        ("time: t が根拠の行の外", edit(2, t=120), {"time"}),
        ("time: t が配信の前", edit(0, t=-5), {"time"}),
        ("time: 根拠の行を広く取りすぎ（5分を超える）", "wide", {"time"}),
        # --- 議事録の見出し
        ("notes: 見出しが議事録に無い", edit(2, src={"lines": ["0:01:30"], "notes": "[0:01:30] 市場"}), {"notes"}),
        ("notes: t がその見出しの節の外", edit(0, src={"lines": ["0:00:30"], "notes": "[0:03:00] ボート"}), {"notes"}),
        # --- 数字
        ("number: 本文の数字を1つ書き換える（75→85）", edit(2, text="パスタは85円。"), {"number"}),
        ("number: 字幕に在るが ±90秒より遠い数字", edit(0, text="バスは60番。片道50デナール。ボートは600。"), {"number"}),
        ("number: 換算の額を本文に書く", edit(0, text="バスは60番。片道50デナールで150円。"), {"number"}),
        # --- 言い回し
        ("quote: 字幕に無い言い回し", edit(4, quote="来て正解やったわ"), {"quote"}),
        ("quote: 字幕に在るが ±90秒より遠い", edit(4, quote="ほなまた明日"), {"quote"}),
        ("quote: 中略の順が逆", edit(1, quote="来てよかったわ…めっちゃ綺麗やんか"), {"quote"}),
        # --- 読み上げ
        ("readaloud: 読み上げたチャットを本人の一言にする",
         extra(kind="quote", about="food", text="梨ジュースの話。", t=120,
               src={"lines": ["0:02:00"], "notes": "[0:01:30] スーパー"}, quote="紫のラベルの梨ジュース飲んで欲しい"), {"readaloud"}),
        ("readaloud: かなとカタカナが違っても同じ文と見る（字幕は「キレイ」、チャットは「きれい」）",
         extra(kind="quote", about="fact", text="道の話。", t=270,
               src={"lines": ["0:04:30"], "notes": "[0:03:00] ボート"}, quote="こっちの道はめっちゃキレイに見えるんちゃうか"), {"readaloud"}),
        ("readaloud: 間に言い足しが挟まっても同じ文と見る（続いた字は境に届かない）",
         extra(kind="quote", about="fact", text="帰りの話。", t=270,
               src={"lines": ["0:04:30"], "notes": "[0:03:00] ボート"}, quote="歩いて帰ろうかな"), {"readaloud"}),
        # --- 素性
        ("identity: @名前", edit(1, text="旧市街を歩いた。@よしこ に教わった。"), {"identity"}),
        ("identity: チャットの投稿者の名前（@ も尻尾も無い形）", edit(1, text="旧市街を歩いた。たろうに教わった。"), {"identity"}),
        ("identity: 議事録にだけ在る名前", edit(1, text="旧市街を歩いた。さぶろうに見送られた。"), {"identity"}),
        ("identity: 短い名前（2字）は、敬称が続くときだけ名前と見る", edit(1, text="旧市街を歩いた。ランさんの勧め。"), {"identity"}),
        ("identity: 短い名前がふつうの語に入っているだけなら落とさない", edit(1, text="旧市街を歩いた。ランチの前。"), set()),
        ("identity: 呼びかけの入った言い回し（チャットの表記と違うあだ名でも、形で落とす）",
         extra(kind="quote", about="fact", text="挨拶。", t=240,
               src={"lines": ["0:04:00"], "notes": "[0:03:00] ボート"}, quote="はなちゃん、こんばんは"), {"identity"}),
        ("identity: 名前の入っていない挨拶は落とさない",
         extra(kind="quote", about="fact", text="挨拶。", t=240,
               src={"lines": ["0:04:00"], "notes": "[0:03:00] ボート"}, quote="今日も来てくれてありがとう"), set()),
        ("identity: 投げ銭の話", edit(1, text="旧市街を歩いた。投げ銭のお礼を言った。"), {"identity"}),
        ("identity: 投げ銭と同じ額",
         extra(kind="price", text="お菓子は320円。", t=210, what="お菓子",
               src={"lines": ["0:03:30"], "notes": "[0:03:00] ボート"},
               amounts=[{"value": 320, "unit": "円", "as": "said"}]), {"identity"}),
        # --- 歌詞の印
        ("music: 伏せた行（[音楽]）を根拠にする",
         extra(t=180, src={"lines": ["0:03:00"], "notes": "[0:03:00] ボート"}), {"music"}),
        # --- 額の割れ
        ("split: 同じ単位の額が2つ在るのに印が無い", edit(3, verify=None), {"split"}),
        ("split: 近くの額（コーラ100円）を挙げていない", edit(2, other_amounts=None), {"split"}),
        ("split: 単位を言っていない額に印が無い", edit(5, verify=None), {"split"}),
        ("split: 隣の行の額（梨ジュース90円）を、どの項目も名乗っていない", [copy.deepcopy(x) for k, x in enumerate(GOOD) if k != 6], {"split"}),
        # --- チャットが出どころ・測った値・遠出
        ("via: チャットが出どころの項目に、本人の一言を付ける", edit(7, quote="今日は旧止街を歩きます"), {"via"}),
        ("measured: 始まりが終わりより後", edit(0, measured={**MEASURED, "from": "0:03:30", "to": "0:00:30"}), {"measured"}),
        ("measured: 始まりと終わりが同じ行", edit(0, measured={**MEASURED, "to": "0:00:30"}), {"measured"}),
        ("measured: 終わりの行が文字起こしに無い", edit(0, measured={**MEASURED, "to": "0:09:00"}), {"measured"}),
        ("measured: 終わりの行が曲の区間", edit(0, measured={**MEASURED, "to": "0:03:00"}), {"measured"}),
        ("trip: 寄せる表に無い遠出の札", edit(8, trip="mountain"), {"trip"}),
        # --- 場所の名前
        ("place: 字幕での形がこの配信の字幕に無い", edit(1, place={"name": "旧市街", "heard": ["オールドタウン"]}), {"place"}),
        ("place: 字幕にも議事録にも題名にも無い名前", edit(1, place={"name": "石の橋", "heard": []}), {"place"}),
        # --- 形
        ("form: 種類が決まりの外", edit(1, kind="sight"), {"form"}),
        ("form: 言い回しの項目に about が無い", edit(4, about=None), {"form"}),
        ("form: 額に what が無い", edit(2, what=None), {"form"}),
        ("form: 換算が元の額×rate と合わない",
         edit(0, amounts=[{"value": 50, "unit": "デナール", "as": "said"},
                          {"value": 200, "unit": "円", "as": "converted", "from": {"value": 50, "unit": "デナール"}, "rate": 3}]),
         {"form"}),
        ("form: via の値が決まりの外", edit(7, via="viewer"), {"form"}),
        ("form: 測った値に、何を測ったか（what）が無い", edit(0, measured={"from": "0:00:30", "to": "0:03:30"}), {"form"}),
        ("form: 測った値の時刻が h:mm:ss でない", edit(0, measured={**MEASURED, "to": "3分30秒"}), {"form"}),
        ("form: 表に無い単位", edit(5, amounts=[{"value": 600, "unit": "ペソ", "as": "said"}]), {"form"}),
    ]
    for name, items, want in cases:
        if items == "wide":
            # 字幕を15分ぶんに伸ばして、頭と尻の行を根拠にする（数字も言い回しも無い項目）
            p = root / "2026" / "10" / f"{STEM}.transcript.txt"
            p.write_text(TRANSCRIPT + "".join(f"[0:{m:02d}:00] 歩いています。\n" for m in range(5, 16)), encoding="utf-8")
            rc, got = codes(root, table, extra(kind="fact", text="歩いた。", t=210,
                                               src={"lines": ["0:03:30", "0:09:00"], "notes": "[0:03:00] ボート"}))
            p.write_text(TRANSCRIPT, encoding="utf-8")
        else:
            rc, got = codes(root, table, items)
        check(name, (rc, got), (1 if want else 0, want))

    # 額そのものを書き換えると、数字（字幕に無い）で落ちる。挙げなくなった元の額が「近くの額」として一緒に出てよい
    rc, got = codes(root, table, edit(2, amounts=[{"value": 85, "unit": "円", "as": "said"}]))
    check("number: 額を書き換える（75→85）", (rc, "number" in got), (1, True))

    # 頭
    rc, got = codes(root, table, GOOD, {**HEAD, "city": "village"})
    check("head: 街が、議事録の場所から出る値と違う", (rc, got), (1, {"head"}))
    rc, got = codes(root, table, GOOD, {**HEAD, "date_local": "2026-10-19"})
    check("head: 現地の日付が違う", (rc, got), (1, {"head"}))

    # 本人が言う前に、チャットに同じ数字が在る（チャットが出どころの数字を読み上げただけかもしれない）
    c = root / "2026" / "10" / f"{STEM}.chat.txt"
    c.write_text(CHAT + "[0:00:20] @はなこ: 片道は50デナールやで\n", encoding="utf-8")
    rc, got = codes(root, table, GOOD)
    check("chatfirst: 本人が言う前にチャットに同じ額", (rc, got), (1, {"chatfirst"}))
    rc, got = codes(root, table, edit(0, verify="チャットが先に額を書いている"))
    check("chatfirst: 確かめが要るの印が在れば通す", (rc, got), (0, set()))
    rc, got = codes(root, table, edit(0, via="chat"))
    check("chatfirst: チャットが出どころと名乗っていれば通す", (rc, got), (0, set()))
    c.write_text(CHAT + "[0:00:20] @はなこ: 片道は50デナルやで\n", encoding="utf-8")
    rc, got = codes(root, table, GOOD)
    check("chatfirst: 単位の言いかたが違っても同じ額と見る（デナル）", (rc, got), (1, {"chatfirst"}))
    c.write_text(CHAT + "[0:00:50] @はなこ: 50デナールは安い\n", encoding="utf-8")
    rc, got = codes(root, table, GOOD)
    check("chatfirst: 本人が言ったあとのチャット（繰り返し）は落とさない", (rc, got), (0, set()))
    c.write_text(CHAT, encoding="utf-8")
    rc, got = codes(root, table, GOOD)
    check("chatfirst: 配信者の側の定期の告知（50デナール）は数えない", (rc, got), (0, set()))
    # 額でない数字（「60番」）も同じ。0:00:30 の行は本人が先、0:01:00 の行はチャット（0:00:55）のあと
    c.write_text(CHAT + "[0:00:55] @はなこ: 60番か\n", encoding="utf-8")
    late = {"lines": ["0:01:00"], "notes": "[0:00:00] 旧市街へ"}
    both = {"lines": ["0:00:30", "0:01:00"], "notes": "[0:00:00] 旧市街へ"}
    rc, got = codes(root, table, edit(0, t=60, src=late))
    check("chatfirst: チャットのあとの行だけを根拠にした数字（60番）", (rc, got), (1, {"chatfirst"}))
    rc, got = codes(root, table, edit(0, src=both))
    check("chatfirst: 本人が先に言った行も根拠に在れば通す", (rc, got), (0, set()))
    c.write_text(CHAT + "[0:00:55] @はなこ: 60分かかる\n", encoding="utf-8")
    rc, got = codes(root, table, edit(0, t=60, src=late))
    check("chatfirst: 同じ数字でも、あとの字が違えば別の話（60分）", (rc, got), (0, set()))
    c.write_text(CHAT, encoding="utf-8")


def check_blind(root: Path, table: Path) -> None:
    put(root, [])
    rc, out = run(root, table, "check", STEM)
    check("0件を合格にしない: 項目が0件は終了 2", (rc, "項目が0件" in out), (2, True))
    t = root / "2026" / "10" / f"{STEM}.transcript.txt"
    put(root, GOOD)
    t.write_text("# 題\n\n[0:00:00] [音楽]\n[0:00:30] [音楽]\n", encoding="utf-8")
    rc, out = run(root, table, "check", STEM)
    check("0件を合格にしない: 文字起こしが読めない（曲の行だけ）は終了 2", (rc, "文字起こしが読めない" in out), (2, True))
    t.unlink()
    rc, out = run(root, table, "check", STEM)
    check("0件を合格にしない: 文字起こしが無いは終了 2", (rc, "材料が無い" in out), (2, True))
    t.write_text(TRANSCRIPT, encoding="utf-8")
    rc, _ = run(root, table, "check", "2026-10-19_2200_ZZZ")
    check("0件を合格にしない: 指した stem のファイルが無いは終了 2", rc, 2)
    rc, _ = run(root, table, "check", "--month", "2026-09")
    check("0件を合格にしない: その月に1本も無いは終了 2", rc, 2)
    (root / "2026" / "10" / f"{STEM}.facts.json").write_text("{", encoding="utf-8")
    rc, _ = run(root, table, "check", STEM)
    check("0件を合格にしない: JSON として読めないは終了 2", rc, 2)


def check_city(root: Path, table: Path, d: Path) -> None:
    put(root, GOOD)
    out_md = d / "town.md"
    rc, _ = run(root, table, "city", "--country", "testland", "--city", "town", "-o", str(out_md))
    text = out_md.read_text(encoding="utf-8") if out_md.exists() else ""
    ready, _, held = text.partition("## 確かめが要る行（3件）— このままでは面に出さない")
    check("city: 終了 0 で下書きが出る", (rc, text.startswith("# タウン（テスト国）")), (0, True))
    check("city: そのまま出せる行と、確かめが要る行に分ける（数を頭に出す）",
          ("**そのまま出せる 6件／確かめが要る 3件**（額や単位を確かめる 2件・チャットが出どころ 1件）" in text,
           "## そのまま出せる行（6件）" in ready, bool(held)), (True, True, True))
    check("city: 確かめが要る項目（verify）は、そのまま出せる側に出ない",
          ("クッキー" in ready, "ボートは600" in ready, "クッキーは60デナール" in held, "ボートは600" in held),
          (False, False, True, True))
    check("city: チャットが出どころの項目は、そのまま出せる側に出ない",
          ("旧市街は朝が静か" in ready, "旧市街は朝が静か。 〔チャットが出どころ。本人は認めただけ〕" in held), (False, True))
    check("city: 額の表に、何に・いくら・いつ・場面（時刻つきリンク）",
          "| パスタ | 75円 | 2026-10-18 | [0:01:30](https://www.youtube.com/watch?v=AAA&t=90s) |" in ready, True)
    check("city: 換算と、単位の無い額と、要確認が見分けられる",
          ("50デナール・150円（50デナール からの換算）" in ready, "〔額: ボート 600（単位は言っていない）〕" in held,
           "〔要確認: 単位を言っていない〕" in held), (True, True, True))
    check("city: 測った値は、言った数字と別に、両方の行へのリンクつきで出す",
          "〔測った値 約3分: バスに乗ってから降りるまで（[0:00:30](https://www.youtube.com/watch?v=AAA&t=30s)"
          " → [0:03:30](https://www.youtube.com/watch?v=AAA&t=210s)）〕" in ready, True)
    check("city: 場所ごとに、行った日・一言・場面",
          "**旧市街**\n\n- 旧市街を歩いた。 「めっちゃ 綺麗やんか…来てよかった[です]わ」"
          "（2026-10-18 [0:01:00](https://www.youtube.com/watch?v=AAA&t=60s)）\n"
          "- 「ほんまに来てよかったわ」— 旧市街に着いたときの一言。" in ready, True)
    check("city: 遠出は、街の中でなく遠出ごとに束ねる",
          (ready.index("### タウン") < ready.index("### 遠出: みずうみ") < ready.index("乗り場まで歩いた"),
           held.index("### 遠出: みずうみ") < held.index("ボートは600")), (True, True))
    lines = [s for s in text.splitlines() if s.startswith("- ") or (s.startswith("| ") and "&t=" in s)]
    check("city: どの行にも日付と時刻つきリンク", all("2026-10-18" in s and "&t=" in s for s in lines) and len(lines), 10)
    check("city: 視聴者さんの名前が出ない", any(n in text for n in ["たろう", "はなこ", "jiro", "さぶろう"]), False)
    rc, out = run(root, table, "city", "--country", "testland", "--city", "town", "--trip", "lake")
    check("city --trip: その遠出の項目だけを束ねる",
          (rc, out.startswith("# みずうみ（タウンからの遠出）"), "乗り場まで歩いた" in out, "ボートは600" in out,
           "パスタ" in out, "### タウン" in out), (0, True, True, True, False, False))
    check("city --trip: 頭の数も、その遠出のぶんだけ",
          "項目 2件。**そのまま出せる 1件／確かめが要る 1件**（額や単位を確かめる 1件・チャットが出どころ 0件）" in out, True)
    rc, _ = run(root, table, "city", "--country", "testland", "--city", "town", "--trip", "mountain")
    check("city --trip: 表に無い遠出は終了 2", rc, 2)
    rc, out = run(root, table, "city", "--country", "testland", "--city", "town")
    check("city: 書き出す先が無ければ標準出力に出す", (rc, out == text), (0, True))
    put(root, edit(2, text="パスタは85円。"))
    rc, _ = run(root, table, "city", "--country", "testland", "--city", "town")
    check("city: check を通っていない材料では組まない", rc, 1)
    rc, _ = run(root, table, "city", "--country", "testland", "--city", "nowhere")
    check("city: 表に無い街は終了 2", rc, 2)


def check_new_and_read(root: Path, table: Path) -> None:
    p = root / "2026" / "10" / f"{STEM}.facts.json"
    rc, out = run(root, table, "pending", "--country", "testland")
    check("pending: 抜いたものは「済み」", (rc, "まだ 0本 / 済み 1本" in out), (0, True))
    p.unlink()
    rc, out = run(root, table, "pending", "--country", "testland")
    check("pending: まだの配信を、寄せた街と字幕の字数つきで出す",
          (rc, f"{STEM}\ttown（名前）\t字幕 " in out, "まだ 1本 / 済み 0本" in out), (0, True, True))
    rc, out = run(root, table, "pending", "--country", "elsewhere")
    check("pending: ほかの国を指すと出ない", "まだ 0本 / 済み 0本" in out, True)
    rc, out = run(root, table, "new", STEM)
    made = json.loads(p.read_text(encoding="utf-8"))
    check("new: 頭を機械で埋めた空のファイルを置く", (rc, {k: made[k] for k in HEAD}, made["items"]), (0, HEAD, []))
    check("new: 議事録の見出しを地図として出す", "[0:01:30] スーパー" in out, True)
    check("new: その街からの遠出の札を出す", "lake（みずうみ）" in out, True)
    rc, _ = run(root, table, "check", STEM)
    check("new: 置いただけのものは通らない（終了 2）", rc, 2)
    rc, out = run(root, table, "read", STEM, "0:01:30", "0:02:00", "--chat")
    check("read: その窓の字幕と、同じ時刻のチャットの文", (rc, "[0:01:30] パスタが75円" in out, "梨ジュース飲んでほしい" in out),
          (0, True, True))
    check("read: チャットの名前は出さない", "はなこ" in out or "Hanako" in out, False)


# ---------------------------------------------------------------- 抜く道具（guide_extract.py）

STEM_N = "2026-10-18_2202_NNN"   # 名前の入った材料（1枚を組むだけ。呼ばない）
STEM_C = "2026-10-18_2202_CCC"   # 名前の入っていない材料（偽物の claude で抜くところまで）
# 見出しにも名前が入る（議事録の見出しは機械が書くので「先生は @名前」がありうる）。流れには「名前 ¥額」
NOTES_N = NOTES.replace("### [0:03:00] ボート", "### [0:03:00] ボートとたろうさん").replace(
    "パスタとコーラの値段。", "パスタとコーラの値段。jiro1685 ¥320「おやつ代」。")
TRANSCRIPT_C = TRANSCRIPT.replace("たろうさん、こんばんは。はなちゃん、こんばんは。今日も来てくれてありがとう。", "")
NOTES_C = NOTES.replace("@さぶろう「いってらっしゃい」。", "")
# 見張りが探す、こしらえた素性（1枚に1つでも在れば落とす）
SECRETS = ["たろう", "はなこ", "hanako", "jiro", "さぶろう", "はなちゃん", "¥320", "¥"]
BAD_QUOTE = "ほんまに来てよかったです"   # 字幕に無い言い回し（quote で落ちる）


def ex_root(d: Path) -> tuple[Path, Path]:
    root = d / "streams"
    m = root / "2026" / "10"
    m.mkdir(parents=True)
    for stem, tr, notes in ((STEM_N, TRANSCRIPT, NOTES_N), (STEM_C, TRANSCRIPT_C, NOTES_C)):
        (m / f"{stem}.transcript.txt").write_text(tr, encoding="utf-8")
        (m / f"{stem}.chat.txt").write_text(CHAT, encoding="utf-8")
        (m / f"{stem}.md").write_text(notes, encoding="utf-8")
    table = d / "cities.json"
    table.write_text(json.dumps(TABLE, ensure_ascii=False), encoding="utf-8")
    return root, table


class FakeClaude:
    """`claude -p` の代わり。reply(1枚, 何回目) が返す data を、`claude -p --output-format json` の形で返す。"""

    def __init__(self, reply):
        self.reply, self.prompts = reply, []

    def __call__(self, prompt, model, schema, timeout, effort=None):
        self.prompts.append(prompt)
        return {"structured_output": self.reply(prompt, len(self.prompts)), "duration_ms": 10, "total_cost_usd": 0,
                "usage": {"input_tokens": len(prompt), "output_tokens": 100}}


def bad_items() -> list:
    return edit(4, quote=BAD_QUOTE)


def run_extract(root: Path, table: Path, d: Path, reply) -> tuple[int, str, FakeClaude, Path]:
    fake = FakeClaude(reply)
    keep = ge.call_model
    ge.call_model = fake
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            rc = ge.main([STEM_C, "--root", str(root), "--table", str(table), "--out", str(d / "out")])
    finally:
        ge.call_model = keep
    return rc, buf.getvalue(), fake, root / "2026" / "10" / f"{STEM_C}.facts.json"


def extract_cases() -> dict[str, bool]:
    """抜く道具の対照。名前 → 通ったか。外しかたの対照（DRILL）からも同じものを回す。"""
    got: dict[str, bool] = {}
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        root, table_p = ex_root(d)
        table = gf.load_table(table_p)
        m = ge.Material(root / "2026" / "10" / STEM_N, table)
        prompt = ge.build(root, m, [(0, m.last)])
        low = gf.norm(prompt).casefold()
        got["伏せる: 1枚に、チャットの投稿者名・呼びかけ・@名前・見出しの名前・投げ銭の額が無い"] = (
            not [s for s in SECRETS if s.casefold() in low] and "[0:03:00] ボートと〇〇さん" in prompt)
        got["伏せる: チャットは本文を残す（読み上げの見分けに要る）"] = "スーパーで紫のラベルの梨ジュース飲んでほしい" in prompt
        heads = dict((h.split("]")[0], h) for _, h in m.notes["heads"])
        back = m.restore([{"kind": "fact", "src": {"lines": ["0:03:30"], "notes": "[0:03:00] ボートと〇〇さん"}}])
        got["伏せる: 伏せて見せた見出しは、返ってきたら議事録の見出しそのものに戻す"] = (
            back[0]["src"]["notes"] == heads["[0:03:00"] == "[0:03:00] ボートとたろうさん")
        raw = TRANSCRIPT + CHAT + NOTES_N
        found = set(ge.leaks(raw, m.names))
        got["漏れの見張り: 伏せていない材料から、名前・呼びかけ・@名前・投げ銭の額を見つける"] = (
            {"チャットの投稿者の名前", "呼びかけ", "@名前", "投げ銭の額"} <= found)

        def good(p, n):
            return {"items": copy.deepcopy(GOOD)}
        rc, out, fake, dest = run_extract(root, table_p, d, good)
        written = json.loads(dest.read_text(encoding="utf-8")) if dest.exists() else {}
        got["抜く: 返ってきた項目が check を通れば、頭を機械で埋めて置く"] = (
            rc == 0 and len(fake.prompts) == 1 and len(written.get("items", [])) == len(GOOD)
            and written.get("video_id") == "CCC" and written.get("city") == "town")
        dest.unlink(missing_ok=True)

        def heals(p, n):
            # 偽物の直し役は、NG の行が1枚に載っていれば直す（載っていなければ同じものを返す）
            return {"items": copy.deepcopy(GOOD) if n > 1 and "[quote] #4" in p else bad_items()}
        rc, out, fake, dest = run_extract(root, table_p, d, heals)
        got["直す: NG の行を添えて同じ1枚で直させると、2回目で直る（落とさない）"] = (
            rc == 0 and len(fake.prompts) == 2 and fake.prompts[1].startswith(fake.prompts[0])
            and dest.exists() and len(json.loads(dest.read_text(encoding="utf-8"))["items"]) == len(GOOD))
        dest.unlink(missing_ok=True)

        def stubborn(p, n):
            return {"items": bad_items()}
        rc, out, fake, dest = run_extract(root, table_p, d, stubborn)
        got["直す: 直させるのは1回まで（呼ぶのは2回）"] = len(fake.prompts) == 2
        kept = json.loads(dest.read_text(encoding="utf-8"))["items"] if dest.exists() else []
        got[DROP] = (
            rc == 0 and len(kept) == len(GOOD) - 1 and not any(x.get("quote") == BAD_QUOTE for x in kept)
            and "落とした quote1" in out)
        dest.unlink(missing_ok=True)

        rc_a, _, _, dest_a = run_extract(root, table_p, d, lambda p, n: {"items": []})
        made_a = dest_a.exists()
        dest_a.unlink(missing_ok=True)
        only_bad = [copy.deepcopy(GOOD[4]) | {"quote": BAD_QUOTE}]
        rc_b, _, _, dest_b = run_extract(root, table_p, d, lambda p, n: {"items": copy.deepcopy(only_bad)})
        got[ZERO] = (
            (rc_a, made_a, rc_b, dest_b.exists()) == (2, False, 2, False))
        dest_b.unlink(missing_ok=True)
    return got


ZERO = "0件: 項目が0件の返事も、落として0件になった回も置かない（終了 2）"
DROP = "落とす: 2回目も落ちた項目だけを落として、残りを置く（落とした数を札ごとに出す）"
# 呼べたときだけ通る対照（0件の対照は、呼ばずに終了 2 でも通るので入れない）
EXTRACT_E2E = {"抜く: 返ってきた項目が check を通れば、頭を機械で埋めて置く",
               "直す: NG の行を添えて同じ1枚で直させると、2回目で直る（落とさない）",
               "直す: 直させるのは1回まで（呼ぶのは2回）", DROP}
_fix_prompt, _drop_ng = ge.fix_prompt, ge.drop_ng
# 守りの外しかた → そのとき落ちるはずの対照（これ以外は通るはず）
DRILL = [
    ("字幕・議事録・見出しの名前を伏せない（mask_text を素通しに）",
     {"mask_text": lambda s, names: gf.norm(s)},
     {"伏せる: 1枚に、チャットの投稿者名・呼びかけ・@名前・見出しの名前・投げ銭の額が無い"}),
    ("チャットの投稿者名と投げ銭の額を1枚に出す（chat_line）",
     {"chat_line": lambda c, names: f"    チャット {c['paid'] or ''} {c['name']}: {c['body']}"},
     {"伏せる: 1枚に、チャットの投稿者名・呼びかけ・@名前・見出しの名前・投げ銭の額が無い"} | EXTRACT_E2E),
    ("伏せ残しの見張りを外す（leaks が何も見つけない）",
     {"leaks": lambda text, names: []},
     {"漏れの見張り: 伏せていない材料から、名前・呼びかけ・@名前・投げ銭の額を見つける"}),
    ("直しの1枚に NG の行を載せない",
     {"fix_prompt": lambda base, items, ng: _fix_prompt(base, items, [])},
     {"直す: NG の行を添えて同じ1枚で直させると、2回目で直る（落とさない）"}),
    ("直させる回数を2回に（FIXES）", {"FIXES": 2}, {"直す: 直させるのは1回まで（呼ぶのは2回）"}),
    # 落とさなければ、全部が落ちる回も「0件」にならず NG のまま（終了 1）になるので、0件の対照もいっしょに落ちる
    ("2回目も落ちた項目を落とさない（drop_ng を素通しに）",
     {"drop_ng": lambda m, table, items: (items, Counter(), ge.check_items(m, table, items))}, {DROP, ZERO}),
    ("0件を通す（verdict が見るものの無さを見ない）", {"verdict": lambda r: 1 if r.ng else 0}, {ZERO}),
]


def check_extract() -> None:
    got = extract_cases()
    for name, passed in got.items():
        check(name, passed, True)
    check("抜く道具の対照が1件も無い、ではない", len(got) >= 8, True)
    for label, patch, want in DRILL:
        keep = {k: getattr(ge, k) for k in patch}
        try:
            for k, v in patch.items():
                setattr(ge, k, v)
            fell = {k for k, v in extract_cases().items() if not v}
        finally:
            for k, v in keep.items():
                setattr(ge, k, v)
        check(f"外す: {label} → その守りの対照だけが落ちる", sorted(fell), sorted(want))


def check_windows() -> None:
    wins = [{"from": "0:01:00", "to": "0:02:00"}, {"from": "0:02:30", "to": "0:03:00"},
            {"from": "あさ", "to": "0:01:00"}, {"from": "0:09:00", "to": "0:08:00"}]
    check("窓: 前後に幅を足して重なりを畳む・読めない窓と逆さの窓は捨てる",
          ge.merge_windows(wins, 3600, 3600), [(30, 240)])
    many = [{"from": f"0:{k:02d}:00", "to": f"0:{k:02d}:30"} for k in range(0, 60, 5)]
    # 頭の窓は 0〜90秒、あとは1つ120秒。1行ぶん（30秒）ずつ足して数えると、5つ目で 720秒・6つ目で 840秒（上限 750秒）
    check("窓: 合計が上限の1.25倍を超えたら、尻を切る", len(ge.merge_windows(many, 3600, 600)), 5)


def main() -> int:
    check_units()
    check_table()
    check_windows()
    check_extract()
    with tempfile.TemporaryDirectory() as d:
        root, table = make_root(Path(d))
        check_good(root, table)
        check_guards(root, table)
        check_blind(root, table)
        check_city(root, table, Path(d))
        check_new_and_read(root, table)
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
