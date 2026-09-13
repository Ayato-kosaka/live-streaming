/**
 * 公開している全面を、**PC の幅で**撮って数える（1本目。横あふれ・伸びきり・絵の引き伸ばし）。
 *
 * これまで巡回の道具は 390px しか見ていなかった（`crawl.mjs` は viewport の宣言が
 * 1本きりで 390x844）。**公開109面は PC の幅で一度も見られていない。**
 *
 *   SPORT=5400 node pcsweep.mjs                        # PC の3幅ぜんぶ（撮る＋数える）
 *   SPORT=5400 WIDTHS=1440x900 node pcsweep.mjs        # 1幅だけ
 *   SPORT=5400 NOSHOT=1 WIDTHS=390x844 node pcsweep.mjs  # 撮らずに数だけ（390 は比べる相手）
 *   SPORT=5400 PROBE=1 LIST=… node pcsweep.mjs         # 仕込みが挙がるかの自己確認だけ
 *
 * **撮る前に必ず `python3 tools/sprites/pcchars.py` を通す。** 料理・伝説・国の面が
 * 使うキャラクターの絵は 256 で、`chars.py` は 128 と 640 しか落とさない。
 * 落ちていないと `route.mjs` が `ayato.webp` に落として、**8〜26人が全員そっくり同じ**に写る。
 *
 * 出るもの:
 *   /tmp/pcsweep/<幅>/<面>.png   全面の絵（fullPage）
 *   /tmp/pcsweep/<幅>.json       面ごとの数
 *   画面に要約
 *
 * 数えるもの:
 *  1. 横あふれ … `documentElement.scrollWidth > clientWidth`。
 *     **`getBoundingClientRect` では見ない。** SVG の中の `<path>` が外へ出ていても
 *     ページは横に動かない（`docs/island-misses.md` #72 の1件目がこれ）。
 *  2. 伸びきり … 本文1行の字数（ch）と、中身の幅が画面のどれだけか。
 *     スマホ前提の面を 1920px で開くと、**行が長くなりすぎて読めない**か、
 *     逆に**真ん中の細い帯だけになって左右が空っぽ**になる。どちらが起きているかを数で言う。
 *  3. 絵の引き伸ばし … `img` の `naturalWidth` と描かれている幅の比、
 *     SVG の `viewBox` と描かれている枠の縦横比のズレ。
 *
 * 「1行の字数」は `getClientRects()` の**行ごとの箱**から出す。外接矩形で割ると、
 * 2行に折り返した段落が「1行ぶんの倍の字数」と出る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "fs";

const SPORT = process.env.SPORT || "5400";
const OUT = process.env.OUT || "/tmp/pcsweep";
const WIDTHS = (process.env.WIDTHS || "1440x900,1920x1080,820x1180")
  .split(",")
  .map((s) => s.split("x").map(Number));
const PAGES = readFileSync(
  process.env.LIST || "/home/user/live-streaming/tools/sprites/pcpages.txt",
  "utf8",
)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/* 本文の「読む字」だけを行の長さの対象にする。見出し・札・ボタン・数字は
   長くならないのが当たり前なので、混ぜると平均が薄まって伸びきりが埋もれる。 */
const PROSE = "p,li,dd,blockquote,figcaption,.blurb,summary";

/** 仕込み。**数え方が届いているかを毎回出す**（`docs/island-misses.md` #19）。 */
const PROBE = `(() => {
  const d = document.createElement("div");
  d.id = "pcprobe";
  d.innerHTML =
    '<div id="pcprobe-wide" style="width:3000px;height:8px;background:#c00"></div>' +
    '<p id="pcprobe-long" style="width:2000px;font-size:16px;font-family:monospace">' + "x".repeat(400) + '</p>' +
    '<img id="pcprobe-img" src="/sprites/barrel.webp" style="width:2000px;height:200px">';
  document.body.appendChild(d);
})()`;
/** 仕込んだ絵は読み込みを待つ。`naturalWidth` が 0 のあいだは数に入らず、
    挙がらなかったのが「数え方が届いていない」なのか「まだ読めていない」なのか
    分からなくなる（`docs/island-misses.md` #72 の1つ目と同じ形） */
