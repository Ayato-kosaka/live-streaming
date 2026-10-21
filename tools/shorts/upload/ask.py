"""あやとが録画を上げる URL を作る・届いたものを見る（作業箱側）。

    # ページを作る（7日）。URL は --out の下の url.txt にだけ書く
    python3 tools/shorts/upload/ask.py page  --name rec-1018 --key <秘密鍵.pem> --out <リポジトリの外>
    # 届いたものを ffprobe で見る（解像度・fps・ビットレート・長さ・音声、sha256）
    python3 tools/shorts/upload/ask.py probe --name rec-1018 --key <同じ> --out <同じ> [--no-hash]
    # 使い終わったら消す（消さなくても30日で消える）
    python3 tools/shorts/upload/ask.py drop  --name rec-1018 --key <同じ> --out <同じ>
    # 作業箱からも、CORS と非公開を見直す（ページを作ったあと）
    python3 tools/shorts/upload/ask.py check --name rec-1018 --out <同じ>

依頼 `shorts/upload/<name>.json`（名前・action・公開鍵・乱数だけ）を作業枝に積むと
`.github/workflows/shorts_upload.yml` が起き、結果を公開鍵で包んで
`shorts/.work/upload/<name>/<action>/` に置く。ここで開いて `--out/upload/<name>/<action>/` に展開し、
作業枝の暗号文は下ろす。中身の説明は README.md。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "preview"))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import decrypt  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
BRANCH = "claude/serene-darwin-sf09tt"
JST = dt.timezone(dt.timedelta(hours=9))


def pubkey_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def ask(a, action: str, extra: dict) -> tuple[dict | None, dict, Path]:
    """依頼を出して結果を待ち、開く。(result.json, run.json, 開いた場所)。"""
    nonce = secrets.token_hex(12)
    req = {"name": a.name, "action": action, "pubkey": pubkey_of(Path(a.key)), "nonce": nonce,
           **extra}
    if a.via == "dispatch":
        args = ["gh", "api", "-X", "POST", f"repos/{REPO}/actions/workflows/shorts_upload.yml/dispatches",
                "-f", "ref=master", "-f", f"inputs[branch]={a.branch}"]
        for k in ("name", "action", "pubkey", "nonce"):
            args += ["-f", f"inputs[{k}]={req[k]}"]
        args += ["-f", f"inputs[hash]={str(req.get('hash', True)).lower()}"]
        subprocess.run(args, check=True, capture_output=True)
    else:
        br.push_change(a.branch, {f"shorts/upload/{a.name}.json":
                                  (json.dumps(req, ensure_ascii=False, indent=1) + "\n").encode()}, [],
                       f"録画の受け取り {a.name} を頼む（{action}）\n\n"
                       "作業箱には GCP の資格情報も Hosting への道も無いので、Actions にやってもらう。"
                       "依頼に置くのは名前・公開鍵・乱数だけ。")
    print(f"依頼を出した（{action}・{a.via}）。Actions を待つ")
    rel = f"shorts/.work/upload/{a.name}/{action}"
    try:
        sha, man = br.wait_json(a.branch, f"{rel}/manifest.json", lambda d: d.get("nonce") == nonce,
                                a.timeout)
    except TimeoutError:
        raise SystemExit(f"!! {a.timeout:.0f}秒待っても結果が来ない（Actions の「ショートの録画を受け取る」を見る）")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    priv = Path(a.key)
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = br.extract(sha, rel, Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise SystemExit(f"!! 開けない: {msg}")
    dest = out / "upload" / a.name / action
    run = json.loads((dest / "run.json").read_text(encoding="utf-8"))
    body = (json.loads((dest / "result.json").read_text(encoding="utf-8"))
            if (dest / "result.json").is_file() else None)
    if not a.keep_branch:
        br.push_change(a.branch, {}, [f"shorts/upload/{a.name}.json", rel],
                       f"録画の受け取り {a.name} の暗号文を下ろす（{action}）\n\n"
                       "結果は作業箱で開いて使い終えた。作業枝に溜めない。")
    print(f"結果が来た（status={man.get('status')}・ランナー {run.get('sec')}秒）: {dest}")
    if not body:
        raise SystemExit(f"!! Actions で落ちた: {run.get('error')}\n  聞いた権限: "
                         f"{json.dumps(run.get('probe'), ensure_ascii=False)}")
    return body, run, dest


def jst(iso: str) -> str:
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(JST).strftime("%Y-%m-%d %H:%M")


def cmd_page(a) -> int:
    body, _, dest = ask(a, "page", {"slots": a.slots})
    st = body.get("selftest") or {}
    print(f"  寿命: {json.dumps(body['lifecycle']['days'], ensure_ascii=False)}"
          f"{'（' + ' / '.join(body['lifecycle']['changed']) + '）' if body['lifecycle']['changed'] else ''}")
    print(f"  CORS: {'書き換えた' if body['cors']['changed'] else 'そのまま'}"
          f"（出どころ {body['cors']['exact']}つ・{'/'.join(body['cors']['methods'])}）")
    ag, cap = st.get("again") or {}, st.get("cap") or {}
    print(f"  ランナーから上げてみた: {'○' if st.get('ok') else '!! ✕'}"
          f"（枠を取る {st.get('claim', {}).get('first')}→{st.get('claim', {}).get('second')}・"
          f"始め {st.get('init', {}).get('status')}・1切れ目 {st.get('piece', {}).get('status')}/"
          f"{st.get('piece', {}).get('override') or '-'}・続きから {st.get('last', {}).get('from')}バイト目・"
          f"md5 {'一致' if st.get('stored', {}).get('md5_ok') else '✕'}・"
          f"同じ名前でもう1本 {ag.get('init')}→{ag.get('final')}（前のまま {'○' if ag.get('kept') else '✕'}）・"
          f"上限 {'効く' if cap.get('enforced') else '効かない'}・署名なし {st.get('plain_get')}）")
    print(f"  ページ: {json.dumps(body.get('page_check'), ensure_ascii=False)}")
    url_txt = dest / "url.txt"
    url_txt.write_text(f"# 録画を送るページ {a.name}（{jst(body['expires'])} JST まで）\n"
                       "# 持っている人なら誰でも上げられる。コミットには入れない\n"
                       f"{body['page']}\n", encoding="utf-8")
    url_txt.chmod(0o600)
    print(f"ページの URL を書いた: {url_txt}（{jst(body['expires'])} JST まで・枠 {body['slots']}本）")
    if not body.get("ok"):
        print(f"!! {body.get('problems')}")
        return 1
    return 0


def fmt_rate(n) -> str:
    return f"{n / 1e6:.1f}Mbps" if n else "-"


def cmd_probe(a) -> int:
    body, _, dest = ask(a, "probe", {"hash": not a.no_hash})
    files = body.get("files") or []
    print(f"届いているもの: {len(files)}本（{dest / 'result.json'}）")
    for f in files:
        s = f.get("summary") or {}
        v, au = s.get("video") or {}, s.get("audio") or {}
        src = f.get("source") or {}
        size = f"{v.get('width')}x{v.get('height')}" if v else "映像なし"
        print(f"  {f['slot']}  {src.get('name', '?')}  {f['bytes'] / 1e9:.2f}GB  {size}"
              f"{' 回転' + str(v['rotation']) if v.get('rotation') else ''}"
              f"  {v.get('avg_fps') or v.get('fps') or '-'}fps  {v.get('codec') or ''}"
              f"  映像 {fmt_rate(v.get('bit_rate'))} / 全体 {fmt_rate(s.get('bit_rate'))}"
              f"  {s.get('duration') or '-'}秒"
              f"  音 {au.get('codec', 'なし')} {au.get('sample_rate') or ''}Hz {au.get('channels') or ''}ch"
              + (f"  sha256 {f['sha256'][:16]}…" if f.get("sha256") else "")
              + (f"  撮った {s['created']}" if s.get("created") else ""))
        if not f.get("ffprobe_ok"):
            print(f"    !! ffprobe が読めない: {f.get('ffprobe_error')}")
    return 0 if body.get("ok") else 1


def cmd_drive(a) -> int:
    """共有フォルダを Actions で落として揃え、署名付き URL で手元へ。コマ一覧は開いた先の sheets/。"""
    import requests

    body, _, dest = ask(a, "drive", {"folder": a.folder})
    files = body.get("files") or []
    print(f"落ちてきたもの: {len(files)}本（{body.get('fetched', {}).get('via')}・HDR を寄せる道具 "
          f"{'○' if body.get('zscale') else '✕'}）")
    media = dest / "media"
    media.mkdir(exist_ok=True)
    for f in files:
        part = f.get("proxy") or f.get("image") or {}
        s = (part.get("summary") or {})
        v = s.get("video") or {}
        line = (f"  {f['idx']}  {f['kind']}  元 {f['bytes'] / 1e6:.1f}MB"
                f"  → {v.get('width')}x{v.get('height')} {v.get('avg_fps') or ''}fps {s.get('duration') or ''}秒"
                f"{'  HDR→SDR' if part.get('tonemapped') else ''}")
        if not a.no_fetch and part.get("url"):
            ext = ".mp4" if f["kind"] == "video" else ".jpg"
            out = media / f"{f['idx']}{ext}"
            if not out.is_file() or out.stat().st_size != part.get("bytes", -1):
                with requests.get(part["url"], stream=True, timeout=(30, 1800)) as r:
                    r.raise_for_status()
                    with open(out, "wb") as fh:
                        for b in r.iter_content(8 << 20):
                            fh.write(b)
            line += f"  手元 {out.name}"
        print(line)
    print(f"開いた先: {dest}（result.json・sheets/・media/）")
    return 0 if body.get("ok") else 1


def cmd_cas(a) -> int:
    """書き出しの置き場から、sha256 で名指したものを手元へ落とす（--cas-out/<sha256>）。"""
    shas = [x.strip() for x in Path(a.list).read_text(encoding="utf-8").split() if x.strip()]
    body, _, dest = ask(a, "cas", {"sha256": shas})
    into = Path(a.cas_out)
    into.mkdir(parents=True, exist_ok=True)
    bad = 0
    for f in body.get("files") or []:
        if not f.get("url"):
            print(f"  !! 無い: {f['sha256'][:12]}")
            bad += 1
            continue
        out = into / f["sha256"]
        if out.is_file() and out.stat().st_size == f["bytes"]:
            continue
        import sys as _s
        _s.path.insert(0, str(HERE.parent / "render"))
        from remote import get_one

        st, h, sec = get_one(f["url"], out)
        ok = st == 200 and h == f["sha256"]
        bad += 0 if ok else 1
        print(f"  {f['sha256'][:12]}  {f['bytes'] / 1e6:.1f}MB  {'○' if ok else '!! ✕'}（{sec:.0f}秒）")
    print(f"落とした先: {into}")
    return 1 if bad else 0


def cmd_drop(a) -> int:
    body, _, _ = ask(a, "drop", {})
    print(f"消した: {body['deleted']}個（残り {body['left']}個）")
    return 0 if body.get("ok") else 1


def cmd_check(a) -> int:
    """作業箱から（ランナーとは別の道で）、CORS の下見と非公開を見直す。何も上げない。"""
    import requests

    p = Path(a.out) / "upload" / a.name / "page" / "result.json"
    if not p.is_file():
        raise SystemExit(f"!! {p} が無い（page を回した --out を渡す）")
    body = json.loads(p.read_text(encoding="utf-8"))
    cfg, origin = body["config"], body["origin"]
    bad = 0
    for i, s in enumerate(cfg["slots"][:2]):
        r = requests.options(s["init"], timeout=30, headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": ",".join(k.lower() for k in cfg["init_headers"])})
        ok = r.status_code == 200 and r.headers.get("Access-Control-Allow-Origin") == origin
        bad += 0 if ok else 1
        print(f"  枠 {i:02d} の下見: HTTP {r.status_code}  出どころ {'○' if ok else '✕'}")
    plain = f"https://storage.googleapis.com/{body['bucket']}/{body['prefix']}00.bin"
    st = requests.get(plain, timeout=30).status_code
    bad += 0 if st in (401, 403) else 1
    print(f"  署名なしの道: HTTP {st}（{'非公開' if st in (401, 403) else '!! 見直す'}）")
    print(f"  期限: {jst(body['expires'])} JST")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("page", "probe", "drop", "check", "drive", "cas"):
        p = sub.add_parser(name)
        p.add_argument("--name", required=True, help="受け取り口の名前（英数字と . _ -）")
        p.add_argument("--out", required=True, help="結果を開く場所（リポジトリの外）")
        if name == "check":
            continue
        p.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）")
        p.add_argument("--branch", default=BRANCH, help="依頼と結果を置く作業枝（claude/…）")
        p.add_argument("--via", choices=("push", "dispatch"), default="push",
                       help="push＝依頼ファイルを作業枝に置く / dispatch＝master のワークフローを起こす")
        p.add_argument("--timeout", type=float, default=1800)
        p.add_argument("--keep-branch", action="store_true", help="作業枝の暗号文を残す")
        if name == "page":
            p.add_argument("--slots", type=int, default=12, help="このページで送れる本数")
        if name == "drive":
            p.add_argument("--folder", required=True, help="共有フォルダの ID（リンクを知っている人は閲覧可）")
            p.add_argument("--no-fetch", action="store_true", help="署名付き URL から手元へ落とさない")
        if name == "cas":
            p.add_argument("--list", required=True, help="sha256 を空白・改行で並べたファイル")
            p.add_argument("--cas-out", required=True, help="落とす先（リポジトリの外）")
        if name == "probe":
            p.add_argument("--no-hash", action="store_true",
                           help="sha256 を出さない（全部を落とし直さない。大きいとき）")
    a = ap.parse_args()
    g = decrypt.inside_git(Path(a.out) if Path(a.out).exists() else Path(a.out).parent)
    if g:
        print(f"!! {a.out} はリポジトリ（{g}）の中。URL を置かないので断る")
        return 1
    if a.cmd != "check" and not a.branch.startswith("claude/"):
        print("!! 作業枝は claude/ で始まる名前にする")
        return 1
    return {"page": cmd_page, "probe": cmd_probe, "drop": cmd_drop, "check": cmd_check,
            "drive": cmd_drive, "cas": cmd_cas}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
