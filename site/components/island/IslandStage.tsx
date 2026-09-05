"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IslandScene, { LAMPS, PROPS, type Item } from "./IslandScene";
import { Sprite, spriteWidth } from "./Sprite";
import { AYATO_HOME, DOORS, GRASS_INSET, ISLAND, SPOTS, type Spot, type SpotId } from "./layout";
import { inset, insideRadii, rng } from "./geometry";
import { LIVE, UI } from "@/content/voice";
import { hasVoice, linesOf } from "@/content/chatter";
import { Gull } from "./Guide";
import Today from "@/components/today/Today";
import { jstNow, readNight } from "@/lib/nightly";
import { useResidentShow } from "@/lib/liveStats";
import Icon from "@/components/ui/IconCore";
import HereFolks from "./HereFolks";
import { here } from "@/lib/here";
import { daysUntil, nextPlan } from "@/content/plans";
import { NOW_FALLBACK } from "@/content/site";
import { opensByItself, todayNews, YOUTUBE, type TodayNews } from "@/lib/todayNews";
import {
  callOut,
  createVillagers,
  stepVillagers,
  talkTo,
  hush,
  rotateInvites,
  villagerAt,
  villagerPose,
  type Resident,
  type Villager,
} from "./villagers";

export type { Resident };

const GRASS_R = inset(ISLAND.radii, GRASS_INSET - 6);
/** あやとの背丈。島の主人公なので、住人より必ず大きい。 */
const AYATO_H = 60;
/**
 * 住人の背丈。あやとより小さく置く。主役はあやと。
 *
 * 46 から 52 に上げた。本物のあつ森は、住人が画面の高さの **15〜34%**
 * （`/tmp/acref/` の 1280×720 の実測。手前の1人で 32〜34%、奥に立っている人で 15〜24%）。
 * こちらは PC で 11.9%、スマホで（横幅に対して）13.6% だった。
 * カメラを寄せて近づける手もあるが、それをやると入口6つが1画面に入らなくなる
 * （4周目レビュー1章と6章は、この1つの数字で引っぱり合っている）。
 * **絵のほうを大きくすれば、寄りを変えずに近づける。** 小屋の背が 78 なので、
 * 52 は「小屋の3分の2の背丈の人」。あやと（60）より小さいままにしてある。
 */
const RESIDENT_H = 52;

/**
 * 島に住んでいる人の絵(視聴者さんが作ったキャラクター)の置き場。
 *
 * `s` の後ろが取り出す大きさ。**画面に出る大きさから決める。**
 * 実測でいちばん大きく出るのがスマホ(dpr3)の 38px で、装置の画素にすると 114。
 * s160 だと 1枚あたり約 40KB を12人ぶん取って、その4割を捨てていた。
 */
const residentIconUrl = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s128`;

/* ---- 建物の見せ方 --------------------------------------------------------
   **島に建っているものは全部押せる**（`docs/island-design.md` 6章）。
   だから「押せる」を印で言う必要がもう無い。建っていること自体が印になる。

   前は6つの入口に「!」の札が立っていた。全部が押せるようになると
   それは10本になって、引きの島で10個が同時に跳ねることになる。
   全部が叫んでいる画面では、どれも目に入らない（3-4「注目させるのは一度に1つ」）。

   **「!」の意味を変えた。「今日ここに何かある」だけに使う。**
   今日の板（`components/today`）が指している場所に1本だけ立つ。
   どれも無い日は0本。だから、出た日に本当に目が行く。

     ふだん     … 何も出ない。建物がそこに建っている
     今日の場所 … 小さい丸に「!」
     近づいた   … 札が開いて名前と「はいる」

   行き先の一覧は、下のバー（スマホ）とページの頭の並び（PC）が持っている。
   島の上に一覧を積む必要はない。
   ------------------------------------------------------------------------ */
/**
 * 今日の板が指している建物。ここにだけ「!」が立つ。
 *
 * **まず板の行き先から引く。** 板が送る先と「!」が立つ場所は同じでなければ、
 * 押した人が別のところに着く。種類ごとの表だけで決めていたときは、
 * 同じ種類で行き先が変わる日（節目は国の日も配信の日もある）に別の建物を指していた。
 */
const spotOfHref = (href: string): SpotId | null => {
  if (!href.startsWith("/")) return null;
  const top = `/${href.split("/")[1]}`;
  return DOORS.find((d) => d.href === top)?.id ?? null;
};

/**
 * 行き先が島の外（YouTube）の日に、代わりに指す建物。
 *
 * 「今夜22時から」しか無い日（tonight）は、どこも指さない。
 * 毎日「!」が出ていたら、出ている日に目が行かなくなるので。
 */
const TODAY_AT: Partial<Record<TodayNews["kind"], SpotId>> = {
  live: "streams",
  plan: "next",
  recipe: "kitchen",
  past: "map",
};
/* ---- 見せ方は、素の関数で決める ------------------------------------------
   起動直後は画面の幅がまだ分からないので、PC の幅（1440）で1回だけ描いている。
   幅が届いた瞬間にカメラを置き直すのだが、そのとき使う寄りの度合いが
   useMemo の値（＝1つ前の描画で決まったもの）だと、**島ぜんぶの引きに置いてから
   寄りへ ease で詰める**ことになる。いちばん重い絵を何十枚も描くのはこれ。

   実測（390×844・到着演出を飛ばす人）: 島に降りてから寄りが決まるまで
   viewBox の幅が 3400 → 1412 → 767 → 530 と 4 秒かけて縮んでいた。
   **最初の4秒、島は「引きの絵」のまま**で、しかも毎フレーム描き直していた。

   box を見る計算を React の外（素の関数）に出して、毎フレームその場で引く。
   ------------------------------------------------------------------------ */
const modeOf = (w: number) => (w < 640 ? "phone" : w < 1024 ? "tablet" : "wide");
/**
 * 表示する横幅(ワールド単位)。縦長では「縦に何単位見せるか」から逆算する。
 *
 * **PC も「島に降り立った視点」を既定にした。**
 * 前は PC だけ島ぜんぶの引きで、1ワールド単位が 0.9px しかなかった。
 * 住人の背丈は 46 単位なので画面には 41px、島の高さ 792px に対して **5%**。
 * 22人ぶんの絵を日替わりで出して、立ち話までさせているのに、
 * PC ではその全部が緑の上の点になっていた（`docs/island-review-3.md` 3位）。
 * 海が画面の 51.9% を占めていたのも同じ理由で、島の外側まで入れていたから。
 *
 * 寄りの度合いは **1ワールド単位あたりの px** で決める。画面の幅で割ると、
 * 大きな画面ほど引いてしまって、住人の大きさが機種で変わる。
 *   スマホ … 390 / 340 = 1.15 px。あやと 60単位 → 69px（画面高の 8%）
 *   PC     … 1440 / 700 = 2.06 px。あやと → 123px（画面高の 16%）
 * 本物のあつ森でも、主人公は画面高のだいたい 1/7（14%前後）。
 * レビューにある「35〜40%」は、実物を測るとそこまで大きくない。16% を狙う。
 *
 * 引いて島ぜんぶを見たい人には、「島ぜんぶ」のボタンがある（wide）。
 * そちらは今までの値をそのまま残す。
 */
const spanOf = (w: number, h: number, wide: boolean) => {
  const aspect = w / Math.max(1, h);
  const m = modeOf(w);
  if (m === "phone") return wide ? 830 : 340;
  if (m === "tablet") return wide ? Math.max(1120, 980 * aspect) : Math.max(430, w / 1.75);
  return wide ? Math.max(1220, 880 * aspect) : Math.max(560, w / 2.05);
};

/* ---- 島の絵を動かすしかけ ------------------------------------------------
   **`viewBox` を1ドット書き換えると、その SVG の中身が全部描き直される。**
   島の地面は色ごとの「島いっぱいのパス」にまとめてあるので、画面の外にある
   部分をブラウザが捨てられない。スマホは 1200 のうち 340 しか見ていないのに、
   毎フレーム島ぜんぶをなぞっていた（内訳は `app/css/island.css` の注）。

   なので **`viewBox` は据え置き、毎フレーム動かすのは `transform` だけ**にする。
   焼いてある絵（アンカー）からのズレを translate と scale で見せて、
   ズレが大きくなったときにだけ焼き直す。実測 23.3ms → 4.8ms。
   ------------------------------------------------------------------------ */
/** 画面の外に余分に焼いておく幅(px)。`--scene-pad` と必ず同じ値にする。 */
const SCENE_PAD = 140;
/** 焼いた絵を、これ以上の倍率で引き伸ばして見せない。1.12 倍までならぼけない。 */
const ZOOM_Q = 1.12;

/**
 * 島の絵の viewBox。画面より各辺 SCENE_PAD だけ広く取る。
 * ここが返す文字列で焼いた絵を「アンカー」と呼ぶ。
 */
function anchorVb(cx: number, cy: number, span: number, w: number, h: number): string {
  const k = Math.max(1, w) / span; // px / ワールド単位
  const ew = w + SCENE_PAD * 2;
  const eh = h + SCENE_PAD * 2;
  const vw = ew / k;
  const vh = eh / k;
  return `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}

/**
 * 看板を出す6つの、まん中。
 *
 * カメラはあやとを追うが、**追いきらずにここへ引き戻す**（`camWant`）。
 * 島に来た人が最初に読むのは入口の名前なので、
 * 主人公の居場所より、入口の並びのほうがカメラの基準として強い。
 */
const SIGN_MID = {
  x: (Math.min(...SPOTS.map((s) => s.x)) + Math.max(...SPOTS.map((s) => s.x))) / 2,
  y: (Math.min(...SPOTS.map((s) => s.y)) + Math.max(...SPOTS.map((s) => s.y))) / 2,
};

/** ここまで来たら札が開く距離(ワールド単位) */
const HERE = 150;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく。 */
const TALK_REACH = 74;
/**
 * 住人の名前が出る距離(ワールド単位)。
 *
 * 入口の札（HERE = 150）より近くにしてある。**主役の優先度**（`island-design.md` 3-7）で
 * 入口が住人より上なので、同じ距離で両方が開くと、行き先の札の隣に名前が並ぶ。
 * 話しかけられる距離（74）の少し外から出はじめる、くらいがちょうどいい。
 */
const NAME_NEAR = 108;

/** 島に着くまでの演出。船ではなく、カモメについて空から降りてくる。 */
const ARRIVE_SPAN = 3400;
/**
 * 最後に島へ降りた日（JST の YYYY-MM-DD）。到着演出を出すかどうかの判断に使う。
 *
 * 前は sessionStorage だったので、タブを閉じるたびに 3.4 秒の演出が入っていた。
 * 毎日来る人には毎日3.4秒の税で、1分の周回のうち 6% を占める。
 * いい演出ほど2回目からは邪魔になるので、localStorage に移して初回だけにした。
 * ただし長く空いた人にはもう一度見せる。帰ってきた感じがするので。
 */
