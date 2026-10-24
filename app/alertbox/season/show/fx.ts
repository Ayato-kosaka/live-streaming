/**
 * 手続きで描く演出の部品（設計書 §3.7）。絵を頼まないもの。
 *
 * - 金貨の噴水・雨・金の粉（canvas）。金貨1枚の絵を、横の縮み（cos）で回って見せる＋重力。
 *   **粒が残っているあいだだけ rAF を回す**。全部落ちきったら止めて、canvas を空にする
 * - きらめき（4方向の星）・土ぼこり（DOM。transform と opacity だけ）
 * - こうもり（切り絵の部品。羽を回して羽ばたく）
 */
import { buildRig, type LoadedRig, type RigHandle } from "../rig/RigView";
import type { Motion } from "../rig/motion";
import { restOrigin } from "../rig/rig";
import { loadedElement } from "../useSeason";

/** 画面いっぱいの層（絶対配置） */
export function fullLayer(parent: HTMLElement, z: number, extra?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: String(z),
    ...extra,
  });
  parent.appendChild(d);
  return d;
}

/** 部品の組の、回していないときの外形（台紙 px） */
export function rigBounds(rig: LoadedRig) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of rig.def.parts) {
    const o = restOrigin(rig.def, p.id)!;
    const im = rig.images.get(p.file ?? Object.values(p.swaps ?? {})[0]);
    if (!im) continue;
    l = Math.min(l, o[0]);
    t = Math.min(t, o[1]);
    r = Math.max(r, o[0] + im.width);
    b = Math.max(b, o[1] + im.height);
  }
  if (!Number.isFinite(l)) return { l: 0, t: 0, r: rig.def.size[0], b: rig.def.size[1], w: rig.def.size[0], h: rig.def.size[1] };
  return { l, t, r, b, w: r - l, h: b - t };
}

/** 部品の絵の要素（解読済み）。部品に無ければ `items` から探す。無ければ null */
export function partImage(rig: LoadedRig, id: string): HTMLImageElement | null {
  const p = rig.def.parts.find((q) => q.id === id);
  const f = p ? p.file ?? Object.values(p.swaps ?? {})[0] : rig.def.items[id];
  if (!f) return null;
  return loadedElement(`${rig.base}/${f}`);
}

// ---------------------------------------------------------------- 金貨（canvas）

type Coin = {
  x: number; y: number; vx: number; vy: number;
  ph: number; spin: number; size: number; g: number;
  kind: "coin" | "dust";
  life: number; age: number; drag: number;
  /** どの絵で描くか（お菓子は色ごとに絵がある） */
  skin?: number;
};

/** 粒の絵。金貨（段7）か、包み紙のお菓子（段3の紙吹雪） */
export type CoinSkin = "coin" | "candy";
/** お菓子の包み紙の色（ハロウィンの橙・紫・緑・桃・黄） */
const CANDY_COLORS = ["#FF8A1F", "#9C4DFF", "#3DDC84", "#FF5FA2", "#FFD23F"];
type Emitter = { at: number; dur: number; n: number; done: number; make: () => Coin };

export class Coins {
  private ctx: CanvasRenderingContext2D | null;
  private skins: { front: HTMLCanvasElement; back: HTMLCanvasElement }[];
  private candy: boolean;
  private parts: Coin[] = [];
  private emitters: Emitter[] = [];
  private raf = 0;
  private last = 0;
  private dpr: number;

  constructor(
    private canvas: HTMLCanvasElement,
    private W: number,
    private H: number,
    coinImg: HTMLImageElement | null,
    /** 演出の時計（秒）。ヒットストップのあいだは進まない */
    private clock: () => number,
    /** 舞台の 1px を canvas の何画素で描くか（箱の大きさで変わる。毎コマ聞き直す） */
    private density: () => number = () =>
      Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    skin: CoinSkin = "coin"
  ) {
    this.dpr = density();
    canvas.width = Math.round(W * this.dpr);
    canvas.height = Math.round(H * this.dpr);
    this.ctx = canvas.getContext("2d");
    const S = 96;
    this.candy = skin === "candy";
    this.skins = this.candy
      ? CANDY_COLORS.map((c) => ({ front: candySprite(S, c, false), back: candySprite(S, c, true) }))
      : [{ front: sprite(S, coinImg, false), back: sprite(S, coinImg, true) }];
  }

