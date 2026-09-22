// 振り返り資料（public/nordic_review.html）が、**スマホの OBS で読めるか**を測る。
//   bash tools/sprites/deckserve.sh 4733 &
//   URL=http://127.0.0.1:4733/nordic_review.html node tools/sprites/deckread.mjs
//
// なぜ要るか。あやとはスマホで配信を見せていて、スマホ版 OBS は 1920 を
// 横 844px に寝かせて出す。**0.44倍。** 15px の字は 6.6px にしかならない。
// 分量は減らさない約束なので、字を大きくする手は「寄る」しかない。
// だから測るのは素の font-size ではなく、**寄ったあとの実効の大きさ**:
//
//   実効 = 寄り先の中の本文の（字数で重みづけした）中央の大きさ × カメラの倍率
//   スマホの見え = 実効 × 0.44
//
// 基準は**実効 40px**（スマホで約 18px）。どうしても入らない歩は 34px まで
// 見逃すが、**その歩は名指しで出す**（黙って下げない）。
//
// 終了コードで判定する（0=全部届いた / 1=届かない歩がある）。行の見た目で判断しない。
//
// **寄りは window.__cam(true) で明示的に入れる。** __jump は頭出しの穴で、
// deckwalk が「素の 1920x1080 に収まっているか」を測るために寄りを park する。
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PAGE = process.env.URL || pathToFileURL(path.join(ROOT, "public", "nordic_review.html")).href;

const PHONE = 844 / 1920;          // スマホ版 OBS の横向き
const PASS = Number(process.env.PASS || 40);   // 実効の基準
const FLOOR = Number(process.env.FLOOR || 34); // ここを割ったら落とす

const b = await chromium.launch({ executablePath: EXE });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(PAGE, { waitUntil: "load" });
await page.waitForTimeout(700);

const rows = await page.evaluate(async () => {
  /* 測りかたは資料の中の camInk / camMedian と同じ定義にする。
     **ただし値は資料に聞かない。** 描かれている DOM から測り直す。
     資料の計算が間違っていたときに、同じ間違いで合格してしまうため。 */
  const vis = (el, stop) => {
    for (let e = el; e && e !== stop.parentElement; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.display === "none" || st.visibility === "hidden") return false;
      if (parseFloat(st.opacity) === 0) return false;
    }
    return true;
  };
  const sizesOf = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out = [];
    let n;
    while ((n = w.nextNode())) {
      const t = (n.textContent || "").replace(/\s+/g, "");
      if (!t) continue;
      const par = n.parentElement;
      if (!par || !vis(par, el)) continue;
      out.push([parseFloat(getComputedStyle(par).fontSize), t.length]);
    }
    return out;
  };
  /* 「字そのもの」の置き場所。**要素の箱ではない。**
     要素の箱には余白も罫も入るので、字は枠に収まっているのに
     「はみ出した」と数えてしまう（数えた） */
  const inkOf = (el) => {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = (n.textContent || "").replace(/\s+/g, "");
      if (!t) continue;
      const par = n.parentElement;
      if (!par || !vis(par, el)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width || q.height) out.push(q);
    }
    el.querySelectorAll("img, svg, canvas").forEach((g) => {
      const q = g.getBoundingClientRect();
      if (q.width && q.height) out.push(q);
    });
    return out;
  };
  const median = (a) => {
    if (!a.length) return 0;
    const q = a.slice().sort((x, y) => x[0] - y[0]);
    const tot = q.reduce((s, x) => s + x[1], 0);
    let acc = 0;
    for (const [f, c] of q) { acc += c; if (acc >= tot / 2) return f; }
    return q[q.length - 1][0];
  };
  const stage = document.getElementById("stage");
  const out = [];
  for (let s = 0; s < window.__sceneCount; s++) {
    for (let step = 0; step <= window.__totals[s]; step++) {
      window.__jump(s, step);
      /* **落ち着くまで待つ。時間で待たない。**
         区画を移す 0.26 秒 + 出方 0.45 秒、のはずが、この箱では地図と写真の
         ぶん1フレームが遅く、420ms で測ると歩の opacity がまだ 0 だった。
         0 のあいだに測ると「本文が1文字も無い歩」として通り抜ける。 */
      const born = performance.now();
      /* (1) まず**組み直しが済むまで**待つ。__jump は区画を移すときだけでなく
            歩を送るときも舞台を作り直す（0.26 秒 かけて消してから組む）。
            待たずに数えると、**前の区画の [data-step] がまだ出ているので
            「もう落ち着いている」に見えて、1つ前の面を測ってしまう。**
            区画がまるごと1つずれた表が出た（実際に出した）。 */
      while (stage.classList.contains("fading") && performance.now() - born < 4000) {
        await new Promise((r) => setTimeout(r, 30));
      }
      // (2) そのうえで、歩の出方（0→1）が終わるまで待つ
      for (;;) {
        const on = [...stage.querySelectorAll('[data-step="' + step + '"]')].filter((e) => e.classList.contains("on"));
        const ready = on.length && on.every((e) => parseFloat(getComputedStyle(e).opacity) > 0.9);
        if (ready || performance.now() - born > 6000) break;
        await new Promise((r) => setTimeout(r, 60));
      }
      /* ここで寄る。**寄りの無い版でも測れるようにしておく。**
         直す前と後を同じ物差しで並べられないと、良くなったかが言えない */
      const st = window.__cam ? window.__cam(true) : { k: 1 };
      await new Promise((r) => requestAnimationFrame(r));
      // 寄り先は資料に聞く（何に寄ったか）。**大きさは自分で測り直す**
      const pick = window.__camPick ? window.__camPick() : [];
      const pool = pick.length
        ? pick
        : [...stage.querySelectorAll('[data-step="' + step + '"]')].filter((e) => e.classList.contains("on"));
      const sizes = [];
      for (const el of pool) sizes.push(...sizesOf(el));
      const font = median(sizes);
      const chars = sizes.reduce((a, x) => a + x[1], 0);
      /* **倍率も資料に聞かない。舞台に当たっている行列から取る。**
         聞いてしまうと、計算は合っているのに transform が当たっていない
         （別の CSS に打ち消された）ときに、そのまま合格になる。 */
      const k = new DOMMatrixReadOnly(getComputedStyle(stage).transform).a || 1;
      // 寄り先の字が画面の外に出ていないか（寄りの世界での「はみ出し」）
      let cut = 0;
      for (const el of pool) {
        for (const r of inkOf(el)) {
          cut = Math.max(cut, -r.left, -r.top, r.right - innerWidth, r.bottom - innerHeight);
        }
      }
      out.push({ s, step, k, font, chars, cut: Math.round(cut), said: st.k });
    }
  }
  return out;
});
await b.close();

