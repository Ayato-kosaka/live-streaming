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
 * ## 押しどころを数える道具は、**全部ここを呼ぶ**
 *
 * 2026-09-14 に畳みの穴をここで塞いだが、**同じ「閉じた畳みは飛ばす」が
 * 5本にコピーされたまま残っていた**（`pchit` `mesweep` `livecheck`
 * `hitab` `_abhit16`）。道具を1つ直しても、写しは直らない
 * （`docs/island-misses.md` #83「作ったのに、当てたのは3本だけだった」）。
 * なので測る所は**この1か所だけ**にして、5本はここを呼ぶ。
 * 6か所に同じことを書けば、7か所目でまた漏れる。
 *
 *   import { openFolds, measure, fmtHit, SEL_ALL } from "./hitbox.mjs";
 *   import { addProbe, delProbe, isProbe, probeVerdict } from "./hitbox.mjs";
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";

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
export async function openFolds(p, { waitMs = 250, rounds = 8, scroll = "auto" } = {}) {
  let opened = 0, used = 0;
  /* **畳みが1つも無い面では、開いても新しく出てくるものが無い。**
     送る（scroll）のは畳みの中を組ませるためなので、そこも省く。
     `/roulette` の「回っている最中」のように**時刻で絵が変わる面**があり、
     何もしないのに 300ms 余分にかかると、測った瞬間がずれる。 */
  const anyFold = await p.evaluate(() => document.querySelectorAll("details").length);
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
  if (scroll === false || (scroll === "auto" && !anyFold))
    return { opened, rounds: used, stillClosed: 0, folds: anyFold };
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
  return { opened, rounds: used, stillClosed, folds: anyFold };
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
      /* **同じ押しどころを、2回の測定で突き合わせるための鍵。**
         字でも class でも足りない（同じ字のリンクが並ぶ面がある）。
         body からの道すじ（何番目の子か）で決める。`hitab.mjs` が使う。 */
      const keyOf = (el) => {
        const q = [];
        for (let e = el; e && e !== document.body; e = e.parentElement)
          q.push(e.tagName + ":" + [...(e.parentElement?.children || [])].indexOf(e));
        return q.join("/");
      };

      /* **目に見えていないものを、押せないものとして数えない。**
         パンくずは狭い画面で `clip-path: inset(50%)` の 1x1 に畳んである
         （`app/css/pages.css`）。中の `<a>` は自分の箱（13x21）を持ったままなので、
         そのまま測ると「押しどころ 13x21 で否」と出る。実際には画面に出ていない。
         `mesweep.mjs` がこれを自前で持っていたが、**同じことは全面で起きる。** */
      const clipped = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ac = getComputedStyle(a);
          const ar = a.getBoundingClientRect();
          if ((ar.width <= 1 || ar.height <= 1) && (ac.overflow === "hidden" || ac.clipPath !== "none"))
            return true;
        }
        return false;
      };

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

        /* 押す先を先に決める。**`<label>` が付いている入力は、指が押すのは
           `<label>` のほう。** HTML の決まりで、label を押せば中の入力が動く。
           見た目を作り直したチェックボックス（`<input>` を脇へどけて label に
           絵を描くもの）だけの話ではない。`.me-check` の 24x24 のチェックは
           見えているが、指が触るのは「名前を出す」の行ぜんぶ（302x49）。
           **入力の箱だけで測ると、押せるものを「押せない」と数える。**
           label のほうは上で「入力側で数える」として落としてあるので、
           ここで label を測っても二重にはならない。 */
        let target = el;
        if (el.tagName === "INPUT" || el.tagName === "SELECT") {
          const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          const lb = byFor || el.closest("label");
          if (lb) target = lb;
        }

        /* 落とす判定は**押す先が決まってから。** 先にやると、脇へどけた
           `<input>`（`opacity:0`）を落として、指が実際に押す `<label>` まで
           一緒に数から消える。 */
        if (getComputedStyle(target).opacity === "0") { drop("透明(opacity:0)"); continue; }
        if (clipped(target)) { drop("1px に畳まれた中（読み上げにだけ残してある）"); continue; }

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
          k: keyOf(el),
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