  /**
   * 噴水。(x, y) から上へ `n` 枚を `dur` 秒かけて。
   * `dir` を渡すと、その向き（-1 左 / 1 右）へだけ広げる（真ん中の主役の前を通さない）。
   * `power` は噴き上げる高さの倍率（1 で画面の高さほど）
   */
  fountain(x: number, y: number, n: number, dur: number, spread: number, dir = 0, power = 1) {
    const { W, H } = this;
    this.emit(n, dur, () => ({
      x: x + (Math.random() - 0.5) * spread,
      y,
      vx: (dir ? dir * W * (0.18 + Math.random() * 0.5) : (Math.random() - 0.5) * W * 1.3) * Math.sqrt(power),
      vy: -H * (0.9 + Math.random() * 0.55) * Math.sqrt(power),
      ph: Math.random() * Math.PI * 2,
      spin: 9 + Math.random() * 9,
      size: W * (0.04 + Math.random() * 0.025),
      g: H * 2.2,
      kind: "coin",
      life: 4,
      age: 0,
      drag: 0,
    }));
  }

  /** 上から降る雨。`avoid` は降らせない横の範囲（主役の前。画面の幅に対する割合） */
  rain(n: number, dur: number, avoid: [number, number] | null = null) {
    const { W, H } = this;
    const pickX = () => {
      if (!avoid) return Math.random() * W;
      // 避ける範囲の左右に、幅の比で振り分ける
      const left = avoid[0];
      const right = 1 - avoid[1];
      const u = Math.random() * (left + right);
      return (u < left ? u : avoid[1] + (u - left)) * W;
    };
    this.emit(n, dur, () => ({
      x: pickX(),
      y: -W * 0.05,
      vx: (Math.random() - 0.5) * W * 0.12,
      vy: H * (0.25 + Math.random() * 0.25),
      ph: Math.random() * Math.PI * 2,
      spin: 7 + Math.random() * 7,
      size: W * (0.035 + Math.random() * 0.025),
      g: H * 1.1,
      kind: "coin",
      life: 4,
      age: 0,
      drag: 0,
    }));
  }

  /** 金の粉（締め）。ゆっくり舞い落ちる小さな粒 */
  dust(n: number, dur: number, x0 = 0, x1 = this.W, y0 = 0, y1 = this.H * 0.5) {
    const { W, H } = this;
    this.emit(n, dur, () => ({
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
      vx: (Math.random() - 0.5) * W * 0.06,
      vy: H * (0.02 + Math.random() * 0.05),
      ph: Math.random() * Math.PI * 2,
      spin: 3 + Math.random() * 4,
      size: W * (0.008 + Math.random() * 0.01),
      g: H * 0.05,
      kind: "dust",
      life: 1.6 + Math.random() * 1.4,
      age: 0,
      drag: 0.6,
    }));
  }

  private emit(n: number, dur: number, make: () => Coin) {
    const k = this.skins.length;
    const withSkin = () => ({ ...make(), skin: Math.floor(Math.random() * k) });
    this.emitters.push({ at: this.clock(), dur: Math.max(0.01, dur), n, done: 0, make: withSkin });
    this.start();
  }

  private start() {
    if (this.raf || typeof requestAnimationFrame !== "function") return;
    this.last = this.clock();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.raf = 0;
    const now = this.clock();
    const dt = Math.min(0.05, Math.max(0, now - this.last));
    this.last = now;
    for (const e of this.emitters) {
      const want = Math.min(e.n, Math.floor(((now - e.at) / e.dur) * e.n));
      while (e.done < want) {
        this.parts.push(e.make());
        e.done++;
      }
    }
    this.emitters = this.emitters.filter((e) => e.done < e.n);
    const { W, H } = this;
    for (const p of this.parts) {
      p.age += dt;
      p.vy += p.g * dt;
      if (p.drag) {
        p.vx *= 1 - p.drag * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ph += p.spin * dt;
    }
    this.parts = this.parts.filter(
      (p) => p.y < H + p.size && p.x > -p.size * 2 && p.x < W + p.size * 2 && p.age < p.life
    );
    this.draw();
    if (this.parts.length || this.emitters.length) this.raf = requestAnimationFrame(this.tick);
  };

  private draw() {
    const c = this.ctx;
    if (!c) return;
    // 箱の大きさが変わったら、描く画素の数を合わせ直す
    const want = this.density();
    if (Math.abs(want - this.dpr) > 0.05) {
      this.dpr = want;
      this.canvas.width = Math.round(this.W * want);
      this.canvas.height = Math.round(this.H * want);
    }
    const d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.parts) {
      if (p.kind === "dust") {
        const a = Math.max(0, 1 - p.age / p.life) * (0.6 + 0.4 * Math.abs(Math.sin(p.ph)));
        c.globalAlpha = a;
        c.setTransform(d, 0, 0, d, p.x * d, p.y * d);
        c.fillStyle = "#FFE7A0";
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        continue;
      }
      c.globalAlpha = 1;
      const cs = Math.cos(p.ph);
      const sx = Math.max(0.08, Math.abs(cs));
      const s = p.size / 96;
      const sk = this.skins[p.skin ?? 0] ?? this.skins[0];
      if (this.candy) {
        // お菓子は裏返りながら、くるくる回って落ちる
        const r = p.ph * 0.6;
        const cr = Math.cos(r);
        const sr = Math.sin(r);
        c.setTransform(cr * sx * s * d, sr * sx * s * d, -sr * s * d, cr * s * d, p.x * d, p.y * d);
      } else {
        c.setTransform(sx * s * d, 0, 0, s * d, p.x * d, p.y * d);
      }
      c.drawImage(cs >= 0 ? sk.front : sk.back, -48, -48);
    }
    c.globalAlpha = 1;
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
    this.emitters = [];
  }
}

