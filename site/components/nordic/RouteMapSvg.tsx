import Link from "next/link";
import MapZoom from "@/components/atlas/MapZoom";
import MAP from "@/content/nordic/map.json";
import Flag from "@/components/ui/Flag";
import { NORDIC_COUNTRIES, ROUTE } from "@/content/nordic";

/**
 * 北欧ルートの地図。
 *
 * 形は本物。Natural Earth の海岸線をランベルト正角円錐で投影してある
 * （`python/build_nordic_map.py`）。街・ルート・山なみ・国境・縮尺・方位も、
 * ぜんぶあのスクリプトが座標まで計算して焼き込んでいる。
 * **ここで経度緯度から座標を計算し直さないこと。必ずズレる。**
 * 本物との一致は面積で測ってある（重なり 99.5%）。
 *
 * 塗りは島と同じ作り。輪郭線を引かず、
 *   深い海 → 浅瀬 → 白い泡 → 濡れた砂 → 砂浜 → 草
 * の帯で陸と海を分ける（docs/ac-reference.md 2章）。
 * 色はぜんぶ CSS 変数。生の色をここに書くと、島の色を変えたときに
 * 地図だけ取り残されて浮く。
 *
 * 森と山は「同じパスを3枚、少しずらして重ねる」ことで立体にしている。
 * 木1本ずつに明るい面と暗い面を持たせると、パスの文字数が倍になって
 * JSON が太る（森だけで 700 本ある）。
 *
 * 凡例は地図の中に置かない。地図のいちばん見せたいところ（ノルウェーと
 * スウェーデン）が板で隠れる。線の読み方は `MapLegend` が外に出す。
 */

/**
 * 街の名札をどちらに出すか。
 * 近い街どうしがぶつからないよう、実際に描いた絵を見て手で決める。
 */
const LABEL: Record<string, { dx: number; dy: number; at: "start" | "middle" | "end" }> = {
  katowice: { dx: -22, dy: -14, at: "end" },
  warszawa: { dx: 28, dy: 12, at: "start" },
  bialystok: { dx: 28, dy: 12, at: "start" },
  vilnius: { dx: 28, dy: 14, at: "start" },
  siauliai: { dx: -26, dy: 8, at: "end" },
  riga: { dx: -28, dy: 4, at: "end" },
  tallinn: { dx: 28, dy: 16, at: "start" },
  // **西へ返してある。** 東はフィンランド湾の名前が通る帯で、ここを右へ出すと
  // タリンの名札とのあいだに 17 しか残らない。字は画素の形ではなく**枡**で
  // 当たる（`cellBox`）ので、17 にはどんな大きさの名前も入らない。
  // 西は開いた海で、ストックホルムの名札とも 12 空く。
  helsinki: { dx: -28, dy: -8, at: "end" },
  // トゥルクはヘルシンキの西 83 しか離れていない。右へ出すと名札どうしが
  // ぶつかるので、上へ逃がす。
  turku: { dx: -6, dy: -18, at: "middle" },
  stockholm: { dx: -28, dy: 6, at: "end" },
};

/**
 * 「いま ここ」の札を、街のまわりのどこに立てるか。**順に回して、空いた場所に立てる。**
 *
 * 前はここが街ごとの手書きの表（`HERE_DX`）だった。手で書くと、名札を1つ
 * 動かした日に黙って下敷きになる。実際、旅程から引いた「いま ここ」は
 * **その日いる街にだけ**出るので、手元で見て合わせられるのは11日のうち1日ぶん。
 * 測ると、スウェーデンの国名がストックホルムの札に 41.6%、リトアニアが
 * ヴィリニュスの札に 27.8% 食われていた（どちらも旅の後半に来る日）。
 *
 * 回す順は島の札と同じ——**真上 → 肩 → 下 → 横**
 * （`docs/island-design.md` 6章「引きの札は、建物から離れすぎない」）。
 * 街からの距離（ワールド単位。真ん中からの横と、ピンの外からの縦）。
 */
const HERE_SPOTS: [number, number][] = [
  [0, -46],
  [-66, -46],
  [66, -46],
  [0, -96],
  [-92, -24],
  [92, -24],
  [-66, -96],
  [66, -96],
  [0, 52],
  [-66, 52],
  [66, 52],
  [-92, 28],
  [92, 28],
  [-104, 0],
  [104, 0],
];

/** 区間の線の描き方。太さだけここで決めて、色は CSS 変数に逃がす。 */
const LEG: Record<string, { cls: string; width: number; dash?: string }> = {
  hitch: { cls: "is-hitch", width: 12 },
  ferry: { cls: "is-ferry", width: 8, dash: "4 20" },
  side: { cls: "is-side", width: 6, dash: "3 14" },
};

/**
 * ゴールの札（「ここに、会いたい人がいる」）を、街の真下からどれだけ横へずらすか。
 *
 * この札は 384 幅——**地図のはば 1000 の 4割**——で、街の下に横たわる。
 * 前は -24（ほぼ真下）で、右はしが 623 まで伸び、リガ〜タリンの線のわきに
 * 距離の札を置ける場所が1つも無くなっていた（308km が 66 離れたところまで
 * 逃げて、そこでエストニアの国名に 28% 乗っていた）。
 * 西は開いた海なので、そちらへ寄せる。ストックホルムのピンは札の上に残る。
 */
const GOAL_DX = -76;

/** ピンの大きさ。泊まる街を大きく、通るだけの街を小さく。 */
const PIN: Record<string, number> = { goal: 16, stay: 13, pass: 10, side: 8, land: 10 };

/**
 * 街の押しどころの半径（ワールド単位）。
 *
 * **行き先の違う街と重ならない大きさまでしか広げない。**
 * 街は11あるが行き先は6つで、ポーランドの5つの街はどれも `/nordic/poland` へ行く。
 * 同じ紙へ行く街どうしなら、取り違えても同じ場所に着くので重なってよい。
 * 困るのは**違う国どうし**で、タリン（エストニア）とヘルシンキ（フィンランド）は
 * 45.8 しか離れていない。ここに 68 の当たりを与えると、
 * エストニアを押したのに海の向こうのフィンランドへ行く。
 *
 * 距離を手で書かない。街が1つ動いたときに黙って壊れる。
 */
