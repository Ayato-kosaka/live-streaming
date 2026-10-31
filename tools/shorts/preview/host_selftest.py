"""**下見を配る段（`host.py` の place / settle / delete / listing）の見張り。Hosting にも外にも出ない。**

    python3 tools/shorts/preview/host_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。

## 何を見るか

片づけの決まりそのものは `channels_selftest.py` が見る。ここは**決まりが配りの道に繋がっているか**を見る。
2026-10-31 に上限で落ちたのは、2つの道（put.py の `host.up` と書き出しの `remote.py preview`）が
どちらも「作るだけで片づけない」形だったから。片方だけ繋いでも、もう片方がまた溜める。

firebase-tools は偽物（`tools/node_modules/.bin/firebase` に置いた Python。引数を控えて、成功か
上限の字を返す）、Hosting の REST は偽の API（手元の表）で回す。

| 足 | 確かめること |
| --- | --- |
| `place_tidies_first` | 配る前に期限切れを消し、上限が近ければ下書きを消してから `hosting:channel:deploy sp-<乱数> --expires 7d` を1回だけ起こし、札を付ける |
| `place_draft_short` | 下書きの名前なら `--expires 1d` で配る |
| `place_quota_words` | 上限で落ちたら、理由の字（429・quota）とそのときの数を添えて落ちる。字に URL もチャンネル名も残らない |
| `place_api_down` | 一覧が読めなくても配りは続ける（札も付けに行く） |
| `settle_ok_retires` | 確かめが通れば、同じ回の古い版を消す（別の回の最新・本番 live は残す） |
| `settle_bad_keeps` | 確かめで落ちた版は、前の版を消さない |
| `delete_by_sha` | sha256 の並びで消す。下見の形のものだけを消し、live は断り、無いものは「もう無い」と返す |
| `listing_rows` | 数える段は sha256・時刻・札だけを返し、ログに URL もチャンネル名も出さない |
| `both_paths_wired` | 2つの道がどちらも `host.place` と `host.settle` を通る。`hosting:channel:deploy` を起こすのは `host.place` の1か所だけ（録画を受け取るページ `upload/serve.py` は下見ではないので名指しで外す） |
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "ingest"))
import channels as ch  # noqa: E402
import host  # noqa: E402
from req import Bad  # noqa: E402

FAILS: list[str] = []
NOW = dt.datetime.now(dt.timezone.utc)

FAKE_FB = r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ["FAKE_FB_LOG"], "a") as f:
    f.write(json.dumps(args) + "\n")
if os.environ.get("FAKE_FB") == "quota":
    print(json.dumps({"status": "error", "error": "Request to https://firebasehosting.googleapis.com/v1beta1/"
        "projects/live-streaming-d3cac/sites/live-streaming-d3cac/channels?channelId=" + args[1] +
        " had HTTP Error: 429, Couldn't create channel on `projects/live-streaming-d3cac/sites/"
        "live-streaming-d3cac/channels/" + args[1] + "`: channel quota reached."}))
    sys.stderr.write("[error] HTTP Error: 429 ya29.a0AfH6SMBsecretsecretsecret " + args[1] + "\n")
    sys.exit(1)
print(json.dumps({"status": "success", "result": {"live-streaming-d3cac": {
    "site": "live-streaming-d3cac", "url": "https://live-streaming-d3cac--" + args[1] + "-abcd1234.web.app",
    "expireTime": "2026-11-07T00:00:00Z"}}}))
'''


def check(leg: str, cond: bool, what: str) -> None:
    if not cond:
        FAILS.append(f"{leg}: {what}")


def ts(h: float) -> str:
    return (NOW + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%S.000000001Z")


def chan(i: int, name: str | None, made_h: float, life_h: float = 24 * 7) -> dict:
    c = f"sp-{i:020x}"
    d = {"name": f"sites/{ch.SITE}/channels/{c}", "url": f"https://{ch.SITE}--{c}-abcd1234.web.app",
         "createTime": ts(made_h), "expireTime": ts(made_h + life_h)}
    if name:
        d["labels"] = ch.labels_for(name)
    return d


LIVE = {"name": f"sites/{ch.SITE}/channels/live", "url": f"https://{ch.SITE}.web.app",
        "createTime": "2025-02-07T11:39:00Z"}


class FakeApi:
    def __init__(self, chans, list_fails: bool = False):
        self.chans = [dict(c) for c in chans]
        self.deleted: list[str] = []
        self.labelled: list[tuple[str, dict]] = []
        self.list_fails = list_fails

    def list(self):
        if self.list_fails:
            raise RuntimeError("一覧が読めない")
        return [dict(c) for c in self.chans]

    def delete(self, c):
        if c == "live" or not ch.CHANNEL.match(c):
            raise RuntimeError("形が違う")
        self.deleted.append(c)
        self.chans = [x for x in self.chans if ch.cid(x) != c]

    def label(self, c, labels):
        # 本物では配った時点でチャンネルが在る。偽物では札を付けるときに一覧へ足す（作った時刻はいま）
        self.labelled.append((c, dict(labels)))
        for x in self.chans:
            if ch.cid(x) == c:
                x["labels"] = dict(labels)
                return
        self.chans.append({"name": f"sites/{ch.SITE}/channels/{c}", "labels": dict(labels),
                           "url": f"https://{ch.SITE}--{c}-abcd1234.web.app",
                           "createTime": ts(0.001), "expireTime": ts(24 * 7)})


class Box:
    """偽の firebase-tools を置いた一時の場所。"""

    def __init__(self, mode: str = "ok"):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name)
        exe = self.root / "tools/node_modules/.bin/firebase"
        exe.parent.mkdir(parents=True)
        exe.write_text(FAKE_FB, encoding="utf-8")
        exe.chmod(0o755)
        (self.root / "site").mkdir()
        self.log = self.root / "fb.log"
        os.environ["FAKE_FB_LOG"] = str(self.log)
        os.environ["FAKE_FB"] = mode

    def calls(self) -> list[list[str]]:
        if not self.log.is_file():
            return []
        return [json.loads(x) for x in self.log.read_text(encoding="utf-8").splitlines() if x]

    def place(self, name: str, api) -> tuple[dict | None, str, Exception | None]:
        buf = io.StringIO()
        err = None
        out = None
        with contextlib.redirect_stdout(buf):
            try:
                out = host.place(self.root / "tools", self.root / "site", name, self.root / "deploy.log", api=api)
            except Exception as e:  # noqa: BLE001
                err = e
        return out, buf.getvalue(), err

    def close(self):
        self.td.cleanup()


def crowded(extra: list[dict]) -> list[dict]:
    """下見が CAP - ROOM + 1 本になるまで、別の回の最新で埋める。期限切れ1本を消しても、
    配れば CAP - ROOM を1本越えるので、下書きをもう1本消さないといけない数。"""
    n = ch.CAP - ch.ROOM + 1 - len(extra)
    return [LIVE] + extra + [chan(500 + i, f"ep{i}-p1-v1", -30 + i * 0.01) for i in range(n)]


def leg_place_tidies_first() -> None:
    gone = chan(1, "old-p1-v1", -24 * 8)
    draft = chan(2, "york-p2-v7d1", -3)
    latest = chan(3, "york-p2-v6", -4)
    api = FakeApi(crowded([gone, draft, latest]))
    b = Box()
    try:
        out, log, err = b.place("york-p2-v7", api)
        check("place_tidies_first", err is None, f"落ちた: {err}")
        if err:
            return
        calls = b.calls()
        check("place_tidies_first", len(calls) == 1, f"firebase を {len(calls)}回起こした")
        args = calls[0] if calls else []
        check("place_tidies_first", args[:1] == ["hosting:channel:deploy"] and len(args) > 3
              and bool(ch.CHANNEL.match(args[1])) and args[2:4] == ["--expires", "7d"]
              and "--project" in args and args[args.index("--project") + 1] == ch.PROJECT,
              f"配りの引数: {args}")
        check("place_tidies_first", set(api.deleted) == {ch.cid(gone), ch.cid(draft)},
              f"配る前に消したもの: {api.deleted}")
        check("place_tidies_first", ch.cid(latest) not in api.deleted and "live" not in api.deleted,
              "最新の版か live を消した")
        check("place_tidies_first", api.labelled and api.labelled[-1][0] == args[1]
              and api.labelled[-1][1] == ch.labels_for("york-p2-v7"), f"札: {api.labelled}")
        check("place_tidies_first", out["channel"] == args[1] and out["labelled"]
              and out["url"].endswith(".web.app") and out["expires"] == "7d"
              and out["tidy"]["dead"] == 1 and len(out["tidy"]["room"]) == 1, f"返したもの: {out}")
        check("place_tidies_first", "web.app" not in log and args[1] not in log, f"ログに URL か名前: {log}")
    finally:
        b.close()


def leg_place_draft_short() -> None:
    b = Box()
    try:
        out, _, err = b.place("leeds-p3-v4d1", FakeApi([LIVE]))
        args = (b.calls() or [[]])[0]
        check("place_draft_short", err is None and args[2:4] == ["--expires", "1d"] and out["expires"] == "1d",
              f"下書きの寿命: {args[2:4]} / {err}")
    finally:
        b.close()


def leg_place_quota_words() -> None:
    b = Box("quota")
    try:
        api = FakeApi([LIVE] + [chan(10 + i, f"ep{i}-p1-v1", -10) for i in range(ch.CAP)])
        out, log, err = b.place("york-p2-v7", api)
        msg = str(err)
        check("place_quota_words", isinstance(err, Bad), f"上限で Bad にならない: {type(err).__name__} {err}")
        check("place_quota_words", "429" in msg and "channel quota reached" in msg
              and f"上限 {ch.CAP}" in msg and f"配る前 {ch.CAP}本" in msg, f"字: {msg}")
        check("place_quota_words", "https://" not in msg and not re.search(r"sp-[0-9a-f]{20}", msg)
              and "ya29" not in msg, f"字に秘密が残る: {msg}")
        check("place_quota_words", api.deleted == [] and api.labelled == [],
              f"最新しか無いのに消した・落ちたのに札を付けた: {api.deleted} {api.labelled}")
    finally:
        b.close()


def leg_place_api_down() -> None:
    b = Box()
    try:
        api = FakeApi([LIVE], list_fails=True)
        out, log, err = b.place("york-p2-v7", api)
        check("place_api_down", err is None and len(b.calls()) == 1, f"一覧が読めないと配らない: {err}")
        check("place_api_down", out is not None and out["labelled"] and "error" in out["tidy"],
              f"札か片づけの結果: {out}")
        check("place_api_down", "片づけができなかった" in log, f"知らせない: {log}")
    finally:
        b.close()


def leg_settle() -> None:
    v6 = chan(1, "york-p2-v6", -4)
    v5 = chan(2, "york-p2-v5", -5)
    a4 = chan(3, "edinburgh-p2A-v4", -6)
    raw = chan(4, None, -7)
    for ok in (True, False):
        api = FakeApi([LIVE, v5, v6, a4, raw])
        b = Box()
        try:
            placed, _, err = b.place("york-p2-v7", api)
            if err:
                check("settle_ok_retires" if ok else "settle_bad_keeps", False, f"配れない: {err}")
                continue
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                r = host.settle(placed, "york-p2-v7", ok)
            left = {ch.cid(c) for c in api.list()}
            if ok:
                check("settle_ok_retires", set(api.deleted) == {ch.cid(v5), ch.cid(v6)} and len(r["retired"]) == 2,
                      f"消したもの: {api.deleted} / {r}")
                check("settle_ok_retires", {"live", ch.cid(a4), ch.cid(raw), placed["channel"]} <= left,
                      f"残るはずのもの: {sorted(left)}")
            else:
                check("settle_bad_keeps", api.deleted == [] and r["retired"] == [],
                      f"落ちた版で前の版を消した: {api.deleted}")
        finally:
            b.close()


def leg_delete_by_sha() -> None:
    keep = chan(1, "york-p2-v6", -4)
    old = chan(2, "york-p2-v5", -5)
    old2 = chan(3, None, -6)
    api = FakeApi([LIVE, keep, old, old2])
    real_api, real_gone = ch.Api, host.gone_after
    ch.Api = lambda: api  # type: ignore[assignment]
    host.gone_after = lambda urls, limit=120: {u: 404 for u in urls}  # type: ignore[assignment]
    try:
        want = [ch.sha(ch.cid(old)), ch.sha(ch.cid(old2)), ch.sha("sp-" + "e" * 20)]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            body, _ = host.delete({"name": "pv-delete-x", "channel_sha256": want}, Path("."))
        rows = {r["channel_sha256"]: r for r in body["results"]}
        check("delete_by_sha", set(api.deleted) == {ch.cid(old), ch.cid(old2)}, f"消したもの: {api.deleted}")
        check("delete_by_sha", rows[want[2]]["deleted"] is False and rows[want[2]]["gone"] is True,
              f"無いもの: {rows[want[2]]}")
        check("delete_by_sha", body["ok"] is True and all(rows[w]["gone"] for w in want[:2]), f"結果: {body}")
        with contextlib.redirect_stdout(io.StringIO()):
            body, _ = host.delete({"name": "pv-delete-y", "channel_sha256": ch.sha("live")}, Path("."))
        check("delete_by_sha", "live" not in api.deleted and body["ok"] is False and body["deleted"] is False,
              f"live を消した・断ったのに ok: {body}")
        check("delete_by_sha", "web.app" not in buf.getvalue() and "sp-0" not in buf.getvalue(),
              f"ログに URL かチャンネル名: {buf.getvalue()}")
    finally:
        ch.Api, host.gone_after = real_api, real_gone


def leg_listing_rows() -> None:
    api = FakeApi([LIVE, chan(1, "york-p2-v6", -4), chan(2, None, -24 * 8)])
    real = ch.Api
    ch.Api = lambda: api  # type: ignore[assignment]
    try:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            body, _ = host.listing({"name": "pv-list-x"})
        blob = json.dumps(body, ensure_ascii=False)
        check("listing_rows", body["census"]["all"] == 3 and body["census"]["dead"] == 1
              and len(body["channels"]) == 3, f"数: {body['census']}")
        check("listing_rows", "web.app" not in blob and "sp-0" not in blob, "結果に URL かチャンネル名")
        check("listing_rows", "web.app" not in buf.getvalue() and "sp-0" not in buf.getvalue()
              and "チャンネル 3本" in buf.getvalue(), f"ログ: {buf.getvalue()}")
    finally:
        ch.Api = real


def leg_both_paths_wired() -> None:
    host_src = (HERE / "host.py").read_text(encoding="utf-8")
    remote_src = (HERE.parent / "render/remote.py").read_text(encoding="utf-8")

    def body_of(src: str, fn: str) -> str:
        m = re.search(rf"^def {fn}\(.*?(?=^def |\Z)", src, re.S | re.M)
        return m.group(0) if m else ""

    up, pv, pl = body_of(host_src, "up"), body_of(remote_src, "preview"), body_of(host_src, "place")
    check("both_paths_wired", "place(" in up and "settle(" in up, "host.up が place / settle を通らない")
    check("both_paths_wired", "host.place(" in pv and "host.settle(" in pv,
          "remote.py の preview が host.place / host.settle を通らない")
    check("both_paths_wired", "ch.tidy(" in pl and "api.label(" in pl, "place が片づけか札を飛ばす")
    n = 0
    # 下見ではないが、同じ上限を食う道。録画を受け取るページ（7日）で、この見張りの範囲の外
    # （`tools/shorts/upload/`）。配る前の片づけ（期限切れ・下書き・古い版）は下見の2つの道が持つ
    other = {"upload/serve.py"}
    for p in sorted(HERE.parent.rglob("*.py")):
        if p.name.endswith("_selftest.py"):
            continue
        src = p.read_text(encoding="utf-8", errors="replace")
        hits = src.count('"hosting:channel:deploy"')
        if p == HERE / "host.py":
            check("both_paths_wired", hits == 1 and '"hosting:channel:deploy"' in pl,
                  f"host.py で配りを起こす所が {hits}か所（place の1か所のはず）")
        elif hits and str(p.relative_to(HERE.parent)) not in other:
            check("both_paths_wired", False, f"{p.relative_to(HERE.parent)} が配りを直に起こす")
        n += 1
    check("both_paths_wired", n > 10, f"見た .py が {n}本しか無い")


LEGS = [leg_place_tidies_first, leg_place_draft_short, leg_place_quota_words, leg_place_api_down,
        leg_settle, leg_delete_by_sha, leg_listing_rows, leg_both_paths_wired]


def main() -> int:
    if not LEGS:
        print("!! 数える足が無い")
        return 2
    for leg in LEGS:
        before = len(FAILS)
        try:
            leg()
        except Exception as e:  # noqa: BLE001  足が落ちたことも赤に数える
            FAILS.append(f"{leg.__name__[4:]}: {type(e).__name__}: {e}")
        print(f"  {'○' if len(FAILS) == before else '✕'} {leg.__name__[4:]}")
    if FAILS:
        print(f"\n!! {len(FAILS)}件落ちた")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    print(f"\n{len(LEGS)}本とも通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
