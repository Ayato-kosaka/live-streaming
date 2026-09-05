"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import MAP from "@/content/atlas/route.json";
import { peakPaths } from "./peak";
import { chrome, NOMINAL_W, overlap, placeCities, type Rect } from "./labels";
import { clump, type Spot } from "./clump";
import { Compass } from "./art";
import { bucket } from "./dots";
import { COUNTRIES } from "@/content/countries";
import Flag from "@/components/ui/Flag";
// 印はブラウザまで運ぶぶんの表から取る。`Icon.tsx` を読むと 223種 174KB が
// まるごと束に入る（`components/ui/IconCore.tsx` の注）。
import Icon from "@/components/ui/IconCore";

/**
 * パリからジョージアまでの1枚の地図。
 *
 * 形は本物。Natural Earth の海岸線をメルカトルで投影して焼いてある
 * （`python/build_world_route.py`）。塗りは島とそろえていて、
 * 輪郭線を引かず、浅瀬・泡・砂の帯で陸と海を分ける。
 *
 * 座標はぜんぶスクリプトが計算ずみ。ここで経度緯度から座標を作らないこと。
 *
 * ## 寄せかたの作り
 *
 * 地形は1枚の `<g>` に入れて CSS の transform で寄せる。
 * 国のピンと街の名前は SVG ではなく **HTML** で地図の上に重ねている。
 * SVG の文字にすると、世界ぜんぶを 360px に収めたときに
 * 8px 以下になって読めない。HTML なら寄せても文字の大きさが変わらない。
 *
 * 線の太さと点の大きさは `1/k` を掛けて、寄せても見た目が変わらないようにする。
 */

type Chapter = { id: string; label: string; box: number[] };

/** 凡例に出す移動のしかた。多い順に並べる。 */
const LEGEND: [string, string][] = [
  ["land", "電車・バス"],
  ["air", "飛行機"],
  ["sea", "船"],
  ["walk", "歩いた"],
  ["hitch", "ヒッチハイク"],
  // 「日帰り」だけだと、隣に出る距離の合計が何の数字か通じない。
  // 拠点から出て戻ってきた往復ぶん、と読める言い方にする。
  ["side", "近くまで往復"],
];

/**
 * 国の名札の逃がし先 [左右, 上下]。上に置くのを本命に、順に空きを探す。
 *
 * **遠くへ逃がさない。** 前は ±48px・下70px まで飛ばしていて、
 * 「イギリス」がスコットランドの街の下に、「オーストリア」が
 * イタリアの上に出ていた。どのピンの名前なのか分からなくなるくらいなら、
 * 名前を出さないほうがいい（出さない判断は下の hide）。
 */
const PIN_SLOTS: [number, number][] = [
  [0, 0], [-28, 0], [28, 0], [0, 26], [-28, 26], [28, 26], [0, -20],
];

type City = { id: string; name: string; x: number; y: number; country: string; kind: string };

const W = MAP.view.w;
const H = MAP.view.h;

/** 移動のしかたごとの線。歩いた線がいちばん目立つ。 */
const MOVE: Record<string, { c: string; w: number; dash?: string; cap?: "round" | "butt" }> = {
  land: { c: "var(--am-route)", w: 6.5 },
  air: { c: "#ffffff", w: 4.4, dash: "1 15", cap: "round" },
  sea: { c: "#ffffff", w: 4.4, dash: "1 11", cap: "round" },
  walk: { c: "var(--am-walk)", w: 8.5, dash: "0.5 13", cap: "round" },
  hitch: { c: "var(--am-hitch)", w: 6, dash: "13 11", cap: "round" },
  side: { c: "var(--am-side)", w: 5, dash: "2 9", cap: "round" },
};

/** 移動のしかたごとの距離(km)。スクリプトが大円距離で出したもの。 */
const moved = MAP.moved as Record<string, number>;

const WOODS = bucket(MAP.woods, 3);
const DUNES = bucket(MAP.dunes, 2);
const GLINTS = bucket(MAP.glints, 2);

/**
 * 旅の順。初めて入った順に並べたもの。
 *
 * 地図に置き場（anchors）のある国だけにする。置き場が無い国をたどりに
 * 入れると、寄せる枠が無いところで地図が世界全図に戻って、
 * 札だけが入れ替わる。**たどりが止まって見える。**
 */
const TRIP = [...COUNTRIES]
  .filter((c) => c.slug in (MAP.anchors as Record<string, unknown>))
  .sort((a, b) => a.order - b.order);

