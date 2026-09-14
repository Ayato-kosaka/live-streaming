/**
 * 押しどころの実寸を測る。
 *
 *   PORT=3130 SEL=".crumbs a" PAGES=/nordic/finland,/map/france node tools/sprites/hitbox.mjs
 *   PORT=3130 W=1000 SEL=".ih-link" PAGES=/about node tools/sprites/hitbox.mjs
 *   PORT=3130 FOLD=skip PAGES=/nordic/day/3 node tools/sprites/hitbox.mjs   # 前の数え方
 *
 * **見た目の箱（getBoundingClientRect）では測らない。**
 * `::after` で広げてある当たり判定はそこに出ないし、
 * 隣の要素に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして、`elementFromPoint` がまだ自分を返すかで測る。
 *
 * `docs/island-design.md` 3-2 は「指で押せる最小 48px」。
 * パンくずの「島」は見た目 13x21px で、当たり 22x46px だった
 * （`docs/island-world.md` 7.10）。
 *
 * ## 畳みの中は、飛ばすのではなく**先に開いて**測る（2026-09-14）
 *
 * ここは長いこと「閉じた `<details>`（`Fold`）の中身は押せなくて当たり前だから
 * 数えない」で飛ばしていた。閉じたまま突くと畳みの外の何かが返る、という
 * 理由そのものは正しい。**結論が違っていた。**
 * 視聴者さんは**開いてから押す**ので、開いたあとが小さければ押せない。
 * 飛ばしていたぶんは「測って 0 だった」のではなく、**数えていなかった**
 * （`docs/island-misses.md` #79 と同じ形）。
 *
 * なので既定は「**測る前に全部の畳みを開く**」。開いたことは結果に印を残す
 * （`fold: true` ＝ もともと閉じていた畳みの中にあった）。
 * **開くのは測るためだけ**で、撮る道具ではない。
 * `FOLD=skip` で前の数え方に戻せる。**前後で数が違うことが、直った証拠。**
 *
 * ## 測れなかったものを、小さいものと混ぜない
 *
 * 伸ばすのには上限（`MAXGROW`、既定 80）があり、画面の端も越えられない。
 * どちらも**そこで止まっただけ**で、実寸ではない。止まった理由を
 * 方向ごとに持たせて（`飽和` / `端` / どの要素か）、実寸として読ませない。
 * 上限 601px を実寸として読んで「合格」と誤判定した例がある。
 *
 * ## かぶり（となり合う当たりの食い合い）
 *
 * 止めた相手が**別の押しどころ**なら、そこは隣に取られている。
 * `::after` で当たりを広げてある面は、広げたぶんが隣とぶつかる。
 * パンくずの「島」が隣に食われて 40px しか取れていなかったのがこれ。
 * 止めた相手が押しどころでなければ（`div` や地の紙）、
 * それは自分の当たりが自然に終わっただけで、かぶりではない。
 *
 * 他の道具から使うときは測る所だけ借りる:
 *   import { openFolds, measure, SEL_ALL } from "./hitbox.mjs";
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

/** 全面を回るとき用の「押しどころ」の集め方（`pchit.mjs` と同じ） */
export const SEL_ALL =
  'a[href],button,[role="button"],input,select,textarea,summary,label,[tabindex]:not([tabindex="-1"])';

/**
 * **測る前に、畳みを全部開く。**
 *
 * 入れ子があるので、開いた中から新しく出てきた畳みが無くなるまで繰り返す。
 * 開くたびに間を置くのは、`content-visibility: auto` の段が画面の外にいる
 * あいだ中身を組まないため（`docs/island-standards.md`「面の高さを、
 * 畳んだまま測らない」と同じ理由）。
 *
 * もともと閉じていた畳みには `data-fold-was-closed` を残す。
 * 測る側はこれで「畳みの中か外か」を分ける。
 *
 * 戻り: { opened 開いた数, rounds 回った数, stillClosed 開かなかった数 }
 * **`stillClosed` は必ず見る。** JS が閉じ直す畳みがあると、開いたつもりで
 * 測っていないものが出る（それは 0 件ではなく、見ていない件）。
 */
export async function openFolds(p, { waitMs = 250, rounds = 8 } = {}) {
  let opened = 0, used = 0;
  for (let i = 0; i < rounds; i++) {
    const n = await p.evaluate(() => {
      let k = 0;
      for (const d of document.querySelectorAll("details")) {
        if (!d.open) {
          d.dataset.foldWasClosed = "1";
          d.open = true;
          k++;
        }
      }
      return k;
    });
    used = i + 1;
    opened += n;
    if (!n) break;
    await p.waitForTimeout(waitMs);
  }
  // 開いたあと、いちばん下まで送る。畳みの中は `content-visibility: auto` で
  // 画面の外にいるあいだ組まれない。送らずに測ると高さが 68px のまま出る
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(waitMs);
  const stillClosed = await p.evaluate(() => document.querySelectorAll("details:not([open])").length);
  return { opened, rounds: used, stillClosed };
}