function hitRadius(c: { x: number; y: number; country: string }, all: typeof MAP.cities) {
  let near = Infinity;
  for (const o of all) {
    if (o.country === c.country) continue;
    near = Math.min(near, Math.hypot(o.x - c.x, o.y - c.y));
  }
  // 34 は絵より少し大きいぶんの上限。それより近い隣がいれば、真ん中で止める。
  return Math.floor(Math.min(34, near / 2));
}

/**
 * 方位磁針の円盤の半径（ワールド単位）と、紙のふちから空ける余白。
 *
 * **描いたものの大きさぶん、内側へ寄せる。** 焼き込み（`map.json` の `north`）が
 * 持っているのは点ひとつで、そこに何を描くかは知らない。その点をそのまま
 * 中心にすると、円盤も字も紙の外にはみ出す。実際、焼き込みの北緯 62 の端は
 * y 46 で、44 の円盤と 66 上の札を描くと **21 単位ぶんが viewBox の外**に出て、
 * N が丸ごと切り落とされていた。
 *
 * 焼き込みは直さない（`content/nordic/map.json` は自動生成）。**描く側が、
 * 自分の大きさを知って内側へ寄せる。**
 */
const COMPASS_R = 50;
const COMPASS_PAD = COMPASS_R + 8;

/* 字の大きさ。CSS（`app/css/nordic.css`）と同じ数を持つ。
   札のぶつかりを組む前に測るのに要るので、こちらにも1つ置く。
   **片方だけ動かさない。** どちらかを変えたら、もう片方も同じ数にする。 */
const KM_FS = 27;
/** 「いま ここ」「きょう ここ」の金の札。広いほう（きょう）で場所を取る。 */
const HERE_W = 176;
const HERE_H = 50;

type Box = { x: number; y: number; w: number; h: number };

const boxAt = (cx: number, cy: number, w: number, h: number): Box => ({
  x: cx - w / 2,
  y: cy - h / 2,
  w,
  h,
});

/**
 * 2つの箱が重なっている面積。`pad` は「近すぎるのも駄目」のぶん。
 *
 * **重なるか／重ならないかの二択で選ばない。** 混んでいるところでは、どこに
 * 置いても少しは重なる。そのとき「1つも空いていない」で既定の場所に落とすと、
 * **いちばん重なる場所に置く**ことになる（ストックホルムの金の札が実際にそうで、
 * 街のまわり11か所とも塞がっていたので、真上——国名に 41.6% 乗る場所——に
 * 落ちていた）。面積で測って、いちばん少ないところを選ぶ。
 */
const overlap = (a: Box, b: Box, pad = 0) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad * 2;
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad * 2;
  return w > 0 && h > 0 ? w * h : 0;
};
/** ぶつかり具合。どれだけの面積を、ほかのものに取られているか。 */
const clash = (b: Box, taken: Box[]) => taken.reduce((n, t) => n + overlap(b, t, 1), 0);

/**
 * 字のおおよその箱。**カタカナは全角なので、字数 × 大きさでほぼ合う。**
 * 字間（letter-spacing）のぶんだけ横に伸びるので、そこは呼ぶ側から渡す。
 */
const textBox = (cx: number, base: number, len: number, size: number, ls = 0): Box =>
  // 字間は最後の1字のうしろにも付く。まん中ぞろえだと、その空きのぶん
  // 字そのものは左へずれる。ずれを入れずに地を敷くと、右の余白だけ広くなる。
  boxAt(cx - (size * ls) / 2, base - size * 0.36, len * size * (1 + ls), size * 1.06);

/**
 * 字の**枡**。`textBox`（描かれた字の見た目）より上下に大きい。
 *
 * **ぶつかりはこちらで測る。** SVG の字は、画素の形ではなく**1字ぶんの枡**で
 * 当たりを取る（`elementFromPoint` が字を返すのは枡の中ぜんぶ）。
 * 見た目の高さ（1.06em）で組んでいたときは、机上で 15 空いているはずの
 * 287km とビャウィストクが、実際には枡どうしで 9 重なっていた。
 * 実測（`tools/sprites/_nmdbg.mjs`）で上が 1.2em、下が 0.35em。
 */
const cellBox = (cx: number, base: number, len: number, size: number, ls = 0): Box =>
  boxAt(cx - (size * ls) / 2, base - size * 0.42, len * size * (1 + ls), size * 1.55);

/** 2つの箱を、両方を含む1つの箱にまとめる。 */
const merge = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * 名前の下に敷く地（`.nm-wash`）の大きさ。
 *
 * **2枚で作る。** 内側はぼかさない1枚で、**字が乗るのはここだけ**。
 * 外側は同じ色をぼかした1枚で、地図とのつなぎ目を消すためだけにいる。
 *
 * 1枚をぼかしただけにすると、字の上下が**ぼけ始めの帯**に入る。
 * そこは中心より薄いので、同じ字なのに真ん中と端で地の明るさが変わる。
 * 「中心だけ濃い暗幕を敷いて中央値だけよく見せる」のと同じ絵になる
 * （`docs/island-misses.md`）。内側の1枚を平らに敷いて、そこを外さない。
 *
 * 外側は内側より `HAZE` だけ大きく、ぼかしは σ = HAZE / 3。
 * こうすると、内側のふちに届くころには外側がもう塗りきっている（3σ）ので、
 * 2枚の境目に段差が出ない。
 */
const WASH_X = 10;
const WASH_Y = 8;
const HAZE = 13;
const washBox = (b: Box): Box => ({
  x: b.x - WASH_X,
  y: b.y - WASH_Y,
  w: b.w + WASH_X * 2,
  h: b.h + WASH_Y * 2,
});
/** ぼかしを含めた、地図の上で場所を取るぶん。 */
const hazeBox = (b: Box): Box => ({
  x: b.x - HAZE,
  y: b.y - HAZE,
  w: b.w + HAZE * 2,
  h: b.h + HAZE * 2,
});