/**
 * 国ひとつぶんの寄り枠。
 *
 * その国のピンと、その国で通った街が全部入る枠を作って、
 * **地図と同じ縦横比まで広げる。** 比を合わせないと、寄せたときに
 * 上下か左右がはみ出して切れる（章の枠と同じ決まり）。
 *
 * 街が1つしか無い国（ベルギー、アラブ首長国連邦）でそのまま寄せると、
 * 点1つに張りついて「どこの国か」が分からなくなる。まわりの地形が
 * 見える程度の下限（幅 250）を置く。
 */
const RATIO = W / H;

/**
 * 押しどころの一辺（px）。`atlas.css` の `.apin` と対になっている。
 * 720px から上では CSS が 56px にするので、こちらも合わせる。
 * **片方だけ動かさない。** たたむ判断がこの数で決まっている。
 */
const PIN_SM = 48;
const PIN_LG = 56;
/** 隣とのあいだに置く余白。0 だと箱が縁で触れて、境目の1pxが取り合いになる。 */
const PIN_GAP = 2;
/** まとまりの札の幅。「18カ国」が入る幅で、`atlas.css` の `.apin-many` と対。 */
const GROUP_W = 56;
const FIT: Record<string, number[]> = (() => {
  const out: Record<string, number[]> = {};
  const cities = MAP.cities as { country: string; x: number; y: number }[];
  for (const [slug, a] of Object.entries(
    MAP.anchors as Record<string, { x: number; y: number }>,
  )) {
    const pts = [[a.x, a.y], ...cities.filter((c) => c.country === slug).map((c) => [c.x, c.y])];
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    let w = Math.max(250, (Math.max(...xs) - Math.min(...xs)) * 1.9);
    let h = Math.max(250 / RATIO, (Math.max(...ys) - Math.min(...ys)) * 1.9);
    if (w / h < RATIO) w = h * RATIO;
    else h = w / RATIO;
    // 世界より大きくは寄せられない
    if (w > W) { w = W; h = H; }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    out[slug] = [
      Math.max(0, Math.min(W - w, cx - w / 2)),
      Math.max(0, Math.min(H - h, cy - h / 2)),
      w,
      h,
    ];
  }
  return out;
})();

const ymd = (d: string) => (d ? d.replace(/-/g, "/") : "");

