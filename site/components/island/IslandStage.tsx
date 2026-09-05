"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IslandScene, { LAMPS, PROPS, type Item } from "./IslandScene";
import { Sprite, spriteWidth } from "./Sprite";
import { AYATO_HOME, DOORS, GRASS_INSET, ISLAND, SPOTS, type Spot, type SpotId } from "./layout";
import { inset, insideRadii, rng } from "./geometry";
import { UI } from "@/content/voice";
import { hasVoice, linesOf } from "@/content/chatter";
import { Gull } from "./Guide";
import Today from "@/components/today/Today";
import { jstNow } from "@/lib/nightly";
import { useResidentShow } from "@/lib/liveStats";
import Icon from "@/components/ui/IconCore";
import { daysUntil, nextPlan } from "@/content/plans";
import { NOW_FALLBACK } from "@/content/site";
import { opensByItself, todayNews, type TodayNews } from "@/lib/todayNews";
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
/** 住人の背丈。あやとより小さく置く。主役はあやと。 */
const RESIDENT_H = 46;

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
/** 表示する横幅(ワールド単位)。縦長では「縦に何単位見せるか」から逆算する。 */
const spanOf = (w: number, h: number, wide: boolean) => {
  const aspect = w / Math.max(1, h);
  const m = modeOf(w);
  if (m === "phone") return wide ? 830 : 340;
  if (m === "tablet") return Math.max(1120, 980 * aspect);
  return Math.max(1220, 880 * aspect);
};

