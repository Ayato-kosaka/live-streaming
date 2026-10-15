"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rng } from "@/components/island/geometry";
import { Sprite, spriteWidth } from "@/components/island/Sprite";
import Icon from "@/components/ui/IconCore";
import { hasVoice, linesOf } from "@/content/chatter";
import { UI } from "@/content/voice";
import { charPlace } from "@/content/characterBox";
import { AYATO_ASPECT } from "@/lib/ayatoArt";
import AyatoSprite, { ayatoFlip, ayatoTurn, newAyatoTurn, setAyatoDir, setAyatoWalking } from "@/components/isle/AyatoSprite";
import { useSinceWord } from "./ChapDays";
import IsleGround, { Building } from "./IsleGround";
import IsleSheet from "./IsleSheet";
import {
  callOut,
  createFolk,
  folkAt,
  folkPose,
  hush,
  resetTalk,
  rotateInvites,
  stepFolk,
  talkTo,
  type Folk,
  type Ground,
} from "./folk";
import Today from "@/components/today/Today";
import { rememberVisit } from "@/components/today/visit";
import { useFund } from "@/components/nordic/fund";
import { FUND_GOAL_YEN } from "@/content/chapters";
import type { IsleSpec } from "./spec";
import { buildWorld, clampTo, type IsleWorld, type Placed } from "./world";
import { AIR, MAX_LEAD, MAX_LEAD_NEAR, TAP, TAP_FIT, around, cuts, fitHit, hits, lead, nooks, type Box } from "./plates";
import Say from "@/components/ui/Say";
import { charImg } from "@/lib/charImg";

/**
 * 歩ける島ひとつ。
 *
 * ## いまの島（`components/island/IslandStage.tsx`）とどう違うか
 *
 * **触りごこちは同じにしてある。** 押したところまで歩く、カメラが付いてくる、
 * 近づくと札が開く、住人に話しかけると吹き出しが出る、引いて島ぜんぶを見る。
 * あやとの言葉「コーカサス周遊と同じぐらいのクオリティに」がここ。
 *
 * 違うのは**中身が章から作られている**ことだけ。あちらは 1200四方に 300要素を
 * 手で置いた1枚もので、章ごとに輪郭も草木も建物も変えられない。
 * **あちらのファイルは1文字も触っていない**（同時に別の担当が直しているため）。
 *
 * ## 値段
 *
 * 島は5つあるが、**見えているのは常に1つ**なので、払うのも1つぶん。
 * そのために、いまの島で効いた3つをそのまま持ってきた。
 *
 * 1. **`viewBox` を書き換えない。** 書き換えると SVG の中身が全部塗り直される
 *    （いまの島で 23.3 → 4.8ms）。画面より広く焼いておいて、ズレは
 *    CSS の `transform` で見せる。ズレが余白を使い切ったときだけ焼き直す
 * 2. **同じ値を書かない。** 属性に書けば、値が同じでもその要素は塗り直される。
 *    カメラ・あやと・住人、どれも文字にして同じなら触らない
 * 3. **見えていないあいだは動かさない。** 画面の外／別のタブでは rAF を止める
 *
 * SMIL（`<animate>`）は1つも使っていない。あれは中身を全部塗り直す
 * （`CLAUDE.md`。`/nordic/sweden` で3秒 3,180ms を1つ払っていた）。
 */

/** あやとの背丈。島の主人公なので、住人より必ず大きい */
const AYATO_H = 60;
/** あやとの絵の横幅。**比は絵そのものから引く**（`lib/ayatoArt.ts`）。
    ここに数を書くと、絵を描き直した日に横へ潰れる */
const AYATO_W = AYATO_H * AYATO_ASPECT;
/** 住人の背丈 */
const FOLK_H = 52;
const folkIconUrl = (id: string) => charImg(id, 128);

/** 画面の外に余分に焼いておく幅(px)。`--scene-pad` と必ず同じ値にする */
const SCENE_PAD = 140;
/** 焼いた絵を、これ以上の倍率で引き伸ばして見せない */
const ZOOM_Q = 1.12;
/** ここまで来たら札が開く距離(ワールド単位) */
const HERE = 150;
/**
 * **あやとの足元が、島の枠のどこに居るか**（0 が上ふち、1 が下ふち）。
 *
 * ## 主人公は動かない。動くのは世界のほう
 *
 * ここは「どこまで来てよいか」の**上限ではない。立つ場所そのもの。**
 * カメラはあやとをこの高さに置き続ける。島のまん中でも端でも同じ場所に居る。
 * **例外は島の端だけ**——世界が尽きたらカメラが止まり、そのぶん
 * あやとが枠の端へ寄る（下の `camWant` の `rim`）。
 *
 * 値はポケットキャンプの絵から取った（`13.jpg`。画面の縦 1815px のうち
 * 主人公の足元が 1224px＝**0.674**）。0.67 にしてある。
 *
 * ## 前はどうなっていたか
 *
 * カメラは「建物の並びのまん中」へ引き戻していて（`pull`）、建物が北に寄った
 * 島では引き戻しが上限まで効き、あやとが枠の下ふちに貼りついた。実測
 * （390px・表紙の寄り）で足元が枠の 94%、下に残った 61px は「今日の島」の札。
 * **南を押そうにも、押す地面が無い。** あやとの言葉（2026-09-15）:
 * 「画像①下部押してもマップが下にいかないので下に進めない」。
 *
 * そのとき塞いだのは**帯の上限と下限**（`FOOT_LOW` 0.74 / `FOOT_HIGH` 0.3）で、
 * 引き戻しそのものは残した。だから「あやとは枠の 74% と 30% のあいだを漂う」
 * ままで、**主人公の居場所が歩くたびに変わる**という元の形は直っていない。
 * 2026-10-14 にあやとが「主人公の場所は固定して背景が動くべき」と
 * 言ったのは、そこのこと。**今回は引き戻しごと外した。**
 *
 * 「建物の並びを1画面に入れる」はカメラの仕事ではない。引き（島をながめる）の仕事。
 */
const FOOT = 0.67;
/**
 * 島の端で、カメラがどれだけ海を見せて止まるか（ワールド単位）。
 *
 * 砂浜のいちばん外（`ext`）から、これだけ外側までを画面に入れたところで止める。
 * **海が写っていないと島に見えない**（`docs/island-design.md` 8章3）ので 0 にはしない。
 * あやとの背丈（60）の1.5人ぶん。寄りで 150px ほどの海が端に残る。
 */
const SEA_RIM = 90;
/**
 * **寄りで、画面の横幅に主人公が何人ぶん入るか。**
 *
 * ポケットキャンプの絵から数えた（`13.jpg`。iPhone の実機）。
 * 画面の横は 856px（左右の黒帯を除いた実寸）、主人公の横幅は 153px
 * （髪の左ふちから肩の右ふちまで）。**856 ÷ 153 = 5.6人。**
 *
 * いまのあやと島は、寄りの広さ 340 ワールド単位 ÷ あやとの横幅 41.4 = **8.2人**で、
 * ポケキャンより 1.45倍引いていた。スマホはポケキャンに合わせる。
 * タブレットと PC は画面が広いぶん世界も広く見せてよいので、同じ 0.68倍だけ寄せる。
 */
const ACROSS_PHONE = 5.6;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく */
const TALK_REACH = 74;
/** 案内を出しておく時間(ミリ秒) */
const HINT_SPAN = 5600;
/** 一度でも島を歩いたか。覚えていることを毎回出さない */
const WALKED = "ayato-island-walked";

const modeOf = (w: number) => (w < 640 ? "phone" : w < 1024 ? "tablet" : "wide");