export default function WorldRoute({ here = "georgia" }: { here?: string }) {
  const [chap, setChap] = useState(0);
  /**
   * いま開いている国。押したピンの国が入る。
   *
   * **ピンを「その国のページへの入口」から「地図の上で開く札」に変えた。**
   * 前はピンを押すと面ごと入れ替わっていたので、18カ国を見て回るのに
   * 18回ページを読み直すことになり、地図に戻るたびに世界全図へ戻された。
   * 押して開く形にすると、地図の上を歩いて回れる。国のページへは札から行く。
   */
  const [pick, setPick] = useState<string | null>(null);
  /** 自動でたどっているか。押している間だけ、順に国が入れ替わる。 */
  const [walk, setWalk] = useState(false);
  /**
   * まとまりを押して寄った先の枠。章でも国でもない寄りかたなので、別に持つ。
   * 章を選び直すか、国を開くと消える。
   */
  const [zoom, setZoom] = useState<number[] | null>(null);
  const chapters = MAP.chapters as Chapter[];
  const anchors = MAP.anchors as Record<string, { x: number; y: number; order: number; city: string }>;

  /**
   * ステージの実寸。
   *
   * **押しどころは px で決まる。** 地図をどれだけ寄せたかだけでは決まらず、
   * 同じ寄せぐあいでもスマホと PC ではピンの離れかたが違う。
   * だから枠を測ってから、たたむかどうかを決める。
   * 測る前（サーバーで書き出したぶん）は、スマホの見当で置いておく。
   */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 340, h: 340 / RATIO, pin: PIN_SM });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () =>
      setStage({
        w: el.clientWidth || 340,
        h: el.clientHeight || (el.clientWidth || 340) / RATIO,
        pin: window.innerWidth >= 720 ? PIN_LG : PIN_SM,
      });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * ある枠で寄せたときに、ピンがどう並ぶか。
   *
   * 枠の外にはみ出したピンは返さない。ステージは `overflow: hidden` なので、
   * 縁にかかったピンは**見えている場所しか押せない**。トルコが 48x35、
   * アラブ首長国連邦が 48x47 だったのがこれ。半分を確保できないものは、
   * 的として置かない（章の札と下の年表から行ける）。
   */
  const marksFor = useMemo(
    () => (bx: number[]) => {
      const kk = W / bx[2];
      const half = stage.pin / 2;
      const spots: Spot[] = [];
      for (const [slug, a] of Object.entries(anchors)) {
        const sx = ((a.x * kk - bx[0] * kk) / W) * stage.w;
        const sy = ((a.y * kk - bx[1] * kk) / H) * stage.h;
        // 枠の外に出た国は、的として置かない（章の札と下の年表から行ける）
        if (sx < 0 || sx > stage.w || sy < 0 || sy > stage.h) continue;
        const cx = Math.min(Math.max(sx, half), stage.w - half);
        const cy = Math.min(Math.max(sy, half), stage.h - half);
        spots.push({ slug, order: a.order, x: a.x, y: a.y, sx: cx, sy: cy, ox: sx - cx, oy: sy - cy });
      }
      return clump(spots, Math.max(stage.pin, GROUP_W) + PIN_GAP, stage.pin + PIN_GAP);
    },
    [anchors, stage],
  );

  /**
   * いまの枠。
   *
   * 国を開いたときは、その国のピンが**1つで立っている**ところまで寄せる。
   * まとまりに呑まれたままだと、下の札はオーストリアを開いているのに
   * 地図の上にオーストリアが無い、という食い違いが起きる。
   * 寄せ直しが要るのはオーストリアとスロバキアだけ（隣が 15 しか離れていない）。
   */
  const box = useMemo(() => {
    if (zoom) return zoom;
    if (!pick || !FIT[pick]) return chapters[chap].box;
    let b = FIT[pick];
    const a = anchors[pick];
    for (let i = 0; i < 10; i++) {
      const g = marksFor(b).find((m) => m.members.some((v) => v.slug === pick));
      if (g && g.members.length === 1) break;
      // 開いた国を真ん中に置いたまま、枠だけ縮める
      const w = b[2] * 0.6;
      const h = b[3] * 0.6;
      b = [Math.max(0, Math.min(W - w, a.x - w / 2)), Math.max(0, Math.min(H - h, a.y - h / 2)), w, h];
    }
    return b;
  }, [zoom, pick, chap, chapters, anchors, marksFor]);

  const wide = !pick && !zoom && chap === 0;
  const at = pick ? TRIP.findIndex((c) => c.slug === pick) : -1;
  const open = at >= 0 ? TRIP[at] : null;

  /** いま画面に出ている的。1つなら国のピン、2つ以上ならまとまり。 */
  const marks = useMemo(() => marksFor(box), [marksFor, box]);
  /** 1つで立っている国。名札を出していいのはこれだけ。 */
  const alone = useMemo(
    () => new Set(marks.filter((m) => m.members.length === 1).map((m) => m.members[0].slug)),
    [marks],
  );

  /** 何カ国目へ行くか。端で止める（環にしない。旅は一方通行なので）。 */
  const goTo = (n: number) => {
    const i = Math.max(0, Math.min(TRIP.length - 1, n));
    setZoom(null);
    setPick(TRIP[i].slug);
  };

  // たどっている間だけ、3.2秒で次の国へ。1歩ごとに次の1歩を仕込む
  // （`at` が変わるたびにこの効果が張り直される）。
  // **最後まで行ったら自分で止まる。** 環にすると終わりが無くなって、
  // 見ている人が「どこまで見たか」を持てない。旅は一方通行なので、端で止める。
  useEffect(() => {
    if (!walk) return;
    if (at >= TRIP.length - 1) {
      setWalk(false);
      return;
    }
    const t = setTimeout(() => setPick(TRIP[at + 1].slug), 3200);
    return () => clearTimeout(t);
  }, [walk, at]);

  /** たどりの入り／切り。開いていないときは1カ国目から、最後まで来ていたら頭から。 */
  const play = () => {
    if (walk) { setWalk(false); return; }
    setZoom(null);
    if (at < 0 || at >= TRIP.length - 1) setPick(TRIP[0].slug);
    setWalk(true);
  };

  /** 人が押したときは、たどりを止めてその国を開く。 */
  const onPick = (slug: string) => {
    setWalk(false);
    setZoom(null);
    setPick((cur) => (cur === slug ? null : slug));
  };

  /**
   * まとまりを押したとき。中の国がぜんぶ入る枠まで寄せる。
   *
   * 寄せると離れるので、たいていは1回で1つずつのピンになる。
   * 9カ国ぶんのように広いまとまりは、寄せた先でもう一度たたまれる。
   * そこをもう一度押せばよい（地図のふつうのふるまい）。
   * 下限を 60 にしてあるのは、2カ国が 15 しか離れていないときに
   * 際限なく寄って、何が写っているのか分からなくなるのを止めるため。
   */
  const zoomTo = (ms: { x: number; y: number }[]) => {
    setWalk(false);
    setPick(null);
    const xs = ms.map((m) => m.x);
    const ys = ms.map((m) => m.y);
    let w = Math.max(60, (Math.max(...xs) - Math.min(...xs)) * 1.7);
    let h = Math.max(60 / RATIO, (Math.max(...ys) - Math.min(...ys)) * 1.7);
    if (w / h < RATIO) w = h * RATIO;
    else h = w / RATIO;
    if (w > W) { w = W; h = H; }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    setZoom([
      Math.max(0, Math.min(W - w, cx - w / 2)),
      Math.max(0, Math.min(H - h, cy - h / 2)),
      w,
      h,
    ]);
  };

  const { k, z, tx, ty, peaks } = useMemo(() => {
    const kk = W / box[2];
    const z = Math.sqrt(kk);
    // 山は塗りなので、寄せた倍率のぶんだけ形を縮めておかないと巨大化する
    return { k: kk, z, tx: -box[0] * kk, ty: -box[1] * kk, peaks: peakPaths(MAP.peaks, 1 / z) };
  }, [box]);

  /** 地図の中の座標を、重ねている HTML の位置（%）に直す。 */
  const pos = (x: number, y: number) => ({
    left: `${((x * k + tx) / W) * 100}%`,
    top: `${((y * k + ty) / H) * 100}%`,
  });

  const name = Object.fromEntries(COUNTRIES.map((c) => [c.slug, c.name]));
  const cities = MAP.cities as City[];

  // 章の中に入っている街だけ名前を出す。外の街まで出すと、地図の縁に
  // 半分だけ見えている名前が並んで汚くなる。余白は寄せぐあいに比例させる。
  const pad = box[2] * 0.035;
  const inBox = (x: number, y: number) =>
    x > box[0] + pad && x < box[0] + box[2] - pad && y > box[1] + pad && y < box[1] + box[3] - pad;

  /**
   * 名札を、重ならない場所に置く。
   *
   * 地図の点にそのまま置くと、近いものどうしで名前が重なって読めなくなる
   * （オーストリアとスロバキア、ゴリスとタテフ）。上下左右に少しずらし、
   * それでも空かなければ最後の候補に置く。
   *
   * 名札は寄せても大きさが変わらないので、当たり判定も px で測る。
   * 実際の幅は画面で決まるが、ここでは見当（620px）で計算する。
   * 少しずれても「重なって読めない」よりはるかにましなので、これでよい。
   *
   * 国の名札を先に置く。国のほうが行き先なので、街に譲らせる。
   */
  const labels = useMemo(() => {
    const SW = NOMINAL_W;
    const SH = (SW * H) / W;
    const px = (x: number) => ((x * k + tx) / W) * SW;
    const py = (y: number) => ((y * k + ty) / H) * SH;
    // 方位と縮尺の下は、名札が潜ると読めない。先に埋めておく。
    const taken: Rect[] = chrome(SW, SH);

    // ピンの丸そのもの。ここには何も置かせない。
    const pins = Object.entries(anchors).map(([slug, a]) => ({ slug, a, x: px(a.x), y: py(a.y) }));
    // 丸の見た目は直径 22px。当たり判定を大きく取りすぎると、
    // 自分の名札まで弾いてコーカサス編で国名が1つも出なくなる。
    for (const p of pins) taken.push({ x0: p.x - 12, y0: p.y - 12, x1: p.x + 12, y1: p.y + 12 });
    // 街の白い丸も埋まっているところ。名前だけ避けても、点に重なると読めない。
    for (const c of cities) {
      const [x, y] = [px(c.x), py(c.y)];
      taken.push({ x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 });
    }

    // 枠からはみ出していないか。前はこれを見ていなかったので、
    // 章を切りかえたとき「ハンガリー」「チェコ」が地図の右に切れて出ていた。
    const inFrame = (b: Rect) => b.x0 > 2 && b.x1 < SW - 2 && b.y0 > 2 && b.y1 < SH - 2;

    // 世界ぜんぶを1枚に収めた面では、18カ国ぶんの名札を置く余地が無い。
    // 名前を出すのは「いまここ」の1つだけにする
    // （docs/island-design.md 3章「注目させるのは一度に1つ」）。
    // まとまりに入っている国の名前は出さない。まとまりの中の1つだけに
    // 名前が付くと、その札がどのピンの名前なのか分からなくなる。
    const named = wide
      ? pins.filter((v) => v.slug === here && alone.has(v.slug))
      : pins.filter((v) => alone.has(v.slug) && inBox(v.a.x, v.a.y));

    const country: Record<string, { dx: number; dy: number; hide: boolean }> = {};
    {
      for (const p of named.sort((a, b) => a.a.order - b.a.order)) {
        const w = (name[p.slug]?.length ?? 3) * 12 + 8;
        // 名札は .apin（48px）の下から 30px の位置に出る。実測すると
        // 丸の中心から 34px 上〜12px 上、高さ 22px。字の大きさから
        // 推し量ると必ずずれるので、測った数をそのまま書く。
        const at = (dx: number, dy: number): Rect => ({
          x0: p.x + dx - w / 2, y0: p.y - 34 + dy, x1: p.x + dx + w / 2, y1: p.y - 12 + dy,
        });
        let put: { dx: number; dy: number; box: Rect } | null = null;
        let best: { got: { dx: number; dy: number; box: Rect }; n: number } | null = null;
        for (const [dx, dy] of PIN_SLOTS) {
          const box2 = at(dx, dy);
          if (!inFrame(box2)) continue;
          const n = overlap(box2, taken);
          if (n === 0) {
            put = { dx, dy, box: box2 };
            break;
          }
          if (!best || n < best.n) best = { got: { dx, dy, box: box2 }, n };
        }
        const got = put ?? best?.got;
        // どの逃がし先も枠に入らなかったとき（アラブ首長国連邦のように
        // 名前が長くて、ピンが地図の端にある国）は、枠の中へ押し戻す。
        // ここを 0 のままにすると、名札の右半分が地図の外で切れる。
        const clamp = (v: number) => Math.max(2 - (p.x - w / 2), Math.min(SW - 2 - (p.x + w / 2), v));
        const dx = got ? got.dx : clamp(0);
        const dy = got?.dy ?? 0;
        // 国どうしが近すぎて、どこへ逃がしても重なるなら名前を出さない
        // （オーストリアとスロバキア）。ピンの番号は残るし、下の年表に名前がある。
        const hide = !put && (best?.n ?? Infinity) > 90;
        country[p.slug] = { dx, dy, hide };
        if (!hide) taken.push(got?.box ?? at(dx, dy));
      }
    }

    const city = placeCities(
      cities.filter((v) => v.kind !== "hub" && inBox(v.x, v.y)),
      (x, y) => [px(x), py(y)],
      taken,
      (c) => c.x > box[0] + box[2] * 0.74,
      { w: SW, h: SH },
    );
    return { country, city };
  }, [box, k, tx, ty, wide, here, alone]);

  // 縮尺。寄せると 1000km の棒が地図からはみ出すので、
  // 地図の幅の2割ぐらいに収まる「1・2・5 の切りのいい距離」を選び直す。
  const bar = useMemo(() => {
    const wantKm = box[2] * MAP.scale.kmPerUnit * 0.22;
    const p10 = 10 ** Math.floor(Math.log10(wantKm));
    const km = [1, 2, 5, 10].map((m) => m * p10).reduce((a, b) => (Math.abs(b - wantKm) < Math.abs(a - wantKm) ? b : a));
    return { km, pct: ((km / MAP.scale.kmPerUnit) * k * 100) / W };
  }, [box, k]);

  return (
    <div>
      <div className="amap-tabs" role="tablist" aria-label="地図を寄せる">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={!pick && !zoom && i === chap}
            className={`amap-tab${!pick && !zoom && i === chap ? " is-on" : ""}`}
            onClick={() => {
              // 章を選び直したら、開いていた国とまとまりへの寄りは閉じる。
              // 開いたまま章だけ変わると、札と地図が別の国を指す
              setPick(null);
              setZoom(null);
              setWalk(false);
              setChap(i);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="amap">
        <div className="amap-stage" ref={stageRef}>
          <svg className="amap-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="パリからジョージアまで、これまでに歩いた17カ国の地図">
            <defs>
              <linearGradient id="amSea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2f97d8" />
                <stop offset="0.55" stopColor="var(--am-sea-deep)" />
                <stop offset="1" stopColor="#0f57ad" />
              </linearGradient>
              <linearGradient id="amOff" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset="0" stopColor="var(--am-off-n)" />
                <stop offset="1" stopColor="var(--am-off-s)" />
              </linearGradient>
              <linearGradient id="amOn" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset="0" stopColor="var(--am-on-n)" />
                <stop offset="0.62" stopColor="#c3dd72" />
                <stop offset="1" stopColor="var(--am-on-s)" />
              </linearGradient>
              <filter id="amSoft" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
              <filter id="amRidge" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            {/* 海。上が明るく、下へ行くほど深い青 */}
            <rect width={W} height={H} fill="url(#amSea)" />

            <g className="amap-move" style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>
              {/* 海の白いきらめき */}
              {GLINTS.map(([r, d]) => (
                <path key={`g${r}`} d={d} stroke="#ffffff" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.2" fill="none" />
              ))}

              {/* 岸。浅瀬 → 泡 → 濡れ砂 → 乾いた砂。島の砂浜と同じ重ね方 */}
              <path d={MAP.land} fill="none" stroke="var(--am-shelf)" strokeWidth={34 / k} strokeLinejoin="round" opacity="0.85" filter="url(#amSoft)" />
              <path d={MAP.land} fill="none" stroke="var(--am-shelf-hi)" strokeWidth={16 / k} strokeLinejoin="round" opacity="0.9" />
              <path d={MAP.land} fill="none" stroke="var(--am-foam)" strokeWidth={9 / k} strokeLinejoin="round" />
              <path d={MAP.land} fill="none" stroke="var(--am-sand-wet)" strokeWidth={6.5 / k} strokeLinejoin="round" />
              <path d={MAP.land} fill="url(#amOff)" stroke="var(--am-sand)" strokeWidth={3.5 / k} strokeLinejoin="round" />

              {/* 通った国。まわりより明るく、彩度も高く */}
              {Object.entries(MAP.countries).map(([slug, d]) => (
                <path key={slug} d={d as string} fill="url(#amOn)" />
              ))}
              {/* 国の境。かたい線は引かない。内側に落ちる淡い影で分ける */}
              {Object.entries(MAP.countries).map(([slug, d]) => (
                <path key={`e${slug}`} d={d as string} fill="none" stroke="#3e7c33" strokeWidth={3 / k} opacity="0.3" />
              ))}

              {/* 山脈。やわらかい帯の上に丸い山の印 */}
              <path d={MAP.ridges} fill="none" stroke="var(--am-ridge)" strokeWidth={26 / z} strokeLinecap="round" opacity="0.3" filter="url(#amRidge)" />
              <g className="am-peaks">
                <path d={peaks.body} fill="#a2703c" />
                <path d={peaks.face} fill="#cb9c5f" />
                <path d={peaks.cap} fill="#f7ecd2" />
              </g>

              {/* 森と砂丘 */}
              {WOODS.map(([r, d]) => (
                <path key={`w${r}`} d={d} stroke="var(--am-wood)" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.28" fill="none" />
              ))}
              {DUNES.map(([r, d]) => (
                <path key={`d${r}`} d={d} stroke="var(--am-dune)" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.5" fill="none" />
              ))}

              {/* 湖と川 */}
              <path d={MAP.lakes} fill="var(--am-sea-mid)" />
              <path d={MAP.rivers} fill="none" stroke="#60a0d8" strokeWidth={2.6 / z} strokeLinecap="round" opacity="0.85" />

              {/* 経緯線。うっすら出すだけで「地図を見ている」感じが出る */}
              <path d={MAP.grid} fill="none" stroke="#ffffff" strokeWidth={1.4 / k} opacity="0.12" />

              {/* ルート。下に濃い影を敷いてから本線を重ねる */}
              {(MAP.legs as { from: string; to: string; move: string; d: string }[]).map((l) => {
                const s = MOVE[l.move] ?? MOVE.land;
                return (
                  <g key={`${l.from}-${l.to}`}>
                    {!s.dash && (
                      <path d={l.d} fill="none" stroke="#0d3f74" strokeWidth={(s.w + 4) / k} strokeLinecap="round" opacity="0.22" />
                    )}
                    <path
                      d={l.d}
                      fill="none"
                      stroke={s.c}
                      strokeWidth={s.w / k}
                      strokeLinecap={s.cap ?? "round"}
                      strokeDasharray={s.dash ? s.dash.split(" ").map((n) => Number(n) / k).join(" ") : undefined}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* 国のピンと街。HTML で重ねているので、寄せても文字が小さくならない */}
          <div className={`amap-pins${wide ? " is-wide" : ""}`}>
            {/* 海の名前。
                前は SVG の文字だったので、**スマホでは 5.7px** しか無かった
                （viewBox の中の 24 を、幅 330px の枠に収めるとそうなる）。
                字の下限は 11.5px と決まっている（`docs/island-world.md` 5.4）。
                街の名前と同じで、HTML に出せば寄せても大きさが変わらない。

                大きさは海の広さを表しているので、そこは残す。枠の幅に比例させて、
                下限 11.5px で止める（1cqw = 地図の枠の1%）。

                世界を1枚に収めた面では、大きい海だけにする。7つ並べると
                330px の地図が名前で埋まる（街の名前を隠しているのと同じ理由）。 */}
            {(MAP.seas as { name: string; x: number; y: number; size: number; rot: number }[])
              .filter((s) => inBox(s.x, s.y) && (!wide || s.size >= 26))
              .map((s) => (
                <span
                  key={s.name}
                  className="asea"
                  style={{
                    ...pos(s.x, s.y),
                    fontSize: `max(var(--fs-min), ${((s.size / W) * 100).toFixed(2)}cqw)`,
                    ["--asea-rot" as string]: `${s.rot}deg`,
                  }}
                >
                  {s.name}
                </span>
              ))}
            {labels.city.filter((v) => !v.hide).map(({ c, dy, left }) => (
              <span
                key={c.id}
                className={`acity${left ? " is-left" : ""}`}
                style={{ ...pos(c.x, c.y), ["--acity-dy" as string]: `${dy}px` }}
              >
                <b>{c.name}</b>
              </span>
            ))}
            {marks.map((g) => {
              if (g.members.length === 1) {
                const { slug, order, ox, oy } = g.members[0];
                return (
                  <button
                    key={slug}
                    type="button"
                    aria-pressed={slug === pick}
                    aria-label={`${name[slug]}を地図で開く`}
                    onClick={() => onPick(slug)}
                    className={`apin${slug === here ? " is-here" : ""}${
                      slug === pick ? " is-open" : ""
                    }${labels.country[slug] && !labels.country[slug].hide ? " is-named" : ""}`}
                    style={{
                      left: `${(g.sx / stage.w) * 100}%`,
                      top: `${(g.sy / stage.h) * 100}%`,
                      ["--apin-ox" as string]: `${ox}px`,
                      ["--apin-oy" as string]: `${oy}px`,
                    }}
                  >
                    <span className="apin-dot">
                      <span>{order}</span>
                    </span>
                    <span
                      className="apin-name"
                      style={{
                        ["--apin-dx" as string]: `${labels.country[slug]?.dx ?? 0}px`,
                        ["--apin-dy" as string]: `${labels.country[slug]?.dy ?? 0}px`,
                      }}
                    >
                      {name[slug]}
                    </span>
                  </button>
                );
              }
              // まとまり。何カ国ぶんかを書く。番号を書くと、ピンの通し番号と
              // 見分けが付かない（「9」が9カ国なのか9カ国目なのか分からない）。
              const holds = g.members.some((m) => m.slug === here);
              return (
                <button
                  key={`g${g.members.map((m) => m.slug).join("-")}`}
                  type="button"
                  aria-label={`${g.members.map((m) => name[m.slug]).join("、")}に寄る`}
                  onClick={() => zoomTo(g.members)}
                  className={`apin is-group${holds ? " is-here is-named" : ""}`}
                  style={{ left: `${(g.sx / stage.w) * 100}%`, top: `${(g.sy / stage.h) * 100}%` }}
                >
                  <span className="apin-many">{g.members.length}カ国</span>
                  {holds && <span className="apin-name">{name[here]}</span>}
                </button>
              );
            })}
          </div>

          {/* 方位。北がどちらかを言わない地図は、地図の顔をしていない */}
          <Compass size={44} className="amap-rose" />

          {/* 縮尺。棒の長さは地図の幅に対する割合なので、札の幅ではなく
              ステージの幅（1cqw = ステージ幅の1%）で測る */}
          <div className="amap-badge">
            <i style={{ width: `calc(${bar.pct} * 1cqw)` }} />
            {bar.km}km
          </div>
        </div>
      </div>

      {/* たどる。
          地図を「読むもの」から「歩けるもの」にするための1本。
          作り物の当たりは置かない（`docs/island-play.md` 4章）。
          出てくるのは、実際に入った国・実際に通った街・実際にやった配信だけ。 */}
      <div className="atrace">
        <div className="atrace-bar">
          <button type="button" className="atrace-go" onClick={play}>
            <Icon name={walk ? "pause" : "play"} size={14} />
            {walk ? "とめる" : at < 0 ? "パリから、たどる" : at >= TRIP.length - 1 ? "もう一度たどる" : "つづきをたどる"}
          </button>
          <div className="atrace-step">
            <button
              type="button"
              onClick={() => { setWalk(false); goTo(at - 1); }}
              disabled={at <= 0}
              aria-label="ひとつ前の国"
            >
              <Icon name="left" size={15} />
            </button>
            <span>
              <b>{at < 0 ? "–" : at + 1}</b> / {TRIP.length}
            </span>
            <button
              type="button"
              onClick={() => { setWalk(false); goTo(at + 1); }}
              disabled={at >= TRIP.length - 1}
              aria-label="つぎの国"
            >
              <Icon name="right" size={15} />
            </button>
          </div>
        </div>

        {open ? (
          /* 開いた国の札。紙の型なので影は落とさず、罫で割る。
             押せるのは「その国のページへ」と配信の2つだけ。 */
          <article className="acard">
            <p className="acard-head">
              <span className="acard-flag">
                <Flag slug={open.slug} size={30} />
              </span>
              <b>{open.name}</b>
              <em>{open.en}</em>
              <i>{open.order}カ国目</i>
            </p>
            <p className="acard-when">
              {open.stays
                .map((st) => `${ymd(st.from)} – ${st.to ? ymd(st.to) : "いまも"}`)
                .join("、")}
            </p>
            <p className="acard-sum">{open.summary}</p>
            <p className="acard-towns">
              {[...new Set(open.stays.flatMap((st) => st.cities))].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </p>
            {/* この国の代表の1本。配信が残っていない国もあるので、あるときだけ出す */}
            {(() => {
              const h = open.highlights.find((x) => x.videoId);
              if (!h) return null;
              return (
                <a
                  className="scard acard-live"
                  href={`https://www.youtube.com/watch?v=${h.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="scard-thumb">
                    <img
                      src={`https://i.ytimg.com/vi/${h.videoId}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      width={320}
                      height={180}
                    />
                    <span className="scard-play" aria-hidden>
                      <Icon name="play" size={17} />
                    </span>
                  </span>
                  <span className="scard-body">
                    <span className="scard-meta">
                      {h.date && <time>{ymd(h.date)}</time>}
                    </span>
                    <b>{h.title}</b>
                  </span>
                </a>
              );
            })()}
            <Link className="acard-go" href={`/map/${open.slug}`} prefetch={false}>
              {open.name}のページへ
              <Icon name="right" size={14} />
            </Link>
          </article>
        ) : (
          <p className="atrace-hint">
            ピンを押すと、その国が開きます。近くに集まっている国は「◯カ国」の札に
            まとまっていて、押すとそこへ寄ります。18カ国ぶん、通った街とその国からの配信が出ます。
          </p>
        )}
      </div>

      <div className="amap-foot">
        {LEGEND.filter(([move]) => moved[move]).map(([move, label]) => {
          const st = MOVE[move];
          return (
            <span className="amap-key" data-move={move} key={move}>
              {/* 凡例の線は、地図に引いてある線そのものを写す。
                  太さも点線の刻みも同じにしないと、凡例が別のものを指してしまう */}
              <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden>
                <path
                  d="M1 6h28"
                  stroke={st.c}
                  strokeWidth={Math.min(7, st.w)}
                  strokeLinecap={st.cap ?? "round"}
                  strokeDasharray={st.dash}
                  fill="none"
                />
              </svg>
              {label}
              {/* 距離は街と街の大円距離の足しあげ（build_world_route.py）。
                  凡例が「どの線か」だけでなく「どれだけ動いたか」も言う */}
              {moved[move] ? <em>{moved[move].toLocaleString()}km</em> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
