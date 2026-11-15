#!/usr/bin/env python3
"""手元から回す。街の案内の面に埋める Google マイマップ（見たい・食べたい・買いたいの3枚）を、
EC2 のログイン済み Chrome（~/cdp-ytstudio・列 ytstudio）で**取り込み直す・作る**・共有する・フォルダへ移す。
EC2 の上で動くのは同じ置き場の mymaps_ec2.py（ここが毎回 /home/ubuntu/cdp/ へ置き直す）。

    python3 .claude/skills/mymaps/mymaps.py sync python/data/bulgaria/mymaps
        # mids.json の地図へ CSV を取り込み直す（レイヤを足して取り込み → 前のレイヤを消す → 名前を付け直す）。
        # **mid は変えない**（面の埋め込みが mid を持っている）
    python3 .claude/skills/mymaps/mymaps.py sync python/data/guide/north-macedonia/skopje/mymaps --city スコピエ
        # mids.json が無ければ3枚を作る（題は「スコピエ｜見たいもの」…）。共有を入れて mids.json を書く（ll・z つき）
    python3 .claude/skills/mymaps/mymaps.py move <mymaps の置き場>… [--folder ID]
        # あやとの Drive のフォルダ（既定は FOLDER）へ移し、フォルダの中身の題を出す。ほかのファイルには触らない
    python3 .claude/skills/mymaps/mymaps.py verify <mymaps の置き場>…
        # この箱から curl で: 埋め込みが 200・ピンの数が CSV と同じ・好みの印と座標の検索リンクが残っていない

終了コード: 0 = 通った、1 = 落ちた所がある、2 = 呼びかたが違う。

## 札と止めかた

Chrome を触るあいだは `ec2.lease("ytstudio")` で札を持ち、抜けるときに必ず返す（心拍は同じプロセス）。
EC2 はこの道具では止めない——起きていなければ起こすが、止めるのは `ec2.py stop`（使っている人が居れば断られる）か、
誰も使わなくなって30分の見張り（idle-stop）。**人の返事を待つあいだに札を持ち続けない。**

## ログインが切れていたら

EC2 の上で accounts.google.com に飛ばされたら、そこで止めて「ログインの画面で止まった」と出す（押さない・
パスワードは打たない・本人確認の画面は開かない）。入り直しは ec2-chrome の 3（`up("ytstudio", reseed=True)`）か、
あやとに頼む（`/ask-ayato`。EC2 を起こして画面を出すところまでこちらでやってから）。
"""
import argparse, base64, csv, hashlib, json, math, os, re, shlex, statistics, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ec2-chrome"))
import ec2  # noqa: E402

ROOT = HERE.parents[2]
LANE = "ytstudio"
REMOTE = "/home/ubuntu/cdp/mymaps_ec2.py"
WORK = "/home/ubuntu/mymaps"
#: あやと 2026-11-15「マイマップはここに格納すること」
FOLDER = "1ldXPVCYmbhLOXfptFZnB12YdlWARA-MG"
WHICH = [("see", "見たいもの"), ("eat", "食べたいもの"), ("buy", "買いたいもの")]
#: 見たいものの地図を開いた時点の枠に入れる、中心からの距離（km）。遠いもの（修道院・山・渓谷）は
#: 枠に入れると縮尺が県ごとに引かれて中心部が点の塊になる（docs/mymaps.md「面に埋めるときの決まり」）
WALK_KM = 1.5
WHO = "mymaps:" + (os.environ.get("CLAUDE_CODE_SESSION_ID", "")[:8] or "local")


def rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


def read_csv(p: Path):
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def slug(d: Path) -> str:
    """EC2 の置き場の名前。mymaps の1つ上（bulgaria / skopje）"""
    return re.sub(r"[^\w-]", "_", d.resolve().parent.name)


