"""OBS の名簿と、口の引く鍵が**食い違っていないか**を数える。

ARGS 例:
  {}                  … 全員ぶん、食い違いの数だけ出す
  {"name": "aoi"}     … その名前が、どちらの道で当たるかを出す

## なぜ要るか

同じ「誰の絵か」を、**2つの道が別の欄から引いている。**

| 誰が引くか | 何を見るか |
| --- | --- |
| 口（`GET /characters/lookup`） | `lookupKeys`（保存のときに `keysOf` で作った鍵） |
| **配信の OBS**（`app/alertbox`） | **`channelName` と `aliases` の生の字**を、手元で正規化 |

`keysOf` は **`@` を落とした形を自動で足す**ので、`@aoi` を1つ入れると
`lookupKeys` は `["@aoi", "aoi"]` になる。いっぽう OBS は生の `@aoi` しか
見ないので、**口では当たるのに配信では当たらない**人ができる。

逆に、`aliases` を直したのに `lookupKeys` を焼き直していない書類があれば、
**配信では当たるのに口では当たらない。**

**どちらも「片方だけ出ない」という形で出る。** ここはその数を数える。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も呼び名も1文字も出さない。** 出すのは件数と、書類IDの指紋だけ。
`name` を渡したときも、返すのは「当たった／当たらない」と件数だけ。
"""

import sys
import unicodedata

from _fs import args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

COLLECTION = "islandCharacter"

# 名簿の上限。Functions 側の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500

# 目に見えない字。`functions/src/islandCharacter.ts` の INVISIBLE と同じ中身
INVISIBLE = dict.fromkeys(
    [0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060, 0x180E, 0x00AD, 0x034F, 0x061C]
)
# 異体字セレクタ
VARIATION = dict.fromkeys([0xFE0E, 0xFE0F])


def norm_key(v) -> str:
    """`functions/src/islandCharacter.ts` の `normKey` と同じ落とし方。

    **片方だけ変えると、ここが「食い違い 0」と言いながら本番が食い違う。**
    向こうは NFKC → 異体字 → 見えない字 → trim → 空白を1つに → 小文字。
    """
    if not isinstance(v, str):
        return ""
    s = unicodedata.normalize("NFKC", v)
    s = s.translate(VARIATION).translate(INVISIBLE)
    return " ".join(s.split()).lower()


def keys_of(names) -> list:
    """`keysOf` と同じ。**`@` を落とした形を足す。**"""
    out = []
    for n in names:
        if not isinstance(n, str):
            continue
        for v in (norm_key(n), norm_key(n.lstrip("@"))):
            if v and v not in out:
                out.append(v)
    return out


def main() -> None:
    a = args()
    want = norm_key(a.get("name") or "")
    client = readonly(db())
    snap = client.collection(COLLECTION).limit(MAX_CHARACTERS).get()

    total = 0
    drift_missing = []   # lookupKeys に在るが、生の名前からは作れない
    drift_extra = []     # 生の名前からは作れるが、lookupKeys に無い
    no_names = 0
    hit_api = []         # `name` が lookupKeys に在る人
    hit_obs = []         # `name` が生の名前（正規化）に在る人

    for d in snap:
        total += 1
        v = d.to_dict() or {}
        raw = [v.get("channelName") or ""] + list(v.get("aliases") or [])
        raw = [x for x in raw if isinstance(x, str) and x]
        if not raw:
            no_names += 1
        built = set(keys_of(raw))
        stored = {k for k in (v.get("lookupKeys") or []) if isinstance(k, str)}
        if stored - built:
            drift_missing.append(d.id)
        if built - stored:
            drift_extra.append(d.id)
        if want:
            if want in stored:
                hit_api.append(d.id)
            # OBS は生の字を正規化して、そのまま突き合わせる（`@` は落とさない）
            if want in {norm_key(x) for x in raw}:
                hit_obs.append(d.id)

    log.info("名簿 %d 人（上限 %d）", total, MAX_CHARACTERS)
    log.info("名前を1つも持たない人: %d", no_names)
    log.info(
        "食い違い: lookupKeys にしか無い %d 人 / 生の名前にしか無い %d 人",
        len(drift_missing), len(drift_extra),
    )
    for who in drift_missing[:20]:
        log.info("  口では当たるが、配信では当たらないかもしれない: %s", mask(who))
    for who in drift_extra[:20]:
        log.info("  配信では当たるが、口では当たらない: %s", mask(who))

    if want:
        log.info("--- 渡された名前 ---")
        log.info("口（lookupKeys）で当たる人数: %d", len(hit_api))
        log.info("OBS（生の名前）で当たる人数: %d", len(hit_obs))
        for who in hit_api:
            log.info("  口で当たる: %s", mask(who))
        for who in hit_obs:
            log.info("  OBS で当たる: %s", mask(who))
        if len(hit_api) == 1 and len(hit_obs) == 0:
            log.info("**口では当たるのに、OBS では当たらない。** これが出ない原因")
        if len(hit_obs) > 1:
            log.info("**OBS で2人以上に当たる。** どちらが出るかは並び順しだい")


if __name__ == "__main__":
    main()