/**
 * 面ひとつぶんの押しどころを測る。
 *
 *   sel      … 何を押しどころとみなすか
 *   min      … 合格の下限（既定 48）
 *   maxGrow  … 1方向に伸ばす上限。ここに当たった値は**実寸ではない**
 *   fold     … "open"（既定・畳みの中も数える）/ "skip"（前の数え方）
 *
 * 戻り: { rows 測れたもの, skipped 測れなかったもの, excluded 数えなかった内訳 }
 */
export async function measure(p, { sel = SEL_ALL, min = 48, maxGrow = 80, fold = "open" } = {}) {
  return p.evaluate(
    ({ sel, min, maxGrow, fold }) => {
      const nm = (e) =>
        e
          ? e.tagName +
            (e.className && typeof e.className === "string" && e.className.trim()
              ? "." + e.className.trim().split(/\s+/)[0]
              : "")
          : "なし";
      const txt = (e) => ((e?.textContent || e?.getAttribute?.("aria-label") || "").trim().slice(0, 14));
      const TAP = 'a[href],button,summary,label,[role="button"],input,select,textarea';

      const rows = [], skipped = [];
      /* **数えなかったものは、理由ごとに数える。** 内訳の出ない除外は、
         あとから「0件」を読むときに「測って 0」と見分けがつかない（#79）。 */
      const excluded = {};
      const drop = (why) => { excluded[why] = (excluded[why] || 0) + 1; };

      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none") { drop("display:none"); continue; }
        if (cs.visibility === "hidden") { drop("visibility:hidden"); continue; }
        if (el.disabled) { drop("無効(disabled)"); continue; }
        /* **開いても押せないものは、畳みとは別の話。** ここは前と同じで数えない */
        if (cs.pointerEvents === "none") { drop("pointer-events:none"); continue; }
        if (el.closest("[inert]")) { drop("inert"); continue; }
        if (el.closest('[aria-hidden="true"]')) { drop("aria-hidden"); continue; }

        /* `<label>` は「その入力の押しどころ」なので、入力側と二重に数えない。
           ただし**入力を持たない label** は、それ自体が押しどころなので測る */
        if (el.tagName === "LABEL") {
          const forId = el.getAttribute("for");
          const pair = forId ? document.getElementById(forId) : el.querySelector("input,select,textarea");
          if (pair) { drop("label（入力側で数える）"); continue; }
        }

        // 押す先を先に決める。見た目を作り直したチェックボックスは <input> を
        // 脇へどけて <label> に絵を描く。入力の真ん中は当たらないが、指は label を押す
        let target = el;
        if (el.tagName === "INPUT" || el.tagName === "SELECT") {
          const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          const lb = byFor || el.closest("label");
          if (lb && (cs.opacity === "0" || cs.position === "absolute" || el.getBoundingClientRect().width < 4))
            target = lb;
        }

        /* 畳みの中か外か。開いてから測っているので `open` では分からない。
           `openFolds()` が残した印で見る。
           **見出し（`summary`）は畳みの中ではない。** 閉じていても見えていて
           押せるので、ここを「畳みの中」に数えると、これまでも測れていたものを
           「新しく見えた」と読んでしまう。入れ子があるので、上へたどって
           「自分を隠していた畳みが1つでもあるか」で決める。 */
        const det = el.closest("details");
        let inFold = false;
        for (let d = el.closest("details[data-fold-was-closed]"); d; d = d.parentElement?.closest("details[data-fold-was-closed]")) {
          const s = d.querySelector(":scope > summary");
          if (!s || !s.contains(el)) { inFold = true; break; }
        }
        if (fold === "skip") {
          // 前の数え方。閉じた畳みの中は飛ばす（**前後で数が変わることを示すため**に残してある）
          if (det && !det.open && !det.querySelector("summary")?.contains(el)) { drop("閉じた畳みの中(FOLD=skip)"); continue; }
        }

        target.scrollIntoView({ block: "center" });
        const r = target.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) { drop("見た目が 1px 未満"); continue; }

        const base = {
          t: txt(el), c: nm(el), href: el.getAttribute?.("href") || "",
          box: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
          fold: inFold,
        };

        /* 始点は外接矩形の中心にしない。折り返した行内リンクの外接矩形の中心は
           行と行のすきまに落ちる。行ごとの箱のうち、いちばん大きい行の中心を使う */
        const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        const bx = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
        const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2;

        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
          skipped.push({ ...base, why: "画面の外（送っても入らない）" });
          continue;
        }
        const hits = (x, y) => {
          const e = document.elementFromPoint(x, y);
          return e && (e === target || target.contains(e) || e.closest?.(TAP) === target);
        };
        if (!hits(cx, cy)) {
          const top = document.elementFromPoint(cx, cy);
          skipped.push({ ...base, why: `${nm(top)} が上にいる` });
          continue;
        }

        /* 1pxずつ外へ。**止まった理由を持って帰る。**
             飽和 … 伸ばす上限に当たった（実寸ではない。下限しか分からない）
             端   … 画面の端に出た（これも実寸ではない）
             要素 … 何かに当たった。それが押しどころなら「かぶり」 */
        const grow = (dx, dy) => {
          let k = 0;
          while (k < maxGrow && hits(cx + dx * (k + 1), cy + dy * (k + 1))) k++;
          const px = cx + dx * (k + 1), py = cy + dy * (k + 1);
          if (k >= maxGrow) return { k, stop: "飽和" };
          if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) return { k, stop: "端" };
          const e = document.elementFromPoint(px, py);
          const tap = e?.closest?.(TAP);
          const rival = tap && tap !== target && !target.contains(tap) && !tap.contains(target) ? tap : null;
          return {
            k, stop: "要素", who: nm(e), rival: rival ? nm(rival) : "",
            rt: rival ? txt(rival) : "",
            // 相手の当たりが**自分の見た目の箱の中まで**入り込んでいるか
            inBox: rival ? px >= r.left && px <= r.right && py >= r.top && py <= r.bottom : false,
          };
        };
        const L = grow(-1, 0), R = grow(1, 0), U = grow(0, -1), D = grow(0, 1);
        const w = L.k + R.k + 1, h = U.k + D.k + 1;
        const dirs = { 左: L, 右: R, 上: U, 下: D };
        const satW = L.stop === "飽和" || R.stop === "飽和";
        const satH = U.stop === "飽和" || D.stop === "飽和";
        const edgeW = L.stop === "端" || R.stop === "端";
        const edgeH = U.stop === "端" || D.stop === "端";
        const rivals = Object.entries(dirs)
          .filter(([, d]) => d.rival)
          .map(([k, d]) => ({ dir: k, who: d.rival, t: d.rt, inBox: d.inBox, at: d.k }));

        rows.push({
          ...base,
          hit: [w, h],
          sat: [satW, satH],     // 実寸ではない（上限で止まった）
          edge: [edgeW, edgeH],  // 実寸ではない（画面の端で止まった）
          rivals,                // かぶり。隣の押しどころに止められた方向
          small: w < min || h < min,
        });
      }
      return { rows, skipped, excluded };
    },
    { sel, min, maxGrow, fold },
  );
}

