"""**偽の Google で、案内鳥の鍵づくり（`guide_token.py`）を実際に動かす。**

    python3 python/admin/guide_token_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**ネットにも本番にも資格情報にも触らない。** 差し替えるのは Google の口
（`_post` / `_get`）だけで、**判断の側は本物**——`guide_token.main()` をそのまま呼ぶ。
封は本物の `_seal`（openssl）で包み、こちらで作った使い捨ての鍵でほどいて確かめる。

## 何を見るか

| | 場面 | 欲しい結果 |
| --- | --- | --- |
| 1 | 名前が「あやと島案内鳥」の1つ | 0。封が出て、ほどくと鍵と1字違わない |
| 2 | 名前が別のチャンネル | 1。**封を出さない**。その名前もログに出さない |
| 3 | 案内鳥と別のチャンネルの2つ | 1。封を出さない |
| 4 | チャンネルが0件 | 1。封を出さない |
| 5 | コードが切れている（invalid_grant） | 1。封を出さない |
| 6 | refresh token が返らない | 1。封を出さない |
| 7 | 入力に pubkey が無い | 1。**入力をログに出さない**（コードが出る） |
| 8 | client の鍵が渡っていない | 1。封を出さない |

**8つの場面ぜんぶの出力**（ログ・標準出力・注記）を拾って、コード・鍵・札・
client の値・別のチャンネルの名前が1文字も混ざっていないことを見る。

## 対照（本物の判定を出す前に、毎回）

`BREAKS` で守りを1本ずつ抜いて、**その足の場面が落ちる**ことを見る。
抜きかたはソースへの字の当てはめで、当たらなければ数字を出さずに 2。

| 足 | 抜くと何が起きるか | 落ちる場面 |
| --- | --- | --- |
| `name` | 名前を見ずに封をする | 2・3・4 |
| `hush` | 鍵をログに出す | 1 |
| `redirect` | いまの鍵と違うリダイレクト先で替える | 1 |
| `args` | 足りない入力を丸ごとログに出す | 7 |
"""

import contextlib
import io
import logging
import os
import pathlib
import re
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

# `config.py` は、この環境変数が無いと読み込みの時点で落ちる。本物の名前は要らない
os.environ.setdefault("BQ_PROJECT_ID", "guide-token-selftest")
os.environ.pop("ARGS", None)

from _seal import join, keypair, unpack, unseal  # noqa: E402

SRC = pathlib.Path(HERE, "guide_token.py").read_text(encoding="utf-8")
NOTHING = 2

# ---------------------------------------------------------------- 作りもの（本物ではない）

GUIDE = "あやと島案内鳥"
OTHER = "べつのチャンネル"
CODE = "4/0Aselftest-code-not-real-0123456789"
RT = "1//0gselftest-refresh-not-real-abcdefghij"
AT1 = "ya29.selftest-access-one-not-real"
AT2 = "ya29.selftest-access-two-not-real"
CID = "000000000000-selftestclientidnotreal00000.apps.googleusercontent.com"
SEC = "GOCSPX-selftest-secret-not-real"
REDIRECT = "https://developers.google.com/oauthplayground"
SECRETS = [CODE, RT, AT1, AT2, CID, SEC, OTHER]

PEM, PUB = keypair()

BREAKS = {
    "name": (re.compile(r"    if names != \[GUIDE\]:\n"), "    if False:\n"),
    "hush": (
        re.compile(r'    log\.info\("channels\.list mine=true の名前: %s", GUIDE\)\n'),
        '    log.info("channels.list mine=true の名前: %s %s", GUIDE, rt)\n',
    ),
    "redirect": (
        re.compile(r'REDIRECT = "https://developers\.google\.com/oauthplayground"\n'),
        'REDIRECT = "https://oauth2.example.com/callback"\n',
    ),
    "args": (
        re.compile(r'        log\.error\("入力の code と pubkey が要ります（値は出しません）"\)\n'),
        '        log.error("入力が足りません: %s", a)\n',
    ),
}

# 場面: (入力, 環境, 交換の答え, チャンネルの名前の並び, 欲しい終了コード, 封が出るか)
CASES = {
    "1": ({"code": CODE, "pubkey": PUB}, True, "ok", [GUIDE], 0, True),
    "2": ({"code": CODE, "pubkey": PUB}, True, "ok", [OTHER], 1, False),
    "3": ({"code": CODE, "pubkey": PUB}, True, "ok", [GUIDE, OTHER], 1, False),
    "4": ({"code": CODE, "pubkey": PUB}, True, "ok", [], 1, False),
    "5": ({"code": CODE, "pubkey": PUB}, True, "expired", [GUIDE], 1, False),
    "6": ({"code": CODE, "pubkey": PUB}, True, "no_rt", [GUIDE], 1, False),
    "7": ({"code": CODE}, True, "ok", [GUIDE], 1, False),
    "8": ({"code": CODE, "pubkey": PUB}, False, "ok", [GUIDE], 1, False),
}


