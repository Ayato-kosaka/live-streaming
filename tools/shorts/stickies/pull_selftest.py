"""付箋を読む道（order.py → pull.py → decrypt.py / read.py）の見張り。**島にも GitHub にも触らない。**

    python3 tools/shorts/stickies/pull_selftest.py

手元に偽の島の口（127.0.0.1 の http.server）を立て、**本物の order.py と pull.py** を
Actions と同じ順に回す。偽の付箋には、名前・本文・リンク・返事・テーマ・id のそれぞれに
その回だけの印（乱数の16進）を埋めておき、**印がログ（pull.py の標準出力と標準エラー）にも、
平文で置くもの（manifest.json）にも、ランナーの一時の場所に残ったものにも1つも出ない**ことを見る。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは curl と openssl だけ。

## 何を見るか

- a. 200 と6枚 → 通る。ログには数だけ（HTTP 200・6枚・返事済み・いちばん新しい日）。
     置くのは manifest.json / key.enc / payload.enc だけで、平文はランナーの一時の場所に残らない
- b. 包んだもの → ingest の decrypt.py で開くと、応答と1バイトも違わない。
     read.py が表にする（名前と本文はこちらの画面にだけ出る・`si=` を落としたリンク・JST）
- c. 読めなかった値が例外の文面に混ざる形（createdAt に印を入れる）→ 印がログに出ない
- d. 500・404・200 で空・200 で HTML・200 で0枚 → 赤（1）。何も置かない。500 の本文に入れた印もログに出ない
- e. 届かない口 → 赤。島の外の宛先（STICKIES_BASE）には向けない
- f. 依頼の形（テーマ・枚数・鍵・枝）が違えば、Actions を待たせずに order.py で断る。テーマ空は横断（`_all`）
- g. ワークフローの繋ぎ: 権限は積む job の contents: write だけ・`run:` に式を直に埋めない・
     依頼の置き場が取り込み（`shorts/requests/`）と重ならない・本物の order.py / pull.py / push.sh を呼ぶ

終了コード 0=全部通った / 1=落ちたものがある / 2=回せない（curl・openssl・守る実物が無い）。
"""

from __future__ import annotations

import http.server
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REQ = HERE / "order.py"
PULL = HERE / "pull.py"
READ = HERE / "read.py"
DECRYPT = ROOT / "tools/shorts/ingest/decrypt.py"
WORKFLOW = ROOT / ".github/workflows/stickies_pull.yml"


class Island:
    """偽の島の口。`answer` に置いた状態・本文をそのまま返し、来た要求を `seen` に控える。"""

    def __init__(self) -> None:
        self.answer: tuple[int, bytes, str] = (200, b"", "application/json")
        self.seen: list[str] = []
        island = self

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                island.seen.append(self.path)
                code, body, ctype = island.answer
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a) -> None:  # 偽の口の言うことで見張りの出力を汚さない
                pass

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}/island-api"

    def close(self) -> None:
        # shutdown だけでは口が開いたまま（つないでも誰も答えない）。閉じて、つなぎを断らせる
        self.srv.shutdown()
        self.srv.server_close()


def marks() -> dict[str, str]:
    """その回だけの印。16進の部分だけでも探す（\\u で書き直されて出ても見つかるように）。"""
    return {k: secrets.token_hex(8) for k in ("text", "name", "link", "reply", "theme", "id", "bad")}