const PROBE_WAIT = `(async () => {
  const im = document.getElementById("pcprobe-img");
  if (im && !im.complete) await new Promise((r) => { im.onload = r; im.onerror = r; });
  return { nw: im ? im.naturalWidth : -1 };
})()`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const summary = [];
for (const [W, H] of WIDTHS) {
  const dir = `${OUT}/${W}`;
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    // 820 はタブレットの縦。指で触る幅なので、そちらに寄せる
    isMobile: W < 900,
    hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  /* 2回目以降に来た人の画面で測る。初回の案内（5.6秒で消える）が出ていると、
     その下の中身が動いて、幅の数が面ごとにばらつく */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  let p = await ctx.newPage();
  const rows = [];
  /* **1面ぶんに時計をかける。**
     327面を1つのブラウザで回すと、どこかで**中身の要らない止まり方**をする。
     `/map/georgia` を 820 で開いたところで、CPU が空いたまま（負荷 1.3）
     20分以上返らなくなった。同じ面を単独で開くと2秒で終わるので、
     面のせいではなく**その回のブラウザが詰まった**だけ。
     `page.evaluate` には時計が無いので、Playwright 側は永久に待つ。
     止まったまま待つと、**残りの面を1枚も撮らずに終わる**。
     時計を掛けて、詰まったら「撮れず」と記録して、ページを作り直して先へ進む。
     **「撮れなかった」を「見なくてよい」に混ぜない**（`docs/island-misses.md` #77）。 */
  const CAP = Number(process.env.CAP || 120000);
  const withCap = (work) =>
    Promise.race([work(), new Promise((_, rej) => setTimeout(() => rej(new Error("時間切れ")), CAP))]);
  for (const path of PAGES) {
    const errs = [];
    const onErr = (e) => errs.push("JS: " + String(e).slice(0, 160));
    p.on("pageerror", onErr);
    const url = `http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`;
    const run = async () => {
    let res = null;
    try {
      res = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      p.off("pageerror", onErr);
      console.log(`撮れず ${W} ${path}  ${String(e).slice(0, 80)}`);
      return { path, shot: false, why: String(e).slice(0, 120) };
    }
    await p.waitForTimeout(700);
    // 遅れて読むもの（写真・スプライト）を先に出してから測る。
    // 送らずに測ると、畳みが `content-visibility` の 68px のまま報告される
    /* 送る回数に蓋をする。`scrollHeight` を条件に置くと、送るほど中身が
       伸びる面では終わらない。**いまの面でそれが起きているわけではない**
       （`/map/georgia` を 820 で開いて数えたら6回で終わった）。保険。
       200回 = 120,000px で、いちばん長い面（9,334px）の13倍。 */
    await p.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let i = 0, y = 0; i < 200 && y < h; i++, y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(900);
    if (process.env.PROBE) {
      await p.evaluate(PROBE);
      const pw = await p.evaluate(PROBE_WAIT);
      if (pw.nw < 1) console.log(`  !! 仕込みの絵が読めていない（naturalWidth=${pw.nw}）。この面の絵の確認は当てにならない`);
    }

    const info = await p.evaluate((PROSE) => {
      const de = document.documentElement;
      // 1. 横あふれ
      const over = de.scrollWidth - de.clientWidth;
      // どこが外へ出ているかまで出す。出ないと直す側が探すところからやり直す
      const spill = [];
      if (over > 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.right <= de.clientWidth + 1) continue;
          // SVG の中は、外へ出ていてもページは動かない。親の <svg> で代表させる
          if (el.ownerSVGElement) continue;
          const cs = getComputedStyle(el);
          if (cs.position === "fixed") continue;
          spill.push({
            t: el.tagName + (typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/)[0] : ""),
            right: Math.round(r.right),
            w: Math.round(r.width),
          });
        }
      }

      // 2. 伸びきり — 本文の1行の字数と、中身の幅
      const lines = [];
      for (const el of document.querySelectorAll(PROSE)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const txt = (el.textContent || "").trim();
        if (txt.length < 12) continue;
        // 子に同じ種類のものが入っていたら、内側だけ数える（二重に数えない）
        if (el.querySelector(PROSE)) continue;
        /* **字の流れている箱だけを数える。** `display:flex` の行（左に日付・
           右に題）を混ぜると、Range の箱が**行ぜんぶの幅**になる。
           1行に流れている字ではないのに「83.6ch」と出て、
           直すところの無い面が37面挙がった。
           中の子が全部 inline のものだけが「字の流れている箱」。 */
        if (!/^(block|list-item|inline-block)$/.test(cs.display)) continue;
        let flow = true;
        for (const ch2 of el.children) {
          const d2 = getComputedStyle(ch2).display;
          if (!d2.startsWith("inline") && d2 !== "ruby" && d2 !== "contents") { flow = false; break; }
        }
        if (!flow) continue;
        /* **要素の箱で測らない。字そのものの箱で測る。**
           `<p>` の `getClientRects()` は**ブロックの箱**を返すので、字が
           40字しか無くても親の幅（1440 なら 1408px）がそのまま出る。
           それで数えたとき、109面が109面とも「123.4ch」と揃って出た。
           揃っている数字は、たいてい字ではなく**入れ物**を測っている
           （`docs/island-misses.md` #72「壊れていると読んだものが、
           3回とも測り方の間違いだった」）。
           Range の `getClientRects()` は**行ごとの箱**を返す。そちらを使う。 */
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rects = [...rg.getClientRects()].filter((q) => q.width > 4 && q.height > 4);
        rg.detach?.();
        if (!rects.length) continue;
        // 1行ぶんの幅 = いちばん広い行の箱
        const widest = rects.reduce((a, q) => (q.width > a.width ? q : a));
        const fs = parseFloat(cs.fontSize) || 16;
        // 日本語は全角なので 1文字 ≒ font-size。`ch` は "0" の幅（半角）なので、
        // 全角の割合から1文字の幅を出す。混ぜて数えると欧文の面だけ倍に出る
        const zen = (txt.match(/[^\x00-\xff]/g) || []).length / txt.length;
        const cw = fs * (zen * 1.0 + (1 - zen) * 0.5);
        lines.push({
          ch: +(widest.width / cw).toFixed(1),
          px: Math.round(widest.width),
          fs: +fs.toFixed(1),
          t: txt.slice(0, 20),
          c: typeof el.className === "string" ? el.className.split(/\s+/)[0] : "",
        });
      }
      /* 中身の幅。**塗ってある帯の幅で測らない。**
         帯（地色を敷いた section）はたいてい画面いっぱいに広がるので、
         そこを見ると**どの面も「中身100%」**と出て、
         「真ん中の細い帯だけになって左右が空っぽ」が一件も挙がらなくなる。
         見るのは**字の柱**。読む字がどこからどこまでに置かれているか。
         `docs/island-misses.md` #19「数え方が届いていない場所は0件に見える」。 */
      let tl = Infinity, tr = -Infinity;
      const walk2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n2 = walk2.nextNode(); n2; n2 = walk2.nextNode()) {
        if (!(n2.textContent || "").trim()) continue;
        const el = n2.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        // 画面に貼りついている帯（ヘッダ・下のバー）は、字の柱ではない
        let fixed = false;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const p2 = getComputedStyle(a).position;
          if (p2 === "fixed" || p2 === "sticky") { fixed = true; break; }
        }
        if (fixed) continue;
        // ここも要素の箱ではなく**字の箱**。ブロックの箱で取ると、
        // 字が真ん中に寄っていても「画面いっぱいに字がある」と出る
        const rg2 = document.createRange();
        rg2.selectNodeContents(n2);
        for (const q of rg2.getClientRects()) {
          if (q.width < 2 || q.height < 2) continue;
          if (q.right < 0 || q.left > de.clientWidth) continue;
          tl = Math.min(tl, q.left); tr = Math.max(tr, q.right);
        }
        rg2.detach?.();
      }
      const inner = tr > tl ? Math.round(Math.min(tr, de.clientWidth) - Math.max(tl, 0)) : 0;
      const gutters = tr > tl ? [Math.round(Math.max(tl, 0)), Math.round(de.clientWidth - Math.min(tr, de.clientWidth))] : [0, 0];

      // 3. 絵の引き伸ばし
      const imgs = [];
      for (const el of document.querySelectorAll("img")) {
        if (!el.naturalWidth) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        // 描かれている実寸。contain / cover は枠と別なので、比で戻す
        let dw = r.width, dh = r.height;
        const nr = el.naturalWidth / el.naturalHeight;
        if (cs.objectFit === "contain") {
          const k = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
          dw = el.naturalWidth * k; dh = el.naturalHeight * k;
        } else if (cs.objectFit === "cover") {
          const k = Math.max(r.width / el.naturalWidth, r.height / el.naturalHeight);
          dw = el.naturalWidth * k; dh = el.naturalHeight * k;
        }
        // 縦横比が崩れているか（fill / 明示の width+height）
        const ar = (r.width / r.height) / nr;
        /* **この箱から出られない先は `route.mjs` が差し替えている。**
           差し替えた絵は焼いてある画素が本番と違うので、**伸びを測れない。**
           測れないものを「伸びていない」に混ぜると、本番で伸びていても 0件 に見える
           （`docs/island-misses.md` #77「開けないから見ていない」を「見た」に混ぜない）。 */
        const u = el.currentSrc || el.src;
        const sub = /wikimedia|ggpht|googleusercontent|ytimg|firebasestorage|island-api\/characters/.test(u);
        imgs.push({
          sub,
          // 焼いてある画素。差し替えが当たったかは**ここで見分ける**
          // （`ayato.webp` に落ちていれば、頼んだ大きさと違う数が出る）
          nw: el.naturalWidth,
          src: u.split("/").slice(-2).join("/").slice(0, 48),
          k: +(dw / el.naturalWidth).toFixed(2),           // 何倍に引き伸ばしているか
          ar: +ar.toFixed(2),                                // 1.00 なら比を保っている
          box: [Math.round(r.width), Math.round(r.height)],
          fit: cs.objectFit,
        });
      }
      // SVG は viewBox と枠の比を見る（preserveAspectRatio=none だと潰れる）
      const svgs = [];
      for (const el of document.querySelectorAll("svg[viewBox]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const vb = el.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
        if (vb.length !== 4 || !vb[2] || !vb[3]) continue;
        const ar = (r.width / r.height) / (vb[2] / vb[3]);
        const par = el.getAttribute("preserveAspectRatio") || "";
        if (/none/.test(par) && Math.abs(ar - 1) > 0.05)
          svgs.push({ ar: +ar.toFixed(2), box: [Math.round(r.width), Math.round(r.height)], c: el.getAttribute("class") || "" });
      }

      return {
        h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
        over, spill: spill.slice(0, 8),
        lines, inner, gutters, vw: de.clientWidth,
        height: Math.round(de.scrollHeight),
        imgs, svgs,
      };
    }, PROSE);
    p.off("pageerror", onErr);

    const name = (path === "/" ? "_index" : path.replace(/\//g, "_"));
    let shot = true;
    if (process.env.NOSHOT) {
      // 絵は撮らない。**「撮った」とは言わない**ので、前の回のぶんを数に使うときは
      // そちらの json を見ること
      shot = "前の回のぶん";
    } else try {
      await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    } catch (e) {
      shot = false;
      info.shotWhy = String(e).slice(0, 120);
    }
    const row = { path, shot, status: res.status(), errs, ...info };
    const chs = info.lines.map((l) => l.ch).sort((a, c) => a - c);
    const p90 = chs.length ? chs[Math.floor(chs.length * 0.9)] : 0;
    const ratio = info.vw ? (info.inner / info.vw) : 0;
    console.log(
      `${W} ${path}  横${info.over > 1 ? "あふれ+" + info.over : "ok"}  行${p90}ch(上位1割)  字の柱${info.inner}px(${(ratio * 100).toFixed(0)}%) 左右${info.gutters.join("/")}  絵${info.imgs.length}  高${info.height}${errs.length ? "  " + errs[0] : ""}`,
    );
    return row;
    };
    /* **時間切れにしたあと、放っておいた `run()` が自分でも1行足さないようにする。**
       `rows.push` を `run()` の中に置いていたとき、2面の一覧で4行出た
       （時間切れで1行、あとから本人が1行）。**数が合わないと、
       撮れた枚数の報告がそのまま嘘になる。** 行は呼ぶ側だけが足す。 */
    try {
      const row = await withCap(run);
      if (row) rows.push(row);
    } catch (e) {
      p.off("pageerror", onErr);
      rows.push({ path, shot: false, why: String(e.message || e).slice(0, 60) });
      console.log(`撮れず ${W} ${path}  ${String(e.message || e).slice(0, 40)}`);
      // 詰まったページは戻ってこない。作り直さないと、以降ぜんぶ詰まる
      try { await p.close(); } catch {}
      p = await ctx.newPage();
    }
  }
  writeFileSync(`${OUT}/${W}.json`, JSON.stringify(rows, null, 1));
  summary.push([W, rows]);
  await ctx.close();
}
await b.close();

