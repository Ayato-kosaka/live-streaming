/**
 * キッチンカーの 3D の場面。`mountVan(canvas, state, options) → { update, dispose, ready }`。
 *
 * - React は札だけ持つ。場面の状態はここの変数で持ち、毎コマ setState しない
 * - 動いたときだけ描く（窓口・夕方・のぞく・回す・絵を読み終えた）。影は形が変わったときだけ焼き直す
 * - 回すのは横の指だけ（縦はページ送り。`touch-action: pan-y` は呼ぶ側の CSS）。寄らない
 * - 倍率は 2 まで。スマホは外装の 1024 版
 * - WebGL の文脈は呼ぶ側が先に作って渡す（無ければ呼ばない。ここで投げない・console.error を出さない）
 */
import {
  CanvasTexture,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import D from "./dims.json";
import { buildInterior, checkOrder, DEFAULT_ORDER } from "./interior";
import { buildStage } from "./light";
import { SHEETS } from "./uv";
import { buildVan } from "./van";

export type VanColors = { body: string; accent: string; awning: string[] };
export type VanLook = {
  id: string;
  /** 外装の絵（1536×1024）。無ければ色だけの無地 */
  exterior?: string;
  exterior1024?: string;
  interior?: string;
  colors?: VanColors;
  valance?: string;
};
export type VanState = { look: string; open: boolean; dusk: boolean; peek: boolean; order: string[] };
export type VanOptions = {
  gl: WebGL2RenderingContext;
  looks: VanLook[];
  /** 撮るための開きかた（動かさずに、その姿で止める） */
  still?: boolean;
  /** 撮るときの向き（day・open・dusk・peek・front・side） */
  view?: string;
  small?: boolean;
  reduced?: boolean;
  onReady?: () => void;
  onLost?: () => void;
};
export type VanHandle = {
  update(next: Partial<VanState>): void;
  dispose(): void;
  ready: Promise<void>;
  /** 撮る口（still のときだけ）。場面の中身を probe.ts が読む */
  internals?: VanInternals;
};
export type VanInternals = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  van: ReturnType<typeof buildVan>;
  inner: ReturnType<typeof buildInterior>;
  stage: ReturnType<typeof buildStage>;
  skinMat: MeshLambertMaterial;
  innerMat: MeshLambertMaterial;
  setView(name: string): void;
  setSkin(src: string | HTMLCanvasElement | null, kind?: "exterior" | "interior"): Promise<void>;
  setValance(kind: string): void;
  render(): void;
  idle(): boolean;
  look(): VanLook | undefined;
};

const DEG = Math.PI / 180;
/** 撮る向き: [方位°, 仰角°, 収まりの余白]。方位 0 が真正面、90 が窓口の横 */
export const VIEWS: Record<string, [number, number, number]> = {
  day: [38, 14, 0.8],
  open: [56, 12, 0.86],
  dusk: [50, 12, 0.86],
  peek: [-90, 54, 0.86],
  front: [38, 14, 0.8],
  side: [90, 4, 0.86],
};

const cv = (w: number, h: number): HTMLCanvasElement => Object.assign(document.createElement("canvas"), { width: w, height: h });

/** 色だけの無地の外装（絵が届く前・絵の無い組）。白い区画と、庇の垂れの縞を塗る */
export function plainSkin(colors: VanColors | undefined, kind: "exterior" | "interior"): HTMLCanvasElement {
  const sheet = kind === "exterior" ? SHEETS.exterior : SHEETS.interior;
  const [W, H] = sheet.size;
  const k = 4; // 無地なので小さく持つ（UV は割合なので大きさに依らない）
  const c = cv(W / k, H / k);
  const x = c.getContext("2d")!;
  x.fillStyle = kind === "exterior" ? colors?.body ?? "#f3eee4" : "#fbf4e6";
  x.fillRect(0, 0, c.width, c.height);
  const r = (name: string) => (sheet.regions[name] as number[]).map((v) => v / k);
  const wr = r("white");
  x.fillStyle = "#ffffff";
  x.fillRect(wr[0] - 1, wr[1] - 1, wr[2] + 2, wr[3] + 2);
  if (kind === "exterior") {
    const vr = r("valance");
    const aw = colors?.awning?.length ? colors.awning : [colors?.accent ?? "#e0574a", "#ffffff"];
    // 舌1枚に1色（縞は舌ごとに交互）
    const n = D.valance.stripes.n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = aw[i % 2];
      x.fillRect(vr[0] + (vr[2] * i) / n, vr[1] - 1, vr[2] / n + 0.5, vr[3] + 2);
    }
  }
  return c;
}