def view(rows, walk=None):
    """ピンの群れが収まる中心と縮尺（python/build_bulgaria.py の view() と同じ式）。

    横 4:3 の枠（スマホで幅いっぱい・およそ 400x300）に、広がりの 1.35倍が入る縮尺を選ぶ。
    walk を渡すと、ピンの中央値から walk km より遠いものは枠に入れない（戻り値の3つ目に名前を返す）"""
    pts = [(float(r["緯度"]), float(r["経度"]), r["名前"]) for r in rows]
    far = []
    if walk:
        mla, mlo = statistics.median(p[0] for p in pts), statistics.median(p[1] for p in pts)
        k = math.cos(math.radians(mla))
        near = [p for p in pts if math.hypot((p[0] - mla) * 111.0, (p[1] - mlo) * 111.0 * k) <= walk]
        far = [p[2] for p in pts if p not in near]
        pts = near or pts
    la, lo = [p[0] for p in pts], [p[1] for p in pts]
    clat, clon = (min(la) + max(la)) / 2, (min(lo) + max(lo)) / 2
    dlon = max(max(lo) - min(lo), 1e-4) * 1.35
    dlat = max(max(la) - min(la), 1e-4) * 1.35 * (400 / 300)
    span = max(dlon, dlat / math.cos(math.radians(clat)))
    z = math.floor(math.log2(360.0 / span * (400 / 256)))
    return "%.4f,%.4f" % (clat, clon), max(12, min(17, z)), far


def plan(d: Path, city: str | None):
    mp = d / "mids.json"
    mids = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else None
    by = {m["which"]: m for m in (mids or {}).get("maps", [])}
    if not city:
        t = next(iter(by.values()), {}).get("title", "")
        city = t.split("｜")[0] if "｜" in t else None
    if not city:
        raise SystemExit(f"{rel(d)}: mids.json が無いので --city（題の頭。例: スコピエ）が要る")
    maps = []
    for which, label in WHICH:
        p = d / f"{which}.csv"
        if not p.exists():
            raise SystemExit(f"{rel(p)} が無い")
        rows = read_csv(p)
        if not rows:
            raise SystemExit(f"{rel(p)} の行が0")
        maps.append({"which": which, "label": label, "title": f"{city}｜{label}", "csv": p, "rows": rows,
                     "mid": by.get(which, {}).get("mid"),
                     "sha": hashlib.sha256(p.read_bytes()).hexdigest()[:16]})
    return mids, maps


def lease_run(purpose, fn):
    """札を持って fn() を回す。取れなければ 1"""
    with ec2.lease(LANE, who=WHO, purpose=purpose) as tk:
        if tk is None:
            print(f"{LANE} の札が取れなかった（python3 .claude/skills/ec2-chrome/ec2.py queue で誰が持っているか）")
            return 1
        ec2.put(str(HERE.parent / "ec2-chrome" / "cdp.py"), ec2.CDP_LIVE)
        ec2.put(str(HERE / "mymaps_ec2.py"), REMOTE)
        return fn()


def remote(cmd, timeout):
    st, out = ec2.run(f"mkdir -p {WORK} /home/ubuntu/shots; cd /home/ubuntu/cdp && {cmd}", timeout, quiet=True)
    return st, out


def sync(d: Path, city: str | None, force: bool) -> int:
    mids, maps = plan(d, city)
    s = slug(d)
    jobf = Path(f"/tmp/mymaps_job_{os.getpid()}.json")
    job = {"maps": [{"key": f"{s}-{m['which']}", "title": m["title"], "layer": m["label"], "mid": m["mid"],
                     "csv": f"{WORK}/{s}/{m['label']}.csv", "sha": m["sha"], "share": True} for m in maps]}
    jobf.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")

    def go():
        # CSV は材料（リポジトリの公開物）なので SSM に載せてよい（ec2-chrome の 4）。名前をレイヤ名にして送る
        # （取り込むとファイル名がレイヤ名になる）。**CSV と job は1回の send-command で書いて、そのまま回す。**
        # 1つずつ put すると5回ぶん SSM の列に並ぶ（ほかの人の長いコマンドの後ろで1回ずつ待つ）
        files = {f"{WORK}/{s}/{m['label']}.csv": m["csv"].read_bytes() for m in maps}
        files[f"{WORK}/{s}/job.json"] = jobf.read_bytes()
        sh = "".join(f"mkdir -p {shlex.quote(os.path.dirname(r))} && printf '%s' '{base64.b64encode(b).decode()}' | base64 -d > {shlex.quote(r)}\n"
                     for r, b in files.items())
        if len(sh) > 60000:
            raise SystemExit("CSV が大きすぎて1回で送れない（send-command の引数は 64KB まで）")
        if force:
            sh += f"rm -f {WORK}/{s}/state.json\n"
        st, out = remote(sh + f"timeout 1500 python3 -u mymaps_ec2.py job {WORK}/{s}/job.json {WORK}/{s}/state.json", 1600)
        print("\n".join(ln for ln in out.splitlines() if not ln.startswith("STATE ")))
        m = re.search(r"^STATE (.*)$", out, re.M)
        if not m:
            print(f"EC2 から結果が返らなかった（ssm {st}）")
            return 1
        state = json.loads(m.group(1))
        return write_mids(d, mids, maps, state, s)

    try:
        return lease_run(f"マイマップ {rel(d)} の取り込み", go)
    finally:
        jobf.unlink(missing_ok=True)