def load(brk: str | None):
    src = SRC
    if brk:
        pat, rep = BREAKS[brk]
        if not pat.search(src):
            print(f"対照 {brk}: ソースに当たる字がありません。見張りの前提が古い")
            raise SystemExit(NOTHING)
        src = pat.sub(rep, src, count=1)
    mod = types.ModuleType("guide_token_under_test")
    mod.__file__ = os.path.join(HERE, "guide_token.py")
    exec(compile(src, mod.__file__, "exec"), mod.__dict__)
    return mod


def fake_google(mod, exchange: str, names: list):
    """偽の Google。**本物と同じ条件でしか鍵を返さない**（リダイレクト先・コード・client）。"""
    def post(url, form):
        assert url == mod.TOKEN_URL, url
        if form.get("client_id") != CID or form.get("client_secret") != SEC:
            raise RuntimeError("HTTP 401 invalid_client")
        if form.get("grant_type") == "authorization_code":
            if exchange == "expired" or form.get("code") != CODE:
                raise RuntimeError("HTTP 400 invalid_grant")
            if form.get("redirect_uri") != REDIRECT:
                raise RuntimeError("HTTP 400 redirect_uri_mismatch")
            out = {"access_token": AT1, "expires_in": 3599, "scope": "x", "token_type": "Bearer"}
            if exchange != "no_rt":
                out["refresh_token"] = RT
            return out
        if form.get("grant_type") == "refresh_token":
            if form.get("refresh_token") != RT:
                raise RuntimeError("HTTP 400 invalid_grant")
            return {"access_token": AT2, "expires_in": 3599}
        raise RuntimeError("HTTP 400 unsupported_grant_type")

    def get(url, bearer):
        assert url == mod.CHANNELS_URL, url
        if bearer != AT2:
            raise RuntimeError("HTTP 401")
        return {"items": [{"id": f"UC{i}", "snippet": {"title": n}} for i, n in enumerate(names)]}

    return post, get


def run_case(mod, cid: str) -> list:
    """1場面を回して、外れたことを並べて返す（空なら通った）。"""
    a, env_ok, exchange, names, want_rc, want_seal = CASES[cid]
    mod._post, mod._get = fake_google(mod, exchange, names)
    os.environ["ARGS"] = __import__("json").dumps(a)
    os.environ["GITHUB_ACTIONS"] = "true"   # 注記を標準出力に出させる
    if env_ok:
        os.environ["YOUTUBE_CLIENT_ID"], os.environ["YOUTUBE_CLIENT_SECRET"] = CID, SEC
    else:
        os.environ.pop("YOUTUBE_CLIENT_ID", None)
        os.environ.pop("YOUTUBE_CLIENT_SECRET", None)
    buf = io.StringIO()
    h = logging.StreamHandler(buf)
    root = logging.getLogger()
    # 本物の出口（`_fs` の basicConfig）は外して、こちらの1本だけで拾う
    saved, root.handlers = root.handlers[:], [h]
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(buf):
            rc = mod.main()
    except Exception as e:  # noqa: BLE001
        return [f"落ちた: {type(e).__name__}"]
    finally:
        root.handlers = saved
        for k in ("ARGS", "GITHUB_ACTIONS", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"):
            os.environ.pop(k, None)
    text = buf.getvalue() + out.getvalue()
    bad = []
    if rc != want_rc:
        bad.append(f"終了コード {rc}（欲しいのは {want_rc}）")
    sealed = "SEALED-PART" in out.getvalue()
    if sealed != want_seal:
        bad.append("封が出た" if sealed else "封が出ない")
    if sealed and want_seal:
        try:
            back = unseal(unpack(join(out.getvalue().splitlines())), PEM).decode()
        except (Exception, SystemExit) as e:  # noqa: BLE001
            back = f"<ほどけない {type(e).__name__}>"
        if back != RT:
            bad.append("ほどいた鍵が元と違う")
    leaked = [s for s in SECRETS if s in text]
    if leaked:
        bad.append(f"ログに出た: {len(leaked)}種")
    if PUB in text:
        bad.append("公開鍵がログに出た（入力を丸ごと出している）")
    if want_rc == 0 and GUIDE not in text:
        bad.append("合っていた名前がログに出ていない")
    return bad


def run_all(mod) -> dict:
    return {cid: run_case(mod, cid) for cid in CASES}


def main() -> int:
    # 対照: 守りを1本ずつ外して、その足の場面が落ちること
    want = {"name": {"2", "3", "4"}, "hush": {"1"}, "redirect": {"1"}, "args": {"7"}}
    drill_ok = True
    for brk, cases in want.items():
        got = {c for c, b in run_all(load(brk)).items() if b}
        missing = cases - got
        print(f"対照 {brk}: 落ちた場面 {sorted(got) or 'なし'}"
              + ("" if not missing else f" **{sorted(missing)} が落ちない**"))
        if missing:
            drill_ok = False
    # 本物
    res = run_all(load(None))
    checks = len(res)
    if checks == 0:
        return NOTHING
    failed = {c: b for c, b in res.items() if b}
    for c, b in res.items():
        print(f"場面 {c}: " + ("通った" if not b else "外れた — " + " / ".join(b)))
    if not drill_ok:
        print("対照が効いていません（守りを外しても落ちない場面がある）")
        return 1
    if failed:
        return 1
    print(f"{checks} 場面すべて通った（対照 {len(want)} 本も効いた）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