def notes_doc(m: dict[str, str]) -> dict:
    # 6枚。本物の応答（stickyShape）と同じ欄。名前の無いもの・リンクの無いもの・あやとの立て札も混ぜる
    base = [
        ("2026-10-20T12:44:18.227Z", True, "https://m.youtube.com/watch?v=nGgoJ753rBw&t=2405s&ra=m", 0, False),
        ("2026-10-20T12:10:24.762Z", True, "https://m.youtube.com/watch?v=TDArug_te90&ra=m", 0, False),
        ("2026-10-19T12:48:22.694Z", True, None, 1, False),
        ("2026-10-16T22:46:38.896Z", False, f"https://www.youtube.com/live/yk-by7R7iPA?si={m['link']}", 2, False),
        ("2026-10-16T22:43:51.849Z", False, "https://www.youtube.com/live/zjHZucyfrq8?si=AAAA", 2, True),
        ("2026-10-16T22:42:07.598Z", False, None, 1, False),
    ]
    notes = []
    for i, (at, replied, link, hearts, owner) in enumerate(base):
        n = {"id": f"id{m['id']}{i}", "theme": "shorts-idea",
             "text": f"この回をショートに\n本文{m['text']}-{i}", "hearts": hearts, "byOwner": owner,
             "createdAt": at}
        if i != 1:
            n["by"] = f"名前{m['name']}-{i}"
        if link:
            n["link"] = link
        if replied:
            n["reply"] = f"作ってみる{m['reply']}"
            n["repliedAt"] = "2026-10-20T23:59:43.042Z"
        notes.append(n)
    # 横断の新着では、表に無い宛先（視聴者さんが名前を決められる）も混ざる
    notes[5]["theme"] = f"t{m['theme']}"
    return {"notes": notes, "more": False, "next": None}


def clean_env(**kw: str) -> dict:
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("GITHUB_", "IN_", "STICKIES_")) and k.lower() not in
           ("http_proxy", "https_proxy", "all_proxy")}
    # 偽の口は 127.0.0.1。箱のプロキシに回されないように
    env.update(NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
    env.update(kw)
    return env


def run(args: list[str], env: dict) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *map(str, args)], env=env, capture_output=True,
                          text=True, timeout=120)


def leaked(text: str | bytes, m: dict[str, str]) -> list[str]:
    s = text.decode("utf-8", "replace") if isinstance(text, bytes) else text
    return [k for k, v in m.items() if v in s]


