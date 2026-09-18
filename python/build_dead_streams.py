"""**押しても戻らない配信を測って、`python/data/dead_streams.json` に写す。**

    python3 python/build_dead_streams.py            測って写す（25〜30分）
    python3 python/build_dead_streams.py --dry-run  測るが、書かない
    python3 python/build_dead_streams.py --ids AAA  渡した id だけ足し引きする（対照用）

終了コード 0=測れた / **2=測れなかった**（対照が外れた・1本も測れなかった）。

焼くスクリプトはここの `blocked()` を読んで、**その id を焼き込みに入れない。**
測るところは `python/dead_stream_watch.py` に在るものをそのまま借りる。
**判定器を2つ持たない**——見張りと焼き込みが違う目で見ていたら、
見張りが「0本」と言っている晩に焼き込みだけ死にリンクを持てる。

## なぜ取り置き（JSON）に写すか

見張りは 719本を1本ずつ当てるので **25〜30分**かかる。
毎晩の焼き直し（`.github/workflows/rebake.yml`）は7本のスクリプトを順に回すもので、
そこに30分の外への当て物を足すと、**焼き直しそのものが YouTube の機嫌で落ちる。**
焼き込みは「BigQuery に入っているところまで」を焼くのが仕事で、
**外の相手が返事をしない晩に止まってよいものではない。**

だから測るのはここ1か所にして、答えだけを JSON に置く。焼くほうは JSON を読む。

**取り込みの `videos` 表の `SKIPPED` / `FAILED` は使えない。** あれは
「チャットが取れたか」であって「押して見られるか」ではない。
`_Azl32caALw` は `SKIPPED` だが**動画は見られる**し、逆に取り込めている配信が
あとから消されることもある。**別のことを数えた数字を流用しない。**

## 置くのは「戻らないもの」だけ（`docs/island-misses.md` #139 の決めごと2）

| 種類 | 戻るか | ここに置くか |
| --- | --- | --- |
| `PRIVATE`（403。非公開・限定公開・メンバー限定） | **あやとが戻せる** | **置かない** |
| `LOGIN`（401。ログインが要る） | 戻せる見込み | **置かない** |
| `GONE`（404。消えている） | 戻らない | 置く |
| `NO_REC`（録画そのものが無い） | 戻らない | 置く |

**戻るものを取り置きに書くと、公開に戻した日に片方だけ古くなる。**
#339 が「先に仕組みを入れると、戻したときに逆に隠れる」と言って1週間止まっていたのは
そこ。戻らないものだけを持てば、その心配は構造から消える——
**404 と「録画が無い」は、あとから戻ることがない。**
取り置きが古くても、**隠しすぎることは起きない**（起きるのは「新しく死んだぶんを
まだ知らない」だけで、それは次に測ったときに入る）。

## 測り直しても消えないようにする（取りこぼしではなく、行ったり来たりを止める）

焼き込みから外した配信は、**次に島を scan したときにはもう出てこない。**
そのまま「見つからなかったから外す」と書き直すと、翌晩の焼き直しで
また焼き込みに入り、その次にまた消える——**1日おきに死にリンクが出る島**になる。

だから測る相手は **いま島に出ている id ∪ すでに取り置きに在る id**。
すでに在るものは毎回もう一度当て直して、

- まだ戻らない → そのまま置く（`since` は最初に見つけた日のまま）
- **押せるようになっていた**、または**戻せるほう（403 / 401）に変わっていた**
  → 外す。隠す相手ではなくなっている
- **測れなかった（`BLIND`）／見たことのない返り（`OTHER`）** → **外さない。**
  届かなかっただけかもしれない
  （`docs/island-standards.md` §10「読めていないことを、値0と同じ絵にしない」）

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
JSON にも印字にも出すのは**配信ID・日付・種類・件数**だけ。
題名も、視聴者さんの名前も、チャンネルIDも書かない。
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dead_stream_watch as watch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "data" / "dead_streams.json"

# 焼き込みから外してよい種類。**戻るもの（403 / 401）は入れない**
FOREVER = watch.FOREVER

NOTE = (
    "押しても戻らない配信。python/build_dead_streams.py が測って書く。"
    "**手で足さない。** 焼くスクリプトはここに在る id を焼き込みに入れない。"
)
NOTE_KIND = (
    "GONE=消えている（404） / NO_REC=録画そのものが無い。"
    "**戻るもの（403 非公開・401 ログインが要る）はここに入れない。**"
    "あやとが公開に戻した日に、島が知らないまま隠し続けることになるため。"
)


def load(path: Path = OUT) -> dict:
    """取り置きを読む。**無ければ投げる。**

    「ファイルが無いから0本」で通すと、**死にリンクを黙って焼き込みに入れる。**
    これはリポジトリに入っているファイルなので、無いのは壊れている印
    （`docs/island-standards.md` §10）。
    """
    if not path.exists():
        raise FileNotFoundError(
            f"{path} がありません。python/build_dead_streams.py を回して作ってください"
        )
    got = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(got, dict) or not isinstance(got.get("ids"), dict):
        raise ValueError(f"{path} の形が読めません（ids が要ります）")
    return got


def blocked(path: Path = OUT) -> set[str]:
    """**焼き込みに入れてはいけない配信ID。** 焼くスクリプトはこれを読む。"""
    return set(load(path)["ids"])


def sql_not_in(col: str, path: Path = OUT) -> str:
    """SQL に差す `AND <col> NOT IN (...)`。1本も無ければ空の字を返す。

    **SQL の側で外すのは、外したぶんを次点が埋めてほしいところ。**
    「1年前の今日」は日ごとに1本しか焼かないので、Python 側で落とすと
    **その日が年表から消える。** SQL で外せば、同じ日の2番目が代表になる
    （配信が1本見られないことと、その日に何かがあったことは別のこと）。

    id は11字の英数字だけなので、そのまま埋めても字が壊れない。
    念のため形を確かめてから埋める。
    """
    ids = sorted(blocked(path))
    bad = [v for v in ids if not watch.ID_RE.fullmatch(v)]
    if bad:
        raise ValueError(f"配信IDの形（11字）でないものが取り置きに在ります: {' '.join(bad)}")
    if not ids:
        return ""
    return f"AND {col} NOT IN (" + ", ".join(f"'{v}'" for v in ids) + ")"


def check_written(text: str, where: str, path: Path = OUT) -> None:
    """**焼いたものに、外したはずの配信が残っていないか。** 残っていたら落とす。

    外す仕掛けは入力の側にあるので、入力の形が変わると**黙って効かなくなる**
    （落ちないし、赤くもならない。死にリンクがそのまま master に入る）。
    出口でもう一度、書いた字そのものを見る。ここは毎晩の焼き直しの中で回るので、
    繋ぎ忘れようがない（`docs/island-misses.md` #125）。
    """
    left = sorted(v for v in blocked(path) if v in text)
    if left:
        raise SystemExit(
            f"{where} に、押しても見られない配信が {len(left)}本 残っています: {' '.join(left)}"
        )


def save(ids: dict[str, dict], path: Path = OUT) -> None:
    """**並びを決めて書く。** 毎回同じ入力なら同じ字面になるようにする。"""
    body = {
        "_note": NOTE,
        "_kind": NOTE_KIND,
        "_measured": date.today().isoformat(),
        "ids": {k: ids[k] for k in sorted(ids)},
    }
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def merge(before: dict[str, dict], probes: dict[str, watch.Probe], today: str) -> tuple[dict, list, list, list]:
    """測った結果を、前の取り置きに重ねる。返すのは (あと, 足した, 外した, 測れなかった)。"""
    after: dict[str, dict] = {}
    added: list[str] = []
    dropped: list[str] = []
    blind: list[str] = []
    for vid, p in sorted(probes.items()):
        was = before.get(vid)
        if p.kind in FOREVER:
            after[vid] = {"kind": p.kind, "since": (was or {}).get("since", today)}
            if not was:
                added.append(vid)
        elif p.kind in (watch.BLIND, watch.OTHER):
            # **測れなかった／見たことのない返り。在るものは外さない。**
            # 無いものは足さない。届かなかっただけかもしれない
            # （`docs/island-standards.md` §10）
            blind.append(vid)
            if was:
                after[vid] = was
        elif was:
            # 押せるようになっていた（`OK`）か、**戻せるほう（403 / 401）に変わった。**
            # どちらも取り置きから外す——隠す相手ではなくなっている
            dropped.append(f"{vid}（{p.kind}）")
    return after, added, dropped, blind


def main() -> int:
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    before = load()["ids"] if OUT.exists() else {}

    if "--ids" in argv:
        rest = argv[argv.index("--ids") + 1:]
        vids = [x for x in rest if watch.ID_RE.fullmatch(x)]
        odd = [x for x in rest if not watch.ID_RE.fullmatch(x)]
        if odd:
            print(f"配信IDの形（11字）でないものが混ざっています: {' '.join(odd)}", file=sys.stderr)
            return 2
        if not vids:
            print("--ids のあとに配信IDを並べてください", file=sys.stderr)
            return 2
        cand = sorted(set(vids) | set(before))
        print(f"--ids で渡された {len(vids)}本と、取り置きの {len(before)}本を測ります")
    else:
        seen, files = watch.scan_dir(watch.CONTENT)
        if not seen:
            print(f"数えるものがありません（{watch.CONTENT} の *.ts に配信IDが1本もない）",
                  file=sys.stderr)
            return 2
        cand = sorted(set(seen) | set(before))
        print(f"島が名指ししている配信 {len(seen)}本（焼き込み {len(files)}本）と、"
              f"取り置きの {len(before)}本。合わせて {len(cand)}本を測ります")

    # **本物を測る前に、両側から当てる**（`dead_stream_watch.py` のものをそのまま借りる）。
    # ここが外れたら、「1本も見つからなかった」のか「届かなかった」のかが分けられない
    ok, lines = watch.run_control(deep=True)
    print("対照（本物を測る前に、両側から当てる）")
    for line in lines:
        print(line)
    print()
    if not ok:
        print("::error::対照が外れました。取り置きは1バイトも書き換えません", file=sys.stderr)
        return 2

    probes = watch.probe_all(cand, deep=True, quiet=False)
    if len(probes) != len(cand):
        # **渡したものと測ったものの数を、必ず突き合わせる**（#139 の決めごと7）
        print(f"::error::{len(cand)}本を渡したのに {len(probes)}本しか測っていません", file=sys.stderr)
        return 2

    today = date.today().isoformat()
    after, added, dropped, blind = merge(before, probes, today)

    n: dict[str, int] = {}
    for p in probes.values():
        n[p.kind] = n.get(p.kind, 0) + 1
    print(f"測った {len(probes)}本")
    for kind in (watch.OK, watch.PRIVATE, watch.LOGIN, watch.GONE, watch.NO_REC,
                 watch.OTHER, watch.BLIND):
        print(f"  {watch.LABEL[kind]:<40} {n.get(kind, 0):>4}本")
    print()
    curable = sum(n.get(k, 0) for k in watch.CURABLE)
    print(f"取り置きに置く（戻らない）: {len(after)}本"
          f"（足した {len(added)} / 外した {len(dropped)} / 測れず {len(blind)}）")
    print(f"取り置きに置かない（あやとが戻せる）: {curable}本"
          "——公開に戻せばひとりでに島へ戻るので、隠さない")
    for vid in added:
        print(f"  足した  {vid}  {after[vid]['kind']}")
    for vid in dropped:
        print(f"  外した  {vid}  隠す相手ではなくなった")
    if blind:
        print(f"  測れなかった {len(blind)}本: {', '.join(blind[:5])}")

    if dry:
        print("\n※ --dry-run。取り置きは書き換えていません")
        return 0
    save(after)
    print(f"\n{OUT} に {len(after)}本を書きました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
