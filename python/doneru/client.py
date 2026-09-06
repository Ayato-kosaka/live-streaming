"""Doneru の寄付履歴 API を叩くクライアント。

## 認証について

ブラウザが送っている cookie のうち、**実際に効いているのは `_dt` だけ**。
`cf_clearance`（Cloudflare のボット判定通過証）も、GA / Clarity / Treasure Data
などの解析タグも要らない。データセンターの IP から `_dt` だけで 200 が返ることを
確認済みなので、GitHub Actions のランナーから叩ける。

`cf_clearance` は解いた IP と User-Agent に紐づくので、そもそも持ち込めない。
**要らなかったのは幸運で、Doneru 側が Cloudflare の判定を厳しくしたら詰む。**
そのときは 403 と HTML が返るので、`DoneruSessionExpired` として落ちる。

## `_dt` は寄付一覧を読める鍵そのもの

どの IP からでも通る。Secrets に置く以外の場所に書かない。ログにも出さない
（このモジュールは値を一切ログに出さない）。
"""

import csv
import io
import os
from datetime import date
from typing import Any, Dict, List, Optional

import requests

# Doneru の画面が叩いている先。
API_BASE = "https://api.doneru.jp"

# ブラウザから来たリクエストに見せるための最小限のヘッダ。
# origin / referer を落とすと CORS ではなく Doneru 側の判定で弾かれうるので残す。
DEFAULT_HEADERS = {
    "accept": "*/*",
    "origin": "https://doneru.jp",
    "referer": "https://doneru.jp/",
    "user-agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
    ),
}

REQUEST_TIMEOUT_SECONDS = 60


class DoneruError(Exception):
    """Doneru API まわりの失敗全般。"""


class DoneruSessionExpired(DoneruError):
    """cookie が切れた（か、Cloudflare に弾かれた）。

    これが出たら**あやとがブラウザから取り直すしかない**。自動で回復する道は
    無い（ログインが Google OAuth なので、Actions の中では通せない）。
    ワークフローはこの例外だけを終了コード 2 で見分けて、ログに印を出す。
    """


def _build_cookie_header(raw: str) -> str:
    """環境変数の値を Cookie ヘッダの形にそろえる。

    貼り間違いを減らすため、次のどちらでも受ける。

    - `_dt=s517...; __td_signed=true` のような cookie 文字列まるごと
    - `s517...` のような `_dt` の値だけ

    cookie 文字列で来た場合も、**効くと確認できている2つだけに絞る**。
    解析タグ（`_ga` など）を Secrets に残す理由が無いし、
    そこに含まれる識別子をログの事故で出したくない。
    """
    raw = raw.strip().strip(";").strip()
    if not raw:
        raise DoneruError("DONERU_COOKIE が空です")

    if "=" not in raw:
        # `_dt` の値だけが渡された
        return f"_dt={raw}; __td_signed=true"

    jar: Dict[str, str] = {}
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        jar[name.strip()] = value.strip()

    if "_dt" not in jar:
        raise DoneruError(
            "DONERU_COOKIE に `_dt` が含まれていません。"
            "ブラウザの Application > Cookies から `_dt` を取り直してください"
        )

    return f"_dt={jar['_dt']}; __td_signed={jar.get('__td_signed', 'true')}"


def _describe_cookie(cookie_header: str) -> str:
    """cookie の「形」だけを一行にする。**値は入れない。**

    401 が返ったとき、値の貼り損ねなのかセッションが死んだのかを分けたい。
    Doneru の `_dt` は `s` ＋ 32桁の16進数（33文字）なので、長さと字種を見れば
    切れているか、余計なものが混ざっているかは分かる。
    """
    value = ""
    for part in cookie_header.split(";"):
        name, _, raw = part.strip().partition("=")
        if name == "_dt":
            value = raw
            break

    looks_right = len(value) == 33 and value.startswith("s") and all(
        c in "0123456789abcdef" for c in value[1:]
    )
    return (
        f"_dt は {len(value)} 文字"
        + ("（Doneru の形と一致）" if looks_right else "（想定は 's' + 16進32桁 = 33文字。形が違う）")
    )