export function mountVan(canvas: HTMLCanvasElement, state: VanState, opts: VanOptions): VanHandle {
  const renderer = new WebGLRenderer({ canvas, context: opts.gl, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 4 / 3, 0.1, 200);
  const skinMat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const innerMat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const propsMat = new MeshLambertMaterial({ vertexColors: true });
  const glowMat = new MeshBasicMaterial({ vertexColors: true });
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff });
  const stage = buildStage(scene, propsMat);
  const root = new Group();
  const van = buildVan(skinMat, glowMat, bulbMat);
  const order0 = checkOrder(state.order) === "" ? state.order : DEFAULT_ORDER;
  const inner = buildInterior(innerMat, order0);
  root.add(van.group, inner.group);
  scene.add(root);

  // ---- 状態 ----
  const cur = { open: state.open ? 1 : 0, eve: state.dusk ? 1 : 0 };
  const goal = { open: cur.open, eve: cur.eve };
  let peek = state.peek;
  let order = order0;
  let lookId = state.look;
  let az = VIEWS.day[0] * DEG;
  let el = VIEWS.day[1] * DEG;
  let fit = VIEWS.day[2];
  let flight: null | { t: number; az0: number; el0: number; az1: number; el1: number; f0: number; f1: number } = null;
  let vel = 0;
  let dragging = false;
  let raf = 0;
  let dead = false;
  let disposing = false;
  const reduced = !!opts.reduced || !!opts.still;
  const textures: Record<string, Texture | null> = { exterior: null, interior: null };
  const loader = new TextureLoader();

  // ---- 絵 ----
  const findLook = (id: string) => opts.looks.find((l) => l.id === id) ?? opts.looks[0];
  function useTexture(kind: "exterior" | "interior", tex: Texture): void {
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = kind === "exterior" ? skinMat : innerMat;
    mat.map = tex;
    mat.needsUpdate = true;
    textures[kind]?.dispose();
    textures[kind] = tex;
  }
  function loadTex(src: string): Promise<Texture | null> {
    return new Promise((res) => {
      loader.load(
        src,
        (t) => res(t),
        undefined,
        () => res(null),
      );
    });
  }
  async function setSkin(src: string | HTMLCanvasElement | null, kind: "exterior" | "interior" = "exterior"): Promise<void> {
    const L = findLook(lookId);
    let tex: Texture | null = null;
    if (src instanceof HTMLCanvasElement) tex = new CanvasTexture(src);
    else if (src) tex = await loadTex(src);
    if (!tex) tex = new CanvasTexture(plainSkin(L?.colors, kind));
    if (dead) {
      tex.dispose();
      return;
    }
    useTexture(kind, tex);
    invalidate();
  }
  async function applyLook(id: string): Promise<void> {
    lookId = id;
    const L = findLook(id);
    van.setValance(L?.valance ?? "stripes");
    van.setColors(L?.colors?.body ?? "#ffffff", "#fff3d6");
    const ext = opts.small && L?.exterior1024 ? L.exterior1024 : L?.exterior;
    await Promise.all([setSkin(ext ?? null, "exterior"), setSkin(L?.interior ?? null, "interior")]);
    if (lookId !== id) return;
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  // ---- 動き ----
  function applyOpen(a: number): void {
    van.setOpen(a);
    renderer.shadowMap.needsUpdate = true;
  }
  function applyEve(t: number): void {
    stage.apply(t, glowMat, bulbMat);
  }
  function applyPeek(v: boolean): void {
    root.traverse((o) => {
      if (o.userData.peek) o.visible = !v;
    });
    renderer.shadowMap.needsUpdate = true;
  }

  // 車が収まる距離（試しと同じ: 角の点が画面の ±fit に入る一番近い距離）
  const center = new Vector3();
  const dir = new Vector3();
  const pts: Vector3[] = [];
  const tmp = new Vector3();
  function bounds(): void {
    pts.length = 0;
    const zr = cur.open > 0.01 ? 2.15 : 1.2;
    for (const x of [-2.42, 2.42]) for (const y of [0, 2.7]) for (const z of [-1.2, zr]) pts.push(new Vector3(x, y, z));
    center.set(0, 1.15, cur.open > 0.01 ? 0.4 : 0);
  }
  function place(a: number, e: number, f: number): void {
    bounds();
    dir.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
    let lo = 3;
    let hi = 60;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      camera.position.copy(center).addScaledVector(dir, m);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const ok = pts.every((p) => {
        tmp.copy(p).project(camera);
        return Math.abs(tmp.x) <= f && Math.abs(tmp.y) <= f && tmp.z < 1;
      });
      if (ok) hi = m;
      else lo = m;
    }
    camera.position.copy(center).addScaledVector(dir, hi);
    camera.lookAt(center);
    camera.updateMatrixWorld();
  }
  function flyTo(name: string): void {
    const v = VIEWS[name] ?? VIEWS.day;
    let a1 = v[0] * DEG;
    // 近い向きへ回る
    while (a1 - az > Math.PI) a1 -= Math.PI * 2;
    while (a1 - az < -Math.PI) a1 += Math.PI * 2;
    if (reduced) {
      az = a1;
      el = v[1] * DEG;
      fit = v[2];
      flight = null;
      return;
    }
    flight = { t: 0, az0: az, el0: el, az1: a1, el1: v[1] * DEG, f0: fit, f1: v[2] };
  }

  let last = 0;
  function frame(now: number): void {
    raf = 0;
    if (dead) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    for (const k of ["open", "eve"] as const) {
      const d = goal[k] - cur[k];
      if (!d) continue;
      moving = true;
      const step = dt / (k === "open" ? 0.6 : 0.9);
      cur[k] = Math.abs(d) <= step ? goal[k] : cur[k] + Math.sign(d) * step;
      if (k === "open") applyOpen(cur.open);
      else applyEve(cur.eve);
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.0);
      const t = flight.t;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      az = flight.az0 + (flight.az1 - flight.az0) * e;
      el = flight.el0 + (flight.el1 - flight.el0) * e;
      fit = flight.f0 + (flight.f1 - flight.f0) * e;
      if (t >= 1) flight = null;
      moving = true;
    } else if (!dragging && Math.abs(vel) > 0.0004) {
      az += vel;
      vel *= Math.pow(0.9, dt * 60);
      moving = true;
    }
    place(az, el, fit);
    renderer.render(scene, camera);
    if (moving || dragging) invalidate();
    else last = 0;
  }
  function invalidate(): void {
    if (!raf && !dead) raf = requestAnimationFrame(frame);
  }

  // ---- 大きさ ----
  function resize(): void {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);

  // ---- 横の指で回す ----
  let px = 0;
  let pid = -1;
  let lastMove = 0;
  const onDown = (e: PointerEvent) => {
    if (opts.still || (e.pointerType === "mouse" && e.button !== 0)) return;
    pid = e.pointerId;
    px = e.clientX;
    dragging = true;
    vel = 0;
    lastMove = performance.now();
    flight = null;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pid) return;
    const w = canvas.clientWidth || 400;
    const d = ((e.clientX - px) / w) * Math.PI;
    px = e.clientX;
    az -= d;
    const t = performance.now();
    vel = -d * Math.min(1, 16 / Math.max(1, t - lastMove));
    lastMove = t;
    if (Math.abs(d) > 0) {
      try {
        if (!canvas.hasPointerCapture(pid)) canvas.setPointerCapture(pid);
      } catch {
        /* 取れなくても回す */
      }
    }
    invalidate();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    dragging = false;
    pid = -1;
    if (performance.now() - lastMove > 80) vel = 0;
    invalidate();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  const onLost = (e: Event) => {
    e.preventDefault();
    if (disposing) return;
    dead = true;
    opts.onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  // ---- 始める ----
  applyOpen(cur.open);
  applyEve(cur.eve);
  applyPeek(peek);
  if (opts.still && opts.view) {
    const v = VIEWS[opts.view] ?? VIEWS.day;
    az = v[0] * DEG;
    el = v[1] * DEG;
    fit = v[2];
  } else if (peek) {
    const v = VIEWS.peek;
    az = v[0] * DEG;
    el = v[1] * DEG;
    fit = v[2];
  }
  resize();
  const ready = applyLook(lookId).then(
    () =>
      new Promise<void>((res) => {
        if (dead) return res();
        renderer.shadowMap.needsUpdate = true;
        place(az, el, fit);
        renderer.render(scene, camera);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!dead) {
              renderer.render(scene, camera);
              opts.onReady?.();
            }
            res();
          }),
        );
      }),
  );

  function update(next: Partial<VanState>): void {
    if (dead) return;
    if (next.open !== undefined) goal.open = next.open ? 1 : 0;
    if (next.dusk !== undefined) goal.eve = next.dusk ? 1 : 0;
    if (reduced) {
      if (cur.open !== goal.open) applyOpen((cur.open = goal.open));
      if (cur.eve !== goal.eve) applyEve((cur.eve = goal.eve));
    }
    if (next.peek !== undefined && next.peek !== peek) {
      peek = next.peek;
      applyPeek(peek);
      flyTo(peek ? "peek" : "day");
    }
    if (next.order && next.order.join() !== order.join() && checkOrder(next.order) === "") {
      order = [...next.order];
      inner.setOrder(order);
      renderer.shadowMap.needsUpdate = true;
    }
    if (next.look && next.look !== lookId) void applyLook(next.look);
    invalidate();
  }

  function dispose(): void {
    if (disposing) return;
    disposing = true;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    ro?.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    van.dispose();
    inner.dispose();
    stage.dispose();
    for (const t of Object.values(textures)) t?.dispose();
    for (const m of [skinMat, innerMat, propsMat, glowMat, bulbMat]) m.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.removeEventListener("webglcontextlost", onLost);
  }

  const handle: VanHandle = { update, dispose, ready };
  if (opts.still) {
    handle.internals = {
      renderer,
      scene,
      camera,
      van,
      inner,
      stage,
      skinMat,
      innerMat,
      setView(name: string) {
        const v = VIEWS[name] ?? VIEWS.day;
        az = v[0] * DEG;
        el = v[1] * DEG;
        fit = v[2];
        flight = null;
        place(az, el, fit);
        renderer.render(scene, camera);
      },
      setSkin,
      setValance: (k: string) => {
        van.setValance(k);
        renderer.shadowMap.needsUpdate = true;
      },
      render() {
        place(az, el, fit);
        renderer.render(scene, camera);
      },
      idle: () => cur.open === goal.open && cur.eve === goal.eve && !flight,
      look: () => findLook(lookId),
    };
  }
  return handle;
}