def main() -> int:
    for tool in ("curl", "openssl", "git"):
        if not shutil.which(tool):
            print(f"!! {tool} が無いので回せない")
            return 2
    for p in (REQ, PULL, READ, DECRYPT, WORKFLOW):
        if not p.is_file():
            print(f"!! 守る実物が無い: {p}")
            return 2

    fails: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"{'ok' if ok else 'NG'}  {what}")
        if not ok:
            fails.append(what)

    island = Island()
    try:
        with tempfile.TemporaryDirectory(prefix="stickies-selftest-") as td:
            top = Path(td)
            if subprocess.run(["git", "-C", str(top), "rev-parse"], capture_output=True).returncode == 0:
                print(f"!! 一時の場所 {top} が git の中にある（pull.py が平文を書くのを断る）。TMPDIR を外へ")
                return 2
            priv, pub = top / "priv.pem", top / "pub.pem"
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                            "rsa_keygen_bits:2048", "-out", str(priv)], check=True, capture_output=True)
            subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout", "-out", str(pub)],
                           check=True, capture_output=True)
            # workflow_dispatch の入力欄は1行なので、改行が空白に化けた鍵で渡す
            pubkey = " ".join(pub.read_text(encoding="utf-8").split("\n"))
            n_case = [0]

            def plan(theme: str | None = "shorts-idea", limit: str = "300", key: str = pubkey,
                     branch: str = "claude/selftest-stickies") -> tuple[subprocess.CompletedProcess, Path, Path]:
                """本物の order.py を workflow_dispatch の入力で回す。(結果, RUNNER_TEMP, 置いた依頼の置き場)"""
                n_case[0] += 1
                rt = top / f"rt{n_case[0]}"
                rt.mkdir()
                out = rt / "gh_output"
                env = clean_env(GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF_NAME="master",
                                IN_LIMIT=limit, IN_PUBKEY=key, IN_BRANCH=branch, GITHUB_OUTPUT=str(out))
                if theme is not None:
                    env["IN_THEME"] = theme
                r = run([REQ, rt / "stickies"], env)
                return r, rt, rt / "stickies"

            def pull(rt: Path, answer: tuple[int, bytes, str], base: str | None = None):
                island.answer = answer
                island.seen.clear()
                env = clean_env(RUNNER_TEMP=str(rt), STICKIES_BASE=base or island.base,
                                RUN_URL="https://example.invalid/run/1")
                return run([PULL, rt / "stickies/00/item.json"], env)

            def left_in(rt: Path, m: dict[str, str]) -> list[str]:
                """ランナーの一時の場所に残ったもののうち、印を持つもの（暗号文は乱数なので当たらない）。"""
                hit = []
                for p in rt.rglob("*"):
                    if p.is_file() and leaked(p.read_bytes(), m):
                        hit.append(str(p.relative_to(rt)))
                return hit

            # --- a. 200 と6枚
            m = marks()
            doc = notes_doc(m)
            body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
            r, rt, items = plan()
            check(r.returncode == 0 and (items / "00/item.json").is_file(),
                  f"a. 依頼を読めた（{r.stdout.strip().splitlines()[-1:] or r.stderr.strip()[-80:]}）")
            gh = (rt / "gh_output").read_text(encoding="utf-8") if (rt / "gh_output").exists() else ""
            check("count=1" in gh and "branch=claude/selftest-stickies" in gh,
                  "a. GITHUB_OUTPUT に件数と積む枝が出る")
            p = pull(rt, (200, body, "application/json; charset=utf-8"))
            log = p.stdout + p.stderr
            check(p.returncode == 0, f"a. 200 と6枚 → 通る（{log.strip().splitlines()[-1:] }）")
            check(not leaked(log, m), f"a. ログに名前・本文・リンク・返事・テーマ・id が1つも出ない（出たもの {leaked(log, m)}）")
            check("HTTP 200" in log and "6枚" in log and "返事済み 3" in log and "2026-10-20" in log,
                  "a. ログには数が出る（HTTP 200・6枚・返事済み 3・いちばん新しい 2026-10-20）")
            q = urllib.parse.urlsplit(island.seen[0]) if island.seen else None
            check(bool(q) and q.path == "/island-api/stickies"
                  and urllib.parse.parse_qs(q.query) == {"theme": ["shorts-idea"], "limit": ["300"]},
                  f"a. 口には theme と limit を付けて1回だけ聞く（来たのは {island.seen}）")
            sealed = items / "00/sealed"
            names = sorted(x.name for x in sealed.iterdir()) if sealed.is_dir() else []
            check(names == ["key.enc", "manifest.json", "payload.enc"],
                  f"a. 置くのは manifest.json / key.enc / payload.enc だけ（あったのは {names}）")
            man = json.loads((sealed / "manifest.json").read_text(encoding="utf-8")) if names else {}
            check(bool(man) and not leaked(json.dumps(man, ensure_ascii=False), m)
                  and man.get("counts", {}).get("notes") == 6 and man.get("dest") == "stickies/shorts-idea"
                  and all(len(f.get("sha256", "")) == 64 for f in man.get("encrypted_files", [])),
                  "a. manifest.json は数と sha256 だけ（印なし・6枚・置き場 stickies/shorts-idea）")
            check(not left_in(rt, m), f"a. 平文はランナーの一時の場所に残らない（残ったもの {left_in(rt, m)}）")
            check(not list(rt.glob("stickies-plain-*")), "a. 平文を書いた一時の置き場ごと消えている")

            # --- b. 開く
            opened = top / "open"
            r = run([DECRYPT, "--key", priv, "--out", opened, sealed], clean_env())
            got = opened / "stickies/shorts-idea/stickies.json"
            check(r.returncode == 0 and got.is_file() and got.read_bytes() == body,
                  f"b. decrypt.py で開くと、応答と1バイトも違わない（{r.stdout.strip()[-100:]}）")
            r = run([READ, "--key", priv, sealed], clean_env())
            rows = [x for x in r.stdout.splitlines() if x.startswith("id")]
            check(r.returncode == 0 and len(rows) == 7 and m["text"] in r.stdout and m["name"] in r.stdout,
                  f"b. read.py が6枚を表にする（名前と本文は手元の画面にだけ出る）（{r.stderr.strip()[-100:]}）")
            check("2026-10-20 21:44" in r.stdout and "https://youtu.be/nGgoJ753rBw?t=2405" in r.stdout
                  and m["link"] not in r.stdout and "https://youtu.be/yk-by7R7iPA" in r.stdout,
                  "b. 表の時刻は JST・YouTube のリンクは動画IDと時刻だけ（si= を落とす）")

            # --- c. 読めなかった値が例外の文面に混ざる形
            m2 = marks()
            d2 = notes_doc(m2)
            d2["notes"][0]["createdAt"] = f"日付でない{m2['bad']}"
            d2["notes"][1]["reply"] = {"x": m2["bad"]}
            r, rt, items = plan()
            p = pull(rt, (200, json.dumps(d2, ensure_ascii=False).encode(), "application/json"))
            log = p.stdout + p.stderr
            check(not leaked(log, m2), f"c. 読めない日付が混ざっても印がログに出ない（出たもの {leaked(log, m2)}）")
            check(not left_in(rt, m2), "c. 平文はランナーの一時の場所に残らない")
            # 包む途中で openssl が落ちる形（鍵を壊す）。CalledProcessError の文面には openssl に
            # 渡した引数がそのまま入るので、型の名前しか出さないことと、包みかけを残さないことを見る
            r, rt, items = plan()
            ip = items / "00/item.json"
            it = json.loads(ip.read_text(encoding="utf-8"))
            it["pubkey"] = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n"
            ip.write_text(json.dumps(it), encoding="utf-8")
            p = pull(rt, (200, json.dumps(notes_doc(m2), ensure_ascii=False).encode(), "application/json"))
            log = p.stdout + p.stderr
            check(p.returncode == 1 and "CalledProcessError" in log
                  and not any(t in log for t in ("pkeyutl", "-inkey", "aes-256", "-iv")),
                  f"c. 包む途中で落ちた → 型の名前だけ（openssl の引数を出さない）（{log.strip().splitlines()[-1:]}）")
            check(not (items / "00/sealed").exists() and not left_in(rt, m2) and not leaked(log, m2),
                  "c. 包む途中で落ちた → 包みかけも平文も残さない")

            # --- d. 赤くするもの
            def refused(what: str, answer: tuple[int, bytes, str], need: str) -> None:
                mm = marks()
                r, rt, items = plan()
                # MARK は付箋の一覧まるごと、HEX は印1つ（JSON の字の中に置く用）に差し替える
                ans = (answer[0], answer[1].replace(b"MARK", json.dumps(notes_doc(mm), ensure_ascii=False)
                                                     .encode()).replace(b"HEX", mm["text"].encode()),
                       answer[2])
                p = pull(rt, ans)
                log = p.stdout + p.stderr
                check(p.returncode == 1 and need in log and not (items / "00/sealed").exists()
                      and not leaked(log, mm) and not left_in(rt, mm),
                      f"d. {what} → 赤・何も置かない・本文はログに出ない（{log.strip().splitlines()[-1:]}）")

            refused("HTTP 500（本文に付箋が入っている）", (500, b"MARK", "application/json"), "HTTP 500")
            refused("HTTP 404", (404, b"MARK", "text/html"), "HTTP 404")
            refused("200 で本文が空", (200, b"", "application/json"), "空")
            refused("200 で HTML", (200, b"<!doctype html><title>MARK</title>", "text/html"), "JSON")
            refused("200 で notes が無い", (200, b'{"error": "HEX"}', "application/json"), "notes")
            refused("200 で0枚", (200, b'{"notes": [], "more": false, "next": null}', "application/json"),
                    "0枚")

            # --- e. 届かない口・島の外の宛先
            r, rt, items = plan()
            island.close()
            p = pull(rt, (200, body, "application/json"))
            check(p.returncode == 1 and "curl" in p.stdout and not (items / "00/sealed").exists(),
                  f"e. 届かない口 → 赤（{p.stdout.strip().splitlines()[-1:]}）")
            island = Island()
            p = pull(rt, (200, body, "application/json"), base="https://example.invalid/island-api")
            check(p.returncode == 1 and not island.seen and "読む先" in p.stdout,
                  "e. 島の外の宛先には向けない（STICKIES_BASE が別の宛先なら断る）")

            # --- f. 依頼の形
            r, rt, items = plan(theme="")
            it = json.loads((items / "00/item.json").read_text(encoding="utf-8")) if r.returncode == 0 else {}
            check(it.get("dest") == "stickies/_all" and it.get("theme") == "",
                  "f. テーマが空 → テーマ横断（置き場 stickies/_all）")
            p = pull(rt, (200, body, "application/json"))
            q = urllib.parse.urlsplit(island.seen[0]) if island.seen else None
            check(p.returncode == 0 and bool(q) and urllib.parse.parse_qs(q.query) == {"limit": ["300"]},
                  "f. テーマ横断は theme を付けずに聞く")
            for what, kw in [("テーマの形が違う（Shorts Idea）", {"theme": "Shorts Idea"}),
                             ("limit が 0", {"limit": "0"}), ("limit が 301", {"limit": "301"}),
                             ("limit が数でない", {"limit": "abc"}), ("鍵が空", {"key": ""}),
                             ("鍵が 1024bit", {"key": "1024"}), ("枝が claude/ 以外", {"branch": "master"})]:
                if kw.get("key") == "1024":
                    weak = top / "weak.pem"
                    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                                    "rsa_keygen_bits:1024", "-out", str(weak)], check=True, capture_output=True)
                    kw["key"] = subprocess.run(["openssl", "pkey", "-in", str(weak), "-pubout"],
                                               check=True, capture_output=True, text=True).stdout
                r, rt, items = plan(**kw)
                check(r.returncode == 1 and not (items / "00/item.json").exists(),
                      f"f. {what} → order.py が断る（{r.stdout.strip().splitlines()[-1:]}）")

            # --- g. ワークフローの繋ぎ
            check_workflow(check)
    finally:
        island.close()

    print(f"\nNG  付箋を読む見張り {len(fails)}件落ちた" if fails else "\nOK  付箋を読む見張り 全部通った")
    return 1 if fails else 0


