"""しっぽを落とした形で**本当に当たるか**を、作り物の名簿で両側から当てる。

    python3 python/name_tail_selftest.py

終了コード:

  0 … 当たるものが当たり、当たってはいけないものが当たらなかった
  1 … どちらかが外れた
  2 … **確かめられなかった**（OBS 側の本物を動かせない、など）

**本番にも資格情報にも触らない。** Firestore も BigQuery も口も要らない。

## なぜ要るのか

しっぽを落として呼び名に足す（`python/admin/tail_alias.py`）と、
**引ける字が増える。増えるということは、別人にも当たりやすくなる。**
当たるほうだけを見て通すと、**何にでも当たる道具**が通ってしまう。

だから、当たってはいけないものを先に並べる。

  - 落としてはいけないしっぽ（`-chan` のような本人の字、西暦、短すぎる残り）
  - 呼び名を足す**前**の名簿（足したから当たるようになった、と言えること）

## 「両方で当たる」を、両方で見る

同じ「誰の絵か」を**2つの道が別の欄から引いている**
（`python/admin/alertbox_names.py` の表）。

| 誰が引くか | 何を見るか | ここでの確かめかた |
| --- | --- | --- |
| 口（`GET /characters/lookup?alias=`） | `lookupKeys` | `keys_of()`（口の `keysOf` の写し） |
| 配信の OBS（`app/alertbox`） | `channelName` と `aliases` の生の字 | **本物の `matching.utils.ts` を動かす** |

OBS 側は写しを作らない。**写しを写しで確かめても、揃って間違える。**
`node` と `typescript` が見つからなければ、**通ったことにせず 2 で落ちる。**
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "admin"))

# `_fs` が読む `config.py` は、この環境変数が無いと import の時点で落ちる。
# 偽物しか触らないので**本物の名前は要らない**。手元の値は上書きしない
os.environ.setdefault("BQ_PROJECT_ID", "name-tail-selftest")

from alertbox_names import keys_of, norm_key  # noqa: E402
from name_tail import MIN_BASE, strip_tail  # noqa: E402

# ------------------------------------------------------------ 作り物の名簿
#
# **本物の名前は1つも使わない。** 絵文字は1人1つで、当たった人を
# 名前ではなく絵文字で見分けるために付けてある。

PEOPLE = [
    # (絵文字, チャンネル名, しっぽを落とせるか)
    ("🐟", "@ぬまのぬし1234", True),    # 数字ちょうど4桁
    ("🐈", "@Kuroneko-t2f", True),      # `-` ＋ 3字（英字と数字が混じる）
    ("🍊", "@mikan-chan", False),       # `-chan` は本人の字
    ("🐙", "@たこ1234", False),          # 落とすと2字。短すぎる
    ("🌅", "@sora2024", False),         # 西暦に見える
    ("🍰", "@keiki-a1b2c", True),       # `-` ＋ 5字
]

# ぶつかる名簿。**しっぽを落とした字を、別の人がもう持っている**
CLASH = [
    ("🐟", "@ぬまのぬし1234", True),
    ("🦆", "ぬまのぬし", False),         # 落とした字と同じ名前の別人
]

FAILED: list = []
BLOCKED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def chars(people, extra=None) -> list:
    """口が OBS に返す形（`AlertboxCharacter[]`）に組む。

    Args:
        people: 上の PEOPLE / CLASH
        extra: 絵文字 -> 足す呼び名の一覧（しっぽを落としたもの）

    Returns:
        OBS に渡す名簿
    """
    extra = extra or {}
    out = []
    for i, (emoji, channel, _) in enumerate(people):
        out.append({
            "id": f"doc{i}",
            "emoji": emoji,
            "channelName": channel,
            "aliases": list(extra.get(emoji) or []),
            "plain": None,
            "scene": None,
        })
    return out


def api_hit(people, extra, typed: str):
    """口の側で当てる。**`lookupKeys` に完全一致**（`findBy`）。

    Returns:
        当たった1人の絵文字。0人でも2人以上でも None
        （`findBy` が `limit(2)` で「2人なら決めない」なのと同じ）
    """
    want = norm_key(typed)
    hit = []
    for emoji, channel, _ in people:
        names = [channel] + list((extra or {}).get(emoji) or [])
        if want in keys_of(names):
            hit.append(emoji)
    return hit[0] if len(hit) == 1 else None


def obs_hits(cases) -> list:
    """**本物の `app/alertbox/matching.utils.ts`** を動かして当てる。

    Args:
        cases: [{"id":…, "chars":[…], "typed": "…"}]

    Returns:
        当たった絵文字の一覧（順番は cases と同じ）。動かせなければ None
    """
    repo = os.path.dirname(HERE)
    roots = [repo]
    try:
        # worktree から回したとき、node_modules は本体側にしかない。
        # **場所を直書きしない**（`island-misses.md` #131）
        common = subprocess.run(
            ["git", "-C", repo, "rev-parse", "--path-format=absolute",
             "--git-common-dir"],
            capture_output=True, text=True, timeout=20, check=False,
        ).stdout.strip()
        if common:
            roots.append(os.path.dirname(common))
    except (OSError, subprocess.SubprocessError):
        pass
    node_path = os.pathsep.join(
        os.path.join(r, "node_modules") for r in roots)

    src = os.path.join(repo, "app", "alertbox", "matching.utils.ts")
    if not os.path.isfile(src):
        BLOCKED.append("matching.utils.ts が見つからない")
        return None
    harness = r"""
