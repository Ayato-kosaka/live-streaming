"""**コマ番号を名指しして抜き出す道具が、新しい ffmpeg でも同じコマを同じ順で返すか。**

    python3 tools/shorts/render/selectexpr_selftest.py
    BREAK=flat python3 tools/shorts/render/selectexpr_selftest.py    # 守りを1つ外した版で回す（対照の子）
    SELECTEXPR_FFMPEG_DIRS=/a/bin:/b/bin python3 tools/shorts/render/selectexpr_selftest.py
                                          # 本物の足を、ほかの版の ffmpeg（静的ビルドの bin）でも回す

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

## なぜ要るか（2026-10-23、PR #1015 の CI の赤）

ショートの見張りの CI で apt が詰まり、ffmpeg が BtbN の master の夜間版（N-127941）に切り替わった晩、
書き出しの検査（`verify.py` の `grab`）と品質チェック（`qa/common.py` の `iter_frames`）が止まった。理由は2つ:

1. `-vsync` が消えていた（9.0 の枝から。`Unrecognized option 'vsync'`・終了コード 8）
2. `select` の式を `+` で横に長くつないでいた。FFmpeg は式の木の深さに上限 100 を入れた（8.1 の枝から）ので、
   101項から `Error while parsing expression` で止まる

式は `selectexpr.py` が括弧で浅く組むようにした。ここは、その組み方と、組んだ式を使う道具（`verify.py`・
`proof.py`・`contact_sheet.py`・`qa/common.py`）が**取りこぼさず・重ねず・順を崩さず**コマを返すことを見る。

## 何を見るか

| 足 | 確かめること | 要るもの |
| --- | --- | --- |
| `expr` | `select_expr` の式が選ぶコマが、頼んだコマとちょうど同じ（並べ替え・重複・続いた番号・飛び飛び・3,000区間）。式の深さが FFmpeg の数えかたで log2(区間)+1 以内。数えかたの校正: `+` で横に100項は深さ100で通り、101項は101で上限を超える（n8.1.3・n9.0.2・N-127941 で実測した境目） | なし |
| `census` | tools/shorts の道具に、`"+".join(f"eq(n…` と `"-vsync"` が1つも残っていない（見張り自身は数えない） | なし |
| `fake_new` | 新しい ffmpeg の偽物（式の深さの上限 100・`-vsync` が無い）で、本物の `verify.grab`・`proof.grab`・`contact_sheet.grab`・`common.iter_frames`（rgb と白黒）が、300区間のコマを同じ順で返す | numpy・Pillow |
| `chunk` | `common.iter_frames` の塊（`CHUNK`）を7にして、塊の境目をまたぐ続き番号・ちょうど7と14コマ・8コマ・飛び飛び・並べ替えと重複で、**境目のコマを落とさず・重ねず**返す。ffmpeg を起こす回数が塊の数と同じ・1回あたり7コマ以下 | numpy |
| `real` | 本物の ffmpeg（PATH の。`SELECTEXPR_FFMPEG_DIRS` があればその版でも）で、コマ番号を画素に焼いたロスの無い動画から、上の4つの道具が同じコマを同じ順で返す | numpy・Pillow・ffmpeg |

要る道具が無い足は「見ていない」と出して数えない（Selftests の箱には numpy も ffmpeg も無い。`expr` と
`census` はそこでも回る）。ショートを触った PR では `.github/workflows/shorts_selftest.yml` の回し役の段が
numpy・Pillow・ffmpeg の入った箱で拾うので、5本とも回る。

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。`real` が落ちるかは PATH の ffmpeg の版で決まる（6.1.1 は深さの上限も持たず `-vsync` もある）
ので、親が版に聞いてから欲しい足に足す。外す字が本物に見つからなければ 2 で落ちる。
"""
from __future__ import annotations

import importlib
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHORTS = HERE.parent
BREAK = os.environ.get("BREAK", "")

