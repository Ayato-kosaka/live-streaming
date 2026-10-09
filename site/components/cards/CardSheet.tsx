"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import {
  SCALE_MAX,
  SCALE_MIN,
  TILT_MAX,
  clampPlace,
  screenFrame,
  stretchOf,
  wallFileName,
  type Frame,
  composeMany,
  defaultPlaceFor,
  framesOf,
  loadImage,
  opaqueBox,
  pickAt,
  placeFromBox,
  stampFileName,
  toJpeg,
  type Figure,
  type Place,
} from "@/components/nordic/stamp";
import { STICKERS } from "@/content/goods";
import { moveCard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import DropPhoto from "./DropPhoto";
import {
  cardIcon,
  cardWhen,
  useMyCardIds,
  type PhotoGroup,
  type PlanBrief,
} from "./cards";

/**
 * 写真を1枚ひらいて、キャラクターを入れて、持って帰るところ。
 *
 * **旅の写真（`/nordic/photos`）とあやと島カード（`/cards`）を1つにした
 * あとの、開いた先。** 2つの面は同じ写真の同じ人を、別々の言い方で出して
 * いた。あやとの言葉（2026-09-10）:
 *
 * > /nordic/photos のUXの方がわかりやすいから統合して欲しい
 * > カードリストがダウンロードできるようにしてほしい（もちろん、キャラ埋めなしでも。）
 *
 * だから開き方も持ち帰り方も、写真の側（もとの `PhotoStudio`）に寄せた。
 *
 * ## はじめは素の写真を出す
 *
 * 前は、開いた瞬間に**1人目のキャラクターが入った絵**が出ていた。
 * あやとの言葉:「代表でキャラクターを埋めるのはやめて欲しい」。
 * 4人ぶんあるカードの1人目が、その写真の代表のように見える。
 * 開いたときに出るのは**写真そのもの**で、入れるかどうかは押した人が決める。
 *
 * ## 出ているこの絵が、そのまま持って帰る1枚
 *
 * 画面に出しているのは合成したあとの canvas（と、それを焼いた jpeg）なので、
 * **見えているものと保存されるものが必ず同じ**になる。長押しでも持って帰れる。
 *
 * 引きずっているあいだだけ canvas が前に出て、手が止まると jpeg に
 * 入れ替わる。**絵は同じ。** 1フレームごとに jpeg へ焼くと 2048px では
 * 間に合わないので、動いているあいだは焼かないだけ。長押しで保存するのは
 * jpeg のほうなので、**手を離したあとの画面には、いつも焼き上がりが出ている。**
 *
 * 保存は3段構え（`docs/nordic-photos.md` 6章）。スマホで押す人のほうが
 * 多く、`<a download>` は iOS Safari で効かないことがある。
 *   1. 端末が共有を持っていれば、そこへ渡す（iOS はここに「画像を保存」が出る）
 *   2. 無ければ `<a download>`
 *   3. どちらも駄目でも、出ている絵が焼き上がりなので長押しで保存できる
 *
 * ## 立ち位置は、本人のカードだけ覚える
 *
 * 引きずって動かすのは**誰でもできる。** ログインしていない人も、他人の
 * カードも、手元で動かして持って帰れる。ここを「ログインしないと動かせない」
 * にすると、ほとんどの人が触れなくなる。
 *
 * **覚えるのは、ログインした本人の、自分のカードだけ**（`POST /cards/<id>`
 * がその判定を持っている）。本当のカードIDは `GET /cards/mine` にしか
 * 入らないので、引き当ては `useMyCardIds`。
 *
 * ## あやと本人を入れるかどうかは、保存しない
 *
 * 書類に欄を足さない。保存すると、**他の人が見るカードの見た目まで変わる。**
 * 誰も頼んでいない。ここでやっているのは「自分の記念の1枚をどう作るか」
 * なので、持って帰る絵にだけ効かせる。
 *
 * **どのあやとを入れたかも、同じ理由で保存しない**（2026-10-08）。
 * `POST /cards/<id>` が受けるのは立ち位置（`x/y/rot/scale`）だけで、
 * そこへ1欄足すと、**ログインした本人が、自分のカードを開いたときだけ
 * 覚える**という、同じ札なのに人によって振る舞いの違うものになる。
 * いま配ってあるカードの書類も、1枚も読み替えなくてよい——
 * **欄が無い＝入れない**で、いままでと同じ絵が出る。
 *
 * ## 入れるあやとは `content/goods.ts` の `STICKERS` から引く
 *
 * **ここに名簿を作らない**（`docs/island-standards.md` 8章）。
 * グッズの面に並んでいるステッカーが、そのまま選び先になる。
 * 1枚足した日に、落とせる面とカードの両方で同時に増える。
 *
 * 焼くのに使うのは `art`（面に並べる小さいほう）ではなく **`file`（元絵）**。
 * 持って帰る1枚は長辺 2048px で焼くので、小さいほうを使うと、
 * 貼ったあやとだけが眠い絵になる。
 */

/** 選ぶところに出す1人。 */
type Pick = { key: string; icon: string; name: string; place: Place | null };

/**
 * 1人ぶんの持ちかた。
 *
 * **`flip` は保存しない。** 口（`POST /cards/<id>`）が受けるのは
 * `x/y/rot/scale` だけで、ここに1欄足すと**他の人が見るカードの向きまで
 * 変わる。** 誰も頼んでいない（入れるあやとを保存しないのと同じ理由）。
 */
type Hold = { place: Place | null; flip: boolean };
const BLANK: Hold = { place: null, flip: false };

/**
 * 最初から人の入っている紙で、「あやとも入れますか」の頭を
 * 胴の下から何 px 覗かせるか。**字が1行ぶん読める高さ。**
 * これより小さいと「何か在る」だけになって、何が在るか分からない。
 */
const PEEK = 36;

/**
 * かべがみにしたとき、**足元をここまで上げる**（塀の高さに対して）。
 *
 * 既定（カードのかたち）の足元は下から 5% だが、スマホのかべがみは
 * **下の 12% にライトとカメラのボタンとホームバーが乗る**ので、
 * そのまま持っていくと足が隠れる。初めてかべがみにしたときだけ、
 * ボタンの帯の上へ置き直す。**そのあと動かすのは押した人。**
 */
const WALL_FOOT = 0.12;

/** 手が止まってから焼くまで。**動かしているあいだは焼かない** */
const BAKE_MS = 150;
/** 動かし終わってから覚えるまで。**引きずっている途中には投げない** */
const SAVE_MS = 700;

export default function CardSheet({
  group,
  plans,
  startIcon,
  onClose,
  onDropped,
}: {
  /** 開いた写真1枚ぶん。新しい順のまま渡ってくるので並べ直さない */
  group: PhotoGroup;
  /** その日の企画。**1日に何本でも立つ** */
  plans?: PlanBrief[];
  /**
   * 開いた瞬間から入れておく人の絵。
   *
   * **渡すのは「1人ぶんの紙」だけ**（図鑑とじぶんのこと）。あちらは
   * その人のカード1枚を押して開くので、素の写真で開くと**押した絵と
   * 開いた絵が別もの**になる。
   *
   * **渡さなければ素の写真のまま**（`/cards` の、何人も写っている紙）。
   * あやと「代表でキャラクターを埋めるのはやめて欲しい」は、
   * 4人ぶんあるカードの1人目が代表に見える、という話だった。
   * 1人しかいない紙には、代表も何もない。
   */
  startIcon?: string;
  onClose: () => void;
  /** 消えた1枚。**あやとだけ**（道具そのものが `DropPhoto` の中で消える） */
  onDropped?: (photoId: string) => void;
}) {
  /* 同じ絵の人を2度出さない。台帳は人ごとに1枚だが、Doneru から手で入った
     人と YouTube の人が同じ絵に当たることがある。

     **顔を変えない（`useMemo`）。** ここで毎回ならべ直すと `place` が
     描くたびに別のものになり、**焼き直す効果が自分の出した絵で起き直って
     止まらなくなる**（覚えてある立ち位置を持つカードだけ、150ms ごとに
     2048px を焼きつづける）。並べ替えの元は紙を開いたときのまま動かない。 */
  const picks = useMemo<Pick[]>(() => {
    const out: Pick[] = [];
    for (const c of group.cards) {
      if (out.some((p) => p.icon === c.icon)) continue;
      out.push({
        key: c.id,
        icon: c.icon,
        name: c.name || "",
        // 本人が動かしたぶんだけ、その値で置く（既定は右下ひとところ）
        place: c.moved ? { x: c.x, y: c.y, rot: c.rot, scale: c.scale } : null,
      });
    }
    return out;
  }, [group.cards]);

  /**
   * いま入れている人。**はじめは誰も入れない**——`startIcon` を渡した
   * 1人ぶんの紙だけ、その人から始まる。
   */
  const [chosen, setChosen] = useState<Pick | null>(
    () => (startIcon ? (picks.find((p) => p.icon === startIcon) ?? null) : null),
  );
  /** どのあやとを入れるか（`STICKERS` の `id`）。**null は入れない。手元だけ。** */
  const [mateId, setMateId] = useState<string | null>(null);
  /**
   * 1人ぶんの持ちかた。立ち位置と、向き。
   *
   * **`place` が null は「まだ自分で置いていない」**——住人なら覚えてある
   * ぶん（か既定の右下）、あやとなら機械が隣に並べたところ。
   */
  const [youAt, setYouAt] = useState<Hold>(BLANK);
  const [mateAt, setMateAt] = useState<Hold>(BLANK);
  /**
   * **いま手にしている人**（0＝住人 / 1＝あやと）。
   *
   * 札で選ばせない（あやと 2026-10-09「押したほうが動く」）。押したところに
   * 立っている人が手に入る。手の欄（大きさ・かたむき・むき）は、
   * **その1人ぶんだけ**出す。
   */
  const [hand, setHand] = useState<0 | 1>(0);
  /**
   * 出すかたち。**`false` はカードのまま、`true` はこの端末のかべがみ。**
   *
   * あやと（2026-10-09）「綺麗な壁紙にできない」。写真は 3:4 で、
   * いまのスマホは 9:19.5。カードのかたちのまま壁紙にすると、
   * **上下に地が出るか、勝手に切られるか**のどちらかになる。
   */
  const [wall, setWall] = useState(false);
  /**
   * もう片方のかたちでの立ち位置。
   *
   * **かたちが変われば、立つところも変わる。** カードのかたちで右下に
   * 置いた人を、縦長の塀へそのまま持っていくと、画面のだいぶ下に落ちる。
   * かたちごとに別に覚えて、戻ってきたらそのまま。
   */
  const other = useRef<[Hold, Hold]>([BLANK, BLANK]);
  /** この端末の画面（かべがみの塀）。**窓ではなく画面の画素数** */
  const [screen, setScreen] = useState<{ want: Frame; out: Frame } | null>(null);
  /**
   * 焼いた塀の大きさ、元の写真の大きさ、広げた倍率。**隠さずに出すための数。**
   *
   * 元の大きさは**読み終わった絵から**取る（`naturalWidth`）。
   * 台帳の `w`/`h` は貼ったときに書いた写しなので、食い違っていたら
   * **実物ではないほうを画面に出す**ことになる。
   */
  const [outAt, setOutAt] = useState<
    { w: number; h: number; pw: number; ph: number; k: number } | null
  >(null);
  /**
   * 決めるのは ref、描くのは state。
   *
   * 指が1本増えた・減った瞬間に「いまどこに立っているか」を読み直す
   * （2本指の基準を取り直すため）。state は次の描画まで古いままなので、
   * **そこを読むと、指を足した瞬間に絵が跳ぶ。**
   */
  const holdRef = useRef<[Hold, Hold]>([BLANK, BLANK]);
  /** 動かしたぶん。**null はその人の元の立ち位置**（既定か、覚えてあるぶん） */
  const moved = youAt.place;
  const [out, setOut] = useState<{ url: string; blob: Blob } | null>(null);
  /** 動かしている最中。canvas を前に出して、jpeg へは焼かない */
  const [live, setLive] = useState(false);
  /** 焼けなかった理由。"photo" は写真、"chr" はキャラクター、**"mate" は選んだあやと** */
  const [failed, setFailed] = useState<null | "photo" | "chr" | "mate">(null);
  /** 絵が読み終わった回数。**読み終わってから描く**ための合図 */
  const [ready, setReady] = useState(0);
  /** あやとの絵が読み終わった回数。**人の絵とは読む所が別**なので別に数える */
  const [mateReady, setMateReady] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  /** 人を選んだときに増える手。**増えたところまで紙を送る**のに要る */
  const tuneRef = useRef<HTMLDivElement>(null);
  /** 写真の箱。**焼き直しているあいだ、高さを畳ませない**ために測る */
  const shotRef = useRef<HTMLDivElement>(null);
  /** 絵の台。**指を受けるのはここ**（canvas と焼き上がりの両方を覆う） */
  const stageRef = useRef<HTMLDivElement>(null);
  /** 送る胴。**まだ下に続くか**を見るのに要る */
  const bodyRef = useRef<HTMLDivElement>(null);
  /** まだ下に続くか。続くなら、紙の底に合図を出す */
  const [more, setMore] = useState(false);
  /** 最後に出ていた写真の高さ（px）。0 はまだ1度も出ていない */
  const shotH = useRef(0);
  /** 読み終えた絵。焼き直しのたびに読み直さない */
  const art = useRef<{
    photo: HTMLImageElement | null;
    chr: HTMLImageElement | null;
    mate: HTMLImageElement | null;
  }>({ photo: null, chr: null, mate: null });

  const { user, token } = useAuth();
  const { idOf, again } = useMyCardIds();
  /** 本当のカードID。**これが取れたときだけ覚える**（他人のは 403） */
  const cardId = chosen ? idOf(group.photoId, chosen.icon) : null;
  const canSave = !!user && !!cardId;

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  /* この端末の画面を測る。**開いたときに1回。**
     `screen` も `devicePixelRatio` もブラウザにしか無いので、
     書き出し（SSG）の時には触らない。 */
  useEffect(() => setScreen(screenFrame()), []);

  /** 焼く塀。**カードのままなら null**（写真そのままの形。いままでの道） */
  const frame: Frame | null = wall ? (screen?.out ?? null) : null;

  /* 人を選び直したら、動かしたぶんは持ち越さない。立ち位置は人ごとのもの。
     **あやとのぶんも一緒に戻す**——隣に並ぶ相手が変われば、空いている
     ほうも変わる。前の人の隣に置いた場所をそのまま使うと、重なる。 */
  const who = chosen?.icon ?? "";
  useEffect(() => {
    holdRef.current = [BLANK, BLANK];
    other.current = [BLANK, BLANK];
    setYouAt(BLANK);
    setMateAt(BLANK);
    setHand(0);
  }, [who]);

  /* あやとを選び直したら、あやとのぶんだけ戻す。**絵が変われば寸法も変わる**
     ので、前の絵のために決めた置き場所をそのまま当てると、はみ出す。 */
  useEffect(() => {
    holdRef.current = [holdRef.current[0], BLANK];
    other.current = [other.current[0], BLANK];
    setMateAt(BLANK);
    setHand(0);
  }, [mateId]);

  /* 人を選ぶと、紙の下に3つ差し込まれる——なぞれる案内・あやとの札・
     大きさともとのばしょ。**紙はそこまで送られない。**

     本番で実際にそうなっていた（2026-10-08。390×850・dpr2）。
     「あやとも入れますか」の見出しだけが足のすぐ上に顔を出して、
     **札4枚は1枚も押せなかった**——3枚は足（`ほぞんする`）の下、
     1枚は画面の外。`getBoundingClientRect` は 48px と答えるので、
     大きさだけ数えると合格に見える（`CLAUDE.md`「押しどころは、
     見た目の箱で測らない」）。

     **いちばん下に増えたもの（`.akd-tune`）が見えるところまで送る。**
     そこが入れば、上の札も一緒に入る。`block: "nearest"` なので
     必要なぶんしか動かない。

     **開いた直後は送らない。** 1人ぶんの紙（`startIcon`）は最初から
     人が入っているが、開いて最初に見たいのは写真のほう。 */
  const grew = useRef(!!startIcon);
  useEffect(() => {
    if (!chosen) {
      grew.current = false;
      return;
    }
    // すでに出ているなら、人を選び直しただけ。増えていないので送らない
    if (grew.current) return;
    grew.current = true;
    const t = setTimeout(
      () => tuneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
    return () => clearTimeout(t);
  }, [chosen]);

  /* 紙の底に「まだ下に続く」の合図を出す。

     図鑑（`/friends`）やじぶんのこと（`/me`）から開いた紙は、**最初から
     人が入っている**ので下へ送らない（開いて最初に見たいのは写真のほう）。
     そのぶん「あやとも入れますか」が窓の下に隠れていて、**見えているところが
     『だれを入れますか』で終わって、罫と足が続く。** 終わった紙に見える。

     本番で撮って分かった（2026-10-08。390×850）。あやとの札4枚は
     1枚も画面に入っていなかった。送れば出るのに、**送れることが見えない。**

     動かさずに、**続いていることだけ**を見せる。送り切ったら消える。

     **薄れる帯だけでは足りなかった。** 切れ目がちょうど欄と欄のあいだの
     空きに来ると、紙の色が紙の色に薄れるだけで何も見えない（撮って確かめた）。
     だから最初から人の入っている紙では、**次の見出しの頭が覗くぶんだけ**
     送っておく（下の `peek`）。写真はほとんど隠れない。 */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const look = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    look();
    el.addEventListener("scroll", look, { passive: true });
    /* 中身は**あとから伸びる**（焼き上がりが戻る・人を選んで手が増える）。
       送りの合図だけでは、伸びた瞬間に古い答えのまま残る */
    const ro = new ResizeObserver(look);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", look);
      ro.disconnect();
    };
  }, []);

  /* 最初から人の入っている紙（図鑑・じぶんのこと）だけ、**ひと覗きぶん送る。**

     全部送ると写真が窓から出る（開いて最初に見たいのは写真）。
     送らないと、切れ目が欄と欄の空きに来て「終わった紙」に見える。

     ## 「◯px 送る」で書かない

     はじめ `setTimeout(420)` で 56px 送る、と書いた。**手元では通って、
     本番では 15px しか送らなかった**（2026-10-09 実測。胴 614px に対して
     中身 854px、問いの頭は 693px のところ）。写真が遠くから届くぶん、
     420ms ではまだ背が決まっていない。**決まる前の高さで計った送り量は、
     決まる前の紙のための数。**

     だから**量ではなく、行き先で書く。** 「問いの頭が胴の下から
     `PEEK` だけ覗くところ」を狙って、**中身の背が変わるたびに狙い直す。**
     背が何回伸びても、最後には同じところに落ち着く。

     止めるのは2つ。**読んでいる人が自分で送ったら、もう押し返さない。**
     それと、いつまでも狙い続けないように時間で切る。 */
  const askRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!startIcon) return;
    const el = bodyRef.current;
    if (!el) return;
    let stop = false;
    const put = () => {
      const ask = askRef.current;
      if (stop || !ask) return;
      /* 問いの頭が、胴の下から `PEEK` だけ覗くところ。
         **下へ行くときだけ送る**——読んでいる人が先へ進めていたら、戻さない */
      const want = ask.offsetTop - el.clientHeight + PEEK;
      if (want > el.scrollTop + 2) el.scrollTo({ top: want, behavior: "smooth" });
    };
    put();
    /* 中身は**あとから伸びる**（写真が届く・焼き上がりが戻る）。
       伸びるたびに狙い直すので、「何 ms 待てば決まるか」を当てにしない */
    const ro = new ResizeObserver(put);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const hands = () => {
      stop = true;
      ro.disconnect();
    };
    el.addEventListener("wheel", hands, { passive: true });
    el.addEventListener("touchstart", hands, { passive: true });
    const t = setTimeout(hands, 4000);
    return () => {
      hands();
      clearTimeout(t);
      el.removeEventListener("wheel", hands);
      el.removeEventListener("touchstart", hands);
    };
  }, [startIcon]);

  /* 写真の箱の高さを覚える。**焼き直しのあいだ畳ませない**ため。

     人を選び直すと焼き上がりをいったん捨てる（上の `setOut(null)`）ので、
     写真の代わりに待ちの印（`--wait-h: 200px`）が出る。本物の写真は
     1280 幅で 376px あるので、**選ぶたびに紙が 176px 縮んで、150ms 後に
     また伸びる。** 読んでいる人の指の下で下の手が飛ぶし、
     「増えたところまで送る」も縮んだ側の高さで送ってしまう
     （実測 2026-10-08: 送ったのは 5px、要るのは 225px）。

     写真そのものは変わらないので、**一度測ったら、その高さを下限にする。** */
  useEffect(() => {
    const h = shotRef.current?.getBoundingClientRect().height ?? 0;
    if (out && h > 0) shotH.current = h;
  }, [out]);

  const shot = group.url;
  const icon = chosen?.icon ?? null;
  /** いま描く立ち位置。動かしていなければ、その人の元の立ち位置 */
  const place = moved ?? chosen?.place ?? null;
  /** いま入れるあやと。**人を入れていないときは読みに行かない**（2体目だから） */
  const mate = useMemo(
    () => (icon && mateId ? (STICKERS.find((s) => s.id === mateId) ?? null) : null),
    [icon, mateId],
  );
  const mateSrc = mate?.file ?? null;
  /** 左右を返してよい絵か。**字の入った絵は返さない**（`content/goods.ts`） */
  const mateFlip = mate?.canFlip ?? true;
  /**
   * 目盛りに出す値。**まだ自分で置いていない人は、既定（1倍・0度）。**
   *
   * ここは**見せるためだけ**で、書き戻す起点には使わない（`poseOf` を使う）。
   * 絵が届く前でも目盛りが出ていないと、手が1つも無い紙に見える。
   */
  const handPlace: Place =
    (hand === 0 ? youAt.place : mateAt.place) ?? { x: 0.8, y: 0.95, rot: 0, scale: 1 };

  /* ---- 絵を読む。**人や写真が変わったときだけ** ---- */
  useEffect(() => {
    let gone = false;
    setFailed(null);
    /* **前の1枚を先に捨てる。** 残しておくと、人を選び直した直後の
       150ms だけ「前の人が入った絵」が出たままになる */
    setOut((had) => {
      if (had) URL.revokeObjectURL(had.url);
      return null;
    });
    /* **あやとの絵は捨てない。** あちらは `mateSrc` だけで決まるので、
       人を選び直すたびに読み直すと、そのたび読み込み待ちが挟まる */
    art.current = { ...art.current, photo: null, chr: null };
    (async () => {
      const [photo, chr] = await Promise.all([
        loadImage(shot),
        icon ? loadImage(cardIcon(icon, 640)) : Promise.resolve(null),
      ]);
      if (gone) return;
      if (!photo) {
        setFailed("photo");
        return;
      }
      /* **入れたのに入っていない、を黙って通さない。** キャラクターの絵が
         読めなかったときそのまま焼くと素の写真が出る。見た人は「入れた
         つもり」で持って帰ることになるので、ここで止める。 */
      if (icon && !chr) {
        setFailed("chr");
        return;
      }
      art.current = { ...art.current, photo, chr };
      setReady((n) => n + 1);
    })();
    return () => {
      gone = true;
    };
  }, [shot, icon]);

  /* ---- 選んだあやとを読む。**人の絵とは別に読む** ----
     いっしょに読むと、ステッカーを選び直すたびに写真とキャラクターまで
     読み直して、そのたび絵がいちど消える。 */
  useEffect(() => {
    let gone = false;
    if (!mateSrc) {
      art.current.mate = null;
      /* 「入れない」に戻したら、止めるのをやめる。**ここで戻さないと、
         読めない1枚を選んだあと、素の写真にも戻れなくなる** */
      setFailed((had) => (had === "mate" ? null : had));
      setMateReady((n) => n + 1);
      return;
    }
    (async () => {
      const img = await loadImage(mateSrc);
      if (gone) return;
      art.current.mate = img;
      if (img) {
        setFailed((had) => (had === "mate" ? null : had));
      } else {
        /* **キャラクターの絵と同じ守り。** 読めないまま焼くと、あやとの
           入っていない1枚を「入れたつもり」で持って帰ることになる。
           焼いてあった前の1枚も捨てる——残すと長押しで保存できてしまう。 */
        setFailed("mate");
        setOut((had) => {
          if (had) URL.revokeObjectURL(had.url);
          return null;
        });
      }
      setMateReady((n) => n + 1);
    })();
    return () => {
      gone = true;
    };
  }, [mateSrc]);

  /**
   * いま焼く人たち。**先頭が住人、2人目があやと。**
   *
   * 描くほうと、**指が誰を掴んだかを決めるほう**が同じ並びを見る。
   * 別々に組むと、見えている人と掴める人がずれる。
   */
  const figures = useCallback((): Figure[] => {
    const { chr, mate: m } = art.current;
    const out: Figure[] = [];
    if (chr) out.push({ img: chr, place, flip: youAt.flip });
    /* あやとは**入れると言ったときだけ、2体目として。**
       自分で置いていなければ、並べ方（押しのけない・足元をそろえる・
       重ならない）は `place.ts` の `layout` が決める。
       **字の入った絵は左右を返さない**（`canFlip`） */
    if (chr && m)
      out.push({ img: m, place: mateAt.place, flip: mateAt.flip, canFlip: mateFlip });
    return out;
    /* `art.current` は再描画を起こさないので、読み終わりの合図（`ready` /
       `mateReady`）も鍵に入れる。入れないと、絵が届いても組み直されない */
  }, [place, youAt.flip, mateAt.place, mateAt.flip, mateFlip, ready, mateReady]);

  /* ---- canvas に描く。**動かしているあいだはここだけ** ---- */
  useEffect(() => {
    const { photo } = art.current;
    const cv = cvRef.current;
    if (!photo || !cv) return;
    /* 止めているあいだは描かない。**描くと、出せない絵が canvas に残る** */
    if (failed) return;
    const list = figures();
    composeMany(photo, list, cv, frame);
    /* 広げた倍率を出す。**隠さない**（3:4 の写真を 9:19.5 の画面へ敷くと、
       使えるのは真ん中の細い帯だけになる）。同じ値なら置き直さない——
       1フレームごとに state を書くと、引きずりが重くなる。 */
    const k = Math.round(stretchOf(photo, frame) * 100) / 100;
    const now = {
      w: cv.width,
      h: cv.height,
      pw: photo.naturalWidth,
      ph: photo.naturalHeight,
      k,
    };
    setOutAt((had) =>
      had && had.w === now.w && had.h === now.h && had.pw === now.pw && had.k === k
        ? had
        : now,
    );
    /* **測る道具のために、いまの立ち位置を札として置く。**
       `tools/sprites/cardwall.mjs` が「2人が別々に動いたか」をここから読む。
       状態（React）ではなく描いた結果から出すので、**見えているものと
       同じ値**になる。再描画は起こさない（`dataset` を書くだけ）。 */
    const at = framesOf(cv.width, cv.height, list);
    /* **あやとが出てきたところで、その場に釘を打つ。**
       機械の並べ方（本人の隣）に任せたままだと、**住人を引きずるたびに
       あやとが付いてくる**——離して置けない、というあやとの指摘そのもの。
       出てきた瞬間の箱をそのまま `place` にするので、**見た目は1pxも
       変わらない**（`placeFromBox` の往復。自己点検の 3f）。

       ただし、2人そろって縮む道（`MATE_MIN`）に落ちているときは打たない。
       あちらは**本人の箱も縮めている**ので、連れだけ釘を打つと次の絵で
       本人が元の大きさへ跳ね返る。1人だけで並べた箱と見比べて、
       本人が動いていないときだけにする。 */
    if (list.length === 2 && !holdRef.current[1].place) {
      const solo = framesOf(cv.width, cv.height, [list[0]]);
      const 同じ =
        Math.abs(solo[0].box.x - at[0].box.x) < 0.5 &&
        Math.abs(solo[0].box.w - at[0].box.w) < 0.5;
      if (同じ) {
        const b = opaqueBox(list[1].img);
        const now: Hold = {
          place: placeFromBox(cv.width, cv.height, b.w, b.h, at[1].box, at[1].rot),
          flip: at[1].flip,
        };
        holdRef.current = [holdRef.current[0], now];
        setMateAt(now);
      }
    }
    const el = stageRef.current;
    if (el) {
      el.dataset.at = JSON.stringify(
        at.map((q, i) => {
          const b = opaqueBox(list[i].img);
          const got = placeFromBox(cv.width, cv.height, b.w, b.h, q.box, q.rot);
          return { x: got.x, y: got.y, rot: got.rot, scale: got.scale, flip: q.flip };
        }),
      );
    }
  }, [figures, failed, frame]);

  /* ---- 焼く。**手が止まってから1回** ---- */
  useEffect(() => {
    if (live || !ready || failed) return;
    const cv = cvRef.current;
    if (!art.current.photo || !cv) return;
    let gone = false;
    const t = setTimeout(async () => {
      const blob = await toJpeg(cv);
      if (gone) return;
      if (!blob) {
        setFailed("photo");
        return;
      }
      const url = URL.createObjectURL(blob);
      setOut((had) => {
        if (had) URL.revokeObjectURL(had.url);
        return { url, blob };
      });
    }, BAKE_MS);
    return () => {
      gone = true;
      clearTimeout(t);
    };
    /* **焼き直す鍵は、描く鍵と同じ。** 片方だけに足すと、動かしたのに
       古い焼き上がりが残る（長押しで持って帰るのはそちら） */
  }, [figures, live, failed, frame]);

  /* 紙を閉じるときに、最後の1枚を捨てる（放っておくと溜まる）。
     **閉じるときの1回だけ**なので、入れ替えのたびの始末は上でやっている。 */
  const last = useRef<string>("");
  last.current = out?.url ?? "";
  useEffect(
    () => () => {
      if (last.current) URL.revokeObjectURL(last.current);
    },
    [],
  );

  /* ---- 覚える。**動かし終わってから1回だけ** ---- */
  const sent = useRef<string>("");
  useEffect(() => {
    /* **かべがみのかたちで動かしたぶんは覚えない。** 立ち位置は割合で持って
       いるので、縦長の塀で決めた値をそのまま保存すると、**他の人が見る
       カード（写真のかたち）のほうが動く。** 覚えるのはカードのかたちだけ。 */
    if (wall) return;
    if (!canSave || !cardId || !moved) return;
    const key = JSON.stringify(moved);
    if (key === sent.current) return;
    const t = setTimeout(async () => {
      const tk = await token();
      if (!tk) return;
      try {
        await moveCard(cardId, moved, tk);
        sent.current = key;
      } catch {
        /* 覚えられなくても、出ている絵はそのまま持って帰れる。
           ここで何か言っても、見ている人にできることが1つも増えない */
      }
    }, SAVE_MS);
    return () => clearTimeout(t);
  }, [canSave, cardId, moved, token, wall]);

  /** 手が動いた。**止まって `BAKE_MS` 経ったら焼く** */
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useCallback(() => {
    setLive(true);
    if (beat.current) clearTimeout(beat.current);
    beat.current = setTimeout(() => setLive(false), BAKE_MS);
  }, []);
  useEffect(
    () => () => {
      if (beat.current) clearTimeout(beat.current);
    },
    [],
  );

  /**
   * かたちを変える。**それぞれのかたちの立ち位置を、別々に覚えておく。**
   *
   * 同じ割合（x/y）でも、塀の比が違えば立つところは変わる。持っていくと
   * 「カードでちょうど良かった位置」が壁紙では画面の下に落ちるので、
   * **持っていかずに、戻ってきたらそのまま**にする。
   */
  const shape = useCallback(
    (toWall: boolean) => {
      setWall((was) => {
        if (was === toWall) return was;
        let keep = other.current;
        /* **はじめてかべがみにしたときだけ、置きどころを決めてやる。**
           既定のまま持っていくと、足がスマホのボタンの下に隠れる。
           1度でも自分で動かしていれば（`place` が入っていれば）触らない。 */
        if (toWall && !keep[0].place) {
          const list = figures();
          const art0 = list[0];
          if (art0 && screen) {
            const b = opaqueBox(art0.img);
            const d = defaultPlaceFor(screen.out.w, screen.out.h, b.w, b.h);
            keep = [{ place: { ...d, y: Math.max(0.3, d.y - WALL_FOOT) }, flip: false }, BLANK];
          }
        }
        other.current = holdRef.current;
        holdRef.current = keep;
        setYouAt(keep[0]);
        setMateAt(keep[1]);
        setHand(0);
        return toWall;
      });
      /* **写真の箱の下限を捨てる。** 「焼き直しのあいだ畳ませない」ために
         一度測った高さを下限にしているが、**かたちが変われば背も変わる。**
         かべがみ（44vh）からカードへ戻ると、392px の下限だけが残って
         写真の上下に 70px ずつの空きができる（撮って見つけた）。 */
      shotH.current = 0;
      /* **前の焼き上がりを捨てる。** 置いたままだと、焼き直しの 150ms のあいだ
         「カードのかたちで焼いた1枚」が**かべがみの箱いっぱいに引き伸ばされて**
         出る（絵の大きさは canvas が決め、焼き上がりはその上に重ねているだけ
         なので、比が変わるとそこで崩れる）。人を選び直したときと同じ始末。 */
      setOut((had) => {
        if (had) URL.revokeObjectURL(had.url);
        return null;
      });
      touch();
    },
    [figures, screen, touch],
  );


  /**
   * その人が**いま立っているところ**を、割合で。
   *
   * まだ自分で置いていない人（住人の既定、機械が隣に並べたあやと）も、
   * **掴んだ瞬間にそこを起点にする。** `placeFromBox` が
   * 「いまの箱 → 同じ箱を作る `place`」を返すので、**指を置いただけでは
   * 1pxも動かない**（`site/selftest/cardplace_selftest.mjs` の 3f）。
   */
  const poseOf = useCallback(
    (i: 0 | 1): Place => {
      const had = holdRef.current[i]?.place;
      if (had) return had;
      const cv = cvRef.current;
      const list = figures();
      const f = list[i];
      if (!cv || !f) return { x: 0.8, y: 0.95, rot: 0, scale: 1 };
      const src = opaqueBox(f.img);
      const at = framesOf(cv.width, cv.height, list)[i];
      if (!at) return defaultPlaceFor(cv.width, cv.height, src.w, src.h);
      return placeFromBox(cv.width, cv.height, src.w, src.h, at.box, at.rot);
    },
    [figures],
  );

  /**
   * 立ち位置を置き直す。**描く範囲まで締めてから渡す。**
   *
   * `clampPlace` は口と同じ式（0.2〜3倍・±180度）だが、**描くほうは
   * もう一段せまい**（枠から出ないため。`place.ts` の `SCALE_MAX`）。
   * 締める前の値を覚えると、**指を回しても絵が動かないのに数字だけ増える。**
   */
  const setPose = useCallback(
    (i: 0 | 1, want: Place) => {
      const fit = clampPlace(
        {
          x: want.x,
          y: want.y,
          rot: Math.max(-TILT_MAX, Math.min(TILT_MAX, want.rot)),
          scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, want.scale)),
        },
        want,
      );
      const was = holdRef.current[i] ?? BLANK;
      const now: Hold = { ...was, place: fit };
      holdRef.current = i === 0 ? [now, holdRef.current[1]] : [holdRef.current[0], now];
      if (i === 0) setYouAt(now);
      else setMateAt(now);
      touch();
    },
    [touch],
  );

  /** 動かす。**いま手にしている人ぶんだけ。** */
  const nudge = useCallback(
    (dx: number, dy: number, dk = 0, dr = 0) => {
      const now = poseOf(hand);
      setPose(hand, {
        x: now.x + dx,
        y: now.y + dy,
        rot: now.rot + dr,
        scale: now.scale + dk,
      });
    },
    [hand, poseOf, setPose],
  );

  /** 向きを返す。**字の入った絵は返らない**（`canFlip`）ので、札も出さない */
  const turn = useCallback(() => {
    const i = hand;
    const was = holdRef.current[i] ?? BLANK;
    /* 置き場所も一緒に確定させる。**返したあとに掴んだときの起点**が
       「機械が並べたところ」に戻ってしまわないように */
    const now: Hold = { place: was.place ?? poseOf(i), flip: !was.flip };
    holdRef.current = i === 0 ? [now, holdRef.current[1]] : [holdRef.current[0], now];
    if (i === 0) setYouAt(now);
    else setMateAt(now);
    touch();
  }, [hand, poseOf, touch]);

  /* ---- 指とマウス ----------------------------------------------------

     **押したほうが動く。** 札で「いま動かす人」を選ばせない
     （あやと 2026-10-09）。押したところに立っている人が手に入り、
     そのまま引きずれる。重なっていたら手前（`place.ts` の `pickAt`）。

     **指が2本なら、その1人の大きさと向きが変わる。**
     ひらけば大きく、ひねれば回る。真ん中が動けばその人も動く。
     **2本目を置いたところで基準を取り直す**ので、1本から2本へ移る瞬間に
     絵が跳ばない。離して1本に戻るときも同じ。

     引きずった**距離ぶん**動かす（指の下へ飛ばさない）。 */

  /** いま触っている指。**2本まで見る**（3本目は基準を変えない） */
  const pts = useRef(new Map<number, { x: number; y: number }>());
  /** 掴んでいる1人と、掴んだときの基準 */
  const grab = useRef<{
    who: 0 | 1;
    base: Place;
    box: DOMRect;
    /** 1本指のときの、指の居たところ */
    from: { x: number; y: number };
    /** 2本指のときの、間隔・角度・真ん中 */
    two: { d: number; a: number; cx: number; cy: number } | null;
  } | null>(null);

  /** いまの指から、基準を取り直す。**指の本数が変わるたびに呼ぶ** */
  const rebase = useCallback(() => {
    const g = grab.current;
    if (!g) return;
    const now = [...pts.current.values()];
    const base = poseOf(g.who);
    if (now.length >= 2) {
      const d = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
      grab.current = {
        ...g,
        base,
        two: {
          d: Math.max(1, d),
          a: Math.atan2(now[1].y - now[0].y, now[1].x - now[0].x),
          cx: (now[0].x + now[1].x) / 2,
          cy: (now[0].y + now[1].y) / 2,
        },
      };
    } else if (now.length === 1) {
      grab.current = { ...g, base, two: null, from: { x: now[0].x, y: now[0].y } };
    }
  }, [poseOf]);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!chosen) return;
      const el = stageRef.current;
      const cv = cvRef.current;
      if (!el || !cv) return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 捕まえられない端末でも、引きずりそのものは動く */
      }
      if (pts.current.size === 1) {
        /* **押したところに立っている人**を掴む。誰も居なければ、
           いま手にしている人のまま（写真の余白を引きずっても動く） */
        const list = figures();
        let who: 0 | 1 = hand;
        if (list.length) {
          const at = framesOf(cv.width, cv.height, list);
          const px = ((e.clientX - box.left) / box.width) * cv.width;
          const py = ((e.clientY - box.top) / box.height) * cv.height;
          const i = pickAt(at, px, py);
          if (i >= 0) who = i as 0 | 1;
        }
        if (who >= list.length) who = 0;
        setHand(who);
        grab.current = {
          who,
          base: poseOf(who),
          box,
          from: { x: e.clientX, y: e.clientY },
          two: null,
        };
      } else {
        grab.current = grab.current && { ...grab.current, box };
        rebase();
      }
      touch();
    },
    [chosen, figures, hand, poseOf, rebase, touch],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = grab.current;
      if (!g || !pts.current.has(e.pointerId)) return;
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = [...pts.current.values()];
      const b = g.base;
      if (g.two && now.length >= 2) {
        const d = Math.max(1, Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y));
        const a = Math.atan2(now[1].y - now[0].y, now[1].x - now[0].x);
        const cx = (now[0].x + now[1].x) / 2;
        const cy = (now[0].y + now[1].y) / 2;
        setPose(g.who, {
          x: b.x + (cx - g.two.cx) / g.box.width,
          y: b.y + (cy - g.two.cy) / g.box.height,
          rot: b.rot + ((a - g.two.a) * 180) / Math.PI,
          scale: b.scale * (d / g.two.d),
        });
      } else if (now.length === 1) {
        setPose(g.who, {
          x: b.x + (now[0].x - g.from.x) / g.box.width,
          y: b.y + (now[0].y - g.from.y) / g.box.height,
          rot: b.rot,
          scale: b.scale,
        });
      }
    },
    [setPose],
  );

  const onUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pts.current.delete(e.pointerId);
      try {
        stageRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* もう離れている */
      }
      if (pts.current.size === 0) {
        grab.current = null;
        setLive(false);
      } else {
        /* 1本だけ離した。**残った指で基準を取り直す**——取り直さないと、
           離した瞬間に残った指のところへ絵が飛ぶ */
        rebase();
      }
    },
    [rebase],
  );

  /** 矢印で動かす。**指が1本も無いところ（PC）のために。** */
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      const go: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = go[e.key];
      if (!d) return;
      e.preventDefault();
      nudge(d[0], d[1]);
    },
    [nudge],
  );

  /**
   * もとの場所へ。**いま手にしている人ぶんだけ。**
   *
   * あやとを戻すのは手元だけの話（保存する欄が無い）。住人を戻したときは、
   * **覚えてあるぶんも既定と同じところへ**書き戻す。
   */
  const reset = useCallback(() => {
    if (hand === 1) {
      holdRef.current = [holdRef.current[0], BLANK];
      setMateAt(BLANK);
      touch();
      return;
    }
    holdRef.current = [BLANK, holdRef.current[1]];
    setYouAt(BLANK);
    touch();
    if (!canSave || !cardId) return;
    const { photo, chr } = art.current;
    const cv = cvRef.current;
    if (!photo || !chr || !cv) return;
    const src = opaqueBox(chr);
    /* **送るときだけ丸める**（`clampPlace` はサーバーと同じ式）。
       画面に出すほうは `moved` を空にした素の既定なので、丸めの誤差が
       1pxも乗らない。覚えるほうは、送った値と覚えられた値をそろえる。 */
    const back = clampPlace(defaultPlaceFor(cv.width, cv.height, src.w, src.h), {
      x: 0.98,
      y: 0.95,
      rot: 0,
      scale: 1,
    });
    (async () => {
      const tk = await token();
      if (!tk) return;
      try {
        await moveCard(cardId, back, tk);
        sent.current = "";
      } catch {
        /* 戻せなくても、出ている絵は既定のところに立っている */
      }
    })();
  }, [canSave, cardId, hand, token, touch]);

  const save = useCallback(async () => {
    if (!out) return;
    const name = wall ? wallFileName(group.day) : stampFileName(group.day);
    const file = new File([out.blob], name, { type: "image/jpeg" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
    };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        /* 共有をやめただけ。下に落ちてダウンロードにする */
      }
    }
    const a = document.createElement("a");
    a.href = out.url;
    a.download = name;
    a.click();
  }, [out, group.day, wall]);

  /* ログインしているのに表が古いと、貼られたばかりの写真で自分のカードを
     見落とす。**1回だけ取り直す**（取り直しても無ければ、他人のカード） */
  const asked = useRef("");
  useEffect(() => {
    if (!user || !who || cardId) return;
    const key = `${group.photoId}__${who}`;
    if (asked.current === key) return;
    asked.current = key;
    again();
  }, [user, who, cardId, group.photoId, again]);

  return (
    <div className="akd-modal" role="dialog" aria-modal="true" aria-label="あやと島カード">
      {/* 外を押しても閉じる。絵の裏なので、押せる合図は持たせない */}
      <button className="akd-back" aria-label="閉じる" onClick={onClose} />
      <div className={`akd-sheet${more ? " is-more" : ""}`}>
        {/* **紙は、頭・胴・足の3つ。**
            送るのは胴だけで、頭（日付と閉じる）と足（持って帰る）は動かない。

            前は1枚の紙をまるごと送って、足だけ底に貼り付けていた
            （`position: sticky`）。**貼り付けた帯は、上にある札の上へ
            かぶさる。** 候補が3人までは1段で収まるので誰も踏まなかったが、
            絵を引き直して4人目が出た日に、2段目の札が帯の下へ潜った
            （2026-09-12。実測で 4,675px² 重なっていた）。
            **送らない足にすれば、重なりようがない。** */}
        <div className="akd-sheet-head">
          <p className="akd-sheet-h">
            <b>{cardWhen(group.day)}</b>
          </p>
          <button ref={closeRef} className="akd-close" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="akd-sheet-body" ref={bodyRef}>
          <div
            className={`nstudio-shot${wall ? " is-wall" : ""}`}
            ref={shotRef}
            /* **畳ませない。** 理由は上の `shotH`。まだ1度も出ていないときは
               何も指定しない（待ちの印の高さのままでよい） */
            style={shotH.current ? { minHeight: shotH.current } : undefined}
          >
            {/* **canvas が土台で、焼いた jpeg がその上に乗っている。**
                中身は同じ絵。動かしているあいだだけ canvas が前に出る
                （`is-live`）ので、指に付いてくるのは canvas のほう。
                手が止まれば jpeg が戻ってきて、長押しでそのまま保存できる。 */}
            {/* **指を受けるのは台のほう。** 前は焼き上がり（`<img>`）に
                付けていたが、台には canvas も乗っていて、**焼き直している
                150ms のあいだは `<img>` が居ない。** その隙に指を置くと
                掴めなかった。台なら、どちらが前に出ていても指が届く。 */}
            <div
              ref={stageRef}
              className={`akd-stage${out || live ? "" : " is-off"}${chosen ? " is-movable" : ""}`}
              {...(chosen
                ? {
                    onPointerDown: onDown,
                    onPointerMove: onMove,
                    onPointerUp: onUp,
                    onPointerCancel: onUp,
                  }
                : {})}
            >
              <canvas ref={cvRef} className={live ? "is-live" : ""} aria-hidden />
              {out && (
                <img
                  src={out.url}
                  alt={group.note || "その日の写真"}
                  /* 入れている人がいるときだけ、矢印キーでも動かせる。
                     いないときは素の写真なので、動かすものが無い */
                  {...(chosen
                    ? {
                        tabIndex: 0,
                        "aria-label": "キャラクターのいるところ。矢印キーでうごかせます",
                        onKeyDown: onKey,
                      }
                    : {})}
                />
              )}
              {/* かべがみのとき、**スマホが上に出すもの**の居場所を出す。
                  とけい（上）とボタン（下）は写真の上に重なるので、
                  そこへ人を置くと隠れる。**焼く1枚には入らない。** */}
              {wall && (
                <>
                  <span className="akd-safe is-top" aria-hidden>
                    <i>とけい</i>
                  </span>
                  <span className="akd-safe is-foot" aria-hidden>
                    <i>ボタン</i>
                  </span>
                </>
              )}
            </div>
            {!out &&
              !live &&
              (failed === "chr" ? (
                /* 焼けていない1枚を出しておくと、長押しで持って帰れてしまう。
                   絵は出さずに、次にできることだけ言う。 */
                <p className="nstudio-off">
                  このキャラクターの絵がいま読めません。
                  <br />
                  ほかの人にしてみてください。
                </p>
              ) : failed === "mate" ? (
                /* 選んだあやとが読めなかったとき。**キャラクターのときと同じ扱い。**
                   あやとの入っていない1枚を、入れたつもりで持って帰らせない */
                <p className="nstudio-off">
                  このあやとの絵がいま読めません。
                  <br />
                  ほかのあやとか、「入れない」にしてみてください。
                </p>
              ) : failed ? (
                <p className="nstudio-off">いま写真が読めません。あとでもう一度。</p>
              ) : (
                <div className="wait is-card" aria-hidden>
                  <span />
                </div>
              ))}
          </div>
          {/* **写真のすぐ下に置く。** 下の手（連れ・大きさ・もとへ）と
              一緒にしていたが、候補が11人いる日は札が3段になって、
              そこが窓の下へ落ちる。**なぞれることを、いちばん知って
              ほしい人に届かない**（9月6日の紙が実際にそうだった）。 */}
          {/* なぞれること・2本指でできることを、**ここで1行だけ**言う。
              写真のすぐ下に置くのは、下の手まで落ちると窓の外へ出るから
              （候補が11人いる日は札が3段になる）。 */}
          {chosen && (
            <p className="nstudio-tip">
              写真の上をなぞると、うごきます。2本の指でひらくと大きく、ひねるとまわります。
            </p>
          )}
          {group.note && <p className="nstudio-note">{group.note}</p>}

          {picks.length > 0 && (
            <>
              <p className="nstudio-ask">だれを入れますか</p>
              <div className="nstudio-pick">
                {/* 全部のマスが押せるので、1枚ずつに厚みは付けない
                    （`docs/island-world.md` 3.5）。押せないマスを混ぜない。 */}
                <button
                  className={`npick${chosen === null ? " is-on" : ""}`}
                  aria-pressed={chosen === null}
                  onClick={() => setChosen(null)}
                >
                  {/* 「入れない」は禁止ではなく、対等な選択肢の1つ。
                      赤い禁止の印を置くと、選んではいけないものに見える。
                      空けておく、を島の言葉（`.blank` の破線）で言う。 */}
                  <span className="npick-none" aria-hidden />
                  <i>入れない</i>
                </button>
                {picks.map((p) => (
                  <button
                    key={p.key}
                    className={`npick${chosen?.icon === p.icon ? " is-on" : ""}`}
                    aria-pressed={chosen?.icon === p.icon}
                    aria-label={p.name || "この人を入れる"}
                    onClick={() => setChosen(p)}
                  >
                    {/* canvas に描くのと同じ URL なので、ここでも crossOrigin を
                        付ける（付けずに先に読むと、CORS ヘッダの無い絵が
                        キャッシュに残って焼けなくなる端末がある） */}
                    <img src={cardIcon(p.icon, 128)} alt="" loading="lazy" crossOrigin="anonymous" />
                    {p.name && <i>{p.name}</i>}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* どのあやとを入れるか。**入れた人がいるときだけ出る**——
              2体目は本人の隣に立つものなので、本人のいない写真には出ようがない。

              並ぶのは `content/goods.ts` の `STICKERS` そのまま。**ここに
              名簿を作らない**ので、ステッカーが1枚増えた日に勝手に増える。
              増えても折り返すだけなので、紙の背は段ぶんしか伸びない。 */}
          {chosen && (
            <>
              {/* 顔の札（「だれを入れますか」）と**同じ声で問う。** 札の列の中へ
                  入れてみたが、問いの字のぶん折り返しが1段増えて、かえって
                  40px 高くなった（実測 104px → 160px）。1行取るほうが短い。 */}
              <p className="nstudio-ask" ref={askRef}>あやとも入れますか</p>
              <div className="akd-mates" role="group" aria-label="あやとも入れますか">
                <button
                  type="button"
                  className={`akd-mate${mateId === null ? " is-on" : ""}`}
                  aria-pressed={mateId === null}
                  onClick={() => {
                    setMateId(null);
                    touch();
                  }}
                >
                  {/* 「入れない」は禁止ではなく、対等な選択肢の1つ。空けておく、を
                      島の言葉（破線）で言う（顔の札の `.npick-none` と同じ）。 */}
                  <span className="akd-mate-none" aria-hidden />
                  <i>入れない</i>
                </button>
                {STICKERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`akd-mate${mateId === s.id ? " is-on" : ""}`}
                    aria-pressed={mateId === s.id}
                    onClick={() => {
                      setMateId(s.id);
                      touch();
                    }}
                  >
                    {/* 札に出すのは小さいほう（`art`）。**焼くのは元絵（`file`）**で、
                        そちらは押されたときに読みにいく */}
                    <img src={s.art} alt="" width={52} height={52} />
                    <i>{s.name}</i>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 出すかたち。**人を入れていなくても出る**——素の写真を
              かべがみにしたい日もある。

              かべがみは、**見ている端末の画面の形と画素数**に合わせて焼く
              （`screen` × `devicePixelRatio`）。写真は塀いっぱいに敷いて、
              はみ出すぶんは切る。写真は 3:4、いまのスマホは 9:19.5 なので、
              **使えるのは写真の真ん中の細い帯だけ**になり、そこから画面の
              画素数まで広げることになる。その倍率は下に出す——隠さない。 */}
          <p className="nstudio-ask">どのかたちで もちかえりますか</p>
          <div className="akd-shapes" role="group" aria-label="どのかたちで もちかえりますか">
            <button
              type="button"
              className={`akd-shape${wall ? "" : " is-on"}`}
              aria-pressed={!wall}
              onClick={() => shape(false)}
            >
              カードのまま
            </button>
            <button
              type="button"
              className={`akd-shape${wall ? " is-on" : ""}`}
              aria-pressed={wall}
              onClick={() => shape(true)}
              disabled={!screen}
            >
              スマホのかべがみ
            </button>
          </div>
          {/* **焼く大きさと、広げた倍率をそのまま出す。**
              「きれいに焼けます」とは言わない。元が長辺 1600px しか無いので、
              いまのスマホでは 1.6倍前後に広がる（本番の112枚ぜんぶ 1600）。 */}
          {wall && outAt && (
            <p className="nstudio-note">
              {outAt.w}×{outAt.h} で焼きます。
              {screen && (screen.out.w !== screen.want.w || screen.out.h !== screen.want.h) && (
                <>（この画面は {screen.want.w}×{screen.want.h}。大きすぎるので縮めました）</>
              )}
              <br />
              元の写真は {outAt.pw}×{outAt.ph} なので、
              {outAt.k >= 1
                ? `${outAt.k.toFixed(2)}倍に広げています。`
                : `${(1 / outAt.k).toFixed(2)}分の1に縮めています。`}
            </p>
          )}

          {/* 入れた人がいるときだけ出る手。**入れていない紙には1つも出ない。**

              **出るのは、いま手にしている1人ぶんだけ。** 2人ぶん並べると、
              どちらの目盛りを触っているのか分からなくなる（390px では
              4本の目盛りが2段になる）。手に入れ替わるのは**絵を押したとき**
              なので、ここに切り替えの札は置かない（あやと 2026-10-09
              「押したほうが動く」）。

              並びはやることの順（だれを持っているか → 大きさ → かたむき →
              むき → もとへ）。 */}
          {chosen && (
            <div className="akd-tune" ref={tuneRef}>
              {/* 2人いるときだけ、どちらを持っているかを出す。1人しか
                  立っていない紙では、持っているのはその人しかいない */}
              {mate && (
                <p className="akd-hand">
                  <img src={hand === 0 ? cardIcon(chosen.icon, 128) : mate.art} alt="" />
                  <b>{hand === 0 ? chosen.name || "この人" : mate.name}</b>
                </p>
              )}
              <label className="akd-zoom">
                <span>大きさ</span>
                <input
                  type="range"
                  data-tune="scale"
                  min={Math.round(SCALE_MIN * 100)}
                  max={Math.round(SCALE_MAX * 100)}
                  step={5}
                  value={Math.round(handPlace.scale * 100)}
                  aria-label="大きさ"
                  /* **いまの立ち位置から**変える。目盛りに出している値は
                     「まだ置いていない人」のとき既定（1倍・0度）なので、
                     そこを起点に書き戻すと x/y ごと既定へ飛ぶ */
                  onChange={(e) =>
                    setPose(hand, { ...poseOf(hand), scale: Number(e.target.value) / 100 })
                  }
                />
              </label>
              <label className="akd-zoom">
                <span>かたむき</span>
                <input
                  type="range"
                  data-tune="rot"
                  min={-TILT_MAX}
                  max={TILT_MAX}
                  step={1}
                  value={Math.round(handPlace.rot)}
                  aria-label="かたむき"
                  onChange={(e) =>
                    setPose(hand, { ...poseOf(hand), rot: Number(e.target.value) })
                  }
                />
              </label>
              {/* 字や標識の入った絵は返らない（`content/goods.ts` の
                  `canFlip`）ので、**押せない札を出さない** */}
              {(hand === 0 || mateFlip) && (
                <button type="button" className="akd-turn" onClick={turn}>
                  むきをかえる
                </button>
              )}
              <button type="button" className="akd-undo" onClick={reset}>
                もとのばしょ
              </button>
            </div>
          )}

          {/* その日の企画への行き先。**いちばん下に置く。** 上に置くと、
              9月11日のように4本立つ日は、写真より先に青い字が4行ならんで
              そちらに目が行く（`docs/island-design.md` 3章の4）。
              ここでやることは「入れて、持って帰る」で、企画は寄り道。
              押せるのは字なので、厚みではなく下線で示す。 */}
          {plans && plans.length > 0 && (
            <div className="akd-sheet-plans">
              {plans.map((p) => (
                <Link key={p.href} className="akd-sheet-plan" href={p.href} prefetch={false}>
                  {p.title}
                </Link>
              ))}
            </div>
          )}

          {/* 消す道。**いちばん下、いちばん静か。** ここでやることは
              「入れて、持って帰る」で、消すのはあやとが貼り間違えた日だけ。
              上に置くと、持って帰りに来た人の目にいちばん先に入る。
              あやと以外には1つも出ない（`DropPhoto` の中で消える）。 */}
          {onDropped && (
            <DropPhoto
              photoId={group.photoId}
              cardCount={group.cardCount}
              onDropped={onDropped}
            />
          )}
        </div>

        {/* 紙の足。**ここだけ送っても動かない。** 候補が12人いても
            「ほぞんする」が紙の外へ出ない、というのが元の狙いで、
            それを重ならない形でやる。 */}
        <div className="akd-sheet-foot">
          <div className="nstudio-save">
            <button className="nstudio-go" onClick={save} disabled={!out}>
              <Icon name="download" size={16} />
              ほぞんする
            </button>
            {out && (
              <a
                className="nstudio-tab"
                href={out.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                べつのタブでひらく
                <Icon name="external" size={13} />
              </a>
            )}
          </div>
          {/* 焼けていないときは言わない。長押しする絵がそこに無い */}
          {out && <p className="nstudio-tip">写真を長押ししても保存できます。</p>}
        </div>
      </div>
    </div>
  );
}
