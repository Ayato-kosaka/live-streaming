"""Doneru の寄付履歴 API を叩くクライアント。

## 認証について

ブラウザが送っている cookie のうち、**実際に効いているのは `_dt` だけ**。
`cf_clearance`（Cloudflare のボット判定通過証）も、GA / Clarity / Treasure Data
などの解析タグも要らない。データセンターの IP から `_dt` だけで 200 が返ることを
確認済みなので、GitHub Actions のランナーから叩ける。

`cf_clearance` は解いた IP と User-Agent に紐づくので、そもそも持ち込めない。
**要らなかったのは幸運で、Doneru 側が Cloudflare の判定を厳しくしたら詰む。**
そのときは 403 と HTML が返るので、`DoneruSessionExpired` として issue が立つ。

## `_dt` は寄付一覧を読める鍵そのもの

どの IP からでも通る。Secrets に置く以外の場所に書かない。ログにも出さない
（このモジュールは値を一切ログに出さない）。
"""

import json
import os
from typing import Any, Dict, Iterator, List, Optional

import requests

# Doneru の画面が叩いている先。
API_BASE = "https://api.doneru.jp"

# ブラウザから来たリクエストに見せるための最小限のヘッダ。
# origin / referer を落とすと CORS ではなく Doneru 側の判定で弾かれうるので残す。
DEFAULT_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "origin": "https://doneru.jp",
    "referer": "https://doneru.jp/",
    "user-agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
    ),
}

# 1ページあたりの件数。画面の既定は10だが、往復を減らしたいので大きめにする。
ROWS_PER_PAGE = 100

# ページ送りの上限。API が終端を返さずに同じページを返し続けたときに
# 無限ループしないための保険。100件 x 100ページ = 1万件で、桁として十分。
MAX_PAGES = 100

REQUEST_TIMEOUT_SECONDS = 30


class DoneruError(Exception):
    """Doneru API まわりの失敗全般。"""


class DoneruSessionExpired(DoneruError):
    """cookie が切れた（か、Cloudflare に弾かれた）。

    これが出たら**あやとがブラウザから取り直すしかない**。自動で回復する道は
    無い（ログインが Google OAuth なので、Actions の中では通せない）。
    ワークフローはこの例外だけを見分けて issue を立てる。
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


def _find_record_list(payload: Any, depth: int = 0) -> Optional[List[Dict[str, Any]]]:
    """レスポンスの中から寄付レコードの配列を探す。

    包み方（`{data: [...]}` なのか `{result: {list: [...]}}` なのか裸の配列なのか）を
    決め打ちしない。**Doneru の都合で変わったときに、決め打ちだと黙って0件になる**。
    辞書の配列を最初に見つけたところを採用して、見つからなければ None を返す。
    """
    if isinstance(payload, list):
        if not payload or isinstance(payload[0], dict):
            return payload
        return None

    if isinstance(payload, dict) and depth < 3:
        for value in payload.values():
            found = _find_record_list(value, depth + 1)
            if found is not None:
                return found

    return None


class DoneruClient:
    """`_dt` cookie で Doneru の寄付履歴を読む。"""

    def __init__(self, cookie: Optional[str] = None):
        raw = cookie if cookie is not None else os.getenv("DONERU_COOKIE", "")
        self._cookie_header = _build_cookie_header(raw)
        self._session = requests.Session()
        self._session.headers.update(DEFAULT_HEADERS)
        self._session.headers["cookie"] = self._cookie_header

    def _get(self, path: str, params: Dict[str, Any]) -> Any:
        """GET して JSON を返す。認証が切れていれば DoneruSessionExpired。"""
        try:
            response = self._session.get(
                f"{API_BASE}{path}",
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise DoneruError(f"{path} への接続に失敗しました: {exc}") from exc

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

        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise DoneruError(f"{path} のレスポンスを JSON として読めませんでした") from exc

    def fetch_donation_page(
        self,
        year: int,
        page: int,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> List[Dict[str, Any]]:
        """寄付履歴を1ページ分取る。

        `id` は画面上の絞り込み用で、空だと全件。空のまま送る。
        """
        payload = self._get(
            "/streamer/donation-list",
            {
                "id": "",
                "year": year,
                "currentPage": page,
                "rowPerPage": rows_per_page,
            },
        )

        records = _find_record_list(payload)
        if records is None:
            # 認証は通っているのに配列が見つからない = 包み方が変わった。
            # 中身は寄付者の個人情報なのでログに出さず、**キー名だけ**出す。
            keys = sorted(payload.keys()) if isinstance(payload, dict) else type(payload).__name__
            raise DoneruError(
                f"レスポンスの中に寄付レコードの配列が見つかりませんでした（トップの構造: {keys}）"
            )

        return records

    def iter_donations(
        self,
        year: int,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> Iterator[Dict[str, Any]]:
        """その年の寄付を全ページ舐める。

        終端の判定は「返ってきた件数が rows_per_page 未満」。
        `total` のようなフィールドを当てにしない（あるとは限らない）。
        """
        for page in range(1, MAX_PAGES + 1):
            records = self.fetch_donation_page(year, page, rows_per_page)
            if not records:
                return

            for record in records:
                yield record

            if len(records) < rows_per_page:
                return

        raise DoneruError(
            f"{MAX_PAGES} ページ読んでも終端に届きませんでした。ページ送りが効いていない可能性があります"
        )
