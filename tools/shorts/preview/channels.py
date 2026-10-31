"""下見のチャンネル（Firebase Hosting のプレビューチャンネル）を数える・札を付ける・片づける（Actions 側）。

`host.py`（作業箱から受け取って置く道）と `tools/shorts/render/remote.py`（書き出しの report が置く道）の
両方が、配る前と配ったあとにここを通る。

## なぜ要るか（2026-10-31）

版を直すたびに新しいチャンネル（7日）を作っていて、前の版のチャンネルは7日残る。
同じ日に両方の道で `hosting:channel:deploy` が続けて落ちた。中身は一時の場所の `deploy.log` にしか無く、
ログには「落ちた」しか出ていなかったので、**落ちた理由の字（秘密を伏せたもの）をログに出す**（`safe_reason`）。

## 片づけの決まり

チャンネル名は乱数（`sp-<20桁>`）なので、名前からはどの回のどの版かが分からない。
配った直後に、チャンネルへ札（labels）を付ける: 下見の名前・回（`base`）・版（`ver`）・種類（`kind`）。

| いつ | 何を消す |
| --- | --- |
| 新しい版を配って、確かめが通ったあと | **同じ回の、それより古い版**（`supersedes`）。確かめで落ちた版は、前の版を消さない |
| 配る前に、数が上限に近いとき | 下書き → 札の上で古い版になっているもの、の順に古いものから（`make_room`） |
| 下書き（名前の終わりが `d1` `d2` …） | 寿命を1日にして置く（`expires_for`） |

**最新の版（あやとが見ているもの）は、上限が近くても消さない。** 消してよいものが無ければ、配らずに
その字で落ちる（黙って見ているものを消すより、落ちて知らせるほうがよい）。
札の無いチャンネル（この仕組みより前に作ったもの）は、どの回か分からないので片づけの対象にしない。
7日で Hosting が消す。

消せるのは `sp-<20桁>` の形のチャンネルだけ（`Api.delete` が見る）。本番（`live`）は形が違うので通らない。
"""

from __future__ import annotations

import datetime as dt
import hashlib
import re

PROJECT = SITE = "live-streaming-d3cac"
API = "https://firebasehosting.googleapis.com/v1beta1"
CHANNEL = re.compile(r"^sp-[0-9a-f]{20}$")
# 札の名前。値は小文字・数字・`_` `-` で63字まで（Google の labels の決まりにそろえる）
L_NAME, L_BASE, L_VER, L_KIND = "shorts-name", "shorts-base", "shorts-ver", "shorts-kind"
EXPIRES = {"final": "7d", "other": "7d", "draft": "1d"}
# サイトあたりのチャンネルの上限（本番の live を含む）。None のあいだは数えるだけで消さない
CAP: int | None = None
# 配る前に空けておく数。書き出しの report と put.py の道が同じ時刻に配っても当たらないように
ROOM = 3

_VER = re.compile(r"^(?P<base>.+?)-v(?P<ver>\d+)(?P<suf>[A-Za-z0-9]*)$")
_DRAFT = re.compile(r"^(?P<base>.+?)-d(?P<d>\d+)$")
_DRAFT_SUF = re.compile(r"d\d+$")


# ---- 名前から回と版を読む -----------------------------------------------------------

def parse_name(name: str) -> dict:
    """下見の名前 → 回（base）・版（ver）・種類（final / draft / other）。

    `edinburgh-p2B-v8` → 回 edinburgh-p2B・版 8・final
    `edinburgh-p2-v4d1` / `leeds-p3-v1d1` → 版 4 / 1 の下書き。`edinburgh-p2B-d2` → 版の無い下書き
    形に合わない名前（`yk-tempo-1` など）は other。回が分からないので、何も置き換えない・置き換えられない。
    """
    m = _VER.match(name)
    if m:
        draft = bool(_DRAFT_SUF.search(m["suf"]))
        return {"base": m["base"], "ver": int(m["ver"]), "kind": "draft" if draft else "final"}
    m = _DRAFT.match(name)
    if m:
        return {"base": m["base"], "ver": 0, "kind": "draft"}
    return {"base": name, "ver": 0, "kind": "other"}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_-]", "_", s.lower())[:63]


