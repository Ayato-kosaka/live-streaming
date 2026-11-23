/**
 * 撮る・測る口（`?still=1` のときだけ読む）。`tools/sprites/van3d.mjs` が `window.__van` から呼ぶ。
 * 数は画面の中で数える（絵を外へ運ばない）。面に字を出さない。
 */
import {
  Box3,
  Color,
  DoubleSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Raycaster,
  Texture,
  Vector3,
} from "three";
import D from "./dims.json";
import { setBreak, SHEETS, WHITE_UV, extUV } from "./uv";
import { HATCH, setback } from "./van";
import type { VanHandle, VanInternals } from "./scene";

type Img = { w: number; h: number; d: Uint8ClampedArray };

const S = D.scale;
const EXT = SHEETS.exterior;

/** 型の試しの絵: 区画ごとに色・前向きの矢印・前寄りを濃く（左右の取り違えと鏡写しを見分ける） */
export function testSkin(): HTMLCanvasElement {
  const [W, H] = EXT.size;
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, W, H);
  const col: Record<string, string> = { left: "#ff9f43", right: "#2e86de", front: "#10ac84", back: "#8e44ad", roof: "#e1b12c", valance: "#e84393" };
  for (const [name, r] of Object.entries(EXT.regions)) {
    if (name === "white") continue;
    const [rx, ry, rw, rh] = r as number[];
    x.fillStyle = col[name] ?? "#888";
    x.fillRect(rx, ry, rw, rh);
    // 前寄りの半分を濃く・格子・矢印（前へ）
    const side = name === "left" || name === "right" || name === "roof";
    x.fillStyle = "rgba(0,0,0,.25)";
    if (name === "left") x.fillRect(rx, ry, rw * 0.35, rh);
    else if (name === "right" || name === "roof") x.fillRect(rx + rw * 0.65, ry, rw * 0.35, rh);
    else if (name !== "valance") x.fillRect(rx, ry + rh * 0.6, rw * 0.5, rh * 0.4);
    x.strokeStyle = "rgba(255,255,255,.55)";
    x.lineWidth = 3;
    for (let gx = rx + 75; gx < rx + rw; gx += 75) {
      x.beginPath();
      x.moveTo(gx, ry);
      x.lineTo(gx, ry + rh);
      x.stroke();
    }
    for (let gy = ry + rh - 75; gy > ry; gy -= 75) {
      x.beginPath();
      x.moveTo(rx, gy);
      x.lineTo(rx + rw, gy);
      x.stroke();
    }
    if (side) {
      const dir = name === "left" ? -1 : 1;
      const cy = ry + rh / 2;
      const cx = rx + rw / 2;
      x.fillStyle = "#ffffff";
      x.beginPath();
      x.moveTo(cx + dir * 150, cy);
      x.lineTo(cx + dir * 60, cy - 50);
      x.lineTo(cx + dir * 60, cy - 18);
      x.lineTo(cx - dir * 150, cy - 18);
      x.lineTo(cx - dir * 150, cy + 18);
      x.lineTo(cx + dir * 60, cy + 18);
      x.lineTo(cx + dir * 60, cy + 50);
      x.closePath();
      x.fill();
    }
  }
  const wr = EXT.regions.white as number[];
  x.fillStyle = "#ffffff";
  x.fillRect(wr[0], wr[1], wr[2], wr[3]);
  return c;
}

/** 色だけの無地（光の検査用。白でも黒でもない明るい灰） */
export function flatSkin(hex = "#d9d4cc"): HTMLCanvasElement {
  const [W, H] = EXT.size;
  const c = Object.assign(document.createElement("canvas"), { width: W / 4, height: H / 4 });
  const x = c.getContext("2d")!;
  x.fillStyle = hex;
  x.fillRect(0, 0, c.width, c.height);
  const vr = (EXT.regions.valance as number[]).map((v) => v / 4);
  const n = D.valance.stripes.n;
  for (let i = 0; i < n; i++) {
    x.fillStyle = i % 2 ? "#ffffff" : "#e0574a";
    x.fillRect(vr[0] + (vr[2] * i) / n, vr[1] - 1, vr[2] / n + 0.5, vr[3] + 2);
  }
  const wr = (EXT.regions.white as number[]).map((v) => v / 4);
  x.fillStyle = "#ffffff";
  x.fillRect(wr[0] - 1, wr[1] - 1, wr[2] + 2, wr[3] + 2);
  return c;
}