# 名前: (ファイル（リポジトリの根からの道。写しの木では tools/shorts/ を外して引く）, 本物の字, 外した字, 落ちるはずの足,
#        real も落ちる条件, 何を外したか)。根からの道で書くのは、見張りの棚卸し（python/watch_census_selftest.py）が
#        「qa/common.py」を ingest/common.py と見分けられないため
# 条件: always = どの ffmpeg でも / depth = PATH の ffmpeg が式の深さの上限を持つなら / vsync = -vsync を持たないなら
CUTS: dict[str, tuple[str, str, str, set[str], str, str]] = {
    "flat": ("tools/shorts/render/selectexpr.py", "    return _tree(leaves)\n", '    return "+".join(leaves)\n',
             {"expr", "fake_new"}, "depth", "式を括弧で組まず、+ で横につなぐ（前の形）"),
    "spans": ("tools/shorts/render/selectexpr.py", "        if out and f == out[-1][1] + 1:\n",
              "        if out and f <= out[-1][1] + 2:\n",
              {"expr", "fake_new", "chunk"}, "always", "1コマ飛びの番号も続きとして between に畳む（間のコマまで選ぶ）"),
    "vsync": ("tools/shorts/render/verify.py", '"-fps_mode", "passthrough", "-f", "rawvideo",',
              '"-vsync", "0", "-f", "rawvideo",',
              {"census", "fake_new"}, "vsync", "verify.grab を -vsync 0 に戻す（9.0 で消えたオプション）"),
    "inline": ("tools/shorts/render/contact_sheet.py", '"-vf", f"select={select_expr(uniq)}",',
               '"-vf", "select=" + "+".join(f"eq(n\\\\,{f})" for f in uniq),',
               {"census", "fake_new"}, "depth", "contact_sheet が式を自分で + でつなぐ（selectexpr を通さない）"),
    "drop": ("tools/shorts/qa/common.py", "        part = want[k:k + chunk]\n", "        part = want[k:k + chunk - 1]\n",
             {"chunk"}, "always", "塊の最後のコマを落とす"),
    "dup": ("tools/shorts/qa/common.py", "        part = want[k:k + chunk]\n", "        part = want[max(k - 1, 0):k + chunk]\n",
            {"chunk"}, "always", "前の塊の最後のコマを、次の塊でもう一度出す"),
}