def labels_for(name: str) -> dict[str, str]:
    p = parse_name(name)
    return {L_NAME: slug(name), L_BASE: slug(p["base"]), L_VER: str(p["ver"]), L_KIND: p["kind"]}


def expires_for(name: str) -> str:
    return EXPIRES[parse_name(name)["kind"]]


def supersedes(new: dict, old: dict) -> bool:
    """札 new のチャンネルが、札 old のチャンネルを置き換えるか（old を消してよいか）。

    同じ回で、old の版が new 以下のとき（同じ名前を置き直したときも含む）。
    下書きは下書きしか置き換えない（下書きの v4d1 が、あやとの見ている v3 を消さないように）。
    """
    kinds = (new.get(L_KIND), old.get(L_KIND))
    if not new.get(L_BASE) or new.get(L_BASE) != old.get(L_BASE):
        return False
    if "other" in kinds or None in kinds:
        return False
    if kinds[0] == "draft" and kinds[1] != "draft":
        return False
    try:
        return int(old.get(L_VER, "")) <= int(new.get(L_VER, ""))
    except ValueError:
        return False


# ---- 一覧の読みかた -----------------------------------------------------------------

def cid(ch: dict) -> str:
    return str(ch.get("name", "")).rsplit("/", 1)[-1]


def is_preview(ch: dict) -> bool:
    c = cid(ch)
    return c != "live" and bool(CHANNEL.match(c))


def sha(c: str) -> str:
    return hashlib.sha256(c.encode()).hexdigest()


def superseded(chans: list[dict], by: dict) -> list[dict]:
    """札 by に置き換えられる、下見のチャンネル（札のあるものだけ）。"""
    return [c for c in chans if is_preview(c) and c.get("labels") and supersedes(by, c["labels"])]


def make_room(chans: list[dict], cap: int | None = None, room: int = ROOM) -> tuple[list[dict], int]:
    """配る前に消すもの（古いものから）と、消したあとの数。

    数が `cap - room` を下回るまで、下書き → 札の上で古い版になっているもの、の順に選ぶ。
    最新の版と札の無いものは選ばない。足りなければ、選べたぶんだけ返す（呼ぶ側が上限で落ちる）。
    """
    cap = CAP if cap is None else cap
    if cap is None:
        return [], len(chans)
    need = len(chans) - (cap - room) + 1
    if need <= 0:
        return [], len(chans)
    pv = sorted((c for c in chans if is_preview(c) and c.get("labels")),
                key=lambda c: c.get("createTime", ""))
    drafts = [c for c in pv if c["labels"].get(L_KIND) == "draft"]
    stale = [c for c in pv if c not in drafts and any(
        o is not c and o.get("createTime", "") > c.get("createTime", "")
        and supersedes(o["labels"], c["labels"]) for o in pv)]
    pick = (drafts + stale)[:need]
    return pick, len(chans) - len(pick)


def census(chans: list[dict], now: dt.datetime | None = None) -> dict:
    """数だけ（ログに出してよいもの）。"""
    now = now or dt.datetime.now(dt.timezone.utc)
    pv = [c for c in chans if is_preview(c)]
    kinds: dict[str, int] = {}
    for c in pv:
        k = (c.get("labels") or {}).get(L_KIND) or "札なし"
        kinds[k] = kinds.get(k, 0) + 1
    soon = sum(1 for c in pv if _ts(c.get("expireTime")) and _ts(c["expireTime"]) < now + dt.timedelta(days=1))
    return {"all": len(chans), "preview": len(pv), "other": len(chans) - len(pv), "kinds": kinds,
            "expire_within_1d": soon, "cap": CAP}


def _ts(s) -> dt.datetime | None:
    if not s:
        return None
    try:
        # Hosting はナノ秒まで返す（`…12:53:09.775987351Z`）。3.11 からの fromisoformat は読める
        return dt.datetime.fromisoformat(str(s))
    except ValueError:
        return None


