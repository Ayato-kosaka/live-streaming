"""
住人のキャラクター画像を、本番と同じものを手元に落としてくる。

スクショを撮るとき、これまでは住人12人ぶんを全部 `ayato.png` に差し替えていた。
そのせいで**島の上の12人が全員そっくり同じ**に写り、
「住人が生きているか」をレビューしても何も分からなかった。

ブラウザからは lh3.googleusercontent.com に出られないが、**curl では取れる。**
先に落としておいて、Playwright の page.route から手元のファイルを返す。

実行: python3 tools/sprites/avatars.py
出力: /tmp/avatars/<icon>.png（`site/content/residents.ts` の icon がそのまま名前）
     /tmp/avatars/yt/<url の sha1>.jpg（`voices.ts` と `kitchenTalk.ts` の視聴者さんのアイコン）

視聴者さんのアイコンは yt3/yt4.ggpht.com にあって、ここもブラウザからは出られない。
落としておかないと、他己紹介の11人が全員おなじ絵で写って、並びを見ても何も分からない。
"""

import hashlib
import os
import pathlib
import re
import sys
import urllib.request

# 名簿の出どころは**いま自分が居るリポジトリ**から組む。直に書くと、worktree から
# 回したときに本体（master）の名簿を読んで、**枝で足した住人が落ちる**
# （`docs/island-misses.md` #129 / #131）
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from repo import repo_path, repo_root  # noqa: E402

sys.path.insert(0, str(repo_root() / "python"))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）
from ts_read import count_keys, fields, objects, read_array, read_map  # noqa: E402

SRC = repo_path("site/content/residents.ts")
VOICES = repo_path("site/content/voices.ts")
# 引用の吹き出しは2面ある。片方だけ落とすと、料理の面が全員おなじ顔で写る
KITCHEN_TALK = repo_path("site/content/kitchenTalk.ts")
# ショート動画のサムネイル。i.ytimg.com もブラウザからは出られない
SHORTS = repo_path("site/content/shorts.ts")
OUT = "/tmp/avatars"
UA = {"User-Agent": "AyatoIslandBot/1.0 (design reference study)"}


def _keys(path: str, name: str, key: str) -> list:
    """焼き込みの並びから、欄を1つぶん。**読み落としたら止める。**

    字を読むのは `python/ts_read.py` の1本だけ（`docs/island-misses.md` #208）。
    ここは前 `icon:\\s*"([^"]+)"` のように**深さを見ずに**拾っていた。
    いまの名簿は1人1行なので当たっていたが、落ちたぶんは黙って枚数が減るだけで、
    **「本番と同じ絵で撮った」つもりの絵が1枚ずつ ayato.png に落ちる。**
    """
    got = read_array(open(path, encoding="utf-8").read(), name,
                     keys=(key,), id_key=key)
    if got.declared == 0:
        raise SystemExit(f"{path} の {name} が空です（置き場が変わった？）")
    if got.missed:
        raise SystemExit(
            f"{path} の {name} の {got.declared} 件のうち {got.missed} 件を読み落としました"
        )
    return [r[key] for r in got.rows]


def _map_keys(path: str, name: str, key: str) -> list:
    """`Record<string, X[]>` の表の、**中の並びぜんぶ**から欄を1つぶん。

    `shorts.ts` の `SHORTS` は「章 → ショートの並び」なので、
    `read_array()` では取れない。表を鍵ごとに開いて、中の `{…}` を読む。
    """
    src = open(path, encoding="utf-8").read()
    rows = read_map(src, name)
    if not rows:
        raise SystemExit(f"{path} の {name} が空です（置き場が変わった？）")
    out, want = [], 0
    for _slug, body in rows:
        want += count_keys(body, key)
        out += [v for o in objects(body) if (v := fields(o).get(key, ""))]
    # **止め金。** 落ちたぶんは黙って枚数が減るだけ（`_keys()` と同じ理由）
    if want != len(out):
        raise SystemExit(
            f"{path} の {name} が名乗っている {want} 件のうち {len(out)} 件しか読めていません"
        )
    return out


def get(url: str, dst: str) -> bool:
    """1枚落とす。すでにあるものは触らない。"""
    if os.path.exists(dst) and os.path.getsize(dst) > 500:
        return True
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
    except Exception as e:  # noqa: BLE001
        print("取れなかった", url, e)
        return False
    if len(b) < 500:
        print("小さすぎる", url, len(b))
        return False
    open(dst, "wb").write(b)
    return True


def voices() -> None:
    """他己紹介に出る視聴者さんのアイコン。名前は URL の sha1（route.mjs と同じ決め方）。"""
    out = f"{OUT}/yt"
    os.makedirs(out, exist_ok=True)
    urls = []
    for f in (VOICES, KITCHEN_TALK):
        urls += re.findall(r'icon:\s*"(https://[^"]+)"', open(f, encoding="utf-8").read())
    urls = list(dict.fromkeys(urls))
    got = sum(get(u, f"{out}/{hashlib.sha1(u.split('=')[0].encode()).hexdigest()}.jpg") for u in urls)
    print(f"{got}/{len(urls)} 枚（視聴者さんのアイコン） -> {out}")


