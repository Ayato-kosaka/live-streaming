#!/usr/bin/env python3
"""**批評役の JSON から、関所の合否を数える。** 批評役の「通る／通らない」の一言では決めない。

    python3 tools/shorts/script/critic_gate.py <critic.json> <script.txt>            # 隣の spec.json（印・題の札）も読む
    python3 tools/shorts/script/critic_gate.py <critic.json> <script.txt> --json     # まとめ役・記録用に1行の JSON

終了コード **0=通る（✕ が無い） / 1=落ちる（✕ がある） / 2=JSON が読めない・型が違う・行の数が合わない**。

## なぜ機械が数えるか（#1011）

2026-10-21 のフランス周遊では、ほぼ同じ字が、ある批評役では全部 4 以上、次の批評役では 3 が3つ、で通ったり落ちたりした。
批評役が長い文章で返すと、どれが帳面に当たる指摘で、どれが好みかを、まとめ役が毎回読み分けることになる。
返す形を決め（`critic_schema.json`）、**全部の行に「つなぎ」を1字ずつ**付けさせれば、跳ぶ行・取消の数・捨てた問いはここで数えられる。

## 何を ✕（落とす）にして、何を △（直し候補）にするか

`script_writing.md` 7.4 の決まりのまま。

| ✕ | △ |
| --- | --- |
| lint の ✕ | (a)〜(f) の 3 |
| (a)〜(f) の 2 以下 | 離れる行（leave） |
| (h) 約束のカードに当たる行 | ✕ の理由が【あやと】の行（あやとが書いた・決めた字）だけに当たるもの。まとめ役が裁く（7.3） |
| (h) **当てていない約束**（`checked` に無いカードの ID。`ledger` に挙げた ID は当てたに数える） | (h) の F-039（行間）・F-040（二転三転）で、同じ行に (i)(j)(k) の当たりが無いもの。批評役自身の行ごとの見かたでは渡れている |
| (j) その行だけ聞いて意味が通らない行（`alone` の `ok` が false） | カードに無い ID |
| (k) 画に居ない人（視聴者のコメントなど）の言葉を持ち出した行（`outsider`） | |
| (i) 跳ぶ行・答えない問い・答える前に移る問い・前に声の無い数 | |
| (i) 取消の2回目・印の無い取消・理由が声に無い取消・2行以上を消す取消・すぐ向きを戻す取消 | |

**「人の話の印があるか」は当てない**（2026-10-23 #1019、帳面 F-048）。前は印の無い伝聞を ✕ にしていて、批評役が「コメントで」を
要求する作りだった（滝の回 p1 の8・9行目がそれで通り、関所が「思てたのに」を足させる向きに押した）。いまの当たりは (k)。
**約束のカードを全部当てたか**は `checked` で見る。前は批評役が当てたかどうかが分からなかった（F-050「書く前と渡す前に1つずつ当てる」）。

最後の行が「アーカイブ」の1行なら、その行の (i)(j) は数えない（7.4）。

**承認済みの原稿を読み直すとき**（`script_writing.md` 7.7 の対照）は `--as-of <日付>:<あやとの返事のコメントID>` を渡す。
その時点より後にできた帳面の項目に当たった ✕ は △ にする。`lint.py --as-of` と同じ理由——承認より後にできた決まりで落ちたものを、
原稿の誤りと取り違えない（城塞 p1 は 2026-10-21 01:57 に承認され、F-037 は 09:28、F-039・F-040 は 11:57 にできた）。

**△ だけなら通る。** △ は1回だけ直す候補で、2人目の批評役は呼ばない（`script_writing.md` 7 の上限）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SCHEMA = HERE / "critic_schema.json"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools/shorts/feedback"))
import brief  # noqa: E402
import ledger as ledger_mod  # noqa: E402
import lint as lint_mod  # noqa: E402

TSUNAGI = {"題", "答", "反", "足", "前", "転", "外", "跳", "締"}
# (i)(j)(k) で数える帳面の項目。(h) で挙げても、同じ行に (i)(j)(k) の当たりが無ければ △
I_SIDE = {"F-039", "F-040"}


def check_shape(d, schema: dict, where: str = "") -> list:
    """`critic_schema.json` の形に合うか（jsonschema を入れずに済む範囲だけ: 型・必須・enum・範囲・余計な鍵）。"""
    errs = []
    t = schema.get("type")
    py = {"object": dict, "array": list, "string": str, "integer": int, "boolean": bool}
    if t and not isinstance(d, py[t]) or (t == "integer" and isinstance(d, bool)):
        return [f"{where or '頭'}: {t} ではない"]
    if t == "object":
        for k in schema.get("required", []):
            if k not in d:
                errs.append(f"{where}.{k}: 無い")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            errs += [f"{where}.{k}: 決まりに無い鍵" for k in d if k not in props]
        for k, sub in props.items():
            if k in d:
                errs += check_shape(d[k], sub, f"{where}.{k}")
    elif t == "array":
        for i, x in enumerate(d):
            errs += check_shape(x, schema.get("items", {}), f"{where}[{i}]")
    else:
        if "enum" in schema and d not in schema["enum"]:
            errs.append(f"{where}: {d!r} は {schema['enum']} のどれでもない")
        if t == "integer":
            if "minimum" in schema and d < schema["minimum"] or "maximum" in schema and d > schema["maximum"]:
                errs.append(f"{where}: {d} は範囲の外")
        if t == "string" and "pattern" in schema and not re.match(schema["pattern"], d):
            errs.append(f"{where}: {d!r} が形に合わない")
    return errs


def in_force(item, as_of: tuple | None) -> bool:
    """帳面の項目が、as_of（日付, コメントID か None）の時点で在ったか。

    「言われた」の箇条のどれか1つが、as_of より前（日付が前・同じ日なら URL のコメントID が as_of 以下）なら在った。
    同じ日のチャットでコメントID の無い箇条は、前か後か分からないので「在った」に倒す（落とす側に倒す）。
    """
    if as_of is None:
        return True
    day, cid = as_of
    for ln in item.fields.get("言われた", "").splitlines():
        m = ledger_mod.DATE.search(ln)
        if not m:
            continue
        d = m.group(0)
        ids = [int(x) for x in re.findall(r"#issuecomment-(\d+)", ln)]
        if d < day or (d == day and (cid is None or not ids or min(ids) <= cid)):
            return True
    return False


def parse_as_of(s: str | None) -> tuple | None:
    """`2026-10-21` か `2026-10-21:6306110329`（その日の、そのコメントの時点）。"""
    if not s:
        return None
    day, _, cid = s.partition(":")
    if not re.fullmatch(r"20\d\d-\d\d-\d\d", day) or (cid and not cid.isdigit()):
        raise ValueError(f"--as-of は YYYY-MM-DD か YYYY-MM-DD:<コメントID>: {s}")
    return day, (int(cid) if cid else None)


def judge(d: dict, c, rows: list, led=None, as_of: tuple | None = None) -> dict:
    """批評役の JSON（d）と原稿（c・rows）から、✕ と △ を数える。

    Returns:
        {"fail": [(行, 種類, 理由)], "look": [...], "bad": [形の崩れ], "n": 行数}
    """
    n = len(c.lines)
    led = led or ledger_mod.load()
    known = {**led.items, **{o.id: o for o in ledger_mod.OWN}}   # 帳面の項目と、帳面の外の約束（X2）
    fail, look, bad = [], [], []
    ayato = {i for i, r in enumerate(rows, 1) if "【あやと】" in brief.marks(r)}
    if 1 in ayato:
        ayato.add(0)    # 題の札は、1行目（読み上げる題）と同じ人の字
    last_archive = bool(c.lines) and "アーカイブ" in c.lines[-1]

    def put(line, kind, why, i_side=False):
        if i_side and last_archive and line == n:
            return
        if line in ayato:
            look.append((line, kind, f"【あやと】の行（まとめ役が裁く）: {why}"))
        else:
            fail.append((line, kind, why))

    def in_range(x, lo=1):
        return isinstance(x, int) and lo <= x <= n

    tsu = d.get("tsunagi", [])
    if len(tsu) != n:
        bad.append(f"tsunagi が {len(tsu)} 個（原稿は {n} 行）")
    for i, t in enumerate(tsu[:n], 1):
        if t == "跳":
            put(i, "(i) 跳", "前の行の頭から渡れない", i_side=True)

    for q in d.get("questions", []):
        ln, ans = q.get("line"), q.get("answered_by")
        if not in_range(ln):
            bad.append(f"questions の行 {ln} が範囲の外")
            continue
        final_ask = ln == n or (ln == n - 1 and last_archive)
        if final_ask:
            continue
        if not ans or not in_range(ans) or ans <= ln:
            put(ln, "(i) 問い", "答えないまま終わる", i_side=True)
        elif q.get("moved"):
            put(ln, "(i) 問い", f"{ans}行目で答える前に、別の話題へ移る", i_side=True)

    cancels = sorted((t for t in d.get("turns", []) if t.get("kind") == "取消"), key=lambda t: t.get("line", 0))
    for k, t in enumerate(cancels):
        ln = t.get("line")
        if not in_range(ln):
            bad.append(f"turns の行 {ln} が範囲の外")
            continue
        if k >= 1:
            put(ln, "(i) 取消", f"1本で{k + 1}回目の取消")
        if not (t.get("mark") or "").strip():
            put(ln, "(i) 取消", "取消の印（思てたら・でも…）が無い")
        if not t.get("reason"):
            put(ln, "(i) 取消", "打ち消す理由が声に無い")
        if len(t.get("erases") or []) >= 2:
            put(ln, "(i) 取消", f"{len(t['erases'])}行で積んだ結論を打ち消す")
        if t.get("back"):
            put(ln, "(i) 取消", "すぐあとで同じ話題の向きをもう一度変える")

    # (j) 全部の行を1件ずつ（行の番号つき。字の並びだと、批評役が1つ多く・少なく返して行がずれる）。題の札（行 0）は声の行ではないので飛ばす
    alone = {}
    for x in d.get("alone", []):
        ln = x.get("line")
        if ln == 0:
            continue
        if not in_range(ln) or ln in alone:
            bad.append(f"alone の行 {ln} が範囲の外か、2回ある")
            continue
        alone[ln] = x
    if set(alone) != set(range(1, n + 1)):
        bad.append(f"alone に無い行: {sorted(set(range(1, n + 1)) - set(alone))}")
    for i in sorted(alone):
        if not alone[i].get("ok"):
            put(i, "(j) その行だけで通らない", alone[i].get("why") or "その行だけ聞いて意味が通らない", i_side=True)
    for h in d.get("outsider", []):
        if in_range(h.get("line")):
            put(h["line"], "(k) 画に居ない人の言葉", f"{h.get('who') or '旅の場に居ない人'}の言葉で話を動かす（F-048）")
        else:
            bad.append(f"outsider の行 {h.get('line')} が範囲の外")
    for x in d.get("numbers", []):
        if in_range(x.get("line")) and not x.get("said_before"):
            put(x["line"], "(i) 数", "あとで拾う数・前提が、前の行の声に無い", i_side=True)

    i_lines = {x[0] for x in fail + look if x[1].startswith(("(i)", "(j)", "(k)"))}
    for h in d.get("ledger", []):
        fid, ln = h.get("id"), h.get("line")
        if not in_range(ln, 0):
            bad.append(f"ledger の行 {ln} が範囲の外")
            continue
        if fid not in known:
            look.append((ln, "(h) ?", f"カードに無い ID {fid}: {h.get('why', '')}"))
            continue
        if not in_force(known[fid], as_of):
            # 承認済みの原稿を読み直すとき、承認より後にできた決まりで落ちたものを、原稿の誤りと取り違えない（lint の --as-of と同じ）
            look.append((ln, f"(h) {fid}", f"as_of より後にできた決まり（{h.get('why', '')}）"))
            continue
        if fid in I_SIDE and ln not in i_lines:
            # 行間（F-039）と二転三転（F-040）は (i) で数える項目。同じ行に (i) の当たりが無いのに (h) だけで挙げたのは、
            # 批評役自身の行ごとのつなぎでは渡れている、ということ。印象の揺れを ✕ にしない（まとめ役が読む）
            look.append((ln, f"(h) {fid}", f"(i) では渡れている（{h.get('why', '')}）"))
            continue
        put(ln, f"(h) {fid}", h.get("why", ""))

    # 約束のカードを全部当てたか（`ledger` に挙げた ID は当てたに数える）。承認済みの読み直し（as_of）でも、批評役には全部のカードを渡している
    seen = set(d.get("checked", [])) | {h.get("id") for h in d.get("ledger", [])}
    miss = [i for i in brief.card_ids(led) if i not in seen]
    if miss:
        fail.append((None, "(h) 当てていない約束", "・".join(miss)))
    for k, v in sorted((d.get("scores") or {}).items()):
        why = (d.get("score_why") or {}).get(k, "")
        if v <= 2:
            fail.append((None, f"({k}) {v}", why))
        elif v == 3:
            look.append((None, f"({k}) 3", why))
    for x in d.get("leave", []):
        look.append((x.get("line"), "(g) 離れる", x.get("why", "")))
    return {"fail": fail, "look": look, "bad": bad, "n": n}


def as_of_text(as_of: tuple | None) -> str | None:
    """（日付, コメントID）→ lint の --as-of の字（`2026-10-23:6354242835`）。"""
    if not as_of:
        return None
    return f"{as_of[0]}:{as_of[1]}" if as_of[1] is not None else as_of[0]


def lint_fails_of(c, as_of: tuple | None = None) -> list:
    """lint の ✕。批評役が何も挙げなくても、関所はこれで落とす。

    2026-10-23 のフォカッチャの下書きは、1行目が題の札と違い（T-READ）、最後の誘いに時刻が無かった（L-NEXT）。
    どちらも字で決まるので、批評役の目の揺れに任せない（帳面 F-047）。
    """
    return [h for h in lint_mod.lint(c, as_of_text(as_of))["hits"] if not h.look]


def report(res: dict, lint_fails: list, d: dict) -> str:
    out = []
    for h in lint_fails:
        where = "題の札" if h.line == 0 else ("原稿ぜんぶ" if h.line is None else f"{h.line}行目")
        out.append(f"✕ lint {h.rule} {where}: {h.note}")
    key = lambda x: (x[0] if isinstance(x[0], int) else -1, x[1])  # noqa: E731
    for ln, kind, why in sorted(res["fail"], key=key):
        out.append(f"✕ {kind} {'点' if ln is None else ('題の札' if ln == 0 else f'{ln}行目')}: {why}")
    for ln, kind, why in sorted(res["look"], key=key):
        out.append(f"△ {kind} {'点' if ln is None else ('題の札' if ln == 0 else f'{ln}行目')}: {why}")
    for f in d.get("fixes", []):
        out.append(f"  直し案 {f.get('line')}行目{'【足】' if f.get('ashi') else ''}: {f.get('text')}")
    nf = len(res["fail"]) + len(lint_fails)
    s = d.get("scores") or {}
    tsu = d.get("tsunagi") or []
    cancels = sum(1 for t in d.get("turns", []) if t.get("kind") == "取消")
    alone = [x for x in d.get("alone") or [] if x.get("line")]
    out.append(f"点: {' '.join(f'{k}{s.get(k)}' for k in 'abcdef')}  つなぎ: 跳 {tsu.count('跳')}/{len(tsu)}・取消 {cancels}"
               f"  その行だけで通らない: {sum(1 for x in alone if not x.get('ok'))}/{len(alone)}  当てた約束: {len(set(d.get('checked') or []))}"
               f"  批評役の一言: {d.get('verdict')}")
    hi = any(k.startswith(("(h)", "(i)", "(j)", "(k)")) for _, k, _ in res["fail"])
    if nf and hi:
        out.append(f"結果: 落ちる（✕ {nf}・△ {len(res['look'])}）。✕ を直して、2人目の批評役（往復を知らない別の担当）に1回だけ回す"
                   "（`script_writing.md` 7.3。2人目でも残ったら、まとめ役が裁く）")
    elif nf:
        out.append(f"結果: 落ちる（✕ {nf}・△ {len(res['look'])}）。✕ を直す。帳面・(h)・(i)・(j)・(k) の当たりではないので、2人目は呼ばずにまとめ役が読む")
    else:
        out.append(f"結果: 通る（✕ 0・△ {len(res['look'])}）"
                   + ("。△ は1回だけ直してよい（2人目の批評役は呼ばない）" if res["look"] else ""))
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description="批評役の JSON から、関所の合否を数える")
    ap.add_argument("critic", help="批評役が返した JSON")
    ap.add_argument("script", help="見た原稿（script.txt）")
    ap.add_argument("--spec", help="spec.json（既定は原稿の隣）")
    ap.add_argument("--json", action="store_true", help="1行の JSON で出す")
    ap.add_argument("--as-of", help="承認済みの原稿を読み直すとき: YYYY-MM-DD か YYYY-MM-DD:<あやとの返事のコメントID>。"
                                    "その時点より後にできた帳面の項目に当たった ✕ を △ にする")
    a = ap.parse_args()
    try:
        d = json.loads(Path(a.critic).read_text(encoding="utf-8"))
        c, rows = brief.rows_of(Path(a.script), Path(a.spec) if a.spec else None)
    except (OSError, ValueError) as e:
        print(f"読めない: {e}", file=sys.stderr)
        return 2
    errs = check_shape(d, json.loads(SCHEMA.read_text(encoding="utf-8")))
    if errs:
        print("✕ 批評役の JSON が決まりの形でない: " + " / ".join(errs[:8]), file=sys.stderr)
        return 2
    try:
        as_of = parse_as_of(a.as_of)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    res = judge(d, c, rows, as_of=as_of)
    if res["bad"]:
        print("✕ 批評役の JSON が原稿と合わない: " + " / ".join(res["bad"][:8]), file=sys.stderr)
        return 2
    lint_fails = lint_fails_of(c, as_of)
    nf = len(res["fail"]) + len(lint_fails)
    if a.json:
        print(json.dumps({"pass": nf == 0, "fail": len(res["fail"]) + len(lint_fails), "look": len(res["look"]),
                          "fail_lines": sorted({x[0] for x in res["fail"] if isinstance(x[0], int)}),
                          "critic_fail": len(res["fail"]), "lint_fail": len(lint_fails),
                          "scores": d.get("scores"), "jump": (d.get("tsunagi") or []).count("跳"),
                          "verdict": d.get("verdict")}, ensure_ascii=False))
    else:
        print(report(res, lint_fails, d))
    return 1 if nf else 0


if __name__ == "__main__":
    sys.exit(main())
