"""**押しても戻らない配信を測って、`python/data/dead_streams.json` に写す。**
**そのついでに、「増えたぶんだけ」を毎晩知らせる。**

    python3 python/build_dead_streams.py             測って写す（毎晩ぶん。7〜10分）
    python3 python/build_dead_streams.py --dry-run   測るが、書かない
    python3 python/build_dead_streams.py --no-deep   1段目だけ（速い。**書かない**）
    python3 python/build_dead_streams.py --ids AAA   渡した id だけ足し引きする（対照用）
    python3 python/build_dead_streams.py --data-dir 写し   別の置き場を読み書きする（対照用）

終了コード:

    0 … 測れた。**知らなかった「見られない配信」は増えていない**
    1 … **知らなかった配信が見られなくなった。** 人が見て決める必要がある
    2 … 測れなかった（対照が外れた・1本も測れなかった）。**どちらの JSON も書かない**

焼くスクリプトはここの `blocked()` を読んで、**その id を焼き込みに入れない。**
測るところは `python/dead_stream_watch.py` に在るものをそのまま借りる。
**判定器を2つ持たない**——見張りと焼き込みが違う目で見ていたら、
見張りが「0本」と言っている晩に焼き込みだけ死にリンクを持てる。

## 書き出しは2つ。**役目が違う**

| | 何が入るか | 誰が読むか |
| --- | --- | --- |
| `python/data/dead_streams.json` | **戻らないものだけ**（`GONE` `NO_REC`） | 焼くスクリプト（`blocked()`）。ここに在る id は焼き込みに入らない |
| `python/data/dead_watch_seen.json` | **もう知っている「見られない配信」ぜんぶ**（`PRIVATE` `LOGIN` も入る） | 毎晩の見張り。**ここに無い id が見られなくなった晩だけ赤くする** |

**一緒にしてはいけない。** 隠すほう（前者）に 403 を入れると、あやとが公開に
戻した日に島が知らないまま隠し続ける（`docs/island-misses.md` #139 の決めごと2）。
覚えるほう（後者）に 403 を入れないと、**あやとが戻すまで毎晩17本ぶら下がって
毎晩赤くなる。** 毎晩赤いものは「いつもの赤」になって、**本当に新しく1本
死んだ晩に見分けがつかない。**

## なぜ毎晩これを回せるようになったか

以前は 719本ぜんぶに2段目（`youtubei/v1/player`）を当てていて **25〜30分**
かかっていた。毎晩の焼き直しにそれを足すと、**焼き直しそのものが YouTube の
機嫌で落ちる。** だから「測るのは人が押したときだけ」にしていた。

2段目を**増えたぶんだけ**にしたので、毎晩ぶんは 7〜10分で終わる（下の
`pick_deep`）。1段目（oembed）は速い（719本で約4分）ので毎晩ぜんぶに当てる。
403 / 401 / 404 はそこで出る。

**焼き直しは道連れにしない。** `rebake.yml` 側で `continue-on-error` にして、
赤くするのは配り終わったうしろの step（`ognight.sh` と同じ形）。

**測るのはここ1か所。** 答えだけを JSON に置いて、焼くほうは JSON を読む。
見張りのために3つめの測りかたを書かない——**判定器が2つあると、
見張りが「0本」と言っている晩に焼き込みだけ死にリンクを持てる。**

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

## 毎晩の見張りが言うこと（`dead_watch_seen.json` のほう）

| その晩に起きたこと | どうするか |
| --- | --- |
| **知らなかった id が見られなくなった** | **赤くする**（1 を返す）。人が見て決める |
| 知っている id が、まだ見られない | 静か。毎晩言わない |
| **知っている id が見られるようになった**（あやとが戻した） | **赤くしない。ただし必ず一言残す**（「◯本もどりました」） |
| 知っている id が、島の焼き込みから消えた | 覚えから外す。一言残す |
| 測れなかった（`BLIND`） | **覚えから外さない。** 届かなかっただけかもしれない |

**戻った晩に黙って緑にしない。** 黙ると、あやとが戻したことに誰も気づかず、
「まだ隠れているのでは」と人が確かめに行くことになる。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
JSON にも印字にも出すのは**配信ID・日付・種類・件数・焼き込みのファイル名**だけ。
題名も、視聴者さんの名前も、チャンネルIDも書かない。
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dead_stream_watch as watch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
OUT = DATA / "dead_streams.json"

# **見張りが覚えておくほう。** 焼き込みから外す相手ではないので、
# 戻るほう（403 / 401）もここには入る。詳しくは頭の表
SEEN = DATA / "dead_watch_seen.json"

# 焼き込みから外してよい種類。**戻るもの（403 / 401）は入れない**
FOREVER = watch.FOREVER

# 見張りが覚えておく種類。**戻るほうも入る。**
# ここに無い id が見られなくなった晩だけ、run を赤くする
WATCHED = (watch.PRIVATE, watch.LOGIN, watch.GONE, watch.NO_REC, watch.OTHER)

# 2段目（`youtubei/v1/player`）を、何日たったら見直すか。
# **深く見た id も、いつまでも信じない。** 録画は配信のあとで消えることがあるし、
# YouTube の返しかたも変わる
DEEP_RECHECK_DAYS = 30

# 1晩に見直す本数の上限。**時間が読めるようにするため。**
# 2段目は毎秒 0.7本なので、40本で1分。上限を置かないと、種をまいた日から
# 30日たった晩に 700本ぶんがいっぺんに来て、その晩だけ 18分かかる。
# 古いものから順に取るので、上限で溢れたぶんは翌晩に回る
# （700本 ÷ 40本＝18晩で一周する。30日より短いので追いつく）
DEEP_RECHECK_MAX = 40

# 1晩に**初めて**深く見る本数の上限。ふつうは増えたぶん（数本）しか来ないが、
# 覚えの JSON が消えた朝はここに 700本が並ぶ。**そこで 18分ぶら下がらない。**
# 溢れたぶんは翌晩に回る（1段目は毎晩ぜんぶに当たっているので、
# 403 / 401 / 404 の見落としはここでは起きない）
DEEP_NEW_MAX = 60

NOTE = (
    "押しても戻らない配信。python/build_dead_streams.py が測って書く。"
    "**手で足さない。** 焼くスクリプトはここに在る id を焼き込みに入れない。"
)
NOTE_KIND = (
    "GONE=消えている（404） / NO_REC=録画そのものが無い。"
    "**戻るもの（403 非公開・401 ログインが要る）はここに入れない。**"
    "あやとが公開に戻した日に、島が知らないまま隠し続けることになるため。"
)

SEEN_NOTE = (
    "島が名指ししている配信のうち、押しても見られないと**もう知っている**ぶん。"
    "python/build_dead_streams.py が毎晩書く。**手で足さない。** "
    "ここに無い id が見られなくなった晩だけ、毎晩の焼き直しが赤くなる。"
)
SEEN_NOTE_KIND = (
    "PRIVATE=非公開（403） / LOGIN=ログインが要る（401） / GONE=消えている（404） / "
    "NO_REC=録画そのものが無い / OTHER=見たことのない返り。"
    "**戻るほう（PRIVATE / LOGIN）もここには入る。** "
    "隠すための表ではなく、見張りが「増えたぶんだけ」を言うための表なので。"
    "隠す相手は python/data/dead_streams.json のほう（戻らないものだけ）。"
)
SEEN_NOTE_DEEP = (
    "2段目（youtubei/v1/player）で「押せば見られる」と分かった日。"
    "毎晩ここに無い id と、30日たった id だけを深く見る。"
    "見られないもの・測れなかったものは載せない（毎晩見直すため）。"
)
SEEN_NOTE_SAFE = (
    "入れてよいのは 配信ID・種類・日付・焼き込みのファイル名 だけ。"
    "題名も、視聴者さんの名前も、チャンネルIDも書かない。"
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


# --- ここから下は「毎晩の見張り」のぶん -------------------------------------
#
# 覚えているのは `python/data/dead_watch_seen.json`。**隠す相手ではない。**
# 隠すほう（`dead_streams.json`）との違いは、頭の表に書いてある。


def load_seen(path: Path = SEEN) -> dict:
    """覚えを読む。**無ければ空。**

    隠すほう（`load()`）は無ければ投げるが、こちらは投げない。**向きが逆だから。**
    覚えが空だと「いま見られない17本がぜんぶ新顔」になって**赤くなる**ので、
    落とし方として安全な側に倒れる。隠すほうは逆で、空だと死にリンクを
    黙って焼き込みに入れてしまうから投げる。
    """
    if not path.exists():
        return {"ids": {}, "deep": {}}
    got = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(got, dict) or not isinstance(got.get("ids"), dict) \
            or not isinstance(got.get("deep"), dict):
        raise ValueError(f"{path} の形が読めません（ids と deep が要ります）")
    return {"ids": got["ids"], "deep": got["deep"]}


def save_seen(ids: dict[str, dict], deep: dict[str, str], path: Path = SEEN) -> None:
    """**並びを決めて書く。** 毎回同じ入力なら同じ字面になるようにする。"""
    body = {
        "_note": SEEN_NOTE,
        "_kind": SEEN_NOTE_KIND,
        "_deep": SEEN_NOTE_DEEP,
        "_privacy": SEEN_NOTE_SAFE,
        "_measured": date.today().isoformat(),
        "ids": {k: ids[k] for k in sorted(ids)},
        "deep": {k: deep[k] for k in sorted(deep)},
    }
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _age(day: str, today: str) -> int:
    """何日前に深く見たか。**読めない字は「うんと昔」**——見直す側に倒す。"""
    try:
        was = datetime.strptime(day, "%Y-%m-%d").date()
        now = datetime.strptime(today, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return 10 ** 6
    return (now - was).days


def pick_deep(live: list[str], deep_seen: dict[str, str], known_bad: set[str], today: str,
              recheck_days: int = DEEP_RECHECK_DAYS, recheck_max: int = DEEP_RECHECK_MAX,
              new_max: int = DEEP_NEW_MAX) -> list[str]:
    """**1段目が 200 と言った一覧から、今夜2段目に当てるぶんを選ぶ。**

    719本ぜんぶに当てると 18〜25分かかって、そのうち YouTube に締め出される。
    毎晩要るのは「増えたぶん」だけなので、3つに分けて取る。

    | 取るもの | なぜ | 上限 |
    | --- | --- | --- |
    | **もう「見られない」と知っているぶん** | ここを見ないと、`NO_REC` の id が1段目の 200 だけで「もどりました」に化ける。**行ったり来たりの元** | 無し（数本） |
    | まだ一度も深く見ていない | 焼き込みが毎晩増えるぶん | `new_max` |
    | 深く見てから `recheck_days` たった | **深く見た id も、いつまでも信じない** | `recheck_max`（古い順） |

    Args:
        live: 1段目が「押せば見られる」と言った配信ID
        deep_seen: 配信ID → 最後に深く見た日（`YYYY-MM-DD`）
        known_bad: もう「見られない」と知っている配信ID
        today: 今日（`YYYY-MM-DD`）

    Returns:
        今夜2段目に当てる配信ID。**`live` の中からしか返さない**
    """
    here = [v for v in live]
    must = [v for v in here if v in known_bad]
    rest = [v for v in here if v not in known_bad]
    fresh = sorted(v for v in rest if v not in deep_seen)[:new_max]
    stale = sorted((v for v in rest
                    if v in deep_seen and _age(deep_seen[v], today) >= recheck_days),
                   key=lambda v: (deep_seen[v], v))[:recheck_max]
    return sorted(set(must) | set(fresh) | set(stale))


def merge_seen(before: dict[str, dict], probes: dict[str, watch.Probe],
               tracked: set[str], today: str,
               files: dict[str, set] | None = None) -> tuple[dict, list, list, list, list, list]:
    """測った結果を、前の覚えに重ねる。

    Returns:
        (あと, 新しく見られなくなった, もどった, 種類が変わった, 島から外れた, 測れなかった)
    """
    after: dict[str, dict] = {}
    new: list[str] = []
    back: list[str] = []
    moved: list[str] = []
    gone: list[str] = []
    blind: list[str] = []
    for vid, p in sorted(probes.items()):
        was = before.get(vid)
        if p.kind in WATCHED:
            row = {"kind": p.kind, "since": (was or {}).get("since", today)}
            where = sorted((files or {}).get(vid) or [])
            if where:
                # **焼き込みのファイル名だけ。** どの面が行き止まりになるかは
                # これで決まる（`dead_stream_watch.py` の `FRONT`）。
                # 題名も名前も入れない
                row["files"] = where
            after[vid] = row
            if not was:
                new.append(f"{vid}（{p.kind}）")
            elif was.get("kind") != p.kind:
                moved.append(f"{vid}（{was.get('kind')}→{p.kind}）")
        elif p.kind == watch.BLIND:
            # **測れなかった。覚えからは外さない。** 届かなかっただけかもしれない
            # （`docs/island-standards.md` §10）
            blind.append(vid)
            if was:
                after[vid] = was
        elif was:
            # **押せるようになっていた。** あやとが戻したぶん。
            # 赤くはしないが、**黙って緑にもしない**（呼ぶ側が一言残す）
            back.append(f"{vid}（{was.get('kind')}→押せば見られる）")
    for vid, was in sorted(before.items()):
        if vid in after or vid in probes:
            continue
        if vid in tracked:
            after[vid] = was  # 測っていないものを、勝手に「もどった」にしない
        else:
            gone.append(vid)  # 島の焼き込みからも取り置きからも消えた
    return after, new, back, moved, gone, blind


def merge_deep(before_deep: dict[str, str], probed: list[str],
               probes: dict[str, watch.Probe], tracked: set[str], today: str) -> dict[str, str]:
    """深く見た日を重ねる。**「押せば見られる」と分かったものだけ覚える。**

    見られないもの・測れなかったものを覚えに載せると、**次の晩に飛ばされる。**
    `NO_REC` の id が1段目の 200 だけで「もどりました」に化けるのはそこ。
    """
    after = {v: d for v, d in before_deep.items() if v in tracked}
    for vid in probed:
        p = probes.get(vid)
        if p and p.kind == watch.OK:
            after[vid] = today
        else:
            after.pop(vid, None)
    return after


def _summary(lines: list[str]) -> None:
    """run の1枚目に残す。**ログを開かずに読める場所。**

    ここが無い（手元で回した）ときは何もしない。
    """
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def _cannot_measure(why: str) -> int:
    """**測れなかった晩。** 赤くしないが、黙りもしない。

    「0本でした」と言わない。**どちらの JSON も1バイトも書き換えない**
    （`docs/island-standards.md` §15）。
    """
    print(f"::warning::{why}", file=sys.stderr)
    _summary([
        "",
        "### 押しても見られない配信を、測れませんでした",
        "",
        f"{why}",
        "",
        "**取り置きも覚えも、1バイトも書き換えていません。**"
        "「0本でした」とも「増えました」とも言えないので、どちらも言いません。",
        "**落ちたわけではありません。** 島の数字のほうは焼いて配ってあります。",
        "1晩なら向こうの都合です。**何晩も続いたら、測りかたのほうを見てください**"
        "（`python/build_dead_streams.py`）。",
    ])
    return 2


def _arg(argv: list[str], flag: str) -> str | None:
    """`--flag あたい` を読む。あとに何も無ければ None。"""
    if flag not in argv:
        return None
    at = argv.index(flag) + 1
    return argv[at] if at < len(argv) else None


def main() -> int:
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    deep = "--no-deep" not in argv

    out, seen_path = OUT, SEEN
    if "--data-dir" in argv:
        got = _arg(argv, "--data-dir")
        if not got:
            print("--data-dir のあとに置き場を渡してください", file=sys.stderr)
            return 2
        out = Path(got) / OUT.name
        seen_path = Path(got) / SEEN.name

    if not deep:
        # **1段目だけでは `NO_REC` が見えない。** そのまま書くと、録画の無い
        # 3本が oembed の 200 だけで「もどりました」に化けて、取り置きから
        # 外れ、翌晩の焼き込みにまた死にリンクが入る。**書かせない**
        dry = True
        print("※ --no-deep。1段目（oembed）だけなので、**どちらの JSON も書きません**"
              "（録画が無いぶんが『押せば見られる』に化けるため）")

    # 焼き込みの置き場。**対照のとき、写しを見せるため**（`dead_stream_watch.py --dir` と同じ）
    content = watch.CONTENT
    if "--dir" in argv:
        got = _arg(argv, "--dir")
        if not got:
            print("--dir のあとに置き場を渡してください", file=sys.stderr)
            return 2
        content = Path(got)
        if not content.is_dir():
            return _cannot_measure(f"置き場がありません: {content}")

    before = load(out)["ids"] if out.exists() else {}
    seen_was = load_seen(seen_path)
    watched_was, deep_was = seen_was["ids"], seen_was["deep"]

    where: dict[str, set] = {}
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
        island = set(vids)
        print(f"--ids で渡された {len(vids)}本と、取り置きの {len(before)}本を測ります")
    else:
        found, files = watch.scan_dir(content)
        if not found:
            return _cannot_measure(
                f"数えるものがありません（{content} の *.ts に配信IDが1本もない）")
        island = set(found)
        where = {v: s.files for v, s in found.items()}
        print(f"島が名指ししている配信 {len(found)}本（焼き込み {len(files)}本）と、"
              f"取り置きの {len(before)}本。合わせて {len(island | set(before))}本を測ります")

    # **見張る相手 = いま島に出ている id ∪ 取り置きに在る id。**
    # 取り置きのぶんを外さないのは、焼き込みから落としたとたんに scan から
    # 消えて、翌晩また入って……を繰り返すため（頭の「行ったり来たり」）。
    # 覚えのほうに在るだけの id は、ここに居なければ「島から外れた」として落とす
    tracked = island | set(before)
    cand = sorted(tracked)

    # **本物を測る前に、両側から当てる**（`dead_stream_watch.py` のものをそのまま借りる）。
    # ここが外れたら、「1本も見つからなかった」のか「届かなかった」のかが分けられない。
    # **2段目の対照は、2段目を回さない晩でも当てる**（1本しか当てないので安い。
    # 当てないと、2段目が死んだことに気づけないまま「増えていません」と言い続ける）
    ok, lines = watch.run_control(deep=True)
    print("対照（本物を測る前に、両側から当てる）")
    for line in lines:
        print(line)
    print()
    if not ok:
        return _cannot_measure(
            "対照が外れました（届いていないのか、見つからなかったのかが分けられない）")

    known_bad = set(before) | set(watched_was)
    today = date.today().isoformat()
    picked: list[str] = []

    def choose(live: list[str]) -> list[str]:
        """1段目の結果を受けて、今夜2段目に当てるぶんを決める（`pick_deep`）。"""
        picked[:] = pick_deep(live, deep_was, known_bad, today)
        print(f"  2段目に当てるのは {len(picked)}本 / 押せば見られる {len(live)}本"
              f"（初めて・30日たったぶん・もう知っている見られないぶん）", file=sys.stderr)
        return picked

    probes = watch.probe_all(cand, deep=deep, quiet=False,
                             deep_pick=choose if deep else None)
    if len(probes) != len(cand):
        # **渡したものと測ったものの数を、必ず突き合わせる**（#139 の決めごと7）
        print(f"::error::{len(cand)}本を渡したのに {len(probes)}本しか測っていません", file=sys.stderr)
        return 2

    after, added, dropped, blind = merge(before, probes, today)
    watched, new, back, moved, off, blind2 = merge_seen(
        watched_was, probes, tracked, today, where)
    deep_now = merge_deep(deep_was, picked, probes, tracked, today)

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
    print()

    # --- 毎晩の見張り。**増えたぶんだけ言う** --------------------------------
    print(f"見張りの覚え: {len(watched)}本（もう知っている「押しても見られない」ぶん）")
    print(f"  新しく見られなくなった {len(new)} / もどった {len(back)}"
          f" / 種類が変わった {len(moved)} / 島から外れた {len(off)}"
          f" / 測れなかった {len(blind2)}")
    for line in new:
        print(f"  ★新しく見られなくなった  {line}")
    for line in back:
        print(f"   もどった                {line}")
    for line in moved:
        print(f"   種類が変わった          {line}")
    for vid in off:
        print(f"   島から外れた            {vid}")

    # **0件のまま測れなかったぶんが残っていたら、「増えていません」と言わない。**
    # 見つかったものがあるなら、測れなかったぶんが混ざっていても言い切ってよい
    # （見つかったぶんは本物で、直す相手がいる。`docs/island-standards.md` §15）
    if not new and blind2:
        return _cannot_measure(
            f"{len(blind2)}本が測れませんでした。"
            "増えていないのか、届かなかっただけなのかが分けられません")

    if dry:
        print("\n※ 書いていません（--dry-run / --no-deep）")
    else:
        save(after, out)
        save_seen(watched, deep_now, seen_path)
        print(f"\n{out} に {len(after)}本、{seen_path} に {len(watched)}本を書きました")

    # --- run の1枚目に残すぶん ----------------------------------------------
    head = ["", "### 押しても見られない配信", ""]
    head.append(f"島が名指ししている {len(island)}本を1本ずつ当てました"
                f"（2段目は {len(picked)}本）。")
    if new:
        head += [
            "",
            f"**知らなかった配信が {len(new)}本、見られなくなりました。**",
            "",
            "```",
            *new,
            "```",
            "",
            "`PRIVATE`（403）と `LOGIN`（401）は**あやとが公開に戻せば戻ります**。"
            "`GONE`（404）と `NO_REC`（録画が無い）は戻らないので、島から外す先を決めてください。",
        ]
    if back:
        head += [
            "",
            f"**{len(back)}本もどりました。**",
            "",
            "```",
            *back,
            "```",
        ]
    if moved:
        head += ["", f"種類が変わったもの {len(moved)}本:", "", "```", *moved, "```"]
    if off:
        head += ["", f"島の焼き込みから消えたので、覚えから外したもの {len(off)}本:",
                 "", "```", *off, "```"]
    if not (new or back or moved or off):
        head += ["", f"**変わりありません**（もう知っている {len(watched)}本のまま）。"]
    _summary(head)

    # **1 を返すのは「知らなかったぶんが増えた」ときだけ。**
    # もどった晩・まだ見られない晩に赤くすると、毎晩赤くなって
    # 「いつもの赤」に化ける。そうなると、本当に1本死んだ晩に見分けがつかない
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main())
