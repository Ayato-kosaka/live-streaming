/**
 * 島ひとつを「3Dモデル風」に見せるための寸法。
 *
 * あやとの言葉:「島のマップを押すと、今の島が3Dモデル風に出てきて、
 * 左右上矢印が出てきて、押すとその島が出てきて、その島を押すとその島に
 * 移動できるUXがどう森っぽい」。
 *
 * ## なぜ「水ごと切り取った円盤」なのか
 *
 * 平らな島を斜めから見せても、絵が傾いただけで模型には見えない。
 * かといって島だけを宙に浮かせると、**船で渡る**という島の決まり
 * （`docs/island-atlas.md` 6章）と絵が食い違う。
 * だから**海ごと丸く切り取って**、その円盤に厚みを付けた。
 * 水も島も同じ模型の中にあるので、船の話が嘘にならない。
 *
 * ## 立体は「同じ形を下にずらして2枚描く」で作る
 *
 * 側面の多角形を計算しない。**同じ輪郭を少し下にずらして暗い色で先に描き、
 * その上に明るい色で本体を描く。** はみ出した三日月がそのまま側面になる。
 * 島の輪郭は 16方位の半径から作る閉曲線なので、この描き方なら
 * 章が増えて形が変わっても破綻しない（側面の多角形は凹んだ形で破綻する）。
 *
 * ## カメラは全部の島で同じ
 *
 * `art.squash` は島ごとに 0.56〜0.70 とばらついているが、あれは
 * 「地図に近い見え方」を作るための**カメラの値**で、島の形ではない
 * （形は `art.radii` が持っている）。模型を並べる画面で島ごとに
 * カメラが変わると、同じ棚に別の縮尺の模型が載っているように見える。
 * **ここでは 1つの値に固定する。**
 */

import { ISLAND, PLACES } from "@/components/island/layout";
import { islandRadius, type IslandArt } from "./shapes";

/** 島に建っているもの。**位置も大きさも、歩ける島の値を島の半径で割った割合** */
export type AtlasBuilding = { icon: string; size: number; nx: number; ny: number };

/**
 * 模型ひとつぶんの材料。**サーバで作ってクライアントへ渡す**（`./isles.ts`）。
 *
 * 章の事実（名前・期間・日数）はここに入れない。あちらは
 * `content/chapters.ts` をクライアントがそのまま読む（日数は画面が出てから
 * 数え直す決まりなので、焼いて渡すと出発の日をまたいでも変わらない）。
 */
export type AtlasIsle = { slug: string; art: IslandArt; buildings: AtlasBuilding[] };

/** 見おろす角度。1.0 が真上、0 が真横。0.56 は約34度 */
export const CAM = 0.56;

/** 島のいちばん外側から、水面の縁までの余裕 */
const DISC_PAD = 1.18;
/**
 * 水面の円盤の、いちばん小さい半径。
 *
 * **島の大きさは日数そのままで、下駄を履かせていない**（`docs/island-atlas.md` 3章）。
 * ただし 17日の島は 438日の島の 3.5分の1 しかないので、円盤まで比例させると
 * 模型そのものが豆粒になって、選んでいる島が**となりの島より小さく写る**
 * （撮って分かった）。**台のほうに下限を置く。** 島どうしの比は 1つも動かない。
 */
const MIN_D = 78;

/** 円盤の厚み（土の層・岩の層）と、底のすぼまり */
const SOIL = 0.17;
const ROCK = 0.23;
const FOOT = 0.52;

export type Dio = {
  /** 島の半径（絵の単位）。滞在日数だけで決まる */
  r: number;
  /** 水面の円盤の半径と、その見かけの高さ */
  D: number;
  Dh: number;
  /** 土の層の下端 / 岩の層の下端 */
  y1: number;
  y2: number;
  /** 岩の層の下端の半径 */
  D2: number;
  /** 浜の面と草地の面の高さ（水面を 0 とした負の値） */
  yB: number;
  yG: number;
  /** 浜の輪郭と草地の輪郭 */
  sand: number[];
  grass: number[];
  /** 絵の外枠 */
  box: { x: number; y: number; w: number; h: number };
};

export function dio(art: IslandArt, days: number): Dio {
  const r = islandRadius(days);
  const maxR = r * Math.max(...art.radii);
  const D = Math.max(maxR * DISC_PAD + 6, MIN_D);
  const Dh = D * CAM;
  const y1 = D * SOIL;
  const y2 = y1 + D * ROCK;
  const D2 = D * FOOT;
  // 浜は水面からわずかに上がり、草地はそこからもう一段上がる。
  // **どちらも半径に比例させる。** 固定値にすると小さい島だけ崖が高くなる
  const yB = -r * 0.055;
  const yG = yB - r * 0.105;

  const sand = art.radii.map((v) => v * r);
  /* 浜の幅。**小さい島でも浜が見える太さを残す**（`IslandMark` と同じ理由）。
     割合だけで決めると、17日の島の浜が 1px を切って「茶色い粒」になる */
  const grass = sand.map((v) => v - Math.max(r * 0.13, 9));

  // 上は、いちばん高い草木のぶん。下は円盤の底と、その下に落ちる影のぶん
  const top = yG - maxR * CAM - r * 0.62;
  const bottom = y2 + D2 * CAM + D * 0.14;
  return {
    r,
    D,
    Dh,
    y1,
    y2,
    D2,
    yB,
    yG,
    sand,
    grass,
    box: { x: -(D + 4), y: top, w: 2 * (D + 4), h: bottom - top },
  };
}

/** 円盤の側面。上の楕円と下の楕円を、まっすぐな母線でつないだ帯 */
export function side(rTop: number, yTop: number, rBot: number, yBot: number): string {
  const ht = rTop * CAM;
  const hb = rBot * CAM;
  const f = (v: number) => v.toFixed(1);
  return (
    `M${f(-rTop)},${f(yTop)}` +
    `A${f(rTop)},${f(ht)} 0 0 0 ${f(rTop)},${f(yTop)}` +
    `L${f(rBot)},${f(yBot)}` +
    `A${f(rBot)},${f(hb)} 0 0 1 ${f(-rBot)},${f(yBot)}` +
    `Z`
  );
}

/**
 * いまいる島に建っているもの。
 *
 * **いまいる島だけ、渡る先がトップ（`/`）で島の作りが違う**
 * （`components/island/layout.ts` の 1200四方に手で置いた10軒）。
 * `isleSpec` で作ると配信の一覧が無い章になって、模型に3軒しか建たない。
 * **押した先に10軒建っているのに、押す前は3軒**では模型が嘘をつく。
 *
 * どの章が「いまいる島」かは日付で変わるので、**選ぶのは画面側**
 * （`Isles.tsx` が `chapterNow(new Date())` で引き直す）。ここは表を渡すだけ。
 */
export const HOME_BUILDINGS: AtlasBuilding[] = (() => {
  const r = ISLAND.radii.reduce((a, b) => a + b, 0) / ISLAND.radii.length;
  return PLACES.map((p) => ({
    icon: p.icon,
    size: round(p.size / r),
    /* **少し内へ寄せる。** トップの島とここでは輪郭の比が違うので、
       そのまま写すと縁の建物が海に落ちる */
    nx: round(((p.x - ISLAND.cx) / r) * 0.8),
    ny: round(((p.y - ISLAND.cy) / (r * ISLAND.squash)) * 0.8),
  }));
})();

/* 焼き出す HTML に入る数なので、桁を落とす */
function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
