/**
 * 撮った2枚（字あり／字なし）から、字の濃さを出す。**`inkpx.py` と同じ計算。**
 *
 * `inkpx.py` は表を読むため（どの字がどれだけ薄いか）に残してある。
 * こちらは**合否を終了コードにするため**のもので、道具が自分で読む。
 * 人が目で読む表しか無いと、`| tail` と一緒に消える（`docs/island-misses.md` #124）。
 *
 * 計算を2か所に書いているので、**片方だけ直さない。** 直したら
 * `PAGES=/map` で両方を回して、割れの数が合うことを見る
 * （2026-09-17 の実測で `/map` 113か所・割れ 0 / 0 が一致）。
 *
 * 絵の読み込みはブラウザにやらせる（Node に PNG を解く道具を足さない）。
 * 20MB の絵を base64 で渡すと遅いので、**置いてあるところを配って URL で取らせる。**
 */

/** ブラウザの中で走る本体。**`inkpx.py` の写しなので、並びも変えない。** */
const IN_PAGE = async ({ shotUrl, bgUrl, boxes, dpr, lim, declared, maskMin }) => {
  const load = async (u) => {
    const bmp = await createImageBitmap(await (await fetch(u)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
  };
  const A = await load(shotUrl);
  const B = await load(bgUrl);
  if (A.w !== B.w || A.h !== B.h) return { err: `2枚の大きさが違う（${A.w}x${A.h} / ${B.w}x${B.h}）` };

  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const la = lum(...a), lb = lum(...b); const [h, l] = la < lb ? [lb, la] : [la, lb]; return (h + 0.05) / (l + 0.05); };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  /** np.quantile と同じ（線形の内挿）。ここを「N番目」で代えると芯の取り方がずれる */
  const quantile = (a, q) => {
    const s = [...a].sort((x, y) => x - y);
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  /** `color-mix` の計算値は `color(srgb 0.42 0.30 0.09)` で返る。読めないと丸ごと落ちる */
  const parse = (col) => {
    col = (col || "").trim();
    if (col.startsWith("color(")) {
      const n = col.slice(col.indexOf("(") + 1, col.lastIndexOf(")")).split(/\s+/).slice(1, 4).map(Number);
      return n.length === 3 && n.every((x) => !isNaN(x)) ? n.map((x) => Math.max(0, Math.min(255, Math.round(x * 255)))) : null;
    }
    if (col.startsWith("rgb")) {
      const n = col.slice(col.indexOf("(") + 1, col.indexOf(")")).replace(/\//g, ",").split(",").slice(0, 3).map((x) => parseFloat(x));
      return n.length === 3 && n.every((x) => !isNaN(x)) ? n.map((x) => Math.round(x)) : null;
    }
    if (col.startsWith("#")) {
      let h = col.slice(1);
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    return null;
  };

  const rows = [];
  // **落としたものは、理由ごとに数える。** 内訳が無いと「割れ0」を読めない
  const dropped = { 色が読めない: 0, 箱が小さい: 0, 字の画素が足りない: 0 };
  for (const b0 of boxes) {
    const col = parse(b0.color);
    if (col === null) { dropped.色が読めない++; continue; }
    const x0 = Math.max(0, Math.trunc(b0.x * dpr)), y0 = Math.max(0, Math.trunc(b0.y * dpr));
    const x1 = Math.min(A.w, Math.trunc((b0.x + b0.w) * dpr)), y1 = Math.min(A.h, Math.trunc((b0.y + b0.h) * dpr));
    if (x1 - x0 < 2 || y1 - y0 < 2) { dropped.箱が小さい++; continue; }
    const ink = [], und = [], diff = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * A.w + x) * 4;
        const d = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
        // 字が乗って色が変わった画素だけ見る（`maskMin` を下げると地まで混ざる）
        if (d <= maskMin) continue;
        ink.push([A.d[i], A.d[i + 1], A.d[i + 2]]);
        und.push([B.d[i], B.d[i + 1], B.d[i + 2]]);
        diff.push(d);
      }
    }
    if (ink.length < 6) { dropped.字の画素が足りない++; continue; }
    /* にじみ（アンチエイリアス）を拾わないよう、地との差がいちばん大きい側
       （上位4割）＝**字の芯**だけを見る。`CLAUDE.md`「下位10%で決めない」 */
    const q = quantile(diff, 0.6);
    const core = [];
    for (let i = 0; i < diff.length; i++) if (diff[i] >= q) core.push(i);
    const idx = core.length >= 4 ? core : diff.map((_, i) => i);
    const painted = idx.map((i) => ink[i]);
    const unders = idx.map((i) => und[i]);
    /* **字の色は、宣言された値ではなく描かれた画素から取る。**
       computed の color は `opacity` を含まない。0.72 で薄めてある字を
       そのまま使うと、実際より濃いものとして数えて合格に見える
       （地図の海の名前を 0/170 と報告して、実測 1.88 だった）。 */
    const inkPx = declared
      ? col
      : [0, 1, 2].map((k) => Math.round(median(painted.map((p) => p[k]))));
    const rs = declared
      ? painted.map((_, i) => ratio(col, unders[i]))
      : painted.map((p, i) => ratio(p, unders[i]));
    const mid = median(rs);
    // 地のばらつきは、字ではなく**地のほう**を見る。1画素のはずれ値を拾わないよう上下5%で切る
    const order = unders.map((u, i) => [lum(...u), i]).sort((a, b) => a[0] - b[0]).map((z) => z[1]);
    const lo = unders[order[Math.trunc(order.length / 20)]];
    const hi = unders[order[order.length - 1 - Math.trunc(order.length / 20)]];
    rows.push({
      mid, rhi: ratio(inkPx, hi), rlo: ratio(inkPx, lo),
      ink: inkPx, lo, hi, c: b0.c, t: b0.t, size: b0.size, tag: b0.tag,
      // 中央値が足りないか、地のムラのせいで暗いところだけ落ちているか
      bad: mid < lim || ratio(inkPx, lo) < lim,
    });
  }
  return { rows, dropped, w: A.w, h: A.h };
};

/**
 * 2枚を読んで、箱ごとの濃さを出す。
 *
 * @param {import("playwright-core").Page} p 読ませる用の（何も載っていない）面
 * @param {{shotUrl: string, bgUrl: string, boxes: object[], dpr: number, lim: number, declared?: boolean, maskMin?: number}} a
 */
export function judgeInk(p, a) {
  return p.evaluate(IN_PAGE, { declared: false, maskMin: 40, ...a });
}