/** 金貨の絵（無ければ手で描く）。裏は少し暗くして、回っているのが分かるように */
function sprite(S: number, img: HTMLImageElement | null, dark: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const x = c.getContext("2d");
  if (!x) return c;
  if (img && img.naturalWidth) {
    x.drawImage(img, 0, 0, S, S);
  } else {
    const g = x.createRadialGradient(S * 0.38, S * 0.34, S * 0.05, S / 2, S / 2, S / 2);
    g.addColorStop(0, "#FFF6C8");
    g.addColorStop(0.45, "#FFC93C");
    g.addColorStop(1, "#B8740A");
    x.fillStyle = g;
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = "#7A4A04";
    x.stroke();
    x.beginPath();
    x.arc(S / 2, S / 2, S * 0.32, 0, Math.PI * 2);
    x.lineWidth = 3;
    x.strokeStyle = "#D9961C";
    x.stroke();
  }
  if (dark) {
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = "rgba(90,40,0,0.38)";
    x.fillRect(0, 0, S, S);
  }
  return c;
}

/** 包み紙のお菓子1粒（両端をねじった飴）。裏は少し暗く */
function candySprite(S: number, color: string, dark: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const x = c.getContext("2d");
  if (!x) return c;
  const cx = S / 2;
  const cy = S / 2;
  const r = S * 0.2;
  x.lineJoin = "round";
  x.lineWidth = S * 0.035;
  x.strokeStyle = "#3A1A4A";
  // ねじった両端（三角）
  for (const dir of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + dir * r * 0.8, cy);
    x.lineTo(cx + dir * S * 0.46, cy - S * 0.17);
    x.lineTo(cx + dir * S * 0.42, cy);
    x.lineTo(cx + dir * S * 0.46, cy + S * 0.17);
    x.closePath();
    x.fillStyle = color;
    x.fill();
    x.stroke();
  }
  // 粒
  x.beginPath();
  x.ellipse(cx, cy, r * 1.15, r, 0, 0, Math.PI * 2);
  x.fillStyle = color;
  x.fill();
  x.stroke();
  // 縞と照り
  x.save();
  x.clip();
  x.strokeStyle = "rgba(255,255,255,0.55)";
  x.lineWidth = S * 0.05;
  for (const o of [-0.5, 0.15, 0.8]) {
    x.beginPath();
    x.moveTo(cx + o * r - r, cy + r);
    x.lineTo(cx + o * r + r * 0.2, cy - r);
    x.stroke();
  }
  x.restore();
  x.beginPath();
  x.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
  x.fillStyle = "rgba(255,255,255,0.8)";
  x.fill();
  if (dark) {
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = "rgba(40,0,40,0.3)";
    x.fillRect(0, 0, S, S);
  }
  return c;
}

// ---------------------------------------------------------------- きらめき・土ぼこり

