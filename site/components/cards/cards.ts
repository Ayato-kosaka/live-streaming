"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCards,
  getNordicPhotos,
  type IslandCard,
  type NordicPhoto,
} from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";
import { RESIDENTS } from "@/content/residents";

/**
 * あやと島カード（#173）の、画面まわりの共通のところ。
 *
 * カードは**置いてある**（#202）。台帳（`islandTips`）に投げ銭が入った時点で
 * 相手が決まるので、`islandCards/{cardId}` に1枚ずつ作られている
 * （`functions/src/cards.ts` 冒頭）。こちら側でやるのは4つだけ。
 *
 *   1. どの絵の人かを突き合わせる（絵の割り当ては residents.ts だけが持つ）
 *   2. その日の企画を日付で引く（表は面が渡してくる。`content/plans.ts`）
 *   3. 同じ写真から出たカードを、写真1枚にまとめる（`byPhoto`）
 *   4. 4か所（`/cards`・`/about`・`/friends`・`/me`）で同じ形に出す
 */

/** キャラクターの絵は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
export const cardIcon = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/** 面（server）から渡ってくる、その日の企画。`content/plans.ts` の表。 */
export type PlanBrief = { title: string; href: string };
export type PlanDays = Record<string, PlanBrief[]>;

/** 絵の決まったカード。**画面に出るのはこれだけ。** */
export type ShownCard = IslandCard & { icon: string };

/**
 * カードに、キャラクターの絵を結び付ける。
 *
 * **どの絵が誰のものかは、あやとの表だけが決める**（`content/residents.ts` の
 * `channel`）。サーバーは名簿の持っているチャンネルをそのまま返してくるので、
 * 絵はここで引く。ここで引く形にしておくと、絵の割り当てが2か所に散らない。
 *
 * Doneru の人（`python/admin/nordic_supporter.py` から手で入る人）は
 * チャンネルを持たないかわりに絵を直に持っているので、そちらを使う。
 *
 * **絵に結びつかない人のカードは出さない。** カードは「写真の上に
 * その人が立っている1枚」なので、立つ人がいなければ絵にならない。
 * 「あなたのキャラクターがありません」とは言わない（本人のせいではない）。
 */
export function withIcons(list: IslandCard[]): ShownCard[] {
  const byChannel = new Map<string, string>();
  RESIDENTS.forEach((r) => {
    if (r.icon && r.channel) byChannel.set(r.channel, r.icon);
  });
  const out: ShownCard[] = [];
  for (const c of list) {
    const icon = c.icon ?? (c.channelId ? byChannel.get(c.channelId) : null);
    if (!icon) continue;
    out.push({ ...c, icon });
  }
  return out;
}

/** 取りにいっている最中は `cards` が null。0枚と区別する。 */
export type CardsState = {
  /** 読めたカード。**`read !== "ok"` のあいだの空を「0枚」と読まないこと** */
  cards: ShownCard[] | null;
  /** カードの口（`GET /cards`）が読めたか */
  read: Read;
  /** 落ちたぶんを読み直す。「もう一度よみこむ」の札から呼ぶ */
  reload: () => void;
};

/**
 * 配られたカードを取ってくる。**新しい順で返ってくるので、並べ直さない。**
 *
 * ## 空の配列を返さない（#34 #36 #43）
 *
 * ここは長いあいだ `catch(() => setCards([]))` だった。**空の配列は
 * 「読めた上での0枚」のことば**で、届かなかった日に言ってよい嘘ではない。
 * `/about` はそれを受けて「まだ1枚もありません」と言い切り、`/friends` は
 * もらったカードの欄ごと消していた。しかも**読み直す道が無い**ので、
 * 画面を開き直すまで直らなかった（同じ口を読む `useCardWall` は直っていて、
 * こちらだけ残っていた）。
 *
 * 答えは3つ持つ（`lib/auth.tsx` の `Read`）。
 *   - `wait` … まだ返っていない。骨を出してよい
 *   - `ok`   … 読めた。**ここではじめて「まだ1枚もありません」と言ってよい**
 *   - `down` … 読めなかった。0枚ではない
 *
 * 返事が来ないのも「読めなかった」（`withRead` が12秒で見切る）。
 * 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。電波が戻った合図
 * （`online`・画面に戻ってきた）でも読み直す。**画面を開き直させない。**
 */