export default function IsleStage({ spec, cover }: { spec: IsleSpec; cover?: boolean }) {
  const world = useMemo(() => buildWorld(spec), [spec]);
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const lampRef = useRef<SVGSVGElement>(null);
  const ayatoRef = useRef<SVGGElement>(null);
  const ayatoShadowRef = useRef<SVGEllipseElement>(null);
  const folkRefs = useRef<(SVGGElement | null)[]>([]);
  const whoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const markRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const signBox = useRef<{ w: number; h: number }[]>([]);
  const edgeAt = useRef<string[]>([]);
  /** 建物から離れすぎて出さないことにした札 */
  const farAt = useRef<boolean[]>([]);
  const platesDirty = useRef(true);
  const uiBoxes = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  /** **指の当たりを実際に取る**島の上の道具だけ（`uiBoxes` とは別物。下の測りで作る） */
  const tapBoxes = useRef<Box[]>([]);
  /** 住人の当たりが避ける相手（指を取る道具＋出ている札＋建物の当たり）。
      カメラが動いたときに `placePlates` がそろえ直す */
  const blockers = useRef<Box[] | null>(null);

  const [box, setBox] = useState({ w: 1440, h: 820 });
  /**
   * 画面の幅を実際に測ったか。**測るまでは寄り引きを名乗らない。**
   *
   * 焼いた HTML は幅を知らないので、仮の PC 幅（1440）で作られる。そのまま
   * `data-view="wide"` を書き出していると、スマホで開いた人は
   * **看板の絵（900×410・92KB）を1枚まるごと取って描いてから**、
   * hydration の直後にそれが消えて右上の小さい印に入れ替わる。
   * 実測（390px・CPU4倍＋4G）で `wide` を名乗っていたのは 800〜2661ms で、
   * そのあいだに取った 92KB は最後に `display:none` で捨てられていた。
   *
   * 手で作った島は先に同じ直しを持っていた（`components/island/IslandStage.tsx`
   * の `sized`。「実測でその看板が LCP・4,756ms で、しかも捨てる絵だった」）。
   * **表紙が章の島に入れ替わった日から、こちらにだけ無かった。**
   *
   * 測る前は属性を出さない。どちらを出すかは CSS の幅そのものが決める
   * （`app/css/hero.css`）。スマホの既定は小さい印なので、看板のほうは
   * `loading="lazy"`（隠れているあいだは取りにいかない）に落ちる。
   */
  const [sized, setSized] = useState(false);
  /**
   * React が手を付けたか（hydration が済んで、押せば動くようになったか）。
   *
   * 島の絵は焼いた HTML に入っているので、**描き終わってもまだ押せない。**
   * 実測（390px・CPU4倍＋4G）で、島の DOM が出るのが 741ms、建物の当たりが
   * 寸法を持つのが 922ms、React が手を付けるのが 2579ms。
   * **そのあいだの 1.6〜2.1 秒、押しても何も起きないのに、絵は完成して見える。**
   * 初見の人はここで1〜2回押して、無反応のまま下へ送ってしまう。
   *
   * `useEffect` は hydration のあとにしか走らないので、ここが立った瞬間が
   * そのまま「押せるようになった」。`data-live` を出して、立つまでは
   * `chain.css` が島をごく薄く沈めて `cursor: progress` にする。
   * **字は増やさない**（画面でシステムの仕様を説明しない。`CLAUDE.md`）。
   */
  const [live, setLive] = useState(false);
  const [wide, setWide] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  /**
   * 「いま行こうとしている建物」。押した瞬間に決まって、**着くまで変わらない。**
   *
   * ## 直す前に起きていたこと（390px の実測）
   *
   * 「企画」を1回押したあと、開いている札を 100ms ごとに追うと:
   *
   *     100ms 企画@258,415 → 400ms 企画@258,171 → 500ms あやとのこと@257,225
   *     → 900ms いまどこ@258,579 → 1100ms 企画@157,240 → 1500ms 企画@143,243
   *
   * **別の建物の札に3回入れ替わり、最初の位置から最大 244px 動いた。**
   * 1タップ目の 400/700/1000ms 後に、札が出ていた場所をそのまま押すと、
   * **3回とも「配信」の当たりを踏んで `/index.html`**（＝どこへも行かない）。
   * 狙った「企画」には 0/3。PC 1280 でも2回入れ替わり、最大 350px。
   *
   * 理由は2つあって、どちらも「歩いているあいだ」に効く。
   *
   * 1. 開く札を毎フレーム「いちばん近い建物」で決め直していた。歩く道すがら
   *    別の建物のそばを通れば、その建物の札に入れ替わる
   * 2. 札の置き場所がカメラの ease に追随する。カメラは 1.5秒かけて寄るので、
   *    そのあいだ札は画面の上を滑り続ける
   *
   * ## 決めたこと
   *
   * 押した建物を `dock` に留めて、**開く札をそれ1枚に固定する**（1の答え）。
   * そのうえで、**札は島の上ではなく画面の下ふちに1枚出す**（2の答え。
   * `.isle-going`）。画面に固定した札なので 1px も動かないし、
   * **着くのを 1.5秒待たずに「みる」が押せる。** ゲームの作法としても素直で、
   * 「押した → 行き先が手元に出る → 歩きながら入れる」になる。
   *
   * 留めを解くのは、その人が**別のことをしたとき**だけ
   * （地面を押す・住人に話しかける・キーで歩く・島をながめる）。
   * 着いた瞬間に解くと、そこで札が島の上へ跳んで、また 244px 動くことになる。
   */
  const [dock, setDock] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [talking, setTalking] = useState<{ i: number; text: string } | null>(null);
  const [order, setOrder] = useState("");
  /** 出発までの日数。**画面が出てから数える**（静的書き出しに焼かない） */
  const [left, setLeft] = useState<number | null>(null);

  /* **表紙のときは、ここが「島に降りた」を書き留める。**
     手で作った島（`components/island/IslandStage.tsx`）だけが書いていたころ、
     表紙が章の島に入れ替わった日から誰も書かなくなり、今日の板の
     「前に来てから、あったこと」が旅のあいだ二度と出なくなっていた。
     読むのは板（子）で、書くのは島（親）。React は子の効果を先に走らせるので、
     ここから呼べば「読ませてから書く」の順番が守られる。 */
  useEffect(() => {
    if (cover) rememberVisit();
  }, [cover]);

  /* 押せるようになった合図。**効果が走った＝hydration が済んだ**ということ */
  useEffect(() => setLive(true), []);

  const avatar = useRef({ ...world.start });
  const facing = useRef(1);
  /** 歩いている向き（横・正面・背中）。止まっても最後の向きを持つ（`AyatoSprite.tsx`） */
  const turn = useRef(newAyatoTurn());
  const walkingNow = useRef(false);
  const target = useRef<{ x: number; y: number } | null>(null);
  const walkingTo = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camRef = useRef({ x: world.start.x, y: world.start.y - 40, span: 0 });
  const anchor = useRef({ x: 0, y: 0, span: 0, w: 0, h: 0 });
  const sceneVb = useRef("");
  const sceneTf = useRef("");
  const snapCam = useRef(true);
  const landedAt = useRef(performance.now());
  const spokeFirst = useRef(false);
  const dice = useRef(rng(4711));
  const inviteSlot = useRef(-1);
  const boxRef = useRef(box);
  boxRef.current = box;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  /* 留めている行き先。**押したその場で書く**（上の `dock`）。
     state の反映は次の描き直しなので、ref を待たせると1フレームだけ
     「いちばん近い建物」が勝って、札が一瞬よそへ入れ替わる */
  const dockRef = useRef(dock);
  dockRef.current = dock;
  /** 留めを解く。別のことをしたときだけ呼ぶ */
  const undock = useCallback(() => {
    dockRef.current = null;
    setDock((d) => (d === null ? d : null));
  }, []);

  /** 島の草地。住人もあやとも、ここから出ない */
  const ground: Ground = useMemo(
    () => ({ cx: world.cx, cy: world.cy, squash: world.squash, radii: world.grass, places: world.places }),
    [world],
  );
  const folk = useMemo(
    () => createFolk(spec.folk, ground, world.r, world.start),
    [spec.folk, ground, world.r, world.start],
  );
  /* 島を移ったら、挨拶と声かけの控えをまっさらにする。
     ここを持ち越すと、前の島で誰かと話した人は、次の島では誰にも声をかけられない */
  useEffect(() => resetTalk(), [spec.slug]);

  /* 島の外周は寄りの度合いを決めるのに何度も要る。島ごとに1回で足りる */
  const fullSpan = useCallback(
    (w: number, h: number) => {
      const rx = world.r * Math.max(...world.art.radii) * 1.16;
      const ry = rx * world.squash;
      return Math.max(rx * 2, (ry * 2 * w) / Math.max(1, h));
    },
    [world],
  );
  /**
   * 島の実際の広がり。**縦と横を別々に測る。**
   *
   * `fullSpan` はいちばん長い半径1つで島を正方形とみなしている。細長い島
   * （北欧は縦が横の1.5倍）だと、短いほうの側に海だけの帯ができて、
   * **引き（島ぜんぶ）で島が画面の3分の1しか埋めない。**
   * そうなると建物の札が島に載りきらず、押し出されたぶんが海の上で
   * 積み重なる（表紙の島で3枚が重なった。撮って分かった）。
   */
  const ext = useMemo(() => {
    let rx = 0;
    let ry = 0;
    const n = world.sand.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      rx = Math.max(rx, Math.abs(Math.cos(a) * world.sand[i]));
      ry = Math.max(ry, Math.abs(Math.sin(a) * world.sand[i] * world.squash));
    }
    return { rx, ry };
  }, [world]);

  /** 引き（島ぜんぶ）の倍率。島の縦横のうち、先に画面へ届くほうで決める */
  const wideSpan = useCallback(
    (w: number, h: number) => Math.max(ext.rx * 2 * 1.08, (ext.ry * 2 * 1.08 * w) / Math.max(1, h)),
    [ext],
  );

  /**
   * **寄りの広さ（画面の横幅ぶんのワールド単位）。**
   *
   * 決め方は1つだけ——**画面の横幅に主人公が何人ぶん入るか**（`ACROSS_PHONE`）。
   *
   * 前はここに「建物の並びが1画面に入る広さ」（`townSpan`）を混ぜていて、
   * 建物が散っている島ほど引いた。**その仕事はカメラのものではない。**
   * 島に何が建っているかを一目で見るのは引き（島をながめる）の役で、
   * 寄りは「いま立っているところ」を見せる画。混ぜると、島ごとに主人公の
   * 背丈が変わって、同じゲームに見えなくなる（実測で 340〜748 まで開いていた）。
   */
  const spanOf = useCallback(
    (w: number, h: number, all: boolean) => {
      if (all) return wideSpan(w, h);
      const m = modeOf(w);
      /* スマホはポケキャンと同じ人数。画面が広いときは世界も広く見せてよいので、
         いままでの決め方（画面の幅で割る）を 0.68倍して引きしろを残す。
         0.68 は「スマホを 340 から 232 へ寄せた」のと同じ比 */
      const near =
        m === "phone"
          ? AYATO_W * ACROSS_PHONE
          : m === "tablet"
            ? Math.max(293, w / 2.57)
            : Math.max(382, w / 3.01);
      // 小さい島では、寄りすぎると島より海のほうが広く映る
      return Math.min(near, fullSpan(w, h) * 0.92);
    },
    [fullSpan, wideSpan],
  );

  /* --- 住人の絵。外から取ってくるので先に読んでおく ---
     SVG の image に直接 URL を入れると、失敗したとき壊れた画像の枠が出る */
  useEffect(() => {
    let alive = true;
    for (const v of folk) {
      const img = new Image();
      img.src = folkIconUrl(v.icon);
      img.onload = () => {
        if (alive) setReady((prev) => (prev.has(v.icon) ? prev : new Set(prev).add(v.icon)));
      };
    }
    return () => {
      alive = false;
    };
  }, [folk]);

  /* --- 画面の大きさ --- */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      // 幅が分かった＝寄りの度合いが決まる。ease で詰めると、いちばん重い絵を
      // 何十枚も描いてから所定の位置に着くことになる。1フレームで置く
      snapCam.current = true;
      setBox({ w: r.width, h: r.height });
      /* 測り終えた。ここから先だけ寄り引きを名乗ってよい（上の `sized`） */
      setSized(true);
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  /* --- 札の実寸。縁へ寄せるときに要る ---
     毎フレーム測らない（offsetWidth は layout を起こす）。変わったときだけ */
  useEffect(() => {
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
    for (let i = 0; i < world.places.length; i++) {
      const el = markRefs.current[i]?.querySelector<HTMLElement>(".isle-mark");
      if (!el) continue;
      el.dataset.i = String(i);
      signBox.current[i] = { w: el.offsetWidth, h: el.offsetHeight };
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [world]);

  /* --- 島の隅の道具。札がこの上に乗らないようにする ---
     **表紙のときは看板ロゴもここに入れる。** カメラはあやとを追うので、
     島の札はいつか必ずロゴの下へ入ってくる。実際に入れて撮ったら、
     「この旅のこと」の札が「あやと島」の看板にまるごと重なって、
     どちらも読めなかった。**札のほうを下へ逃がす**（矢が建物の方向を指す）。 */
  useEffect(() => {
    /** 島の上に載っていて、避ける相手になるもの */
    const UI = ".isle-view, .isle-atlas, .isle-sign, .isle-hint, .today";
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const host = hostRef.current;
      const hb = host?.getBoundingClientRect();
      if (!host || !hb) return;
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      /** 指を実際に取るものだけ。`boxes`（札を逃がすための「読めなくなる場所」）とは別 */
      const taps: { x: number; y: number; w: number; h: number }[] = [];
      const add = (el: Element | null | undefined) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width < 4) return;
        boxes.push({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
      };
      /* **見えなくする箱と、指を取る箱は別物。**
         看板の板（`.hero-copy`）は `pointer-events: none` で、押すと指が島へ抜ける
         （`app/css/hero.css`「島の上なので、指の当たりは島に通す」）。
         札はその下に置くと読めないので `boxes` には入れるが、**当たりの取り合いに
         入れてはいけない。** 入れて測ったら、板の下の建物が1軒押せなくなった
         （1280px の表紙「歩いた国」。前は押せていた）。 */
      const addTap = (el: Element | null | undefined) => {
        if (!el) return;
        if (getComputedStyle(el).pointerEvents === "none") return;
        const r = el.getBoundingClientRect();
        if (r.width < 4) return;
        taps.push({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
      };
      /* 歩きかたの案内も入れる。**数秒で消えるが、出ているあいだは札を隠す。**
         測って見つけた（札の字が案内の暗い帯に半分かかって 1.81 : 1 だった）。
         消えたらまた測り直すので、その場で戻る */
      /* 「今日の島」の板も入れる（`.today`）。**入れていなかった。**
         実測（1280px・表紙の寄り）で、開いた板の下に「いまどこ」の当たりが
         入って、指が板に取られていた。押せる板なので、当たりの取り合いにも入る。
         開け閉めで背が変わるが、下の `ResizeObserver` が測り直す。
         スマホでは開いた中身を島の外へ出してあるので（`app/css/today.css` の
         `.isle-under`）、ここで避けるのは畳んだ札1枚ぶんだけになる。 */
      for (const el of host.querySelectorAll(UI)) {
        add(el);
        addTap(el);
        /* **見張るのも、測るのと同じ場で。**「今日の島」の板は今日の1行を
           読んでから出るので、この効果が動いた時点ではまだ島に無い。
           見張る相手をここで足しておくと、あとから出てきたものも次から拾える
           （同じ要素をもう一度渡しても増えない）。 */
        ro?.observe(el);
      }
      /* 看板は絵と一言で1かたまり。**絵だけを避けると、札が一言の上に乗る** */
      if (cover) {
        const hero = host.parentElement;
        add(hero?.querySelector(".hero-copy"));
        // 看板ロゴは絵なので指を取る。板（`.hero-say`）は取らない
        addTap(hero?.querySelector(".hero-logo"));
      }
      /* 旅の板（`.htrip`）はここには無い。**島の外（すぐ下）へ降ろした。**
         島の上に置いていたときは、幅390 の引きで「伝説の企画」の当たりが
         まるごと板の下に入り、48px を取れずに引っ込んでいた（入口が消えた）。
         避ける工夫では解けない——島は絵で、建物の位置は動かせないので、
         板を島の上に置くかぎり、いつかどれかの入口の上に来る。
         （`app/css/hero.css` の「旅のしるべ」・`app/page.tsx` の `.isle-under`） */
      /* --- 字を出す帯の高さを決める ---------------------------------------
         **字の出る場所は画面の上に固定**（`.isle-going` / `.isle-talk`）。
         固定だが「上ふちから 12px」では、先に上ふちに居るもの——看板
         （表紙）・隅の道具・島の名前——に重なる。**数を書き写さない**
         （`chain.css` が看板の背を知らないし、看板は寄り引きで差し替わる）。
         いま上半分に居るものの、いちばん下を測って、そのすぐ下に置く。
         `.isle-going` 自身はここに入らない（自分の高さで自分が下がり続ける）。 */
      let topEnd = 12;
      for (const q of boxes) {
        if (q.y > hb.height * 0.5) continue; // 下半分に居るもの（今日の板）は関係ない
        topEnd = Math.max(topEnd, q.y + q.h);
      }
      host.style.setProperty("--isle-top", `${Math.round(topEnd + 10)}px`);
      /* 帯そのものも、建物の当たりが避ける相手に入れる。**入口のほうを動かす。**
         札は固定（それが今回の決めごと）なので、ぶつかったら入口が痩せるか
         引っ込む（`plates.ts` の `fitHit`）。引っ込んだ建物も、近づけば
         この帯に名前が出て「みる」から入れるので、行き止まりにはならない */
      const card = host.querySelector(".isle-going .isle-mark");
      add(card);
      add(host.querySelector(".isle-talk"));
      if (card) {
        /* **指を取るのは「みる」だけ**（`chain.css` の `.isle-going .isle-go`）。
           板ぜんぶを取り合いに出すと、上ふちを横切る 300x64px が毎回どれかの
           入口を引っ込ませる（実測で「あやとグッズ」が 0x0 になった）。
           ここで渡すのは「みる」の見えない当たり（49px）ぶん。
           **少し太らせる**——札の幅は中身（名前の字数）で変わるので、
           入れ替わった直後の1〜2フレームだけ古い箱で置かれる */
        const go = card.querySelector(".isle-go");
        const r = (go ?? card).getBoundingClientRect();
        const pad = 10;
        const w = Math.max(r.width, TAP_FIT);
        const h = Math.max(r.height, TAP_FIT);
        taps.push({
          x: r.left - hb.left + (r.width - w) / 2 - pad,
          y: r.top - hb.top + (r.height - h) / 2 - pad,
          w: w + pad * 2,
          h: h + pad * 2,
        });
        /* 札の背と幅は中身で変わる。**出たり消えたりもする。** 見張っておく */
        ro?.observe(card);
      }
      uiBoxes.current = boxes;
      tapBoxes.current = taps;
      platesDirty.current = true;
    };
    ro = new ResizeObserver(() => measure());
    measure();
    /* 看板の入りの動き（logo-in）が終わるまでは、小さく傾いた箱が返る。
       終わったころにもう一度測る（毎フレーム測ると layout を起こす）。
       **「今日の島」の板が出てくるのもこのころ**（今日の1行を読んでから出る）。 */
    const t = window.setTimeout(measure, 900);
    /* **もう一度、遅れて測る。** 「今日の島」の板は今日の1行を読んでから出るので、
       900ms に間に合わないことがある。間に合わなかった回は、板が `taps` に
       入らないまま建物の当たりが置かれ、**板の下に船着き場の当たりが残る**
       （実測・幅390の表紙で、3回に1回「となりの島へ」が 72x32 になった。
       48px を割る）。出たあとは `ResizeObserver` が拾うので、要るのは
       「出てきたことに気づく」1回だけ */
    const t2 = window.setTimeout(measure, 2600);
    /* **測った箱が変わったら、測り直す。**
       ここで測っているものは、どれもカメラで姿が変わる。
       `.isle-view` / `.isle-atlas` は寄りでは絵だけの 48px、引きでは名前が
       戻って 105px（`chain.css` の `.isle[data-cam="wide"] .tool-label`）。
       看板は寄りと引きで絵そのものが差し替わる（`hero.css` の
       `.hero-logo-full` / `-mark`）。「今日の島」の板は、押して開くたびに背が変わる。
       **測り直す合図に `wide` が入っていなかった。** 引きへ切り替えると
       寄りのときの箱を持ったまま置き直すので、実測（390px・表紙）で
       看板ひとかたまりの下端を 40px ずれた場所として避けていた。
       **ずれた場所を避けた結果、「この旅のこと」と「これから」の当たりが
       板の下に置かれて、2軒とも押せなくなっていた。**
       下の `wide` は、切り替えたその場で測り直すため。`ResizeObserver` は、
       これから先ここに何が足されても取りこぼさないため（#86。直したのが
       仕掛けなら、その仕掛けを使っている場所ごと掃き出す）。 */
    const host = hostRef.current;
    if (cover) {
      const hero = host?.parentElement;
      for (const sel of [".hero-copy", ".hero-logo"]) {
        const el = hero?.querySelector(sel);
        if (el) ro.observe(el);
      }
    }
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      ro?.disconnect();
      ro = null;
    };
    /* `dock` と「喋っているか」も入れる。**上の帯は中身で幅と背が変わる**
       （名前の字数・一言の行数）。入れていないと、前の札の箱を避けたまま
       当たりが置かれる（`wide` を入れていなかったときと同じ形。上の注） */
  }, [openSpot, dock, talking, box.w, box.h, left, cover, hint, wide]);

  /* --- 出発までの日数。1分ごとに数え直す ---
     静的書き出しなので、ビルド時の「今日」を焼き込まない（`CLAUDE.md`） */
  const until = spec.places.find((p) => p.countdown)?.countdown;
  useEffect(() => {
    if (!until) return;
    const read = () => {
      const t = Date.parse(until);
      if (!Number.isFinite(t)) return;
      setLeft(Math.ceil((t - Date.now()) / 86_400_000));
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, [until]);

  /* --- 歩きかたの案内。初めての人にだけ、数秒だけ --- */
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
  useEffect(() => {
    if (hintDone.current) return;
    let walked = false;
    try {
      walked = !!localStorage.getItem(WALKED);
    } catch {
      /* 読めないときは初めての人として扱う */
    }
    if (walked) {
      hintDone.current = true;
      return;
    }
    setHint(true);
    const t = setTimeout(() => dismissHint(), HINT_SPAN);
    return () => clearTimeout(t);
  }, [dismissHint]);

  const openTalk = useCallback(
    (i: number) => {
      folk.forEach((o) => {
        if (o.says) hush(o);
      });
      const v = folk[i];
      if (!v) return;
      /* 1言目の「はじめまして／久しぶり」はここではやらない。
         あれはいまの島（トップ）が `ayato-island-met` で覚えているもので、
         過去の島でも書き込むと、**同じ日にトップへ行った人が挨拶されなくなる。**
         過去の島は振り返る場所なので、その人のいつものセリフだけでいい */
      talkTo(v, linesOf(v.icon));
      setTalking({ i, text: v.says ?? "" });
    },
    [folk],
  );
  const openTalkRef = useRef<((i: number) => void) | null>(null);
  openTalkRef.current = openTalk;

  const closeTalk = useCallback(() => {
    setTalking((cur) => {
      if (cur && folk[cur.i]) hush(folk[cur.i]);
      return null;
    });
  }, [folk]);

  /**
   * **カメラの行き先。主人公は画面の決まった場所に居る。動くのは世界のほう。**
   *
   * あやとを画面の横まん中・縦 `FOOT` に置き続ける。引き戻し（`pull`）は無い。
   * **例外は島の端だけ。** 世界が尽きたらカメラを止めて、そのぶんあやとが
   * 枠の端へ寄る（ポケットキャンプもそう）。止めたことは `rim` で返して、
   * `.isle[data-rim]` に出す——**止まっている最中だけは、あやとが定位置から
   * ずれてよい。** 見張り（`tools/sprites/islewalk.mjs`）はそこを見て、
   * 「ずれた」と「端で止めた」を取り違えないようにする。
   *
   * 引き戻しをやめた理由は `FOOT` の注に書いた。要は、主人公の居場所が
   * 歩くたびに変わると、押した方向へ世界が動かず「下に進めない」になる。
   */
  const camWant = useCallback(() => {
    const b = boxRef.current;
    if (wideRef.current) return { x: world.cx, y: world.cy, rim: "" };
    const s = spanOf(b.w, b.h, false);
    const vh = (s * b.h) / Math.max(1, b.w);
    let x = avatar.current.x;
    let y = avatar.current.y - (FOOT - 0.5) * vh;
    /* 島の端。砂浜の外 `SEA_RIM` までを見せたところでカメラを止める。
       画面のほうが島より広いときは、止めるも何も無いので島のまん中を見る */
    let rim = "";
    const hold = (v: number, half: number, mid0: number, lim: number, lo: string, hi: string) => {
      if (lim <= half) return mid0;
      const a = mid0 - (lim - half);
      const z = mid0 + (lim - half);
      if (v < a) {
        rim += lo;
        return a;
      }
      if (v > z) {
        rim += hi;
        return z;
      }
      return v;
    };
    x = hold(x, s / 2, world.cx, ext.rx + SEA_RIM, "l", "r");
    y = hold(y, vh / 2, world.cy, ext.ry + SEA_RIM * world.squash, "u", "d");
    /* **端で止めても、主人公を UI の下に押し込まない。**
       島の端でカメラを止めると、そのぶんあやとが枠の端へ寄る（それが決め）。
       ただし枠の上ふちには看板と字の帯、下ふちには「今日の島」の板がいる。
       実測（390px・表紙の北の端）で足元が枠の 31%（228px）まで上がり、
       **あやとの頭が看板の板の下に入っていた。** 主人公が UI に隠れるのは、
       どんな理由でも通さない。
       海をもっと見せれば（`SEA_RIM` を 281 以上に）こうはならないが、
       そのときは端で海が画面の7割を占める。**寄せる量に上限を置くほうを取る。**
       ここが効くのは端で止めているあいだだけなので、ふだんの `FOOT` は動かない。 */
    const foot = (f: number) => avatar.current.y - (f - 0.5) * vh;
    y = Math.min(Math.max(y, foot(0.88)), foot(0.4));
    return { x, y, rim };
  }, [ext, spanOf, world]);

  /* ---- 動きは React の外で ------------------------------------------------
     毎フレーム setState すると、島のスプライトを毎回作り直すことになる
     （`docs/island-design.md` 3章）。カメラ・あやと・住人・札の位置は
     ref から DOM に直接書く。React が描き直すのは「奥行きの並びが変わった」
     「札が開いた／閉じた」ときだけ。
     ---------------------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastOrder = "";
    let lastOpen: string | null = null;
    let lastVb = "";
    let lastK = 0;
    let lastMe = "";
    /** 島の端でカメラを止めているか。変わったときだけ属性を書く */
    let lastRim = "";
    const lastPose: string[] = [];
    let castWait = 0;
    let camBusy = true;
    let movingLast = false;
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      const b = boxRef.current;

      /* 住人を動かす値段。**カメラもあやとも止まっているあいだだけ 24fps に落とす。**
         住人は1秒に数 px しか歩かない。60回書いても24回書いても目に見えるものは
         変わらないのに、書いた要素の外接矩形ぶん島が塗り直される */
      const busy = camBusy || movingLast || !!target.current || walkingTo.current !== null;
      castWait += dt;
      const stepCast = !still && folk.length > 0 && (busy || castWait >= 40);
      if (stepCast) {
        stepFolk(folk, castWait, ground, dice.current);
        castWait = 0;
      }
      const slot = Math.floor(t / 9000);
      if (slot !== inviteSlot.current) {
        inviteSlot.current = slot;
        rotateInvites(folk, slot, (v) => hasVoice(v.icon));
      }

      // --- あやと ---
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
        const [nx, ny] = clampTo(ground, world.grass, me.x + (vx / n) * sp, me.y + (vy / n) * sp, 10);
        me.x = nx;
        me.y = ny;
        // ayato.webp は左を向いている絵。右へ歩くときに左右を反転する
        if (vx !== 0) facing.current = vx > 0 ? -1 : 1;
        ayatoTurn(turn.current, vx, vy, dt);
      }
      if (moving !== walkingNow.current) {
        walkingNow.current = moving;
        setAyatoWalking(ayatoRef.current, moving);
      }
      setAyatoDir(ayatoRef.current, turn.current.dir);

      /* そばに来た人に、住人のほうから声をかける（`docs/island-play.md`）。
         条件がそろった1回だけで、あとは毎回 null が返る */
      if (!spokeFirst.current && folk.length) {
        const who = callOut(folk, me, t - landedAt.current);
        if (who) {
          spokeFirst.current = true;
          openTalkRef.current?.(folk.indexOf(who));
        }
      }

      // --- 話しかけに行った相手のそばまで来たか ---
      if (walkingTo.current !== null) {
        const i = walkingTo.current;
        const who = folk[i];
        if (!who || Math.hypot(me.x - who.x, (me.y - who.y) * 1.3) <= TALK_REACH) {
          walkingTo.current = null;
          target.current = null;
          if (who) openTalkRef.current?.(i);
        }
      }

      // --- カメラ ---
      const cam = camRef.current;
      const want = camWant();
      /* 島の端でカメラを止めているか。**止めているあいだだけ、あやとは
         定位置からずれる**（`camWant` の注）。見張りがそこを見分けるために出す。
         字は増やさない——属性だけ（画面でシステムの仕様を説明しない） */
      if (want.rim !== lastRim) {
        lastRim = want.rim;
        if (want.rim) hostRef.current?.setAttribute("data-rim", want.rim);
        else hostRef.current?.removeAttribute("data-rim");
      }
      const spanNow = spanOf(b.w, b.h, wideRef.current);
      if (snapCam.current || !cam.span) {
        snapCam.current = false;
        cam.x = want.x;
        cam.y = want.y;
        cam.span = spanNow;
      } else {
        const ease = 0.09 * (dt / 16.67);
        cam.x += (want.x - cam.x) * ease;
        cam.y += (want.y - cam.y) * ease;
        cam.span += (spanNow - cam.span) * 0.09 * (dt / 16.67);
        // 追いつく手前で止める。放っておくと、目に見えない差を永遠に詰め続けて、
        // そのあいだ島を塗り直し続ける
        if (Math.abs(want.x - cam.x) < 0.05) cam.x = want.x;
        if (Math.abs(want.y - cam.y) < 0.05) cam.y = want.y;
        if (Math.abs(spanNow - cam.span) < 0.05) cam.span = spanNow;
        /* **寄りきったら、追いつききる。** 主人公は画面の決まった場所に居る、
           というのが寄りの約束（`FOOT` の注）。ease で追うと、歩いているあいだ
           ずっと追いつけない——実測（幅390・表紙）で、あやとの足元が枠の
           412〜538px を行き来していた（126px ＝ 枠の 17%）。ゆっくり歩いても
           同じで、**速さではなく「追いつかない」ことが原因**。
           残すのは寄り引きの切り替えだけ。倍率が動いているあいだは ease の
           まま（そこでカメラまで飛ぶと、画が切り替わる）。 */
        if (!wideRef.current && cam.span === spanNow) {
          cam.x = want.x;
          cam.y = want.y;
        }
      }

      const vbW = cam.span;
      const vbH = (cam.span * b.h) / Math.max(1, b.w);
      const vbX = cam.x - vbW / 2;
      const vbY = cam.y - vbH / 2;
      const vb = `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;
      const camMoved = vb !== lastVb;
      /* カメラが止まったのに、絵が引き伸ばされたまま残ることがある。
         止まった1回だけ焼き直して等倍に戻す。**止まっている絵がいちばん長く見られる** */
      if (!camMoved && sceneTf.current) anchor.current.span = 0;
      if (camMoved || sceneTf.current) {
        lastVb = vb;
        const a = anchor.current;
        const kd = b.w / cam.span;
        let s = a.span / cam.span;
        let tx = -(cam.x - a.x) * kd;
        let ty = -(cam.y - a.y) * kd;
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

      // --- あやとの位置。文字にして同じなら書かない ---
      const meTf = `translate(${me.x.toFixed(1)} ${me.y.toFixed(1)}) scale(${ayatoFlip(ayatoRef.current, turn.current.dir, facing.current)} 1)`;
      if (meTf !== lastMe) {
        lastMe = meTf;
        ayatoRef.current?.setAttribute("transform", meTf);
        ayatoShadowRef.current?.setAttribute("cx", me.x.toFixed(1));
        ayatoShadowRef.current?.setAttribute("cy", (me.y + 1).toFixed(1));
      }

      // --- 住人 ---
      const castWrite = stepCast || camMoved;
      for (let i = 0; castWrite && i < folk.length; i++) {
        const v = folk[i];
        // 画面の外の人は書かない。書けば、そのぶん島が塗り直される
        const off =
          v.x < vbX - 120 || v.x > vbX + vbW + 120 || v.y < vbY - 160 || v.y > vbY + vbH + 160;
        const gEl = folkRefs.current[i];
        if (gEl && !off && stepCast) {
          const pose = folkPose(v, t);
          /* 左右は反転しない。住人の絵は視聴者さんが作った正面向きのマスコットで、
             反転すると持ち物（お玉・ウクレレ・花）だけが裏返る */
          const tf = `translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)}) rotate(${pose.rot.toFixed(1)})`;
          if (tf !== lastPose[i]) {
            lastPose[i] = tf;
            gEl.setAttribute("transform", tf);
          }
        }
        const wEl = whoRefs.current[i];
        if (wEl) {
          wEl.style.display = off ? "none" : "";
          if (!off) wEl.style.transform = `translate(${sx(v.x).toFixed(1)}px, ${sy(v.y).toFixed(1)}px)`;
        }
      }

      // --- 建物の札 ---
      /* **行き先を留めているあいだは、いちばん近い建物で決め直さない。**
         歩く道すがら別の建物のそばを通るたびに札が入れ替わっていた（上の `dock`）。 */
      let best: string | null = dockRef.current ?? hoverRef.current;
      if (!best) {
        let bd = HERE;
        for (const sp of world.places) {
          const d = Math.hypot(me.x - sp.x, (me.y - sp.y) * 1.35);
          if (d < bd) {
            bd = d;
            best = sp.id;
          }
        }
      }
      /* 札と建物の当たりを置き直したフレーム。**住人の取り合いもここで見直す。**
         `castWrite`（住人が動いたか・カメラが動いたか）だけで見ていると、
         **動きを控えめにする設定の人**（`prefers-reduced-motion`）では住人が
         1歩も動かないので `stepCast` がいつも false になり、カメラが止まった
         あとに札が出ても、住人の当たりが札に食われたまま直らない。
         測る道具もこの設定で開くので、実測でそれが出た。 */
      const platesRan = camMoved || platesDirty.current;
      if (platesRan) {
        platesDirty.current = false;
        const kk = b.w / vbW;
        if (kk !== lastK) {
          lastK = kk;
          // 住人の当たりを絵の大きさに合わせる。倍率で 53〜94px まで伸び縮みするので、
          // 固定にすると寄ったときに絵の下半分が押せない
          hostRef.current?.style.setProperty("--ws", `${Math.max(TAP_MIN, FOLK_H * kk).toFixed(1)}px`);
        }
        /* あやとの外接矩形（画面px）。絵の置き方は下の `<image>` と同じ式
           （`x: -AYATO_W / 2, y: -AYATO_H, w: AYATO_W, h: AYATO_H`）。
           押しどころではないので `tapTaken` には入れない——入れると、
           あやとの立っているところの建物が押せなくなる。 */
        const meBox = {
          x: sx(me.x) - (AYATO_W / 2) * kk,
          y: sy(me.y) - AYATO_H * kk,
          w: AYATO_W * kk,
          h: AYATO_H * kk,
        };
        const hitsNow = placePlates(world.places, {
          b,
          kk,
          sx,
          sy,
          marks: markRefs.current,
          pins: pinRefs.current,
          sizes: signBox.current,
          edges: edgeAt.current,
          fars: farAt.current,
          wide: wideRef.current,
          taken: uiBoxes.current,
          tapTaken: tapBoxes.current,
          /* **寄りでは、島の上に札を1枚も出さない。**
             字の出る場所は画面の上に固定した（`.isle-going`）ので、ここは常に null。
             引き（島ぜんぶ）だけ、看板の6つを島の上に出す（`shown()` が見ている）。 */
          open: null,
          /* **あやと自身。** 避ける相手に入っていなかったので、降り立った
             1画面目で「配信」の札があやとを 87%（390px）／52%（1280px）
             覆っていた。あやとは押されるまで動かないので、最初のタップが
             あるまで永久にその姿のまま。島の主人公が、島の札に隠れていた。 */
          me: meBox,
        });
        /* **出ている札の箱は、見積もりではなく実測で持つ。**
           `placePlates` は札の置き場所を決めるために箱を組み立てているが、
           それは「置きたい箱」で、実際に立っている箱とは限らない
           （札が出ているかの判定が1フレーム遅れることがある）。
           住人の当たりは札に食われるので、**ここだけは DOM を読む。**
           読むのはカメラが動いたフレームだけ——止まっているあいだ札は動かない。 */
        const won0: Box[] = tapBoxes.current.concat(hitsNow);
        const hb = hostRef.current?.getBoundingClientRect();
        if (hb) {
          for (let i = 0; i < world.places.length; i++) {
            const spot = markRefs.current[i];
            const mk = spot?.querySelector<HTMLElement>(".isle-mark");
            if (!spot || !mk) continue;
            // 出ていない札は押せない（`chain.css` が pointer-events を切っている）ので、
            // 場所も取らない。出ている条件はあちらの選択子と同じものを見る
            const on =
              spot.classList.contains("is-on") ||
              (wideRef.current && spot.classList.contains("is-sign") && !spot.hasAttribute("data-far"));
            if (!on) continue;
            const r = mk.getBoundingClientRect();
            if (r.width < 4) continue;
            /* 札の当たりは `::before` で 49px まで広げてある（`chain.css`。
               ちょうど 48px だと中心から 24px が縁そのものになって落ちる）。
               見た目の箱で足すと、広げたぶんが漏れる。**あちらと同じ数を使う** */
            const w = Math.max(r.width, TAP_FIT);
            const h = Math.max(r.height, TAP_FIT);
            won0.push({
              x: r.left - hb.left + (r.width - w) / 2,
              y: r.top - hb.top + (r.height - h) / 2,
              w,
              h,
            });
          }
        }
        /* **上の帯は動かさない。** 前はここで札のほうを空きへ逃がしていたが
           （`placeGoing`）、逃げる先は島の上なので「字が毎回ちがう場所に出る」
           ことになり、原則そのものを壊していた。いまは帯が定位置のままで、
           当たりのほうが避ける（上の `measure()` が `tapTaken` に入れている）。 */
        blockers.current = won0;
      }
      /* --- 住人の押しどころの取り合い ---
         ---------------------------------------------------------------
         実測（390px・`foldsweep.mjs`）で「話しかける」が 12x60 まで削られて
         いた。相手は建物の当たり。**削った側は盗んだ覚えが無いので気づけない。**

         順番は変えない。**建物が先、住人はそのあと**（会話はおまけで、
         行き先を塞がない。`docs/island-design.md` 3-7）。住人どうしは、
         絵と同じく手前（足元の y が大きいほう）から取る。

         負けたほうは痩せずに引っ込む（`plates.ts` の `fitHit`）。
         引っ込んでいるあいだも、島の地面を押せばいちばん近い住人を拾うので
         （下の `onStageClick` の `folkAt`）、話しかけられなくなるわけではない。 */
      if ((castWrite || platesRan) && blockers.current) {
        const ws = Math.max(TAP_MIN, FOLK_H * (b.w / vbW));
        const won = blockers.current.slice();
        const seat = folk
          .map((v, i) => ({ i, y: v.y }))
          .sort((a, c) => c.y - a.y);
        for (const { i } of seat) {
          const wEl = whoRefs.current[i];
          if (!wEl || wEl.style.display === "none") continue;
          const v = folk[i];
          const ax = sx(v.x);
          const ay = sy(v.y);
          const fit = fitHit({ x: ax - ws / 2, y: ay - ws, w: ws, h: ws }, won, TAP_FIT, {
            x: 0,
            y: 0,
            w: b.w,
            h: b.h,
          });
          const off2 = !fit;
          if (fit) {
            won.push(fit);
            const l = (fit.x - ax).toFixed(1);
            const t2 = (fit.y - ay).toFixed(1);
            const w2 = fit.w.toFixed(1);
            const h2 = fit.h.toFixed(1);
            /* 4つまとめて見て、同じなら書かない。毎フレーム書くと、当たりの箱の
               寸法を書き替えるぶんだけ layout が起きる（絵は transform だけで
               動かしている）。**1つだけ見て済ませない**——場所は同じで大きさ
               だけ変わる回があり、そこを書き落とすと箱が前の大きさのまま残る。 */
            const sig = `${l}/${t2}/${w2}/${h2}`;
            if (wEl.dataset.fit !== sig) {
              wEl.dataset.fit = sig;
              wEl.style.setProperty("--wl", `${l}px`);
              wEl.style.setProperty("--wt", `${t2}px`);
              wEl.style.setProperty("--ww", `${w2}px`);
              wEl.style.setProperty("--wh", `${h2}px`);
            }
          }
          if ((wEl.getAttribute("data-hit") === "off") !== off2) {
            if (off2) wEl.setAttribute("data-hit", "off");
            else wEl.removeAttribute("data-hit");
          }
        }
      }

      if (best !== lastOpen) {
        lastOpen = best;
        setOpenSpot(best);
      }

      /* 奥行きの並び。変わったときだけ描き直す */
      if (stepCast || moving) {
        const sig = folk.map((v) => Math.round(v.y / 24)).join(",") + "|" + Math.round(me.y / 24);
        if (sig !== lastOrder) {
          lastOrder = sig;
          setOrder(sig);
        }
      }

      camBusy = camMoved;
      movingLast = moving;
      raf = requestAnimationFrame(step);
    };

    /* --- 見えていないあいだは動かさない --- */
    let alive = false;
    let onScreen = true;
    const run = () => {
      if (alive || document.hidden || !onScreen) return;
      alive = true;
      last = performance.now();
      hostRef.current?.classList.remove("is-away");
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      hostRef.current?.classList.add("is-away");
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) run();
      else stop();
    }, { rootMargin: "80px" });
    if (hostRef.current) io.observe(hostRef.current);
    const vis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", vis);
    run();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [camWant, folk, ground, spanOf, world]);

  /* --- キーボード --- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) {
        keys.current[k] = true;
        dismissHint();
        /* キーで歩き出した＝自分で行き先を変えた。留めは解く（上の `dock`） */
        undock();
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
  }, [dismissHint, undock]);

  /** 建物へ歩く。押した瞬間に札が開くので、着く前から行き先が分かる */
  const goTo = (s: Placed) => {
    target.current = { x: s.x, y: s.y + 34 };
    walkingTo.current = null;
    dismissHint();
    setOpenSpot(s.id);
    /* **行き先をここで留める。** 札は島の上ではなく画面の下ふちに出るので、
       歩いているあいだも場所が変わらず、着くのを待たずに「みる」が押せる */
    dockRef.current = s.id;
    setDock(s.id);
    if (wide) setWide(false);
  };

  /** その建物に入る。中身のあるものは島の上に板が開き、1つしか無いものは外へ出る */
  const enterPlace = useCallback(
    (sp: Placed) => {
      dismissHint();
      if (sp.items || sp.facts || sp.shorts || sp.board) setSheet(sp.id);
      else if (sp.href) router.push(sp.href);
    },
    [dismissHint, router],
  );

  /** 住人に話しかける。遠ければまず歩いて近づいてから */
  const approach = useCallback(
    (i: number) => {
      const v = folk[i];
      const me = avatar.current;
      dismissHint();
      /* 別のことをしたので、行き先の留めは解く（上の `dock`） */
      undock();
      if (Math.hypot(me.x - v.x, (me.y - v.y) * 1.3) <= TALK_REACH) {
        openTalk(i);
        return;
      }
      v.mood = "stand";
      v.left = 9000;
      walkingTo.current = i;
      target.current = { x: v.x + (me.x > v.x ? 40 : -40), y: v.y + 8 };
    },
    [folk, openTalk, dismissHint, undock],
  );

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 吹き出しが出ているときは、どこを押しても閉じるだけ。ゲームと同じ作法
    if (talking) {
      closeTalk();
      return;
    }
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    const host = hostRef.current!;
    const r = host.getBoundingClientRect();
    const cam = camRef.current;
    const vbW = cam.span;
    const vbH = (cam.span * r.height) / Math.max(1, r.width);
    const wx = cam.x - vbW / 2 + ((e.clientX - r.left) / r.width) * vbW;
    const wy = cam.y - vbH / 2 + ((e.clientY - r.top) / r.height) * vbH;
    dismissHint();
    /* 引きでは話しかけない（あやと「引きのとき、キャラクターと会話できなくて良い」）。
       押しどころのボタンは引きでは描いていないが、地面を押したときにここで
       近くの住人を拾ってしまう。引きの住人は 20px の点なので、
       島の別の場所を押したつもりで吹き出しが開くことになる。 */
    const who = wideRef.current ? null : folkAt(folk, wx, wy, FOLK_H * 0.6);
    if (who) {
      approach(folk.indexOf(who));
      return;
    }
    walkingTo.current = null;
    target.current = { x: wx, y: wy };
    /* 地面を押した＝行き先ではなくその場所へ歩く。留めは解く（上の `dock`） */
    undock();
  };

  /* 景色は島に置いたら二度と動かない。要素を1度だけ作って使い回す。
     並び替えのたびに作り直すと、住人が木を1本またぐたびに
     React が草木を全部見に行くことになる */
  const scenery = useMemo(
    () =>
      world.plants.map((p, i) => ({
        y: p.y,
        key: `p${i}`,
        art: <Sprite key={`p${i}`} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />,
      })),
    [world],
  );
  const houses = useMemo(
    () =>
      world.places.map((p) => ({
        y: p.y,
        key: `h${p.id}`,
        id: p.id,
        x: p.x,
        art: <Sprite name={p.icon} x={p.x} y={p.y} size={p.size} />,
      })),
    [world],
  );

  /** 足元の y で並べ替えてから描く。木の手前に立つべき人が裏に隠れないように */
  const layers = useMemo(() => {
    const cast = folk.map((v, i) => ({ kind: "folk" as const, y: v.y, key: `v${i}`, i, v }));
    const props = scenery.map((s) => ({ kind: "prop" as const, y: s.y, key: s.key, art: s.art }));
    const homes = houses.map((h) => ({ kind: "house" as const, y: h.y, key: h.key, id: h.id, x: h.x, art: h.art }));
    const me = { kind: "ayato" as const, y: avatar.current.y, key: "me" };
    return [...props, ...homes, ...cast, me].sort((a, b) => a.y - b.y);
    // order は「並びが変わった」ことだけを伝える合図
  }, [order, folk, scenery, houses]);

  /* 島の絵の viewBox は毎フレーム rAF が ref に書いている。
     React が描き直したときも同じ値を書かないと、次のフレームまで絵が飛ぶ */
  if (!sceneVb.current) {
    const cam = camRef.current;
    cam.span = cam.span || spanOf(box.w, box.h, false);
    anchor.current = { x: cam.x, y: cam.y, span: cam.span, w: box.w, h: box.h };
    sceneVb.current = anchorVb(cam.x, cam.y, cam.span, box.w, box.h);
  }

  const openPlace = world.places.find((p) => p.id === sheet) ?? null;
  /**
   * 画面の上に出す札。**寄りの札はこれ1枚きり**（島の上には出さない）。
   *
   * 押して向かっている建物（`dock`）が優先。押していないときは、いま
   * いちばん近い建物（`openSpot`）。**注目させるのは一度に1つ**
   * （`docs/island-design.md` 3-4）。
   */
  const dockId = dock ?? openSpot;
  const dockPlace = dockId ? (world.places.find((p) => p.id === dockId) ?? null) : null;

  return (
    <div
      className={`isle${talking ? " is-talking" : ""}${sheet ? " is-sheet" : ""}`}
      data-theme={spec.theme}
      /* カメラが引きか寄りか。引きでは札を全部出して、住人には話しかけられない
         （いまの島の `.stage[data-cam]` と同じ決まり。`docs/island-design.md` 3-4） */
      data-cam={wide ? "wide" : "close"}
      /* 看板ロゴの置き場。**カメラの寄りとは別のもの**（いまの島と同じ決まり。
         `components/island/IslandStage.tsx` の `data-view`）。
         ここが無いあいだ、章の島では `hero.css` の出し分けがどれも当たらず、
         **スマホは引きに移っても 124px の小さい印のまま**だった。
         スマホの寄りだけが小さい印で、あとは看板まるごと。
         **ただし測るまでは出さない**（上の `sized`）。焼いた HTML が仮の
         PC 幅で "wide" を名乗っていると、スマホが 92KB の看板を取って捨てる。 */
      data-view={!sized ? undefined : modeOf(box.w) === "phone" && !wide ? "close" : "wide"}
      data-mode={sized ? modeOf(box.w) : undefined}
      /* React が手を付けたか。立つまでは押しても何も起きないので、島を薄く沈める */
      data-live={live ? "" : undefined}
      /* いま行き先を留めているか。留めているあいだ、札は島の上ではなく
         画面の下ふちに1枚だけ出す（`.isle-going`） */
      data-dock={dock ? "" : undefined}
      /* 表紙か。**看板ロゴが右上にいる面かどうか**が、隅の道具の置き方を変える
         （`chain.css` の `.isle-tools`）。章の島には看板が無いので、
         引きで道具の名前を戻せる。表紙は同じ隅に看板がいて戻せない。 */
      data-cover={cover ? "" : undefined}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg
        ref={sceneRef}
        className="isle-svg"
        viewBox={sceneVb.current}
        style={sceneTf.current ? { transform: sceneTf.current } : undefined}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <IsleGround w={world} />
        {spec.building && <Buildsite world={world} opensAt={spec.building} />}
        {layers.map((l) => {
          if (l.kind === "prop") return l.art;
          if (l.kind === "house")
            return (
              <g
                key={l.key}
                className={`isle-art${openSpot === l.id ? " is-on" : ""}`}
                style={{ transformOrigin: `${l.x}px ${l.y}px` }}
              >
                {l.art}
              </g>
            );
          if (l.kind === "folk") {
            const v: Folk = l.v;
            if (!ready.has(v.icon)) return null;
            return (
              <g
                key={l.key}
                ref={(el) => {
                  folkRefs.current[l.i] = el;
                }}
                transform={`translate(${v.x.toFixed(1)} ${v.y.toFixed(1)})`}
              >
                {(() => {
                  /* いまの島と同じそろえ方（`content/characterBox.ts`）。
                     枠で置くと、中に描かれた figure の大きさが人によって
                     1.5 倍違う。片方だけ直すと、島によって背丈が変わる。 */
                  const b = charPlace(v.icon, FOLK_H);
                  return (
                    <>
                      <ellipse cx={0} cy={0} rx={b.fw * 0.25} ry={b.fw * 0.1} fill="#134a2c" opacity={0.18} />
                      <image href={folkIconUrl(v.icon)} x={b.x} y={b.y} width={b.w} height={b.h} />
                    </>
                  );
                })()}
              </g>
            );
          }
          return (
            <g key={l.key}>
              <ellipse
                ref={ayatoShadowRef}
                cx={avatar.current.x}
                cy={avatar.current.y + 1}
                rx={22}
                ry={8}
                fill="#134a2c"
                opacity={0.22}
              />
              <g
                ref={ayatoRef}
                transform={`translate(${avatar.current.x} ${avatar.current.y}) scale(${ayatoFlip(ayatoRef.current, turn.current.dir, facing.current)} 1)`}
                className="ayato"
              >
                <AyatoSprite h={AYATO_H} />
              </g>
            </g>
          );
        })}
      </svg>

      {/* 夜の灯り。**時間帯の色かぶせより上に重ねる。**
          島の絵の中に混ぜると、夕方・夜のかぶせに沈んで見えなくなる。
          昼は CSS で display:none なので、出ていないあいだの値段はゼロ
          （mix-blend-mode を持つ層は、中身が透明でも画面ぜんぶを合成し直す）。 */}
      <svg
        ref={lampRef}
        className="isle-lamps"
        viewBox={sceneVb.current}
        style={sceneTf.current ? { transform: sceneTf.current } : undefined}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={`isleLamp-${spec.slug}`}>
            <stop offset="0" stopColor="#fff6d4" stopOpacity="1" />
            <stop offset="0.28" stopColor="#ffdc8a" stopOpacity="0.72" />
            <stop offset="0.62" stopColor="#ffc860" stopOpacity="0.3" />
            <stop offset="1" stopColor="#ffbe4d" stopOpacity="0" />
          </radialGradient>
        </defs>
        {world.lamps.map(([lx, ly, lr], i) => (
          <circle key={i} cx={lx} cy={ly} r={lr} fill={`url(#isleLamp-${spec.slug})`} />
        ))}
      </svg>

      {/* 島の下ふち。海をページの地へ溶かす */}
      <span className="isle-shore" aria-hidden />

      {/* 押せるようになるまでの薄い幕。**焼いた HTML にこれが入っている。**
          絵は焼いてあるので島は先に描き終わるが、押して歩けるのは React が
          手を付けてから（実測 390px・CPU4倍＋4G で 2579ms。それまでに地面を
          押しても、あやとは歩き出さない）。待てという合図がどこにも無いので、
          初見の人はそこで1〜2回押して、無反応のまま下へ送ってしまう。
          指は取らない（`chain.css`）ので、JS 無しで動くものは幕越しに押せる。 */}
      {!live && <span className="isle-wait" aria-hidden />}

      {/* 建物の札。**寄りでは島の上に1枚も出さない**（字は画面の上に固定。
          `.isle-going`）。
          **引き（島ぜんぶ）では、看板の6つの名前が島の上に出る。開かない。**
          引きに出せる札は6つまで（`docs/island-design.md` 3-4・6章）で、
          章の島は建つものが最大6つ（`docs/island-atlas.md` 4章、`spec.ts`）なので、
          ここでは全部出しても超えない。10軒建っているいまの島は6つに絞っている。
          引きの建物はあやとの何倍も小さいので、開いた札1枚で島の3割が隠れる。 */}
      <div className="isle-labels">
        {world.places.map((sp, i) => {
          /* 押したら何が起きるか。
             **中身のある建物は、島から出ない。** 島の上に板が開いて、その中に一覧が出る
             （あやとの「やぐらみたいな感じで…が見れて」）。
             行き先が1つしかないもの（旅のしおり・掲示板）だけ、そのまま外へ出る */
          const enter = () => enterPlace(sp);
          return (
            <div
              key={sp.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className={`isle-spot${sp.sign ? " is-sign" : ""}`}
            >
              {/* 建物の当たり。**押しても面は変わらない。歩き出して、札が開くだけ。**
                  ---------------------------------------------------------
                  前はここが「もうそばに立っているなら、そのまま入る」だった。
                  島の上では**歩きたいタップと、面を変えるタップが同じ場所**に
                  あることになり、地面のつもりで押した指が別の面へ出ていく。
                  あやとの言葉（2026-10-14）:「掲示板自体をタップしたら画面切り替え
                  じゃなく「みる」押したらにする（歩きたいタップが被って UX が悪い）」。

                  面を変えるのは札の「みる」だけ（`PlaceMark`）。ここは地面を
                  押したのと同じ——その方向へ歩く。ついでに行き先の札が開く。 */}
              <button
                data-ui
                className="isle-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(sp);
                }}
                /* **「をみる」のままにしてある。** 道具が7本、この語尾で建物の
                   名前を切り出している（`islereach.mjs` ほか。`aftersail.mjs` は
                   `[aria-label="◯◯をみる"]` で選んでいる）。名前を変えると
                   **赤くならずに、建物が1軒も見つからない**という形で落ちる */
                aria-label={`${sp.label}をみる`}
              />
              <span
                className="isle-pin"
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
                <PlaceMark place={sp} left={left} onOpen={enter} />
              </span>
            </div>
          );
        })}
      </div>

      {/* **いま近づいている／向かっている建物の札。字の出る場所は、画面の上に固定。**
          ---------------------------------------------------------
          寄りのあいだ、島の上に札は1枚も出ない。名前も一言も「みる」も、
          ぜんぶこの1か所に出る。**上にも下にも入れ替わらない。**

          あやとの言葉（2026-10-14）:「上や下に文字を出すのではなく
          文字を出す場所は上に固定」。ポケットキャンプの会話も常に上
          （`14.jpg`。画面の上から 14.5%〜28%）。

          島の上に置いていたときに何が起きていたか:
          - カメラが 1.5秒かけて寄るあいだ札が画面を滑る（実測 390px で最大
            244px、1280px で 350px）。滑った先を押すと別の建物の当たりを踏む
          - 置き場所が無いと、ほかの建物の当たりの上に残る（#726）
          - 建物の真上・下・左・右と回るので、**同じ札が毎回ちがう場所に出る**

          置く高さは `--isle-top`（下の `measure()` が決める）。島の上ふちに
          先に居るもの（看板・隅の道具・島の名前）のすぐ下。 */}
      {dockPlace && !wide && (
        <div className="isle-going" data-ui>
          <PlaceMark place={dockPlace} left={left} onOpen={() => enterPlace(dockPlace)} />
        </div>
      )}

      {/* 住人。押す所は建物の当たりより奥に置く（会話はおまけ。行き先を塞がない）。
          **引きでは話しかけられない。** 引きの住人は 20px ほどの点で、
          指で狙う相手ではないし、吹き出しが開けば島ぜんぶがその下に隠れる
          （いまの島と同じ。あやと「引きのとき、キャラクターと会話できなくて良い」）。 */}
      <div className="isle-labels is-cast">
        {folk.map((v, i) => (
          <div
            key={`v${i}`}
            ref={(el) => {
              whoRefs.current[i] = el;
            }}
            className="isle-who"
          >
            {!wide && ready.has(v.icon) && (
              <button
                data-ui
                className="isle-who-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  approach(i);
                }}
                aria-label="話しかける"
              />
            )}
          </div>
        ))}
      </div>

      {/* 今日の島。**表紙のときだけ出す。**
          ---------------------------------------------------------
          出発すると表紙は章の島に入れ替わる（`components/isle/Cover.tsx`）。
          板を手で作った島の中にしか置いていなかったので、**入れ替わった日から
          「今日の1行」「1年前の今日」「今夜のおたずね」「今日の訪問者数」が
          表紙から丸ごと消えていた。** 毎晩ひとりでに焼き直している
          `content/onThisDay.ts` が、旅の初日からどこにも出なくなる。

          **部品は書き写さない。** 出しているのは手で作った島とまったく同じ
          `components/today/Today.tsx`。置き場所の決めかたも同じで、
          PC・タブレットは島の隅、スマホは島の下ふち（`app/css/today.css`）。

          過去の島（`/island/<章>`）には出さない。あそこは「その章を振り返る島」で、
          今日は関係が無い。 */}
      {cover &&
        (modeOf(box.w) === "phone" ? (
          <div className="isle-today">
            <Today place="bar" />
          </div>
        ) : (
          <Today place="corner" />
        ))}

      {/* 吹き出し。画面の上にどんと出して、どこを押しても閉じる */}
      {talking && (
        <div className="isle-talk" role="status">
          <p>{talking.text}</p>
          <span className="isle-talk-tap">画面のどこかを押すと閉じる</span>
        </div>
      )}

      {/* 建物の中。押した建物の一覧が、島の上に開く */}
      {openPlace && <IsleSheet place={openPlace} onClose={() => setSheet(null)} />}

      {/* この島の名前。島に降りた人が最初に読むもの。
          **表紙のときは出さない。** あそこは看板ロゴ（あやと島）が同じ隅にいる。
          隅に札が2枚あると、どちらも読まれない（`docs/island-design.md` 3-4） */}
      {!cover && (
        /* **この面の見出しでもある。** 島は板なので紙の見出し（.phead）を
           置く場所が無く、島の名前を書いた札がそのまま h1 になる。
           表紙のときは、看板ロゴのほうが h1 を持っている */
        <h1 className="isle-sign" data-ui>
          <b>{spec.name}</b>
          <i>{spec.note}</i>
        </h1>
      )}

      {/* 島の隅の道具。**2つを入れ物に入れて横並びにする。**
          前は `.isle-atlas` に `left: 68px` と書いてあり、「道具は 48px の丸が
          2つぶんしか要らない」を前提にしていた。引きでは名前が戻って
          `.isle-view` が 105px に太るので、太ったあとの幅を見ていない
          その数字が、そのまま重なりになる（実測 390px の引きで 49px 重なって、
          「島にもどる」の字が地図の札の下にいた）。
          **隣の幅を数字で書き写さない。並べ方に決めさせる。** */}
      <div className="isle-tools">
        {/* 引きと寄りの切り替え。**いまの島（`.stage-view`）と同じ言葉・同じ板。**
            前はここだけ「島ぜんぶ」と書いてあって、紙の足元にある
            「島のなか ぜんぶ」（行き先の索引）と1字違いだった。
            カメラの操作と行き先の索引が同じ名前で並ぶと、押すまで区別がつかない。
            あやとの言葉:「「島ぜんぶ」は不要」。 */}
        <button
          className="isle-view"
          data-ui
          onClick={() => {
            // 話している最中に引くと、島ぜんぶの上に吹き出しだけが残る
            closeTalk();
            /* カメラを切り替えた＝島を見わたすほうへ移った。留めは解く */
            undock();
            setWide((v) => !v);
          }}
          aria-label={wide ? UI.comeDown : UI.lookAround}
        >
          <Icon name={wide ? "walk" : "island"} size={15} />
          <span className="tool-label">{wide ? UI.comeDown : UI.lookAround}</span>
        </button>

        {/* 島の連なりへ。ここは寄りでも出す。**いまの島とここだけ違う。**
            あちらは下のバーを開けば連なりへ行けるが（`.bar-atlas`）、
            章の島にバーは無い。消すと、寄りから連なりへ行く道が
            船着き場の札1枚だけになる。 */}
        <Link className="isle-atlas" data-ui href="/atlas" prefetch={false}>
          <Icon name="map" size={15} />
          <span className="tool-label">{UI.atlas}</span>
        </Link>
      </div>

      {hint && <p className="isle-hint">押したところまで歩いていくよ。建物に近づくと、中が見られる</p>}
    </div>
  );
}

