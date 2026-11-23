/**
 * 光と地面。島の焼き道具（`tools/sprites/render.html`）の「どう森の見え方」の5つに揃える:
 * 輪郭線なし／環境光をとても強く（半球 2.95）／陰はなだらか（主光 1.0・補助 0.14）／
 * 接地影を足もとから薄れる形で（影だけの光・ぼかし 14・芯 0.52 → 裾 0.26）／彩度と明度を高く。トーンは掛けない。
 *
 * 夕方は同じ組の色と強さを夕方の値へ混ぜる（灯りは強くなる）。
 */
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Euler,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cyl, paint, place, sph } from "./geo";

type Look = {
  sky: [string, string, string];
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  key: string;
  keyI: number;
  keyDir: [number, number, number];
  fill: string;
  fillI: number;
  glow: [number, number, number];
  bulb: [number, number, number];
  lamp: number;
  grass: string;
};

/** 昼: render.html の値そのまま（主光は左手前の上。車の右＝窓口の面が日なた、前が影） */
export const DAY: Look = {
  sky: ["#8fd0ff", "#c4ebff", "#effaff"],
  fog: "#e8f7ff",
  hemiSky: "#fff8ea",
  hemiGround: "#8f9080",
  hemi: 2.95,
  key: "#fff4dc",
  keyI: 1.0,
  keyDir: [-6, 10, 7],
  fill: "#eaf4ff",
  fillI: 0.14,
  glow: [1, 1, 1],
  bulb: [0.95, 0.93, 0.86],
  lamp: 0,
  grass: "#ffffff",
};

/** 夕方: 空は藤色から桃色、光は低く暖かく。灯りを強める */
export const DUSK: Look = {
  sky: ["#7072d6", "#f2a6bd", "#ffd8a6"],
  fog: "#ffd9bd",
  hemiSky: "#f4dcec",
  hemiGround: "#a596b0",
  hemi: 2.85,
  key: "#ffc59a",
  keyI: 0.95,
  keyDir: [-8, 6, 7],
  fill: "#c9c2ff",
  fillI: 0.24,
  glow: [1.9, 1.75, 1.45],
  bulb: [2.4, 2.05, 1.55],
  lamp: 2.4,
  grass: "#d6efcc",
};

/** 影の芯と裾（render.html の実測合わせ） */
const SHADOW_CORE = 0.52;
const SHADOW_EDGE = 0.26;

export type Stage = {
  hemi: HemisphereLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  sun: DirectionalLight;
  lamp: PointLight;
  ground: Mesh;
  shadow: Mesh;
  trees: InstancedMesh;
  bushes: InstancedMesh;
  sky: CanvasTexture;
  apply(t: number, glowMat: MeshBasicMaterial, bulbMat: MeshBasicMaterial): void;
  dispose(): void;
};

const cv = (w: number, h: number): HTMLCanvasElement => Object.assign(document.createElement("canvas"), { width: w, height: h });

