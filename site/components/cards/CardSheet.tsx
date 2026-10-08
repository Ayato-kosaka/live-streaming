"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import {
  clampPlace,
  composeMany,
  defaultPlaceFor,
  loadImage,
  opaqueBox,
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
  /** 動かしたぶん。**null はその人の元の立ち位置**（既定か、覚えてあるぶん） */
  const [moved, setMoved] = useState<Place | null>(null);
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

  /* 人を選び直したら、動かしたぶんは持ち越さない。立ち位置は人ごとのもの */
  const who = chosen?.icon ?? "";
  useEffect(() => setMoved(null), [who]);

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

  /* ---- canvas に描く。**動かしているあいだはここだけ** ---- */
  useEffect(() => {
    const { photo, chr } = art.current;
    const cv = cvRef.current;
    if (!photo || !cv) return;
    /* 止めているあいだは描かない。**描くと、出せない絵が canvas に残る** */
    if (failed) return;
    const figures: Figure[] = [];
    if (chr) figures.push({ img: chr, place });
    /* あやとは**入れると言ったときだけ、2体目として。** 並べ方
       （押しのけない・足元をそろえる・重ならない）は `place.ts` の `layout`。
       **字の入った絵は左右を返さない**（`canFlip`） */
    if (chr && art.current.mate)
      figures.push({ img: art.current.mate, canFlip: mateFlip });
    composeMany(photo, figures, cv);
  }, [ready, mateReady, place, failed, mateFlip]);

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
  }, [ready, mateReady, place, live, failed]);

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
  }, [canSave, cardId, moved, token]);

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

  /** いまの立ち位置を、割合で。動かしていなければ既定のところから始める */
  const placeNow = useCallback((): Place => {
    if (place) return place;
    const { photo, chr } = art.current;
    const cv = cvRef.current;
    if (!photo || !chr || !cv) return { x: 0.8, y: 0.95, rot: 0, scale: 1 };
    const src = opaqueBox(chr);
    return defaultPlaceFor(cv.width, cv.height, src.w, src.h);
  }, [place]);

  /** 動かす。**締め方はサーバーと同じ式**（`place.ts` の `clampPlace`） */
  const nudge = useCallback(
    (dx: number, dy: number, dk = 0) => {
      const now = placeNow();
      setMoved(
        clampPlace(
          { x: now.x + dx, y: now.y + dy, rot: now.rot, scale: now.scale + dk },
          now,
        ),
      );
      touch();
    },
    [placeNow, touch],
  );

  /* ---- 指とマウス。**引きずった距離ぶん動かす**（指の下へ飛ばさない） ---- */
  const grab = useRef<{ id: number; x: number; y: number; at: Place } | null>(null);
  const onDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: placeNow() };
    },
    [placeNow],
  );
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      const g = grab.current;
      if (!g || g.id !== e.pointerId) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const x = g.at.x + (e.clientX - g.x) / box.width;
      const y = g.at.y + (e.clientY - g.y) / box.height;
      setMoved(clampPlace({ ...g.at, x, y }, g.at));
      touch();
    },
    [touch],
  );
  const onUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    if (grab.current?.id === e.pointerId) grab.current = null;
    setLive(false);
  }, []);

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

  /** もとの場所へ。**覚えてあるぶんも、既定と同じところへ戻す** */
  const reset = useCallback(() => {
    setMoved(null);
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
  }, [canSave, cardId, token, touch]);

  const save = useCallback(async () => {
    if (!out) return;
    const name = stampFileName(group.day);
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
  }, [out, group.day]);

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
      <div className="akd-sheet">
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

        <div className="akd-sheet-body">
          <div className="nstudio-shot">
            {/* **canvas が土台で、焼いた jpeg がその上に乗っている。**
                中身は同じ絵。動かしているあいだだけ canvas が前に出る
                （`is-live`）ので、指に付いてくるのは canvas のほう。
                手が止まれば jpeg が戻ってきて、長押しでそのまま保存できる。 */}
            <div className={`akd-stage${out || live ? "" : " is-off"}`}>
              <canvas ref={cvRef} className={live ? "is-live" : ""} aria-hidden />
              {out && (
                <img
                  src={out.url}
                  alt={group.note || "その日の写真"}
                  className={chosen ? "is-movable" : ""}
                  /* 入れている人がいるときだけ、引きずって動かせる。
                     いないときは素の写真なので、動かすものが無い */
                  {...(chosen
                    ? {
                        tabIndex: 0,
                        "aria-label": "キャラクターのいるところ。矢印キーでうごかせます",
                        onPointerDown: onDown,
                        onPointerMove: onMove,
                        onPointerUp: onUp,
                        onPointerCancel: onUp,
                        onKeyDown: onKey,
                      }
                    : {})}
                />
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
          {chosen && <p className="nstudio-tip">写真の上をなぞると、立つところが変わります。</p>}
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
              <p className="nstudio-ask">あやとも入れますか</p>
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
                  入れない
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
                    <img src={s.art} alt="" width={30} height={30} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 入れた人がいるときだけ出る手。**入れていない紙には1つも出ない。**
              並びはやることの順（大きさ → もとへ）。 */}
          {chosen && (
            <div className="akd-tune">
              <label className="akd-zoom">
                <span>大きさ</span>
                <input
                  type="range"
                  min={60}
                  max={160}
                  step={5}
                  value={Math.min(160, Math.max(60, Math.round((place?.scale ?? 1) * 100)))}
                  aria-label="大きさ"
                  onChange={(e) =>
                    nudge(0, 0, Number(e.target.value) / 100 - (place?.scale ?? 1))
                  }
                />
              </label>
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
