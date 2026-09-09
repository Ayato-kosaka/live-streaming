/**
 * 地図のパスを、見せる窓のぶんだけに切り詰める。
 *
 * ## なぜ要るか
 *
 * `content/nordic/map.json` の海岸線は 1本のパスに 44,861 文字ある。
 * ヨーロッパの海岸線を丸ごと持っているからで、全体図（`RouteMapSvg`）なら
 * それでいい。ところが**1日ぶんのページは11枚ある。** 街のまわりだけを
 * 拡大した地図をそこへ貼ると、窓の外にしか無い線を11回、書き出しに焼くことになる
 * （森・川・湖・格子まで足すと1枚 64KB）。
 *
 * 窓に入らない線は、**引いても1画素も出ない。** だから焼く前に落とす。
 * 実測で 64KB → ヴィリニュス 1.9KB、ヘルシンキ 11.9KB になった。
 *
 * ## 切り方
 *
 * 塗りつぶしのパスなので、**点を間引くのではなく、窓の外を通る道を近道にする。**
 * 窓の外にある連続した点は、まとめて1本の直線に置き換える。ただし
 * **同じ側（左／右／上／下）に居つづけるあいだだけ。** 上から右へ回り込む道を
 * 1本の弦にすると、その弦が窓を横切ってしまう。側が変わったところで切る。
 *
 * こうすると、窓の中に描かれるものは1画素も変わらない。塗りの内外判定も
 * 変わらない（外を通る道の形が変わっても、窓の中の巻き数は同じ）。
 *
 * ## 余白を取ること
 *
 * 海岸線には太い線（浅瀬は 38、砂浜は 13）が乗る。窓のふちのすぐ外で
 * 近道させると、その太さのぶんが窓の中へにじむ。**窓より広い枠で切る**
 * （`CityMapSvg` は 40 単位＝約 72km 外に取っている）。
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };

type Step = { d: string; x: number; y: number };
type Sub = { sx: number; sy: number; steps: Step[]; close: boolean };

/** 数字は小数1桁で足りる（元データも1桁）。落とせるところは落とす。 */
const r = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? "0" : String(v);
};

/**
 * パスを、部分パス（`m` で始まる島）の列に分ける。
 * 使われている命令は `m` `l` `q` `z` だけ。**知らない命令が出たら諦める**
 * （切らずに元のまま返す。黙って形が変わるより、太いまま出るほうがいい）。
 */
function parse(d: string): Sub[] | null {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  if (!toks) return null;
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let x = 0;
  let y = 0;
  let cmd = "";
  let i = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    const t = toks[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z" || cmd === "Z") {
        if (cur) cur.close = true;
        continue;
      }
      if (cmd === "m" || cmd === "M") {
        const a = num();
        const b = num();
        x = cmd === "m" ? x + a : a;
        y = cmd === "m" ? y + b : b;
        cur = { sx: x, sy: y, steps: [], close: false };
        subs.push(cur);
        // SVG の決まりで、`m` のあとの数字の並びは `l` として続く
        cmd = cmd === "m" ? "l" : "L";
        continue;
      }
      continue;
    }
    if (!cur) return null;
    if (cmd === "l" || cmd === "L") {
      const a = num();
      const b = num();
      const nx = cmd === "l" ? x + a : a;
      const ny = cmd === "l" ? y + b : b;
      cur.steps.push({ d: `l${r(nx - x)} ${r(ny - y)}`, x: nx, y: ny });
      x = nx;
      y = ny;
    } else if (cmd === "q" || cmd === "Q") {
      const a = num();
      const b = num();
      const c = num();
      const e = num();
      const qx = cmd === "q" ? x + a : a;
      const qy = cmd === "q" ? y + b : b;
      const nx = cmd === "q" ? x + c : c;
      const ny = cmd === "q" ? y + e : e;
      cur.steps.push({
        d: `q${r(qx - x)} ${r(qy - y)} ${r(nx - x)} ${r(ny - y)}`,
        x: nx,
        y: ny,
      });
      x = nx;
      y = ny;
    } else {
      return null;
    }
  }
  return subs;
}

/** その点が窓のどちら側にはみ出しているか。左1・右2・上4・下8のビット。 */
const side = (x: number, y: number, b: Box) =>
  (x < b.x0 ? 1 : 0) | (x > b.x1 ? 2 : 0) | (y < b.y0 ? 4 : 0) | (y > b.y1 ? 8 : 0);

export function cropPath(d: string, box: Box): string {
  const subs = parse(d);
  if (!subs) return d;
  const out: string[] = [];
  for (const s of subs) {
    // 窓にかすりもしない島は、まるごと落とす
    let minx = s.sx;
    let maxx = s.sx;
    let miny = s.sy;
    let maxy = s.sy;
    for (const st of s.steps) {
      if (st.x < minx) minx = st.x;
      if (st.x > maxx) maxx = st.x;
      if (st.y < miny) miny = st.y;
      if (st.y > maxy) maxy = st.y;
    }
    if (maxx < box.x0 || minx > box.x1 || maxy < box.y0 || miny > box.y1) continue;

    const parts = [`M${r(s.sx)} ${r(s.sy)}`];
    let px = s.sx;
    let py = s.sy;
    let i = 0;
    while (i < s.steps.length) {
      const st = s.steps[i];
      // 両端が同じ側の外に居るあいだだけ、まとめて近道にできる
      let common = side(px, py, box) & side(st.x, st.y, box);
      if (common === 0) {
        parts.push(st.d);
        px = st.x;
        py = st.y;
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < s.steps.length) {
        const next = common & side(s.steps[j + 1].x, s.steps[j + 1].y, box);
        if (next === 0) break;
        common = next;
        j++;
      }
      const e = s.steps[j];
      parts.push(`l${r(e.x - px)} ${r(e.y - py)}`);
      px = e.x;
      py = e.y;
      i = j + 1;
    }
    if (s.close) parts.push("z");
    out.push(parts.join(""));
  }
  return out.join("");
}