/* ================= 自己確認の仕込み =================================
   **当たらない道具の「0件」は証拠にならない**（`docs/island-misses.md`
   #79 #83）。だから、押しどころを数える道具は回す前にこれを通す。

   仕込むもの（`docs/island-misses.md` #83「既知の値を仕込んだ自己確認」）:
     外 … 畳みの外の 40x40。**開く前の数え方でも挙がる**のはこれだけ
     小 … 閉じた畳みの中の 40x40。開いてはじめて挙がる
     奥 … 入れ子の畳みの中の 40x40。外側を開けただけでは中が開かないことを見る
     大 … 畳みの中の 60x60。**合格側が落ちない**ことまで見ないと、
          「なんでも割れと言う道具」になっていても気づけない

   6本（`hitbox` `pchit` `foldsweep` `mesweep` `livecheck` `hitab`）が
   **同じ仕込みを使う。** 仕込みを道具ごとに書くと、道具ごとに別のものを
   確かめたことになる。 */
/* **仕込みは、いちばん手前に固定して置く。**
   はじめは body の頭に素のまま置いていた。ところが /roulette は画面ぜんぶを
   覆う層（.rl-page）を敷くので、仕込みがその下に隠れて**1つも挙がらず**、
   18場面のうち14場面で「仕込みが出ない」と出た。隠れているだけなのに
   「道具が届いていない」と読める。position:fixed と最大の重なり順にして、
   どの面でも指が届くところに置く。
   （仕込みを入れるのは自己確認の回だけ。ふだんの数には入らない） */
export const PROBE_JS = `(() => {
  if (document.getElementById("hbprobe")) return;
  const mk = (id, px, label) => {
    const a = document.createElement("a");
    a.id = id; a.href = "/"; a.textContent = label;
    a.style.cssText = "position:static;display:block;width:" + px + "px;height:" + px +
      "px;font-size:9px;line-height:" + px + "px;overflow:hidden;background:#c00;color:#fff";
    return a;
  };
  const d = document.createElement("details");
  d.id = "hbprobe";
  d.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;background:#fff";
  const s = document.createElement("summary");
  s.textContent = "仕込みの畳み";
  s.style.cssText = "min-height:56px";
  d.appendChild(s);
  const inner = document.createElement("details");
  const is = document.createElement("summary");
  is.textContent = "仕込みの畳み（入れ子）";
  is.style.cssText = "min-height:56px";
  inner.appendChild(is);
  inner.appendChild(mk("hbprobe-deep", 40, "奥"));
  d.appendChild(mk("hbprobe-small", 40, "小"));
  d.appendChild(mk("hbprobe-ok", 60, "大"));
  d.appendChild(inner);
  document.body.insertBefore(d, document.body.firstChild);
  const out = mk("hbprobe-out", 40, "外");
  /* 畳みのほうは左上に置いてあるので、こちらは左下。
     隣どうしに置くと、畳みの見出し（字の幅ぶん広がる）がこちらに
     かぶって「外が挙がらない」と出る（実際に出た） */
  out.style.cssText += ";position:fixed;left:0;bottom:0;z-index:2147483647";
  document.body.insertBefore(out, document.body.firstChild);
})()`;

/** 仕込みを入れる。**`openFolds()` より前**に呼ぶ（閉じた畳みごと入れるため） */
export async function addProbe(p) {
  await p.evaluate(PROBE_JS);
  await p.waitForTimeout(120);
}
/** 仕込みを取り除く。撮る前・本番の数を出す前に必ず呼ぶ */
export async function delProbe(p) {
  await p.evaluate(() => document.getElementById("hbprobe")?.remove() ?? document.getElementById("hbprobe-out")?.remove());
  await p.evaluate(() => document.getElementById("hbprobe-out")?.remove());
}
/** 仕込みの行かどうか（本番の数に混ぜない） */
export const isProbe = (r) => r.t === "外" || r.t === "小" || r.t === "大" || r.t === "奥";

/**
 * 仕込みがそのとおりに出たかを見る。
 *
 *   after  … 畳みを開いてから測った rows（必須）
 *   before … 開く前（`fold: "skip"`）で測った rows。渡せば前の数え方も見る
 *
 * 戻り: { ok, lines }。**`ok` が false なら、その回の「0件」は読まない。**
 */