const VISITED = "ayato-island-arrived";
/** これだけ空いたら、もう一度カモメと降りてもらう（日） */
const ARRIVE_AGAIN = 30;
/**
 * 建物に入る前にどこに立っていたか。
 *
 * 前は「島にもどる」で戻るたびに AYATO_HOME まで引き戻されていて、
 * 2軒目に行く気にならなかった。出た場所に立っていれば、島がハブとして働く。
 * タブを閉じたら忘れてよいので sessionStorage。
 */
const RETURN_AT = "ayato-island-at";
/**
 * 一度でも島を歩いたか。
 *
 * 「押したところまで歩いていくよ」は、一度歩けば分かる。それを毎回、
 * 島の下に帯で出しておくのは、分かっている人から場所を取り上げているだけ。
 * 初めての人にだけ数秒出して、そのあとは二度と出さない。
 */
const WALKED = "ayato-island-walked";
/** 案内を出しておく時間(ミリ秒)。読んで、押してみるまでの間だけ。 */
const HINT_SPAN = 5200;

/* ---- 名乗り --------------------------------------------------------------
   島に降りた人が最初に読む文字は「押したところまで歩いていくよ」だけで、
   **この人が誰で、何をしているのかに答える文字が1画面目に1文字も無かった。**
   看板ロゴには書いてあるが、絵として焼き込んであるので読まれていない。
   切り抜きから来た人は、何のサイトか分からないまま帰る。

   島の上に文字を増やすと絵が死ぬ。だから増やさずに、
   **島のほうから口を開く**（`docs/island-play.md` 仕掛け9）。
   吹き出しは住人の会話のものをそのまま使い回す。新しい部品は作らない。

   言うのは「島が何か」ではなく「**この人が何をしているか**」。
   ロゴの副題（旅して、食べて、グルメアプリを作る、夜の居場所）と
   同じことを二度言わないよう、言い方を変えてある。
   地名を1つ入れて、ぼんやりした自己紹介にしない（`content/voice.ts` の決めごと）。
   ------------------------------------------------------------------------ */
const GREETING = `ようこそ、あやと島へ。あやとは毎晩22時、旅先から生配信してる。いまは${NOW_FALLBACK.place}だよ。`;
/** 吹き出しの主が、住人ではなく案内役のカモメであることを表す番号 */
const GUIDE = -1;
const clampToIsland = (x: number, y: number): [number, number] => {
  if (insideRadii(ISLAND.cx, ISLAND.cy, GRASS_R, x, y, ISLAND.squash, 10)) return [x, y];
  const dx = x - ISLAND.cx;
  const dy = y - ISLAND.cy;
  for (let t = 0.96; t > 0; t -= 0.04) {
    const nx = ISLAND.cx + dx * t;
    const ny = ISLAND.cy + dy * t;
    if (insideRadii(ISLAND.cx, ISLAND.cy, GRASS_R, nx, ny, ISLAND.squash, 10)) return [nx, ny];
  }
  return [ISLAND.cx, ISLAND.cy];
};

/** その日付から今日（日本時間）までの日数。日付として読めない値なら null。 */
function daysSince(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const t = jstNow();
  return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(y, m - 1, d)) / 86400000);
}

/**
 * 足元の座標から、押せる建物を引く表。
 *
 * 島の絵（IslandScene）は「看板を出す6つ」にだけ印を付けている。
 * 残りの4つも押せるので、絵のほうにも近づいたら弾んでほしい。
 * 座標は PLACES が唯一の出どころで、絵もそこから作られているから、
 * 足元が一致するものは同じ建物だと分かる。
 */
const DOOR_AT = new Map(DOORS.map((d) => [`${d.x},${d.y}`, d.id] as const));

/** 入口の絵の、画面に出る四角。当たり判定と札の位置はここから作る。 */
function spotBox(sp: Spot) {
  const w = spriteWidth(sp.icon, sp.size);
  return { w, h: sp.size };
}