console.log("\n===== まとめ =====");
for (const [W, rows] of summary) {
  const shot = rows.filter((r) => r.shot);
  const over = rows.filter((r) => r.over > 1);
  console.log(`幅 ${W}: 撮れた ${shot.length}/${rows.length}  横あふれ ${over.length}面`);
  for (const r of over) console.log(`   横あふれ ${r.path} +${r.over}px  ${r.spill.map((s) => `${s.t}(右${s.right})`).join(" ")}`);
}
if (process.env.PROBE) {
  const [, rows] = summary[0];
  const hitOver = rows.filter((r) => r.over > 1).length;
  const hitLong = rows.filter((r) => (r.lines || []).some((l) => l.ch > 200)).length;
  const hitImg = rows.filter((r) => (r.imgs || []).some((i) => i.k > 3)).length;
  const hitAr = rows.filter((r) => (r.imgs || []).some((i) => Math.abs(i.ar - 1) > 0.3)).length;
  console.log(`\n仕込みの確認（${rows.length}面に3つずつ仕込んだ）:`);
  console.log(`  幅3000pxの帯 → 横あふれとして挙がった面 ${hitOver}`);
  console.log(`  400字1行の段落 → 200ch 超として挙がった面 ${hitLong}`);
  console.log(`  320pxの絵を2000pxで置いた → 3倍超として挙がった面 ${hitImg}`);
  console.log(`  同じ絵を 10:1 に潰した → 縦横比の崩れとして挙がった面 ${hitAr}`);
  const all4 = [hitOver, hitLong, hitImg, hitAr].every((n) => n === rows.length);
  console.log(`  ${all4 ? "4つとも全面で挙がった。数え方は届いている" : "!! 挙がらない面がある。数え方が届いていない"}`);
}
