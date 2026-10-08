"""shotstable.mjs を「窓ぶんずつ撮って比べる」に直す（使い捨て）。"""
p = "tools/sprites/shotstable.mjs"
s = open(p, encoding="utf-8").read()

old_head = """/**
 * **同じ面を、何も変えずに2回撮って、2枚が同じかを見る。**
 *
 *   PORT=4150 PAGES=/design,/nordic/guide node tools/sprites/shotstable.mjs
 *   PORT=4150 DPR=3 PAGES=/nordic/guide node tools/sprites/shotstable.mjs
 *"""
new_head = """/**
 * **同じ面を、何も変えずに2回撮って、2枚が同じかを見る。**
 *
 *   PORT=4150 PAGES=/design,/nordic/guide node tools/sprites/shotstable.mjs
 *   PORT=4150 DPR=3 PAGES=/nordic/guide node tools/sprites/shotstable.mjs
 *
 * ## 撮りかたは、関門をかける相手と同じにする（2026-10-07）
 *
 * ここは長いこと `fullPage: true` で**面を丸ごと1枚**に撮っていた。
 * ところが関門をかける相手（`inkpx.mjs` / `inkband.mjs`）は、
 * **そんな撮りかたを一度もしない。** あちらは窓（既定 844px）を送りながら撮る。
 *
 * 丸ごと撮ると、背の高い面で2枚のあいだに絵が崩れる。
 * 実測（`/island/caucasus/streams`・780x73,202＝5,709万画素）:
 *
 *   丸ごと1枚   ちがう画素 47,552,590 / 57,097,560（**83%**）
 *   窓ぶんずつ  ちがう画素 0
 *
 * **面の側に直すものは無かった。** 測りかたが相手と違っていただけで、
 * この面は毎回「2枚が揃わない」で落ちて、**濃さの数字を1つも出さずに
 * 全体が 1 で落ちていた**（`docs/island-standards.md` §13。
 * 毎回出る嘘は本物の赤を埋める——`island-misses.md` #200）。
 *"""
assert old_head in s
s = s.replace(old_head, new_head)

old = """/**
 * 面を1枚開いて、何も変えずに2回撮る。`between` を渡すと、あいだでそれを走らせる。
 *
 * **面ごとに新しいタブで開いて、撮り終えたら閉じる。** 5万画素を超える絵を
 * 同じタブで何枚も撮ると、描画のプロセスが落ちて
 * `Target page, context or browser has been closed` で**道具ごと死ぬ**
 * （26面の回で実際に落ちた）。落ちたときに何も言わずに終わるのがいちばん悪いので、
 * ここで受けて「撮れなかった面」として数に残す。
 */
async function twice(base, path, miss, between = null) {
  const p = await ctx.newPage();
  try {
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) return null;
    await p.waitForTimeout(1200);
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    /* **1枚目は捨てる。** 背の高い面を `fullPage` で撮ると、1枚目と2枚目で
       字のにじみが数十画素ちがうことがある。2枚目と3枚目、3枚目と4枚目は
       **0画素**なので、面が動いているのではなく**最初の1枚が落ち着く前の絵**。
       実測（2026-10-07 / `/kitchen/karaage` 780x6764 / dpr2）:
         1-2: 73画素  2-3: 0  3-4: 0  （rAF を止めても、何度回しても 73）
       捨てずに測っていたあいだ、この面は「2枚が揃わない」で落ちていた。
       面の側には直すものが無いのに、**濃さの数字を1つも出さずに全体が
       落ちる**（`docs/island-standards.md` §13「まずその判定を疑う」）。
       捨てた1枚ぶんの差は下で印字する。**黙って飲み込まない。** */
    const warm = await p.screenshot({ fullPage: true });
    const a = await p.screenshot({ fullPage: true });
    const settle = diffPx(warm, a);
    if (between) { await p.evaluate(between); await p.waitForTimeout(200); }
    const c = await p.screenshot({ fullPage: true });
    return { ...diffPx(a, c), settle: settle.err ? -1 : settle.n };
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p.close().catch(() => {});
  }
}"""
new = """/**
 * 面を1枚開いて、**窓ぶんずつ**何も変えずに2回撮って比べる。
 * `between` を渡すと、2枚のあいだでそれを走らせる（対照用）。
 *
 * **面ごとに新しいタブで開いて、撮り終えたら閉じる。** 5万画素を超える絵を
 * 同じタブで何枚も撮ると、描画のプロセスが落ちて
 * `Target page, context or browser has been closed` で**道具ごと死ぬ**
 * （26面の回で実際に落ちた）。落ちたときに何も言わずに終わるのがいちばん悪いので、
 * ここで受けて「撮れなかった面」として数に残す。
 *
 * 送り先の限りは**毎回測り直す。** 送るうちに面は伸びる
 * （`content-visibility: auto` の段が見積りの高さから本当の高さに変わる）。
 * `inkband.mjs` が同じ穴で 158か所を見ていなかった。
 */
async function windowed(base, path, miss, between = null) {
  const p = await ctx.newPage();
  try {
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) return null;
    await p.waitForTimeout(1200);
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(1300);
    let n = 0, all = 0, settle = 0, wins = 0, tall = 0;
    for (let y = 0; ; y += H) {
      const docH = await p.evaluate(() => document.documentElement.scrollHeight);
      tall = Math.max(tall, docH);
      if (y > 0 && y >= docH) break;
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(350);
      /* **1枚目の落ち着きも数える。** 丸ごと1枚で撮っていたころ、
         `/kitchen/karaage` は1枚目と2枚目が 73画素ちがって、2枚目と3枚目は
         0画素だった（「最初の1枚が落ち着く前の絵」）。窓ぶんの撮りでは
         実測 0 だが、**0 であることを印字するために測る。** */
      const warm = await p.screenshot();
      const a = await p.screenshot();
      const sd = diffPx(warm, a);
      if (between) { await p.evaluate(between); await p.waitForTimeout(200); }
      const c = await p.screenshot();
      const d = diffPx(a, c);
      if (d.err) { miss.push(`${path} の窓${wins}（${d.err}）`); return null; }
      n += d.n; all += d.all; settle += sd.err ? 0 : sd.n; wins++;
      if (docH <= H) break;
    }
    return { n, all, w: W * DPR, h: tall * DPR, wins, settle };
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p.close().catch(() => {});
  }
}"""
assert old in s
s = s.replace(old, new)

