"""状態の SQLite（`<root>/state.sqlite`）。

**途中で落ちても続きから**回すための台帳。1枚読み終えるたびに書いて閉じる
（`commit`）ので、プロセスが殺されても、読み終えた分は残る。

- `occ`   … 源の中の1ファイル（zip の1メンバー）。読み終えたら1行。再開はここを見て飛ばす
- `photos`… 写真1枚（sha ごとに1行）。**同じ sha は2度数えない**。数と埋め込みはここにためる
- `sidecars` … Takeout の横の JSON。写真と別の zip に入っていることがあるので、別にためて後で引く
- `existing` … すでにカードになっている写真の pHash と埋め込み
- `labels`   … 認識合わせの答え（`yes` / `no` / `excluded`）
- `decisions`… 一覧画で決めたもの（`keep` / `drop`）
- `picks` `runs` `sheets` … 選んだ結果と、その回の数

**位置（緯度経度）とファイル名はこの SQLite にだけ置く。** manifest にも
標準出力にも出さない（`pack.py` と `run.py status` が守る）。
"""

from __future__ import annotations

import sqlite3
from array import array
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY, kind TEXT, name TEXT, size INTEGER,
  members INTEGER, done_at REAL, UNIQUE(kind, name, size));
CREATE TABLE IF NOT EXISTS occ(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER, member TEXT, sha TEXT, what TEXT,
  UNIQUE(source_id, member));
CREATE TABLE IF NOT EXISTS photos(
  sha TEXT PRIMARY KEY, jkey TEXT, w0 INTEGER, h0 INTEGER,
  taken TEXT, tz TEXT, day TEXT, date_src TEXT,
  lat REAL, lng REAL, camera INTEGER, shotname INTEGER,
  blur REAL, dark REAL, clip REAL, phash TEXT,
  vec BLOB, probs TEXT, aesth REAL,
  status TEXT, keep INTEGER DEFAULT 0, kw INTEGER, kh INTEGER);
CREATE TABLE IF NOT EXISTS sidecars(jkey TEXT PRIMARY KEY, ts INTEGER, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS existing(url TEXT PRIMARY KEY, day TEXT, phash TEXT, vec BLOB);
CREATE TABLE IF NOT EXISTS labels(sha TEXT PRIMARY KEY, answer TEXT, at REAL);
CREATE TABLE IF NOT EXISTS decisions(sha TEXT PRIMARY KEY, decision TEXT, at REAL);
CREATE TABLE IF NOT EXISTS picks(
  batch TEXT, sha TEXT, kind TEXT, ambiguous INTEGER, grp TEXT, score REAL,
  category TEXT, reasons TEXT, day TEXT, taken TEXT, PRIMARY KEY(batch, sha));
CREATE TABLE IF NOT EXISTS runs(
  batch TEXT PRIMARY KEY, range_from TEXT, range_to TEXT,
  counts TEXT, missing TEXT, created REAL);
CREATE TABLE IF NOT EXISTS sheets(batch TEXT, num INTEGER, sha TEXT, PRIMARY KEY(batch, num));
"""


def open_db(root: Path) -> sqlite3.Connection:
    db = sqlite3.connect(str(Path(root) / "state.sqlite"))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    return db


def pack_vec(v) -> bytes | None:
    if v is None:
        return None
    return array("f", v).tobytes()


def unpack_vec(b) -> array | None:
    """`array('f')` のまま返す。2万枚を list にすると float の箱で 400MB を超える。"""
    if b is None:
        return None
    a = array("f")
    a.frombytes(b)
    return a


def keep_path(root: Path, sha: str) -> Path:
    return Path(root) / "keep" / sha[:2] / f"{sha}.webp"