function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = f(r);
  const G = f(g);
  const B = f(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116);
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
}
const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const luma = (d: Uint8ClampedArray, o: number) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];

function blur3(img: Img): Img {
  const { w, h, d } = img;
  const o = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 3; k++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += d[(yy * w + xx) * 4 + k];
            n++;
          }
        o[(y * w + x) * 4 + k] = s / n;
      }
  for (let i = 3; i < d.length; i += 4) o[i] = d[i];
  return { w, h, d: o };
}

export function attachProbe(h: VanHandle): void {
  const I = h.internals as VanInternals;
  const { renderer, scene, camera, van, inner, stage, skinMat } = I;
  const canvas = renderer.domElement;

  function grab(): Img {
    I.render();
    const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height });
    const x = c.getContext("2d")!;
    x.drawImage(canvas, 0, 0);
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
  }
  const dpr = () => canvas.width / (canvas.clientWidth || canvas.width);
  const toPx = (p: Vector3): [number, number] => {
    const v = p.clone().project(camera);
    return [((v.x + 1) / 2) * canvas.width, ((1 - v.y) / 2) * canvas.height];
  };
  const visibleMeshes = (root: Object3D): Mesh[] => {
    const out: Mesh[] = [];
    root.traverseVisible((o) => {
      if ((o as Mesh).isMesh) out.push(o as Mesh);
    });
    return out;
  };

  /** 見えている面の点か（光線が、その点の近くで最初に当たるか） */
  const rc = new Raycaster();
  function seen(p: Vector3, objs: Mesh[]): boolean {
    const d = p.clone().sub(camera.position);
    const len = d.length();
    rc.set(camera.position, d.normalize());
    rc.far = len + 1;
    const hit = rc.intersectObjects(objs, false)[0];
    return !!hit && hit.point.distanceTo(p) < 0.015;
  }

  /** 丸める前の平らな点 → 箱の表面の点（dims の箱と同じ丸め） */
  function onBox(x: number, y: number, z: number): Vector3 {
    const B = D.box;
    const C = [(B.x[0] + B.x[1]) / 2, (B.y[0] + B.y[1]) / 2, 0];
    const H = [(B.x[1] - B.x[0]) / 2, (B.y[1] - B.y[0]) / 2, B.hw];
    const p = [x - C[0], y - C[1], z - C[2]];
    const q = p.map((v, i) => Math.max(-(H[i] - B.r), Math.min(H[i] - B.r, v)));
    const d = p.map((v, i) => v - q[i]);
    const l = Math.hypot(d[0], d[1], d[2]);
    return new Vector3(...q.map((v, i) => C[i] + v + (d[i] / l) * B.r));
  }

  function meanLuma(img: Img, pts: [number, number][]): { mean: number; n: number } {
    let s = 0;
    let n = 0;
    for (const [px, py] of pts) {
      const x = Math.round(px);
      const y = Math.round(py);
      if (x < 1 || y < 1 || x >= img.w - 1 || y >= img.h - 1) continue;
      let a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += luma(img.d, ((y + dy) * img.w + x + dx) * 4);
      s += a / 9;
      n++;
    }
    return { mean: n ? s / n : NaN, n };
  }

  /** 光の検査: 日なたの面（右）の上20%と下20%、日なたと影（前）の真ん中の帯。いまの外装で測る */
  function light() {
    I.setView("day");
    const img = grab();
    const objs = visibleMeshes(scene);
    const Y = EXT.span.y;
    const band = (t0: number, t1: number, xs: number[]) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++)
        for (let j = 0; j <= 6; j++) {
          const x = xs[0] + ((xs[1] - xs[0]) * i) / 24;
          const y = Y[0] + (Y[1] - Y[0]) * (t0 + ((t1 - t0) * j) / 6);
          const p = onBox(x, y, D.box.hw);
          if (seen(p, objs)) pts.push(toPx(p));
        }
      return pts;
    };
    const top = meanLuma(img, band(0.8, 0.995, [-1.9, 0.55]));
    const bottom = meanLuma(img, band(0.005, 0.2, [-0.9, 0.55]));
    const sunMid = meanLuma(img, band(0.4, 0.6, [-1.9, -1.1]));
    // 前（運転席の鼻先）の真ん中の帯: 灯りと格子を避ける
    const front: [number, number][] = [];
    for (let i = 0; i <= 16; i++)
      for (let j = 0; j <= 4; j++) {
        const z = -0.3 + (0.6 * i) / 16;
        const y = 1.05 + (0.15 * j) / 4;
        const p = new Vector3(D.cab.x[1], y, z);
        if (seen(p, objs)) front.push(toPx(p));
      }
    const shade = meanLuma(img, front);
    return {
      top: +top.mean.toFixed(1),
      bottom: +bottom.mean.toFixed(1),
      n: [top.n, bottom.n],
      bottomOverTop: +(bottom.mean / top.mean).toFixed(3),
      sun: +sunMid.mean.toFixed(1),
      shade: +shade.mean.toFixed(1),
      nShade: [sunMid.n, shade.n],
      shadeOverSun: +(shade.mean / sunMid.mean).toFixed(3),
    };
  }

  /** 横から見た長さ÷高さ（閉じた姿の影絵の外枠）と、運転席の段 */
  function shape() {
    const keep = new Map<Object3D, boolean>();
    const hide = [stage.ground, stage.shadow, stage.trees, stage.bushes, inner.group];
    for (const o of hide) {
      keep.set(o, o.visible);
      o.visible = false;
    }
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = new Color("#ff00ff");
    scene.fog = null;
    const cam = new OrthographicCamera(-3.2, 3.2, 3.2 * (canvas.height / canvas.width), -3.2 * (canvas.height / canvas.width), 0.1, 40);
    cam.position.set(0, 1.3, 20);
    cam.lookAt(0, 1.3, 0);
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const c = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height });
    const x = c.getContext("2d")!;
    x.drawImage(canvas, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9;
    let x1 = -1;
    let y0 = 1e9;
    let y1 = -1;
    for (let yy = 0; yy < c.height; yy++)
      for (let xx = 0; xx < c.width; xx++) {
        const o = (yy * c.width + xx) * 4;
        const mag = d[o] > 230 && d[o + 1] < 40 && d[o + 2] > 230;
        if (mag) continue;
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
    const mPerPx = 6.4 / c.width;
    scene.background = bg;
    scene.fog = fog;
    for (const [o, v] of keep) o.visible = v;
    // 塊の屋根の高さ: 真上から光線を落として、屋根の面に当たる高さ（換気口を避けた点）
    const down = (x0: number, z0: number) => {
      rc.set(new Vector3(x0, 10, z0), new Vector3(0, -1, 0));
      rc.far = 20;
      const hit = rc.intersectObjects([van.bodyPeek], false)[0];
      return hit ? hit.point.y : NaN;
    };
    const boxTop = down(-1.8, 0.4);
    const cabTop = down((D.box.x[1] + D.cab.x[1] - 0.6) / 2, 0.4);
    const len = (x1 - x0 + 1) * mPerPx;
    const hgt = (y1 - y0 + 1) * mPerPx;
    const bb = new Box3();
    for (const m of visibleMeshes(van.group)) bb.expandByObject(m);
    return {
      length: +len.toFixed(3),
      height: +hgt.toFixed(3),
      ratio: +(len / hgt).toFixed(3),
      bodyRatio: +(len / (D.box.y[1] - 0)).toFixed(3),
      boxTop: +boxTop.toFixed(3),
      cabTop: +cabTop.toFixed(3),
      step: +(boxTop - cabTop).toFixed(3),
      rake: D.cab.rake,
      bbox: [+(bb.max.x - bb.min.x).toFixed(3), +(bb.max.y - bb.min.y).toFixed(3), +(bb.max.z - bb.min.z).toFixed(3)],
    };
  }

  /** 開いた庇の厚み（画面の px）と、垂れの縞の色（いまの向き・いまの外装で） */
  function awning() {
    const img = grab();
    van.awning.updateMatrixWorld(true);
    const a = new Vector3(0, -(HATCH.y[2] - HATCH.y[1]), 0).applyMatrix4(van.awning.matrixWorld);
    const b = new Vector3(0, -(HATCH.y[2] - HATCH.y[1]), -D.hatch.awning).applyMatrix4(van.awning.matrixWorld);
    const pa = toPx(a);
    const pb = toPx(b);
    const thick = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    // 垂れの舌の真ん中を、画面の色で拾う
    const kind = I.look()?.valance === "noren" ? "noren" : "stripes";
    const V = kind === "noren" ? D.valance.noren : D.valance.stripes;
    const n = V.n;
    const w = HATCH.len / n;
    van.valance.updateMatrixWorld(true);
    const cols: number[][] = [];
    const objs = visibleMeshes(scene);
    for (let i = 0; i < n; i++) {
      const p = new Vector3(-HATCH.len / 2 + (i + 0.5) * w, -V.h * 0.4, 0.013).applyMatrix4(van.valance.matrixWorld);
      if (!seen(p, objs)) continue;
      const [x, y] = toPx(p).map(Math.round);
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const o = (y * img.w + x) * 4;
      cols.push([img.d[o], img.d[o + 1], img.d[o + 2]]);
    }
    // 色を ΔE 12 でまとめる
    const groups: { lab: number[]; n: number; rgb: number[] }[] = [];
    for (const c of cols) {
      const L = lab(c[0], c[1], c[2]);
      const g = groups.find((q) => dE(q.lab, L) < 12);
      if (g) g.n++;
      else groups.push({ lab: L, n: 1, rgb: c });
    }
    const big = groups.filter((g) => g.n >= 2);
    return {
      thickPx: +thick.toFixed(1),
      dpr: +dpr().toFixed(2),
      size: [canvas.width, canvas.height],
      stripes: cols.length,
      colors: big.map((g) => "#" + g.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")),
      twoColors: big.length >= 2,
    };
  }

  /** 型の検査: 面を正射影で、型の 1px ＝ 画面の 1px で撮り、絵の区画と色差を比べる（光を当てない） */
  function ortho(face: "left" | "right" | "front" | "back" | "roof", src: HTMLCanvasElement) {
    const tex = (skinMat.map as Texture | null) ?? null;
    const check = new MeshBasicMaterial({ map: tex, side: DoubleSide, toneMapped: false });
    check.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <map_fragment>",
        `if ( distance( vMapUv, vec2( ${WHITE_UV[0].toFixed(6)}, ${WHITE_UV[1].toFixed(6)} ) ) < 1e-4 ) discard;\n#include <map_fragment>`,
      );
    };
    const meshes: Mesh[] = [van.body, van.bodyPeek, van.awningMesh, van.shelfMesh];
    const mats = new Map<Mesh, Material | Material[]>();
    const vis = new Map<Object3D, boolean>();
    scene.traverse((o) => {
      vis.set(o, o.visible);
    });
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.visible = meshes.includes(o as Mesh);
    });
    for (const m of meshes) {
      mats.set(m, m.material);
      m.material = check;
      m.visible = true;
    }
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = new Color("#ff00ff");
    scene.fog = null;
    const R = D.box.r;
    const X = EXT.span.x;
    const Y = EXT.span.y;
    const Z = EXT.span.z;
    const span = (a: number[]) => [a[0] + R, a[1] - R];
    // 型で「使わない」所は比べない: 屋根の前の窓より前・前の面の運転席の屋根の丸み（ここは前の窓と屋根の区画が出る）
    const cabRoofFront = D.cab.x[1] - setback(D.cab.y[1]) - D.cab.r;
    let ha: number[];
    let hb: number[];
    if (face === "front" || face === "back") {
      ha = span(Z);
      hb = face === "front" ? [Y[0] + R, D.cab.y[1] - D.cab.r] : span(Y);
    } else if (face === "roof") {
      ha = [X[0] + R, cabRoofFront];
      hb = span(Z);
    } else {
      ha = span(X);
      hb = span(Y);
    }
    const w = Math.round((ha[1] - ha[0]) * S);
    const hgt = Math.round((hb[1] - hb[0]) * S);
    const pr = renderer.getPixelRatio();
    const size = { w: canvas.clientWidth, h: canvas.clientHeight };
    renderer.setPixelRatio(1);
    renderer.setSize(w, hgt, false);
    const cam = new OrthographicCamera(-(ha[1] - ha[0]) / 2, (ha[1] - ha[0]) / 2, (hb[1] - hb[0]) / 2, -(hb[1] - hb[0]) / 2, 0.1, 40);
    const ca = (ha[0] + ha[1]) / 2;
    const cb = (hb[0] + hb[1]) / 2;
    if (face === "right") cam.position.set(ca, cb, 10);
    if (face === "left") cam.position.set(ca, cb, -10);
    if (face === "front") cam.position.set(10, cb, ca);
    if (face === "back") cam.position.set(-10, cb, ca);
    if (face === "roof") {
      cam.position.set(ca, 10, cb);
      cam.up.set(0, 0, -1);
    }
    cam.lookAt(face === "roof" ? new Vector3(ca, 0, cb) : face === "front" || face === "back" ? new Vector3(0, cb, ca) : new Vector3(ca, cb, 0));
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const c = Object.assign(document.createElement("canvas"), { width: w, height: hgt });
    const x = c.getContext("2d")!;
    x.drawImage(canvas, 0, 0, w, hgt, 0, 0, w, hgt);
    const shot: Img = { w, h: hgt, d: x.getImageData(0, 0, w, hgt).data };
    // 区画の同じところ（丸い角の帯と、使わない所を除く）
    const r = EXT.regions[face] as number[];
    const rx = Math.round(r[0] + R * S);
    const ry = Math.round(face === "front" ? r[1] + (Y[1] - hb[1]) * S : r[1] + R * S);
    const sc = Object.assign(document.createElement("canvas"), { width: w, height: hgt });
    const sx = sc.getContext("2d")!;
    sx.drawImage(src, rx, ry, w, hgt, 0, 0, w, hgt);
    const ref: Img = { w, h: hgt, d: sx.getImageData(0, 0, w, hgt).data };
    const A = blur3(shot);
    const B = blur3(ref);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < w * hgt; i++) {
      const o = i * 4;
      const s = shot.d;
      if (s[o] > 230 && s[o + 1] < 40 && s[o + 2] > 230) continue;
      // 縁の 1px（影絵の境）は数えない
      const px = i % w;
      const py = Math.floor(i / w);
      let edge = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = px + dx;
        const yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= hgt) continue;
        const q = (yy * w + xx) * 4;
        if (s[q] > 230 && s[q + 1] < 40 && s[q + 2] > 230) edge = true;
      }
      if (edge) continue;
      sum += dE(lab(A.d[o], A.d[o + 1], A.d[o + 2]), lab(B.d[o], B.d[o + 1], B.d[o + 2]));
      n++;
    }
    // 戻す
    scene.background = bg;
    scene.fog = fog;
    for (const [m, mat] of mats) m.material = mat;
    for (const [o, v] of vis) o.visible = v;
    check.dispose();
    renderer.setPixelRatio(pr);
    renderer.setSize(size.w, size.h, false);
    I.render();
    return { de: +(sum / Math.max(1, n)).toFixed(2), cover: +(n / (w * hgt)).toFixed(3), size: [w, hgt], shot: c.toDataURL("image/png") };
  }

  function stats() {
    renderer.shadowMap.needsUpdate = true;
    renderer.info.autoReset = true;
    I.render();
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? 0 };
  }

  const testCanvas = testSkin();
  const w = window as unknown as Record<string, unknown>;
  w.__van = {
    stats,
    light,
    shape,
    awning,
    ortho: (face: "left" | "right" | "front" | "back" | "roof") => ortho(face, testCanvas),
    view: (name: string) => I.setView(name),
    skin: async (kind: string) => {
      if (kind === "test") await I.setSkin(testCanvas);
      else if (kind === "flat") await I.setSkin(flatSkin());
      else await I.setSkin(kind);
      I.render();
    },
    mirror: async (on: boolean) => {
      setBreak(on ? "mirror" : "");
      // UV を引き直すには形を作り直す。外装だけ（窓口の扉も）
      const { buildVan } = await import("./van");
      const parent = van.group.parent!;
      const next = buildVan(skinMat, (van.glow.material as MeshBasicMaterial), (van.bulbs.material as MeshBasicMaterial));
      parent.remove(van.group);
      van.dispose();
      parent.add(next.group);
      Object.assign(van, next);
      I.render();
    },
    testPng: () => testCanvas.toDataURL("image/png"),
    webp: (q = 0.82) => {
      I.render();
      return canvas.toDataURL("image/webp", q);
    },
    idle: () => I.idle(),
    uvAt: (face: "left" | "right", x: number, y: number) => extUV(face, x, y, face === "right" ? D.box.hw : -D.box.hw),
  };
}
