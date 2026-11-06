"""`res/*.json`（shard ごとの結果）から、PR に貼る表1枚（digest.md・30行以内）を組む。

1検査1行: 名前・✅/❌・要の数字と閾値・**見た数**。見た数が 0 なら ❌（「0件見た」で緑にしない）。
❌ の検査だけ、落ちた組（段・大きさ・キャラ・文）を出す。最後に録画の枝とファイルの一覧を1行。

読むのはこの表だけ。ログは artifact（`alert-res-<shard>` の `<shard>.log`）にあるが、
❌ の行の組から先に直す。ログを開くのは「測れなかった（終了コード 2）」のときだけでよい。
"""

import json
import os
import time
from pathlib import Path

MARK = "<!-- alert-check -->"
LIMIT = 30


def _load(res, name):
    try:
        return json.loads((Path(res) / f"{name}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _why(r, name):
    """結果の無い・測れなかった shard の1行"""
    if r is None:
        return f"{name}: 結果が無い（job が落ちた）"
    t = (r.get("tail") or [""])[-1]
    return f"{name}: 測れなかった（終了コード {r.get('exit')}{'・' + r['error'][:80] if r.get('error') else ''}）{t[:90]}"


def build(res):
    rows, fails = [], []

    def row(label, ok, text, bad=()):
        mark = "➖" if ok is None else "✅" if ok else "❌"
        rows.append(f"| {label} | {mark} | {text} |")
        if ok is False:
            fails.append((label, list(bad)))

    prep = _load(res, "prep") or {}
    import run  # noqa: PLC0415 shard の並びは run.py の1か所で決める

    def what(tool):
        """道具の --json の byTheme・tiers から「castle 7段 28・豚 4」。数が 0 のテーマが1つでもあれば ok=False"""
        by, tiers = tool.get("byTheme") or {}, tool.get("tiers") or {}
        parts = [f"{'豚' if k == 'none' else k}{'' if k == 'none' else f' {tiers.get(k, 0)}段'} {v:,}" for k, v in by.items()]
        return "・".join(parts), bool(by) and all(v > 0 for v in by.values())

    # 重なり（shard の並びは prep が決めたもの。日付をまたいでも同じ並びで読む）
    names = [n for n in (prep.get("shards") or run.plan()) if n.startswith("overlap-")]
    olabel = "・".join(dict.fromkeys(n.split("-")[1] for n in names)) + f"・{len({n.split('-')[2] for n in names})}段"
    got = {n: _load(res, n) for n in names}
    tools = [r["tool"] for r in got.values() if r and r.get("tool")]
    sm = lambda k: sum(t.get(k) or 0 for t in tools)  # noqa: E731
    bad = []
    for n, r in got.items():
        if r is None or r.get("tool") is None or r.get("exit") == 2:
            bad.append(_why(r, n))
            for v in ((r or {}).get("tool") or {}).get("invalid", [])[:2]:
                bad.append(f"{v['amount']}円 {v['size']} {v['char']} {v['text']}: 測れない {v['why'][:60]}")
        for h in ((r or {}).get("tool") or {}).get("hits") or []:
            bad.append(f"{h['amount']}円 {h['size']} {h['char']} {h['text']} {h['t']}s: front {h['front']} / cover {h['cover']} / 字 {h['heroText']}" + (f"（{h['png']}）" if h.get("png") else ""))
    ok = len(tools) == len(names) and all(r["exit"] == 0 for r in got.values() if r) and sm("stay") > 0
    # `<video>` の守り（#1133）。poster の無い・コマを持つ前に見えていた `<video>`。動画の段のあるテーマで1本も見ていなければ落とす
    for t in tools:
        for v in t.get("vbad") or []:
            bad.append(f"{v['amount']}円 {v['size']} {v['char']} {v['text']}: `<video>` poster 無し {v['noPoster']} {json.dumps(v.get('bad', [])[:1], ensure_ascii=False)[:90]}")
    # コマより先に見せた（early）は数えるだけ（#1137。poster が透明なので出るのは透明。コマの合図だけに頼ると Android で出ない）
    if sm("noPoster"):
        ok = False
    if any(t.get("fx") for t in prep.get("themes") or []) and not sm("videos"):
        ok = False
        bad.insert(0, "動画の段のあるテーマなのに `<video>` を1本も見ていない（守りを数えていない）")
    vid = f"。`<video>` {sm('videos'):,}本: poster 無し {sm('noPoster')}（0。コマより先に見せた {sm('early'):,}・継ぎ目 {sm('seam'):,} は poster が透明なので数えない）"
    band = any(t.get("heroBands") for t in tools)
    hero = f"主役の{'帯（動画の段）' if band else '顔'}が見えたコマ {sm('heroSeen'):,}"
    if not sm("heroSeen"):
        ok = False
        bad.insert(0, "主役の顔の枠も帯も1コマも置けなかった（字×主役を見ていない）")
    # 札が revealAt より前に見えたコマ・額が 0 のまま見えたコマ（alert-reveal.mjs。止めずに毎コマ）
    rv = _load(res, "reveal")
    rt = (rv or {}).get("tool")
    early = ""
    if rv and rv.get("na"):
        early = "。札の出る順は動画の段が無いので見ない"
    elif rt and rt.get("video"):
        early = f"。札が revealAt より前 {rt['early']}コマ・0円 {rt['zero']}コマ（{rt['runs']}回 × CPU・回線、動画の出た回 {rt['video']}）"
        if rv["exit"] != 0:
            ok = False
            for k, b in (rt.get("by") or {}).items():
                if b["earlyRuns"] or b["zeroRuns"]:
                    bad.append(f"{k}: 札が先 {b['earlyRuns']}/{b['runs']}回（最大 {b['worst']}秒早い）・0円 {b['zeroRuns']}/{b['runs']}回")
    else:
        ok = False
        early = "。札の出る順: 測れなかった"
        bad.append(_why(rv, "reveal"))
    row(
        "重なり（顔×演出・主役の顔×字・`<video>` の守り）",
        ok,
        f"{olabel}・{sm('runs')}本・滞在 {sm('stay'):,}コマ: front {sm('front')} / cover {sm('cover')} / 字 {sm('heroText')}（全部 0）。{hero}{vid}{early}",
        bad,
    )

    # 合図の来ない偽の端末（#1137）。4通り × 7段で、動画が出て（段が落ちない）札が revealAt のあと
    r = _load(res, "devices")
    if r and r.get("na"):
        row("合図の来ない端末（偽の4通り × 7段）", None, r["na"])
    elif r and r.get("rows"):
        rs = r["rows"]
        by = {}
        for x in rs:
            b = by.setdefault(x["device"], [0, 0, 0, 0])
            b[0] += 1
            b[1] += 1 if x["video"] else 0
            b[2] += x["early"] or 0
            b[3] += x.get("zero") or 0

        def why(x):
            """落ちた理由。道具の終了コードだけで落ちた組も、何で落ちたかを出す（「終了 1」だけで理由の無い行を出さない）"""
            w = [f"終了 {x['exit']}"]
            if not x["video"]:
                w.append(f"動画 {x['video']}/{x['runs']}（段が落ちた）")
            if x["early"]:
                w.append(f"札が先 {x['early']}コマ")
            if x.get("zero"):
                w.append(f"0円 {x['zero']}コマ")
            if len(w) == 1:
                w.append("数は全部 0（道具のログ devices.log を見る）")
            return f"{x['device']} {x['amount']}円: " + "・".join(w)

        bad = [why(x) for x in rs if x["exit"] != 0 or not x["video"] or x["early"] or x.get("zero")]
        ok = bool(rs) and not bad and all(b[1] == b[0] for b in by.values())
        row(
            "合図の来ない端末（偽の4通り × 7段）",
            ok,
            "・".join(f"{k} 動画 {b[1]}/{b[0]}段・札が先 {b[2]}・0円 {b[3]}" for k, b in by.items()) + "（7段とも動画が出て、札が先 0・0円 0）",
            bad,
        )
    else:
        row("合図の来ない端末（偽の4通り × 7段）", False, "回っていない", [_why(r, "devices")])

    # 対照
    c = _load(res, "controls")
    if c and c.get("controls"):
        cc = c["controls"]
        tl = lambda k: cc.get(k, {}).get("tool") or {}  # noqa: E731
        # 落ちたうえで、落ちた数が 0 でないこと（「測れずに 1」を通さない）
        keys = {"顔": "face", "主役": "hero", "帯": "band", "字の切れ": "textfit", "濃さ": "ink", "展開": "decode"}
        hit = {
            "顔": tl("face").get("front", 0) + tl("face").get("cover", 0),
            "主役": tl("hero").get("heroText", 0),
            "帯": tl("band").get("heroText", 0),
            "字の切れ": len(tl("textfit").get("bad") or []),
            "濃さ": len(tl("ink").get("fails") or []),
            "展開": len(tl("decode").get("bad") or []),
        }
        if "reveal" in cc:
            keys["札が先"] = "reveal"
            hit["札が先"] = tl("reveal").get("early", 0)
        if "poster" in cc:
            keys["poster"] = "poster"
            hit["poster"] = tl("poster").get("noPoster", 0)
        nok = [k for k, v in hit.items() if cc.get(keys[k], {}).get("exit") != 1 or not v]
        row(
            "対照（壊すと落ちる）",
            not nok,
            "・".join(f"{k} 終了{cc.get(keys[k], {}).get('exit')}（{v:,}）" for k, v in hit.items()) + "（どれも 1 で落ちること）",
            [f"{k}: 落ちなかった・数が 0" for k in nok] or [_why(c, "controls")],
        )
    else:
        row("対照（壊すと落ちる）", False, "回っていない", [_why(c, "controls")])

    # 字の切れ
    r = _load(res, "textfit")
    t = (r or {}).get("tool")
    if t:
        b = [f"{x['theme']} {x['a']}円 {x['size']} {x['text']}: 縁 {x['edge']} / 外 {x['outside']} / 全文 {'○' if x['full'] else '×'}" for x in t["bad"]] + t.get("errs", [])[:3]
        lab, every = what(t)
        if not every:
            b.insert(0, "数が 0 のテーマがある")
        row("字の切れ", r["exit"] == 0 and t["rows"] > 0 and every, f"{t['rows']}組（{lab}）: 縁の字 {t['edge']}px / 箱の外の行 {t['outside']} / 欠け {len(t['bad'])}（全部 0）", b)
    else:
        row("字の切れ", False, "回っていない", [_why(r, "textfit")])

    # 字の濃さ
    rs = {n: _load(res, n) for n in ("ink",)}
    ts = [x["tool"] for x in rs.values() if x and x.get("tool")]
    bgn = prep_bg_names(res)
    if len(ts) == len(rs):
        n = sum(x["rows"] for x in ts)
        mids = [x["minMid"] for x in ts if x["minMid"] is not None]
        rhis = [x["minRhi"] for x in ts if x["minRhi"] is not None]
        b = []
        for x in ts:
            for f in sorted(x["fails"], key=lambda f: min(f["mid"], f["rhi"])):
                glyph = f"「{f['t']}」" if f["t"] else f"（字の無い {f.get('tag', '?')} {f.get('size', '')}）"
                b.append(f"{f.get('theme', '')} {f['tier']} 地:{bgn.get(f['bg'], f['bg'])} {f['char']} {glyph} 中央値 {f['mid']:.2f} 明るい地 {f['rhi']:.2f}")
            b += x.get("errs", [])[:2]
        lab, every = what(ts[0])
        if not every:
            b.insert(0, "数が 0 のテーマがある")
        ok = all(x["exit"] == 0 for x in rs.values()) and n > 0 and every
        row(
            "字の濃さ",
            ok,
            f"{n:,}字（{lab}・地 {len(bgn) or 4}種 × キャラ {ts[0]['chars']}人）: 中央値の最小 {min(mids):.2f} / 明るい地に対して {min(rhis):.2f}（4.5 以上）" if mids else f"{n}字: 測れた字が無い",
            b,
        )
    else:
        row("字の濃さ", False, "回っていない", [_why(x, n) for n, x in rs.items() if not (x and x.get("tool"))])

    # 貯金箱
    r = _load(res, "banksize")
    t = (r or {}).get("tool")
    if r and r.get("na"):
        row("貯金箱の大きさ（PRISM の scale 込み）", None, r["na"])
    elif t and t["rows"]:
        kw = [x["kw"] for x in t["rows"]]
        kh = [x["kh"] for x in t["rows"]]
        dr = max([max(x["dw"], x["dh"]) for x in t["drifts"]] or [0])
        row(
            "貯金箱の大きさ（PRISM の scale 込み）",
            r["exit"] == 0,
            f"{len(t['rows'])}組（scale {'・'.join(map(str, t['scales']))}）: 豚の 幅 {min(kw):.2f}〜{max(kw):.2f}倍・高さ {min(kh):.2f}〜{max(kh):.2f}倍（{t['min']}〜{t['max']}倍）・scale の食い違い {dr * 100:.1f}%（{t['drift'] * 100:.0f}% まで）",
            t["bad"] + t["broken"],
        )
    else:
        row("貯金箱の大きさ（PRISM の scale 込み）", False, "回っていない", [_why(r, "banksize")] + ((t or {}).get("broken") or [])[:3])

    # 展開
    r = _load(res, "decode")
    t = (r or {}).get("tool")
    if t and t["runs"]:
        b = [f"{x['a']}円 CPU{x['rate']}倍 #{x['i']}: {x['ms']:.0f}ms・そろった {x['ok']}・動画 {x.get('video')}・台本の層 {x['show']}" for x in t["bad"]] + [f"{x['a']}円 CPU{x['rate']}倍 #{x['i']}: {x['err']}" for x in t["errs"]]
        by = t.get("byTheme") or {}
        lab = "・".join(f"{'豚' if k == 'none' else k} {v}回" for k, v in by.items())
        every = bool(by) and all(v > 0 for v in by.values())
        row("展開の上限", r["exit"] == 0 and every, f"{t['runs']}回（{lab}。7段 × CPU 1・4・6倍 × 3）: いちばん遅い {t['max']:.0f}ms（{t['limit']:.0f}ms 以内・台本か動画の層が出る）", b)
    else:
        row("展開の上限", False, "回っていない", [_why(r, "decode")])

    # fx
    r = _load(res, "fx")
    if r and r.get("na"):
        row("fx の manifest と動画", None, r["na"])
    elif r and r.get("tiers"):
        row("fx の manifest と動画", r["exit"] == 0, f"{r['tiers']}段・動画 {r['videos']}本: 外れ {r['nbad']}（0）", r["bad"])
    else:
        row("fx の manifest と動画", False, "回っていない", [_why(r, "fx")])

    # jest・型
    u = _load(res, "unit")
    if u and u.get("jest"):
        j, ty = u["jest"], u["types"]
        again = f"→ roster を単独で回し直して {j['again']}" if j.get("again") is not None else ""
        row("jest app/alertbox", j["total"] > 0 and not j["nother"], f"{j['total']}件: 1回目の失敗 {j['failed']}{again}（roster の時間切れ {len(j['known'])} は前から）", j["other"])
        row("型（tsc。app/alertbox）", not ty["nrest"], f"誤り {ty['errors']}（.svg の {ty['svg']} 件は前から・ほか {ty['nrest']}。根から見た全体 {ty.get('all', '?')} は数えない）", ty["rest"])
    else:
        row("jest app/alertbox", False, "回っていない", [_why(u, "unit")])
        row("型（tsc。app/alertbox）", False, "回っていない", [])

    # 録画
    r = _load(res, "media")
    if r and r.get("records"):
        okr = [x for x in r["records"] if x["exit"] == 0 and x["probe"]]
        p = okr[0]["probe"] if okr else None
        b = [f"{x['amount']}円: 終了 {x['exit']}" + ("" if x["probe"] else "・mp4 が読めない") for x in r["records"] if x not in okr]
        if r["compare"]["exit"] != 0:
            b.append(f"同じ秒の一覧: 終了 {r['compare']['exit']}")
        row("縦の録画・同じ秒の一覧", r["exit"] == 0, f"7段のうち {len(okr)}本" + (f"（{p['w']}×{p['h']}・{p['codec']}）" if p else "") + f"・一覧 {'あり' if r['compare']['file'] else '無し'}（キャラ {r['char']}）", b)
    else:
        row("縦の録画・同じ秒の一覧", False, "回っていない", [_why(r, "media")])

    # キャラ絵
    ch = prep.get("chars")
    if ch:
        sh = ch.get("shapes") or []
        asp = [x["aspect"] for x in sh] or [0]
        fil = [x["fill"] for x in sh] or [0]
        row(
            "キャラ絵（名簿の本物）",
            bool(ch["ok"]),
            f"名簿 {ch.get('roster') or '?'}人のうち取れた {ch['got']}枚から {ch['used']}人: 縦横比 {min(asp):.2f}〜{max(asp):.2f}・余白 {(1 - max(fil)) * 100:.0f}〜{(1 - min(fil)) * 100:.0f}%・不透明 {sum(1 for x in sh if not x['alpha'])}人（10人以上）",
            [] if ch["ok"] else [f"名簿の絵が {ch['got']}枚しか取れない（lh3 に届かない？）。リポジトリの絵で足した"],
        )
    else:
        row("キャラ絵（名簿の本物）", False, "支度（prep）が落ちた", [_why(_load(res, "prep"), "prep")])
    return prep, rows, fails


def prep_bg_names(res):
    try:
        return json.loads((Path(res).parent / "in" / "bg" / "bg.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"street": "白", "face": "黒", "alert-now": "明暗の縞", "alert-fish": "灰の雑音"}


def main(res, out):
    res = Path(res)
    try:
        prep, rows, fails = build(res)
    except Exception as e:  # noqa: BLE001 表を組めないことも表に出す（コメントが黙って無くなるのがいちばん悪い）
        prep, rows, fails = _load(res, "prep") or {}, [f"| 表を組む | ❌ | digest.py が落ちた: {type(e).__name__}: {str(e)[:150]} |"], [("表を組む", [])]
    nfail = len(fails)
    head = "✅ 全部通った" if not nfail else f"❌ {nfail}件落ちた"
    env = os.environ
    took = ""
    if env.get("ALERT_START", "").isdigit():
        took = f"・所要 {(time.time() - int(env['ALERT_START'])) / 60:.0f}分"
    run = f"・[run]({env['ALERT_RUN_URL']})" if env.get("ALERT_RUN_URL") else ""
    sha = f"・{env['ALERT_SHA'][:7]}" if env.get("ALERT_SHA") else ""
    lines = [
        MARK,
        f"### 投げ銭アラートの確かめ — {head}",
        f"測ったもの `{prep.get('label', '?')}`（期間が効いている・60日以内に始まるテーマ＋豚）・PRISM の縮み方は道具の既定（scale 0.5）{sha}{took}{run}",
        "",
        "| 検査 | | 数字（閾値） |",
        "| --- | --- | --- |",
        *rows,
    ]
    tailer = []
    push = _load(res, "push")
    if push and push.get("branch"):
        files = push.get("files") or []
        mp4 = [f for f in files if f.endswith(".mp4")]
        rest = [f for f in files if not f.endswith(".mp4")]
        tailer.append(
            f"録画と絵: `git fetch origin {push['branch']}` → {' '.join(mp4[:7])}{' ほか' if len(mp4) > 7 else ''}・絵 {len(rest)}枚（{', '.join(rest[:4])}{' …' if len(rest) > 4 else ''}）計 {push.get('mb', 0):.0f}MB"
        )
    elif push and push.get("error"):
        tailer.append(f"録画と絵: 枝に置けなかった（{push['error'][:80]}）")
    room = LIMIT - len(lines) - len(tailer) - (1 if fails else 0)
    body = []
    if fails:
        per = max(1, min(5, room // max(1, nfail) - 1))
        for label, bad in fails:
            if len(body) + 2 > room:
                break
            body.append(f"**{label}**")
            for b in bad[:per]:
                if len(body) >= room:
                    break
                body.append(f"- {b}")
            if len(bad) > per and len(body) < room:
                body.append(f"- ほか {len(bad) - per}組")
    out_lines = lines + ([""] + body if body else []) + tailer
    text = "\n".join(out_lines[:LIMIT]) + "\n"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(text, encoding="utf-8")
    print(text)
    return 1 if nfail else 0
