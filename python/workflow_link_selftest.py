"""**ワークフローの繋ぎ（`workflow_run`）が、実在する `name:` を指しているか**を島ぜんぶで見る。

    python3 python/workflow_link_selftest.py

読むのは `.github/workflows/*.yml` だけ。ネットワークも認証も鍵も要らない。

## なぜ要るか

`CLAUDE.md` にこう書いてある。

> **繋ぎはワークフローの `name:` で解決される。** あちらの名前を変えると
> 黙って切れる。**赤くならない。走らなくなるだけ。**

黙って切れるものは、**切れたことが誰にも届かない。** 毎晩ひとりでに走ってほしい
ものほど `workflow_run` で繋いであるので（cron はこのリポジトリでは1時間49分〜
3時間32分遅れる。古参2本しか実績が無い）、切れると「焼き直しが止まっている」
「issue が開かない」という**遠いところ**で、何日か経ってから出る。

見張り自体は在った。**ただし、per-workflow だった。**

| 繋ぎを持つワークフロー | それを名指しして繋ぎ先を見ている見張り |
| --- | --- |
| `backup.yml` | `backup_drill_selftest.py` |
| `bake_down.yml` | `bake_down_selftest.py` |
| `channel_alias_nightly.yml` | `channel_alias_nightly_selftest.py` |
| `donor_calls.yml` | **無し** |
| `failed_reentry_nightly.yml` | `failed_reentry_nightly_selftest.py` |
| `ingest_down.yml` | **無し** |
| `rebake.yml` | （3本が横から見ている） |
| `ship_down.yml` | `ship_down_selftest.py` |
| `ticket_stock.yml` | **無し** |
| `tips_after_doneru.yml` | **無し** |

（2026-09-19 の実測。繋ぎを持つ10本のうち4本が見られていなかった）

**問題は「4本抜けている」ことではない。見方が per-workflow なことのほう。**
新しく繋ぎを足した人は、自分用の見張りも書かないと見られない——つまり
**既定が「見られていない」**になっている。ここは全部のワークフローを読むので、
**新しい繋ぎは足した瞬間から見られる。** 既定が逆になる。

**あちらは消さない。** per-workflow の見張りは「自分の繋ぎ先が *その特定の1本* か」
まで見ていて、こちらより細かい（こちらが見るのは「実在する名前か」だけで、
**正しい相手か**は見ていない）。重なっていてよい。

## 何を見るか

1. `.github/workflows/*.yml` を全部読む
2. `on.workflow_run.workflows` に並んでいる名前を、繋ぎ1本ずつに開く
3. その名前が、**実在するワークフローの `name:`** かを当てる
   （`name:` を書いていないワークフローは、GitHub では**ファイルの道**が
   名前になるので、そちらでも引けるようにしてある）

外れていたら、**どのファイルの、どの繋ぎ先が、どう無いか**を1行で出す。
名前のよく似たものが在れば添える——切れるのはたいてい1文字なので、
「無い」だけだと、どこを直すのかが分からない。

## `on:` を読み落とさない

PyYAML は `on:` を**真偽値の `True`** として読む（YAML 1.1 の名残）。
`doc.get("on")` だけ書くと**繋ぎが0本に見えて**、この見張りは何も挙げずに緑になる。
**測れていないものが、いちばん合格に見える形**（`docs/island-standards.md` §15）。

だから2つ置いてある。

- 読むほうは `doc.get("on")` と `doc.get(True)` の**両方**を見る
- **繋ぎが0本なら 0 ではなく 2 を返す**（数えるものが無い＝測れていない）

対照 [5] が、わざと `doc.get("on")` しか見ない読み方で回して、
**0本になること**と、**そのとき 2 に倒れること**を毎回見ている。

## 対照（`docs/island-standards.md` §15）

| | 食わせるもの | 欲しい答え |
| --- | --- | --- |
| 1 | いまのリポジトリ | 挙がるものが**無い**（繋ぎは1本以上ある） |
| 2 | どこかの `name:` を**1文字変えた**写し | **そこを指している繋ぎだけ**が挙がる |
| 3 | 繋ぎを1本も持たない写し | **2**（0件を「通った」にしない） |
| 4 | `workflow_run` を持たないワークフローだけの写し | 挙がらない（何にでも赤を出さない） |
| 5 | `on:` を `doc.get("on")` だけで読む写し | 繋ぎが**0本**に見え、**2**に倒れる |

2 は「落ちること」だけでなく、**落ちる先が狙ったぶんだけ**かを見る。
道連れで他の繋ぎまで落ちる対照は、死んだ足を隠す（`docs/island-misses.md` #128）。

終了コード 0=通った / 1=見つかった / **2=数えるものが無い**。
"""