s = s.replace("  const same = await twice(fx.base, \"/fix.html\", miss0);\n  const moved = await twice(fx.base, \"/fix.html\", miss0, () => {",
              "  const same = await windowed(fx.base, \"/fix.html\", miss0);\n  const moved = await windowed(fx.base, \"/fix.html\", miss0, () => {")
s = s.replace("  const r = await twice(`http://localhost:${PORT}`, path, miss);",
              "  const r = await windowed(`http://localhost:${PORT}`, path, miss);")

old2 = """  console.log(`${path}  ${r.w}x${r.h}  ちがう画素 ${r.n} / ${r.all}（捨てた1枚目との差 ${r.settle}）${bad ? "  ← 2枚が揃わない" : ""}`);"""
new2 = """  console.log(`${path}  ${r.w}x${r.h}  窓 ${r.wins}  ちがう画素 ${r.n} / ${r.all}（1枚目の落ち着き ${r.settle}）${bad ? "  ← 2枚が揃わない" : ""}`);"""
assert old2 in s
s = s.replace(old2, new2)

old3 = """console.log(`  いちばん高い絵    ${rows.length ? Math.max(...rows.map((r) => r.h)) : 0} 画素`);
console.log(`  捨てた1枚目との差  いちばん大きい面で ${rows.length ? Math.max(...rows.map((r) => r.settle)) : 0} 画素（0 でなければ、1枚目は落ち着いていない）`);"""
new3 = """console.log(`  いちばん背の高い面 ${rows.length ? Math.max(...rows.map((r) => r.h)) : 0} 画素（窓 ${H * DPR}px ずつ撮る）`);
console.log(`  撮った窓          ${rows.reduce((a, r) => a + r.wins, 0)} 枚`);
console.log(`  1枚目の落ち着き    いちばん大きい面で ${rows.length ? Math.max(...rows.map((r) => r.settle)) : 0} 画素（0 でなければ、1枚目は落ち着いていない）`);"""
assert old3 in s
s = s.replace(old3, new3)

s = s.replace("""if (shaky) {
  console.log(`\\nだめ: 2枚が揃わない面が ${shaky} 面。**この面で字の濃さを測っても当てにならない**（dpr を下げるか、面を短くする）。`);""",
"""if (shaky) {
  console.log(`\\nだめ: 2枚が揃わない面が ${shaky} 面。**この面で字の濃さを測っても当てにならない**（dpr を下げる）。`);""")
open(p, "w", encoding="utf-8").write(s)
print("patched")