/** 傾けた箱を、まっすぐな箱で包む。海の名前は水面の向きに寝かせてある。 */
const tiltBox = (b: Box, deg: number): Box => {
  const r = (deg * Math.PI) / 180;
  const ca = Math.abs(Math.cos(r));
  const sa = Math.abs(Math.sin(r));
  return boxAt(b.x + b.w / 2, b.y + b.h / 2, b.w * ca + b.h * sa, b.w * sa + b.h * ca);
};

type City = (typeof MAP.cities)[number];

/**
 * 街の名札の置きかた。**描くときと、ぶつかりを測るときで同じ式を使う。**
 * 2か所に書くと、名札を動かした日に測るほうだけ古くなる。
 */
function cityLabel(c: City) {
  const lb = LABEL[c.id] ?? { dx: 24, dy: 8, at: "start" as const };
  const big = c.kind === "stay" || c.kind === "goal";
  const fs = big ? 34 : 28;
  const tw = c.name.length * fs + 12;
  const tx = lb.at === "end" ? c.x + lb.dx - tw : c.x + lb.dx;
  const plate: Box = { x: tx - 5, y: c.y + lb.dy - fs * 0.82, w: tw + 10, h: fs * 1.12 };
  return {
    lb,
    big,
    fs,
    tw,
    tx,
    /** 名前の下に敷く紙 */
    plate,
    /** ぶつかりを測るときの場所。紙より字の枡のほうが上下に出る。 */
    hold: merge(plate, { x: tx, y: c.y + lb.dy - fs * 1.2, w: tw, h: fs * 1.55 }),
  };
}

/** 「いま ここ」の金の札が、街のここに立ったときの箱。 */
function hereBoxAt(c: City, at: [number, number]): Box {
  const r = PIN[c.kind] ?? 9;
  return boxAt(c.x + at[0], c.y + (at[1] < 0 ? -r + at[1] : r + at[1]), HERE_W, HERE_H);
}