from __future__ import annotations

import copy
import difflib
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
WFDIR = REPO / ".github" / "workflows"


def triggers(doc: dict, quirk: bool = False) -> dict:
    """`on:` の中身。**`True` でも引く。**

    PyYAML は `on:` を真偽値として読むので、`doc.get("on")` だけだと
    ほとんどのワークフローで空になる。

    @param quirk 対照の足。`True` にすると**読み落とす側**（`doc.get("on")` だけ）
      になる。ここを外して繋ぎが0本に見えることを、[5] で毎回確かめている。
    """
    if not isinstance(doc, dict):
        return {}
    on = doc.get("on")
    if not quirk and not isinstance(on, dict):
        on = doc.get(True)
    return on if isinstance(on, dict) else {}


def wanted(doc: dict, quirk: bool = False) -> list[str]:
    """そのワークフローが繋いでいる先の名前。`workflows:` は字1つでも書ける。"""
    wr = triggers(doc, quirk).get("workflow_run")
    if not isinstance(wr, dict):
        return []
    ws = wr.get("workflows")
    if isinstance(ws, str):
        return [ws]
    return [w for w in (ws or []) if isinstance(w, str)]


def name_of(path: str, doc: dict) -> str:
    """そのワークフローの名前。**`name:` が無ければファイルの道**（GitHub の決まり）。"""
    n = doc.get("name") if isinstance(doc, dict) else None
    return n if isinstance(n, str) and n.strip() else path


def audit(docs: dict[str, dict], quirk: bool = False) -> tuple[list[dict], int]:
    """繋ぎを1本ずつ当てる。→ (挙がったもの, 見た繋ぎの本数)

    **本数も返す。** 0件だったとき、それが「ぜんぶ通った」なのか
    「1本も見ていない」なのかは、挙がった側からは区別できない。

    挙がったものは `{"at": ファイル, "want": 指している名前, "row": 出す1行}`。
    **対照が突き合わせるのは `at` と `want` の組**で、1行の字ではない——
    添える「近いのは」は他のワークフローの名前で決まるので、
    **関係のないところを1文字変えただけで字が動く**（実際に動いた）。
    """
    names = {name_of(p, d) for p, d in docs.items()}
    found: list[dict] = []
    seen = 0
    for path in sorted(docs):
        for want in wanted(docs[path], quirk):
            seen += 1
            if want in names:
                continue
            near = difflib.get_close_matches(want, sorted(names), 1, 0.6)
            hint = f"。近いのは「{near[0]}」" if near else ""
            found.append({
                "at": path,
                "want": want,
                "row": f"{path} の workflow_run が「{want}」を指しているが、"
                       f"その name: のワークフローが無い{hint}",
            })
    return found, seen


def renamed(docs: dict[str, dict], path: str, new: str) -> dict[str, dict]:
    """1本の `name:` だけを変えた写し（対照）。"""
    out = copy.deepcopy(docs)
    out[path]["name"] = new
    return out


def unlinked(docs: dict[str, dict]) -> dict[str, dict]:
    """繋ぎを1本も持たない写し（対照）。"""
    out = copy.deepcopy(docs)
    for d in out.values():
        for key in ("on", True):
            on = d.get(key)
            if isinstance(on, dict):
                on.pop("workflow_run", None)
    return out


def verdict(rows: list[dict], seen: int) -> int:
    """0＝通った / 1＝見つかった / **2＝数えるものが無い**。"""
    if seen == 0:
        return 2
    return 1 if rows else 0