const fs = require("fs");
const ts = require("typescript");
const js = ts.transpileModule(fs.readFileSync(process.argv[2], "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS,
                     target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, require);
const cases = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
console.log(JSON.stringify(cases.map((c) => {
  const hit = m.exports.matchViewerByNickname(
    m.exports.toViewers(c.chars), c.typed);
  return hit ? hit.emoji : null;
})));
"""
    tmp = os.environ.get("TMPDIR") or "/tmp"
    hpath = os.path.join(tmp, "_name_tail_harness.js")
    cpath = os.path.join(tmp, "_name_tail_cases.json")
    with open(hpath, "w", encoding="utf-8") as f:
        f.write(harness)
    with open(cpath, "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False)
    env = dict(os.environ, NODE_PATH=node_path)
    try:
        r = subprocess.run(["node", hpath, src, cpath], env=env,
                           capture_output=True, text=True, timeout=120,
                           check=False)
    except (OSError, subprocess.SubprocessError) as e:
        BLOCKED.append(f"node を動かせない（{type(e).__name__}）")
        return None
    if r.returncode != 0:
        # **「動かなかった」を「当たらなかった」と同じ顔にしない**
        why = (r.stderr.strip().splitlines() or [""])[-1][:120]
        BLOCKED.append("node が落ちた: " + why)
        return None
    return json.loads(r.stdout)


def main() -> None:
    print("[1] しっぽの見分け（落とすもの・落とさないもの）")
    for emoji, channel, tailed in PEOPLE:
        got = strip_tail(channel)
        ck(f"{emoji} {'落とす' if tailed else '落とさない'}",
           bool(got) == tailed, "落とした" if got else "落とさない")

    # しっぽを落とした形を、呼び名として足した名簿
    extra = {}
    typed = {}
    for emoji, channel, tailed in PEOPLE:
        got = strip_tail(channel)
        if got:
            extra[emoji] = [got[0]]
            typed[emoji] = got[0]

    print("\n[2] 足す**前**は、どちらの道でも当たらない（対照）")
    before = []
    for emoji, t in typed.items():
        ck(f"{emoji} 口では当たらない", api_hit(PEOPLE, None, t) is None,
           api_hit(PEOPLE, None, t) or "当たらない")
        before.append({"chars": chars(PEOPLE), "typed": t})
    got = obs_hits(before)
    if got is None:
        print("    ！ OBS 側の本物を動かせませんでした")
    else:
        for (emoji, _), g in zip(typed.items(), got):
            ck(f"{emoji} OBS でも当たらない", g is None, g or "当たらない")

    print("\n[3] 足した**あと**は、口でも OBS でも、その人に当たる")
    after = []
    for emoji, t in typed.items():
        ck(f"{emoji} 口で当たる", api_hit(PEOPLE, extra, t) == emoji,
           api_hit(PEOPLE, extra, t) or "当たらない")
        after.append({"chars": chars(PEOPLE, extra), "typed": t})
    got = obs_hits(after)
    if got is None:
        print("    ！ OBS 側の本物を動かせませんでした")
    else:
        for (emoji, _), g in zip(typed.items(), got):
            ck(f"{emoji} OBS で当たる", g == emoji, g or "当たらない")

    print("\n[4] 落とさないと決めたものは、落とした字で当たらない（対照）")
    off = []
    for emoji, channel, tailed in PEOPLE:
        if tailed:
            continue
        # しっぽの規則が緩んだら**ここが当たりはじめる**。
        # 人が打ちそうな「人の部分」を、こちらで作って当ててみる
        guess = channel.lstrip("@").rsplit("-", 1)[0].rstrip("0123456789")
        ck(f"{emoji} 口で当たらない", api_hit(PEOPLE, extra, guess) is None,
           api_hit(PEOPLE, extra, guess) or "当たらない")
        off.append((emoji, {"chars": chars(PEOPLE, extra), "typed": guess}))
    got = obs_hits([c for _, c in off])
    if got is None:
        print("    ！ OBS 側の本物を動かせませんでした")
    else:
        for (emoji, _), g in zip(off, got):
            ck(f"{emoji} OBS でも当たらない", g is None, g or "当たらない")

    print("\n[5] 短すぎる残りは作らない（下限 %d 字）" % MIN_BASE)
    ck("下限より1字短いものは作らない",
       strip_tail("@" + "あ" * (MIN_BASE - 1) + "1234") is None,
       strip_tail("@" + "あ" * (MIN_BASE - 1) + "1234") or "作らない")
    ck("下限ちょうどなら作る",
       strip_tail("@" + "あ" * MIN_BASE + "1234") is not None,
       "作る")

    print("\n[6] 落とした字を別人がもう持っている名簿では、"
          "その字は**2人**に当たる（だから足してはいけない）")
    got = strip_tail(CLASH[0][1])
    if not got:
        # ここまでで [1] が落ちているはず。**落ちたまま先へ進んで
        # 例外で終わらない**（例外だと「何が外れたか」が消える）
        ck("ぶつかる名簿のしっぽが落とせる", False, "落とせない")
        print()
        raise SystemExit(1)
    base = got[0]
    both = {CLASH[0][0]: [base]}
    ck("口が決められない（2人に当たる）",
       api_hit(CLASH, both, base) is None, "決めない")
    got = obs_hits([{"chars": chars(CLASH, both), "typed": base}])
    if got is None:
        print("    ！ OBS 側の本物を動かせませんでした")
    else:
        # OBS は「並んでいるものを順に見る」ので**先に並んだ人**に当たる。
        # 当たった先が正しいかではなく、**2人が同じ字を持つ形になること**が
        # ここで見たいこと。足さなければ、この形にならない
        ck("OBS は先に並んだ人に当たってしまう", got[0] is not None,
           got[0] or "当たらない")

    print("\n[7] **空白の入った打ちかた**は、OBS では当たり、口では当たらない")
    # 実際に来た形: チャンネル名は空白なしのハンドル、打たれたのは空白入り。
    # OBS は `Intl.Collator` の `ignorePunctuation` で空白を無視するので、
    # しっぽを落とした呼び名に**空白入りでも当たる。**
    # 口（`findBy`）は `lookupKeys` の**完全一致**なので当たらない。
    # **この差は `python/admin/alertbox_names.py` が数えている食い違いそのもの。**
    # 口が空白も畳むように変わったら、ここと向こうを同じ日に直す
    spaced = [("🦔", "@harinezumiv1357", "harinezumi v")]
    sp_people = [(e, c, True) for e, c, _ in spaced]
    sp_got = strip_tail(spaced[0][1])
    if not sp_got:
        ck("空白の例のしっぽが落とせる", False, "落とせない")
        print()
        raise SystemExit(1)
    sp_base = sp_got[0]
    sp_extra = {spaced[0][0]: [sp_base]}
    ck("口では当たらない（完全一致）",
       api_hit(sp_people, sp_extra, spaced[0][2]) is None, "当たらない")
    got = obs_hits([{"chars": chars(sp_people, sp_extra),
                     "typed": spaced[0][2]}])
    if got is None:
        print("    ！ OBS 側の本物を動かせませんでした")
    else:
        ck("OBS では当たる（空白を無視する）", got[0] == spaced[0][0],
           got[0] or "当たらない")

    print()
    if BLOCKED:
        print("！ 確かめられませんでした: " + " / ".join(BLOCKED))
        print("  `npm ci` をリポジトリ直下で1回通すと動きます")
        raise SystemExit(2)
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
