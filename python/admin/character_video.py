"""投げ銭のアラートで、絵のかわりに**短い動画**を流す人を決める。

ARGS 例:
  {"alias": "aoi"}                          … 下見。**1バイトも書かない**
  {"alias": "aoi", "url": "/alert/x.mp4", "apply": true}   … 入れる
  {"alias": "aoi", "url": "", "apply": true}               … 元に戻す（絵に戻る）

## なぜ画面から打てないようにしてあるか

ここに入れた URL は、**そのまま配信に映る。** 画面（`/me` の図鑑）から
打てるようにすると、配信に出るものを外から差し替える口になる。
`donors.ts` が「どちらか分からないまま保存しない」で止めているのと
同じ理由で、**入り口を1つに絞ってある。**

## 出どころは、島と同じところに置く

`public/alert/` に置いたものは、島と**同じ出どころ**から配られる
（`npm run build:web` が `public/` を `dist/` に重ねる）。同じ出どころなら
CORS も混在コンテンツも起きない。ドライブの共有リンクは、確認ページを
挟んだり出どころが変わったりするので、**配信のブラウザソースには向かない。**

`url` に `/` で始まるものを渡すと、島の出どころからの道として扱う。

## 動画の作り方（これを外すと、出るまでに間が空く）

    ffmpeg -i もと.mov -c:v libx264 -profile:v main -pix_fmt yuv420p \\
      -vf "scale=-2:960" -crf 26 -preset slow \\
      -c:a aac -b:a 96k -movflags +faststart できあがり.mp4

**`-movflags +faststart` が要る。** これが無いと目次（`moov`）が末尾に付くので、
**最後まで落とし終わるまで再生が始まらない。** アラートは投げ銭の直後に
出るものなので、そこで数秒待たされると用をなさない。

## 音は出ない

OBS は `muted` で再生する（`app/alertbox/index.tsx`）。ブラウザが
音付きの自動再生を止めるため。**音の要る演出はここでは作れない。**

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も呼び名も1文字も出さない。** 出すのは書類IDの指紋と、URL と、
当たった人数だけ。
"""

import sys

from _fs import args, db, log, need, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import norm_key  # noqa: E402

COLLECTION = "islandCharacter"

# `functions/src/islandCharacter.ts` の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500

# URL の長さ。書類に入れるものなので、ほどほどで切る
MAX_URL = 500


def main() -> None:
    a = args()
    (alias,) = need(a, "alias")
    want = norm_key(alias)
    url = str(a.get("url") or "").strip()[:MAX_URL]
    apply = a.get("apply") is True

    if url and not (url.startswith("/") or url.startswith("https://")):
        log.error("url は `/` 始まり（島と同じ出どころ）か https:// にしてください")
        raise SystemExit(1)

    client = db()
    # **下見のあいだは書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる
    src = client if apply else readonly(client)

    # **`lookupKeys` で引く。** 口（`GET /characters/lookup`）と同じ欄。
    # ここだけ別の欄で引くと、配信で当たる人と、ここで直す人がずれる
    hit = []
    for d in src.collection(COLLECTION).limit(MAX_CHARACTERS).get():
        v = d.to_dict() or {}
        keys = {k for k in (v.get("lookupKeys") or []) if isinstance(k, str)}
        if want in keys:
            hit.append((d.id, v))

    log.info("当たった人数: %d", len(hit))
    if len(hit) == 0:
        log.error("その呼び名で当たる人がいません。**何も書いていません**")
        raise SystemExit(2)
    if len(hit) > 1:
        # 2人に当たるなら、どちらを直すかはこちらでは決められない。
        # 決めずに書くと、別の人の配信の絵が差し替わる
        log.error("**2人以上に当たりました。決められないので書きません**")
        for i, _ in hit:
            log.error("  当たった: %s", mask(i))
        raise SystemExit(2)

    doc_id, v = hit[0]
    was = v.get("videoUrl") or ""
    log.info("相手: %s", mask(doc_id))
    log.info("いま入っているもの: %s", was or "（無し。絵が出ている）")
    log.info("入れるもの        : %s", url or "（空。絵に戻す）")

    if was == url:
        log.info("同じものが既に入っています。**何も書きません**")
        return

    if not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        log.info('書くには {"apply": true} を付けてください')
        return

    # **`videoUrl` だけを触る。** 名前も鍵も絵も、1つも書き換えない。
    # まとめて `set` すると、送らなかった欄が消える書き方になりうる
    src.collection(COLLECTION).document(doc_id).update(
        {"videoUrl": url} if url else {"videoUrl": None}
    )
    log.info("書きました。**OBS の名簿は10分ごとに取り直します**ので、"
             "すぐ見たいならブラウザソースを開き直してください")
    log.info("元に戻すには、同じ呼び名で url を空にして、もう一度回してください")


if __name__ == "__main__":
    main()
