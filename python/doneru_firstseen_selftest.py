"""毎晩の側が、**空のままの `firstSeenAt` を拾うこと**を確かめる（#158）。

    python3 python/doneru_firstseen_selftest.py

**BigQuery にも Firestore にも1バイトも出ない。** 資格情報も要らない。
決めているところ（`pks_to_ask` / `plan_nightly` / `plan_first_seen`）は
素の関数に切り出してあるので、偽のデータを渡して呼ぶだけで済む。

## なぜ別の見張りが要るか

`doneru_supporters_selftest.py` は「**表に無い どねID** に何を入れるか」
だけを見ていた。画面から先に登録された人（`POST /island-api/donors/{…}`）は
**投げ銭した晩には書類がもう在る**ので、あの見張りの範囲に1度も入らない。
だからその人は `firstSeenAt` が空のまま残り続けて、
`site/components/me/DonorLinks.tsx` の「◯月◯日に来た」が出なかった。
**赤くならない。出ないだけ。**

## 見るのは4通り。**1つずつ**

| 書類 | `firstSeenAt` | `doneru_donations` | どうなるべきか |
| --- | --- | --- | --- |
| 在る | 空 | 行が在る | **入る**（これが直したところ） |
| 在る | 入っている | 行が在る（もっと後の日） | **上書きされない** |
| 在る | 空 | **1行も無い** | **入らない**（`now` で埋めない） |
| 無い | ― | 行が在る | 入る（**前からの枝を壊していない**） |

## 対照（足を1本ずつ抜く）

「入らない」を見る確かめは、**何も呼んでいなくても通る。**
だから `doneru_supporters.py` の写しを6通りに壊して、**そのたびに、
狙った確かめが名指しで落ちる**ところまで見る。終了コードだけを見ると
「どこか落ちた」しか言えない。

壊す字が1つでも当たらなかったら（本体を直して形が変わったら）、
**本物の数字を1つも出さずに終了コード 2 で落ちる**
（`docs/island-standards.md` §15）。

終了コード: 0＝通った / 1＝落ちた / 2＝数えるものが無い
"""

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))

# `config.py` は無いと **読み込む前に** ValueError で落ちる。BigQuery は
# 1度も触らないので値は何でもよい（`doneru_supporters_selftest.py` と同じ置き方）
os.environ.setdefault("BQ_PROJECT_ID", "fake-project-for-selftest")

# 壊した写しで回すときだけ、ここに置き場が入る
SRC_DIR = os.environ.get("DONERU_SRC_DIR") or HERE
# 写しの中で写しを作らない
CONTROL = not os.environ.get("DONERU_SRC_DIR")

# ------------------------------------------------------------------ 偽のデータ

# **本番と同じ形を使う。** どねID は10桁。形が違うと、本番では効かない
# 字を見張ることになる
PK_BLANK = "4000000001"   # 画面から先に登録された人。書類は在るが欄が空
PK_FILLED = "4000000002"  # もう入っている人。**触ってはいけない**
PK_NOROW = "4000000003"   # 欄は空だが、寄付の表に1行も無い人
PK_NEW = "4000000004"     # 書類がまだ無い人（前からの枝）

# もう入っている値。**この字が変わらないこと**を見る
KEPT = "2025-04-01T09:00:00+00:00"

# 全期間の投げ銭。`PK_FILLED` にはわざと**入っている値より後の日**を置く
# ——上書きが起きたら、繰り上がりではなく繰り下がりで目に見える
DONATIONS = [
    {"pk": PK_BLANK, "at": "2026-07-04T02:00:00+00:00"},   # ← これが本当の初回
    {"pk": PK_BLANK, "at": "2026-09-16T12:00:00+00:00"},
    {"pk": PK_FILLED, "at": "2026-09-16T12:00:00+00:00"},
    {"pk": PK_NEW, "at": "2026-05-05T01:00:00+00:00"},
]

TABLE = {
    PK_BLANK: {"viewerPk": PK_BLANK, "addedAt": "2026-08-01T00:00:00+00:00"},
    PK_FILLED: {"viewerPk": PK_FILLED, "firstSeenAt": KEPT},
    PK_NOROW: {"viewerPk": PK_NOROW, "addedAt": "2026-08-02T00:00:00+00:00"},
}