/** ここまで来たら札が開く距離(ワールド単位) */
const HERE = 150;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく。 */
const TALK_REACH = 74;

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
  const whoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  /** 下のバーの背(px)。島をどれだけ上へ寄せるかの計算に使う */
  const barH = useRef(0);

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
  useEffect(() => {
    const p = nextPlan(new Date());
    setDays(daysUntil(p?.date, new Date()));
    // 静的書き出しなので、ビルド時の「今日」を焼き込まないよう画面が出てから決める
    const n = todayNews();
    setTodaySpot(spotOfHref(n.href) ?? TODAY_AT[n.kind] ?? null);
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
    const read = () => {
      const r = el.getBoundingClientRect();
      // 幅が分かった＝寄りの度合いが決まる。到着演出を飛ばす人は、ここで置き直す。
      // 仮の幅（PC）で作った引きの絵から ease で寄ると、いちばん重い絵を何十枚も描く。
      if (skipArrive.current) snapCam.current = true;
      barH.current = barRef.current?.offsetHeight ?? 0;
      setBox({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  /* バーは「今日の島」が出てから背が決まる。カメラの寄せ量がそれを見ているので、
     出たあとに測り直す。測るのは1回でよくて、ここが変わるのは板が開いた時だけ。 */
  useEffect(() => {
    const h = barRef.current?.offsetHeight ?? 0;
    if (h && h !== barH.current) barH.current = h;
  });

  const mode = modeOf(box.w);
  /** スマホは島に降り立った視点。「島ぜんぶ」を押すと引いて全体を見る。 */
  const follow = mode === "phone" && !wide;

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
    if (m === "phone" && !wideRef.current) return { x: avatar.current.x, y: avatar.current.y - 92 };
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
    /** 前のフレームの viewBox。同じなら島を描き直さない */
    let lastVb = "";

    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      clock.current = t;
      const b = boxRef.current;

      stepVillagers(villagers, dt, dice.current);
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
      /* viewBox を書き換えると、島の SVG（画像152枚）がまるごと描き直される。
         止まっているのに書き直すと、何もしていない画面でずっと GPU が回る。
         文字にしたときに同じなら、画面には出ない差なので触らない。 */
      const camMoved = vb !== lastVb;
      if (camMoved) {
        lastVb = vb;
        sceneRef.current?.setAttribute("viewBox", vb);
        lampRef.current?.setAttribute("viewBox", vb);
      }
      const sx = (wx: number) => ((wx - vbX) / vbW) * b.w;
      const sy = (wy: number) => ((wy - vbY) / vbH) * b.h;

      // --- あやと ---
      if (ayatoRef.current) {
        ayatoRef.current.setAttribute(
          "transform",
          `translate(${me.x.toFixed(1)} ${me.y.toFixed(1)}) scale(${facing.current} 1)`,
        );
      }
      if (ayatoShadowRef.current) {
        ayatoShadowRef.current.setAttribute("cx", me.x.toFixed(1));
        ayatoShadowRef.current.setAttribute("cy", (me.y + 1).toFixed(1));
      }

      // --- 住人 ---
      for (let i = 0; i < villagers.length; i++) {
        const v = villagers[i];
        // 画面の外にいる住人は書かない。寄りのときは12人のうち大半が外にいて、
        // そのぶん毎フレーム属性を書き換えては島を汚していた（外側に余白を足して、
        // 入ってくる手前のフレームから書きはじめる）。
        const off =
          v.x < vbX - 120 || v.x > vbX + vbW + 120 || v.y < vbY - 160 || v.y > vbY + vbH + 160;
        const g = villagerRefs.current[i];
        if (g && !off) {
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
          g.setAttribute(
            "transform",
            `translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)}) rotate(${pose.rot.toFixed(1)})`,
          );
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
      if (camMoved) {
        const k = b.w / vbW;
        for (let i = 0; i < DOORS.length; i++) {
          const el = markRefs.current[i];
          if (!el) continue;
          const sp = DOORS[i];
          el.style.transform = `translate(${sx(sp.x).toFixed(1)}px, ${sy(sp.y).toFixed(1)}px)`;
          // 絵の大きさは倍率で変わるので、測り直す。
          // 当たり判定は指で押せる最小(48px)まで広げるが、
          // 札の高さは絵の実寸を使う。最小に合わせると、引きで札が建物から浮いてしまう。
          const artW = spotBox(sp).w * k;
          const artH = sp.size * k;
          el.style.setProperty("--hw", `${Math.max(TAP_MIN, artW).toFixed(1)}px`);
          el.style.setProperty("--hh", `${Math.max(TAP_MIN, artH).toFixed(1)}px`);
          el.style.setProperty("--mh", `${Math.max(12, artH).toFixed(1)}px`);
        }
      }
      if (best !== lastOpen) {
        lastOpen = best;
        setOpenSpot(best);
      }

      // --- 奥行きの並び。変わったときだけ描き直す ---
      const sig = villagers.map((v) => Math.round(v.y / 24)).join(",") + "|" + Math.round(me.y / 24);
      if (sig !== lastOrder) {
        lastOrder = sig;
        setOrder(sig);
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
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

  const cam = camRef.current;
  const vbW0 = cam.span;
  const vbH0 = (cam.span * box.h) / Math.max(1, box.w);
  const vb0 = `${cam.x - vbW0 / 2} ${cam.y - vbH0 / 2} ${vbW0} ${vbH0}`;

  return (
    <div
      className={`stage has-today${arriving ? " is-arriving" : ""}${talking ? " is-talking" : ""}`}
      data-view={follow ? "close" : "wide"}
      data-mode={mode}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg ref={sceneRef} className="stage-svg" viewBox={vb0} preserveAspectRatio="xMidYMid slice" aria-hidden>
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
      </svg>

      {/* 夜の灯り。時間帯の色かぶせより上に重ねる */}
      <svg ref={lampRef} className="stage-lamps" viewBox={vb0} preserveAspectRatio="xMidYMid slice" aria-hidden>
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

      {/* 建物の札。島に建っているものは全部押せるので、ふだんは何も出さない。
          出るのは「今日ここに何かある」1つと、いま近づいている1つだけ。 */}
      <div className="labels">
        {DOORS.map((sp, i) => {
          const on = openSpot === sp.id;
          const today = todaySpot === sp.id;
          return (
            <div
              key={sp.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className={`spot${on ? " is-on" : ""}${today ? " is-today" : ""}`}
            >
              <button
                data-ui
                className="spot-hit"
                onClick={() => goTo(sp)}
                onMouseEnter={() => setHover(sp.id)}
                onMouseLeave={() => setHover((v) => (v === sp.id ? null : v))}
                onFocus={() => setHover(sp.id)}
                onBlur={() => setHover((v) => (v === sp.id ? null : v))}
                // 押すと「歩いていく」。入るのは、着いて開いた札のほう。
                // 「へ行く」と読み上げると、押した先で入れると思われる
                aria-label={`${sp.label}まで歩く`}
              />
              <Link
                data-ui
                href={sp.href}
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
                {sp.countdown && days !== null && days >= 0 && (
                  <em className="spot-badge" aria-hidden>
                    {days === 0 ? "今日" : `あと${days}日`}
                  </em>
                )}
                <span className="spot-text">
                  <b>{sp.label}</b>
                  <i>{sp.blurb}</i>
                </span>
                <span className="spot-go">
                  {UI.enter}
                  <Icon name="right" size={12} />
                </span>
              </Link>
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
          <Today place="bar" />
          <button
            className="bar-toggle"
            onClick={() => setBarOpen((v) => !v)}
            aria-expanded={barOpen}
            aria-controls="island-bar-spots"
          >
            <Icon name={barOpen ? "chevron" : "up"} size={12} />
            {barOpen ? UI.close : "行き先をみる"}
          </button>
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
          </div>
        </div>
      )}

      {/* 引きと寄りの切り替え。
          行き先ではないのでバーから出した。バーの中に混ぜると6つの入口と
          同じ重さに見えて、そのぶん入口の名前が削られる（名前が切れたら入口は無いのと同じ）。
          カメラの操作なので、島の隅に単独で置く。 */}
      {mode === "phone" && (
        <button className="stage-view" data-ui onClick={() => setWide((v) => !v)}>
          <Icon name={wide ? "walk" : "island"} size={15} />
          {wide ? UI.comeDown : UI.lookAround}
        </button>
      )}

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