# ---------------------------------------------------------------- 新しい ffmpeg の偽物
# 式の読み・深さの数えかたは FFmpeg（libavutil/eval.c）に合わせる: `+` は左から積み、関数は引数の深さ + 1、
# n と数は 0、括弧は数えない。深さが MAX_DEPTH（100）を超えたら止まる。`-vsync` は無い（9.0 から）。
# 動画は JSON（{"frames": コマ数, "w": 幅, "h": 高さ}）で、コマ n の画素は (n % 256, n // 256, 77)。
# selectexpr.py の関数は使わない（組む側と読む側を別に書かないと、同じ間違いを両方がして通る）
FAKE = r'''
import json, os, sys

MAX_DEPTH = 100


def parse(expr):
    s = expr.replace("\\,", ",")
    pos = [0]

    def peek():
        return s[pos[0]] if pos[0] < len(s) else ""

    def eat(c):
        if peek() != c:
            raise SyntaxError(f"{c!r} が要る所に {s[pos[0]:pos[0] + 12]!r}")
        pos[0] += 1

    def atom():
        if peek() == "(":
            eat("(")
            r = chain()
            eat(")")
            return r
        j = pos[0]
        while peek().isalnum():
            pos[0] += 1
        word = s[j:pos[0]]
        if word == "n":
            return (lambda n: n), 0
        if word.isdigit():
            v = int(word)
            return (lambda n: v), 0
        eat("(")
        args = [chain()]
        while peek() == ",":
            eat(",")
            args.append(chain())
        eat(")")
        fs = [a[0] for a in args]
        d = max(a[1] for a in args) + 1
        if word == "eq" and len(fs) == 2:
            return (lambda n: int(fs[0](n) == fs[1](n))), d
        if word == "between" and len(fs) == 3:
            return (lambda n: int(fs[1](n) <= fs[0](n) <= fs[2](n))), d
        if word == "not" and len(fs) == 1:
            return (lambda n: int(fs[0](n) == 0)), d
        if word == "mod" and len(fs) == 2:
            return (lambda n: fs[0](n) % fs[1](n)), d
        raise SyntaxError(f"知らない関数 {word}")

    def chain():
        f, d = atom()
        while peek() == "+":
            eat("+")
            g, e = atom()
            f = (lambda f, g: lambda n: f(n) + g(n))(f, g)
            d = max(d, e) + 1
            if d > MAX_DEPTH:
                raise MemoryError(d)
        return f, d

    f, d = chain()
    if pos[0] != len(s):
        raise SyntaxError(f"余り {s[pos[0]:pos[0] + 12]!r}")
    return f, d


def split_filters(vf):
    out, cur, i = [], "", 0
    while i < len(vf):
        if vf[i] == "\\" and i + 1 < len(vf):
            cur += vf[i:i + 2]
            i += 2
            continue
        if vf[i] == ",":
            out.append(cur)
            cur = ""
        else:
            cur += vf[i]
        i += 1
    return out + [cur]


def ffprobe(a):
    src = json.load(open(a[-1]))
    if "stream=width,height" in a:
        print(f"{src['w']}x{src['h']}")
        return 0
    return 1


def ffmpeg(a):
    if "-version" in a:
        print("ffmpeg version fake-new")
        return 0
    opt, i = {}, 0
    while i < len(a):
        k = a[i]
        if k == "-vsync":
            sys.stderr.write("Unrecognized option 'vsync'.\nError splitting the argument list: Option not found\n")
            return 8
        if k in ("-hide_banner",):
            i += 1
            continue
        if k == "-" and i == len(a) - 1:
            break
        opt[k] = a[i + 1]
        i += 2
    if opt.get("-fps_mode", "passthrough") != "passthrough" or opt.get("-f") != "rawvideo":
        sys.stderr.write(f"偽物の知らない形: {opt}\n")
        return 1
    src = json.load(open(opt["-i"]))
    fl = split_filters(opt.get("-vf", "select=1"))
    if len(fl) != 1 or not fl[0].startswith("select="):
        sys.stderr.write(f"偽物は select だけを読む: {fl}\n")
        return 1
    expr = fl[0][len("select="):]
    try:
        sel, depth = parse(expr)
    except MemoryError:
        sys.stderr.write(f"[Parsed_select_0 @ 0x0] Error while parsing expression '{expr[:60]}'\n"
                         "Error opening output files: Cannot allocate memory\n")
        return 244
    w, h = src["w"], src["h"]
    gray = opt.get("-pix_fmt") == "gray"
    limit = int(opt.get("-frames:v", 1 << 30))
    picked = [n for n in range(src["frames"]) if sel(n)][:limit]
    log = os.environ.get("FAKE_FF_LOG")
    if log:
        with open(log, "a") as fh:
            fh.write(json.dumps({"picked": picked, "depth": depth}) + "\n")
    out = bytearray()
    for n in picked:
        px = bytes([n % 256]) if gray else bytes([n % 256, (n // 256) % 256, 77])
        out += px * (w * h)
    try:
        sys.stdout.buffer.write(bytes(out))
        sys.stdout.buffer.flush()
    except BrokenPipeError:
        pass
    return 0


if __name__ == "__main__":
    name = os.path.basename(sys.argv[0])
    sys.exit(ffprobe(sys.argv[1:]) if name == "ffprobe" else ffmpeg(sys.argv[1:]))
'''


def fake_ns() -> dict:
    ns: dict = {"__name__": "fake_ffmpeg"}
    exec(compile(FAKE, "fake_ffmpeg", "exec"), ns)  # noqa: S102 — 自分で書いた偽物を、読む側として使う
    return ns


# ---------------------------------------------------------------- 写しと道具

class Box:
    """tools/shorts/render と qa の .py を写した木（守りを外すならここを書き換える）と、偽の ffmpeg。"""

    def __init__(self, root: Path, cut: str | None):
        self.root = root
        for d in ("render", "qa"):
            (root / d).mkdir(parents=True)
            for p in (SHORTS / d).glob("*.py"):
                shutil.copy2(p, root / d / p.name)
        if cut:
            rel, old, new, *_ = CUTS[cut]
            p = root / rel.removeprefix("tools/shorts/")
            text = p.read_text(encoding="utf-8")
            if text.count(old) != 1:
                raise SystemExit(f"外す字が {rel} に {text.count(old)}か所（1か所のはず）: {old!r}")
            p.write_text(text.replace(old, new), encoding="utf-8")
        self.fakebin = root / "fakebin"
        self.fakebin.mkdir()
        for name in ("ffmpeg", "ffprobe"):
            (self.fakebin / name).write_text(f"#!{sys.executable}\n" + FAKE)
            (self.fakebin / name).chmod(0o755)
        self._mods: dict = {}

    def mod(self, name: str):
        if name not in self._mods:
            for d in ("qa", "render"):
                if str(self.root / d) not in sys.path:
                    sys.path.insert(0, str(self.root / d))
            self._mods[name] = importlib.import_module(name)
        return self._mods[name]