class DoneruClient:
    """`_dt` cookie で Doneru の寄付履歴を読む。"""

    def __init__(self, cookie: Optional[str] = None):
        raw = cookie if cookie is not None else os.getenv("DONERU_COOKIE", "")
        self._cookie_header = _build_cookie_header(raw)
        # 401 が返ったときに「値が化けている」のか「セッションが死んでいる」のかを
        # 分けるための手がかり。**値そのものは持たない**（public なログに出るため）。
        # 長さだけで、貼り損ね・切れ・改行の混入は見分けられる。
        self.cookie_shape = _describe_cookie(self._cookie_header)
        # Doneru が応答で `_dt` を配り直したか。寿命の見立てに使う（_get で立てる）
        self.renewed_dt = False
        self._session = requests.Session()
        self._session.headers.update(DEFAULT_HEADERS)
        self._session.headers["cookie"] = self._cookie_header

    def _get_bytes(self, path: str, params: Dict[str, Any]) -> bytes:
        """GET して本文をそのまま返す。認証が切れていれば DoneruSessionExpired。"""
        try:
            response = self._session.get(
                f"{API_BASE}{path}",
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise DoneruError(f"{path} への接続に失敗しました: {exc}") from exc

        # Doneru が `_dt` を再発行しているかを見る。**値は持たない。**
        # 再発行するなら、毎日の実行がそれを拾ってシークレットを更新し続けられる
        # （yt-dlp の cookie を GH_PAT で書き戻している前例が schedule_fetch_chat.yml にある）。
        # 再発行しないなら、セッションの寿命がそのまま取り込みの寿命になる。
        if response.cookies.get("_dt"):
            self.renewed_dt = True

        if response.status_code in (401, 403):
            raise DoneruSessionExpired(
                f"{path} が {response.status_code} を返しました。"
                "cookie が切れたか、Cloudflare に弾かれています"
            )

        if response.status_code >= 400:
            raise DoneruError(f"{path} が {response.status_code} を返しました")

        # 200 でも HTML が返ることがある（Cloudflare のチャレンジ画面、
        # ログイン画面へのリダイレクト先）。JSON として読めないなら認証の問題として扱う。
        body = response.text.lstrip()
        if body.startswith("<"):
            raise DoneruSessionExpired(
                f"{path} が JSON ではなく HTML を返しました。"
                "Cloudflare のチャレンジか、ログイン画面に飛ばされています"
            )

        return response.content

    def fetch_donations(self, start: date, end: date) -> List[Dict[str, str]]:
        """`start` から `end` までの寄付を CSV で取る。

        画面が使っている JSON の一覧（`/streamer/donation-list?year=...`）から
        こちらに移した。**あちらは年でしか切れないうえ、データの無い年を訊くと
        ページ送りを無視して同じページを返し続ける。** CSV は日付範囲で切れて、
        ページ送りが無いので、その両方が消える。

        返すのは CSV のヘッダーをキーにした辞書の配列。**ヘッダー名は
        決め打ちしない**（`normalizer.FIELD_CANDIDATES` が吸収する）。
        """
        raw = self._get_bytes(
            "/streamer/donation-list/csv",
            {"start": start.isoformat(), "end": end.isoformat()},
        )
        return _parse_csv(raw)


def _parse_csv(raw: bytes) -> List[Dict[str, str]]:
    """CSV の本文を辞書の配列にする。

    **文字コードを決め打ちしない。** 日本のサービスの CSV は Excel 向けに
    UTF-8 BOM や Shift_JIS(cp932) で出てくることがある。UTF-8 で読めなければ
    cp932 に落とす。BOM は `utf-8-sig` が食べる。
    """
    text: Optional[str] = None
    for encoding in ("utf-8-sig", "cp932"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise DoneruError("CSV の文字コードを判別できませんでした（UTF-8 でも cp932 でもない）")

    rows = list(csv.DictReader(io.StringIO(text)))

    # ヘッダーだけで中身が無いのは「その期間に寄付が無い」。空を返すのが正しい。
    # ヘッダーすら無いのは想定外なので、キー名も値も出さずに落とす。
    if rows and all(key is None for key in rows[0]):
        raise DoneruError("CSV にヘッダー行がありませんでした")

    # DictReader は列の数が合わない行に None のキーを作る。混ざったまま
    # BigQuery に渡すと JSON にできないので、ここで落として気づけるようにする。
    cleaned: List[Dict[str, str]] = []
    ragged = 0
    for row in rows:
        if None in row:
            ragged += 1
            row = {k: v for k, v in row.items() if k is not None}
        cleaned.append({k: ("" if v is None else v) for k, v in row.items()})

    if ragged:
        raise DoneruError(
            f"CSV に列数の合わない行が {ragged} 件ありました（ヘッダーと本文がずれています）"
        )

    return cleaned