def built_video_ids() -> list[str]:
    """**書き出した HTML が実際に呼んでいる** YouTube のサムネイルの id。

    `shorts.ts` だけを読んでいたころは、ショートの85本しか落ちていなかった。
    ところがサムネイルを出すのはショートの格子だけではない——配信の一覧
    （`components/streams/Vid.tsx`）・世界地図の道中（`WorldRoute.tsx`）・
    `components/ui/Bits.tsx` も `i.ytimg.com/vi/<id>/mqdefault.jpg` を呼ぶ。
    その id は `chapterStreams.ts` のような**配列で持つ表**に入っていて、
    `videoId:` という字では出てこない（1本 = [日付, videoId, 題名, 人数]）。
    名簿の形を1つずつ覚えるのは `docs/island-standards.md` §8 の
    「名簿を手で作らない」に反するので、**書き出したものを読む。**

    実測（2026-10-07）: `shorts.ts` 85本に対して、書き出しに出てくる id は
    **785本**。足りない 700本は全部おなじ写真に落ちていたので、
    `/map/georgia` の配信58本は**58枚とも同じ絵**で写っていた。

    置き場が無ければ空を返す（ビルドしていない手元でも動くように）。
    """
    import glob

    ids: list[str] = []
    roots = sorted(glob.glob(repo_path("site/.next-*"))) + [repo_path("site/out")]
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, files in os.walk(root):
            if "/_next/" in dirpath + "/" or "/cache/" in dirpath + "/":
                continue
            for f in files:
                if not f.endswith(".html"):
                    continue
                try:
                    body = open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read()
                except OSError:
                    continue
                ids += re.findall(r"i\.ytimg\.com/vi/([A-Za-z0-9_-]{6,})/", body)
    return list(dict.fromkeys(ids))


def thumbs() -> None:
    """配信とショートのサムネイル。

    **1枚に潰さない。** 58本が全部おなじ絵で写ると、格子を並べても
    「絵が縦に切れているか」「題名が2行で止まっているか」しか見えない。

    落とすのは `mqdefault`（画面が呼ぶのはこちら）。`route.mjs` は
    `/vi/<id>/<なんでも>` を `<id>.jpg` 1枚で返すので、どちらの綴りで
    呼ばれても同じ1枚が当たる。
    """
    out = f"{OUT}/yt-thumb"
    os.makedirs(out, exist_ok=True)
    # 名簿の側は `ts_read.py` の1本で読む（#208）。**書き出しの側は別の口**で、
    # こちらは「画面が実際に呼んだ URL」をそのまま読む（下の註）
    ids = _map_keys(SHORTS, "SHORTS", "id")
    built = built_video_ids()
    # 書き出しが無い手元でも、せめてショートは落ちる
    ids = list(dict.fromkeys(ids + built))
    got = sum(get(f"https://i.ytimg.com/vi/{i}/mqdefault.jpg", f"{out}/{i}.jpg") for i in ids)
    print(f"{got}/{len(ids)} 枚（配信とショートのサムネイル。書き出しから {len(built)}本） -> {out}")


# 図鑑で出す大きさ。**`site/components/live/FriendsWall.tsx` の `drive()` と
# 同じ数にしておくこと。** 片方だけ動かすと、測っている絵と本番の絵が別物になる。
SIDE = 640


def big_enough(dst: str) -> bool:
    """すでに落としてある絵が、いま欲しい大きさに足りているか。

    **「ファイルがあるかどうか」で判断してはいけない。** ここを s160 から
    s512 へ上げたとき、手元には s160 のまま残った絵があって、そのまま
    測り続けていた。上げた本人が気づけないのがこの罠なので、
    落としてある絵の実寸を見て、足りなければ落とし直す。
    """
    if not os.path.exists(dst) or os.path.getsize(dst) <= 1000:
        return False
    try:
        from PIL import Image  # 測るときだけ要る。落とすだけなら要らない

        with Image.open(dst) as im:
            return max(im.size) >= SIDE
    except Exception:  # noqa: BLE001
        return False


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    # **どの枝の名簿を読んだか**を先に言う。落としてきた枚数だけ出しても、
    # それが本体の名簿なのか自分の枝の名簿なのかは出力から分からない（#131）
    print(f"名簿の出どころ: {SRC}")
    ids = _keys(SRC, "RESIDENTS", "icon")
    got = 0
    for i in ids:
        dst = f"{OUT}/{i}.png"
        if big_enough(dst):
            got += 1
            continue
        # 「絵が縦の半分を占めているか」は、本番と同じ絵で測らないと嘘になる。
        # 島の上では縮めて使うので、いちばん大きく出すところに合わせておく。
        url = f"https://lh3.googleusercontent.com/d/{i}=s{SIDE}"
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                b = r.read()
            if len(b) < 1000:
                print("小さすぎる", i, len(b))
                continue
            open(dst, "wb").write(b)
            got += 1
        except Exception as e:  # noqa: BLE001
            print("取れなかった", i, e)
    print(f"{got}/{len(ids)} 枚 -> {OUT}")
    voices()
    thumbs()


if __name__ == "__main__":
    main()
