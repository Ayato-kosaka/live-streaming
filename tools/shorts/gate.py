"""**ショート動画の承認ゲート。** 人の承認が記録に残っているかを、後段が確かめる口。

    # 後段（本編集・投稿）が、進む前に呼ぶ
    python3 tools/shorts/gate.py require --issue 950 --gate plan  --files work/plan.md
    python3 tools/shorts/gate.py require --issue 950 --gate video --files out/v3.mp4 out/v3.post.json
    python3 tools/shorts/gate.py require --issue 950 --gate video --sha256 <64桁>

    # 提出コメントの機械可読ブロックを作る（版は issue を読んで採番する）
    python3 tools/shorts/gate.py submission --issue 950 --gate plan --options A,B,C work/plan.md
    python3 tools/shorts/gate.py submission --issue 950 --gate video --options A,B,C out/*.mp4 …  # 案ごとの動画
    python3 tools/shorts/gate.py sha256 out/v3.mp4 out/v3.post.json   # 提出物の sha256

    # ワークフロー（.github/workflows/shorts_gate.yml）から
    python3 tools/shorts/gate.py record --event "$GITHUB_EVENT_PATH"

終了コード 0=通った / 1=止めた（理由を出す） / 2=読めなかった（GitHub に届かない・設定が無い・引数が足りない）。

## 何を守るか

ショート動画は、あやとの承認を2回通らないと先へ進めない。

| 関所 | 何を承認するか | 後段がここで止まる |
| --- | --- | --- |
| Gate 1 | 企画（3案から1案、または全部）`/approve plan p2 B`・`/approve plan p2 全部` | 本編集の前 |
| Gate 2 | 完成動画と投稿文 `/approve video v3`（案ごとの動画なら `B`・`B C`・`全部`） | 投稿の前 |
| Gate 3 | Gate 2 で承認された**その版だけ**を投稿する | 投稿の直前（sha256 が1バイトでも違えば止まる） |

## 見分けの肝: 著者の名前では分からない

**このセッション（AI）は、あやと本人のアカウントで GitHub に書いている。**
AI のコメントも `user.login` は `Ayato-kosaka`、`author_association` は `OWNER`。

手がかりは REST の `performed_via_github_app` だけ。Claude の GitHub App を
通って書いたコメントには `{"slug": "claude"}` が入り、あやとが web やスマホで
書いたものは `null`。**ただし `null` は「人間の証明」ではない。**
個人のトークン（PAT）で書けば AI でも `null` になる（#147 の 2026-09-08 に実例）。
つまりここが見分けられるのは「Claude の App を通っていない」まで。
守れること／守れないことは `tools/shorts/gate.md` に書いてある。

## 記録だけを信じない

承認すると `github-actions[bot]` が記録コメントを書く。後段はそれを探すが、
**記録の中身は信じず、元のコメントから導き直して、全部一致したときだけ通す。**
`github-actions[bot]` は他のワークフロー（`call_ayato.yml` など）からも
好きな字を書けるので、bot が書いたことだけでは承認の証明にならない。

- 元の人間のコメントが**まだ在り**、**書き換えられておらず**（`updated_at == created_at`）、
  いまの基準で**同じ判定を通る**こと
- 記録の版・sha256・案（動画は出してよい案の並びも）・承認者・元コメントの id が、
  導き直したものと一致すること
- 承認された版が、その関所の**いちばん新しい提出**のままであること
- 承認のあとに、差し戻し・直しの依頼・読めない記録が**無い**こと
  （差し戻しの記録を消したり書き換えたりして承認を生き返らせる、を止める）

## 機械可読ブロックは本文の1行目

提出も記録も、本文の**頭**に `<!-- shorts-submission {...} -->` /
`<!-- shorts-gate-record {...} -->` を置く。途中に埋まったものは数えない
（`call_ayato.yml` は本文の頭に `@Ayato-kosaka …` を足すので、そこから
記録を偽ることができない）。JSON の中の `<` `>` は `\\u003c` `\\u003e` に
逃がしてあるので、ファイル名に `-->` があってもコメントが途中で閉じない。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
APPROVERS_PATH = REPO_ROOT / "shorts" / "config" / "approvers.json"
DEFAULT_REPO = "Ayato-kosaka/live-streaming"

# ワークフローが見る issue の札。承認の証明には使わない（札は AI でも付けられる）
LABEL = "shorts"

GATES = {
    "plan": {"prefix": "p", "label": "gate1-approved", "ja": "企画"},
    "video": {"prefix": "v", "label": "gate2-approved", "ja": "動画"},
}
VERSION_RE = {g: re.compile(rf"^{v['prefix']}([1-9][0-9]*)$") for g, v in GATES.items()}
SHA_RE = re.compile(r"^[0-9a-f]{64}$")

# 承認・差し戻しを数える関係。CONTRIBUTOR（PR を出したことがあるだけ）や NONE は数えない
TRUSTED_ASSOC = frozenset({"OWNER", "MEMBER", "COLLABORATOR"})

BOT_LOGIN = "github-actions[bot]"
BOT_SLUG = "github-actions"

SUBMISSION_TAG = "shorts-submission"
RECORD_TAG = "shorts-gate-record"
REFUSED_TAG = "shorts-gate-refused"
SCHEMA = 1

# スマホで打ちやすいように、日本語の言いかたも受ける。
# 英字に切り替えずに打てるのは命令と関所まで（版と案は英数字が要る）
CMD_WORDS = {
    "approve": "approve", "承認": "approve",
    "reject": "reject", "却下": "reject", "差し戻し": "reject",
    "revise": "revise", "修正": "revise", "直し": "revise", "直して": "revise",
}
GATE_WORDS = {"plan": "plan", "企画": "plan", "video": "video", "動画": "video"}

# 「全部」の印。企画で3案とも作る・動画で全部の案を出す、を1語で書けるように（#926）。
# 記録には `ALL` と書く（案の字は A〜Z の1文字なので、ぶつからない）
ALL = "ALL"
ALL_WORDS = frozenset({"all", "全部", "ぜんぶ", "全", "全案", "すべて", "全て"})

# 記録と、導き直した判定を突き合わせる欄。時刻と URL は比べない（同じものを指す別の書きかた）。
# `options` は動画の記録にだけある（企画の記録の形は変えない。前に書いた記録も導き直せるように）
MATCH_KEYS = ("kind", "gate", "version", "sha256", "option", "options", "submission_id",
              "approver", "comment_id", "issue")


class Refused(Exception):
    """承認として通さない。`reason` は機械が読む短い名前、文は `explain()` が作る。"""

    def __init__(self, reason: str, **detail):
        super().__init__(reason)
        self.reason = reason
        self.detail = detail

    def __str__(self) -> str:
        return explain(self.reason, self.detail)


class Unreadable(Exception):
    """GitHub に届かない・設定が読めない。止めた（1）と混ぜない（2 で返す）。"""


@dataclass
class Command:
    kind: str                      # approve / reject / revise
    gate: str | None = None
    version: str | None = None
    option: str | None = None      # 企画の案（1文字か ALL）
    options: list = field(default_factory=list)   # 動画の案（書かれた順。ALL も入りうる）
    error: str = ""                # 書式が読めないときの理由の名前


@dataclass
class Sub:
    """提出1本。`broken` が空でなければ、ブロックは在るが中身が読めない。"""
    comment: dict
    gate: str
    version: str
    sha256: str = ""
    files: list = field(default_factory=list)
    options: list | None = None
    broken: str = ""


@dataclass
class Decision:
    ok: bool
    reason: str = ""
    detail: dict = field(default_factory=dict)
    kind: str = ""
    gate: str = ""
    version: str = ""
    option: str | None = None
    # 承認された案の並び。企画は作ってよい案（ALL なら提出の案ぜんぶ）、動画は出してよい案。
    # 案の無い動画の提出なら None（いままでどおり1本）
    options: list | None = None
    sha256: str = ""
    submission_id: int = 0
    submission_url: str = ""
    approver: str = ""
    approver_id: int = 0
    comment_id: int = 0
    comment_url: str = ""
    comment_created_at: str = ""
    issue: int = 0
    record_id: int = 0
    record_url: str = ""


# ---------------------------------------------------------------- コメントの読みかた

def _login(c: dict) -> str:
    return str((c.get("user") or {}).get("login") or "")


def _utype(c: dict) -> str:
    return str((c.get("user") or {}).get("type") or "")


def _app_slug(c: dict) -> str | None:
    app = c.get("performed_via_github_app")
    return (app or {}).get("slug") if app else None


def _cid(c: dict) -> int:
    try:
        return int(c.get("id") or 0)
    except (TypeError, ValueError):
        return 0


def _issue_number(c: dict) -> int:
    m = re.search(r"/issues/(\d+)(?:$|#)", str(c.get("issue_url") or c.get("html_url") or ""))
    return int(m.group(1)) if m else 0


def ordered(comments: list[dict]) -> list[dict]:
    """GitHub のコメント id は増える一方なので、id の順が書かれた順。
    created_at は秒までしか無く、同じ秒に2本あると前後が決まらない。"""
    return sorted(comments, key=_cid)


def before(comments: list[dict], c: dict) -> list[dict]:
    return [x for x in ordered(comments) if _cid(x) < _cid(c)]


# ---------------------------------------------------------------- 守り（1つずつ外せる形にしてある）
#
# 見張り（gate_selftest.py）が、ここを1本ずつ差し替えて「その足だけ落ちる」ことを見る。
# **まとめて1つの関数にしない。** まとめると、どの守りが効いているかが外から見えない。

def _app_ok(c: dict) -> bool:
    """App を通って書かれていない。Claude の App（slug claude）は AI の書き込み。"""
    return c.get("performed_via_github_app") is None


def _named(c: dict, approvers: list[str]) -> bool:
    """名前が承認者の表に在る。**承認の判定には使わない**（AI も同じ名前で書く）。
    止める向き（差し戻しの拾い上げ・偽の記録の数え上げ）にだけ使う。"""
    return _login(c).lower() in {a.lower() for a in approvers}


def _is_approver(c: dict, approvers: list[str]) -> bool:
    return _utype(c) == "User" and _named(c, approvers)


def _assoc_ok(c: dict) -> bool:
    return str(c.get("author_association") or "") in TRUSTED_ASSOC


def _unedited(c: dict) -> bool:
    """人のコメントが書き換えられていない。書き換えは AI にもできる（同じアカウント）。"""
    return bool(c.get("created_at")) and c.get("updated_at") == c.get("created_at")


def _submission_unedited(c: dict) -> bool:
    """提出が書き換えられていない。版は出したら変えない。変えたら次の版にする。"""
    return bool(c.get("created_at")) and c.get("updated_at") == c.get("created_at")


def _record_unedited(c: dict) -> bool:
    """bot の記録が書き換えられていない。オーナーは他人のコメントも書き換えられる。"""
    return bool(c.get("created_at")) and c.get("updated_at") == c.get("created_at")


def _submitter_ok(c: dict, approvers: list[str]) -> bool:
    """提出として数える書き手。AI はあやとのアカウントで書くので、承認者と同じ名前になる。
    外の人の提出を数えると、偽の新しい版で本物の承認を「古い版」にできてしまう。"""
    if _named(c, approvers) and _utype(c) == "User" and _assoc_ok(c):
        return True
    return _login(c) == BOT_LOGIN and _utype(c) == "Bot" and _app_slug(c) == BOT_SLUG


def _is_bot_record(c: dict) -> bool:
    return _login(c) == BOT_LOGIN and _utype(c) == "Bot" and _app_slug(c) == BOT_SLUG


def _is_latest(sub: Sub, subs: list[Sub]) -> bool:
    return bool(subs) and sub is subs[-1]


def _still_latest(d: Decision, latest: Sub) -> bool:
    return d.submission_id == _cid(latest.comment)


def _unique_version(sub: Sub, subs: list[Sub]) -> bool:
    return sum(1 for s in subs if s.version == sub.version) == 1


def _option_ok(option: str, sub: Sub) -> bool:
    return option in (sub.options or [])


def _choice_given(options: list, sub: Sub) -> bool:
    """案ごとの動画（提出に options がある）なら、どれを出すかが書いてある。
    案を書かない `/approve video v1` を「全部」と読まない。出す案は人が決める。"""
    return bool(options) or sub.options is None


def _plan_covers(plan: "Decision | None", option: str) -> bool:
    """動画の案が、いま有効な企画の承認に入っている（企画が `全部` なら企画の案はどれも入る）。
    企画で選ばなかった案の動画を、動画の承認ひとつで出させない。"""
    return plan is not None and option in (plan.options or [])


def _video_options_ok(opts) -> bool:
    """動画の提出の案の並び。無い（案ごとでない動画）か、企画と同じ形（A〜Z の1文字・重ならない）。
    `ALL` や重なった字を案として並べると、何を承認したかが読めなくなる。"""
    return opts is None or _options_valid(opts)


def _manifest_ok(files: list, sha: str) -> bool:
    return manifest_sha(files) == sha


def _sha_matches(d: Decision, sha: str) -> bool:
    return d.sha256 == (sha or "").strip().lower()


def _record_matches(rec: dict, derived: Decision, rec_comment: dict) -> bool:
    if _cid(rec_comment) <= derived.comment_id:
        return False            # 元のコメントより前に書かれた記録はありえない
    want = record_fields(derived)
    for k in MATCH_KEYS:
        a, b = rec.get(k), want.get(k)
        if k == "approver":
            a, b = str(a or "").lower(), str(b or "").lower()
        if a != b:
            return False
    return True


def _source_lookup(by_id: dict[int, dict], rec: dict) -> dict | None:
    try:
        return by_id.get(int(rec.get("comment_id") or 0))
    except (TypeError, ValueError):
        return None


def _decision_for(decisions: list[Decision]) -> Decision | None:
    """その関所の、いちばん新しい判定。承認のあとの差し戻しは承認を消す。"""
    return decisions[-1] if decisions else None


def _no_later_objection(comments: list[dict], d: Decision, gate: str,
                        approvers: list[str], problems: list[tuple[int, str]]) -> bool:
    """承認のあとに、差し戻し・直しの依頼・読めない記録が無い。

    差し戻しの記録が書き換えられた・消された・そもそも書かれなかった（ワークフローが
    落ちた）ときに、前の承認が生き返らないようにする。**疑わしいときは止める側に倒す**——
    止まったぶんは、あやとがもう一度 `/approve` すれば進む。
    """
    if any(rid > d.record_id for rid, _ in problems):
        return False
    for c in ordered(comments):
        if _cid(c) <= d.comment_id or not _named(c, approvers):
            continue
        cmd = parse_command(c.get("body") or "")
        if cmd is None or cmd.kind == "approve":
            continue
        target = cmd.gate
        if target is None:
            last = _latest_any(submissions(before(comments, c), approvers))
            target = last.gate if last else None
        if target in (gate, None):
            return False
    return True


def _approved_plan(comments: list[dict], approvers: list[str]) -> "Decision | None":
    """いまの最新の企画の、有効な承認。無ければ None。動画の案が企画に入っているかを見るのに使う。"""
    try:
        return evaluate(comments, "plan", approvers)
    except Refused:
        return None


def _plan_approved(comments: list[dict], approvers: list[str]) -> bool:
    """企画が、いまの最新の版で承認されている。動画は企画の承認のあとでないと承認しない。"""
    return _approved_plan(comments, approvers) is not None


# ---------------------------------------------------------------- 機械可読ブロック

def find_block(body: str | None, tag: str) -> str | None:
    """本文の**頭**にあるブロックの JSON の字を返す。頭に無ければ None。"""
    m = re.match(rf"\A\s*<!--\s*{re.escape(tag)}\s+(.*?)\s*-->", body or "", re.S)
    return m.group(1) if m else None


def load_block(raw: str | None) -> dict | None:
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def dump_block(tag: str, data: dict) -> str:
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    # `-->` で HTML のコメントが途中で閉じないように。JSON の文法に `<` `>` は出ないので、
    # 字の中のものだけが置き換わる
    text = text.replace("<", "\\u003c").replace(">", "\\u003e")
    return f"<!-- {tag} {text} -->"


# ---------------------------------------------------------------- 提出物の sha256

def file_entry(path: str | Path) -> dict:
    p = Path(path)
    h = hashlib.sha256()
    size = 0
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
            size += len(chunk)
    return {"name": p.name, "sha256": h.hexdigest(), "bytes": size}


def manifest_sha(files: list) -> str:
    """提出物の sha256。ファイルごとの名前・sha256・大きさを並べた manifest の sha256。

    企画なら plan の md 1本、動画なら mp4 と投稿文 JSON の2本。名前も中に入るので、
    名前を変えただけでも別の版になる。並びは名前の順に揃える（渡す順で変わらない）。
    """
    rows = sorted(({"name": f["name"], "sha256": f["sha256"], "bytes": f["bytes"]}
                   for f in files), key=lambda f: f["name"])
    canon = json.dumps({"files": rows}, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def bundle(paths: list[str | Path]) -> dict:
    files = [file_entry(p) for p in paths]
    names = [f["name"] for f in files]
    if not files:
        raise ValueError("ファイルが1本も無い")
    if len(set(names)) != len(names):
        raise ValueError("同じ名前のファイルが2本ある（manifest は名前で並べる）")
    files.sort(key=lambda f: f["name"])
    return {"files": files, "sha256": manifest_sha(files)}


def next_version(comments: list[dict], gate: str) -> str:
    """次の版。書き手を問わず、その関所のブロックの最大の番号 + 1。
    外の人の偽の版も数に入れる（番号がぶつからないように。数えるかどうかは別で決める）。"""
    top = 0
    for c in comments:
        data = load_block(find_block(c.get("body"), SUBMISSION_TAG))
        if not data or data.get("gate") != gate:
            continue
        m = VERSION_RE[gate].match(str(data.get("version") or ""))
        if m:
            top = max(top, int(m.group(1)))
    return f"{GATES[gate]['prefix']}{top + 1}"


def submission_block(gate: str, version: str, files: list,
                     options: list[str] | None = None) -> str:
    """提出コメントの**1行目**に置くブロック。人が読む本文（3案の表など）はこのうしろに続ける。"""
    if gate not in GATES or not VERSION_RE[gate].match(version):
        raise ValueError(f"関所と版が合わない: {gate} {version}")
    data = {"schema": SCHEMA, "gate": gate, "version": version,
            "sha256": manifest_sha(files),
            "files": sorted(files, key=lambda f: f["name"])}
    if gate == "plan":
        opts = options or ["A", "B", "C"]
        if not _options_valid(opts):
            raise ValueError(f"案は A〜Z の1文字で、重ならないこと: {opts}")
        data["options"] = list(opts)
    elif options is not None:
        # 案ごとに作った動画（企画を「全部」で承認したとき）。どれを出すかは Gate 2 で選ぶ
        if not _options_valid(options):
            raise ValueError(f"案は A〜Z の1文字で、重ならないこと: {options}")
        data["options"] = list(options)
    return dump_block(SUBMISSION_TAG, data)


def _options_valid(opts) -> bool:
    return (isinstance(opts, list) and 1 <= len(opts) <= 26
            and all(isinstance(o, str) and re.fullmatch(r"[A-Z]", o) for o in opts)
            and len(set(opts)) == len(opts))


def _files_valid(files) -> bool:
    return (isinstance(files, list) and len(files) >= 1 and all(
        isinstance(f, dict) and isinstance(f.get("name"), str) and f["name"]
        and isinstance(f.get("sha256"), str) and SHA_RE.match(f["sha256"])
        and isinstance(f.get("bytes"), int) and f["bytes"] >= 0
        for f in files))


def parse_submission(c: dict) -> Sub | None:
    data = load_block(find_block(c.get("body"), SUBMISSION_TAG))
    if not data:
        return None
    gate, version = data.get("gate"), data.get("version")
    if gate not in GATES or not isinstance(version, str) or not VERSION_RE[gate].match(version):
        return None
    sub = Sub(comment=c, gate=gate, version=version,
              sha256=str(data.get("sha256") or ""), files=data.get("files") or [],
              options=data.get("options"))
    if not SHA_RE.match(sub.sha256):
        sub.broken = "sha256 が64桁の16進ではありません"
    elif not _files_valid(sub.files):
        sub.broken = "files が読めません"
    elif not _manifest_ok(sub.files, sub.sha256):
        sub.broken = "sha256 が files の中身と合いません"
    elif gate == "plan" and not _options_valid(sub.options):
        sub.broken = "案の並び（options）が読めません"
    elif gate == "video" and not _video_options_ok(sub.options):
        sub.broken = "案の並び（options）が読めません"
    return sub


def submissions(comments: list[dict], approvers: list[str]) -> dict[str, list[Sub]]:
    out: dict[str, list[Sub]] = {g: [] for g in GATES}
    for c in ordered(comments):
        sub = parse_submission(c)
        if sub is not None and _submitter_ok(c, approvers):
            out[sub.gate].append(sub)
    return out


def _latest_any(subs: dict[str, list[Sub]]) -> Sub | None:
    every = [s for lst in subs.values() for s in lst]
    return max(every, key=lambda s: _cid(s.comment)) if every else None


# ---------------------------------------------------------------- 命令の読みかた

def _version(gate: str, tok: str) -> str | None:
    m = re.fullmatch(r"([a-z]?)0*([1-9][0-9]*)", tok.lower())
    if not m:
        return None
    prefix = GATES[gate]["prefix"]
    if m.group(1) not in ("", prefix):
        return None
    return f"{prefix}{m.group(2)}"


def _option(tok: str) -> str | None:
    t = tok.replace("案", "").strip().upper()
    return t if re.fullmatch(r"[A-Z]", t) else None


def _choice(tok: str) -> str | None:
    """案1つ、または「全部」（`ALL`）。"""
    return ALL if tok.strip().lower() in ALL_WORDS else _option(tok)


def _choices(toks: list[str]) -> list[str]:
    """`/approve video v1` のうしろの案。案が続くあいだだけ読み、案でない字が出たらそこで止める
    （そのあとは自由に書いてよい）。`B,C` `B・C` `B、C` も分けて読む。"""
    out: list[str] = []
    for tok in toks:
        got = [_choice(p) for p in re.split(r"[,、・]", tok) if p]
        if not got or None in got:
            break
        out += got
    return out


def parse_command(body: str) -> Command | None:
    """1行目が `/approve` `/reject` `/revise`（とその日本語）で始まるか。違えば None。

    全角のスラッシュ・全角スペース・全角英数字は NFKC で半角に揃える。大文字小文字も問わない
    （スマホの自動大文字で `/Approve` になっても通る）。2行目からは自由に書いてよい。
    """
    line = ""
    for raw in (body or "").splitlines():
        if raw.strip():
            line = unicodedata.normalize("NFKC", raw).strip()
            break
    if not line.startswith("/"):
        return None
    toks = line[1:].split()
    if not toks:
        return None
    kind = CMD_WORDS.get(toks[0].lower())
    if kind is None:
        return None
    rest = toks[1:]
    gate = GATE_WORDS.get(rest[0].lower()) if rest else None
    cmd = Command(kind=kind)

    if kind == "revise":
        # 版を書かなければ、いちばん新しい提出への依頼として読む（スマホで短く打てるように）
        if gate and len(rest) >= 2 and _version(gate, rest[1]):
            cmd.gate, cmd.version = gate, _version(gate, rest[1])
        return cmd

    if gate is None or len(rest) < 2:
        cmd.error = "syntax"
        return cmd
    cmd.gate = gate
    cmd.version = _version(gate, rest[1])
    if cmd.version is None:
        cmd.error = "bad_version"
        return cmd
    if kind == "approve" and gate == "plan":
        cmd.option = _choice(rest[2]) if len(rest) >= 3 else None
        if cmd.option is None:
            cmd.error = "no_option"
    elif kind == "approve" and gate == "video":
        # 案を書いたかどうかは、ここでは咎めない。案の無い提出なら、いままでどおり読み流す
        cmd.options = _choices(rest[2:])
    return cmd


# ---------------------------------------------------------------- 判定

def load_approvers(path: Path = APPROVERS_PATH) -> list[str]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Unreadable(f"承認者の表が読めない: {path}: {e}") from e
    if (not isinstance(data, list) or not data
            or not all(isinstance(x, str) and x.strip() for x in data)):
        raise Unreadable(f"承認者の表は、名前の並び（1人以上）: {path}")
    return [x.strip() for x in data]


def judge(c: dict, prior: list[dict], approvers: list[str]) -> Decision:
    """コメント1本を、それより前のコメントだけを見て判定する。GitHub を触らない。

    ワークフローは書かれた直後に、後段は記録を確かめるときに、**同じ関数**を通す。
    見分けを2か所に書かない。
    """
    cmd = parse_command(c.get("body") or "")
    if cmd is None:
        return Decision(ok=False, reason="not_command")

    def no(reason: str, **detail) -> Decision:
        return Decision(ok=False, reason=reason, detail=detail, kind=cmd.kind,
                        gate=cmd.gate or "", version=cmd.version or "",
                        comment_id=_cid(c))

    # 誰が書いたか（書式より先に見る。AI の `/approve` は書式が正しくても数えない）
    if not _app_ok(c):
        return no("app", slug=_app_slug(c) or "")
    if not _is_approver(c, approvers):
        return no("not_approver")
    if not _assoc_ok(c):
        return no("association")
    if not _unedited(c):
        return no("edited")
    if cmd.error:
        return no(cmd.error, version=cmd.version or "")

    subs = submissions(prior, approvers)
    if cmd.gate is None:            # 版を書かない `/revise`
        last = _latest_any(subs)
        if last is None:
            return no("no_submission", gate="")
        cmd.gate, cmd.version = last.gate, last.version
    lst = subs[cmd.gate]
    if not lst:
        return no("no_submission", gate=cmd.gate)
    target = next((s for s in reversed(lst) if s.version == cmd.version), None)
    if target is None:
        return no("not_found", version=cmd.version, latest=lst[-1].version)
    if not _unique_version(target, lst):
        return no("duplicate", version=cmd.version)
    if not _is_latest(target, lst):
        return no("stale", version=cmd.version, latest=lst[-1].version)
    if not _submission_unedited(target.comment):
        return no("submission_edited", version=cmd.version)
    if target.broken:
        return no("submission_broken", version=cmd.version, why=target.broken)
    chosen: list[str] | None = None
    if cmd.kind == "approve" and cmd.gate == "plan":
        if cmd.option != ALL and not _option_ok(cmd.option or "", target):
            return no("bad_option", version=cmd.version, option=cmd.option,
                      options="・".join(target.options or []))
        chosen = sorted(target.options or []) if cmd.option == ALL else [cmd.option]
    if cmd.kind == "approve" and cmd.gate == "video":
        if not _plan_approved(prior, approvers):
            return no("plan_first")
        if not _choice_given(cmd.options, target):
            return no("choose_option", version=cmd.version,
                      options="・".join(target.options or []))
        if target.options is not None:
            chosen = sorted(set(target.options if ALL in cmd.options else cmd.options))
            bad = next((o for o in chosen if not _option_ok(o, target)), None)
            if bad is not None:
                return no("bad_option", version=cmd.version, option=bad,
                          options="・".join(target.options))
            plan = _approved_plan(prior, approvers)
            miss = [o for o in chosen if not _plan_covers(plan, o)]
            if miss:
                return no("not_in_plan", version=cmd.version, **_cover_detail(miss, plan))

    return Decision(
        ok=True, kind=cmd.kind, gate=cmd.gate, version=cmd.version,
        option=cmd.option if (cmd.kind == "approve" and cmd.gate == "plan") else None,
        options=chosen,
        sha256=target.sha256, submission_id=_cid(target.comment),
        submission_url=str(target.comment.get("html_url") or ""),
        approver=_login(c), approver_id=int((c.get("user") or {}).get("id") or 0),
        comment_id=_cid(c), comment_url=str(c.get("html_url") or ""),
        comment_created_at=str(c.get("created_at") or ""), issue=_issue_number(c),
    )


def _cover_detail(miss: list[str], plan: Decision | None) -> dict:
    return {"option": "・".join(miss), "plan": plan.version if plan else "",
            "covered": "・".join(plan.options or []) if plan else ""}


def records(comments: list[dict]) -> list[tuple[dict, dict]]:
    """頭に記録のブロックを持つコメントを（コメント, 記録）で返す。書き手はここでは問わない。"""
    out = []
    for c in ordered(comments):
        rec = load_block(find_block(c.get("body"), RECORD_TAG))
        if rec is not None:
            out.append((c, rec))
    return out


def evaluate(comments: list[dict], gate: str, approvers: list[str]) -> Decision:
    """その関所の、いま有効な承認を返す。無ければ `Refused`。sha256 はここでは比べない。"""
    comments = ordered(comments)
    by_id = {_cid(c): c for c in comments}
    lst = submissions(comments, approvers)[gate]
    if not lst:
        raise Refused("no_submission", gate=gate)
    latest = lst[-1]

    decisions: list[Decision] = []
    problems: list[tuple[int, str]] = []
    for c, rec in records(comments):
        if rec.get("gate") != gate:
            continue
        if not _is_bot_record(c):
            # 外の人が書いた偽の記録は、問題としても数えない（数えると、外から承認を止められる）
            if _named(c, approvers):
                problems.append((_cid(c), "fake_record"))
            continue
        if not _record_unedited(c):
            problems.append((_cid(c), "record_edited"))
            continue
        src = _source_lookup(by_id, rec)
        if src is None:
            problems.append((_cid(c), "source_deleted"))
            continue
        if not _unedited(src):
            problems.append((_cid(c), "source_edited"))
            continue
        derived = judge(src, before(comments, src), approvers)
        if not derived.ok:
            problems.append((_cid(c), "source_invalid:" + derived.reason))
            continue
        if not _record_matches(rec, derived, c):
            problems.append((_cid(c), "record_mismatch"))
            continue
        derived.record_id = _cid(c)
        derived.record_url = str(c.get("html_url") or "")
        decisions.append(derived)

    d = _decision_for(decisions)
    if d is None:
        if problems:
            code = problems[-1][1]
            if code.startswith("source_invalid:"):
                raise Refused("source_invalid", gate=gate, why=code.split(":", 1)[1])
            raise Refused(code, gate=gate)
        raise Refused("no_record", gate=gate, latest=latest.version)
    if d.kind == "reject":
        raise Refused("rejected", gate=gate, version=d.version, url=d.comment_url)
    if d.kind == "revise":
        raise Refused("revise_requested", gate=gate, version=d.version, url=d.comment_url)
    if not _still_latest(d, latest):
        raise Refused("newer", gate=gate, approved=d.version, latest=latest.version)
    if not _no_later_objection(comments, d, gate, approvers, problems):
        raise Refused("objection", gate=gate, version=d.version)
    if gate == "video" and not _plan_approved(comments, approvers):
        raise Refused("plan_first", gate=gate)
    if gate == "video" and d.options is not None:
        # 動画を承認したあとで企画の承認が別の案に変わっていたら、出す前に止める
        plan = _approved_plan(comments, approvers)
        miss = [o for o in d.options if not _plan_covers(plan, o)]
        if miss:
            raise Refused("not_in_plan", gate=gate, version=d.version, **_cover_detail(miss, plan))
    return d


def require_approval(issue: int, gate: str, sha256: str, *, comments: list[dict] | None = None,
                     approvers: list[str] | None = None, api: "GitHub | None" = None) -> Decision:
    """**後段が進む前に呼ぶ。** 承認された版の sha256 と一致したときだけ返す。違えば `Refused`。

    `comments` を渡さなければ、issue のコメントを REST で読む（公開なので鍵が無くても読める）。
    """
    if gate not in GATES:
        raise Unreadable(f"関所は plan か video: {gate}")
    approvers = approvers if approvers is not None else load_approvers()
    if comments is None:
        comments = (api or GitHub()).list_comments(issue)
    d = evaluate(comments, gate, approvers)
    if not _sha_matches(d, sha256):
        raise Refused("sha", gate=gate, version=d.version, approved=d.sha256,
                      given=(sha256 or "").strip().lower())
    return d


# ---------------------------------------------------------------- 文（短く、何をすればよいかだけ）

EXAMPLES = "`/approve plan p2 B`・`/approve video v3`・`/reject video v3 理由`・`/revise 直してほしい点`"


def explain(reason: str, d: dict) -> str:
    g = GATES.get(d.get("gate") or "", {}).get("ja", "")
    v = d.get("version") or ""
    texts = {
        # ---- 書かれた直後（ワークフローが返す）
        "app": "Claude の App から書かれたコメントは承認として数えません。"
               "あやとが GitHub の画面（web・スマホ）から書いてください。",
        "not_approver": "承認・差し戻しができるのは `shorts/config/approvers.json` に載っている人だけです。",
        "association": "このリポジトリのオーナー・メンバー・共同作業者のコメントだけを数えます。",
        "edited": "書き換えたコメントは数えません。新しいコメントで書き直してください。",
        "syntax": f"書式が読めませんでした。例: {EXAMPLES}",
        "bad_version": "版が読めませんでした。企画は p（例 `p2`）、動画は v（例 `v3`）で始まります。",
        "no_option": (f"案を1つ選んでください（全部作るなら `全部`）。"
                      f"例: `/approve plan {v or 'p2'} B`・`/approve plan {v or 'p2'} 全部`"),
        "bad_option": f"{d.get('option')} は {v} の案にありません（{d.get('options')} から選んでください）。",
        "choose_option": (f"{v} は案ごとに作った動画です（{d.get('options')}）。出す案を書いてください。"
                          f"例: `/approve video {v or 'v3'} B`・いくつかなら `/approve video {v or 'v3'} B C`"
                          f"・全部なら `/approve video {v or 'v3'} 全部`"),
        "not_in_plan": (f"{d.get('option')} は、企画{' ' + d['plan'] + ' ' if d.get('plan') else ''}で"
                        f"承認した案（{d.get('covered') or 'なし'}）に入っていません。"
                        f"{d.get('covered') or '企画で承認した案'} から選ぶか、先に企画を承認し直してください。"),
        "not_found": f"{v} の提出が見つかりません。いまの最新は {d.get('latest')} です。",
        "duplicate": f"{v} の提出が2つあります。出し直しを待ってください。",
        "stale": f"{v} は古い版です。最新の {d.get('latest')} を見てから書いてください。",
        "submission_edited": f"{v} の提出が書き換えられています。出し直しを待ってください。",
        "submission_broken": f"{v} の提出が読めません（{d.get('why')}）。出し直しを待ってください。",
        "plan_first": "企画の承認がまだです（または企画の新しい版が出ています）。先に企画を承認してください。",
        "no_submission": f"{g + 'の' if g else ''}提出がまだありません。",
        "no_label": f"この issue には `{LABEL}` の札が無いので、数えません。",
        # ---- 後段が確かめるとき
        "no_record": f"{g}の承認の記録がありません（最新は {d.get('latest')}）。あやとの `/approve` を待ってください。",
        "fake_record": "github-actions 以外が書いた承認の記録しかありません。あやとの `/approve` を待ってください。",
        "record_edited": "承認の記録が書き換えられています。もう一度 `/approve` してもらってください。",
        "source_deleted": "承認した元のコメントが消えています。もう一度 `/approve` してもらってください。",
        "source_edited": "承認した元のコメントが書き換えられています。もう一度 `/approve` してもらってください。",
        "source_invalid": f"元のコメントが、いまは承認になりません（{d.get('why')}）。",
        "record_mismatch": "承認の記録が、元のコメントと提出の中身に合いません。もう一度 `/approve` してもらってください。",
        "rejected": f"{g} {v} は差し戻されています。出し直してください。",
        "revise_requested": f"{g} {v} に直しの依頼が出ています。直して出し直してください。",
        "newer": f"{d.get('approved')} のあとに {d.get('latest')} が出ています。{d.get('latest')} の承認を待ってください。",
        "objection": "承認のあとに、差し戻し・直しの依頼か、読めない記録があります。もう一度承認を待ってください。",
        "sha": (f"承認された {v} と中身が違います（承認 {str(d.get('approved'))[:12]}… / "
                f"いま {str(d.get('given'))[:12]}…）。変えたなら出し直して、承認を取り直してください。"),
    }
    return texts.get(reason, f"承認として数えません（{reason}）。")


def record_fields(d: Decision) -> dict:
    out = {
        "schema": SCHEMA, "kind": d.kind, "gate": d.gate, "version": d.version,
        "sha256": d.sha256, "option": d.option, "submission_id": d.submission_id,
        "approver": d.approver, "approver_id": d.approver_id,
        "comment_id": d.comment_id, "comment_url": d.comment_url,
        "comment_created_at": d.comment_created_at, "issue": d.issue,
    }
    # 出してよい案は動画の記録にだけ書く。企画は `option`（1文字か ALL）で足り、
    # 案の無い動画の記録も、いままでと同じ形のままにする
    if d.gate == "video" and d.options is not None:
        out["options"] = list(d.options)
    return out


def _chosen_text(d: Decision) -> str:
    """記録の見出しに出す、選ばれた案。案の無いものは空。"""
    if d.gate == "plan" and d.option == ALL:
        return f"全部の案（{'・'.join(d.options or [])}）"
    if d.gate == "plan" and d.option:
        return f"{d.option}案"
    if d.options:
        return "・".join(f"{o}案" for o in d.options)
    return ""


# `require` が出す欄。後段（投稿）は `options` に並んだ案だけを出す。
# 企画の `option` は前からの形（1文字か ALL）のまま残す
REQUIRE_KEYS = ("gate", "version", "option", "options", "sha256", "approver", "comment_url",
                "record_url", "issue")


def approval_summary(d: Decision) -> dict:
    return {k: v for k, v in asdict(d).items() if k in REQUIRE_KEYS}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def record_body(d: Decision, recorded_at: str) -> str:
    g = GATES[d.gate]["ja"]
    chosen = _chosen_text(d)
    sep = " " if chosen[:1].isascii() else ""      # 「の B案」「の全部の案」
    head = {
        "approve": (f"**{g} {d.version} の{sep}{chosen}を、承認として記録しました。**"
                    if chosen else f"**{g} {d.version} を、承認として記録しました。**"),
        "reject": f"**{g} {d.version} の差し戻しを記録しました。**",
        "revise": f"**{g} {d.version} への直しの依頼を記録しました。**",
    }[d.kind]
    lines = [dump_block(RECORD_TAG, {**record_fields(d), "recorded_at": recorded_at}),
             head, "",
             f"- 書いた人: {d.approver}（[元のコメント]({d.comment_url})）",
             f"- 提出: [{d.version}]({d.submission_url})・sha256 `{d.sha256[:12]}`"]
    if d.kind == "approve" and d.gate == "video" and d.options:
        lines.append(f"- 投稿してよいのは {chosen}だけです。")
    if d.kind == "approve":
        lines.append("- この版から1バイトでも変わったら、もう一度承認が要ります。")
    return "\n".join(lines)


def refusal_body(reason: str, detail: dict, comment_id: int, **extra) -> str:
    data = {"schema": SCHEMA, "reason": reason, "comment_id": comment_id, **extra}
    return "\n".join([dump_block(REFUSED_TAG, data),
                      f"**数えませんでした。** {explain(reason, detail)}"])


# ---------------------------------------------------------------- GitHub の口

class GitHub:
    """REST を urllib で叩く。鍵は `GITHUB_TOKEN` / `GH_TOKEN`。

    読むときは、鍵が断られたら（401）鍵無しで読み直す。このリポジトリは公開で、
    鍵の切れたセッションからでも後段が承認を確かめられるようにするため。書くときは鍵が要る。
    """

    def __init__(self, repo: str | None = None, token: str | None = None):
        self.repo = repo or os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPO
        self.token = token if token is not None else (
            os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "")

    def _call(self, method: str, path: str, body: dict | None = None,
              auth: bool = True) -> tuple[int, object]:
        url = path if path.startswith("https://") else f"https://api.github.com{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if auth and self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw.strip() else None)
        except urllib.error.HTTPError as e:
            if e.code == 401 and auth and self.token and method == "GET":
                return self._call(method, path, body, auth=False)
            return e.code, None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            raise Unreadable(f"GitHub に届かない: {method} {path}: {e}") from e

    def get_comment(self, cid: int) -> dict | None:
        st, data = self._call("GET", f"/repos/{self.repo}/issues/comments/{int(cid)}")
        if st == 404:
            return None
        if st != 200 or not isinstance(data, dict):
            raise Unreadable(f"コメントが読めない（{st}）: {cid}")
        return data

    def list_comments(self, issue: int) -> list[dict]:
        out: list[dict] = []
        for page in range(1, 51):
            st, data = self._call(
                "GET", f"/repos/{self.repo}/issues/{int(issue)}/comments?per_page=100&page={page}")
            if st != 200 or not isinstance(data, list):
                raise Unreadable(f"issue #{issue} のコメントが読めない（{st}）")
            out += data
            if len(data) < 100:
                return out
        raise Unreadable(f"issue #{issue} のコメントが多すぎて読み切れない")

    def post_comment(self, issue: int, body: str) -> dict:
        st, data = self._call("POST", f"/repos/{self.repo}/issues/{int(issue)}/comments",
                              {"body": body})
        if st != 201 or not isinstance(data, dict):
            raise Unreadable(f"issue #{issue} に書けない（{st}）")
        return data

    def add_labels(self, issue: int, labels: list[str]) -> None:
        st, _ = self._call("POST", f"/repos/{self.repo}/issues/{int(issue)}/labels",
                           {"labels": labels})
        if st != 200:
            raise Unreadable(f"issue #{issue} に札を付けられない（{st}）")

    def remove_label(self, issue: int, label: str) -> None:
        name = urllib.parse.quote(label, safe="")
        st, _ = self._call("DELETE", f"/repos/{self.repo}/issues/{int(issue)}/labels/{name}")
        if st not in (200, 404):        # 付いていなければ 404。外れているので良い
            raise Unreadable(f"issue #{issue} の札を外せない（{st}）")


# ---------------------------------------------------------------- ワークフローの受け口

def handle_event(event: dict, api, approvers, recorded_at: str | None = None) -> str:
    """`issue_comment` の受け取りを1本見て、記録か断りを書く。返すのは要約の1行。

    **本文はログに出さない**（公開のログ）。要約に出すのは番号と理由の名前だけ。
    対象外のコメントでは GitHub の口を1回も叩かない。

    `approvers` は並びか、並びを返す関数。関数なら**対象のコメントのときだけ**読む
    （表が読めない日に、関係ない issue のコメントまで全部赤くしない）。
    """
    issue = event.get("issue") or {}
    comment = event.get("comment") or {}
    number = int(issue.get("number") or 0)
    cid = _cid(comment)
    body = comment.get("body") or ""
    if event.get("action") != "created" or issue.get("pull_request") or not number or not cid:
        return f"対象外（#{number}）"
    cmd = parse_command(body)
    has_sub = find_block(body, SUBMISSION_TAG) is not None
    if cmd is None and not has_sub:
        return f"対象外（#{number} コメント {cid}）"
    if callable(approvers):
        approvers = approvers()

    labels = {str((x or {}).get("name") or "") for x in issue.get("labels") or []}
    if LABEL not in labels:
        # 札の無い issue で返事をするのは、承認者の名前で書かれた命令にだけ。
        # 外の人の `/approve` に毎回返すと、外から bot を喋らせられる
        if cmd is None or not _named(comment, approvers):
            return f"対象外（#{number} は {LABEL} の札なし）"
        api.post_comment(number, refusal_body("no_label", {}, cid))
        return f"#{number} コメント {cid}: 断った（no_label）"

    # **受け取りの中身ではなく、いまの姿を読み直して判定する。**
    # 書かれてから走るまでのあいだに書き換え・削除があれば、ここで分かる
    fresh = api.get_comment(cid)
    if fresh is None:
        return f"#{number} コメント {cid}: もう消えていた"
    comments = api.list_comments(number)
    if all(_cid(c) != cid for c in comments):
        comments.append(fresh)
    prior = before(comments, fresh)

    if cmd is None:
        return _handle_submission(fresh, prior, number, api, approvers)

    d = judge(fresh, prior, approvers)
    if not d.ok:
        api.post_comment(number, refusal_body(d.reason, {**d.detail, "gate": d.gate}, cid,
                                              gate=d.gate or None, version=d.version or None))
        return f"#{number} コメント {cid}: 断った（{d.reason}）"
    api.post_comment(number, record_body(d, recorded_at or now_iso()))
    label = GATES[d.gate]["label"]
    if d.kind == "approve":
        api.add_labels(number, [label])
    else:
        api.remove_label(number, label)
    if d.gate == "plan" and d.kind != "approve":
        api.remove_label(number, GATES["video"]["label"])
    return f"#{number} コメント {cid}: 記録した（{d.gate} {d.version} {d.kind}）"


def _handle_submission(c: dict, prior: list[dict], number: int, api,
                       approvers: list[str]) -> str:
    """新しい提出が来たら、その関所の承認の札を外す（札が古い版の承認を指したままにしない）。
    札は飾りで、後段は記録を読む。外の人の提出には返事をしない（返すと外から bot を喋らせられる）。"""
    cid = _cid(c)
    if not _submitter_ok(c, approvers):
        return f"#{number} コメント {cid}: 外の人の提出なので数えない"
    sub = parse_submission(c)
    if sub is None:
        api.post_comment(number, refusal_body(
            "submission_broken", {"version": "?", "why": "ブロックの JSON・関所・版が読めません"},
            cid, kind="submission"))
        return f"#{number} コメント {cid}: 提出が読めない"
    if sub.broken:
        api.post_comment(number, refusal_body(
            "submission_broken", {"version": sub.version, "why": sub.broken}, cid,
            kind="submission", gate=sub.gate, version=sub.version))
        return f"#{number} コメント {cid}: 提出が読めない（{sub.gate} {sub.version}）"
    if any(s.version == sub.version for s in submissions(prior, approvers)[sub.gate]):
        api.post_comment(number, refusal_body(
            "duplicate", {"version": sub.version}, cid,
            kind="submission", gate=sub.gate, version=sub.version))
        return f"#{number} コメント {cid}: 同じ版がもうある（{sub.gate} {sub.version}）"
    api.remove_label(number, GATES[sub.gate]["label"])
    if sub.gate == "plan":
        # 企画が変われば、動画の承認も前の企画に乗ったものになる
        api.remove_label(number, GATES["video"]["label"])
    return f"#{number} コメント {cid}: 提出を受けた（{sub.gate} {sub.version}）"


# ---------------------------------------------------------------- CLI

def _summary(line: str) -> None:
    print(line)
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="ショート動画の承認ゲート")
    sp = ap.add_subparsers(dest="cmd", required=True)

    r = sp.add_parser("require", help="承認されているかを確かめる（後段が呼ぶ）")
    r.add_argument("--issue", type=int, required=True)
    r.add_argument("--gate", choices=sorted(GATES), required=True)
    g = r.add_mutually_exclusive_group(required=True)
    g.add_argument("--sha256")
    g.add_argument("--files", nargs="+")

    s = sp.add_parser("submission", help="提出コメントの1行目に置くブロックを作る")
    s.add_argument("--issue", type=int, required=True)
    s.add_argument("--gate", choices=sorted(GATES), required=True)
    s.add_argument("--options", default=None,
                   help="案。企画は既定 A,B,C。動画は案ごとに作ったときだけ付ける（例 A,B,C）")
    s.add_argument("files", nargs="+")

    h = sp.add_parser("sha256", help="提出物の sha256（manifest）を出す")
    h.add_argument("files", nargs="+")

    e = sp.add_parser("record", help="issue_comment の受け取りを見て記録する（ワークフロー用）")
    e.add_argument("--event", required=True)

    a = ap.parse_args(argv)
    try:
        if a.cmd == "sha256":
            print(json.dumps(bundle(a.files), ensure_ascii=False, indent=1))
            return 0
        if a.cmd == "submission":
            b = bundle(a.files)
            comments = GitHub().list_comments(a.issue)
            version = next_version(comments, a.gate)
            opts = (None if a.options is None
                    else [o.strip().upper() for o in a.options.split(",") if o.strip()])
            print(submission_block(a.gate, version, b["files"], opts))
            return 0
        if a.cmd == "require":
            sha = a.sha256 or bundle(a.files)["sha256"]
            try:
                d = require_approval(a.issue, a.gate, sha)
            except Refused as x:
                print(f"止めました（{x.reason}）: {x}")
                return 1
            print(json.dumps(approval_summary(d), ensure_ascii=False, indent=1))
            return 0
        if a.cmd == "record":
            with open(a.event, encoding="utf-8") as f:
                event = json.load(f)
            _summary(handle_event(event, GitHub(), load_approvers))
            return 0
    except Unreadable as x:
        print(f"読めませんでした: {x}")
        return 2
    except (OSError, ValueError) as x:
        print(f"読めませんでした: {x}")
        return 2
    return 2


if __name__ == "__main__":
    sys.exit(main())