const SCENE = (s) =>
  s === 0 ? "表紙" : s === 1 ? "数字" : s === 2 ? "9日間の道のり" : s === 3 ? "18台" :
  s === 4 ? "通った街" : s === 5 ? "食べたもの" : s === 6 ? "トラブル" :
  s >= 7 && s <= 29 ? `クイズ${s - 6}` : s === 30 ? "盛り上がり" : s === 31 ? "視聴者さん" :
  s === 32 ? "カード" : s === 33 ? "投げ銭" : s === 34 ? "手紙" : "締め";

const bad = [], soft = [], cuts = [];
const perScene = new Map();
for (const r of rows) {
  r.eff = r.font * r.k;
  r.phone = r.eff * PHONE;
  if (r.cut > 2) cuts.push(r);
  if (!r.chars) continue;                 // 字の無い歩（写真だけ）は測らない
  if (r.eff < FLOOR) bad.push(r);
  else if (r.eff < PASS) soft.push(r);
  const a = perScene.get(r.s) || [];
  a.push(r);
  perScene.set(r.s, a);
}

console.log("区画  歩数  本文px  倍率      実効px   スマホpx  いちばん小さい歩");
for (const [s, a] of [...perScene].sort((x, y) => x[0] - y[0])) {
  const lo = a.reduce((m, r) => (r.eff < m.eff ? r : m));
  const ef = a.map((r) => r.eff);
  const f = a.map((r) => r.font);
  const k = a.map((r) => r.k);
  const rng = (v, d = 1) => {
    const mn = Math.min(...v), mx = Math.max(...v);
    return mn.toFixed(d) === mx.toFixed(d) ? mn.toFixed(d) : `${mn.toFixed(d)}〜${mx.toFixed(d)}`;
  };
  console.log(
    `${String(s).padStart(2)} ${SCENE(s).padEnd(14)} ${String(a.length).padStart(2)}  ` +
    `${rng(f).padStart(11)}  ${rng(k, 2).padStart(11)}  ${rng(ef).padStart(11)}  ` +
    `${rng(a.map((r) => r.phone)).padStart(11)}  歩${lo.step}=${lo.eff.toFixed(1)}`
  );
}

const line = (r) => `区画${r.s}(${SCENE(r.s)}) 歩${r.step}: 本文${r.font}px × ${r.k.toFixed(2)} = 実効${r.eff.toFixed(1)}px（スマホ ${r.phone.toFixed(1)}px・${r.chars}文字）`;
console.log(`\n基準 ${PASS}px に届かない歩 ${soft.length + bad.length}`);
for (const r of [...bad, ...soft].sort((a, b) => a.eff - b.eff)) console.log("  " + line(r));
console.log(`\n見逃しの床 ${FLOOR}px を割った歩 ${bad.length}`);
for (const r of bad.sort((a, b) => a.eff - b.eff)) console.log("  " + line(r));
console.log(`\n寄り先が枠から出た歩 ${cuts.length}`, cuts.slice(0, 5).map((r) => `s${r.s}/${r.step}=${r.cut}px`).join(" "));
console.log("JSエラー", errs.length, errs.slice(0, 3));

process.exit(bad.length || cuts.length || errs.length ? 1 : 0);