/** 実寸として読んでよいかの印。上限や画面端で止まった値は「≧」を付ける */
export function fmtHit(r) {
  const m = (v, s, e) => `${s || e ? "≧" : ""}${v}${s ? "(上限)" : e ? "(画面端)" : ""}`;
  return `${m(r.hit[0], r.sat[0], r.edge[0])}x${m(r.hit[1], r.sat[1], r.edge[1])}`;
}

/* ---- 面を手で渡して測る、いままでの使い方 ---- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || "3130";
  const SEL = process.env.SEL || ".crumbs a";
  const PAGES = (process.env.PAGES || "/nordic/finland").split(",");
  const W = Number(process.env.W || 390);
  const FOLD = process.env.FOLD || "open";
  const MIN = Number(process.env.MIN || 48);
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
  await offline(ctx);
  /* ログインした人にしか出ない面（じぶんのこと）を測るための差し込み口。
     `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。 */
  if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  console.log(`幅 ${W} / 畳み ${FOLD === "skip" ? "開かない（前の数え方）" : "先に開く"} / ${SEL}`);
  for (const path of PAGES) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try { await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; } catch { await p.waitForTimeout(2000); }
    }
    if (!ok) { console.log(path, "取れず"); continue; }
    await p.waitForTimeout(600);
    let folds = { opened: 0, stillClosed: 0 };
    if (FOLD !== "skip") folds = await openFolds(p);
    const { rows, skipped, excluded } = await measure(p, { sel: SEL, min: MIN, fold: FOLD });
    console.log(
      `${path}  押しどころ ${rows.length}個（うち畳みの中 ${rows.filter((r) => r.fold).length}）` +
        `  ${MIN}px割れ ${rows.filter((r) => r.small).length}` +
        `  測れず ${skipped.length}` +
        (FOLD !== "skip" ? `  開いた畳み ${folds.opened}${folds.stillClosed ? ` / **開かなかった ${folds.stillClosed}**` : ""}` : ""),
    );
    for (const r of rows) {
      const mark = (r.fold ? " [畳みの中]" : "") + (r.small ? "  ← 割れ" : "");
      const kabu = r.rivals.length ? `  かぶり: ${r.rivals.map((v) => `${v.dir}=${v.who}${v.inBox ? "(見た目の中まで)" : ""}`).join(" ")}` : "";
      console.log(`${path}  ${r.t || "(字なし)"}  見た目 ${r.box[0]}x${r.box[1]}  当たり ${fmtHit(r)}${mark}${kabu}`);
    }
    for (const r of skipped) console.log(`${path}  ${r.t || "(字なし)"}  見た目 ${r.box[0]}x${r.box[1]}  当たり 測れず（${r.why}）${r.fold ? " [畳みの中]" : ""}`);
    const ex = Object.entries(excluded);
    if (ex.length) console.log(`${path}  数えなかったもの: ${ex.map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  }
  await b.close();
}
