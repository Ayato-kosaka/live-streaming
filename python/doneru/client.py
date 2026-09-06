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
import re
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


# 自由文が入る列。ここだけがカンマも改行も持ちうるので、はみ出したぶんは
# ここに畳み戻す。名前が変わったときの受け皿も並べておく。
MESSAGE_HEADERS = ("メッセージ", "message", "comment", "コメント", "本文", "text", "body")

# 日時が入る列。「その行が新しいレコードの始まりか」を見分けるのに使う。
DATE_HEADERS = ("どね時刻", "createdat", "created_at", "日時", "日付", "date", "datetime")

# 2026-03-01 でも 2026/3/1 でも当たる。年月日が並んでいるかだけを見る
_LOOKS_LIKE_DATE = re.compile(r"^\s*\d{4}[-/年]\s*\d{1,2}[-/月]\s*\d{1,2}")


def _column_index(header: List[str], names: tuple) -> Optional[int]:
    """ヘッダーの中でその列が何番目かを返す。"""
    lowered = [h.strip().lower() for h in header]
    for name in names:
        if name.lower() in lowered:
            return lowered.index(name.lower())
    return None


def _parse_csv(raw: bytes) -> List[Dict[str, str]]:
    """CSV の本文を辞書の配列にする。

    **文字コードを決め打ちしない。** 日本のサービスの CSV は Excel 向けに
    UTF-8 BOM や Shift_JIS(cp932) で出てくることがある。UTF-8 で読めなければ
    cp932 に落とす。BOM は `utf-8-sig` が食べる。

    ## 壊れた行を組み直す

    **Doneru はメッセージをエスケープせずに吐く。** カンマも改行も引用符も
    そのまま出てくるので、素直に読むと行が壊れる。本番で両方踏んだ。

    - **改行** → 1件が2行以上に割れる。素直に読むと後半が別の寄付として入る
      （日付も金額も無い行が4件、精算状態の列にメッセージの断片が1件）
    - **カンマ** → 列が増える。ヘッダー8列に対して14列の行があった

    自由文が入るのはメッセージの列だけなので、**両端から数えて、余ったぶんを
    メッセージに畳み戻す**。左の列はヘッダーの先頭から、右の列は末尾から数える。

    これはメッセージ以外の列にカンマが入っていないことを前提にしている。
    ニックネームにカンマが入っていたら間違えるが、**引用符が無い以上、
    そこは区別しようがない**。せめて組み直したあとに日付と金額の形を見て、
    おかしければ数を出す。
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

    reader = csv.reader(io.StringIO(text, newline=""))
    try:
        header = next(reader)
    except StopIteration:
        raise DoneruError("CSV が空です") from None

    width = len(header)
    if width < 2:
        raise DoneruError(f"CSV のヘッダーが {width} 列しかありません")

    msg_at = _column_index(header, MESSAGE_HEADERS)
    date_at = _column_index(header, DATE_HEADERS)

    def starts_record(row: List[str]) -> bool:
        """その行が新しい寄付の始まりか。

        **ここを間違えると本物の寄付が消える。** 「列が足りない行は割れた行」と
        決めつけると、末尾の列がただ空なだけの行を次の行とつないでしまい、
        2件が1件になる（実際に 2025 年で2件消した）。
        日時の列が日付の形をしているかで見分ける。
        """
        if date_at is None or len(row) <= date_at:
            return False
        return bool(_LOOKS_LIKE_DATE.match(row[date_at]))

    rows: List[List[str]] = []
    joined_lines = 0     # 改行で割れていてつないだ回数
    folded_commas = 0    # カンマではみ出していて畳み戻した行
    padded = 0           # 末尾の列が空なだけで短かった行
    pending: Optional[List[str]] = None

    for row in reader:
        if not row:
            continue  # 末尾の空行

        if pending is not None:
            if starts_record(row):
                # 続きではなく、次の寄付が始まっている。つまり pending は
                # 割れた行ではなく「末尾の列が空なだけの行」だった。埋めて出す。
                rows.append(pending + [""] * (width - len(pending)))
                padded += 1
                pending = None
            else:
                # 切れた行の続き。最後のセルに改行ごと足して1つのセルに戻す
                row = pending[:-1] + [pending[-1] + "\n" + row[0]] + row[1:]
                pending = None
                joined_lines += 1

        if len(row) < width:
            pending = row      # まだ足りない。次の行も続きかもしれない
            continue

        if len(row) > width:
            if msg_at is None:
                raise DoneruError(
                    f"CSV に列が多すぎる行があります（ヘッダー {width} 列に対して {len(row)} 列）。"
                    "メッセージの列が見つからないので畳み戻せません"
                )
            # 右から (width - msg_at - 1) 列が末尾の固定列。その手前までがメッセージ
            tail = width - msg_at - 1
            end = len(row) - tail
            row = row[:msg_at] + [",".join(row[msg_at:end])] + (row[end:] if tail else [])
            folded_commas += 1

        rows.append(row)

    if pending is not None:
        # 最後の行。続きが来ないので、末尾が空なだけとみなして埋める
        rows.append(pending + [""] * (width - len(pending)))
        padded += 1

    # 黙って直さない。向こうの出し方が変わったときに気づけるようにする
    if joined_lines or folded_commas or padded:
        print(
            f"CSV の壊れた行を組み直しました（改行で割れていたもの {joined_lines} 回、"
            f"カンマではみ出していたもの {folded_commas} 行、"
            f"末尾の列が空なだけだったもの {padded} 行）"
        )

    return [dict(zip(header, row)) for row in rows]
