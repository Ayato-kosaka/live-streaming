"""`collectLiveChat` が**どこで止まっているか**を、実測で切り分ける。**読むだけ。**

## なぜこれが要るか

Firestore の `streamChatRuns` が0件でも、原因は5つある。

| # | どこ | Functions のログに出る文 |
| --- | --- | --- |
| 1 | `islandUsers` の `admin == true` に `doneruKey` が無い | 鍵がまだ入っていません |
| 2 | Doneru がトークンを返さない | トークンが取れません |
| 3 | `liveBroadcasts` が投げる（権限・割り当て） | 配信を探せません |
| 4 | いま配信していない | いま配信していません |
| 5 | ここまで抜けた（`streamChatRuns` に書かれる） | ◯件 足した |

**Cloud Logging が読めない**（#236 の IAM 待ち）ので、ログからは分からない。
だから `functions/src/chatCapture.ts` の `collectLiveChat` と**同じ順・同じ叩き方**を
ここでなぞって、どこで落ちるかを目で見る。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**鍵・アクセストークン・問い合わせの中身は1文字も出さない。**
出すのは「入っている／いない」「長さ」「HTTP のステータス」「エラーの種類」まで。
本文を出すときも、鍵とトークンが混ざっていれば伏せてから出す。

チャンネルID と 動画ID は公開のものなので出す（YouTube の URL に出ている）。

## 書かない

`db()` は読むだけに使う。Firestore にも Storage にも1行も書かない。
そのため**この診断そのものは `streamChatRuns` を増やさない。**
直ったかどうかは、次の配信のあとで `firestore_read` で数える。

ARGS 例:
  {}                    ふつうはこれでよい
  {"env_key": true}     Firestore ではなく env の DONERU_ALERTBOX_KEY で試す
                        （**Functions が使うのは Firestore のほう。** 取り違えないため、
                          既定では使わない。どちらで通るかを比べたいときだけ）
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from _fs import args, db, log

TOKEN_URL = "https://api.doneru.jp/widget/token"
REFRESH_URL = "https://api.doneru.jp/widget/youtube/refresh"
YT = "https://www.googleapis.com/youtube/v3/"
TOKENINFO = "https://www.googleapis.com/oauth2/v3/tokeninfo"
TIMEOUT = 10

# ここに入れた文字列は、出力の直前に伏せる。**鍵とトークンを入れる。**
_SECRETS: list[str] = []


def hide(s: str) -> str:
    """伏せるものが混ざっていれば、伏せてから返す。"""
    out = str(s)
    for v in _SECRETS:
        if v and len(v) >= 8:
            out = out.replace(v, "***")
            # URL エンコードされて出てくることもある
            out = out.replace(urllib.parse.quote(v, safe=""), "***")
    return out


def get(url: str, headers: dict | None = None) -> tuple[int, str]:
    """GET する。**URL は返さない**（鍵が載っていることがある）。

    戻りは (HTTP ステータス, 本文)。落ちても投げずに、そのまま返す。
    """
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001 タイムアウト・名前解決なども1つに畳む
        return 0, f"{type(e).__name__}: {e}"


def scopes_of(at: str) -> str:
    """そのトークンに何が許されているかを、名前だけ並べる。**値は出さない。**

    「`liveBroadcasts` はスコープが強すぎて使えないのでは」を潰すのに要る。
    切れたトークンだと 400 しか返らないので、**必ず生きているほうで見る。**
    """
    code, body = get(f"{TOKENINFO}?access_token={urllib.parse.quote(at, safe='')}")
    if code != 200:
        return f"(見られず HTTP {code})"
    try:
        j = json.loads(body)
    except json.JSONDecodeError:
        return "(本文が JSON でない)"
    names = [s.rsplit("/", 1)[-1] for s in (j.get("scope") or "").split()]
    return " / ".join(names) or "(空)"


def reason_of(body: str) -> str:
    """YouTube が断った理由（`reason`）だけを抜く。

    401 でも `authorizationRequired`（トークンが死んでいる）と
    `insufficientPermissions`（スコープが足りない）では打ち手が違う。
    **前者はコードで直せる。後者は繋ぎ直しが要る。**
    """
    try:
        err = (json.loads(body).get("error") or {})
    except json.JSONDecodeError:
        return "(本文が JSON でない)"
    rs = [str(e.get("reason") or "") for e in (err.get("errors") or [])]
    return ", ".join(r for r in rs if r) or str(err.get("status") or "(無し)")


def head(body: str, n: int = 240) -> str:
    """本文の頭だけ。**伏せてから切る。**"""
    s = hide(body).replace("\n", " ").strip()
    return s if len(s) <= n else s[:n] + "…"


def yt(path: str, qs: dict, at: str) -> tuple[int, dict, str]:
    """YouTube を叩く。`chatCapture.ts` の `yt()` と同じ形。"""
    url = YT + path + "?" + urllib.parse.urlencode(qs)
    code, body = get(url, {"Authorization": f"Bearer {at}"})
    try:
        return code, json.loads(body), body
    except json.JSONDecodeError:
        return code, {}, body


def step1_key() -> str:
    """1. `islandUsers` の `admin == true` に鍵が入っているか。"""
    log.info("── 1. 鍵（islandUsers.admin == true の doneruKey）")
    users = db().collection("islandUsers")

    # まず全部を見て、admin と doneruKey が**同じ書類にあるか**を確かめる。
    # 別々の書類に散っていると、Functions は鍵の無いほうを引いてしまう。
    total = 0
    for d in users.limit(50).stream():
        total += 1
        v = d.to_dict() or {}
        k = str(v.get("doneruKey") or "")
        log.info(
            "  書類 %s… : admin=%s / doneruKey=%s(%d文字)",
            d.id[:6],
            repr(v.get("admin")),
            "あり" if k else "なし",
            len(k),
        )
    log.info("  islandUsers は %d件", total)

    # Functions と**まったく同じ引き方**（where admin == true / limit 1）
    docs = list(users.where("admin", "==", True).limit(1).stream())
    if not docs:
        log.error("  → admin == true の書類が1件も無い。ここで止まる（#1）")
        return ""
    d = docs[0]
    key = str((d.to_dict() or {}).get("doneruKey") or "")
    log.info("  Functions が引くのは 書類 %s…", d.id[:6])
    if not key:
        log.error("  → その書類に doneruKey が無い。ここで止まる（#1）")
        return ""
    log.info("  → doneruKey あり（%d文字）。#1 は抜ける", len(key))
    return key


# Doneru は Cloudflare の後ろにいる（`python/doneru/client.py` の但し書き）。
# **叩く側の「見た目」で 403 が返る。** だから1つの叩き方で 403 を見ても、
# 「Doneru が鍵を拒んだ」のか「Cloudflare がこちらの姿を拒んだ」のか分からない。
# 姿を変えて何度か叩き、どれが通るかで分ける。
BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
)
# Cloud Functions の `fetch()`（undici）が既定で名乗る姿。**これが本番の姿。**
SHAPES: list[tuple[str, dict]] = [
    ("素の Python（urllib の既定）", {}),
    ("node（Functions の fetch と同じ名乗り）", {"User-Agent": "node"}),
    ("undici", {"User-Agent": "undici"}),
    ("ブラウザのふり（doneru/client.py と同じ）", {
        "accept": "*/*",
        "origin": "https://doneru.jp",
        "referer": "https://doneru.jp/",
        "user-agent": BROWSER_UA,
    }),
]


def node_fetch(url: str) -> str:
    """**Cloud Functions とまったく同じ叩き方**を node にさせる。

    `doneruYoutubeToken` は Node の `fetch()` をヘッダ無しで呼んでいる。
    Python から真似ても、名乗りも TLS の指紋も違う。Cloudflare はそこを見るので、
    本番が何を受け取るかは node に聞くしかない。**本文は返さない**
    （鍵が混ざりうる）。ステータスと、本文の頭だけを返す。
    """
    import subprocess

    js = (
        "const u=process.argv[1];"
        "fetch(u).then(async r=>{const t=await r.text();"
        # **200 の本文は返さない。** ここにアクセストークンが載っている。
        # 1度これを出して、公開のログにトークンを流してしまった。
        "console.log(JSON.stringify({s:r.status,n:t.length,"
        "h:r.status===200?'(伏せた)':t.slice(0,120)}))})"
        ".catch(e=>console.log(JSON.stringify({s:0,h:String(e)})))"
    )
    try:
        r = subprocess.run(
            ["node", "-e", js, url],
            capture_output=True, text=True, timeout=30,
        )
    except Exception as e:  # noqa: BLE001
        return f"node を回せず: {type(e).__name__}"
    out = (r.stdout or "").strip() or (r.stderr or "").strip()
    return hide(out)[:300]


def _exp_age(raw) -> str:
    """`exp` が「あと何分」なのかを、単位を見分けて文にする。

    **すでに過ぎていれば、そのトークンは使えない。** Doneru は前に配った
    ものを覚えていて、取り直させない限り同じものを返す作りなので、
    ここが過去になっているかどうかが効く。
    """
    import time

    try:
        n = float(raw)
    except (TypeError, ValueError):
        return "無し"
    now = time.time()
    if n > 1e12:
        sec = n / 1000 - now
    elif n > 1e9:
        sec = n - now
    else:
        sec = n
    return (f"あと {sec / 60:.1f}分" if sec >= 0
            else f"{-sec / 60:.1f}分 前に切れている")


def refresh_and_retake(key: str) -> str:
    """Doneru に取り直させてから、もう一度トークンをもらう。

    **2026-09-10 に `chatCapture.ts` も同じことをするようになった**
    （401 を見たら1度だけ取り直して、同じ問い合わせをやり直す）。
    ここでなぞるのは、その道が本当に通るかを本番の値で見るため。

    **ここは Python の写しであって、Functions のコードそのものではない。**
    通ったからといって、TypeScript 側が正しいことの証明にはならない。
    最後は配信中に `streamChatRuns` が増えるかで見る。
    ここが通れば、直すのはコードのほうで済む。
    """
    req = urllib.request.Request(
        REFRESH_URL,
        data=json.dumps(
            {"key": key, "type": "alertbox", "version": "1.0.0"}).encode(),
        headers={"content-type": "application/json", "accept": "*/*",
                 "User-Agent": "node"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            log.info("  取り直し（refresh）HTTP %s", r.status)
    except urllib.error.HTTPError as e:
        log.error("  取り直し（refresh）HTTP %s: %s", e.code,
                  head(e.read().decode("utf-8", "replace"), 120))
        return ""
    except Exception as e:  # noqa: BLE001
        log.error("  取り直し（refresh）が落ちた: %s", type(e).__name__)
        return ""

    url = f"{TOKEN_URL}?key={urllib.parse.quote(key, safe='')}&type=alertbox"
    code, body = get(url, {"User-Agent": "node"})
    if code != 200:
        log.error("  取り直したあとのトークン HTTP %s", code)
        return ""
    y = json.loads(body).get("youtube") or {}
    at = str(y.get("at") or "")
    _SECRETS.append(at)
    log.info("  取り直したあとの at: %s（%d文字）/ exp=%s",
             "あり" if at else "なし", len(at), _exp_age(y.get("exp")))
    # **生きているトークンで見ないと、スコープは分からない。**
    # 「liveBroadcasts はスコープが強すぎるのでは」を、ここで潰す
    if at:
        log.info("  生きているトークンの許し: %s", scopes_of(at))
    return at


def step2_token(key: str) -> str:
    """2. Doneru からアクセストークンを取る。"""
    log.info("── 2. Doneru のトークン")
    url = f"{TOKEN_URL}?key={urllib.parse.quote(key, safe='')}&type=alertbox"

    # **まず本番と同じ叩き方**。ここが 200 なら Functions の #2 は無実。
    log.info("  [本番と同じ] node の fetch（ヘッダ無し）: %s", node_fetch(url))

    body = ""
    ok = None
    for name, hdr in SHAPES:
        code, b = get(url, hdr)
        # **200 の本文は出さない。** ここにアクセストークンが入っている
        log.info("  [%s] HTTP %s %s", name, code,
                 "(本文は伏せた)" if code == 200 else head(b, 100))
        if code == 200 and ok is None:
            ok, body = name, b
    if ok is None:
        log.error("  → どの叩き方でもトークンが取れない。ここで止まる（#2）")
        return ""
    log.info("  → 「%s」なら通る", ok)

    try:
        j = json.loads(body)
    except json.JSONDecodeError:
        log.error("  → 本文が JSON でない。ここで止まる（#2）: %s", head(body))
        return ""
    y = (j.get("youtube") or {}) if isinstance(j, dict) else {}
    at = str(y.get("at") or "")
    _SECRETS.append(at)
    log.info(
        "  返ってきた鍵の名前: %s",
        ",".join(sorted(j.keys())) if isinstance(j, dict) else "?",
    )
    if not at:
        log.error("  → youtube.at が空。ここで止まる（#2）: %s", head(body))
        return ""
    log.info("  → at あり（%d文字）/ channel=%s / exp=%s",
             len(at), y.get("channel") or "(無し)", _exp_age(y.get("exp")))

    # トークンに何が許されているか。**#3 の原因の半分はここ。**
    code, info = get(
        f"{TOKENINFO}?access_token={urllib.parse.quote(at, safe='')}")
    if code == 200:
        try:
            scopes = (json.loads(info).get("scope") or "").split()
        except json.JSONDecodeError:
            scopes = []
        log.info("  トークンの許し: %s", " / ".join(scopes) or "(取れず)")
    else:
        log.info("  トークンの許しは見られず（HTTP %s）", code)
    return at


def step3_live(at: str, key: str = "") -> dict:
    """3. `findLive` と同じ叩き方で、いま配信中の枠を探す。"""
    log.info("── 3. いま配信中か（findLive と同じ）")

    def ask(token: str):
        return yt(
            "liveBroadcasts",
            {"part": "id,snippet,status", "broadcastStatus": "active",
             "maxResults": "1"},
            token,
        )

    code, j, body = ask(at)
    log.info("  liveBroadcasts(active) HTTP %s / 断った理由=%s",
             code, "-" if code == 200 else reason_of(body))
    if code == 401 and key:
        # **ここが要**。401 は「配信していない」ではなく「トークンが死んでいる」。
        # Doneru は取り直させるまで同じものを配り続けるので、
        # 呼ぶだけで生き返るのかを見る。
        log.warning("  → 401（トークンが通らない）。取り直してもう一度やる")
        at2 = refresh_and_retake(key)
        if at2:
            code, j, body = ask(at2)
            log.info("  取り直したあと liveBroadcasts(active) HTTP %s / 理由=%s",
                     code, "-" if code == 200 else reason_of(body))
            if code != 401:
                log.warning(
                    "  ★ 取り直せば通る。**chatCapture.ts も同じことをする**"
                    "（2026-09-10 に入れた。401 を見たら1度だけ取り直して"
                    "やり直す）ので、ここが通れば本番も通る見込み")
                at = at2
    if code != 200:
        log.error("  → 配信を探せない。ここで止まる（#3）: %s", head(body))
        # 探せない理由を、もう少しだけ切り分ける
        _other_statuses(at)
        return {}
    items = j.get("items") or []
    log.info("  件数 %d（pageInfo=%s）", len(items), j.get("pageInfo"))
    if not items:
        log.warning("  → いま配信していない（#4）")
        _other_statuses(at)
        return {}

    it = items[0]
    vid = str(it.get("id") or "")
    snip = it.get("snippet") or {}
    stat = it.get("status") or {}
    chat = str(snip.get("liveChatId") or "")
    log.info("  videoId=%s / lifeCycle=%s / privacy=%s",
             vid, stat.get("lifeCycleStatus"), stat.get("privacyStatus"))
    log.info("  snippet.liveChatId=%s", "あり" if chat else "なし")
    if not chat and vid:
        code, v, body = yt(
            "videos", {"part": "liveStreamingDetails", "id": vid}, at)
        log.info("  videos(liveStreamingDetails) HTTP %s", code)
        vi = (v.get("items") or [{}])[0] if code == 200 else {}
        det = vi.get("liveStreamingDetails") or {}
        chat = str(det.get("activeLiveChatId") or "")
        log.info("  activeLiveChatId=%s / concurrent=%s",
                 "あり" if chat else "なし", det.get("concurrentViewers"))
    if not vid or not chat:
        log.warning("  → videoId か liveChatId が欠けるので null 扱い（#4）")
        return {}
    log.info("  → 配信中の枠が取れた。#4 は抜ける")
    # **通ったほうのトークンを返す。** 取り直していたら、#4 もそちらで叩く
    return {"videoId": vid, "liveChatId": chat, "at": at}


def _other_statuses(at: str) -> None:
    """「見えていない」のか「本当に配信していない」のかを分ける。

    active が0件でも、upcoming / completed が見えていれば
    **トークンはこのチャンネルの枠を見られている**。0件ずつ並ぶなら、
    見ているチャンネルが違うか、この形の配信が `liveBroadcasts` に出ていない。
    """
    for st in ("upcoming", "completed"):
        code, j, body = yt(
            "liveBroadcasts",
            {"part": "id,snippet,status", "broadcastStatus": st,
             "maxResults": "5"},
            at,
        )
        if code != 200:
            log.info("  参考 %s: HTTP %s %s", st, code, head(body, 120))
            continue
        items = j.get("items") or []
        log.info("  参考 %s: %d件", st, len(items))
        for it in items[:5]:
            snip = it.get("snippet") or {}
            log.info(
                "    %s / %s / start=%s end=%s",
                it.get("id"),
                (str(snip.get("title") or "")[:24]),
                snip.get("actualStartTime") or snip.get("scheduledStartTime"),
                snip.get("actualEndTime"),
            )


def step4_chat(at: str, live: dict) -> None:
    """4. `liveChatMessages.list` を**1ページだけ**叩く。"""
    log.info("── 4. コメントを1ページだけ読む")
    code, j, body = yt(
        "liveChatMessages",
        {"liveChatId": live["liveChatId"], "part": "snippet,authorDetails",
         "maxResults": "200"},
        at,
    )
    log.info("  HTTP %s", code)
    if code != 200:
        log.error("  → 読めない（#5 の手前）: %s", head(body))
        return
    items = j.get("items") or []
    log.info(
        "  %d件 / nextPageToken=%s / pollingIntervalMillis=%s",
        len(items),
        "あり" if j.get("nextPageToken") else "なし",
        j.get("pollingIntervalMillis"),
    )
    log.info("  → ここまで通るなら、Functions は streamChatRuns に書ける（#5）")


def counts() -> None:
    """いま溜まっている数。**数えるだけ。**"""
    log.info("── いま Firestore にあるもの")
    c = db()
    for name in ("streamChatRuns", "streamChatMessages"):
        n = sum(1 for _ in c.collection(name).limit(200).stream())
        log.info("  %s: %d件%s", name, n, "以上" if n >= 200 else "")


def main() -> None:
    a = args()
    counts()

    key = step1_key()
    if a.get("env_key"):
        env = os.getenv("DONERU_ALERTBOX_KEY", "")
        log.info(
            "  ※ env の鍵で試す（%d文字 / Firestore のものと %s）",
            len(env), "同じ" if env and env == key else "違う",
        )
        key = env
    elif key:
        env = os.getenv("DONERU_ALERTBOX_KEY", "")
        log.info(
            "  ※ 参考: env の鍵は %d文字で、Firestore のものと %s",
            len(env), "同じ" if env and env == key else "違う",
        )
    if not key:
        log.error("結論: #1 で止まっている（鍵）")
        return
    _SECRETS.append(key)

    at = step2_token(key)
    if not at:
        log.error("結論: #2 で止まっている（トークン）")
        return

    live = step3_live(at, key)
    if not live:
        log.error("結論: #3 か #4 で止まっている（上の HTTP を見る）")
        return

    step4_chat(live.get("at") or at, live)
    log.info("結論: #5 まで通る（配信中なら溜まるはず）")


if __name__ == "__main__":
    main()