def have(*mods: str) -> str | None:
    """要る道具が無ければ、その名前を返す。"""
    for m in mods:
        try:
            importlib.import_module(m)
        except ImportError:
            return m
    return None


def ids_rgb(arr) -> list[int]:
    return [int(a[0, 0, 0]) + 256 * int(a[0, 0, 1]) for a in arr]


def with_path(prefix: str):
    """PATH の頭に置き場を足す（子の ffmpeg がそれを起こす）。戻す関数を返す。"""
    old = os.environ.get("PATH", "")
    os.environ["PATH"] = prefix + os.pathsep + old

    def back():
        os.environ["PATH"] = old
    return back


EVERY_OTHER = list(range(0, 600, 2))          # 300区間（飛び飛び）。+ で横につなぐと深さ300
WIDE = EVERY_OTHER + list(range(601, 640))    # 続いた番号の区間も1つ混ぜる


def check_tools(box: Box, video: Path, W: int, H: int, chunk: int | None) -> list[tuple[str, bool]]:
    """本物の4つの道具で WIDE を取り、返ったコマの番号と順を見る。chunk があれば iter_frames の塊をそれにする。"""
    res = []
    want = sorted(set(WIDE))
    for name in ("verify", "proof", "contact_sheet"):
        try:
            got = box.mod(name).grab(video, list(reversed(WIDE)) + WIDE[:5], W, H)
            keys = list(got)
            ok = keys == want and ids_rgb(list(got.values())) == want
            res.append((f"{name}.grab が {len(want)}コマ（{len(want) - 39}区間の飛び飛び＋続き1区間）を同じ番号・同じ順で返す"
                        f"（返った {len(keys)}）", ok))
        except Exception as e:  # noqa: BLE001 — 道具が落ちたことを、ほかの道具を止めずに数える
            res.append((f"{name}.grab が落ちた: {type(e).__name__}: {str(e)[:160]}", False))
    common = box.mod("common")
    keep = common.CHUNK
    if chunk:
        common.CHUNK = chunk
    try:
        got = list(common.iter_frames(video, WIDE, W, H))
        ok = [f for f, _ in got] == want and ids_rgb([a for _, a in got]) == want
        res.append((f"common.iter_frames（塊 {common.CHUNK}）が {len(want)}コマを同じ番号・同じ順で返す（返った {len(got)}）",
                    ok))
    except Exception as e:  # noqa: BLE001
        res.append((f"common.iter_frames が落ちた: {type(e).__name__}: {str(e)[:160]}", False))
    finally:
        common.CHUNK = keep
    return res


# ---------------------------------------------------------------- 足

def leg_expr(box: Box) -> list[tuple[str, bool]]:
    se = box.mod("selectexpr")
    parse = fake_ns()["parse"]
    rnd = random.Random(1015)
    cases = {
        "1コマ": [0], "1コマ（途中）": [57], "続き3コマ": [5, 6, 7], "続き100コマ": list(range(100)),
        "並べ替えと重複": [30, 2, 2, 15, 16, 17, 30, 99, 1],
        "1コマ飛び 300区間": EVERY_OTHER, "1コマ飛び 3,000区間": list(range(0, 6000, 2)),
        "でたらめ 500": rnd.sample(range(5000), 500), "でたらめ 2,000": rnd.sample(range(5000), 2000),
    }
    res = []
    for what, frames in cases.items():
        expr = se.select_expr(frames)
        try:
            f, d = parse(expr)
        except (MemoryError, SyntaxError) as e:
            res.append((f"{what}: 式を偽の ffmpeg が読めない（{type(e).__name__}: {e}）", False))
            continue
        top = max(frames) + 3
        got = {n for n in range(top) if f(n)}
        k = len(se.spans(frames))
        lim = math.ceil(math.log2(k)) + 1 if k > 1 else 1
        res.append((f"{what}: 選ぶコマが頼んだコマとちょうど同じ・深さ {d}（{k}区間。log2+1 = {lim} 以内）",
                    got == set(frames) and d <= lim))
    # 数えかたの校正（実測の境目: 横に100項は通り、101項で止まる）
    flat = lambda k: "+".join(f"eq(n\\,{i})" for i in range(k))  # noqa: E731
    ok100 = parse(flat(100))[1] == 100
    try:
        parse(flat(101))
        ok101 = False
    except MemoryError:
        ok101 = True
    res.append(("偽物の数えかたが実測と同じ（+ で横に100項は深さ100で通り、101項は止まる）", ok100 and ok101))
    try:
        se.select_expr([])
        res.append(("空の並びで式を組まずに止まる", False))
    except ValueError:
        res.append(("空の並びで式を組まずに止まる", True))
    return res