export default function RouteMapSvg({ here }: { here?: string }) {
  const { view, land, countries, cities, legs, fly, borders } = MAP;
  const { lakes, rivers, grid, woods, hills, glints, labels, seas, scale, north } = MAP;
  const name = Object.fromEntries(NORDIC_COUNTRIES.map((c) => [c.slug, c.name]));
  const cityName = Object.fromEntries(cities.map((c) => [c.id, c.name]));
  const seqOf = Object.fromEntries(cities.map((c) => [c.id, c.seq]));

  // 方位磁針を紙の内側へ寄せる。切り落とされた N は、濃くしても読めない。
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(north.x, COMPASS_PAD, view.w - COMPASS_PAD);
  const cy = clamp(north.y, COMPASS_PAD, view.h - COMPASS_PAD);

  // 距離は content/nordic.ts のルートが持っているものをそのまま使う。
  // 地図の側にもう一組 km を書くと、片方だけ直したときに黙って食い違う。
  // 街の名前で引き当てる（「ストックホルム（友だちの家に7泊）」のような
  // 補足つきの表記があるので、括弧から先は落として比べる）。
  const bare = (s: string) => s.replace(/（.*$/, "");
  const km = new Map(ROUTE.map((l) => [`${bare(l.from)}|${bare(l.to)}`, l.km]));
  // 区間の id。地図の線と、下の区間カードを同じものとして扱うのに要る
  // （`docs/nordic-fund.md` 提案3）。付け合わせは km と同じく街の名前で行う。
  const legId = new Map(ROUTE.map((l) => [`${bare(l.from)}|${bare(l.to)}`, l.id]));

  // いまどこまで来たか。`here` が分かっているときだけ、通った道と
  // これからの道を塗り分ける。分からないときは全部「これから行く道」。
  //
  // トップページでは、いる場所が分かるのは画面が出たあと（`TripNow` が
  // `/island-api/state` を読む）。そのときは同じ `is-done` を DOM で付ける。
  // だから区間にも街にも `data-seq` を持たせてある。
  const hereSeq = here != null ? seqOf[here] : undefined;
  const done = (s: number) => hereSeq != null && s <= hereSeq;

  // 飛行機の区間。地図では1本の破線で、街のピンを2つ持たない
  // （出発地のクタイシは画面の外）。降りる街は seq が最小のところ。
  const flySeq = Math.min(...cities.map((c) => c.seq));
  const flyLegId = ROUTE.find((l) => l.move === "fly")?.id;

  /* ---- 札の置きどころを、ここで決める -----------------------------
     焼き込み（`map.json`）が持っているのは**いちばん置きたい場所と、その候補**で、
     最後に置く場所ではない。ぶつかる相手——街の名札の紙、「いま ここ」の金の札、
     国と海の名前、方位磁針、縮尺——は、位置も大きさもこちら側にしかない。

     **「いま ここ」は旅の日数ぶんある。** その日いる街にだけ出るので、1日ぶんで
     合わせても、次の街に着いた日にまた下敷きになる。だから**街ぜんぶの金の札**を、
     出ているものとして場所を取る。

     実際に起きていたこと（390px・dpr2 で実測）:
       197km      ワルシャワの名札に 93% 隠れて読めない
       290km      「いま ここ」に左を食われて「0km」に見える
       287km      ビャウィストクの名札に 32% 隠れ
       スウェーデン ストックホルムに着いた日、金の札に 41.6% 隠れる
     どれも「置いた場所」ではなく「置き方」の話なので、1つずつ動かさない。 */
  const fixed: Box[] = [];
  for (const c of cities) {
    fixed.push(cityLabel(c).hold);
    const r = PIN[c.kind] ?? 9;
    /* ピンそのものも塞がない。札が街の丸に乗ると、どの街か分からなくなる。
       **丸のぶんだけにする。** ここを大きく取ると、短い区間（ワルシャワ〜
       ビャウィストクは 98 しかない）で線の真ん中に距離の札が置けなくなり、
       札が線の外へ 97 も逃げる。逃げた先は隣の区間の札の真上だった。 */
    fixed.push(boxAt(c.x, c.y, r * 2 + 6, r * 2 + 6));
    // ゴールの「ここに、会いたい人がいる」も、その場所に出しっぱなし。
    if (c.kind === "goal") fixed.push(boxAt(c.x + GOAL_DX, c.y + r + 52, 384, 50));
  }
  fixed.push(boxAt(fly.chip[0], fly.chip[1], 356, 52));
  /* 国境の遮断棒。8 × 38 の棒を、越える向きに合わせて回してある。
     **回した形のまま押さえる。** 44 角の四角で押さえると、棒の細いほうにも
     22 の余白を取ることになって、距離の札が線から 127 も離れた。
     **ここを入れていなかったせいで、295km の札が棒の上に出ていた**（実測 11.8%）。 */
  for (const b of borders) fixed.push(tiltBox(boxAt(b.x, b.y, 14, 44), b.deg));
  /* 名前が場所を取るのは**平らに敷いたところまで**（`washBox`）。
     そのまわりのぼかし（`hazeBox`）は、乗られても字が読めなくなるものではない。
     ぼかしまで塞ぐと、ストックホルムの金の札が街のまわりのどこにも置けなくなって、
     いちばん置きたくない真上（国名に 41.6% 乗る場所）に落ちていた。 */
  for (const s of seas) {
    const t = textBox(s.x, s.y, s.name.length, s.size, 0.26);
    fixed.push(tiltBox(merge(washBox(t), cellBox(s.x, s.y, s.name.length, s.size, 0.26)), s.rot));
  }
  for (const [slug, l] of Object.entries(labels)) {
    const len = (name[slug] ?? slug).length;
    fixed.push(merge(washBox(textBox(l.x, l.y, len, l.size, 0.24)), cellBox(l.x, l.y, len, l.size, 0.24)));
  }
  fixed.push(boxAt(cx, cy, COMPASS_R * 2, COMPASS_R * 2));
  fixed.push({ x: scale.x - 8, y: scale.y - 46, w: scale.len + 16, h: 70 });

  const inPaper = (b: Box) =>
    b.x > 6 && b.y > 6 && b.x + b.w < view.w - 6 && b.y + b.h < view.h - 6;

  /** 距離の札（紙と数字）の箱。**描くときもここから取る。** */
  const kmPlate = (kmv: number, at: readonly number[]): Box => {
    // 数字と「km」で幅を見積もる。半角は約 0.58 文字ぶん。
    const w = (String(kmv).length + 2) * 0.58 * KM_FS + 12;
    return { x: at[0] - w / 2, y: at[1] - 22, w, h: 30 };
  };
  /** ぶつかりを測るときの場所。紙より字の枡のほうが上下に出る。 */
  const kmHold = (kmv: number, at: readonly number[]): Box =>
    merge(kmPlate(kmv, at), {
      // 高さは字の大きさで決まる（半角でも枡の背は変わらない）。幅だけ半角ぶん。
      x: at[0] - (String(kmv).length + 2) * 0.58 * KM_FS * 0.5,
      y: at[1] - KM_FS * 1.2,
      w: (String(kmv).length + 2) * 0.58 * KM_FS,
      h: KM_FS * 1.55,
    });

  /* 金の札は、**距離の札がいちばん置きたい場所も避ける。**
     先に置いたほうが勝つ作りにすると、金の札が線の真ん中を取ってしまい、
     距離の札が線から 117 も離れたところへ追い出される（実測）。
     距離は「その区間を何km歩くか」なので、線から離れたら意味が消える。 */
  const wants: Box[] = legs.flatMap((l) => {
    const kmv = km.get(`${cityName[l.from]}|${cityName[l.to]}`);
    return l.kmAt && kmv ? [kmHold(kmv, l.kmAt)] : [];
  });

  /* 「いま ここ」の札を、街ごとに立てる場所。
     **街ぜんぶを、出ているものとして置く。** 出るのは1日に1つだが、
     旅は17日あるので、どの日に開いても読めないといけない。 */
  const hereAt = new Map<string, [number, number]>();
  const taken: Box[] = [...fixed];
  for (const c of cities) {
    const home = hereBoxAt(c, HERE_SPOTS[0]);
    let best = HERE_SPOTS[0];
    let bestScore = Infinity;
    for (const sp of HERE_SPOTS) {
      const b = hereBoxAt(c, sp);
      if (!inPaper(b)) continue;
      // 街から離れた場所ほど、少しだけ損をさせる。**離れすぎた札は、
      // 何も指していない札になる**（`docs/island-design.md` 6章）。
      const away = Math.hypot(b.x - home.x, b.y - home.y);
      const score = clash(b, fixed) + clash(b, wants) + away * 18;
      if (score < bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    hereAt.set(c.id, best);
    taken.push(hereBoxAt(c, best));
  }

  const kmSpot = new Map<string, number[]>();
  for (const l of legs) {
    const kmv = km.get(`${cityName[l.from]}|${cityName[l.to]}`);
    if (!l.kmAt || !kmv) continue;
    // 候補は「いちばん置きたい場所」から近い順に並んでいる（`build_nordic_map.py`）。
    // 後ろの候補ほど線から遠いので、そのぶんを足してから、いちばん少ないものを選ぶ。
    const spots: number[][] = l.kmSpots.length ? l.kmSpots : [l.kmAt];
    let at = l.kmAt;
    let bestScore = Infinity;
    spots.forEach((sp, i) => {
      const b = kmHold(kmv, sp);
      if (!inPaper(b)) return;
      // sp[2] は「いちばん置きたい場所からどれだけ動くか」（ワールド単位）。
      // 少しぶつかってでも線のそばに置く、という重みにしてある。
      const score = clash(b, taken) + (sp[2] ?? i * 8) * 12;
      if (score < bestScore) {
        bestScore = score;
        at = sp;
      }
    });
    kmSpot.set(`${l.from}-${l.to}`, at);
    taken.push(kmHold(kmv, at));
  }

  return (
    <>
      {/* 紙の上に載るのは俯瞰の絵。押せる大きさの地図は、押すと別に立ち上がる。
          390px の紙の上では、ラトビアのかたちは 28px 角しか取れない
          （`components/atlas/MapZoom.tsx` に測った数と、そう決めた理由）。 */}
      <MapZoom
        label="北欧ヒッチハイクのルート地図"
        hint="国か街を押すと、その国の紙へ。指で動かして見てください。"
      >
      <svg
      className="nmap"
      viewBox={`0 0 ${view.w} ${view.h}`}
      data-here={here ?? undefined}
      role="img"
      aria-label="ジョージアを出て、ポーランドからバルト三国を北上し、フェリーで北欧へ抜けるルートの地図"
    >
      <defs>
        <linearGradient id="nmSea" x1="0.1" y1="0" x2="0.35" y2="1">
          <stop className="nm-sea-a" offset="0" />
          <stop className="nm-sea-b" offset="0.52" />
          <stop className="nm-sea-c" offset="1" />
        </linearGradient>
        <linearGradient id="nmLand" x1="0" y1="0" x2="0.2" y2="1">
          <stop className="nm-land-a" offset="0" />
          <stop className="nm-land-b" offset="1" />
        </linearGradient>
        <radialGradient id="nmGlint">
          <stop className="nm-glint-a" offset="0" />
          <stop className="nm-glint-b" offset="1" />
        </radialGradient>
        {/* 浅瀬はふちをぼかす。かたい切り替わりを作らない（島の絵の原則） */}
        <filter id="nmShelf" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        {/* 陸が海に落とす影。これがあると陸が「浮いた板」に見える。 */}
        <filter id="nmLandDrop" x="-6%" y="-6%" width="112%" height="112%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {/* 名前の下に敷く地のふち。**かたい切り替わりを作らない**（島の絵の原則5）。
            ここをぼかさないと、海の上に角の丸い板が浮いて「札」に見える。
            動かないものなので、1コマごとの焼き直しにはならない。 */}
        <filter id="nmWash" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="4.4" />
        </filter>
        <filter id="nmDrop" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.28" />
        </filter>
        <clipPath id="nmLandClip">
          <path d={land} />
        </clipPath>
      </defs>

      {/* ---- 海 ---------------------------------------------------- */}
      <rect width={view.w} height={view.h} fill="url(#nmSea)" />
      {/* うねり。島の海と同じ、うっすら流れる線 */}
      <g className="nm-swell">
        {Array.from({ length: 16 }, (_, i) => {
          const y = 30 + i * 58;
          return (
            <path
              key={i}
              d={`M${(i % 3) * 96 - 60} ${y}q46 -13 92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0`}
            />
          );
        })}
      </g>
      {/* きらめき。陸から離れた開いた海にだけ置いてある（ac-reference 1章） */}
      <g className="nm-glints">
        {glints.map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.42} fill="url(#nmGlint)" />
        ))}
      </g>

      {/* ---- 岸。沖から順に 影 → 浅瀬 → 泡 → 濡れた砂 --------------- */}
      <path className="nm-landdrop" d={land} filter="url(#nmLandDrop)" transform="translate(3 7)" />
      <path className="nm-shelf" d={land} filter="url(#nmShelf)" />
      <path className="nm-shallow" d={land} />
      <path className="nm-foam-lace" d={land} />
      <path className="nm-foam" d={land} />

      {/* ---- 陸 ---------------------------------------------------- */}
      {/* 通らない国どうしの境は描かない。描くと政治の地図になって、
          通る6カ国が主役だということが伝わらなくなる。 */}
      <path className="nm-land" d={land} fill="url(#nmLand)" />
      {Object.entries(countries).map(([slug, d]) => (
        <path key={slug} className={`nm-c nm-c-${slug}`} d={d} />
      ))}
      {/* 国の境。かたい線は引かず、両側に落ちる淡い影だけで分ける。 */}
      {Object.entries(countries).map(([slug, d]) => (
        <path key={`s${slug}`} className="nm-seam" d={d} />
      ))}
      {/* 砂浜。陸の内側にだけ出す（外は濡れた砂と泡が受け持つ） */}
      <g clipPath="url(#nmLandClip)">
        <path className="nm-sand" d={land} />
        <path className="nm-sand-wet" d={land} />
      </g>

      {/* ---- 地面の情報量 ------------------------------------------ */}
      {/* 森と山は、同じパスをずらして3枚。奥から 影 → 光 → 本体。 */}
      <g clipPath="url(#nmLandClip)">
        <path className="nm-hill-shade" d={hills} transform="translate(4 4)" />
        <path className="nm-hill-hi" d={hills} transform="translate(-3 -4)" />
        <path className="nm-hill" d={hills} />
        <path className="nm-wood-shade" d={woods} transform="translate(1.6 2)" />
        <path className="nm-wood-hi" d={woods} transform="translate(-1.4 -1.8)" />
        <path className="nm-wood" d={woods} />
      </g>
      <path className="nm-lake" d={lakes} />
      <path className="nm-river" d={rivers} />
      <path className="nm-grid" d={grid} />

      {/* ---- 国の名前 ----------------------------------------------
           **地形を全部描いたあとに置く。** 森の下に敷くと木に食われるのは
           もちろん、川より先に描くと川が名前の上を通る（エストニアの「ニ」に
           実際に川が乗っていた）。名前は地形の最後。

           **字の下に、その国の色の地を敷く。** 名前が乗る地は、素の草から
           森のいちばん濃いところまで明るさが4倍ちがう。どんな色の字を選んでも、
           草の上で読めれば森の上で消え、森の上で読めれば草の上で消える
           （実測で、いちばん暗い地との比が 1.19〜1.62 しかなかった）。
           薄いフチ（stroke）では埋まらない。フチは字といっしょに消えるものなので、
           読みやすさの勘定に入れてはいけない。

           敷くのは**その国じしんの色**（`.nm-c-<国>`）。紙の札を置くと街の名札に
           見えるが、草の色なら「森がそこだけ開けている」という絵になる。
           ふちはぼかす。かたい切り替わりを作らない（島の絵の原則5）。 --- */}
      {Object.entries(labels).map(([slug, l]) => {
        const w = washBox(textBox(l.x, l.y, (name[slug] ?? slug).length, l.size, 0.24));
        const h = hazeBox(w);
        return (
          <g key={slug}>
            <rect
              className={`nm-wash nm-c-${slug}`}
              x={h.x}
              y={h.y}
              width={h.w}
              height={h.h}
              rx={h.h * 0.36}
              filter="url(#nmWash)"
            />
            <rect
              className={`nm-wash nm-c-${slug}`}
              x={w.x}
              y={w.y}
              width={w.w}
              height={w.h}
              rx={w.h * 0.36}
            />
            <text className="nm-country" x={l.x} y={l.y} fontSize={l.size} textAnchor="middle">
              {name[slug]}
            </text>
          </g>
        );
      })}


      {/* ---- 海の名前 ----------------------------------------------
           海は上ほど明るい（浅瀬の色から沖の色へのグラデーション）。
           明るいほうに合わせた字は、暗いほうで浮く。実測で、3つとも
           1.42〜2.68 しかなかった（大きい字の下限 3.0 も割っている）。

           **深いところの色で、字の乗る地をならす。** 紙の札は敷かない。
           敷くと街の名札と同じ強さになって、どれが街か分からなくなる。
           水そのものが一段深くなっている、という絵にする。 --- */}
      {seas.map((s) => {
        const w = washBox(textBox(s.x, s.y, s.name.length, s.size, 0.26));
        const h = hazeBox(w);
        return (
          <g key={s.name} transform={`rotate(${s.rot} ${s.x} ${s.y})`}>
            <rect
              className="nm-wash is-sea"
              x={h.x}
              y={h.y}
              width={h.w}
              height={h.h}
              rx={h.h * 0.36}
              filter="url(#nmWash)"
            />
            <rect
              className="nm-wash is-sea"
              x={w.x}
              y={w.y}
              width={w.w}
              height={w.h}
              rx={w.h * 0.36}
            />
            <text className="nm-sea-name" x={s.x} y={s.y} fontSize={s.size} textAnchor="middle">
              {s.name}
            </text>
          </g>
        );
      })}

      {/* ---- ジョージアからの飛行機。画面の外から入ってくる --------
           この1本も区間カードを持っている（足代も道しるべも席がある）ので、
           `data-leg` を付けて、ほかの区間と同じように状態を出せるようにする。
           降りるのは、地図に出ている街のうちいちばん手前（seq が最小）のところ。 */}
      <g className="nm-leg is-fly" data-leg={flyLegId} data-seq={flySeq}>
        <path className="nm-leg-look" d={fly.d} strokeWidth="30" />
        <path className="nm-fly" d={fly.d} />
        {/* 飛行機も同じ。破線を重ねずに通しの1本にして、点々をつなぐ */}
        <path className="nm-leg-tie" d={fly.d} strokeWidth="3" />
      </g>
      <g className="nm-chip" transform={`translate(${fly.chip[0]} ${fly.chip[1]})`}>
        <rect x="-178" y="-26" width="356" height="52" rx="26" />
        <text x="0" y="9" textAnchor="middle">
          クタイシから 3時間35分
        </text>
      </g>

      {/* ---- ルート ------------------------------------------------ */}
      {legs.map((l) => {
        const s = LEG[l.move] ?? LEG.hitch;
        const pair = `${cityName[l.from]}|${cityName[l.to]}`;
        const kmv = km.get(pair);
        const at = kmSpot.get(`${l.from}-${l.to}`) ?? l.kmAt;
        return (
          <g
            key={`${l.from}-${l.to}`}
            className={`nm-leg ${s.cls}${done(seqOf[l.to]) ? " is-done" : ""}`}
            data-seq={seqOf[l.to]}
            data-leg={legId.get(pair)}
          >
            {/* 区間カードで開いているところ。線の下に太く1本敷くだけにして、
                線そのものの色は変えない（どの手段かが読めなくなる）。 */}
            <path className="nm-leg-look" d={l.d} strokeWidth={s.width + 26} />
            <path className="nm-leg-case" d={l.d} strokeWidth={s.width + 8} />
            <path className="nm-leg-line" d={l.d} strokeWidth={s.width} strokeDasharray={s.dash} />
            {/* つながった区間。線を1本増やさず、同じ線の芯を明るくする
                （`docs/nordic-fund.md` 提案3）。金額は地図に書かない。 */}
            {/* **芯に破線を渡さない。** 元の線と同じ刻みで重ねると、色がほとんど
                同じなので画素が動かない（実測: フェリー8画素・寄り道8画素しか
                変わらず、目では見分けられなかった）。芯を通しの1本にすると
                **点々が1本につながる**。つながったことを、色ではなく形で言える。 */}
            <path className="nm-leg-tie" d={l.d} strokeWidth={Math.max(3, s.width - 5)} />
            {l.marks.map(([mx, my, ang], i) => (
              <path
                key={i}
                className="nm-arrow"
                d="M-5 -7L7 0L-5 7Z"
                transform={`translate(${mx} ${my}) rotate(${ang})`}
              />
            ))}
            {at && kmv && (
              <>
                {/* 紙も数字も、上で場所を決めた1つの箱から引く。
                    ここで別に計算すると、測ったものと描いたものがずれる。 */}
                <rect
                  className="nm-lab"
                  x={kmPlate(kmv, at).x}
                  y={kmPlate(kmv, at).y}
                  width={kmPlate(kmv, at).w}
                  height={kmPlate(kmv, at).h}
                  rx="9"
                />
                <text className="nm-km" x={at[0]} y={at[1]} textAnchor="middle">
                  {kmv}km
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* ---- 陸の国境。越える向きに直角な、赤白の遮断棒 ------------- */}
      {borders.map((b) => (
        <g key={b.name} className="nm-border" transform={`translate(${b.x} ${b.y}) rotate(${b.deg})`}>
          <rect className="nm-border-bar" x="-4" y="-19" width="8" height="38" rx="4" />
          <rect className="nm-border-tip" x="-4" y="-19" width="8" height="13" rx="4" />
          <rect className="nm-border-tip" x="-4" y="6" width="8" height="13" rx="4" />
        </g>
      ))}

      {/* ---- 押しどころ。国のかたちそのもの ------------------------
           街の丸は絵として正しい大きさ（5〜15px）で描いてあるので、390px の画面では
           当たりが 23px しか取れない。**丸を太らせても直らない。**
           タリンとヘルシンキは中心どうしが 15px しか離れていないので、
           両方に 48px を与えると必ず重なって、押し間違いのほうが増える。

           押しどころを**国のかたち**にする。「街を押すとその国へ」だったものが
           「その国を押すとその国へ」になる。絵と当たりがずれず
           （`docs/island-design.md` 3-1）、どの国も 48px よりはるかに大きい。
           国境をまたぐと行き先が変わるが、それは地図として正しいふるまいで、
           押し間違いではない。

           街のピンはこのあとに描くので、重なったところではピンが勝つ。
           どちらも同じ国の紙へ行くので、どちらが勝っても着く先は変わらない。 */}
      <g className="nm-goes">
        {Object.entries(countries).map(([slug, d]) => (
          <Link
            key={`go-${slug}`}
            href={`/nordic/${slug}`}
            prefetch={false}
            className="nm-go"
            aria-label={name[slug]}
          >
            <path className="nm-cc" d={d} />
          </Link>
        ))}
      </g>

      {/* ---- 街 ---------------------------------------------------- */}
      {cities.map((c) => {
        const lb = LABEL[c.id] ?? { dx: 24, dy: 8, at: "start" as const };
        const big = c.kind === "stay" || c.kind === "goal";
        const r = PIN[c.kind] ?? 9;
        const fs = big ? 34 : 28;
        // 名札の当たり判定。文字幅はカタカナなので、字数×文字サイズでほぼ合う。
        const tw = c.name.length * fs + 12;
        const tx = lb.at === "end" ? c.x + lb.dx - tw : c.x + lb.dx;
        const hr = hitRadius(c, cities);
        return (
          <Link
            key={c.id}
            href={`/nordic/${c.country}`}
            prefetch={false}
            className={`nmap-pin is-${c.kind}${c.cap ? " is-cap" : ""}${done(c.seq) ? " is-done" : ""}${
              here === c.id ? " is-now" : ""
            }`}
            data-id={c.id}
            data-seq={c.seq}
          >
            {/* 指で押せる幅を稼ぐ。絵は小さくても、押せる場所は絵と名前の周り。
                **大きさは隣の街との距離から決める**（`hitRadius`）。68 の決め打ちだと
                タリンとヘルシンキの当たりが重なって、押した国と違う国へ行っていた。 */}
            <rect className="nm-hit" x={c.x - hr} y={c.y - hr} width={hr * 2} height={hr * 2} rx={hr} />
            <rect className="nm-hit" x={tx} y={c.y + lb.dy - fs} width={tw} height={fs + 14} rx="10" />
            <ellipse className="nm-pin-shadow" cx={c.x} cy={c.y + r * 0.55} rx={r * 1.15} ry={r * 0.5} />
            {c.cap ? (
              /* 首都は星。11個ぜんぶ同じ丸だと、点が並んでいるだけに見える。 */
              <g transform={`translate(${c.x} ${c.y}) scale(${r / 13})`}>
                <path
                  className="nm-pin-ring"
                  d="M0 -19L4.6 -6.4L18 -5.9L7.4 2.4L11.1 15.3L0 7.6L-11.1 15.3L-7.4 2.4L-18 -5.9L-4.6 -6.4Z"
                />
                <path
                  className="nm-pin-dot"
                  d="M0 -12L2.9 -4.1L11.4 -3.7L4.7 1.5L7 9.7L0 4.8L-7 9.7L-4.7 1.5L-11.4 -3.7L-2.9 -4.1Z"
                />
              </g>
            ) : (
              <>
                <circle className="nm-pin-ring" cx={c.x} cy={c.y} r={r} />
                <circle className="nm-pin-dot" cx={c.x} cy={c.y} r={r - 5} />
              </>
            )}
            {/* 名前の下に、紙の札を敷く。
                緑の陸と青い海では地の明るさが3倍ちがうので、字の色をどう選んでも
                4.5 : 1 に届かない（実測 2.36〜4.31）。紙の縁取り（stroke）は
                測る側が字といっしょに消すし、実際そこだけ見て読むものでもない。
                **字の下に自分で地を敷く**のが答えで、`/map` も同じ形にしてある。
                箱は押しどころ（`nm-hit`）と同じものを使い回す。 */}
            <rect
              className="nm-lab"
              x={tx - 5}
              y={c.y + lb.dy - fs * 0.82}
              width={tw + 10}
              height={fs * 1.12}
              rx={fs * 0.3}
            />
            <text
              className={`nm-city${big ? " is-big" : ""}`}
              x={c.x + lb.dx}
              y={c.y + lb.dy}
              fontSize={fs}
              textAnchor={lb.at}
            >
              {c.name}
            </text>
            {/* ゴール。この旅は「回る」のではなく「会いに行く」ので、
                着く場所が地図の上でもいちばん強く見えないといけない。 */}
            {c.kind === "goal" && (
              <g className="nm-goal">
                <circle className="nm-goal-halo" cx={c.x} cy={c.y} r={r + 15} />
                {/* 名前も、どういう人かも書かない。相手はこの企画に応募していない
                    実在の人なので、伏せたままで成立する形にしてある
                    （docs/nordic-fund.md 1章）。名前を出していいと分かったら、
                    この一行を差し替えるだけで済む。 */}
                {/* 札は下に出す。上はヘルシンキからのフェリーの線が通っている。 */}
                <g className="nm-chip is-goal" transform={`translate(${c.x + GOAL_DX} ${c.y + r + 52})`}>
                  {/* 字が札のはしに触っていた。桃を濃いほうに替えて札の形が
                      はっきり出たぶん、はみ出しも見えるようになったので広げる。 */}
                  <rect x="-192" y="-25" width="384" height="50" rx="25" />
                  <text x="0" y="9" textAnchor="middle">
                    ここに、会いたい人がいる
                  </text>
                </g>
              </g>
            )}
          </Link>
        );
      })}

      {/* ---- いま ここ ---------------------------------------------- */}
      {/* **街の名札より上に描く。** 札を街の `<Link>` の中に置いていたころ、
          リガの札はストックホルムの「ここに、会いたい人がいる」に、タリンの札は
          ヘルシンキの名札に、それぞれ左右を隠されていた（SVG はあとに書いたものが
          上になる）。人が「いまどこ」を打たなかった日でも札は毎日出るように
          なったので、隠れているのが見えるのは毎日になる。
          いる場所が分かるのは画面が出たあとのこともあるので、札は全部の街に
          置いて、出すかどうかは `TripNow` が `is-now` を付けて決める。 */}
      <g className="nm-heres" aria-hidden>
        {cities.map((c) => {
          const r = PIN[c.kind] ?? 9;
          // 札の真ん中。場所は上で決めてある（街のまわりを回して空いたところ）。
          const hereMid = (city: City) => {
            const b = hereBoxAt(city, hereAt.get(city.id) ?? HERE_SPOTS[0]);
            return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          };
          return (
            <g
              key={c.id}
              className={`nm-here${here === c.id ? " is-now" : ""}`}
              data-id={c.id}
            >
              {/* 波を打たせない。SMIL の `<animate>` を22の街ぶん置いていたが、
                  SMIL は1コマごとに SVG まるごとの焼き直しを起こす。
                  `display: none` の街のぶんも走るので、**誰も触っていない6秒で
                  この面は 5,740ms の CPU を使っていた**（1コマ 28.4ms、うち
                  メインは 1.4ms でほぼ全部ラスタライズ）。
                  街の名前の上には金色の「いま ここ」の札が既に出ているので、
                  同じことを光る輪でもう一度言っている。輪は置いたまま止める。 */}
              <circle cx={c.x} cy={c.y} r={r + 14} fill="none" />
              {/* 札は2枚。**旅程の日付から引いただけの街を「いま ここ」と言わない**
                  （`components/nordic/where.ts`）。本人が打った字で押さえられて
                  いれば「いま ここ」、予定から引いただけなら「きょう ここ」。
                  出すかどうかは `.nmap[data-plan]` で切り替える。 */}
              <g
                className="nm-chip is-here is-sure"
                transform={`translate(${hereMid(c).x} ${hereMid(c).y})`}
              >
                <rect x="-80" y="-25" width="160" height="50" rx="25" />
                <text x="0" y="9" textAnchor="middle">
                  いま ここ
                </text>
              </g>
              <g
                className="nm-chip is-here is-plan"
                transform={`translate(${hereMid(c).x} ${hereMid(c).y})`}
              >
                <rect x="-88" y="-25" width="176" height="50" rx="25" />
                <text x="0" y="9" textAnchor="middle">
                  きょう ここ
                </text>
              </g>
            </g>
          );
        })}
      </g>

      {/* ---- 方位 -------------------------------------------------- */}
      {/* 正角円錐なので真北は場所で傾く。傾きも焼き込んである。

          **N は針といっしょに回す。** 前は針だけ回して N を紙の真上に固定して
          いたので、N の指す先と針の指す先が 8.7° 食い違っていた。方角の印が
          方角と違うほうを指しているなら、それは印ではない。

          **N は円盤の中に置く。** 前は円盤の外（y -66〜-38）に札を出していた。
          焼き込みの位置は北緯 62 の端（y 46）で、円盤の上に 66 も余白が無い。
          SVG は viewBox の外を切るので、**札も N も地図の上ふちで切り落とされて
          いた**（画面に出ていたのは字の下 2 単位ぶん、390px で 0.7px）。
          円盤は自分の地を持っているので、中に入れれば地図のどこへ置いても
          地が変わらない。 */}
      <g className="nm-compass" transform={`translate(${cx} ${cy})`}>
        <circle className="nm-compass-disc" r={COMPASS_R} />
        <g transform={`rotate(${north.deg})`}>
          <text className="nm-compass-t" x="0" y="-25" textAnchor="middle">
            N
          </text>
          <path className="nm-compass-n" d="M0 -22L11 14L0 6L-11 14Z" />
          <path className="nm-compass-s" d="M0 42L11 14L0 6L-11 14Z" />
        </g>
      </g>

      {/* ---- 縮尺。km は投影から計算して焼いてある ------------------ */}
      <g className="nm-scale" transform={`translate(${scale.x} ${scale.y})`}>
        <path className="nm-scale-bar" d={`M0 0h${scale.len}`} />
        <path
          className="nm-scale-tick"
          d={`M0 -9v18M${scale.len} -9v18M${scale.len / 2} -6v12`}
        />
        <rect
          className="nm-lab"
          x={scale.len / 2 - (String(scale.km).length + 2) * 0.58 * 26 * 0.5 - 6}
          y="-40"
          width={(String(scale.km).length + 2) * 0.58 * 26 + 12}
          height="29"
          rx="9"
        />
        <text className="nm-scale-t" x={scale.len / 2} y="-18" textAnchor="middle">
          {scale.km}km
        </text>
      </g>
      </svg>
      </MapZoom>

      {/* 地図の下に、同じ行き先を字でも置く。
          ---------------------------------------------------------
          **地図の上だけでは 48px に届かない**（`docs/island-design.md` 3-2）。
          390px の画面で地図は 340px にしかならないので、いちばん近いタリンと
          ヘルシンキは中心どうしが 15px しか離れていない。両方に 48px の当たりを
          置くと必ず重なる。地図を 1,060px 幅にして横に流せば届くが、
          そうすると**旅の全体が一度に見えなくなる**。地図の役目のほうを守って、
          48px の口は字に持たせた。

          並びは全部押せるので、1枚ずつに厚みを付けない
          （`docs/island-design.md` 3章の例外）。押せない札を1つも混ぜないこと。 */}
      <nav className="nmgo" aria-label="通る6カ国">
        {NORDIC_COUNTRIES.map((c) => (
          <Link key={c.slug} className="nmgo-c" href={`/nordic/${c.slug}`} prefetch={false}>
            <Flag slug={c.slug} size={22} />
            {c.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