# 窓（`--days`）の中で投げ銭した人。`PK_NOROW` は居ない
FOUND = {
    "2026-09-16": [
        {"pk": PK_BLANK, "name": "あ"},
        {"pk": PK_FILLED, "name": "い"},
        {"pk": PK_NEW, "name": "う"},
    ],
}

# ------------------------------------------------------------------ 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    """1件の確かめ。**名前は対照が名指しで探すので、変えたら対照も直す。**"""
    print(f"  {'ok  ' if cond else 'NG  '} {name}: {got}")
    if not cond:
        FAILED.append(name)


def load():
    """`doneru_supporters` を、**置き場を指定して**読み込む。

    壊した写しで回すときは `DONERU_SRC_DIR` がそちらを指す。
    """
    path = os.path.join(SRC_DIR, "doneru_supporters.py")
    if not os.path.exists(path):
        print(f"✕ {path} が無い")
        sys.exit(2)
    sys.path.insert(0, SRC_DIR)
    spec = importlib.util.spec_from_file_location("ds_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cases(m) -> None:
    """4通りを1つずつ。**この関数が対照でもそのまま回る。**"""
    ask = m.pks_to_ask(FOUND, TABLE)
    plan = m.plan_nightly(ask, DONATIONS, TABLE)
    back, new = plan["backfill"], plan["new"]

    print("\n[1] 書類が既にあって firstSeenAt が空 → 入る")
    ck("引きに行く相手に入っている", PK_BLANK in ask["blank"], ask["blank"])
    ck("入れる時刻（全期間の初回）",
       back.get(PK_BLANK) == "2026-07-04T02:00:00+00:00", back.get(PK_BLANK))
    ck("窓の中の2回目（9/16）ではない",
       back.get(PK_BLANK) != "2026-09-16T12:00:00+00:00", "9月ではない")

    print("\n[2] 書類が既にあって firstSeenAt が入っている → 上書きされない")
    ck("引きに行く相手に入っていない", PK_FILLED not in ask["blank"], ask["blank"])
    ck("直接呼んでも入らない（守りは2枚）",
       m.plan_first_seen([PK_FILLED], DONATIONS, TABLE) == {},
       m.plan_first_seen([PK_FILLED], DONATIONS, TABLE))
    ck("入れるものに出てこない",
       PK_FILLED not in back and PK_FILLED not in new,
       [PK_FILLED in back, PK_FILLED in new])

    print("\n[3] 引けなかった（寄付の表に1行も無い）→ 入らない")
    ck("引きに行く相手には入っている", PK_NOROW in ask["blank"], ask["blank"])
    ck("入れるものには出てこない", PK_NOROW not in back, back.get(PK_NOROW))
    ck("now で埋めていない（今年の日付が入っていない）",
       not str(back.get(PK_NOROW) or "").startswith("202"),
       back.get(PK_NOROW))

    print("\n[4] 書類がまだ無い → これまでどおり入る")
    ck("新規として並ぶ", PK_NEW in ask["new"], ask["new"])
    ck("入れる時刻", new.get(PK_NEW) == "2026-05-05T01:00:00+00:00",
       new.get(PK_NEW))
    ck("空欄埋めのほうには入っていない（二重に書かない）",
       PK_NEW not in back, PK_NEW not in back)

    print("\n[分母] 見た どねID の数")
    ck("引きに行った人数（新規1 + 欄が空2）",
       len(ask["new"]) + len(ask["blank"]) == 3,
       f'新規 {len(ask["new"])}人 / 欄が空 {len(ask["blank"])}人')
    ck("入れる人数（空欄1 + 新規1）", len(back) + len(new) == 2,
       f"空欄埋め {len(back)}件 / 新規 {len(new)}件")


# ------------------------------------------------------------------ 対照

# [名前, 探す字, 置き換える字, 落ちてほしい確かめ]
BREAKS = [
    (
        "欄が空の人を並べない（直す前の姿）",
        '    blank = [\n'
        '        pk for pk, row in sorted(table.items())\n'
        '        if not (row or {}).get("firstSeenAt")\n'
        '    ]\n',
        "    blank = []\n",
        "引きに行く相手に入っている",
    ),
    (
        "並べたのに引かない",
        '"backfill": plan_first_seen(ask.get("blank") or [], donations, table),',
        '"backfill": {},',
        "入れる時刻（全期間の初回）",
    ),
    (
        "空かどうかを見ずに並べる",
        '        if not (row or {}).get("firstSeenAt")\n',
        "        if True\n",
        "引きに行く相手に入っていない",
    ),
    (
        "上書きしない守りを外す",
        '        if (table.get(pk) or {}).get("firstSeenAt"):\n            continue\n',
        "        if False:\n            continue\n",
        "直接呼んでも入らない（守りは2枚）",
    ),
    (
        "引けなかったら now で埋める",
        "        at = firsts.get(pk)\n        if not at:\n            continue\n",
        "        at = firsts.get(pk)\n        if not at:\n"
        "            at = datetime.now(timezone.utc).isoformat()\n",
        "入れるものには出てこない",
    ),
    (
        "新規を並べない（前からの枝を壊す）",
        "    new: list = []\n"
        "    for _day, rows in sorted(found.items()):\n"
        "        for r in rows:\n"
        '            if r["pk"] not in table and r["pk"] not in new:\n'
        '                new.append(r["pk"])\n',
        "    new: list = []\n",
        "新規として並ぶ",
    ),
]


def controls() -> int:
    """壊した写しで回して、**狙った確かめが名指しで落ちる**ことを見る。

    Returns:
        0＝ぜんぶ落ちた（＝対照が効いた） / 2＝壊す字が当たらなかった
    """
    src_path = os.path.join(HERE, "doneru_supporters.py")
    src = open(src_path, encoding="utf-8").read()
    print("\n=== 対照（壊した写しで回して、狙った行が落ちるか）===")

    def run(box: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, os.path.abspath(__file__)],
            env={**os.environ, "DONERU_SRC_DIR": box},
            capture_output=True, text=True,
        )

    # **まず「壊していない写し」が通ること。** 写す途中で壊れても終了コードは
    # 同じなので、ここを見ないと対照にならない（#99）
    box = tempfile.mkdtemp(prefix="doneru-src-")
    for f in os.listdir(HERE):
        if f.endswith(".py"):
            shutil.copy2(os.path.join(HERE, f), box)
    clean = run(box)
    shutil.rmtree(box, ignore_errors=True)
    ck("壊していない写しは通る", clean.returncode == 0,
       f"終了コード {clean.returncode}")

    missing = []
    for what, frm, to, want in BREAKS:
        if frm not in src:
            missing.append(what)
            print(f"  ✕ {what}: 壊す字が doneru_supporters.py に無い")
            continue
        box = tempfile.mkdtemp(prefix="doneru-src-")
        for f in os.listdir(HERE):
            if f.endswith(".py"):
                shutil.copy2(os.path.join(HERE, f), box)
        with open(os.path.join(box, "doneru_supporters.py"), "w",
                  encoding="utf-8") as fh:
            fh.write(src.replace(frm, to, 1))
        got = run(box)
        shutil.rmtree(box, ignore_errors=True)
        hit = re.search(rf"^  NG   {re.escape(want)}:", got.stdout, re.M)
        ck(f"{what} → 「{want}」が落ちる",
           got.returncode == 1 and bool(hit),
           f"終了コード {got.returncode} / その行が落ちた: {bool(hit)}")

    if missing:
        # **本物の数字を1つも出さずに 2。** 壊す字が当たらない対照は、
        # 何も測っていないのと同じ
        print(f"\n✕ 壊す字が当たらなかった対照が {len(missing)}件: "
              f"{', '.join(missing)}")
        print("  本体の形が変わっています。対照の字を直してから読むこと。")
        return 2
    return 0


def main() -> int:
    print("=== 毎晩の側が、空のままの firstSeenAt を拾うか"
          "（本番には1バイトも出ない）===")
    m = load()
    cases(m)
    if CONTROL:
        rc = controls()
        if rc == 2:
            return 2
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)}件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