PAT_JOIN = re.compile(r"""["']\+["']\s*\.join\(\s*f?["'](?:eq|between)\(n""")
PAT_VSYNC = re.compile(r"""["']-vsync["']""")


def leg_census(box: Box) -> list[tuple[str, bool]]:
    files = sorted((box.root / "render").glob("*.py")) + sorted((box.root / "qa").glob("*.py"))
    files += [p for p in sorted(SHORTS.rglob("*.py"))
              if p.parent.name not in ("render", "qa") or p.parent.parent != SHORTS]
    files = [p for p in files if not p.name.endswith("_selftest.py") and "node_modules" not in p.parts]
    joins, vs = [], []
    for p in files:
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            name = f"{p.parent.name}/{p.name}:{i}"
            if PAT_JOIN.search(line):
                joins.append(name)
            if PAT_VSYNC.search(line):
                vs.append(name)
    return [(f"{len(files)}本の道具を見た（0 を答えにしない）", len(files) > 20),
            (f"select の式を + で横につなぐ所が無い（{joins or 'なし'}）", not joins),
            (f"-vsync を渡す所が無い（{vs or 'なし'}）", not vs)]


def fake_video(box: Box, frames: int = 700, w: int = 8, h: int = 4) -> Path:
    p = box.root / f"fake_{frames}.mp4"
    p.write_text(json.dumps({"frames": frames, "w": w, "h": h}))
    return p


def leg_fake_new(box: Box) -> list[tuple[str, bool]]:
    v = fake_video(box)
    back = with_path(str(box.fakebin))
    try:
        res = check_tools(box, v, 8, 4, None)
        common = box.mod("common")
        got = [f for f, a in common.iter_frames(v, EVERY_OTHER[:120], 8, 4, gray=True)
               if int(a[0, 0]) == f % 256]
        res.append(("common.iter_frames の白黒も、同じ番号のコマを返す", got == EVERY_OTHER[:120]))
    finally:
        back()
    return res


def leg_chunk(box: Box) -> list[tuple[str, bool]]:
    common = box.mod("common")
    v = fake_video(box, 200)
    log = box.root / "ff_calls.jsonl"
    back = with_path(str(box.fakebin))
    os.environ["FAKE_FF_LOG"] = str(log)
    keep = common.CHUNK
    common.CHUNK = 7
    res = []
    cases = {
        "続き50コマ（境目を7回またぐ）": list(range(3, 53)),
        "ちょうど7コマ": list(range(7)), "ちょうど14コマ": list(range(20, 34)), "8コマ（1つ余る）": list(range(8)),
        "2コマ飛び": list(range(0, 120, 3)), "1コマ飛び": list(range(0, 41, 2)),
        "並べ替えと重複（境目に重複）": [30, 2, 2, 15, 16, 17, 18, 19, 20, 21, 22, 23, 99, 30, 22],
    }
    try:
        for what, frames in cases.items():
            log.write_text("")
            want = sorted(set(frames))
            try:
                got = list(common.iter_frames(v, frames, 8, 4))
            except Exception as e:  # noqa: BLE001
                res.append((f"{what}: 落ちた（{type(e).__name__}: {str(e)[:120]}）", False))
                continue
            fs = [f for f, _ in got]
            ids = ids_rgb([a for _, a in got])
            calls = [json.loads(x) for x in log.read_text().splitlines()]
            n_chunks = math.ceil(len(want) / 7)
            ok = fs == want and ids == want and len(calls) == n_chunks and all(len(c["picked"]) <= 7 for c in calls)
            res.append((f"{what}: {len(want)}コマを落とさず・重ねず・順のまま（返った {len(fs)}・番号の食い違い "
                        f"{sum(a != b for a, b in zip(ids, fs))}・ffmpeg {len(calls)}回 / 塊 {n_chunks}）", ok))
    finally:
        common.CHUNK = keep
        os.environ.pop("FAKE_FF_LOG", None)
        back()
    return res