export function useCards(): CardsState {
  const [cards, setCards] = useState<ShownCard[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  /** 落ちた回数。読み直す間隔を倍にしていくのに使う */
  const miss = useRef(0);
  /* いまの読めぐあい。**電波が戻ったとき、落ちているときだけ読み直す**ために
     持つ（状態そのものは描くのに使うので、効果の中からは見えない）。 */
  const now = useRef<Read>("wait");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  /**
   * `showWait` は、押されて読み直すときだけ `true`。骨に戻して「いま行った」と
   * 分かるようにする。ひとりでに読み直すときは顔を入れ替えない——灰色の骨と
   * 「読みに行けなかった」が数秒おきに入れ替わる面になる（#277）。
   */
  const load = useCallback((showWait: boolean) => {
    if (showWait) {
      now.current = "wait";
      setRead("wait");
    }
    withRead(getCards())
      // 形の違うものが返っても、面ごと落とさない
      .then((r) => {
        if (!alive.current) return;
        setCards(withIcons(r?.cards ?? []));
        now.current = "ok";
        setRead("ok");
        miss.current = 0;
      })
      .catch(() => {
        if (!alive.current) return;
        now.current = "down";
        setRead("down");
        miss.current += 1;
        timers.current.push(
          setTimeout(() => load(false), Math.min(2000 * 2 ** (miss.current - 1), 30000)),
        );
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    load(false);
    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。
       読めているうちは何もしない（画面に戻るたびに往復を1本増やさない）。 */
    const wake = () => {
      if (now.current === "down") load(false);
    };
    const back = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", back);
    const running = timers.current;
    return () => {
      alive.current = false;
      running.forEach(clearTimeout);
      running.length = 0;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  return { cards, read, reload: () => load(true) };
}

/* ---------------- 写真でまとめる ----------------
   **カードは「写真 × その日に投げてくれた人」で増える。** 写真が3枚あって
   10人いれば30枚になり、`/cards` には同じ写真が10枚ずつ並ぶ。
   あやとの言葉:「埋め込みキャラクターごと全部表示するのではなく、
   カード画像を列挙してタップしたらキャラクター埋め込み版が見れるように
   しないと、カード一覧画面が散らかる気がする」。

   一覧が持つのは**写真1枚につき1つ**。キャラクターの入った版は、
   押して開いた先に置く（図鑑と同じ「一覧と1枚を分ける」形。
   `docs/ac-reference.md` 7章）。 */

/** 同じ写真から出たカードを、ひとまとめにしたもの。**一覧のマス1つぶん。** */
export type PhotoGroup = {
  photoId: string;
  url: string;
  w: number;
  h: number;
  note: string;
  /** その写真の日。まとめる単位が写真なので、中の1枚ずつは持たない */
  day: string;
  /** 何人ぶんか。**絵に結びついた人だけ**が入る（`withIcons` を通ったもの） */
  cards: ShownCard[];
  /**
   * この写真からできたカードの、本当の枚数。**`cards.length` とは違う。**
   *
   * `cards` に入るのは絵に結びついた人だけで、絵の無い人のぶんは落ちている。
   * 並べるぶんにはそれでよいが、**消す前に「◯枚あります」と言うときに
   * 落ちたあとの数を言うと嘘になる。** サーバーは絵の有無に関わらず
   * 全部消す（`functions/src/islandApi.ts` の `dropCardsOfImage`）。
   *
   * カードの口が読めていないときは入らない。
   * **入っていないことを「0枚」と読まないこと**（#34）。
   */
  cardCount?: number;
};

/** 1日ぶんの棚。1日に写真は何枚でも貼られる。 */
export type DayShelf = { day: string; photos: PhotoGroup[] };

/**
 * 写真でまとめる。**並べ替えない。**
 *
 * サーバーがもう新しい順で返してくる（`functions/src/cards.ts` の
 * `sortCards`）ので、出てきた順にまとめるだけにする。ここで並べ直すと、
 * 同じものを2か所で決めることになる。
 */
export function byPhoto(list: ShownCard[]): PhotoGroup[] {
  const out: PhotoGroup[] = [];
  const at = new Map<string, PhotoGroup>();
  for (const c of list) {
    const had = at.get(c.photoId);
    if (had) {
      had.cards.push(c);
      continue;
    }
    const g: PhotoGroup = {
      photoId: c.photoId,
      url: c.url,
      w: c.w,
      h: c.h,
      note: c.note,
      day: c.day,
      cards: [c],
    };
    at.set(c.photoId, g);
    out.push(g);
  }
  return out;
}

/**
 * 日ごとに棚を作る。**日付と企画を、そこで1回だけ言うため。**
 *
 * 前は1枚ずつが日付と企画を持っていた。同じ写真が人数ぶん並ぶと、
 * 「9月6日(日) / Food & Wine Fest @ ムタツミンダ公園」も人数ぶん出る。
 * まとめる単位ができたので、字は棚の見出しへ上げる。
 */
export function byDay(groups: PhotoGroup[]): DayShelf[] {
  const out: DayShelf[] = [];
  const at = new Map<string, DayShelf>();
  for (const g of groups) {
    const had = at.get(g.day);
    if (had) {
      had.photos.push(g);
      continue;
    }
    const d: DayShelf = { day: g.day, photos: [g] };
    at.set(g.day, d);
    out.push(d);
  }
  return out;
}

/** 「2026-09-06」→「9月6日(日)」。島の中の日付の言い方にそろえる。 */
export function cardWhen(iso: string): string {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}


/* ---------------- 写真の側からまとめる ----------------
   **一覧に並ぶのは写真で、カードではない。** カードは「写真 × その日に
   投げてくれた人」なので、カードだけを見ていると**まだ誰も投げていない
   写真が1枚も出ない。** あやとが貼った直後がちょうどそれで、貼った本人が
   「入らなかった」と思う。

   だから写真の一覧（`GET /nordic/photos`）を土台にして、そこへカードを
   重ねる。写真がどれだけあるかは写真の口が、誰が立てるかはカードの口が
   決める。片方が読めなくても、もう片方のぶんは出る。 */

/** 写真1枚に、その写真に立てる人を重ねたもの。**一覧のマス1つぶん。** */
export type PhotoSheet = PhotoGroup & { at: number };

const sheetOf = (p: NordicPhoto): PhotoSheet => ({
  photoId: p.id,
  url: p.url,
  w: p.w,
  h: p.h,
  note: p.note,
  day: p.day,
  at: p.at,
  cards: [],
});

/**
 * 新しい順。**まず「その日」で、同じ日のなかは貼った順。**
 *
 * `at` だけで並べない。貼った時刻とその写真の日付は別のもので（旅の
 * 途中に前の日のぶんをまとめて貼る）、`at` で並べると**画面に出ている
 * 日付が飛ぶ。** 見出しになるのは日付なので、そちらを先に見る。
 */
const newest = (a: { day: string; at: number }, b: { day: string; at: number }) =>
  a.day === b.day ? b.at - a.at : a.day < b.day ? 1 : -1;

/**
 * 写真とカードを1つにまとめて、日ごとの棚にする。
 *
 * 写真の口が落ちてもカードだけで並ぶし、逆も同じ。どちらも空なら空の棚。
 *
 * @param photos 写真の口から来たぶん
 * @param cards 絵に結びついた人のカード（並べるのはこちら）
 * @param counts 写真ごとの**本当の**カードの枚数（絵の無い人も数えたもの）。
 *   渡さないと `cardCount` は入らない。**入らないことと0枚は別**
 */
export function shelves(
  photos: NordicPhoto[],
  cards: ShownCard[],
  counts?: Map<string, number>,
): DayShelf[] {
  const at = new Map<string, PhotoSheet>();
  const order: PhotoSheet[] = [];
  for (const p of photos) {
    const g = sheetOf(p);
    at.set(p.id, g);
    order.push(g);
  }
  for (const c of cards) {
    let g = at.get(c.photoId);
    if (!g) {
      // 写真の口が落ちていても、カードの持っている写真で並べられる
      g = { ...sheetOf({ ...c, id: c.photoId, at: c.at }), cards: [] };
      at.set(c.photoId, g);
      order.push(g);
    }
    g.cards.push(c);
  }
  /* 本当の枚数は、絵で絞る前に数えたものしか知らない。**数えられた写真にだけ
     入れる。** 全部に 0 を置くと、カードの口が落ちた日に「0枚」と言い切る */
  if (counts) {
    // 表に無い写真は「まだ誰も投げていない」＝0枚。**渡された表そのものが、
    // カードの口を読めた証。** 読めていないときは counts ごと渡ってこない
    for (const g of order) g.cardCount = counts.get(g.photoId) ?? 0;
  }
  order.sort(newest);
  const days = new Map<string, DayShelf>();
  const out: DayShelf[] = [];
  for (const g of order) {
    const had = days.get(g.day);
    if (had) {
      had.photos.push(g);
      continue;
    }
    const d: DayShelf = { day: g.day, photos: [g] };
    days.set(g.day, d);
    out.push(d);
  }
  return out;
}

/** 一覧が持つ状態。写真とカードを別々に取りにいって、ここで合わせる。 */
export type WallState = {
  /** 取りにいっている最中は null。0枚と区別する */
  days: DayShelf[] | null;
  /** 写真の口（`GET /nordic/photos`）が読めたか */
  photosRead: Read;
  /** カードの口（`GET /cards`）が読めたか */
  cardsRead: Read;
  /** 貼れた1枚を、取り直さずにその場で並べる（あやとだけ） */
  add: (p: NordicPhoto) => void;
  /**
   * 消えた1枚を、取り直さずにその場で落とす（あやとだけ）。
   *
   * **読み直しに行かせない。** 消したのはこちらなので、消えたことは
   * もう分かっている。細い電波で往復を増やすと、消えた絵がしばらく
   * 残ったままになる。カードも一緒に落とす（サーバーもそうしている）。
   */
  drop: (photoId: string) => void;
  /** 落ちたぶんだけ読み直す。「もう一度よみこむ」の札から呼ぶ */
  reload: () => void;
};

/**
 * 一覧の中身を取ってくる。**口が2つあるので、読めたかどうかも2つ持つ。**
 *
 * 前はここが `bad >= 2`——**両方落ちたときだけ**「いまつながりません」で、
 * **片方だけ落ちると「まだ1枚もありません」と言い切っていた。**
 * 細い電波でいちばん多いのは、そろって落ちることではなく**片方だけ落ちる**
 * ことなので、いちばん出る落ち方が、いちばん嘘をつく落ち方になっていた。
 * しかも読み直す道が無く、画面を開き直すまで直らない（#34 と同じ形）。
 *
 * いまは口ごとに `wait / ok / down` を持つ。**「まだ1枚もありません」と
 * 言ってよいのは、2つとも `ok` で、そのうえで0枚だったときだけ。**
 * 片方でも読めていれば、読めたぶんは並べる（写真の口が落ちても、カードの
 * 持っている写真で並ぶ）。
 *
 * 返事が来ないのも「読めなかった」（`withRead` が12秒で見切る）。
 * 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。電波が戻った合図
 * （`online`・画面に戻ってきた）でも読み直す。**画面を開き直させない。**
 */
export function useCardWall(): WallState {
  const [photos, setPhotos] = useState<NordicPhoto[] | null>(null);
  /* **絵で絞る前のまま持つ。** 絞ってしまうと、絵の無い人のぶんが数えられず、
     消す前の「カードが◯枚あります」が少なく出る（`PhotoGroup.cardCount`）。
     並べるのに使うぶんは、出すときに `withIcons` を通す。 */
  const [cards, setCards] = useState<IslandCard[] | null>(null);
  const [photosRead, setPhotosRead] = useState<Read>("wait");
  const [cardsRead, setCardsRead] = useState<Read>("wait");
  /** 落ちたぶんの読み直し。口ごとに間隔を持つ（片方だけ落ちるため） */
  const again = useRef<{ photos: number; cards: number }>({ photos: 0, cards: 0 });
  /* いまの読めぐあい。**電波が戻ったとき、落ちている口だけを読み直す**ために
     持つ（状態そのものは描くのに使うので、効果の中からは見えない）。 */
  const now = useRef<{ photos: Read; cards: Read }>({ photos: "wait", cards: "wait" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  /**
   * 落ちている口だけを読み直す。
   *
   * `showWait` は、押されて読み直すときだけ `true`。骨に戻して「いま行った」と
   * 分かるようにする。ひとりでに読み直すときは顔を入れ替えない。
   */
  const load = useCallback((showWait: boolean, which: "both" | "photos" | "cards" = "both") => {
    const wait = (ms: number, f: () => void) => {
      timers.current.push(setTimeout(f, ms));
    };
    const back = (n: number) => Math.min(2000 * 2 ** (n - 1), 30000);

    if (which !== "cards") {
      if (showWait) {
        now.current.photos = "wait";
        setPhotosRead("wait");
      }
      withRead(getNordicPhotos())
        // 形の違うものが返っても、面ごと落とさない
        .then((r) => {
          if (!alive.current) return;
          setPhotos((r?.days ?? []).flatMap((d) => d.photos ?? []));
          now.current.photos = "ok";
          setPhotosRead("ok");
          again.current.photos = 0;
        })
        .catch(() => {
          if (!alive.current) return;
          now.current.photos = "down";
          setPhotosRead("down");
          again.current.photos += 1;
          wait(back(again.current.photos), () => load(false, "photos"));
        });
    }
    if (which !== "photos") {
      if (showWait) {
        now.current.cards = "wait";
        setCardsRead("wait");
      }
      withRead(getCards())
        .then((r) => {
          if (!alive.current) return;
          setCards(r?.cards ?? []);
          now.current.cards = "ok";
          setCardsRead("ok");
          again.current.cards = 0;
        })
        .catch(() => {
          if (!alive.current) return;
          now.current.cards = "down";
          setCardsRead("down");
          again.current.cards += 1;
          wait(back(again.current.cards), () => load(false, "cards"));
        });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load(false);
    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。
       **落ちている口だけ**にする。読めている口まで叩くと、画面に戻るたびに
       往復が増える（細い電波でいちばんやってはいけないこと）。 */
    const wake = () => {
      const bad = now.current;
      if (bad.photos === "down" && bad.cards === "down") return load(false);
      if (bad.photos === "down") return load(false, "photos");
      if (bad.cards === "down") return load(false, "cards");
    };
    const back = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", back);
    const running = timers.current;
    return () => {
      alive.current = false;
      running.forEach(clearTimeout);
      running.length = 0;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  const add = useCallback(
    (p: NordicPhoto) => setPhotos((cur) => [p, ...(cur ?? [])]),
    [],
  );

  /* 消したぶんを、その場で落とす。**読み直しに行かない。**
     カードも一緒に消える（サーバーの `dropCardsOfImage` と同じ）ので、
     ここでも一緒に落とす。残すと、絵の無い写真を指したカードが並ぶ。 */
  const drop = useCallback((photoId: string) => {
    setPhotos((cur) => cur?.filter((p) => p.id !== photoId) ?? cur);
    setCards((cur) => cur?.filter((c) => c.photoId !== photoId) ?? cur);
  }, []);

  /* 片方でも読めたら、読めたぶんで並べる。**両方 `wait` のあいだだけ null。** */
  const days = useMemo(() => {
    if (!photos && !cards) return null;
    /* 本当の枚数は、絵で絞る前にしか数えられない。**カードの口が読めた
       ときだけ表を作る**（読めていないのに「0枚」と言わないため）。 */
    let counts: Map<string, number> | undefined;
    if (cards) {
      counts = new Map<string, number>();
      for (const c of cards) counts.set(c.photoId, (counts.get(c.photoId) ?? 0) + 1);
    }
    return shelves(photos ?? [], withIcons(cards ?? []), counts);
  }, [photos, cards]);
  return { days, photosRead, cardsRead, add, drop, reload: () => load(true) };
}

/* ---------------- 立ち位置 ----------------
   **既定の置き方は、写真の右下ひとところに決め打つ。**

   もとは ID から少しずつ散らしていた（`defaultPlace`）。一覧に同じ写真の
   カードが人数ぶん並んでいたころ、全員が寸分たがわず同じ場所に立つと
   「同じ絵が人数ぶん」に見えたため。**一覧が写真1枚につき1マスになり、
   立っている人は開いた先で1人ずつ入れ替えるようになったので、散らす
   理由が消えた。** 残っていたのは害だけで、あやとの言葉（2026-09-10）:

   > たいpi のキャラクターが見切れてる。あと大きさも不揃い。

   散らした先が写真の右端を越えると絵が切れ、`scale` の 0.92〜1.08 が
   1人ずつ大きさの違うカードになっていた。

   **本人が動かしたもの（`moved`）だけは、その値で置く。** 動かせるのは
   本人だけで、動かしたことを黙って戻さない。そのときも枠から出さない。 */

/** 焼く1枚（`components/nordic/stamp.ts` の `STAMP`）と同じ寸法。 */
const BASE = { byWidth: 0.34, byHeight: 0.2, right: 0.02, bottom: 0.05 };

/** 画面に出すときの置き方。そのまま CSS に入る。 */
export type CardPlace = {
  /** 縦の写真は横幅、横の写真は高さ。もう片方の辺は絵の比に任せる */
  width?: string;
  height?: string;
  /** 既定の置き方は右端から測る。**絵の比を知らなくても枠から出ない** */
  right?: string;
  /** 本人が動かしたぶんだけ、左から測る（原点は絵の中心） */
  left?: string;
  bottom: string;
  transform: string;
};

/**
 * カード1枚の置き方を決める。**焼く1枚と同じところに立つようにする。**
 *
 * 絵の縦横比は読むまで分からないので、基準になる辺だけを決めて、もう片方は
 * 絵に任せる。既定は右端から測るので、比が何であっても枠から出ない。
 * 焼くほう（`stamp.ts` の `stampBox`）も右下から同じ寸法で置くので、
 * 画面に出ている絵と、持って帰る1枚が同じになる。
 */
export function cardPlace(card: ShownCard): CardPlace {
  const tall = card.h > card.w;
  const size = tall ? BASE.byWidth : BASE.byHeight;
  const side = tall ? { width: `${size * 100}%` } : { height: `${size * 100}%` };
  if (!card.moved) {
    return {
      ...side,
      right: `${BASE.right * 100}%`,
      bottom: `${BASE.bottom * 100}%`,
      transform: "none",
    };
  }
  /* 動かしたぶん。**枠から出さない。** 横の写真は高さで決めているので、
     横幅は写真の縦横比から見積もる（絵はおおむね正方形）。 */
  const k = Math.min(2, Math.max(0.4, card.scale || 1));
  const w = (tall ? size : (size * card.h) / Math.max(1, card.w)) * k;
  const half = Math.min(0.5, w / 2);
  const cx = Math.min(1 - half, Math.max(half, card.x));
  return {
    ...(tall ? { width: `${size * k * 100}%` } : { height: `${size * k * 100}%` }),
    left: `${cx * 100}%`,
    bottom: `${Math.min(0.9, Math.max(0, 1 - card.y)) * 100}%`,
    transform: `translateX(-50%) rotate(${Math.max(-20, Math.min(20, card.rot || 0))}deg)`,
  };
}