export function probeVerdict({ after, before = null, min = 48 } = {}) {
  const small = (rows, t) => rows.some((r) => r.t === t && r.small);
  const here = (rows, t) => rows.some((r) => r.t === t);
  const lines = [];
  let ok = true;
  const say = (good, msg) => { lines.push((good ? "  ○ " : "  !! ") + msg); if (!good) ok = false; };
  say(small(after, "小"), `畳みの中の 40px「小」を ${min}px 割れに挙げた`);
  say(small(after, "奥"), "入れ子の畳みの中の 40px「奥」を割れに挙げた");
  say(!small(after, "大"), "畳みの中の 60px「大」を割れにしていない");
  say(here(after, "大"), "畳みの中の 60px「大」を数には入れている");
  say(small(after, "外"), "畳みの外の 40px「外」を割れに挙げた");
  if (before) {
    say(small(before, "外"), "前の数え方でも、畳みの外の「外」は挙がる");
    say(!here(before, "小"), "前の数え方では「小」が挙がらない（これまで見落としていたぶん）");
    say(!here(before, "奥"), "前の数え方では「奥」が挙がらない");
  }
  return { ok, lines };
}

/** 実寸として読んでよいかの印。上限や画面端で止まった値は「≧」を付ける */
export function fmtHit(r) {
  const m = (v, s, e) => `${s || e ? "≧" : ""}${v}${s ? "(上限)" : e ? "(画面端)" : ""}`;
  return `${m(r.hit[0], r.sat[0], r.edge[0])}x${m(r.hit[1], r.sat[1], r.edge[1])}`;
}