def row(ch: dict) -> dict:
    """暗号化した結果に入れる1行（チャンネル名と URL は入れない。sha256 で指す）。"""
    return {"channel_sha256": sha(cid(ch)), "preview": is_preview(ch), "live": cid(ch) == "live",
            "create": ch.get("createTime"), "expire": ch.get("expireTime"),
            "labels": ch.get("labels") or {}}


# ---- 落ちた理由を、ログに出せる形にする --------------------------------------------

_REDACT = [
    (re.compile(r"-----BEGIN[^-]*-----.*?-----END[^-]*-----", re.S), "<鍵>"),
    (re.compile(r"https?://\S+"), "<URL>"),
    (re.compile(r"\b[\w-]+\.(?:web\.app|firebaseapp\.com)\b"), "<host>"),
    (re.compile(r"\bsp-[0-9a-f]{20}\b"), "sp-<乱数>"),
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "<アカウント>"),
    (re.compile(r"\bya29\.[\w.-]+"), "<トークン>"),
    (re.compile(r"[A-Za-z0-9_+/=.-]{40,}"), "<長い字>"),
]


def safe_reason(*texts: str, lines: int = 3, width: int = 240) -> str:
    """firebase-tools の出力から、落ちた理由の頭の数行を、秘密を伏せて返す。

    このリポジトリは公開で、Actions のログも誰でも読める。URL（チャンネルの URL・署名つき URL）・
    チャンネル名・アカウント・トークン・鍵・40字以上の切れ目のない字は伏せる。
    """
    out: list[str] = []
    for t in texts:
        if not t:
            continue
        for r, rep in _REDACT:
            t = r.sub(rep, t)
        for ln in t.splitlines():
            ln = " ".join(ln.split())
            if ln and ln not in out:
                out.append(ln[:width])
            if len(out) >= lines:
                return " / ".join(out)
    return " / ".join(out)


def error_of(stdout: str, stderr: str) -> str:
    """`--json` の出力（{"status": "error", "error": "…"}）と stderr から、理由の字を取る。"""
    import json

    msg = ""
    try:
        d = json.loads(stdout or "{}")
        msg = str(d.get("error") or "") if isinstance(d, dict) else ""
    except json.JSONDecodeError:
        msg = (stdout or "")[-2000:]
    tail = [ln for ln in (stderr or "").splitlines()
            if re.search(r"error|HTTP|quota|limit|exceed|denied|permission", ln, re.I)]
    return safe_reason(msg, "\n".join(tail[-3:]))


# ---- REST（firebase-tools を入れずに読む・札を付ける・消す） -----------------------

class Api:
    """Hosting の REST。資格情報は google-github-actions/auth が置いたもの（ADC）。"""

    def __init__(self, session=None):
        if session is None:
            import google.auth
            from google.auth.transport.requests import AuthorizedSession

            cred, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            session = AuthorizedSession(cred)
        self.s = session

    def _ok(self, r, what: str) -> dict:
        if r.status_code >= 400:
            raise RuntimeError(f"{what} が HTTP {r.status_code}: {safe_reason(r.text)}")
        return r.json() if r.content else {}

    def list(self) -> list[dict]:
        out, tok = [], ""
        for _ in range(50):
            r = self.s.get(f"{API}/sites/{SITE}/channels", params={"pageSize": 100, **(
                {"pageToken": tok} if tok else {})}, timeout=60)
            d = self._ok(r, "チャンネルの一覧")
            out += d.get("channels") or []
            tok = d.get("nextPageToken") or ""
            if not tok:
                break
        return out

    def label(self, c: str, labels: dict) -> None:
        if not CHANNEL.match(c):
            raise RuntimeError("下見のチャンネルの形ではないので札を付けない")
        self._ok(self.s.patch(f"{API}/sites/{SITE}/channels/{c}", params={"updateMask": "labels"},
                              json={"labels": labels}, timeout=60), "札を付ける")

    def delete(self, c: str) -> None:
        # 本番（live）も、形の違うチャンネルも、ここで止める。呼ぶ側の確かめに頼らない
        if c == "live" or not CHANNEL.match(c):
            raise RuntimeError("下見のチャンネルの形ではないので消さない")
        self._ok(self.s.delete(f"{API}/sites/{SITE}/channels/{c}", timeout=60), "チャンネルを消す")