def check_workflow(check) -> None:
    try:
        import yaml
    except ImportError:
        check(False, "g. PyYAML が無いのでワークフローを読めない")
        return
    doc = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    # PyYAML は `on:` を真偽値の True として読む（python/workflow_link_selftest.py の頭）
    on = doc.get("on", doc.get(True)) or {}
    check(doc.get("permissions") == {}, "g. ワークフローの既定の権限は空")
    jobs = doc.get("jobs") or {}
    perms = [j.get("permissions") for j in jobs.values()]
    check(perms == [{"contents": "write"}], f"g. 権限は積む job の contents: write だけ（あったのは {perms}）")
    runs = [s.get("run", "") for j in jobs.values() for s in j.get("steps", []) if s.get("run")]
    check(runs and not any("${{" in x for x in runs), "g. `run:` に式を直に埋めていない（入力は env で渡す）")
    allrun = "\n".join(runs)
    check(all(t in allrun for t in ("tools/shorts/stickies/order.py", "tools/shorts/stickies/pull.py",
                                    "tools/shorts/ingest/push.sh")),
          "g. 本物の order.py / pull.py / push.sh を呼んでいる")
    paths = ((on.get("push") or {}).get("paths")) or []
    check(bool(paths) and not any(re.match(r"^shorts/requests(/|$)", x) for x in paths),
          f"g. 依頼の置き場がショートの取り込み（shorts/requests/）と重ならない（{paths}）")
    ins = (on.get("workflow_dispatch") or {}).get("inputs") or {}
    check(ins.get("theme", {}).get("default") == "shorts-idea" and ins.get("limit", {}).get("default") == "300"
          and ins.get("pubkey", {}).get("required") is True,
          "g. 手で起こす入力: theme の既定 shorts-idea・limit の既定 300・pubkey は必須")


if __name__ == "__main__":
    sys.exit(main())