/* ---- 面を手で渡して測る、いままでの使い方 ---- */
/**
 * 終了コード: 0＝通った / 1＝見つかった（48px割れ） / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・その札が1つも無い）。
 *
 *   BREAK=nofold node tools/sprites/hitbox.mjs   # わざと盲点を作る（対照が落ちる）
 *
 * **数える前に対照を通す。** 仕込み（`PROBE_JS`）を `hitboxfix/fix.html` に
 * 差し込んで、`probeVerdict()` の8つが揃うまで**本物の面の数字を出さない**。
 * 仕込みは片側だけではない——40px の3つを割れに挙げること**と**、
 * 60px の「大」を割れにしないこと**の両方**を見る。片側だけだと、
 * しきい値をゆるめた道具も、なんでも割れと言う道具も通る
 * （`docs/island-misses.md` #125）。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nofold    畳みを開かずに測る（#79 当時の姿。「小」「奥」が挙がらない）
 *   nomin     下限を 0 にする（何も割れにならない＝ゆるめる向き）
 *   allsmall  下限を 999 にする（60px の「大」まで割れになる＝きつくする向き）
 *   preopen   前の数え方（`fold: "skip"`）の前に畳みを開く
 *             （これまで見落としていたぶんが「前から見えていた」ことになる）
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serveFixtures } = await import("./fixserve.mjs");
  const PORT = process.env.PORT || "3130";
  const SEL = process.env.SEL || ".crumbs a";
  const PAGES = (process.env.PAGES || "/nordic/finland").split(",");
  const W = Number(process.env.W || 390);
  const FOLD = process.env.FOLD || "open";
  const MIN = Number(process.env.MIN || 48);
  const BREAK = process.env.BREAK || "";
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
  await offline(ctx);
  /* ログインした人にしか出ない面（じぶんのこと）を測るための差し込み口。
     `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。 */
  if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

  /** 数字を1つも出さずに落ちる。**対照が外れた回に本番の数を読ませない** */
  const bail = async (msg) => { console.log(msg); await b.close(); process.exit(2); };

  /* ── 対照が先。落ちたら本物の面の数字は出さない ────────────────── */
  {
    const fx = await serveFixtures("hitboxfix");
    const miss0 = [];
    const got = await openChecked(p, fx.base, "/fix.html", { miss: miss0, waitUntil: "networkidle", timeout: 20000 });
    if (!got.ok) { fx.close(); await bail(`対照の台が開けませんでした（${got.why}）。`); }
    await addProbe(p);
    // `preopen` は「前の数え方」の前に畳みを開いてしまう壊し方
    if (BREAK === "preopen") await openFolds(p);
    const cMin = BREAK === "nomin" ? 0 : BREAK === "allsmall" ? 999 : MIN;
    const before = (await measure(p, { sel: SEL_ALL, min: cMin, fold: "skip" })).rows;
    if (BREAK !== "nofold") await openFolds(p);
    const after = (await measure(p, { sel: SEL_ALL, min: cMin, fold: "open" })).rows;
    await delProbe(p);
    const v = probeVerdict({ after, before, min: cMin });
    console.log("── 対照（既知の大きさを仕込んで、挙げられるか／挙げずにいられるか）");
    for (const l of v.lines) console.log(l);
    const n = v.lines.length;
    const ng = v.lines.filter((l) => l.startsWith("  !!")).length;
    console.log(`  対照 ${n}件中 ${n - ng}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
    /* 仕込みを外したあと、台のリンクがまだ数えられるか。
       ここが 0 だと「仕込みしか測れない道具」なので、本番の 0件 も読めない */
    const rest = await measure(p, { sel: SEL_ALL, min: MIN, fold: "open" });
    const left = rest.rows.filter((r) => !isProbe(r)).length;
    console.log(`  ${left ? "○" : "×"} 仕込みを外しても、台の押しどころが ${left} 個 残っている`);
    fx.close();
    if (ng || !left) await bail(`\n対照が ${ng + (left ? 0 : 1)}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
  }

  /* ── 本物の面 ──────────────────────────────────────────────── */
  console.log(`\n幅 ${W} / 畳み ${FOLD === "skip" ? "開かない（前の数え方）" : "先に開く"} / ${SEL}`);
  /** 開けなかった面。**空でなければ 2 で落ちる**（`served.mjs`）。 */
  const miss = [];
  let seenPages = 0, nRows = 0, nSmall = 0, nSkip = 0, nFold = 0;
  const nEx = {};
  for (const path of PAGES) {
    /* **素のパスで開かない。** 静的に配ると `/nordic/finland` は 404 を返す。
       `goto` は成功するので、そのまま数えると**「押しどころ 0個・48px割れ 0」**
       という文句なしの合格が出ていた（`.html` を付けると押しどころ3個・
       開いた畳み54）。 */
    const got = await openChecked(p, `http://localhost:${PORT}`, path, {
      miss, waitUntil: "networkidle", timeout: 60000, tries: 4,
    });
    if (!got.ok) { console.log(path, `取れず（${got.why}）`); continue; }
    seenPages++;
    await p.waitForTimeout(600);
    let folds = { opened: 0, stillClosed: 0 };
    if (FOLD !== "skip") folds = await openFolds(p);
    const { rows, skipped, excluded } = await measure(p, { sel: SEL, min: MIN, fold: FOLD });
    nRows += rows.length;
    nSmall += rows.filter((r) => r.small).length;
    nSkip += skipped.length;
    nFold += rows.filter((r) => r.fold).length;
    for (const [k, v] of Object.entries(excluded)) nEx[k] = (nEx[k] || 0) + v;
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
    /* **押しどころ0は「全部48px以上」ではなく「その札が無い」。**
       札（`SEL`）を変えた面で 0 が出たら、割れ0 は合格の意味を持たない
       （`docs/island-standards.md` 10）。 */
    if (!rows.length && !skipped.length) {
      miss.push(`${path}（「${SEL}」に当たるものが1つも無かった）`);
    }
  }
  await b.close();

  // **分母から読む。** 「割れ 0」は、見ていないから 0 かもしれない（§15）
  console.log(`\n── 数えたもの（幅 ${W}px / 札「${SEL}」）`);
  console.log(`  見た面           ${seenPages} / ${PAGES.length}`);
  console.log(`  押しどころ       ${nRows} 個（うち畳みの中 ${nFold}）`);
  console.log(`  ${MIN}px 割れ      ${nSmall} 個`);
  console.log(`  当たりが測れず   ${nSkip} 個（上に何かがいる・画面の外。**小さいものではない**）`);
  console.log(`  数えなかったもの ${Object.entries(nEx).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
  console.log(`  見ていないもの: 押しどころに当たらない札（`+ `SEL を変えると数は変わる）`);

  if (miss.length) { reportMissing(miss); process.exit(2); }
  if (!nRows && !nSkip) {
    console.log("\n押しどころを1つも測れませんでした。数えるものがありません。");
    process.exit(2);
  }
  if (nSmall) {
    console.log(`\nだめ: ${MIN}px を割る押しどころが ${nSmall} 個。`);
    process.exit(1);
  }
  console.log(`\n${seenPages}面、${MIN}px 割れは見つかりませんでした。`);
  process.exit(0);
}
