"""入口。EC2 の `/home/ubuntu/cardimport/` で回す（`setup.sh` が venv と道具を置く）。

    cd /home/ubuntu/cardimport/app && ../venv/bin/python -m card_import.run <命令>

| 命令 | 何をするか |
| --- | --- |
| `scan <zip>… [--delete]` | 1つずつ読んで数える。途中で落ちても同じ命令で続きから。`--delete` は読み終えた zip を消す |
| `existing` | 公開のカードの写真を落として数える（重複の判定に使う） |
| `select [--batch B] [--calib/--no-calib]` | 選ぶ。認識合わせの24枚は、答えがまだ1つも無ければ入る |
| `labels <答え.json>` | 認識合わせの答え `{sha: yes/no/excluded}` を読む。次の `select` から効く |
| `sheet [--batch B]` | 迷うものの一覧画（5×4、256px）を `<root>/sheets/` に書く |
| `judge [--batch B] 3=drop 5=keep` | 一覧画の番号で決めたものを書き戻す（`--drop 1,2 --keep 3` でもよい） |
| `pack [--batch B]` | tar を `<root>/out/<B>.tar` に書く（docs 2章の形） |
| `upload <tar>` | 環境変数 `CARD_IMPORT_PUT_URL` の署名付き URL へ PUT。上がったら tar を消す |
| `rmzip <zip>…` | 読み終えた zip だけを消す（読み終えていなければ消さない） |
| `clean [--batch B]` | 上げ終えた回の、手元の絵（keep）を消す。数と埋め込みは残す |
| `status` | 数だけ出す。写真の名前もパスも出さない |

共通: `--root`（既定 `/home/ubuntu/cardimport`、`CARD_IMPORT_ROOT`）・
`--embedder`（既定 `openclip`。`<module>:<attr>` で差し替え）・`--from` `--to`（期間）。
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import shutil
import sys
import time
from datetime import date
from pathlib import Path

from . import conf
from .store import keep_path, open_db


def _batch(db, given: str | None) -> str:
    if given:
        return given
    r = db.execute("SELECT batch FROM runs ORDER BY created DESC LIMIT 1").fetchone()
    if r is None:
        raise SystemExit("選んだ回がまだありません（先に select）")
    return r[0]


def _rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="card_import.run")
    ap.add_argument("--root")
    ap.add_argument("--embedder")
    ap.add_argument("--from", dest="frm")
    ap.add_argument("--to")
    ap.add_argument("cmd")
    ap.add_argument("rest", nargs=argparse.REMAINDER)
    a = ap.parse_args(argv)
    cfg = conf.load()
    root = conf.root(a.root)
    os.environ.setdefault("HF_HOME", str(root / "hf"))   # CLIP の重みの置き場（setup.sh が落とす）
    db = open_db(root)
    rng = (a.frm or cfg["range"]["from"], a.to or cfg["range"]["to"])
    rest = a.rest

    if a.cmd == "scan":
        from . import embed, scan, sources
        sp = argparse.ArgumentParser(prog="scan")
        sp.add_argument("paths", nargs="+")
        sp.add_argument("--delete", action="store_true")
        sp.add_argument("--limit", type=int)
        s = sp.parse_args(rest)
        t0 = time.monotonic()
        em = embed.load(a.embedder)
        print(f"CLIP を読んだ: {time.monotonic() - t0:.1f} 秒・メモリ {_rss_mb():.0f} MB")
        for i, p in enumerate(s.paths, 1):
            src = sources.open_source(p)
            st = scan.scan(db, root, cfg, src, em, rng, limit=s.limit)
            per = st["sec"] / st["images"] if st["images"] else 0
            print(f"[{i}/{len(s.paths)}] 新しく {st['new']}（写真 {st['images']}・重複 {st['dup']}・"
                  f"壊れ {st['broken']}・動画など {st['notImage']}・飛ばした {st['skipped']}）"
                  f" 絵を残した {st['kept']}・束で消した {st.get('pruned', 0)}"
                  f"・{per:.2f} 秒/枚・メモリの山 {_rss_mb():.0f} MB・{'読み終えた' if st['done'] else '途中'}")
            if s.delete and st["done"] and isinstance(src, sources.TakeoutZip):
                Path(p).unlink()
                print("  読み終えた zip を消した")
        return 0

    if a.cmd == "existing":
        from . import embed, existing
        r = existing.refresh(db, cfg, embed.load(a.embedder))
        print(f"既存のカードの写真: 一覧 {r['listed']}・新しく数えた {r['new']}・読めない {r['unreadable']}・台帳 {r['total']}")
        return 0

    if a.cmd == "select":
        from . import choose
        sp = argparse.ArgumentParser(prog="select")
        sp.add_argument("--batch", default=f"{date.today().isoformat()}-takeout")
        g = sp.add_mutually_exclusive_group()
        g.add_argument("--calib", action="store_true", default=None)
        g.add_argument("--no-calib", dest="calib", action="store_false")
        s = sp.parse_args(rest)
        m = choose.select(db, root, cfg, s.batch, rng, s.calib)
        amb = sum(1 for i in m["items"] if i["ambiguous"])
        print(f"{s.batch}: " + " ".join(f"{k}={v}" for k, v in m["counts"].items()) + f" ambiguous={amb}")
        if m["missing"]:
            print(f"写真の無い期間: {len(m['missing'])}か所")
        return 0

    if a.cmd == "labels":
        answers = json.loads(Path(rest[0]).read_text(encoding="utf-8"))
        n = 0
        for sha, ans in answers.items():
            if ans in ("yes", "no", "excluded"):
                db.execute("INSERT OR REPLACE INTO labels VALUES(?,?,?)", (sha, ans, time.time()))
                n += 1
        db.commit()
        print(f"答えを読んだ: {n}")
        return 0

    if a.cmd == "sheet":
        from . import sheet
        sp = argparse.ArgumentParser(prog="sheet")
        sp.add_argument("--batch")
        s = sp.parse_args(rest)
        b = _batch(db, s.batch)
        pages = sheet.sheet(db, root, b)
        print(f"{b}: 一覧画 {len(pages)}枚")
        for p in pages:
            print(f"  {p}")
        return 0

    if a.cmd == "judge":
        from . import sheet
        b = None
        if rest[:1] == ["--batch"]:
            b, rest = rest[1], rest[2:]
        b = _batch(db, b)
        r = sheet.judge(db, b, sheet.parse_marks(rest))
        print(f"{b}: 残す {r['keep']}・落とす {r['drop']}・番号が無い {r['unknown']}")
        return 0 if r["unknown"] == 0 else 1

    if a.cmd == "pack":
        from . import pack
        sp = argparse.ArgumentParser(prog="pack")
        sp.add_argument("--batch")
        sp.add_argument("--source", default="takeout")
        s = sp.parse_args(rest)
        b = _batch(db, s.batch)
        out, m = pack.pack(db, root, cfg, b, source=s.source)
        print(f"{b}: 候補 {m['counts']['selected']}・認識合わせ {m['counts']['calib']}・"
              f"{out.stat().st_size:,} バイト → {out}")
        return 0

    if a.cmd == "upload":
        from . import pack
        p = Path(rest[0])
        rc = pack.upload(p)
        if rc == 0 and "--keep" not in rest:
            p.unlink()
        return rc

    if a.cmd == "rmzip":
        from . import sources
        bad = 0
        for p in rest:
            src = sources.TakeoutZip(p)
            r = db.execute("SELECT done_at FROM sources WHERE kind=? AND name=? AND size=?",
                           (src.kind, src.name, src.size)).fetchone()
            if r and r[0]:
                Path(p).unlink()
                print("消した: 読み終えた zip 1つ")
            else:
                bad += 1
                print("消さなかった: まだ読み終えていない zip 1つ")
        return 1 if bad else 0

    if a.cmd == "clean":
        sp = argparse.ArgumentParser(prog="clean")
        sp.add_argument("--batch")
        s = sp.parse_args(rest)
        b = _batch(db, s.batch)
        n = 0
        for r in db.execute("SELECT sha FROM photos WHERE keep=1").fetchall():
            keep_path(root, r[0]).unlink(missing_ok=True)
            db.execute("UPDATE photos SET keep=0 WHERE sha=?", (r[0],))
            n += 1
        db.commit()
        print(f"{b} のあと: 手元の絵を {n}枚消した（台帳の数と埋め込みは残した）")
        return 0

    if a.cmd == "status":
        q = lambda s, *p: db.execute(s, p).fetchone()[0]  # noqa: E731
        keep_files = list((root / "keep").rglob("*.webp")) if (root / "keep").exists() else []
        n_src, n_done = q("SELECT COUNT(*) FROM sources"), q("SELECT COUNT(*) FROM sources WHERE done_at IS NOT NULL")
        n_occ, n_img = q("SELECT COUNT(*) FROM occ"), q("SELECT COUNT(*) FROM occ WHERE what='image'")
        n_ph, n_br = q("SELECT COUNT(*) FROM photos"), q("SELECT COUNT(*) FROM photos WHERE status='broken'")
        n_nod = q("SELECT COUNT(*) FROM photos WHERE date_src='none'")
        print(f"源: {n_src}（読み終えた {n_done}）")
        print(f"読んだもの: {n_occ}（写真 {n_img}）")
        print(f"写真（sha ごと）: {n_ph}（壊れ {n_br}・日付なし {n_nod}）")
        print(f"手元の絵: {len(keep_files)}枚・{sum(p.stat().st_size for p in keep_files) / 1e6:.1f} MB")
        print(f"既存のカード: {q('SELECT COUNT(*) FROM existing')}・答え: {q('SELECT COUNT(*) FROM labels')}・"
              f"一覧画で決めた: {q('SELECT COUNT(*) FROM decisions')}")
        r = db.execute("SELECT batch, counts FROM runs ORDER BY created DESC LIMIT 1").fetchone()
        if r:
            c = json.loads(r["counts"])
            print(f"いちばん新しい回 {r['batch']}: " + " ".join(f"{k}={v}" for k, v in c.items()))
        du = shutil.disk_usage(root)
        print(f"ディスクの空き: {du.free / 1e9:.1f} GB")
        return 0

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