def make_id_video(path: Path) -> None:
    """コマ n の画素が (n % 256, n // 256, 77) の、ロスの無い 16x8・720コマの動画（PATH の ffmpeg で作る）。"""
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "lavfi",
                    "-i", "color=c=black:s=16x8:r=30:d=24",
                    "-vf", "format=rgb24,geq=r='mod(N,256)':g='trunc(N/256)':b='77'",
                    "-c:v", "rawvideo", "-pix_fmt", "rgb24", "-f", "nut", str(path)],
                   check=True, capture_output=True, timeout=120)


def ffmpeg_dirs() -> list[str]:
    """本物の足で当てる ffmpeg の置き場。'' は PATH のまま。"""
    extra = [d for d in os.environ.get("SELECTEXPR_FFMPEG_DIRS", "").split(os.pathsep) if d]
    return ([""] if shutil.which("ffmpeg") else []) + extra


def leg_real(box: Box) -> list[tuple[str, bool]]:
    res = []
    for k, d in enumerate(ffmpeg_dirs()):
        back = with_path(d) if d else (lambda: None)
        try:
            ver = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.split("\n")[0][:48]
            v = box.root / f"id_{k}.nut"
            make_id_video(v)
            res.append((f"[{ver}] コマ番号を焼いた動画を作った", v.stat().st_size > 0))
            res += [(f"[{ver}] {what}", ok) for what, ok in check_tools(box, v, 16, 8, 7)]
        except Exception as e:  # noqa: BLE001
            res.append((f"[{d or 'PATH'}] 回せない: {type(e).__name__}: {str(e)[:160]}", False))
        finally:
            back()
    return res


# 足: (関数, 要るもの)
LEGS = {
    "expr": (leg_expr, ()),
    "census": (leg_census, ()),
    "fake_new": (leg_fake_new, ("numpy", "PIL")),
    "chunk": (leg_chunk, ("numpy",)),
    "real": (leg_real, ("numpy", "PIL")),
}


def missing(name: str) -> str | None:
    m = have(*LEGS[name][1])
    if m:
        return f"{m} が無い"
    if name == "real" and not ffmpeg_dirs():
        return "ffmpeg が無い"
    return None


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    failed, checked = [], 0
    with tempfile.TemporaryDirectory() as td:
        try:
            box = Box(Path(td), name)
        except SystemExit as e:
            print(f"✕ {e.code}")
            return 2
        for leg, (fn, _) in LEGS.items():
            why = missing(leg)
            if why:
                print(f"[{leg}]\n  – 見ていない（{why}）")
                continue
            try:
                res = fn(box)
            except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
                res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
            checked += len(res)
            if not res or any(not ok for _, ok in res):
                failed.append(leg)
            print(f"[{leg}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def path_ffmpeg_traits() -> dict[str, bool]:
    """PATH の ffmpeg が、式の深さの上限を持つか・-vsync を持たないか（対照の欲しい足を決める）。"""
    if not shutil.which("ffmpeg"):
        return {}
    src = ["-f", "lavfi", "-i", "color=c=black:s=16x16:r=30:d=5"]
    flat = "+".join(f"eq(n\\,{i})" for i in range(101))
    r = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", *src, "-vf", f"select={flat}",
                        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                       capture_output=True, timeout=60)
    v = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", *src, "-vf", "select=eq(n\\,1)", "-vsync", "0",
                        "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, timeout=60)
    return {"always": True, "depth": len(r.stdout) < 101 * 256, "vsync": v.returncode != 0}


def drill() -> tuple[list[str], int]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る。外れた守りと、当てた数を返す"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    traits = path_ffmpeg_traits()
    seen = {leg for leg in LEGS if not missing(leg) and (leg != "real" or shutil.which("ffmpeg"))}
    env = {k: v for k, v in os.environ.items() if k != "SELECTEXPR_FFMPEG_DIRS"}  # 子は PATH の ffmpeg だけ
    bad, tried = [], 0
    for name, (_, _, _, want, real_if, why) in CUTS.items():
        want = set(want) | ({"real"} if traits.get(real_if) else set())
        want &= seen
        if not want:
            print(f"  – BREAK={name}（{why}）は当てていない（落ちるはずの足が、この箱では見られない）")
            continue
        tried += 1
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(env, BREAK=name), timeout=600, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad, tried


def main() -> int:
    if BREAK:
        return child(BREAK)
    rc = child(None)
    print()
    bad, tried = drill()
    print()
    if rc == 2:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ 本物で足が通り、守り {tried}個（{len(CUTS)}個のうち。当てていないものと見ていない足は上に – で出した）"
          "を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