export default function IslandStage({ residents = [] }: { residents?: Resident[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const lampRef = useRef<SVGSVGElement>(null);
  const ayatoRef = useRef<SVGGElement>(null);
  const ayatoShadowRef = useRef<SVGEllipseElement>(null);
  const villagerRefs = useRef<(SVGGElement | null)[]>([]);
  const markRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** 札を画面の縁へ寄せるための入れ子。建物の当たりは動かさずに、札だけをずらす */
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  /** 札の実寸。縁へ寄せるときに要る。毎フレーム測ると layout が起きるので、開閉のたびに1回だけ */
  const signBox = useRef<{ w: number; h: number }[]>([]);
  /** いま縁に寄せている向き。同じ値を書き続けて属性を触らないための控え */
  const edgeAt = useRef<string[]>([]);
  /** 島の隅に置いてある道具の箱。縁へ寄せた札が、この上に乗らないようにする */
  const uiBoxes = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  /**
   * 札の置き直しが要るか。
   *
   * ふだんはカメラが動いたときだけ置き直せばいい（建物は動かないので）。
   * ただし**札の大きさが変わったとき**は、カメラが止まっていても置き直しが要る。
   * 「!」が立つのも、書体が届くのも、日数が入るのも、カメラが落ち着いた後なので、
   * ここを見ないと古い寸法で詰めた並びのまま残る。
   */
  const platesDirty = useRef(true);
  const whoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  /** 下のバーの背(px)。島をどれだけ上へ寄せるかの計算に使う */
  const barH = useRef(0);
  /* 看板ロゴが画面のどこに居るか（ステージの左上を原点にした px）。
     カメラがあやとを追う以上、島の札はいつかここへ入ってくる。
     入ってきたら看板のほうが引く（下の `data-logo`）。 */
  const logoBox = useRef<{ x: number; y: number; r: number; b: number } | null>(null);
  /** いま看板を引かせているか。同じ値を書き続けて属性を触らないための控え */
  const logoAway = useRef("");

  const [box, setBox] = useState({ w: 1440, h: 900 });
  /** 歩き方の案内。初めての人にだけ、数秒だけ出す。初期値は false（出さない側に倒す） */
  const [hint, setHint] = useState(false);
  const [wide, setWide] = useState(false); // スマホで「島ぜんぶ」
  /**
   * 下のバーの行き先が開いているか。
   *
   * **既定は閉じている。** 島を見ているあいだ、行き先の一覧は要らない。
   * 前は6つのマスが常に出ていて、バーだけで画面の 25%（183px / 726px）を
   * 取っていた。島が主役の面で、島の上に載せた道具が4分の1を占めていた。
   * 畳んだバーは「今日の島」の1行だけになる。行き先は1タップで開く。
   */
  const [barOpen, setBarOpen] = useState(false);
  const [hover, setHover] = useState<SpotId | null>(null);
  /** 名札が開いている入口。近さと hover から決まる。1フレームごとには更新しない。 */
  const [openSpot, setOpenSpot] = useState<SpotId | null>(null);
  const [arriving, setArriving] = useState(true);
  const [readyIcons, setReadyIcons] = useState<Set<string>>(new Set());
  /** いま吹き出しを出している住人。画面の上に固定で出る。 */
  const [talking, setTalking] = useState<{ i: number; text: string } | null>(null);
  /** 奥行きの並び順が変わったときだけ描き直す */
  const [order, setOrder] = useState<string>("");

  const avatar = useRef({ ...AYATO_HOME });
  const facing = useRef(1);
  const walkingNow = useRef(false);
  const target = useRef<{ x: number; y: number } | null>(null);
  const walkingTo = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camRef = useRef({ x: ISLAND.cx, y: ISLAND.cy - 30, span: ARRIVE_SPAN });
  /**
   * 島の絵を最後に焼いた場所（アンカー）と、そのときの画面の大きさ。
   * いまのカメラとの差は transform で見せて、差が大きくなったら焼き直す。
   */
  const anchor = useRef({ x: 0, y: 0, span: 0, w: 0, h: 0 });
  /** 焼いてある viewBox と、いま掛けている transform。React が描き直しても同じ値を書く */
  const sceneVb = useRef("");
  const sceneTf = useRef("");
  /** 到着演出を飛ばす人。最初の1フレームでカメラを目的の位置に置く */
  const snapCam = useRef(false);
  /** 到着演出を飛ばす人かどうか。画面の大きさが分かるたびにカメラを置き直す */
  const skipArrive = useRef(false);
  /** 建物に入るときの立ち位置。戻ってきたらここから始める */
  const leaveAt = useRef<{ x: number; y: number } | null>(null);
  /**
   * 島に降り立った時刻。住人が向こうから声をかけるまでの間を数えるのに使う。
   * まだ降りていないあいだは Infinity にしておく。
   * 引き算が -Infinity になって、条件が勝手に成立しない。
   */
  const landedAt = useRef(Infinity);
  /**
   * この来訪で、島のほうから一度でも口を開いたか。
   *
   * **1回の来訪で、向こうから話しかけてくるのは1回だけ。**
   * カモメの名乗り（初めて来た人）と、住人の「はじめまして／久しぶり」は
   * どちらも「世界のほうが先に口を開く」仕掛けで、狙っている相手が違う。
   *   カモメ … 初めて来た人。この人が誰で何をしているかに答える
   *   住人   … 2回目以降の人。前に来たことを覚えている、を伝える
   * 初めての人には両方あたるので、そこだけカモメを優先して住人を黙らせる。
   * 10秒のあいだに知らない相手が2回話しかけてくるのは、島ではなく客引きになる。
   */
  const spokeFirst = useRef(false);
  const dice = useRef(rng(777));
  const clock = useRef(0);
  const inviteSlot = useRef(-1);
  const boxRef = useRef(box);
  boxRef.current = box;
  /* 毎フレームの計算が見るものは ref に置く。state を見に行くと、
     その state が変わるたびに rAF のループを張り直すことになる。 */
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const hoverRef = useRef<SpotId | null>(hover);
  hoverRef.current = hover;

  const show = useResidentShow();
  const villagers = useMemo(() => createVillagers(residents), [residents]);
  for (const v of villagers) {
    const s = v.icon ? show.get(v.icon) : undefined;
    v.name = s?.name ?? undefined;
    v.photo = s?.photo ?? undefined;
  }

  /* 歩き方の案内。初めて島に立った人にだけ、数秒だけ出して消える。
     覚えたことを言い続けるのは、島の下端を占領しているのと同じなので。 */
  const hintDone = useRef(false);
  const dismissHint = useCallback(() => {
    if (hintDone.current) return;
    hintDone.current = true;
    setHint(false);
    try {
      localStorage.setItem(WALKED, "1");
    } catch {
      /* 覚えられなくても、次にもう一度出るだけ */
    }
  }, []);
  /* 歩き方の案内は、名乗り（カモメの吹き出し）が閉じてから。
     同時に出すと、1画面目に文字の塊が2つ並んで、島がまた隠れる。
     カモメを閉じた指がそのまま次に押すので、順番としてもこちらが後。 */
  useEffect(() => {
    if (hintDone.current || arriving || talking) return;
    let walked = false;
    try {
      walked = !!localStorage.getItem(WALKED);
    } catch {
      /* 読めないときは初めての人として扱う。出しすぎるより出さないほうが害が大きい */
    }
    if (walked) {
      hintDone.current = true;
      return;
    }
    setHint(true);
    const t = setTimeout(() => dismissHint(), HINT_SPAN);
    return () => clearTimeout(t);
  }, [arriving, talking, dismissHint]);

  /** 出発まであと何日。「これから」の札に付ける。 */
  const [days, setDays] = useState<number | null>(null);
  /** 今日、何かある建物。「!」が立つのはここ1つだけ。 */
  const [todaySpot, setTodaySpot] = useState<SpotId | null>(null);
  /** 毎フレームの計算から見るための控え。跳ねる札の箱を広く見るのに使う */
  const todayRef = useRef<SpotId | null>(null);
  todayRef.current = todaySpot;
  /**
   * いま配信の時間か（日本時間 22:00〜25:00）。
   *
   * **島の絵が、現実にいま配信があるかどうかを表す**（`docs/island-play.md` 仕掛け5）。
   * やぐらに灯りがつき、煙が出て、札が「いま配信中」に変わる。
   * 1日3時間しか見られない絵なので、「今しか見られない」がそのまま成立する。
   * しかも見た人が取る行動（配信を見にいく）が、このサイトの目的そのもの。
   */
  const [onAir, setOnAir] = useState(false);
  useEffect(() => {
    /* 静的書き出しなので、ビルド時の「今日」を焼き込まないよう画面が出てから決める。
       **1分ごとに数え直す。** 21:59 に開いたまま22時をまたぐ人がいる。
       そこで島が変わらないと、島の絵は現実と同期していないことになる。 */
    const read = () => {
      const now = new Date();
      setDays(daysUntil(nextPlan(now)?.date, now));
      const n = todayNews(now);
      setTodaySpot(spotOfHref(n.href) ?? TODAY_AT[n.kind] ?? null);
      setOnAir(readNight(now).onAir);
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);

  // キャラ画像は外から取ってくるので、先に読んでおく。
  // SVG の image に直接URLを入れると、失敗したとき壊れた画像の枠が出てしまう。
  useEffect(() => {
    let alive = true;
    for (const v of villagers) {
      if (!v.icon) continue;
      const img = new Image();
      img.src = residentIconUrl(v.icon);
      img.onload = () => {
        if (alive) setReadyIcons((prev) => (prev.has(v.icon!) ? prev : new Set(prev).add(v.icon!)));
      };
    }
    return () => {
      alive = false;
    };
  }, [villagers]);

  /* 到着演出と、前に立っていた場所。どちらも降りた瞬間の話なのでまとめて置く。 */
  useEffect(() => {
    // さっき出ていった建物の前から始める。無ければ、いつもの家の前。
    try {
      const at = sessionStorage.getItem(RETURN_AT)?.split(",").map(Number);
      if (at?.length === 2 && Number.isFinite(at[0]) && Number.isFinite(at[1])) {
        const [x, y] = clampToIsland(at[0], at[1]);
        avatar.current.x = x;
        avatar.current.y = y;
      }
    } catch {
      /* 読めなければ家の前から。位置が戻らないだけなので気にしない */
    }

    let apart: number | null = null;
    try {
      // 日付になっていない値（前の版が入れていた "1" や、道具が入れる印）は
      // 「ついさっき来た」として扱う。演出を出す側に倒すと毎回出てしまう。
      const raw = localStorage.getItem(VISITED);
      apart = raw ? daysSince(raw) ?? 0 : null;
    } catch {
      /* プライベートモードなどで読めなくても、演出を出すだけなので気にしない */
    }
    /* 「来た」を書き留めるのは、降り終わってから。
       **この鍵を読むだけの人がいる。** 今日の板は `ayato-island-arrived` を見て
       「初めての人には自分から開かない」を決めている（`components/today/Today.tsx`）。
       ここで先に書くと、初めて来た人が「2回目の人」に見えて、
       配信中の日に板とカモメが両方開く。読ませてから書く。 */
    const remember = () => {
      try {
        localStorage.setItem(VISITED, jstNow().date);
      } catch {
        /* 書けなくても、次にもう一度演出が出るだけ */
      }
    };
    // 初めての人(null)には見せる。長く空いた人にも、もう一度。
    const firstEver = apart === null;
    const again = firstEver || (apart ?? 0) >= ARRIVE_AGAIN;
    /* 名乗りも同じ人に同じ回数だけ。到着の演出は「来た」しか言っていないので、
       そのあとに1文だけ足して、演出に中身を持たせる。
       **初めての人には、どの日でも名乗る。** 板のほうが初回は開かないので重ならない。
       長く空いて帰ってきた人だけ、板が自分から開く日は黙る。 */
    /* 板が自分から開く日は名乗らない。カモメと板が両方開くと、また島が見えなくなる。
       判断は `lib/todayNews.ts` の opensByItself 1か所だけ（板側もこれを見ている）。
       **幅はその場で測る。** この効果は1回しか走らないので、state の box は
       まだ仮の PC 幅（1440）のままで、スマホでも「開く日」と見えてしまう。
       板はスマホでは開かないので、そのままだと板もカモメも出ない日ができる。 */
    const phone =
      modeOf(hostRef.current?.getBoundingClientRect().width ?? window.innerWidth) === "phone";
    const greet = again && (firstEver || !opensByItself(todayNews().kind, phone));
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!again || still) {
      // 最初の1フレームでカメラを置く。ここで span を 0 にしてから ease で追わせると、
      // 極端に寄った絵を何十フレームも描いてから所定の位置に戻ることになる。
      //
      // 「置き直す」は1回では足りない。画面の大きさを測るのは ResizeObserver で、
      // それが返ってくるまでは PC の幅（＝島ぜんぶが入る引き）を仮に使っている。
      // 1回で止めると、島ぜんぶの引きから寄りまでを ease で詰めることになって、
      // いちばん重い絵を50フレームぶん描いてしまう。**起動直後のカクつきはこれだった。**
      // 幅が分かるたびに置き直す。
      skipArrive.current = true;
      snapCam.current = true;
      setArriving(false);
      landedAt.current = performance.now();
      remember();
      if (greet) {
        spokeFirst.current = true;
        setTalking({ i: GUIDE, text: GREETING });
      }
      return;
    }
    const t = setTimeout(() => {
      setArriving(false);
      landedAt.current = performance.now();
      remember();
      if (greet) {
        spokeFirst.current = true;
        setTalking({ i: GUIDE, text: GREETING });
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  /* 島を出るとき、立っていた場所を残す。
     Next.js の画面遷移では pagehide が来ないので、消えるときに書く。 */
  useEffect(
    () => () => {
      const p = leaveAt.current ?? avatar.current;
      try {
        sessionStorage.setItem(RETURN_AT, `${Math.round(p.x)},${Math.round(p.y)}`);
      } catch {
        /* 書けなければ次は家の前から。それだけのこと */
      }
    },
    [],
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    /* 看板ロゴの箱。**毎フレーム測らない。**
       看板の入りの動き（logo-in）が終わるまでは小さく傾いた箱が返るので、
       置き直しのついでと、動きが終わったあとの1回だけ測る。 */
    const readLogo = () => {
      const host = hostRef.current;
      const logo = host?.parentElement?.querySelector<HTMLElement>(".hero-logo");
      if (!host || !logo) return;
      const h = host.getBoundingClientRect();
      const l = logo.getBoundingClientRect();
      logoBox.current = l.width < 4 ? null : { x: l.left - h.left, y: l.top - h.top, r: l.right - h.left, b: l.bottom - h.top };
    };
    const read = () => {
      const r = el.getBoundingClientRect();
      // 幅が分かった＝寄りの度合いが決まる。到着演出を飛ばす人は、ここで置き直す。
      // 仮の幅（PC）で作った引きの絵から ease で寄ると、いちばん重い絵を何十枚も描く。
      if (skipArrive.current) snapCam.current = true;
      barH.current = barRef.current?.offsetHeight ?? 0;
      readLogo();
      setBox({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    const settle = window.setTimeout(readLogo, 900);
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
    };
  }, []);

  /* バーは「今日の島」が出てから背が決まる。カメラの寄せ量がそれを見ているので、
     出たあとに測り直す。測るのは1回でよくて、ここが変わるのは板が開いた時だけ。 */
  useEffect(() => {
    const h = barRef.current?.offsetHeight ?? 0;
    if (h && h !== barH.current) barH.current = h;
  });

  /* 札の実寸を控えておく。縁へ寄せるときに要る。
     **毎フレーム測らない。** offsetWidth は layout を起こすので、
     大きさが変わりうるとき（開いた・閉じた・画面が変わった・日数が動いた）だけ測る。 */
  useEffect(() => {
    /* 札の大きさは、開いた・閉じたのほかに、「!」が立った・書体が届いた・
       日数が入った、でも変わる。**変わったことを見張る**（状態を数え上げると、
       数え落としたぶんだけ古い寸法で詰めることになる）。 */
    const ro = new ResizeObserver((es) => {
      for (const e of es) {
        const i = Number((e.target as HTMLElement).dataset.i);
        const bs = e.borderBoxSize?.[0];
        signBox.current[i] = bs
          ? { w: bs.inlineSize, h: bs.blockSize }
          : { w: e.contentRect.width, h: e.contentRect.height };
      }
      platesDirty.current = true;
    });
    for (let i = 0; i < DOORS.length; i++) {
      const el = markRefs.current[i]?.querySelector<HTMLElement>(".spot-mark");
      if (!el) continue;
      el.dataset.i = String(i);
      signBox.current[i] = { w: el.offsetWidth, h: el.offsetHeight };
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // 島の隅の道具（島をながめる・島の地図・今日の島）と看板ロゴ。
    // ここは動かないので、札と同じときに1回測れば足りる。
    const host = hostRef.current;
    const hb = host?.getBoundingClientRect();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    if (host && hb) {
      for (const el of host.querySelectorAll<HTMLElement>(
        '.stage-view, .stage-atlas, .stage-index, .today[data-place="corner"]',
      )) {
        const r = el.getBoundingClientRect();
        boxes.push({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
      }
      // 看板ロゴはここに入れない。札とぶつかったときは**ロゴのほうが引く**と
      // 決めてあるので（下の data-logo）、札を動かすと二重に避けることになる。
    }
    uiBoxes.current = boxes;
    platesDirty.current = true;
  }, [openSpot, box.w, box.h, days, onAir, barOpen, todaySpot]);

  const mode = modeOf(box.w);
  /** スマホは島に降り立った視点。「島ぜんぶ」を押すと引いて全体を見る。 */
  /** 島に降り立った視点か。「島ぜんぶ」を押していないあいだは、どの幅でもこちら */
  const follow = !wide;

  /**
   * カメラが行きたい先。
   *
   * **ref だけを見る。** state を見ると、寄り引きが変わるたびに rAF のループを
   * 張り直すことになり、そのあいだ snapCam が1つ前の寄りで置かれてしまう。
   *
   * スマホの「島ぜんぶ」では、下のバーに隠れるぶん島を上へ寄せる。
   * 画面のまん中に置くと下ふちがバーの裏に沈むので、
   * 見えている範囲（バーより上）のまん中に来るように、バーの半分だけ下を向く。
   */
  const camWant = useCallback(() => {
    const b = boxRef.current;
    const m = modeOf(b.w);
    /* 寄っているあいだは、どの幅でもあやとを追う。
       追わずに寄ると、あやとが画面の外へ歩いていってしまう。
       少し上を向くのは、足元より「これから歩く先」が見えたほうがいいから。

       ただし**追いきらない。** あやとだけを見て寄ると、島の骨格（入口6つの並び）が
       画面から外れる。実測で、1440×900 で6枚のうち画面に入っているのは2枚だった。
       あやとが画面のまん中から離れてよい量に上限を決めて、
       その範囲では入口6つのまん中（SIGN_MID）を見る。
       PC はこれだけで6枚とも画面に入る（frame 702×386 に対して入口の広がりは 624×324）。 */
    if (!wideRef.current) {
      const ex = avatar.current.x;
      const ey = avatar.current.y - (m === "phone" ? 92 : 70);
      const s = spanOf(b.w, b.h, false);
      const vh = (s * b.h) / Math.max(1, b.w);
      const pull = (d: number, max: number) => (d > max ? max : d < -max ? -max : d);
      return { x: ex + pull(SIGN_MID.x - ex, s * 0.22), y: ey + pull(SIGN_MID.y - ey, vh * 0.18) };
    }
    if (m === "phone") {
      const s = spanOf(b.w, b.h, wideRef.current);
      const lift = barH.current && b.w ? (barH.current / 2) * (s / b.w) : 0;
      return { x: ISLAND.cx, y: ISLAND.cy - 40 + lift };
    }
    if (m === "wide") return { x: ISLAND.cx - 40, y: ISLAND.cy + 6 };
    return { x: ISLAND.cx, y: ISLAND.cy - 40 };
  }, []);

  /* ---- 動きは React の外で ------------------------------------------------
     毎フレーム setState すると、160枚のスプライトを毎回作り直すことになって
     スマホで目に見えてカクつく（`docs/island-design.md`）。
     カメラ・あやと・住人・札の位置は、ref から DOM に直接書く。
     React が描き直すのは「奥行きの並びが変わったとき」と
     「札が開いた／閉じたとき」だけ。
     ---------------------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastOrder = "";
    let lastOpen: SpotId | null = null;
    /** 名前を出している住人。1人だけ（下の「名前が出るのは、いちばん近い1人」） */
    let lastNear = -1;
    /** 前のフレームの viewBox。同じなら島を描き直さない */
    let lastVb = "";
    /** 前のフレームの倍率(px/ワールド単位)。住人の当たりの大きさはこれで決まる */
    let lastK = 0;
    /** 前のフレームであやとに書いた transform。同じなら書かない */
    let lastMe = "";
    /** 住人ごとの、前に書いた transform。同じなら書かない */
    const lastPose: string[] = [];
    /** 住人を最後に動かしてから貯めた時間(ms)。放置中は 24fps に落とす */
    let castWait = 0;
    /** 前のフレームでカメラが動いたか。動いていれば住人も 60fps で動かす */
    let camBusy = true;
    /** 前のフレームであやとが歩いていたか */
    let movingLast = false;
    /** 動きを減らす設定。住人は歩かない（`docs/island-design.md` 3-5 の例外） */
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      clock.current = t;
      const b = boxRef.current;

      /* --- 住人を動かす値段 -----------------------------------------------
         島は誰も触っていない1秒で 280ms の CPU を使っていた（`/board` は 43ms）。
         内訳を交互A/Bで割ると、rAF を止めるだけで 130ms まで落ちる。
         **その大半は「住人12人ぶんの transform を毎フレーム書くこと」**で、
         書き換えた要素の外接矩形ぶん島の SVG が描き直される。

         住人は 1秒に数px しか歩かない。60回書いても24回書いても、
         目に見えるものは変わらない。**カメラもあやとも止まっているあいだだけ**
         24fps に落とす。歩いているあいだは触らない（そこは手ざわりに直結する）。
         動きを止めたい人（reduce）には、そもそも歩かせない。 */
      const busy = camBusy || movingLast || !!target.current || walkingTo.current !== null;
      castWait += dt;
      const stepCast = !still && (busy || castWait >= 40);
      if (stepCast) {
        stepVillagers(villagers, castWait, dice.current);
        castWait = 0;
      }
      const slot = Math.floor(t / 9000);
      if (slot !== inviteSlot.current) {
        inviteSlot.current = slot;
        rotateInvites(villagers, slot, (v) => hasVoice(v.icon));
      }

      // --- あやたを動かす ---
      const me = avatar.current;
      let vx = 0;
      let vy = 0;
      const k = keys.current;
      if (k.ArrowLeft || k.a) vx -= 1;
      if (k.ArrowRight || k.d) vx += 1;
      if (k.ArrowUp || k.w) vy -= 1;
      if (k.ArrowDown || k.s) vy += 1;
      if (vx || vy) target.current = null;
      else if (target.current) {
        const dx = target.current.x - me.x;
        const dy = target.current.y - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 7) target.current = null;
        else {
          vx = dx / d;
          vy = dy / d;
        }
      }
      const moving = !!(vx || vy);
      if (moving) {
        const n = Math.hypot(vx, vy) || 1;
        const sp = 4.2 * (dt / 16.67);
        const [nx, ny] = clampToIsland(me.x + (vx / n) * sp, me.y + (vy / n) * sp);
        me.x = nx;
        me.y = ny;
        // ayato.png は左を向いている絵。右へ歩くときに左右を反転する
        if (vx !== 0) facing.current = vx > 0 ? -1 : 1;
      }
      if (moving !== walkingNow.current) {
        walkingNow.current = moving;
        ayatoRef.current?.classList.toggle("walking", moving);
      }

      /* --- 向こうから口を開く ---
         そばに来た人に、住人のほうから声をかける（`docs/island-play.md` 3つの原理の3番）。
         条件が3つそろった1回だけで、あとは毎回 null が返るので毎フレーム呼んでよい。
         カモメが名乗った来訪では黙ってもらう（向こうから話しかけるのは1来訪に1回）。 */
      if (!spokeFirst.current) {
        const who = callOut(villagers, avatar.current, t - landedAt.current);
        if (who) {
          spokeFirst.current = true;
          openTalkRef.current?.(villagers.indexOf(who));
        }
      }

      // --- 話しかけに行った相手のそばまで来たか ---
      if (walkingTo.current !== null) {
        const i = walkingTo.current;
        const who = villagers[i];
        if (!who || Math.hypot(me.x - who.x, (me.y - who.y) * 1.3) <= TALK_REACH) {
          walkingTo.current = null;
          target.current = null;
          if (who) openTalkRef.current?.(i);
        }
      }

      // --- カメラ ---
      const cam = camRef.current;
      const want = camWant();
      // 寄りの度合いも、いまの画面の幅からその場で引く。
      // 1つ前の描画で決まった値を使うと、幅が届いた最初の1フレームで
      // 「PC の引き」に置いてしまい、そこから寄りまで ease で詰めることになる。
      const spanNow = spanOf(b.w, b.h, wideRef.current);
      if (snapCam.current) {
        // 到着演出を飛ばす人。寄りも位置も、最初の1フレームで所定の場所に置く
        snapCam.current = false;
        cam.x = want.x;
        cam.y = want.y;
        cam.span = spanNow;
      } else {
        const ease = 0.09 * (dt / 16.67);
        cam.x += (want.x - cam.x) * ease;
        cam.y += (want.y - cam.y) * ease;
        const far = cam.span > spanNow * 1.25;
        cam.span += (spanNow - cam.span) * (far ? 0.019 : 0.09) * (dt / 16.67);
        // 追いつく手前で止める。近づくほど遅くなる式なので、放っておくと
        // 目に見えない差を永遠に詰め続けて、そのあいだ島を描き直し続ける。
        if (Math.abs(want.x - cam.x) < 0.05) cam.x = want.x;
        if (Math.abs(want.y - cam.y) < 0.05) cam.y = want.y;
        if (Math.abs(spanNow - cam.span) < 0.05) cam.span = spanNow;
      }

      const vbW = cam.span;
      const vbH = (cam.span * b.h) / Math.max(1, b.w);
      const vbX = cam.x - vbW / 2;
      const vbY = cam.y - vbH / 2;
      const vb = `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;
      /* カメラが止まっているあいだは、何も書かない。
         止まっているのに書き直すと、何もしていない画面でずっと GPU が回る。
         文字にしたときに同じなら、画面には出ない差なので触らない。 */
      const camMoved = vb !== lastVb;
      /* カメラが止まったのに、絵が 1.11 倍に引き伸ばされたまま残ることがある
         （到着の寄せが終わった瞬間など）。止まった1回だけ焼き直して、等倍に戻す。
         **止まっているあいだの絵がいちばん長く見られる。** そこがぼけていては困る。 */
      if (!camMoved && sceneTf.current) anchor.current.span = 0;
      if (camMoved || sceneTf.current) {
        lastVb = vb;
        /* --- 島の絵を動かす ---
           **`viewBox` は書き換えない。** 書き換えると島ぜんぶが描き直される
           （上の SCENE_PAD の注）。焼いてある絵とのズレを transform で見せる。 */
        const a = anchor.current;
        const kd = b.w / cam.span; // px / ワールド単位
        let s = a.span / cam.span;
        let tx = -(cam.x - a.x) * kd;
        let ty = -(cam.y - a.y) * kd;
        // 余白を使い切ったか、引き伸ばしすぎたか、画面の大きさが変わったら焼き直す
        if (
          a.w !== b.w ||
          a.h !== b.h ||
          s > ZOOM_Q ||
          s < 1 / ZOOM_Q ||
          Math.abs(tx) > SCENE_PAD * 0.85 ||
          Math.abs(ty) > SCENE_PAD * 0.85
        ) {
          a.x = cam.x;
          a.y = cam.y;
          a.span = cam.span;
          a.w = b.w;
          a.h = b.h;
          sceneVb.current = anchorVb(cam.x, cam.y, cam.span, b.w, b.h);
          sceneRef.current?.setAttribute("viewBox", sceneVb.current);
          lampRef.current?.setAttribute("viewBox", sceneVb.current);
          s = 1;
          tx = 0;
          ty = 0;
        }
        const tf =
          s === 1 && tx === 0 && ty === 0
            ? ""
            : `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
        if (tf !== sceneTf.current) {
          sceneTf.current = tf;
          if (sceneRef.current) sceneRef.current.style.transform = tf;
          if (lampRef.current) lampRef.current.style.transform = tf;
        }
      }
      const sx = (wx: number) => ((wx - vbX) / vbW) * b.w;
      const sy = (wy: number) => ((wy - vbY) / vbH) * b.h;

      // --- あやと ---
      // 立ち止まっているあいだも毎フレーム書いていた。同じ値でも属性に書けば、
      // その要素のぶんだけ島が描き直される。文字にして同じなら触らない。
      const meTf = `translate(${me.x.toFixed(1)} ${me.y.toFixed(1)}) scale(${facing.current} 1)`;
      if (meTf !== lastMe) {
        lastMe = meTf;
        ayatoRef.current?.setAttribute("transform", meTf);
        if (ayatoShadowRef.current) {
          ayatoShadowRef.current.setAttribute("cx", me.x.toFixed(1));
          ayatoShadowRef.current.setAttribute("cy", (me.y + 1).toFixed(1));
        }
      }

      /* --- いま島にいる人（`docs/island-here.md`） ---
         あやとの居場所を、置いてくる側（`components/live/Here.tsx`）に渡す。
         Firestore へ書くのは2秒に1回で、そちらが自分で間引く。

         **誰も居なければ、ここは長さを見るだけで終わる。**
         島の SVG の外にある要素なので、書いても島は描き直されない。 */
      here.pos.x = me.x;
      here.pos.y = me.y;
      here.pos.live = true;
      const marks = here.marks;
      if (marks.length) {
        /* 便りは2秒に1回しか来ない。届いた場所へそのまま置くと2秒ごとに飛ぶので、
           いまの場所をそこへ寄せていく（0.4秒でほぼ着く）。歩いて見える。 */
        const ease = 1 - Math.pow(0.02, dt / 400);
        for (const m of marks) {
          if (m.self) {
            // 自分の印は、いま動かしているあやとの頭の上。便りを待たない
            m.x = me.x;
            m.y = me.y - AYATO_H - 4;
          } else {
            const dx = m.tx - m.x;
            const dy = m.ty - m.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.05) {
              m.x += dx * ease;
              m.y += dy * ease;
            } else {
              m.x = m.tx;
              m.y = m.ty;
            }
          }
          const el = m.el;
          if (!el) continue;
          const off =
            m.x < vbX - 120 || m.x > vbX + vbW + 120 || m.y < vbY - 160 || m.y > vbY + vbH + 160;
          // 文字にして同じなら書かない。住人と同じ理由（書けば、そのぶん描き直される）
          const tf = off ? "" : `translate(${sx(m.x).toFixed(1)}px, ${sy(m.y).toFixed(1)}px)`;
          if (tf !== m.tf) {
            m.tf = tf;
            el.style.display = off ? "none" : "";
            if (!off) el.style.transform = tf;
          }
        }
      }

      // --- 住人 ---
      // 住人が動いたか、カメラが動いたときだけ書く。どちらも無いフレームでは
      // 画面の中の位置が1ドットも変わらないので、書くだけ島を汚すことになる。
      const castWrite = stepCast || camMoved;

      /* --- 名前が出るのは、いちばん近い1人だけ ---
         名札は「名前を出していい」と決めた人ぶん出る。本番では日によって
         10人を超えるので、島の上が名前の一覧になっていた（実測で1画面に4枚）。
         **注目させるのは一度に1つ**（`docs/island-design.md` 3-4）。
         入口の札と同じ決まりを住人にも当てる。名前は「話しかけられるところまで
         来た」の合図で、遠くの人の名前は要らない。 */
      let nearWho = -1;
      if (castWrite || moving) {
        let nd = NAME_NEAR * NAME_NEAR;
        for (let i = 0; i < villagers.length; i++) {
          const v = villagers[i];
          const dx = me.x - v.x;
          const dy = (me.y - v.y) * 1.35;
          const d = dx * dx + dy * dy;
          if (d < nd) {
            nd = d;
            nearWho = i;
          }
        }
        if (nearWho !== lastNear) {
          whoRefs.current[lastNear]?.classList.remove("is-near");
          whoRefs.current[nearWho]?.classList.add("is-near");
          lastNear = nearWho;
        }
      }

      for (let i = 0; castWrite && i < villagers.length; i++) {
        const v = villagers[i];
        // 画面の外にいる住人は書かない。寄りのときは12人のうち大半が外にいて、
        // そのぶん毎フレーム属性を書き換えては島を汚していた（外側に余白を足して、
        // 入ってくる手前のフレームから書きはじめる）。
        const off =
          v.x < vbX - 120 || v.x > vbX + vbW + 120 || v.y < vbY - 160 || v.y > vbY + vbH + 160;
        const g = villagerRefs.current[i];
        if (g && !off && stepCast) {
          const pose = villagerPose(v, t);
          // 左右は反転しない。
          //
          // 本番の住人の絵を実際に取ってきて見たら、横向きではなく**正面向き**の
          // マスコットだった（本番の lh3.googleusercontent.com から4人ぶん確認）。
          // 正面の絵を反転しても「向かい合っている」ようには見えないうえ、
          // 持ち物（お玉・ウクレレ・花）だけが裏返る。
          // これは視聴者さんが投げ銭で作った絵なので、勝手に裏返さない。
          //
          // 立ち話が向かい合って見えるかどうかは、位置と間で表す。
          /* 同じ姿勢なら書かない。**書いた要素は、動いていなくても描き直される。**
             12人のうち、立ち止まって遠くを見ている人（gaze）は姿勢が変わらないし、
             ゆっくり揺れている人も、0.1度きざみでは何フレームも同じ値になる。 */
          const tf = `translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)}) rotate(${pose.rot.toFixed(1)})`;
          if (tf !== lastPose[i]) {
            lastPose[i] = tf;
            g.setAttribute("transform", tf);
          }
        }
        const w = whoRefs.current[i];
        if (w) {
          w.style.display = off ? "none" : "";
          // 合図を出しているかどうかは、絵に出さない（足元の光をやめた）。
          // 誰が話したがっているかは、その人が向こうから口を開くことで伝わる。
          if (!off) w.style.transform = `translate(${sx(v.x).toFixed(1)}px, ${sy(v.y).toFixed(1)}px)`;
        }
      }

      // --- 入口の札 ---
      let best: SpotId | null = hoverRef.current;
      if (!best) {
        let bd = HERE;
        for (const sp of DOORS) {
          const d = Math.hypot(me.x - sp.x, (me.y - sp.y) * 1.35);
          if (d < bd) {
            bd = d;
            best = sp.id;
          }
        }
      }
      // 入口は島に建っていて動かない。画面の中での位置が変わるのはカメラが動いたときだけ。
      // カメラが止まっているあいだに書き直すと、6つぶんの計算し直しがただ増える。
      if (camMoved || platesDirty.current) {
        platesDirty.current = false;
        const k = b.w / vbW;
        /* 住人の当たりを、絵の大きさに合わせる。
           絵はカメラの倍率で 53px（スマホ）から 94px（PC）まで伸び縮みするのに、
           当たりだけ 44×56 の固定だった。PC では見えている住人の下4割が押せず、
           横は 48px も割っていた（`docs/island-design.md` 3-1「押す場所は物そのもの」）。
           12人とも同じ大きさなので、ステージに1回書けば足りる。 */
        if (k !== lastK) {
          lastK = k;
          hostRef.current?.style.setProperty("--ws", `${Math.max(TAP_MIN, RESIDENT_H * k).toFixed(1)}px`);
          /* いま島にいる人の丸いアイコンも、倍率で伸び縮みさせる。
             固定の大きさにすると、寄ったときだけ地図のピンのように浮いて、
             島の上に立っている感じが消える。26 ワールド単位＝住人の頭ぶん。 */
          hostRef.current?.style.setProperty("--hs", `${Math.min(56, Math.max(26, 26 * k)).toFixed(1)}px`);
        }
        /* 札が看板ロゴの下へ入ったか。**入ったら看板のほうが引く。**
           看板は一度読めば済む飾りで、札は今から歩いて行く先だから、
           どちらか1枚しか読めないなら札を残す。
           札の箱は測らずに見積もる。測ると毎フレーム layout を起こすし、
           早めに引くぶんには困らない（半端に重なった絵がいちばん読めない）。 */
        const lb = logoBox.current;
        let under = false;
        /* 縁に寄せる札が避ける場所。
           島の隅のボタン（島をながめる・島の地図・今日の島）と、看板ロゴと、
           **画面に入っている札そのもの**。ここを見ずに縁へ寄せると、
           寄せた札が、いま読めている札やボタンの上に乗って両方読めなくなる。 */
        const taken = uiBoxes.current.slice();
        /** この画面の札の居場所。ぜんぶ出そろってから、縁へ寄せるものを決める */
        const plates: {
          i: number;
          el: HTMLDivElement;
          /** 建物の足元（画面px）。矢がどっちを指すかはここから決まる */
          fx: number;
          fy: number;
          rect: { x: number; y: number; w: number; h: number };
          out: boolean;
        }[] = [];
        const pad = 8;
        /* 上は「あと◯日」のシールのぶん、下はスマホの下バーと隅のボタンのぶん空ける。
           バーの上に札が乗ると、島の道具と行き先が同じ層で重なって読めない。 */
        const padTop = 32;
        const padBottom = (modeOf(b.w) === "phone" ? barH.current : 0) + 46;
        for (let i = 0; i < DOORS.length; i++) {
          const el = markRefs.current[i];
          if (!el) continue;
          const sp = DOORS[i];
          const px = sx(sp.x);
          const py = sy(sp.y);
          el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
          if (lb && !under && sp.id === best) {
            // 札は建物の頭の上に出る。横は中心から ±100、縦はそこから 60 上まで見る
            const top = py - sp.size * k - 60;
            const bottom = py - sp.size * k + 8;
            under = px + 100 > lb.x && px - 100 < lb.r && bottom > lb.y && top < lb.b;
          }
          // 絵の大きさは倍率で変わるので、測り直す。
          // 当たり判定は指で押せる最小(48px)まで広げるが、
          // 札の高さは絵の実寸を使う。最小に合わせると、引きで札が建物から浮いてしまう。
          const artW = spotBox(sp).w * k;
          const artH = sp.size * k;
          el.style.setProperty("--hw", `${Math.max(TAP_MIN, artW).toFixed(1)}px`);
          el.style.setProperty("--hh", `${Math.max(TAP_MIN, artH).toFixed(1)}px`);
          const mh = Math.max(12, artH);
          el.style.setProperty("--mh", `${mh.toFixed(1)}px`);

          /* 縁へ寄せるかどうかを見るのは、いま開いている1枚だけ。
             前は看板の6枚が常に出ていたので、6枚ぶんの詰め合わせが要った。
             名前が出るのは近づいた1軒だけになったので（`島に降りた1画面目から
             字を減らす`）、寄せる相手も1枚しかない。 */
          const sz = sp.id === best ? signBox.current[i] : null;
          if (sz && sz.w) {
            /* 箱を少し大きく見ておく。
               「今日ここに何かある」の1枚は 10px 跳ねる（spotHop）ので、
               計算どおりの箱で詰めると、跳ねた先で隣に食い込む。
               紙一重で通すより、6px ずつ広く見て余らせるほうが読める。 */
            // 「あと◯日」のシールは板の外（真上）に出ているので、その背も箱に入れる
            const gy = (todayRef.current === sp.id ? 13 : 6) + (sp.countdown ? 26 : 0);
            const rect = { x: px - sz.w / 2 - 6, y: py - mh - 12 - sz.h - gy, w: sz.w + 12, h: sz.h + gy + 6 };
            const out =
              rect.x < pad ||
              rect.x + rect.w > b.w - pad ||
              rect.y < padTop ||
              rect.y + rect.h > b.h - padBottom ||
              // 島の隅の道具の下に入った札も、寄せ直す対象にする。
              // 半分隠れた札は、画面の外にあるのと同じで読めない。
              uiBoxes.current.some(
                (q) =>
                  rect.x < q.x + q.w &&
                  rect.x + rect.w > q.x &&
                  rect.y < q.y + q.h &&
                  rect.y + rect.h > q.y,
              );
            // 画面に入っている札は、寄せる札が避ける相手になる
            if (!out) taken.push(rect);
            plates.push({ i, el, fx: px, fy: py, rect, out });
          } else if (edgeAt.current[i]) {
            edgeAt.current[i] = "";
            el.removeAttribute("data-edge");
            const pin0 = pinRefs.current[i];
            if (pin0) pin0.style.transform = "";
          }
        }

        /* --- 画面から出た看板は、縁に寄せて名前だけ残す ---
           島の入口6つは「島に来た人が最初に読むもの」なので、
           建物が画面の外にあっても名前は読めていなければならない。
           寄りを引いて6枚を入れる手は採らない。390幅では入口の広がり 624×324 に対して
           画面が 340×633 しかなく、6枚が入る寸法まで引くと住人が 24px の点になる。
           **建物の当たりは動かさない。** ずらすのは札だけで、
           杭は「そっちに建っている」を指す矢に変わる（`island.css`）。 */
        for (const pl of plates) {
          const pin = pinRefs.current[pl.i];
          if (!pin) continue;
          const { rect } = pl;
          let dx = 0;
          let dy = 0;
          let dir = "";
          if (pl.out) {
            let left = rect.x;
            let top = rect.y;
            if (left < pad) dx = pad - left;
            else if (left + rect.w > b.w - pad) dx = b.w - pad - (left + rect.w);
            if (top < padTop) dy = padTop - top;
            else if (top + rect.h > b.h - padBottom) dy = b.h - padBottom - (top + rect.h);
            left += dx;
            top += dy;
            /* 先に置いたものと重なるなら、下へ逃がす（縦に並べば両方読める）。
               1周では、逃がした先でまた別のものと重なることがあるので数周する。
               **下へしか動かさない。** 上へ戻すと、避けたはずのものへ帰っていく。 */
            for (let pass = 0; pass < 3; pass++) {
              let moved = false;
              for (const q of taken) {
                if (left < q.x + q.w && left + rect.w > q.x && top < q.y + q.h && top + rect.h > q.y) {
                  const push = q.y + q.h + 6 - top;
                  if (push > 0) {
                    top += push;
                    dy += push;
                    moved = true;
                  }
                }
              }
              if (!moved) break;
            }
            taken.push({ x: left, y: top, w: rect.w, h: rect.h });
            /* 矢は、寄せた先から見て**建物が実際にどっちにあるか**を指す。
               「どっちへ押しやったか」で決めると、上へはみ出した札を下げたときに
               建物と反対を指す（札はもともと建物の頭の上に出るので）。 */
            const ax = pl.fx - (left + rect.w / 2);
            const ay = pl.fy - (top + rect.h / 2);
            dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "l" : "r") : ay < 0 ? "u" : "d";
          }
          if (dir !== edgeAt.current[pl.i]) {
            edgeAt.current[pl.i] = dir;
            if (dir) pl.el.setAttribute("data-edge", dir);
            else pl.el.removeAttribute("data-edge");
          }
          pin.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : "";
        }
        if (lb) {
          const now = under ? "away" : "";
          if (now !== logoAway.current) {
            logoAway.current = now;
            if (now) hostRef.current?.setAttribute("data-logo", now);
            else hostRef.current?.removeAttribute("data-logo");
          }
        }
      }
      if (best !== lastOpen) {
        lastOpen = best;
        setOpenSpot(best);
      }

      /* --- 奥行きの並び。変わったときだけ描き直す ---
         誰も動いていないフレームでは並びも変わらない。それでも文字列を作ると、
         1秒に60回ぶんのゴミを出すだけになる。動いたフレームだけ数える。 */
      if (stepCast || moving) {
        const sig = villagers.map((v) => Math.round(v.y / 24)).join(",") + "|" + Math.round(me.y / 24);
        if (sig !== lastOrder) {
          lastOrder = sig;
          setOrder(sig);
        }
      }

      camBusy = camMoved;
      movingLast = moving;
      raf = requestAnimationFrame(step);
    };

    /* --- 見えていないあいだは、島を動かさない -------------------------------
       `/` は 5.5画面ぶんある。下まで巻いた人は島を見ていないのに、
       そのあいだも1コアの3割を使い続けていた（放置1秒 280ms / `/board` は 43ms）。
       別のタブに移った人も同じ。**見えていないものは動かさない。** */
    let alive = false;
    let onScreen = true;
    const run = () => {
      if (alive || document.hidden || !onScreen) return;
      alive = true;
      last = performance.now();
      // CSS のほうの動き（木の揺れ・波・舟・ちょうちょ）も一緒に起こす
      hostRef.current?.classList.remove("is-away");
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      hostRef.current?.classList.add("is-away");
    };
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        if (onScreen) run();
        else stop();
      },
      // 画面に半分かかるまでは動かす。境目で行ったり来たりさせない
      { rootMargin: "80px" },
    );
    if (hostRef.current) io.observe(hostRef.current);
    const vis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", vis);
    run();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      /* 島から離れたら、あやとの居場所を渡すのをやめる。
         島の外のページでは、その人はページの建物のそばに立つ（`lib/here.ts`）。 */
      here.pos.live = false;
    };
  }, [camWant, villagers]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) {
        keys.current[k] = true;
        dismissHint();
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current[k] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /** 入口へ歩く。押した瞬間に札が開くので、着く前から行き先が分かる。 */
  const goTo = (s: Spot) => {
    target.current = { x: s.x, y: s.y + 34 };
    walkingTo.current = null;
    dismissHint();
    setOpenSpot(s.id);
    if (wide) setWide(false);
    setBarOpen(false);
  };

  const openTalk = useCallback(
    (i: number) => {
      villagers.forEach((o) => {
        if (o.says) hush(o);
      });
      talkTo(villagers[i], linesOf(villagers[i].icon));
      setTalking({ i, text: villagers[i].says ?? "" });
    },
    [villagers],
  );
  const openTalkRef = useRef<((i: number) => void) | null>(null);
  openTalkRef.current = openTalk;

  const closeTalk = useCallback(() => {
    setTalking((cur) => {
      if (cur && villagers[cur.i]) hush(villagers[cur.i]);
      return null;
    });
  }, [villagers]);

  /** 住人に話しかける。遠ければまず歩いて近づいてから。 */
  const approach = useCallback(
    (i: number) => {
      const v = villagers[i];
      const me = avatar.current;
      dismissHint();
      if (Math.hypot(me.x - v.x, (me.y - v.y) * 1.3) <= TALK_REACH) {
        openTalk(i);
        return;
      }
      v.mood = "stand";
      v.left = 9000;
      walkingTo.current = i;
      target.current = { x: v.x + (me.x > v.x ? 40 : -40), y: v.y + 8 };
    },
    [villagers, openTalk],
  );

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 吹き出しが出ているときは、どこを押しても閉じるだけ。ゲームと同じ作法。
    if (talking) {
      closeTalk();
      return;
    }
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    // 島を触ったら、行き先の一覧は引っ込める。島を見に来た指の邪魔をしない
    setBarOpen(false);
    const host = hostRef.current!;
    const r = host.getBoundingClientRect();
    const cam = camRef.current;
    const vbW = cam.span;
    const vbH = (cam.span * r.height) / Math.max(1, r.width);
    const wx = cam.x - vbW / 2 + ((e.clientX - r.left) / r.width) * vbW;
    const wy = cam.y - vbH / 2 + ((e.clientY - r.top) / r.height) * vbH;
    dismissHint();
    const who = villagerAt(villagers, wx, wy, RESIDENT_H * 0.6);
    if (who) {
      approach(villagers.indexOf(who));
      return;
    }
    walkingTo.current = null;
    target.current = { x: wx, y: wy };
  };

  /* 景色の絵は、島に置いたら二度と動かない。
     だから要素そのものを1度だけ作って使い回す。並び替えのたびに作り直すと、
     住人が木を1本またぐたびに 152 枚のスプライトを React が全部見に行くことになる。
     同じ要素を渡せば、React はその手前で止まって中まで降りてこない。 */
  const sceneArt = useMemo(
    () =>
      PROPS.map((p, i) => ({
        kind: "prop" as const,
        y: p.y,
        key: `o${i}`,
        p,
        art: <Sprite key={`o${i}`} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />,
      })),
    [],
  );

  /* 景色・住人・あやとを、足元の y で並べ替えてから描く。
     こうしないと木の手前に立つべき住人が木の裏に隠れてしまう。
     order が変わったときだけ組み直す。 */
  const layers = useMemo(() => {
    const cast = villagers.map((v, i) => ({ kind: "villager" as const, y: v.y, key: `v${i}`, i, v }));
    const me = { kind: "ayato" as const, y: avatar.current.y, key: "me" };
    return [...sceneArt, ...cast, me].sort((a, b) => a.y - b.y);
    // order は「並びが変わった」ことだけを伝える合図
  }, [order, villagers, sceneArt]);

  /* 島の絵の viewBox と transform は、毎フレーム rAF が ref に書いている。
     React が描き直したときも**同じ値**を書かないと、次のフレームまで絵が飛ぶ。
     なので JSX からも ref の中身をそのまま渡す。まだ焼いていなければ、ここで焼く。 */
  const cam = camRef.current;
  if (!sceneVb.current) {
    anchor.current = { x: cam.x, y: cam.y, span: cam.span, w: box.w, h: box.h };
    sceneVb.current = anchorVb(cam.x, cam.y, cam.span, box.w, box.h);
  }
  const vb0 = sceneVb.current;
  const tf0 = sceneTf.current;

  return (
    <div
      className={`stage has-today${arriving ? " is-arriving" : ""}${talking ? " is-talking" : ""}`}
      /* いま配信の時間か。島の絵（やぐらの灯りと煙）を CSS で切り替える */
      data-live={onAir ? "on" : undefined}
      /* ヒーローの見出し（看板ロゴ）の置き場。**カメラの寄りとは別のもの。**
         PC も寄りを既定にしたが、こちらまで "close" にすると
         ロゴが右上へ寄って「今日の島」の板と重なる。見出しの置き場は変えない。 */
      data-view={mode === "phone" && follow ? "close" : "wide"}
      data-mode={mode}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg
        ref={sceneRef}
        className="stage-svg"
        viewBox={vb0}
        style={tf0 ? { transform: tf0 } : undefined}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <IslandScene />
        {layers.map((l) => {
          if (l.kind === "prop") {
            const p: Item = l.p;
            const art = l.art;
            const sid = p.spot ?? DOOR_AT.get(`${p.x},${p.y}`);
            if (!sid) return art;
            // 押せる建物は、札が開いているときだけ軽く弾む。近づいたら返す反応
            return (
              <g
                key={l.key}
                className={`spot-art${openSpot === sid ? " is-on" : ""}`}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              >
                {art}
              </g>
            );
          }
          if (l.kind === "villager") {
            const v: Villager = l.v;
            if (!v.icon || !readyIcons.has(v.icon)) return null;
            return (
              <g
                key={l.key}
                ref={(el) => {
                  villagerRefs.current[l.i] = el;
                }}
                transform={`translate(${v.x.toFixed(1)} ${v.y.toFixed(1)})`}
              >
                <ellipse cx={0} cy={0} rx={13} ry={5} fill="#134a2c" opacity={0.18} />
                <image
                  href={residentIconUrl(v.icon)}
                  x={-RESIDENT_H / 2}
                  y={-RESIDENT_H}
                  width={RESIDENT_H}
                  height={RESIDENT_H}
                  preserveAspectRatio="xMidYMax meet"
                />
              </g>
            );
          }
          return (
            <g key={l.key}>
              <ellipse ref={ayatoShadowRef} cx={avatar.current.x} cy={avatar.current.y + 1} rx={22} ry={8} fill="#134a2c" opacity={0.22} />
              <g
                ref={ayatoRef}
                transform={`translate(${avatar.current.x} ${avatar.current.y}) scale(${facing.current} 1)`}
                className="ayato"
              >
                <image
                  href="/characters/ayato.webp"
                  x={-AYATO_H * 0.43}
                  y={-AYATO_H}
                  width={AYATO_H * 0.86}
                  height={AYATO_H}
                  preserveAspectRatio="xMidYMax meet"
                />
              </g>
            </g>
          );
        })}

        {/* ------- 配信中だけ、やぐらに人がいる -------
            `docs/island-play.md` 仕掛け5。**島の絵そのものが、現実にいま配信が
            あるかどうかを表す。** 日本時間 22:00〜25:00 の3時間しか出ない絵なので、
            「今しか見られない」が演出ではなく事実として成立する。

            ふだんは CSS で display:none。出ていないあいだの値段はゼロ。
            座標は tower-studio.webp の窓を実測して出した（スプライトは
            197×291、物体は 144×252、足元が (520,600) で高さ 128 ワールド単位。
            1画素 = 0.508 ワールド単位）。
            灯りは**景色**であって、押せる合図ではない（`island-world.md` 3.4）。
            建物の押しかたは何も変わらない。 */}
        <g className="live-art" aria-hidden>
          {/* 灯のついた窓。上のふたつと、下の戸。
              **ぼかした光の輪は置かない。** 一度置いて撮ってみたら、草の上に
              半透明の円盤が乗っているようにしか見えなかった（島は板なので、
              にじんだ光がそもそも世界に無い）。窓が明るいだけで「人がいる」は伝わる。 */}
          <path d="M496.7 518.7 L504.8 523.3 L504.8 536.5 L496.7 531.9 Z" fill="var(--window)" />
          <path d="M532.2 523.3 L540.3 518.7 L540.3 531.9 L532.2 536.5 Z" fill="var(--window)" />
          <path d="M499.2 568.5 L506.8 573.1 L506.8 586.8 L499.2 582.2 Z" fill="var(--window)" />
          {/* 戸から地面へこぼれる光。輪ではなく、戸の形から伸びる台形。
              地面に落ちる光は本当にこの形をしているので、円盤には見えない */}
          <path d="M497 588 L509 588 L520 606 L492 606 Z" fill="#ffe6a8" opacity={0.22} />
        </g>
      </svg>

      {/* 夜の灯り。時間帯の色かぶせより上に重ねる */}
      <svg
        ref={lampRef}
        className="stage-lamps"
        viewBox={vb0}
        style={tf0 ? { transform: tf0 } : undefined}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id="lampG">
            <stop offset="0" stopColor="#fff6d4" stopOpacity="1" />
            <stop offset="0.28" stopColor="#ffdc8a" stopOpacity="0.72" />
            <stop offset="0.62" stopColor="#ffc860" stopOpacity="0.3" />
            <stop offset="1" stopColor="#ffbe4d" stopOpacity="0" />
          </radialGradient>
        </defs>
        {LAMPS.map(([lx, ly, r], i) => (
          <circle key={i} cx={lx} cy={ly} r={r} fill="url(#lampG)" />
        ))}
      </svg>

      {/* 島の下ふち。海をページの下地へ溶かして、切り口が出ないようにする。
          tokens.css が .stage の ::before / ::after を時間帯の色に使っているので、
          擬似要素ではなく実体を1枚置いている。 */}
      <span className="stage-shore" aria-hidden />

      {/* 建物の札。
          **10軒とも静かに建っていて、名前が出るのは近づいた1軒だけ**
          （`docs/island-design.md` 3-4「注目させるのは一度に1つ」）。
          看板を出す6つ（`sign`）は残っているが、それが並ぶのは下のバーと、
          島の外のページの頭。島の上には並べない（同 6章）。
          島の上に常に出ていていいのは、1日1つの「!」と「あと◯日」だけ。 */}
      <div className="labels">
        {DOORS.map((sp, i) => {
          const on = openSpot === sp.id;
          const today = todaySpot === sp.id;
          /* 出発までの日数のシール。**閉じていても、この1軒にだけ貼っておく。**
             「これから」はいちばん目立たせると決まっている入口で
             （`docs/island-design.md` 6章）、日数は毎日変わるので、
             島に降りた瞬間に見える価値がある数少ない字。
             今日その日なら「!」が立つので、そちらに任せて重ねない。 */
          const hasDays = !!sp.countdown && days !== null && days >= 0;
          const count = hasDays && !today;
          /* 配信中のやぐらは、行き先が YouTube に変わる。
             **島に留めずに外へ出すのが正解**（`docs/island-play.md` 5章）。
             島は留守番の場所で、配信がある3時間だけは、島より向こうが本体。 */
          const live = onAir && sp.id === "streams";
          const href = live ? YOUTUBE : sp.href;
          const label = live ? LIVE.label : sp.label;
          const blurb = live ? LIVE.blurb : sp.blurb;
          const go = live ? LIVE.go : UI.enter;
          /* 建物そのものを押したとき。
             指とマウスは、まず**歩く**。島を歩くのがこの画面のいちばんの手ざわりで、
             着けば札が開いて、そこから入れる。ただし
               - もう札が開いている（＝そばに立っている）
               - キーボードや読み上げから実行した（`detail === 0`。歩く絵が返らない）
             このどちらかなら、歩かせる意味が無いのでそのまま入る。 */
          const enterOrWalk = (e: React.MouseEvent) => {
            /* 配信中のやぐらは歩かせない（行き先が島の外なので寄っても意味がない）。
               Ctrl や ⌘ を押しながらの「新しいタブで開く」も、そのまま通す。
               ここで preventDefault すると、リンクにした意味が半分無くなる。 */
            if (live || e.detail === 0 || on || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
              leaveAt.current = { x: sp.x, y: sp.y + 34 };
              return;
            }
            e.preventDefault();
            goTo(sp);
          };
          return (
            <div
              key={sp.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className={`spot${on ? " is-on" : ""}${today ? " is-today" : ""}${count ? " is-count" : ""}`}
            >
              {/* 建物の当たり。**`<a href>` にしてある。**
                  `<button>` だと長押しの「新しいタブで開く」が出ないし、
                  読み上げにもキーボードにも「行き先」として見えない。
                  建物は入口なので、まず行き先であるべき。 */}
              <Link
                data-ui
                href={href}
                prefetch={false}
                className="spot-hit"
                /* 1軒につき、キーボードの止まり先はいつも1つ。
                   札が出ているときは札のほうが行き先（名前と一言と「はいる」が
                   ぜんぶ載っている）。出ていないときだけ、この当たりが受ける。 */
                tabIndex={on ? -1 : 0}
                onClick={enterOrWalk}
                onMouseEnter={() => setHover(sp.id)}
                onMouseLeave={() => setHover((v) => (v === sp.id ? null : v))}
                onFocus={() => setHover(sp.id)}
                onBlur={() => setHover((v) => (v === sp.id ? null : v))}
                aria-label={live ? LIVE.aria : `${sp.label}にはいる`}
              />
              {/* 札の入れ物。**建物の当たりと別にしてある。**
                  建物が画面から出たときは札だけを縁へ寄せるので、
                  同じ入れ物に入れていると当たりまで一緒に動いて、
                  絵のないところが押せることになる（`island-design.md` 3-1）。 */}
              <span
                className="spot-pin"
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
              <Link
                data-ui
                href={href}
                target={live ? "_blank" : undefined}
                rel={live ? "noopener noreferrer" : undefined}
                className="spot-mark"
                tabIndex={on ? 0 : -1}
                // 10軒ぶんの札がいつも画面にいるので、先読みを止めないと
                // 島を開いただけで全ページの RSC を取りにいく（実測で約3MB）。
                // 静的書き出しなので、先読みで得られるものは小さい。
                prefetch={false}
                // 戻ってきたときに、この建物の前に立っていてほしい。
                // 遠くから札を押して入ることもあるので、あやとの現在地ではなく建物の足元を残す。
                onClick={() => {
                  leaveAt.current = { x: sp.x, y: sp.y + 34 };
                }}
              >
                {today && (
                  <span className="spot-bang" aria-hidden>
                    !
                  </span>
                )}
                {/* 閉じた札の上に印は1つまで。「!」が立つ日は、そちらに譲る。
                    小さい丸の上に「!」と「あと1日」が並ぶと、どちらも読めない。 */}
                {hasDays && (count || on) && (
                  <em className="spot-badge" aria-hidden>
                    {days === 0 ? "今日" : `あと${days}日`}
                  </em>
                )}
                <span className="spot-text">
                  <b>{label}</b>
                  <i>{blurb}</i>
                </span>
                <span className="spot-go">
                  {go}
                  <Icon name="right" size={12} />
                </span>
              </Link>
              </span>
            </div>
          );
        })}
      </div>

      {/* 住人。押す所は建物の当たり判定より奥に置く。
          行き先を塞がないため、会話はあくまでおまけ。 */}
      <div className="labels is-cast">
        {villagers.map((v, i) => (
          <div
            key={`v${i}`}
            ref={(el) => {
              whoRefs.current[i] = el;
            }}
            className="who"
          >
            {v.icon && readyIcons.has(v.icon) && (
              <button data-ui className="who-hit" onClick={() => approach(i)} aria-label={UI.talkTo} />
            )}
            {v.name && (
              <span className="who-name">
                {v.photo && <img src={v.photo} alt="" loading="lazy" />}
                <b>{v.name}</b>
              </span>
            )}
          </div>
        ))}
      </div>

      {/* いま、ほんとうにここにいる人（`docs/island-here.md`）。
          上の住人（視聴者さんが作ったキャラクター）とは別物で、
          こちらは丸い YouTube のアイコンに、右下のオンラインの印が付く。
          **押せない。** 誰も居なければ何も出ないし、そのときの値段はゼロ。 */}
      <HereFolks />

      {/* 吹き出し。画面の上にどんと出して、どこを押しても閉じる。
          住人のセリフと、島に降りた人への名乗り（カモメ）が同じ器を使う。 */}
      {talking && (
        <div className={`talkbox${talking.i === GUIDE ? " is-guide" : ""}`} role="status">
          {talking.i === GUIDE && (
            <span className="talkbox-gull" aria-hidden>
              <Gull size={54} shadow={false} />
            </span>
          )}
          <p>{talking.text}</p>
          <span className="talkbox-tap">画面のどこかを押すと閉じる</span>
        </div>
      )}

      {/* 今日の島。降りた瞬間に「今日は何が違うか」を1枚だけ渡す。
          PC・タブレットは島の隅に浮かせ、スマホは下バーの1段目に置く。
          出し分けは mode で決まるので、同時に2枚は出ない。 */}
      {mode !== "phone" && <Today place="corner" />}

      {/* スマホ: 行き先は下のバーにまとめる。
          **ふだんは畳んでおく。** 島を見ているあいだ、行き先の一覧は要らない。
          出しっぱなしのバーは 183px あって、島の面の 25% を取っていた。
          畳めば「今日の島」の1行だけになり、島がその分だけ広く見える。

          畳んでいるあいだ、行き先は島の建物そのものが持っている（10軒とも押せる）。
          歩きたくない人のために、1タップで6つの一覧が開く。 */}
      {mode === "phone" && (
        <div className={`island-bar${barOpen ? " is-open" : ""}`} data-ui ref={barRef}>
          {/* 下の帯は1枚に畳む。
              前は「今日の島」の板の上に「行き先をみる」の札が浮いていて、
              島の下端に**別々の物が2つ**乗っていた。中身は変えずに1行へ入れる。
              押しどころは2つのままだが、目に入るかたまりは1つになる。 */}
          <div className="bar-row">
            <Today place="bar" />
            <button
              className="bar-toggle"
              onClick={() => setBarOpen((v) => !v)}
              aria-expanded={barOpen}
              aria-controls="island-bar-spots"
              aria-label={barOpen ? UI.close : "行き先をみる"}
            >
              <Icon name={barOpen ? "chevron" : "up"} size={14} />
              <span className="tool-label">{barOpen ? UI.close : "行き先をみる"}</span>
            </button>
          </div>
          <div className="island-bar-scroll" id="island-bar-spots">
            {/* 押したら、その場所へ行く。
                前は `<button>` で島のあやとを歩かせるだけだった。押しても入れないので、
                島の札の劣化版になっていたうえ、読み上げにもキーボードにも
                行き先として見えていなかった。歩くのは島の建物のほうの役目にする。 */}
            {SPOTS.map((s) => (
              <Link
                key={s.id}
                href={s.href}
                prefetch={false}
                className={`bar-spot${openSpot === s.id ? " is-on" : ""}`}
                // 戻ってきたときに、この建物の前に立っていてほしい
                onClick={() => {
                  leaveAt.current = { x: s.x, y: s.y + 34 };
                }}
              >
                <img src={`/sprites/${s.icon}.webp`} alt="" />
                <span>{s.label}</span>
                {s.countdown && days !== null && days >= 0 && (
                  <em>{days === 0 ? "今日" : `あと${days}日`}</em>
                )}
              </Link>
            ))}
            {/* 島の連なりへの口。
                **スマホでは島の上に出さない。** 島に降りたところで「島の地図」の
                札が浮いていると、いまの島より先に「別の島がある」と言うことになる。
                行き先をひらいたときだけ、6つの下に1本置く。
                6つは「この島の中のどこへ行くか」、こちらは島の外へ出る話なので、
                同じ列には並べずに、下に線を1本引いて分ける（`island.css`）。 */}
            <Link className="bar-atlas" href="/atlas" prefetch={false}>
              <Icon name="map" size={15} />
              {UI.atlas}
            </Link>
          </div>
        </div>
      )}

      {/* 引きと寄りの切り替え。
          行き先ではないのでバーから出した。バーの中に混ぜると6つの入口と
          同じ重さに見えて、そのぶん入口の名前が削られる（名前が切れたら入口は無いのと同じ）。
          カメラの操作なので、島の隅に単独で置く。 */}
      {/* **どの幅でも出す。** PC も既定は「島に降り立った視点」になったので、
          引いて島ぜんぶを見る道が要る（前はスマホにしか無かった）。 */}
      {/* **スマホでは字を出さない。** 島の隅の道具が字の付いた札で3枚並ぶと、
          島に降りた1画面目で、島より先に道具の名前を読むことになる。
          絵だけの丸にして、名前は読み上げに渡す（`.tool-label`）。 */}
      <button
        className="stage-view"
        data-ui
        onClick={() => setWide((v) => !v)}
        aria-label={wide ? UI.comeDown : UI.lookAround}
      >
        <Icon name={wide ? "walk" : "island"} size={15} />
        <span className="tool-label">{wide ? UI.comeDown : UI.lookAround}</span>
      </button>

      {/* 島の連なりへの入口。
          **トップは、いままでどおり「いまの島」**（`docs/island-atlas.md` 7章）。
          毎日来る人に、島へ入るための1タップを増やさないと決まっているので、
          連なりはここから見る。
          バーの6つは「この島の中のどこへ行くか」で、こちらは島の外へ出る話。
          隣に並べると、島の中と外が同じ重さに見える。

          **スマホでは島の上に出さない。** 島に降りたところで「別の島がある」と
          先に言われると、いまの島がその案内板の背景になる。
          畳んだだけで消してはいない。行き先をひらけば、6つの下に出る（上の bar-atlas）。
          640px から上は右上が空いているので、そのまま札で置く。 */}
      {mode !== "phone" && (
        <Link className="stage-atlas" data-ui href="/atlas" prefetch={false}>
          <Icon name="map" size={15} />
          {UI.atlas}
        </Link>
      )}

      {/* 行き先をぜんぶ並べた面への口。
          島に建っている10軒は押せば入れるが、**その先（料理32品・国18・
          伝説8・北欧6…）は島からは名前も見えない。** 島から3タップ以上かかる面が
          残るので、道しるべを1本立てる。ここを通れば島からどこへでも2タップ。
          カメラの操作（引き／寄り）の下に置くのは、どちらも「行き先」ではなく
          島を見わたすための道具だから。バーの6つとは列を分ける。 */}
      <Link className="stage-index" data-ui href="/all" prefetch={false} aria-label="ぜんぶの行き先">
        <Icon name="signpost" size={15} />
        <span className="tool-label">ぜんぶ</span>
      </Link>

      {/* 行き先をぜんぶ並べた面への口。
          島に建っている10軒は押せば入れるが、**その先（料理32品・国18・
          伝説8・北欧6…）は島からは名前も見えない。** 島から3タップ以上かかる面が
          残るので、道しるべを1本立てる。ここを通れば島からどこへでも2タップ。
          カメラの操作（引き／寄り）の下に置くのは、どちらも「行き先」ではなく
          島を見わたすための道具だから。バーの6つとは列を分ける。 */}
      <Link className="stage-index" data-ui href="/all" prefetch={false}>
        <Icon name="signpost" size={15} />
        ぜんぶ
      </Link>

      {/* 到着の演出。空が白く飛んで、カモメが先に島へ降りていく */}
      {arriving && (
        <div className="arrive" aria-hidden>
          <span className="arrive-flash" />
          <span className="arrive-gull">
            <Gull size={92} wing="fly" shadow={false} />
          </span>
        </div>
      )}

      {hint && <p className="walk-hint">{UI.walkHint}</p>}
    </div>
  );
}