export function buildStage(scene: Scene, propsMat: MeshLambertMaterial): Stage {
  const hemi = new HemisphereLight();
  const key = new DirectionalLight();
  const fill = new DirectionalLight();
  // 影だけの光（強さ 0）。陰の付き方と影の落ちる向きを別に決める
  const sun = new DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 14;
  sun.shadow.bias = -0.0009;
  const sc = sun.shadow.camera;
  sc.left = -5.5;
  sc.right = 5.5;
  sc.top = 5.5;
  sc.bottom = -5.5;
  sc.near = 0.1;
  sc.far = 40;
  // 地面の +x（画面の右下）へ影が出る向き: 光は -x 側の上（render.html と同じ比）
  sun.position.set(-2.3 * 4.6, 6.6 * 4.6, -0.42 * 4.6);
  sun.target.position.set(0, 0, 0);
  // 夕方の窓口の中の灯り（昼は 0）
  const lamp = new PointLight("#ffc98a", 0, 7, 1.6);
  lamp.position.set(-0.2, 2.0, 0.55);
  scene.add(hemi, key, fill, sun, sun.target, lamp);

  // 空: 縦の階調（4×256 の絵を背景に）
  const skyCanvas = cv(4, 256);
  const sky = new CanvasTexture(skyCanvas);
  sky.colorSpace = SRGBColorSpace;
  scene.background = sky;
  scene.fog = new Fog("#ffffff", 30, 85);

  // 地面: 黄みの草（島の草の実測 168,208,106 に寄せる）。小さな草の粒
  const g = cv(128, 128);
  const gc = g.getContext("2d")!;
  gc.fillStyle = "#a8d06a";
  gc.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    gc.fillStyle = i % 2 ? "#a0c963" : "#b2d778";
    gc.beginPath();
    gc.ellipse((i * 37) % 128, (i * 71 + ((i * i) % 29)) % 128, 3, 1.6, 0, 0, 7);
    gc.fill();
  }
  const grassTex = new CanvasTexture(g);
  grassTex.colorSpace = SRGBColorSpace;
  grassTex.wrapS = grassTex.wrapT = RepeatWrapping;
  grassTex.repeat.set(40, 40);
  grassTex.anisotropy = 4;
  const groundMat = new MeshLambertMaterial({ map: grassTex });
  const ground = new Mesh(new CircleGeometry(80, 48).rotateX(-Math.PI / 2), groundMat);
  ground.userData.ground = true;

  // 接地影を受ける板: 足もと（車の真ん中）が濃く、外へ薄れる。楕円で測る
  const foot = new Vector3(0.05, 0, 0);
  const spread = new Vector2(3.4, 1.9);
  const shadowMat = new ShadowMaterial({ opacity: SHADOW_CORE, color: 0x2f3d26 });
  shadowMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFoot = { value: foot };
    sh.uniforms.uSpread = { value: spread };
    sh.uniforms.uEdge = { value: SHADOW_EDGE };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGroundPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n\tvGroundPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGroundPos;\nuniform vec3 uFoot;\nuniform vec2 uSpread;\nuniform float uEdge;")
      .replace(
        "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );",
        [
          "float dFoot = length( ( vGroundPos.xz - uFoot.xz ) / uSpread );",
          "float fall = mix( 1.0, uEdge, smoothstep( 0.14, 1.0, dFoot ) );",
          "gl_FragColor = vec4( color, opacity * fall * ( 1.0 - getShadowMask() ) );",
        ].join("\n\t"),
      );
  };
  const shadow = new Mesh(new PlaneGeometry(16, 16).rotateX(-Math.PI / 2), shadowMat);
  shadow.position.y = 0.004;
  shadow.receiveShadow = true;
  shadow.userData.ground = true;
  scene.add(ground, shadow);

  // 木と茂み（遠くを囲む）。葉は島の実測（青みの緑）、幹は赤みの茶
  const _m = new Matrix4();
  const _q = new Quaternion();
  const _e = new Euler();
  const _s = new Vector3();
  const _p = new Vector3();
  const treeGeo = mergeGeometries([
    place(paint(cyl(0.2, 0.28, 1.8, 10), "#b0744a", [0, 0]), 0, 0.9),
    place(paint(sph(1.4, 14, 10), "#66bc78", [0, 0]), 0, 2.65, 0, 0, 0, 0, 1, 1.1, 1),
    place(paint(sph(0.85, 10, 8), "#7cc985", [0, 0]), 0.55, 3.35, 0.3),
  ]);
  const trees = new InstancedMesh(treeGeo, propsMat, 11);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.35;
    const r = 17 + ((i * 7) % 6);
    const s = 0.85 + ((i * 13) % 5) / 10;
    trees.setMatrixAt(i, _m.compose(_p.set(Math.cos(a) * r, 0, Math.sin(a) * r), _q.setFromEuler(_e.set(0, a * 3, 0)), _s.set(s, s, s)));
  }
  const bushGeo = paint(sph(1, 12, 8), "#86cf72", [0, 0]);
  const bushes = new InstancedMesh(bushGeo, propsMat, 10);
  for (let i = 0; i < 10; i++) {
    const a = 1.6 + i * 0.5;
    const r = 12.5 + (i % 3);
    const s = 0.6 + (i % 4) * 0.12;
    bushes.setMatrixAt(i, _m.compose(_p.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r), _q.identity(), _s.set(s * 1.3, s * 0.9, s * 1.3)));
  }
  scene.add(trees, bushes);

  const cA = new Color();
  const cB = new Color();
  const mixC = (a: string, b: string, t: number, out: Color) => out.lerpColors(cA.set(a), cB.set(b), t);
  const hex = (a: string, b: string, t: number) => "#" + mixC(a, b, t, new Color()).getHexString();
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const ctx = skyCanvas.getContext("2d")!;

  function apply(t: number, glowMat: MeshBasicMaterial, bulbMat: MeshBasicMaterial): void {
    mixC(DAY.hemiSky, DUSK.hemiSky, t, hemi.color);
    mixC(DAY.hemiGround, DUSK.hemiGround, t, hemi.groundColor);
    hemi.intensity = lerp(DAY.hemi, DUSK.hemi, t);
    mixC(DAY.key, DUSK.key, t, key.color);
    key.intensity = lerp(DAY.keyI, DUSK.keyI, t);
    key.position.set(...(DAY.keyDir.map((v, i) => lerp(v, DUSK.keyDir[i], t)) as [number, number, number]));
    mixC(DAY.fill, DUSK.fill, t, fill.color);
    fill.intensity = lerp(DAY.fillI, DUSK.fillI, t);
    fill.position.set(8, 3, -6);
    lamp.intensity = lerp(DAY.lamp, DUSK.lamp, t);
    mixC(DAY.fog, DUSK.fog, t, (scene.fog as Fog).color);
    mixC(DAY.grass, DUSK.grass, t, groundMat.color);
    glowMat.color.setRGB(...(DAY.glow.map((v, i) => lerp(v, DUSK.glow[i], t)) as [number, number, number]));
    bulbMat.color.setRGB(...(DAY.bulb.map((v, i) => lerp(v, DUSK.bulb[i], t)) as [number, number, number]));
    const gr = ctx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, hex(DAY.sky[0], DUSK.sky[0], t));
    gr.addColorStop(0.55, hex(DAY.sky[1], DUSK.sky[1], t));
    gr.addColorStop(1, hex(DAY.sky[2], DUSK.sky[2], t));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 4, 256);
    sky.needsUpdate = true;
  }

  return {
    hemi,
    key,
    fill,
    sun,
    lamp,
    ground,
    shadow,
    trees,
    bushes,
    sky,
    apply,
    dispose() {
      for (const m of [ground, shadow]) m.geometry.dispose();
      treeGeo.dispose();
      bushGeo.dispose();
      grassTex.dispose();
      sky.dispose();
      groundMat.dispose();
      shadowMat.dispose();
      sun.shadow.map?.dispose();
    },
  };
}