/** 島の絵の viewBox。画面より各辺 SCENE_PAD だけ広く取る */
function anchorVb(cx: number, cy: number, span: number, w: number, h: number): string {
  const k = Math.max(1, w) / span;
  const vw = (w + SCENE_PAD * 2) / k;
  const vh = (h + SCENE_PAD * 2) / k;
  return `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}

/** 札1枚。名前・一言・「みる」。開いていないあいだは名前だけ */
function PlaceMark({
  place,
  left,
  onOpen,
}: {
  place: Placed;
  left: number | null;
  onOpen: () => void;
}) {
  /* **日数は焼いた字を出しっぱなしにしない。** `since` を持つ札は画面が出て
     から数え直す（`components/isle/ChapDays.tsx`）。島に建てるものの表は
     丸ごと焼かれてブラウザへ渡るので、ここが字を持ったままだと
     「この島のこと 17日目」がデプロイした日で止まる。 */
  const blurb = useSinceWord(place.since, place.blurb);
  return (
    <button
      data-ui
      className="isle-mark"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {place.countdown && left !== null && left >= 0 && (
        <em className="isle-badge" aria-hidden>
          {left === 0 ? "今日" : `あと${left}日`}
        </em>
      )}
      <span className="isle-text">
        <b>{place.label}</b>
        <i><Say t={blurb} /></i>
      </span>
      <span className="isle-go">
        みる
        <Icon name="right" size={12} />
      </span>
    </button>
  );
}

/**
 * 建設中の島（`docs/island-atlas.md` 5章）。
 *
 * **豚の貯金箱の集まりぐあいで、次の島の建設が進む。** 進捗バーではない。
 * 出発の日を過ぎたら、もう「これから建つ島」ではないので消す。
 */
function Buildsite({ world, opensAt }: { world: IsleWorld; opensAt: string }) {
  const fund = useFund();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    // 静的書き出しに焼かない。画面が出てから、出発したかどうかを見る
    setGone(Date.now() >= Date.parse(opensAt));
  }, [opensAt]);
  if (gone) return null;
  /* **足代が読めていないことを、0円と同じ絵にしない**（`docs/island-standards.md` 10）。
     `useFund()` は「まだ読んでいない」も「読めなかった」も null で返すので、それを
     0% として描くと、電波の届かない日に**更地（杭4本だけ）**が出て、
     「まだ1円も入っていない」と言うことになる。出してくれた人に対する嘘。

     額のほうは「読めなかったら出さない」に倒してある（`components/nordic/Support.tsx`）
     ので、**絵もそろえる。** 連なりの模型は先に同じ倒しかたをしていた
     （`components/chain/Isles.tsx` の `!fund ? "unknown"`）。歩ける島だけが
     取り残されていた。 */
  const stage = !fund
    ? "unknown"
    : (() => {
        const pct = Math.min(100, (fund.total / FUND_GOAL_YEN) * 100);
        return pct >= 100 ? "done" : pct >= 50 ? "walls" : pct >= 10 ? "frame" : "bare";
      })();
  return <Building x={world.cx} y={world.cy + world.r * 0.06} r={world.r} stage={stage} />;
}

/* ---- 画面から出た札は、縁に寄せて名前だけ残す ---------------------------
   島の建物は「島に来た人が最初に読むもの」なので、建物が画面の外にあっても
   名前は読めていなければならない。**建物の当たりは動かさない。**
   ずらすのは札だけで、杭は「そっちに建っている」を指す矢に変わる。
   ------------------------------------------------------------------------ */
function placePlates(
  places: Placed[],
  o: {
    b: { w: number; h: number };
    kk: number;
    sx: (v: number) => number;
    sy: (v: number) => number;
    marks: (HTMLDivElement | null)[];
    pins: (HTMLSpanElement | null)[];
    sizes: { w: number; h: number }[];
    edges: string[];
    /** 建物から離れすぎて出さないことにした札。前と変わったときだけ書き換える */
    fars: boolean[];
    /** 引き（島ぜんぶ）か。**離れすぎた札を落とすのは引きだけ**（下の `far`） */
    wide: boolean;
    /** 札を逃がすときに避ける「読めなくなる場所」。押せるかどうかとは別 */
    taken: { x: number; y: number; w: number; h: number }[];
    /** **指を実際に取る**ものだけ。当たりの取り合いはこちらで見る */
    tapTaken: { x: number; y: number; w: number; h: number }[];
    open: string | null;
    /**
     * あやたの立っている箱（画面px）。**札が避ける相手に入れる。**
     *
     * 島の主人公が、避ける相手になっていなかった。実測（降り立った1画面目）で
     * 「配信」の札があやとを 390px で 87%、1280px で 52% 覆っていて、
     * 頭のてっぺんしか出ていない。しかも**あやとは押されるまで動かない**ので、
     * 最初のタップがあるまでその姿が続く。
     *
     * 押しどころではないので `tapTaken` には入れない（入れると、あやとの
     * 立っているところの建物が押せなくなる）。
     */
    me?: Box | null;
  },
): Box[] {
  const pad = 8;
  const padTop = 30;
  const padBottom = 52;
  const taken = o.taken.slice();
  /* 「はみ出しているか」を見るときの相手。
     **自分の建物の当たりは入れない。** 当たりは指で押せる最小(48px)まで
     広げてあるので、小さい建物では札の下辺と自分の当たりの上辺が必ず重なる。
     入れると、小さい建物の札がいつも「はみ出し」になって下へ落ちていく。
     入れるのは島の隅の道具と、**先に置いた札**と、**ほかの建物の当たり**
     （`hitBoxes`。下の `other()`）。 */
  const placed = o.taken.slice();
  /* あやとは「読めなくなる場所」の仲間。札はここを避けて上下左右へ回る
     （`.isle-spot[data-edge]` の矢が、建物のほうを指し続ける）。 */
  if (o.me && o.me.w > 0) {
    taken.push(o.me);
    placed.push(o.me);
  }
  /* 建物の当たり（指で押せる最小 48px まで広げたもの）を、**先に全部そろえる。**
     ---------------------------------------------------------------------
     前は札を1枚置くたびに `taken` へ足していたので、**自分より後ろに並んで
     いる建物の当たりは、まだ `taken` に無かった。** 既定の置き場所（建物の
     真上）はそもそも当たりを見ていなかったので、**開いた札が隣の建物を
     丸ごと覆っても、誰も気づかなかった。**

     実測（390px・寄り・`tools/sprites/islehit.mjs`）:

         /island/nordic   これから歩く国  見た目 49x69  当たり 0x0
         /island/europe   はじめての配信  見た目 48x48  当たり 0x0
         /island/caucasus この島の代表的な企画 見た目 102x85 当たり 0x0

     開いた札は最大 340px あるので、隣の建物1軒はすっぽり入る。
     `docs/island-design.md` 3-1「押す場所は物そのもの」が、そこだけ嘘になる。
     北欧固有ではなく島の共通の穴なので、**順番に依らない形**にする。 */
  const hitBoxes: Box[] = [];
  /**
   * 札が避ける、ほかの建物の当たり。**指を実際に取るものだけ。**
   *
   * 引きでは、看板の6つの建物の当たりは止めてある（`chain.css` の
   * `.isle[data-cam="wide"] .isle-spot.is-sign .isle-hit`。入口は札1枚に
   * 寄せる決まり）。**止まっている当たりを、札が避けていた。**
   * 誰も押せない場所のために札が逃げる、ということ。
   *
   * 当たりどうしの取り合いには、同じ直しが `takesTap` として入っている
   * （「指を1本も取らない『歩いた国』が『企画をだす』の当たりを削っていた」）。
   * **札の側を直していなかった。** 実測（390px・表紙の引き）で
   * 「あやとのこと」は、指を取らない「これから」「配信」「アプリ」の当たりに
   * 8方向とも塞がれて島の下 112px まで運ばれ、離れすぎ（`MAX_LEAD` 108）で
   * 落ちていた。**代表6件が5枚になっていたのはこれ。**
   */
  /* **建物の当たりは `AIR` ぶん細らせてから渡す。**
     札の箱（上の `rect`）は、指の当たりのまわりに `AIR`（6px）の息を足した
     もの。**息が要るのは「隣で読まれるもの」との間だけ**——ほかの札、島の隅の
     道具、看板。建物の当たりは**見えない箱**なので、読みやすさの言い分が無い。
     要るのは「重ならない」ことだけで、まわりに no man's land は要らない。

     息を付けたまま当たっていたので、建物1軒ごとに **12px の帯**（札の 6px ＋
     相手の 6px）が立ち入り禁止になっていた。390px の表紙は看板でない建物が
     7軒、縦 340px の中に 50px 間隔で並んでいるので、**帯がつながって壁に
     なる。** 実測（引き・「やってほしいこと」。札は 140x60）で、
     縁に合わせた候補 129 のうち空きは **0**。細らせると、建物から 44px の
     ところ（島の左ぎわ）が空いた。

     細らせてよい証明は 1次元で足りる。札 `[a, a+w]` に息を足した
     `[a-6, a+w+6]` が相手 `[b, b+v]` を外すのと、札そのものが相手を
     `6` 細らせた `[b+6, b+v-6]` を外すのは、同じ式になる（`v > 12` のかぎり。
     当たりは 48px 以上あるので必ず成り立つ）。

     **細らせるのは引きだけ。**

     - 引きの札は**閉じた名前1枚**（49x30）で、看板の6軒にとっては
       **唯一の入口**（建物の当たりは止めてある）。置き場所が無いと入口が
       まるごと消えるので、要らない 6px のために消してよいものではない
     - 寄りの札は**開いた1枚**（390px で 237x64。添え書きと「はいる」つき）で、
       読むのに時間がかかる。そして建物の当たりは寄りでは生きているので、
       札が置けなくても入口は消えない。**息を詰める理由が無い。**

     寄りでも細らせてみたら、開いた札（237x64）の置き場所が変わって、
     「いまどこ」「企画」の当たりが札の下に入った（`islereach.mjs` で
     「いつも 13 → 11・ときどき届かない」）。**入口を1つ救う直しで、
     別の入口を2つ潰していた。** 引きに閉じれば両方立つ。 */
  const slim = (q: Box): Box =>
    o.wide ? { x: q.x + AIR, y: q.y + AIR, w: q.w - AIR * 2, h: q.h - AIR * 2 } : q;
  const other = (i: number) =>
    hitBoxes.filter((_, j) => j !== i && takesTap(j)).map(slim);
  /**
   * その札が**いま画面に出ているか**。`chain.css` の `.isle-mark` の
   * opacity と同じ条件（寄りは近づいた1軒だけ、引きは看板の6つだけ）。
   *
   * **出ていない札を避ける相手に入れない。** 入れていたので、寄りの島では
   * 出ていない札5枚が場所を押さえてしまい、**たった1枚の開いた札**が
   * 上にも下にも逃げられなくなっていた（実測: 390px の `/island/europe` で
   * 上 -2px・下 655px、どちらも板の外。逃げ場が無いので元の位置に残り、
   * そこが隣の建物の上だった）。出ていない札は見えないし押せないので、
   * 場所を取る理由が無い。
   */
  const shown = (sp: Placed) => (o.wide ? !!sp.sign : sp.id === o.open);
  const plates: {
    i: number;
    el: HTMLDivElement;
    fx: number;
    fy: number;
    rect: Box;
    out: boolean;
    /** 建物の絵の幅と高さ。まわりへ回すときに要る */
    artW: number;
    mh: number;
    /** いま画面に出ている札か。出ていない札は場所を押さえない */
    shown: boolean;
  }[] = [];

  /* --- 1巡目。建物を置いて、当たりを**全部そろえる** ---
     札の置き場所を決めるのは2巡目。分けないと、順番の後ろにいる建物の
     当たりを見ないまま札を置くことになる（上の `hitBoxes`）。 */
  const art: { px: number; py: number; artW: number; mh: number }[] = [];
  for (let i = 0; i < places.length; i++) {
    const el = o.marks[i];
    if (!el) continue;
    const sp = places[i];
    const px = o.sx(sp.x);
    const py = o.sy(sp.y);
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    // 絵の大きさは倍率で変わるので測り直す。当たりは指で押せる最小(48px)まで広げるが、
    // 札の高さは絵の実寸を使う（最小に合わせると、引きで札が建物から浮く）
    const artW = spriteWidth(sp.icon, sp.size) * o.kk;
    const artH = sp.size * o.kk;
    el.style.setProperty("--hw", `${Math.max(TAP_MIN, artW).toFixed(1)}px`);
    el.style.setProperty("--hh", `${Math.max(TAP_MIN, artH).toFixed(1)}px`);
    const mh = Math.max(12, artH);
    el.style.setProperty("--mh", `${mh.toFixed(1)}px`);

    /* 建物そのものの当たりも、寄せる札が避ける相手に入れる。
       入れないと、縁へ寄せた札が別の建物の上に乗って、
       **建物が押せなくなる**（実測で 48px の当たりが 46px まで削られていた）。
       絵の上に札が乗って、どちらが何なのかも分からなくなる。 */
    /* **絵の幅ではなく、当たりの幅で中心をとる。**
       当たりは CSS で `left: calc(var(--hw) / -2)`（`--hw` は 48px まで
       広げたほう）に置いてある。`artW / 2` で寄せると、絵が 48px より
       小さい建物で当たりの箱が (48 - artW) / 2 だけ右へずれる。
       引きでは絵が 20px ほどまで縮むので、14px ずれた場所を避けていた。 */
    const hw = Math.max(TAP_MIN, artW);
    const hh = Math.max(TAP_MIN, artH);
    hitBoxes[i] = { x: px - hw / 2, y: py - hh, w: hw, h: hh };
    art[i] = { px, py, artW, mh };
  }

  /* --- 1巡目の続き。建物どうしの取り合いを解く ---
     ---------------------------------------------------------------------
     当たりを 48px まで広げた者どうしが重なると、あとから描かれたほうが勝ち、
     先に描かれたほうが痩せる。実測（390px・表紙）で「いまどこ」が 49x34、
     「この旅のこと」が 86x37 まで削られていた。**削られた側は、自分が
     削られていることを知らない。**

     **手前にいる建物から先に取る。** 絵は足元の y で並べて描いてあるので
     （`layers`）、手前の建物は後ろの建物を隠している。隠れている側の当たりを
     手前が持っていくのは、絵と同じ順番。残った側は、**見えている上半分**が
     押しどころになる（`fitHit`）。48px を取れなかった建物は引っ込む。

     **引っ込めた建物に、代わりの入口があるとは限らない**（`plates.ts` に書いた）。
     引きで札が出るのは看板の6つだけ、寄りでは近づいた1軒だけなので、
     引っ込めたぶんがそのまま「入口の無い建物」になることがある。
     だから引っ込める数は**取り合いの解き方で減らす**——下の `takesTap` と、
     負けた者に先に選ばせるやり直しがそれ。 */
  const depth = places
    .map((sp, i) => ({ i, y: sp.y }))
    .sort((a, b) => b.y - a.y)
    .map((q) => q.i)
    .filter((i) => o.marks[i] && art[i] && hitBoxes[i]);
  /**
   * その建物の当たりが、**いま指を実際に取るか。**
   *
   * 引きでは、札の出ている看板の建物は当たりを止めてある
   * （`chain.css` の `.isle[data-cam="wide"] .isle-spot.is-sign .isle-hit`。
   * 入口は札1枚に寄せる決まり）。**止めてあるものを取り合いに入れていた。**
   * 実測（390px・表紙の引き）で、指を1本も取らない「歩いた国」の 49x49 が
   * 「企画をだす」の当たりを 48x33.5 まで削り、削られたほうは 48px を
   * 取れずに引っ込んで、**札も当たりも無い建物**になっていた。
   *
   * `uiBoxes`（読めなくなる場所）と `tapBoxes`（指を取る場所）を分けたのと
   * 同じ理由。**見えない箱と、指を取る箱は別物。**
   */
  const takesTap = (i: number) => !o.wide || !places[i].sign || o.fars[i];
  /** 欲しい箱（絵の大きさを 48px まで広げたもの）。取り合いを何度やり直しても、
      出発点はいつもここ */
  const want = hitBoxes.slice();
  /** `seq` の順に 49px を取っていく。取れなかったところは `null` */
  const claim = (seq: number[]) => {
    const got: (Box | null)[] = new Array(places.length).fill(null);
    const won: Box[] = o.tapTaken.slice();
    for (const i of seq) {
      const fit = fitHit(want[i], won, TAP_FIT, { x: 0, y: 0, w: o.b.w, h: o.b.h });
      if (!fit) continue;
      got[i] = fit;
      if (takesTap(i)) won.push(fit);
    }
    return got;
  };
  const lost = (got: (Box | null)[]) => depth.filter((i) => !got[i]);
  /* **先に取った者勝ちを、1回で終わらせない。**
     順番は手前の建物から（絵は足元の y で並べて描いてあるので、手前は後ろを
     隠している。隠れている側の当たりを手前が持っていくのは、絵と同じ順番）。
     ただしこの順番は**取り合いに負けた者が出たときの答えにはなっていない。**
     実測（390px・表紙の引き）で、先に選んだ「いまどこ」が 17px 上へ伸びただけで
     「これから」の逃げ場が消え、入口の無い建物が1軒増えた。**もぐら叩きになる。**

     なので**負けた者に先に選ばせて、もう一度解く。** 負けが減ったほうを採る。
     減らなければそこで打ち切る（形は変わらないので、行ったり来たりしない）。 */
  let got = claim(depth);
  for (let pass = 0; pass < 3; pass++) {
    const l = lost(got);
    if (!l.length) break;
    const retry = claim(l.concat(depth.filter((i) => !l.includes(i))));
    if (lost(retry).length >= l.length) break;
    got = retry;
  }
  for (const i of depth) {
    const el = o.marks[i]!;
    const a = art[i]!;
    const fit = got[i];
    const off = !fit;
    if (fit) {
      hitBoxes[i] = fit;
      el.style.setProperty("--hl", `${(fit.x - a.px).toFixed(1)}px`);
      el.style.setProperty("--ht", `${(fit.y - a.py).toFixed(1)}px`);
      el.style.setProperty("--hiw", `${fit.w.toFixed(1)}px`);
      el.style.setProperty("--hih", `${fit.h.toFixed(1)}px`);
    } else {
      /* 押しどころを出さない建物は、**場所も取らない。**
         取らせると、そのぶん住人まで押せなくなる */
      hitBoxes[i] = { x: -9999, y: -9999, w: 0, h: 0 };
      /* **前のフレームの箱を、そのまま残さない。**
         `--hl/--ht/--hiw/--hih` は当たりが取れたときにしか書かない。
         引っ込めるときに消していなかったので、当たりの箱は**前に取れた
         ときの場所**に居座っていた。カメラが寄りから引きへ動くと建物の
         大きさが何倍も変わるので、居座った箱は建物からまるごと離れる——
         実測（390px・表紙の引き）で「伝説の企画」の当たりが建物の
         **108px 上**、看板ロゴの板の上に載っていた。
         消せば `chain.css` の既定（絵の大きさそのまま）に戻る。 */
      for (const k of ["--hl", "--ht", "--hiw", "--hih"]) el.style.removeProperty(k);
    }
    if ((el.getAttribute("data-hit") === "off") !== off) {
      if (off) el.setAttribute("data-hit", "off");
      else el.removeAttribute("data-hit");
    }
  }

  /* --- 2巡目。札を置く --- */
  for (let i = 0; i < places.length; i++) {
    const el = o.marks[i];
    const a = art[i];
    if (!el || !a) continue;
    const sp = places[i];
    const { px, py, artW, mh } = a;
    const sz = o.sizes[i];
    if (sz && sz.w) {
      const gy = sp.countdown ? 26 : 6;
      /* 詰めるのは**見た目の箱ではなく、指の当たり**。札は 30px しかないが、
         `::before` が指で押せる最小まで広げてある（`island-design.md` 3-2）。
         見た目で詰めると、隣の札の見えない当たりが食い込んで両方 48px を割る。
         **ここは `TAP`（48）。`TAP_FIT`（49）ではない。** 49 は「測るときの
         丸めで落ちないように1px 多く取る」ぶんで、離す決まりそのものは 48。
         ここに 49 を使うと、決まりが要求していない 0.5px ぶん札が動く（実測）。 */
      const hw = Math.max(sz.w, TAP);
      const hh = Math.max(sz.h, TAP);
      /* 札が実際に立っている高さ。**CSS と同じ式で出す。**
         `chain.css` の `.isle-mark` は `bottom: calc(max(var(--mh), 46px) + 12px)`
         で、絵の低い建物では 46px のほうが効く。ここが `mh` のままだったので、
         **引きのように絵が 20px まで縮む場面で、札の実物が計算より最大 34px
         上にいた。** 重なりを見る箱がそこだけ実物とずれるので、
         「避けたはずの建物」が札の下に入っていた。 */
      const stand = Math.max(mh, 46);
      /* 指の当たりのまわりに取る息の幅（`AIR`）。**読める相手との間だけに要る。**
         下の `other()` がここと同じ数で建物の当たりを削っているので、
         片方だけ変えないこと（変えると札が建物の当たりへ食い込む）。 */
      const rect = {
        x: px - hw / 2 - AIR,
        y: py - stand - 12 - sz.h - (hh - sz.h) / 2 - gy,
        w: hw + AIR * 2,
        h: hh + gy + AIR,
      };
      const out =
        rect.x < pad ||
        rect.x + rect.w > o.b.w - pad ||
        rect.y < padTop ||
        rect.y + rect.h > o.b.h - padBottom ||
        // 島の隅の道具の下・先に置いた札の下に入った札も、寄せ直す。半分隠れた札は読めない
        placed.some(
          (q) =>
            rect.x < q.x + q.w && rect.x + rect.w > q.x && rect.y < q.y + q.h && rect.y + rect.h > q.y,
        ) ||
        /* **ほかの建物の当たりの上にも置かない。**
           ここを見ていなかったので、開いた札が隣の建物を丸ごと覆って、
           その建物が押せなくなっていた（上の `hitBoxes` に実測）。
           自分の建物は外す。48px まで広げた自分の当たりは、札の下辺と
           必ず重なるので、入れると札がいつも下へ落ちていく。 */
        other(i).some((q) => hits(rect, q));
      if (!out && shown(sp)) {
        taken.push(rect);
        placed.push(rect);
      }
      plates.push({ i, el, fx: px, fy: py, rect, out, artW, mh, shown: shown(sp) });
    }
  }

  for (const pl of plates) {
    const pin = o.pins[pl.i];
    if (!pin) continue;
    /* この札が避ける相手。島の隅の道具＋先に置いた札（`taken`）に、
       **自分以外の建物の当たり**を足したもの。自分の当たりは外す
       （48px まで広げてあるので、自分の札の下辺と必ず重なる）。 */
    const tkn = taken.concat(other(pl.i));
    const { rect } = pl;
    let dx = 0;
    let dy = 0;
    let dir = "";
    let far = false;
    if (pl.out) {
      /* **まず建物のまわりを回る。** 上がふさがっていても、下・右・左が
         空いていることが多い。ここを見ずに上下へ運んでいたので、混んだ島では
         札が海の上まで運ばれていた（`./plates.ts` に実測を書いた）。 */
      /* **`tkn` で見る（`placed` ではない）。** `tkn` には建物の当たり
         （48px）も入っている。`placed` だけで見ると、回した先が隣の建物の
         見えない当たりの下になって、札の押しどころが削られる */
      /* 逃がし先を探すときの下の余白。**寄りだけ広く取る。**
         `padBottom`（52px）は「今日の島」の板1枚ぶんを空けておくための数だが、
         その板は `tkn`（島の隅の道具）にも入っているので、**同じ場所を二重に
         禁じていた。** 引きの札は落とせるので二重でも困らないが、寄りの札は
         落とせないので、禁じたぶんがそのまま「ほかの入口の上に残る」に化ける。 */
      const bot = o.wide ? padBottom : 10;
      const free = (c: Box) =>
        c.x >= pad &&
        c.x + c.w <= o.b.w - pad &&
        c.y >= padTop &&
        c.y + c.h <= o.b.h - bot &&
        !tkn.some((q) => hits(c, q));
      /* 8か所が全部ふさがっていたら、**隙間の縁に合わせて探す**（`./plates.ts`
         の `nooks`）。候補はどれも `MAX_LEAD` の中なので、ここで見つかった
         場所は「建物のそば」の決まりを満たしている。作るのは8か所が全滅した
         ときだけ——ふだんは1つめで決まるので、重さは前と変わらない。 */
      /** 板の中に収まっているか（相手は見ない） */
      const inBoard = (c: Box) =>
        c.x >= pad &&
        c.x + c.w <= o.b.w - pad &&
        c.y >= padTop &&
        c.y + c.h <= o.b.h - bot;
      /**
       * ここに置いたら、**入口をいくつ殺すか。**
       *
       * 「重なっているか」では細かすぎる。建物の当たりは 48px まで広げて
       * あるので、札が端をかすめても、残りで 48px を取り直せることが多い。
       * 数えるのは**取り直せなくなったもの**だけ——`plates.ts` の `cuts` が
       * 返す残りに、48px 四方が1つも無いとき（`fitHit` が引っ込める条件）。
       */
      const kill = (c: Box) =>
        other(pl.i).reduce(
          (n, q) => n + (hits(c, q) && !cuts(q, c).some((k) => k.w >= TAP && k.h >= TAP) ? 1 : 0),
          0,
        );
      const nook = nooks(
          rect,
          pl.fx,
          pl.fy,
          tkn,
          {
            x: pad,
            y: padTop,
            w: o.b.w - pad * 2,
            h: o.b.h - padTop - bot,
          },
          /* **どこまで離れてよいかは、寄りと引きで違う**（`plates.ts` の
             `MAX_LEAD_NEAR`）。引きは離れすぎたら札を落とすので 108px で
             打ち切ってよいが、**寄りは落とさない**ので、打ち切ったぶんは
             「ほかの建物の当たりの上に残る」に化ける。実測（幅390・表紙）で
             「配信」の開いた札が「あやとグッズ」の当たりを 66/121 点覆って、
             押しどころを 0x0 にしていた。108px の外には空きがあった。 */
          o.wide ? MAX_LEAD : MAX_LEAD_NEAR,
        );
      /* **空いている場所が1つも無いときに、どこへ置くか。**
         寄りの札は落とせない（落とすと、降り立った人が読む名前が消える）ので、
         どこかには置くことになる。そこで**殺す入口がいちばん少ない場所**を採る。

         札は建物の当たりに少しかかってもよい——当たりは 48px まで広げて
         あるので、残りで取り直せる（`plates.ts` の `cuts`）。駄目なのは
         **取り直せなくなる**置き方だけ。ここを「重なっているか」だけで
         切っていたので、候補が1つも残らず元の位置（＝隣の建物の真上）に
         残って、その入口が 0x0 になっていた。実測（2026-10-13・幅390・
         `/island/middle-east` の寄り）で「となりの島へ」の開いた札が
         「この島で歩いた国」の当たりを 99/121 点覆っていた。

         `nooks` は**動かさずに済む順**に返すので、同じ被害なら近いほうが勝つ。 */
      const least =
        !o.wide && nook.length
          ? nook.filter(inBoard).reduce((a, c) => (kill(c) < kill(a) ? c : a), nook[0])
          : undefined;
      const spot =
        around(rect, pl.fx, pl.fy, pl.artW, pl.mh).find(free) ??
        nook.find(free) ??
        (least && kill(least) === 0 ? least : undefined);
      if (spot) {
        dx = spot.x - rect.x;
        dy = spot.y - rect.y;
        if (pl.shown) {
          taken.push({ ...spot });
          placed.push({ ...spot });
        }
        const ax = pl.fx - (spot.x + spot.w / 2);
        const ay = pl.fy - (spot.y + spot.h / 2);
        dir = spot === rect ? "" : Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "l" : "r") : ay < 0 ? "u" : "d";
        if (dir !== o.edges[pl.i]) {
          o.edges[pl.i] = dir;
          if (dir) pl.el.setAttribute("data-edge", dir);
          else pl.el.removeAttribute("data-edge");
        }
        if (o.fars[pl.i]) {
          o.fars[pl.i] = false;
          pl.el.removeAttribute("data-far");
        }
        pin.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : "";
        continue;
      }
      let left = rect.x;
      let top = rect.y;
      if (left < pad) dx = pad - left;
      else if (left + rect.w > o.b.w - pad) dx = o.b.w - pad - (left + rect.w);
      if (top < padTop) dy = padTop - top;
      else if (top + rect.h > o.b.h - padBottom) dy = o.b.h - padBottom - (top + rect.h);
      left += dx;
      top += dy;
      /* 先に置いたものと重なるなら、縦に逃がす（縦に並べば両方読める）。
         **1回の逃がしのあいだは向きを変えない**（変えると避けたはずのものへ
         帰っていく）。向きは建物が画面の上半分にいるか下半分にいるかで決める。
         引きでは島が真ん中に小さく収まっていて、上にも下にも海が空いている。
         下だけへ逃がすと、島の上半分の建物の札まで島の下に長い列を作る
         （実測で6枚中3枚）。画面から出てしまったら反対で引き直す。 */
      const slide = (up: boolean) => {
        let t = top;
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (const q of tkn) {
            if (left < q.x + q.w && left + rect.w > q.x && t < q.y + q.h && t + rect.h > q.y) {
              const push = up ? q.y - 8 - (t + rect.h) : q.y + q.h + 8 - t;
              if (up ? push < 0 : push > 0) {
                t += push;
                moved = true;
              }
            }
          }
          if (!moved) break;
        }
        return t;
      };
      const inView = (t: number) => t >= padTop && t + rect.h <= o.b.h - padBottom;
      /* **上と下の両方へ逃がしてみて、動きの少ないほうを取る。**
         前は「画面の上半分なら上、下半分なら下」と向きを先に決めていた。
         その決め方だと、島の下ぎわに建物が3つ並んだときに札が3枚とも
         下へ逃げ続けて、**海の上に階段のように積み上がった**（撮って分かった）。
         札は建物のそばにあるほど読める。島の絵に重なるのは構わない
         （いまの島の札も島の上に載っている）。 */
      const up = slide(true);
      const down = slide(false);
      const okUp = inView(up);
      const okDown = inView(down);
      let t0: number;
      /* **上と下で迷ったら、建物に近いほうを採る。「動きの少ないほう」ではない。**
         落とす／落とさないを決めているのは建物からの距離（下の `lead`）なのに、
         選ぶほうは動いた量で決めていた。**測るものと決めるものが違っていた。**
         実測（1280px・引き・「あやとのこと」）で、上は 74px 動いて建物から
         152px（＝落ちる）、下は 85px 動いて建物から 7px だった。
         11px 余計に動くのを惜しんで、札を1枚消していた。 */
      const far2 = (t: number) => lead({ x: left, y: t, w: rect.w, h: rect.h }, pl.fx, pl.fy);
      if (okUp && okDown) t0 = far2(up) <= far2(down) ? up : down;
      else if (okUp) t0 = up;
      else if (okDown) t0 = down;
      else {
        /* 上にも下にも逃げ場が無いとき、**元の位置に残さない。**
           元の位置が隣の建物の上だったから `out` になっている。残すと、
           その建物の当たりが札に丸ごと食われる（実測 0x0）。
           板の中へ収めた3つ（上・下・元）から、**建物に乗る数がいちばん
           少ないもの**を取る。同じなら動きの小さいほうを取る。 */
        const fit = (t: number) => Math.min(Math.max(t, padTop), Math.max(padTop, o.b.h - padBottom - rect.h));
        /* **数えるのは「乗った建物の数」ではなく「殺した入口の数」。**
           当たりは 48px まで広げてあるので、端をかすめただけなら残りで
           取り直せる（上の `kill`）。取り直せる相手と取り直せない相手を
           同じ1件として数えていたので、**殺すほうの置き方が選ばれる**回があった */
        const onArt = (t: number) => kill({ x: left, y: t, w: rect.w, h: rect.h });
        t0 = [fit(up), fit(down), fit(top)].reduce((best, c) => {
          const d = onArt(c) - onArt(best);
          return d < 0 || (d === 0 && Math.abs(c - top) < Math.abs(best - top)) ? c : best;
        });
      }
      dy += t0 - top;
      top = t0;
      let box = { x: left, y: top, w: rect.w, h: rect.h };
      /* **上下へ逃がした先より、隙間の縁に合わせた候補のほうが被害が小さいなら、
         そちらを採る。** 上下へ逃がすのは横を動かさない逃げ方なので、
         島が横に混んでいるとどこへ動かしても同じ建物の上に残る。
         `nooks` は横も見ている（`least`）。**殺す入口の数で選ぶ。**
         落とすのは引きだけなので、ここで効くのは寄りだけ（`least` が寄り限定）。 */
      if (least && kill(least) < kill(box)) {
        dx += least.x - box.x;
        dy += least.y - box.y;
        left = least.x;
        top = least.y;
        box = { x: left, y: top, w: rect.w, h: rect.h };
      }
      /* **建物から離れすぎたら、その札は出さない。**
         差し棒が何も指していない札は、名前が読めても行き先になっていない
         （`docs/island-design.md` 3-1）。建物そのものは押せるまま残るので、
         押せば歩いて寄って、寄れば名前が出る。 */
      /* **落とすのは引きだけ。** 寄りで出ている札は「いま近づいている1軒」の
         名前1枚で、画面の外の建物でも名前は読めていなければならない
         （縁へ寄せて矢で指す、というのがこの関数の元の仕事）。
         落とすと、近づいた建物の名前が出ない画面ができる。 */
      /* **ほかの建物の当たりに乗ったままなら、その札は出さない。**
         逃げ場が無くて元の場所に残った札は、隣の建物を覆っている。
         覆われた建物は、引きでは押しどころが札1枚に寄せてあるぶん
         （`chain.css` の `.is-sign .isle-hit`）、札を落とされた建物にとって
         **唯一の押しどころ**になる。そこが札の下だと、触りようが無くなる。
         名前は1つ減るが、建物は押せる。寄れば名前も出る。
         **落とすのは引きだけ**（寄りの札は「近づいた1軒」の名前1枚なので、
         落とすと名前の出ない画面ができる）。 */
      far =
        o.wide &&
        (lead(box, pl.fx, pl.fy) > MAX_LEAD || other(pl.i).some((q) => hits(box, q)));
      if (!far && pl.shown) {
        taken.push(box);
        placed.push(box);
      }
      /* 矢は、寄せた先から見て**建物が実際にどっちにあるか**を指す */
      const ax = pl.fx - (left + rect.w / 2);
      const ay = pl.fy - (top + rect.h / 2);
      dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "l" : "r") : ay < 0 ? "u" : "d";
    }
    if (dir !== o.edges[pl.i]) {
      o.edges[pl.i] = dir;
      if (dir) pl.el.setAttribute("data-edge", dir);
      else pl.el.removeAttribute("data-edge");
    }
    if (far !== o.fars[pl.i]) {
      o.fars[pl.i] = far;
      if (far) pl.el.setAttribute("data-far", "1");
      else pl.el.removeAttribute("data-far");
    }
    pin.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : "";
  }

  /* 建物の当たり（取り合いを解いたあと）を返す。住人はこれを避ける。
     **札は返さない。** 札は「置きたい箱」なので、住人が避ける相手としては
     `IsleStage` 側が DOM の実測で足す。 */
  return hitBoxes.filter((q) => q && q.w > 0);
}