def main() -> int:
    wfs = sorted(WFDIR.glob("*.yml")) + sorted(WFDIR.glob("*.yaml"))
    if not wfs:
        print("!! ワークフローが1本も無い。数えるものが無い")
        return 2

    docs: dict[str, dict] = {}
    for wf in wfs:
        rel = wf.relative_to(REPO).as_posix()
        try:
            docs[rel] = yaml.safe_load(wf.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            print(f"!! {rel} が読めない: {e}")
            return 2

    rows, seen = audit(docs)
    linked = sorted(p for p in docs if wanted(docs[p]))
    print(f"見たワークフロー: {len(docs)}本 / 繋ぎを持つもの: {len(linked)}本 / 繋ぎ: {seen}本")
    for p in linked:
        print(f"   {p} → {' / '.join(wanted(docs[p]))}")
    print()

    ng = 0

    # [1] いまのリポジトリ。挙がるものが無いこと
    if seen == 0:
        # ここで落としておかないと、下の対照が全部「0件」で仲良く通る
        print("[1] !! 繋ぎ（workflow_run）が1本も無い。**数えるものが無い**")
        return 2
    if rows:
        print(f"[1] ✕ 行き先の無い繋ぎが {len(rows)}件")
        for r in rows:
            print(f"      {r['row']}")
        ng += 1
    else:
        print(f"[1] ○ 繋ぎ {seen}本、ぜんぶ実在する name: を指している")

    # 当て先は「いちばん多く指されている名前」。そこが切れたときの被害がいちばん大きい
    tally: dict[str, int] = {}
    for p in linked:
        for w in wanted(docs[p]):
            tally[w] = tally.get(w, 0) + 1
    target = max(sorted(tally), key=lambda w: tally[w])
    owner = next((p for p, d in docs.items() if name_of(p, d) == target), None)
    if owner is None:
        print(f"[2] !! 「{target}」を name: に持つファイルが無い。対照を回せない")
        return 2

    # [2] その1本の name: を1文字だけ変える。**そこを指している繋ぎだけ**が挙がること
    #
    # **元から挙がっているぶんは引く。** [1] が赤い日にここまで道連れで赤くすると、
    # 「この足が死んだのか、リポジトリが壊れているのか」が読めなくなる
    broke, bseen = audit(renamed(docs, owner, target[:-1]))
    元から = {(r["at"], r["want"]) for r in rows}
    added = [r for r in broke if (r["at"], r["want"]) not in 元から]
    want_pairs = {(p, target) for p in linked if target in wanted(docs[p])}
    got_pairs = {(r["at"], r["want"]) for r in added}
    if got_pairs == want_pairs and bseen == seen:
        print(f"[2] ○ {owner} の name: を1文字変えると、そこを指す {len(added)}本だけが挙がる"
              f"（{', '.join(sorted(p for p, _ in got_pairs))}）")
        print(f"      例: {added[0]['row']}")
    else:
        print(f"[2] ✕ 1文字変えたのに 増えたのは {sorted(got_pairs)}"
              f"（{sorted(want_pairs)} のはず）／見た繋ぎ {bseen}（{seen} のはず）")
        ng += 1

    # [3] 繋ぎを1本も持たない写し。**0件を「通った」にしない**
    none_rows, none_seen = audit(unlinked(docs))
    if verdict(none_rows, none_seen) == 2:
        print("[3] ○ 繋ぎが0本なら 2（数えるものが無い）に倒れる")
    else:
        print(f"[3] ✕ 繋ぎ0本で {verdict(none_rows, none_seen)} を返した。**0件が合格に化ける**")
        ng += 1

    # [4] 繋ぎを持たないワークフローだけ。何にでも赤を出すものではないこと
    if none_rows:
        print(f"[4] ✕ 繋ぎの無いワークフローにも赤を出した（{len(none_rows)}件）")
        ng += 1
    else:
        print("[4] ○ 繋ぎの無いワークフローには何も言わない")

    # [5] `on:` を読み落とす側で回す。**そこを踏むと繋ぎが0本に見える**こと
    quirk_rows, quirk_seen = audit(docs, quirk=True)
    if quirk_seen < seen and verdict(quirk_rows, quirk_seen) == 2:
        print(f"[5] ○ `doc.get(\"on\")` だけで読むと繋ぎが {seen} → {quirk_seen}本に化け、"
              "そのとき 2 に倒れる")
    else:
        print(f"[5] ✕ 読み落とす側でも繋ぎが {quirk_seen}本（{seen}本から減っていない）。"
              "この足は何も見ていない")
        ng += 1

    print()
    if ng:
        print(f"!! 落ちた項目が {ng} あります")
        return 1
    print("○ ぜんぶ通った")
    return verdict(rows, seen)


if __name__ == "__main__":
    sys.exit(main())
