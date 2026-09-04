"""管理スクリプト共通。Firestore クライアントと入力の受け取り。"""

import json
import logging
import os
import sys

from google.cloud import firestore

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("admin")


def db() -> firestore.Client:
    """Firestore クライアント（GitHub Actions のサービスアカウントで動く）。"""
    return firestore.Client(project=BQ_PROJECT_ID)


def args() -> dict:
    """ワークフローから渡された JSON の入力。"""
    raw = (os.getenv("ARGS") or "").strip()
    if not raw:
        return {}
    try:
        v = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("ARGS が JSON として読めません: %s", e)
        sys.exit(1)
    if not isinstance(v, dict):
        log.error("ARGS はオブジェクト（{...}）で渡してください")
        sys.exit(1)
    return v


def need(a: dict, *keys: str) -> list:
    """必須の入力を取り出す。足りなければ止める。"""
    out = []
    for k in keys:
        if k not in a or a[k] in (None, ""):
            log.error("入力 '%s' が要ります。ARGS=%s", k, a)
            sys.exit(1)
        out.append(a[k])
    return out


def show(v) -> str:
    """ログ用に短く整形する。"""
    s = json.dumps(v, ensure_ascii=False, default=str)
    return s if len(s) <= 600 else s[:600] + "…"