def write_mids(d: Path, mids, maps, state, s) -> int:
    bad = [m["which"] for m in maps if not state.get(f"{s}-{m['which']}", {}).get("imported")
           or not state.get(f"{s}-{m['which']}", {}).get("mid") and not m["mid"]
           or state.get(f"{s}-{m['which']}", {}).get("error")]
    new = mids is None
    if new and bad:
        # 作りかけの mids.json（mid が null の地図）を残すと、面がそれを読んで空の枠を出す
        print(f"済んでいない地図: {', '.join(bad)}。mids.json はまだ書かない（もう一度 sync を流すと続きから）")
        return 1
    out = []
    for m in maps:
        st = state.get(f"{s}-{m['which']}", {})
        mid = m["mid"] or st.get("mid")
        if m["mid"] and st.get("mid") and st["mid"] != m["mid"]:
            print(f"{m['which']}: mid が変わった（{m['mid']} → {st['mid']}）。面の埋め込みが外れるので書かない")
            return 1
        e = {"which": m["which"], "mid": mid, "title": m["title"], "pins": len(m["rows"])}
        # ll / z を書くのは、ここで作った mids.json と、もともと持っていたものだけ
        # （ソフィアの mids.json は build_bulgaria.py がピンの広がりから出すので書かない、と決めてある）
        if new or any("ll" in x for x in mids.get("maps", [])):
            ll, z, far = view(m["rows"], WALK_KM if m["which"] == "see" else None)
            e.update({"ll": ll, "z": z})
            if far:
                e["far"] = far
        out.append(e)
    if new:
        mids = {"_why": [
            "Google マイマップの埋め込みの id。あやとの kosaka.ayato のアカウントで作り、あやとの Drive のフォルダに置いてある。",
            "作った道具と作り直しかたは .claude/skills/mymaps/（docs/mymaps.md）。",
            "**ここを手で書き換えて地図を差し替えない。** ピンの中身は CSV（guide_book_check.py --mymaps が焼く）が正で、",
            "マイマップに取り込み直す（mymaps.py sync）。mid は取り込み直しても変わらない。",
            "**3枚とも『リンクを知っている全員が閲覧可』が要る。** 非公開に戻すと、面から地図が消える。",
            "ll / z は開いた時点の中心と縮尺で、ピンの広がりから出した（mymaps.py の view()）。手で書かない。",
            f"見たいものは、ピンの中央値から {WALK_KM}km より遠いもの（far）を枠に入れていない。入れると縮尺が引かれて中心部が潰れる。",
            "埋めるときは &hl=ja を付ける（docs/mymaps.md「面に埋めるときの決まり」）。",
        ]}
    mids["maps"] = out
    (d / "mids.json").write_text(json.dumps(mids, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {rel(d / 'mids.json')}")
    if bad:
        print(f"済んでいない地図: {', '.join(bad)}（もう一度 sync を流すと続きから）")
        return 1
    return 0


def move(dirs, folder) -> int:
    mids = []
    for d in dirs:
        for m in json.loads((d / "mids.json").read_text(encoding="utf-8"))["maps"]:
            mids.append((m["mid"], m["title"]))
    arg = ",".join(f"{m}@{t}" for m, t in mids)

    def go():
        st, out = remote(f"timeout 1100 python3 -u mymaps_ec2.py move {folder} {shlex.quote(arg)}", 1200)
        print(out.strip())
        return 0 if "MOVE_OK" in out else 1
    return lease_run("マイマップを Drive のフォルダへ", go)


KML = "https://www.google.com/maps/d/kml?mid={}&forcekml=1"
EMBED = "https://www.google.com/maps/d/embed?mid={}&hl=ja"
#: 前の取り込みで説明に残っていたもの。印の列（「あやとの好みに合う」「たぶん合う」「注意（…）」）と、
#: 座標の検索リンク（query=42.69,23.32。いまは名前で引く）
STALE = [("印の列", re.compile(r'<Data name="印">')), ("好みの字", re.compile(r"好み|たぶん合う|注意（")),
         ("印の記号", re.compile(r"[◎○⚠△]")), ("座標の検索", re.compile(r"query=-?\d+(\.\d+)?,-?\d+(\.\d+)?"))]


def curl(url):
    r = subprocess.run(["curl", "-sL", "-w", "\n%{http_code}", url], capture_output=True, text=True, timeout=60)
    body, _, code = r.stdout.rpartition("\n")
    return code, body


def verify(dirs) -> int:
    bad = 0
    print("| 地図 | mid | 埋め込み | KML | ピン（CSV） | 残り |\n| --- | --- | --- | --- | --- | --- |")
    for d in dirs:
        mids = json.loads((d / "mids.json").read_text(encoding="utf-8"))
        for m in mids["maps"]:
            rows = read_csv(d / f"{m['which']}.csv")
            ec, eb = curl(EMBED.format(m["mid"]))
            kc, kb = curl(KML.format(m["mid"]))
            n = len(re.findall(r"<Placemark", kb))
            names = set(re.findall(r"<Placemark>\s*<name>([^<]*)</name>", kb))
            # 残りは「CSV に無いのに地図に在る」もの。CSV がわざと持っている列（スコピエの「印: あやとが行った」）は残りではない
            raw = (d / f"{m['which']}.csv").read_text(encoding="utf-8-sig")
            have = {"印の列": "印" in (rows[0].keys() if rows else [])}
            left = [k for k, rx in STALE if rx.search(kb) and not (have.get(k) or (k not in have and rx.search(raw)))]
            miss = {r["名前"] for r in rows} - {x.replace("&amp;", "&") for x in names}
            # 埋め込みは非公開でも 200 を返す（中身が「権限がありません」）。題が中に在るかで公開を見る
            pub = m["title"] in eb.replace("\\u003d", "=")
            ok = ec == "200" and pub and kc == "200" and n == len(rows) and not left and not miss
            bad += not ok
            print(f"| {m['title']} | {m['mid']} | {ec}{'' if pub else '（非公開）'} | {kc} | {n}（{len(rows)}） | "
                  f"{'、'.join(left + ([f'無いピン {len(miss)}'] if miss else [])) or 'なし'} |")
    print(f"落ちた所 {bad}件")
    return 1 if bad else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a1 = sub.add_parser("sync")
    a1.add_argument("dir", type=Path)
    a1.add_argument("--city")
    a1.add_argument("--force", action="store_true", help="済んだ手の控え（EC2 の state.json）を捨ててやり直す")
    a2 = sub.add_parser("move")
    a2.add_argument("dirs", type=Path, nargs="+")
    a2.add_argument("--folder", default=FOLDER)
    a3 = sub.add_parser("verify")
    a3.add_argument("dirs", type=Path, nargs="+")
    a = ap.parse_args(argv)
    if a.cmd == "sync":
        return sync(a.dir, a.city, a.force)
    if a.cmd == "move":
        return move(a.dirs, a.folder)
    return verify(a.dirs)


if __name__ == "__main__":
    sys.exit(main())