/** 4方向の星が、ぱっと光って消える。(x, y) は `parent` の中の px */
export function sparkle(
  m: Motion,
  parent: HTMLElement,
  x: number,
  y: number,
  size: number,
  delayMs = 0,
  color = "255,246,200"
) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    pointerEvents: "none",
    opacity: "0",
    background:
      `radial-gradient(circle, rgba(${color},1) 0%, rgba(${color},0.9) 8%, rgba(${color},0) 22%),` +
      `linear-gradient(90deg, rgba(${color},0) 0%, rgba(${color},1) 50%, rgba(${color},0) 100%) center/100% 7% no-repeat,` +
      `linear-gradient(0deg, rgba(${color},0) 0%, rgba(${color},1) 50%, rgba(${color},0) 100%) center/7% 100% no-repeat`,
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(el);
  const a = m.play(el, [
    { transform: "scale(0) rotate(0deg)", opacity: 0, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
    { transform: "scale(1.15) rotate(30deg)", opacity: 1, offset: 0.35, easing: "ease-in" },
    { transform: "scale(0) rotate(75deg)", opacity: 0 },
  ], { duration: 520, delay: delayMs });
  const rm = () => el.remove();
  if (a) a.finished.then(rm, rm);
  else rm();
}

/** 土ぼこり。(x, y) から左右へ `n` 個 */
export function dustPuffs(m: Motion, parent: HTMLElement, x: number, y: number, size: number, n: number) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    const s = size * (0.7 + Math.random() * 0.6);
    Object.assign(el.style, {
      position: "absolute",
      left: `${x - s / 2}px`,
      top: `${y - s / 2}px`,
      width: `${s}px`,
      height: `${s}px`,
      borderRadius: "50%",
      background: "radial-gradient(circle at 40% 40%, rgba(255,236,214,0.9), rgba(200,170,150,0.55) 60%, rgba(200,170,150,0) 72%)",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(el);
    const dir = i % 2 === 0 ? -1 : 1;
    const dx = dir * size * (1 + Math.random() * 1.6);
    const a = m.play(el, [
      { transform: "translate(0px, 0px) scale(0.3)", opacity: 0.95 },
      { transform: `translate(${dx}px, ${-size * (0.3 + Math.random() * 0.5)}px) scale(1.5)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 300, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)" });
    const rm = () => el.remove();
    if (a) a.finished.then(rm, rm);
    else rm();
  }
}

// ---------------------------------------------------------------- こうもり

export type Bat = { el: HTMLDivElement; rig: RigHandle; w: number; h: number };

/** こうもり1匹（翼幅 `span` px）。中心が (0,0) に来る箱を返す。羽ばたきは `flapMs` 周期 */
export function makeBat(m: Motion, rig: LoadedRig, parent: HTMLElement, span: number, flapMs = 130): Bat {
  const b = rigBounds(rig);
  const s = span / b.w;
  const h = buildRig(rig, s);
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    willChange: "transform",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  h.root.style.left = `${-(b.l + b.w / 2) * s}px`;
  h.root.style.top = `${-(b.t + b.h / 2) * s}px`;
  el.appendChild(h.root);
  parent.appendChild(el);
  const ph = -Math.random() * flapMs;
  m.play(h.part("wing_l"), [{ transform: "rotate(-38deg)" }, { transform: "rotate(30deg)" }], {
    duration: flapMs, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: ph,
  });
  m.play(h.part("wing_r"), [{ transform: "rotate(38deg)" }, { transform: "rotate(-30deg)" }], {
    duration: flapMs, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: ph,
  });
  return { el, rig: h, w: b.w * s, h: b.h * s };
}

/** 点の並びを、なめらかに通る keyframes にする（向きに合わせて少し傾ける） */
export function pathFrames(
  pts: [number, number][],
  opts: { tilt?: number; scale?: (k: number) => number; opacity?: (k: number) => number; offsets?: number[] } = {}
): Keyframe[] {
  const n = pts.length;
  return pts.map(([x, y], i) => {
    const [px, py] = pts[Math.max(0, i - 1)];
    const [nx, ny] = pts[Math.min(n - 1, i + 1)];
    const vx = nx - px;
    const vy = ny - py;
    const tilt = opts.tilt ?? 0;
    const a = tilt ? Math.max(-tilt, Math.min(tilt, (Math.atan2(vy, Math.abs(vx) + 1e-3) * 180) / Math.PI * 0.5)) * Math.sign(vx || 1) : 0;
    const k = n > 1 ? i / (n - 1) : 0;
    const f: Keyframe = {
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${a.toFixed(1)}deg) scale(${(opts.scale?.(k) ?? 1).toFixed(3)})`,
    };
    if (opts.opacity) f.opacity = opts.opacity(k);
    if (opts.offsets) f.offset = opts.offsets[i];
    return f;
  });
}
