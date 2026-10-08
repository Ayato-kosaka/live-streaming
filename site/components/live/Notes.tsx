"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  archiveSticky,
  dropStickyPic,
  getArchivedStickies,
  getStickies,
  heartSticky,
  heartedLocally,
  postSticky,
  rememberHeart,
  replySticky,
  type Sticky,
} from "@/lib/api";
import { isOpenTheme, openThemes, shelves, THEMES, themeById, type Theme } from "@/content/themes";
import { useAuth, useOwner, withRead, type Read } from "@/lib/auth";
import ReadAgain from "@/components/me/ReadAgain";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import Wrote from "@/components/ui/Wrote";
import { Pin } from "./art";
import NotePic from "./NotePic";
import SignIn from "./SignIn";
import { pickPic, type PickedPic } from "./notePic";

/**
 * みんなの付箋（#160）。
 *
 * ## 何が変わったのか
 *
 * 前は、付箋の宛先が**本文の頭の `【ポーランド】`** だった。入力欄に宛先が
 * 無かったので人がそれを発明して、こちらは正規表現でそれを読んで棚に分けていた。
 * 宛先を正式な欄（`islandNotes.theme`）にしたので、**推測で仕分けるところが
 * 1つも無くなった。** 棚の名前も、本文から取り出した字ではなく
 * `content/themes.ts` が持つ表示名になる。
 *
 * ## 2つの出かた
 *
 * | 渡すもの | どうなるか | どこで |
 * | --- | --- | --- |
 * | `themes` | テーマを選ぶ札が出る | `/board`（島じゅうの付箋） |
 * | `theme` | 1つに決まった状態で出る | `/nordic`・国のページ・区間のページ |
 *
 * **決まった状態で来た人に、もう一度テーマを選ばせない。** 国のページから
 * 書く人は、もうその国の話をしている。
 *
 * ## リンク1本（2026-10-01）
 *
 * あやとの言葉:
 *
 * > 企画と付箋がわかりにくいので 企画は消しましょう。（略）
 * > リンク系は、付箋にも張れるようにすると統合できるかも？
 *
 * 企画にあって付箋に無かったのは**リンクだけ**だった。足したので、
 * 掲示板は付箋ひとつになった（`Board.tsx`）。
 *
 * **1本だけ。** 何本も貼れる欄にすると、本文より長い付箋ができる。
 * 出す字は行き先の名前だけにする（`linkLabel`。素の URL を出すと、
 * 120字の本文が 2,048字の URL に埋まる）。
 * 通してよい字は `okLink` で、**守りはサーバー側**（`safeLink`）。
 *
 * ## 絵1枚（2026-10-08）
 *
 * あやとの言葉:
 *
 * > 付箋に画像も貼れるようにしてほしくて。（略）
 * > でなんか見るときは邪魔にならないようにしてほしいんですけど。
 *
 * **絵だけログインが要る。字は今までどおり誰でも。** 絵はあやとの
 * チャンネルに紐づく公開の面に即出るので、誰が貼ったか辿れない状態では
 * 受けない（口の側も 401 を返す。`functions/src/islandApi.ts`）。
 * ログインしていない人には、**書く欄の中で押す前に**そう言う。
 *
 * 「邪魔にならない」は `NotePic.tsx`——閉じているあいだは決まった高さの
 * 切手1枚で、押すとその場で大きくなる。板に落ちてくるのは小さいほうだけ。
 *
 * ## ハート
 *
 * ログイン不要で、もう一度押すと外れる。押したかどうかは端末に覚えておく
 * （サーバーにも `islandHearts` にあるが、一覧のたびに聞くともう1往復要る）。
 *
 * ## 運営者が立てた付箋
 *
 * `byOwner` の付箋は、いちばん上に出す。おたずねの「選択肢」がこれになる
 * （`islandPolls` の統合先）。だから並び順は、押された数ではなく
 * 「こちらが立てたか」で先に割る。
 *
 * ## 読めなかったときは、読み直す道を出す（#34 #36 #43）
 *
 * 文言（「いま、付箋を読みに行けなかった」）はもう書いてあったが、
 * **押しどころが無く、電波が戻っても直らなかった。** 画面を開き直すまで
 * その1枚のままで、旅の途中の国のページでは開き直す道すら遠い。
 *
 * 直したのは3つ。
 *   - `withRead`（12秒）を通す。**`fetch` は自分では諦めない**ので、
 *     45秒返さない回では灰色の骨がいつまでも残っていた
 *   - 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。
 *     `online`・画面に戻ってきたでも読み直す。**画面を開き直させない**
 *   - **読めていない相手に、書ける口を開かない**（#36）。区画は残して、
 *     押しどころだけ出さない。読めないまま貼ると、貼った1枚が
 *     「板ぜんぶ」の顔で出る
 *
 * 骨に戻すのは**押されたときだけ。** ひとりでに読み直すたびに戻すと、
 * 灰色と文言が数秒おきに入れ替わる（#277）。
 */

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/**
 * はじめに出す枚数と、1回押すと増える枚数（#225）。
 *
 * 前は 24枚で**打ち切って**いて、それ以上は「この話をしている場所で読めます」
 * と書いてあるだけだった。24枚でもスマホ2画面ぶんあり、しかも送り先の面でも
 * 同じ24枚で切れるので、25枚目から先はどこからも読めなかった。
 * 6枚だけ出して、押せば最後まで出る形にそろえる（`components/ui/Longer.tsx`）。
 */
const SHOW = 6;
const STEP = 12;

/** 付箋の長さ。サーバー側の `MAX_NOTE_LEN` と同じ。 */
const MAX = 120;
/** リンクの長さ。サーバー側の `MAX_LINK_LEN` と同じ。 */
const MAX_LINK = 2048;

/**
 * 貼ってよいリンクか。**サーバー側の `safeLink` と同じ規則を、わざと両方に置く。**
 *
 * こちらは「断られる前に言う」ためだけのもの。**守りはサーバー側**で、
 * ここを抜かれても `POST /stickies` が 400 を返す（画面の判定は、
 * 画面を通らない相手には効かない）。
 *
 * `javascript:` を弾くのに前方一致を使わないのは、サーバー側と同じ理由
 * ——頭の空白やタブで姿を変えられるから。`new URL()` に解かせて
 * `protocol` だけを見る。基準（第2引数）は渡さない。渡すと `/foo` が
 * 本物の URL に化けて、島の中へ飛ばすリンクが通る。
 */
function okLink(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * リンクに出す札の字。**URL をそのまま出さない。**
 *
 * 付箋は120字で、URL は2048字まで入る。素で出すと、1枚が URL で埋まって
 * 本文が読めなくなる。出すのは行き先の名前（`hostname`）だけにする。
 */
function linkLabel(href: string): string {
  try {
    return `${new URL(href).hostname.replace(/^www\./, "")}を見る`;
  } catch {
    return "リンクを見る";
  }
}

type Props = {
  /** テーマを選ばせる。掲示板はこちら */
  themes?: Theme[];
  /** テーマを決め打ちする。国や区間のページはこちら */
  theme?: string;
  /**
   * 紙と見出しを持たずに、中身だけ出す。
   * 折りたたみの中に置くときに使う。紙の上に紙は重ねない。
   */
  bare?: boolean;
  /**
   * 見出し。省略すると「みんなの付箋」。
   *
   * **`null` で見出しを出さない。** 掲示板（`/board`）は面の題が
   * 「やってほしいこと」で、その下にもう一度同じものの名前を置くと、
   * 同じ場所に名前が2つ並ぶ。
   */
  title?: string | null;
  /**
   * 島でおたずねを押してきた人の、押した1枚。
   *
   * **押した直後に「理由も書ける？」でここへ来る**（`docs/island-play.md` 7章）。
   * 着いた先がまっさらな入力欄だと、何の話をしていたのかが消えている。
   * 押した札をもう一度見せて、その続きから書けるようにする。
   * 押していない人には渡さない（渡されなければ、橋そのものが出ない）。
   */
  ask?: { question: string; label: string } | null;
  /**
   * 書く欄を、はじめから開いておく。
   *
   * **掲示板だけ true。** あちらは書くのが用事で、ほかに書く欄が1つも無い。
   * 国や区間の面は読みに来る場所なので、畳んだままでよい。
   */
  writeOpen?: boolean;
};

/** 運営者の付箋を先に、そのあとは新しい順。表示のたびに並びが動かないようにする。 */
function ordered(list: Sticky[]): Sticky[] {
  return [...list].sort((a, b) => {
    if (a.byOwner !== b.byOwner) return a.byOwner ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export default function Notes({
  themes,
  theme,
  bare = false,
  title,
  ask,
  writeOpen = false,
}: Props) {
  const fixed = themeById(theme ?? "");
  /** 札に並べるテーマ。決め打ちのときは1つも並べない */
  const shelf = useMemo(() => themes ?? (fixed ? [] : THEMES), [themes, fixed]);
  const [pick, setPick] = useState(
    () => fixed?.id ?? themes?.[0]?.id ?? THEMES[0].id,
  );
  /** 取りに行っている最中は null。0枚と区別する */
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  /** 読めたかどうか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  const [read, setRead] = useState<Read>("wait");
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  /** 貼るリンク1本。**書かなくてよい欄**なので、空のまま出せる */
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  /** 貼る絵1枚。**ログインした人だけが選べる**（下の `.nt-pick`） */
  const [pic, setPic] = useState<PickedPic | null>(null);
  /** 焼いているあいだ。スマホの大きい写真だと1秒ほどかかる */
  const [baking, setBaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 書く欄が開いているか。読みに来る面は畳んだ状態から始める
      （開きっぱなしにすると 300px ぶん、付箋の山が下へ押し出される）。
      掲示板だけは開いて出す（`writeOpen`）。 */
  const [open, setOpen] = useState(writeOpen);
  /** 書く宛先。null のあいだは、いま読んでいる棚か、書ける宛先の1つ目 */
  const [to, setTo] = useState<string | null>(null);
  /** しまったものを見ているか。あやとだけ */
  const [bin, setBin] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const { user, token } = useAuth();
  const owner = useOwner();

  /** いま読んでいる棚。**書く宛先とは別**（畳んだ宛先の棚も読めるため） */
  const here = fixed ?? themeById(pick) ?? THEMES[0];

  /* 札を並べ直すのに使う今日。**画面が出てから入れる。**
     静的書き出しなので、ここで `new Date()` を直に呼ぶとビルドした日が
     焼き込まれて、終わった企画がいつまでも「これからの企画」に並ぶ
     （9月6日に終わったフード＆ワイン祭りが、実際にそうなっていた）。 */
  const [today, setToday] = useState<Date | null>(null);
  /**
   * 棚に平らに並べるのは、**もう終わった宛先だけ。**
   *
   * あやとの言葉（2026-09-30）:
   *
   * > 付箋の項目に古いのが多くて醜い
   *
   * 生きている4つは、書く欄の「どこへ」の丸札が**同じ仕事**をしている
   * （書く先を決める・下の一覧を絞る）。同じ見た目の選び札を2組出すと、
   * 390px では同じ字が画面の中で2回ずつ出る。**出すのは片方だけ。**
   *
   * 終わったぶんは消さずに畳みへ入れる。消すと、貼られた付箋が
   * どこからも読めなくなる（消えてはいないが、届かない）。
   */
  const closedThemes = useMemo(
    () => shelf.filter((t) => !isOpenTheme(t, today)),
    [shelf, today],
  );
  /** 畳みの中の見出しごとの束（「北欧の旅」「行ってきた企画」など） */
  const groups = useMemo(() => shelves(closedThemes, today), [closedThemes, today]);
  /**
   * いま**書ける**宛先だけ（`content/themes.ts` の `openThemes`）。
   *
   * 棚（読む側）は13〜15あるが、そのうち生きているのは4つで、残りは
   * 終わった北欧の国べつ7つと終わった企画3つ。**死んだ札の上に生きた札が
   * 乗っている選び先**を出していたので、あやとに「古いのが多くて醜い」と
   * 言われた（2026-09-30）。書く先の選び札は、書ける宛先だけにする。
   */
  const writable = useMemo(
    () => openThemes(today).filter((t) => shelf.some((x) => x.id === t.id)),
    [shelf, today],
  );
  /** 書く宛先。**読んでいる棚とは別に持つ**（畳んだ棚を読みながら、生きた宛先に書ける） */
  const dest =
    fixed ?? writable.find((t) => t.id === to) ?? writable[0] ?? here;

  useEffect(() => {
    setHearted(heartedLocally());
    setToday(new Date());
  }, []);

  /* 掲示板は1回で全部読む。テーマごとの枚数も、選んだテーマの中身も、
     同じ1回から出せる（枚数を出すには、どのみち全部が要る）。
     テーマが決まっている面は、そのテーマぶんだけを押された順に読む。

     しまったものを見にいくのも同じ効果でやる。一覧と混ぜて持たないのは、
     戻したときにどちらへ動いたかが分からなくなるため。押すたびに読み直す。 */
  const stowed = bin && owner;
  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const go = async () => {
      try {
        const r =
          stowed ?
            await withRead(getArchivedStickies((await withRead(token())) ?? "", fixed?.id)) :
            await withRead(
              getStickies(fixed ? { theme: fixed.id, byHearts: true } : { limit: 300 }),
            );
        if (gone) return;
        ok = true;
        miss = 0;
        setNotes(r.notes);
        setRead("ok");
      } catch {
        if (gone) return;
        /* **空の配列にしない。** 空は「読めた上での0枚」のことばで、
           届かなかった日に言ってよい嘘ではない。 */
        setRead("down");
        /* **押されるまで待たない。** 車が谷を抜ければ次は通る。
           間隔を倍にしながら、30秒おきまで落として黙って読み直す。
           `setRead("wait")` に戻さないのは、灰色の骨と「読めなかった」の顔が
           数秒おきに入れ替わるのを避けるため（#277）。 */
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setNotes(null);
    setRead("wait");
    go();

    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。
       読めているうちは何もしない（画面に戻るたびに往復を1本増やさない）。 */
    const wake = () => {
      if (ok || gone) return;
      clearTimeout(wait);
      miss = 0;
      go();
    };
    const onShow = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      gone = true;
      clearTimeout(wait);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [fixed, stowed, token, again]);

  /* 枚数を外へ返す口（`onCount`）は無くなった（2026-10-01）。
     使っていたのは掲示板の2枚の札で、「開く前から枚数が出ている」ために
     要っていた。札が無くなって、枚数は棚の見出し（`.bd-count`）が
     そのまま出している。 */

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes ?? []) m.set(n.theme, (m.get(n.theme) ?? 0) + 1);
    return m;
  }, [notes]);
  /** 畳みの見出しに出す数。**宛先の数ではなく、その中に貼られている付箋の枚数。**
      閉じたまま「いくつ入っているか」が分かるのは、読む人には枚数のほうなので。 */
  const closedNotes = useMemo(
    () => closedThemes.reduce((n, t) => n + (counts.get(t.id) ?? 0), 0),
    [closedThemes, counts],
  );

  const list = useMemo(
    () => ordered((notes ?? []).filter((n) => fixed || n.theme === pick)),
    [notes, fixed, pick],
  );

  /* 「まだ1枚も貼られていません」の空札が出ているか。
     空札そのものが押しどころ（「いちばんに貼る」）なので、そのときは
     書く欄を開く段をもう1つ出さない。同じ行き先の押しどころを2つ置かない。 */
  const blank = read === "ok" && list.length === 0 && !bin;

  /** 選んだ絵を外す。見本の URL は手で返す（放っておくと端末に残る） */
  const dropPic = () => {
    setPic((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return null;
    });
  };

  /** 絵を1枚えらぶ。**焼くのはここ**（送る前に小さくする。`notePic.ts`） */
  const takePic = async (file: File | undefined) => {
    if (!file) return;
    setBaking(true);
    setErr(null);
    const r = await pickPic(file);
    setBaking(false);
    if (!r.ok) {
      setErr(r.why);
      return;
    }
    dropPic();
    setPic(r.pic);
  };

  const submit = async () => {
    const t = text.trim();
    if (t.length < 2) {
      setErr("もう少しだけ書いてほしいな");
      return;
    }
    const u = link.trim();
    /* **断られる前に言う。** サーバー側も見ているが（`safeLink`）、
       400 を「いま貼れなかった」として出すと、直せる間違いが
       電波の話に見える。 */
    if (u && !okLink(u)) {
      setErr("リンクは http から始まるものだけ貼れるよ");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { note } = await postSticky(
        {
          theme: dest.id,
          text: t,
          link: u || undefined,
          by: name.trim() || undefined,
          /* 絵は2枚いっしょに送る（`notePic.ts`）。片方だけだと 400 */
          image: pic?.image,
          thumb: pic?.thumb,
          w: pic?.w,
          h: pic?.h,
          tw: pic?.tw,
          th: pic?.th,
        },
        await token(),
      );
      setNotes((cur) => [note, ...(cur ?? [])]);
      setText("");
      setLink("");
      dropPic();
    } catch (e) {
      const s = String(e);
      setErr(
        s.includes("429") ?
          "今日はたくさん貼ってくれた。また明日おねがい。" :
          s.includes("401") ?
            "絵を貼るには、ログインしてね。" :
            /* 400 は、こちらで直せる間違い。**電波の話にしない**
               （貼った絵が通らなかっただけで、板は読めている） */
            s.includes("400") && pic ?
              "この絵は貼れなかった。ほかの絵でためしてみて。" :
              "いま貼れなかった。少し待って、もう一度。",
      );
    } finally {
      setSending(false);
    }
  };

  /** ハートを押す。**押した瞬間に数字を動かす。** 返事を待つと手応えが遅れる。 */
  const heart = async (n: Sticky) => {
    const on = !hearted.has(n.id);
    setHearted((s) => {
      const next = new Set(s);
      if (on) next.add(n.id);
      else next.delete(n.id);
      return next;
    });
    setNotes(
      (cur) =>
        cur?.map((x) =>
          x.id === n.id ?
            { ...x, hearts: Math.max(0, x.hearts + (on ? 1 : -1)) } :
            x,
        ) ?? cur,
    );
    rememberHeart(n.id, on);
    try {
      const r = await heartSticky(n.id, await token());
      // サーバーが数えた数に合わせ直す。押しっぱなしのズレはここで消える
      setNotes(
        (cur) =>
          cur?.map((x) => (x.id === n.id ? { ...x, hearts: r.hearts } : x)) ??
          cur,
      );
      rememberHeart(n.id, r.on);
      setHearted((s) => {
        const next = new Set(s);
        if (r.on) next.add(n.id);
        else next.delete(n.id);
        return next;
      });
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const stow = async (n: Sticky, on: boolean) => {
    const t = await token();
    if (!t) return;
    // しまったもの／出ているものは別の一覧なので、押したほうから消える
    setNotes((cur) => cur?.filter((x) => x.id !== n.id) ?? cur);
    try {
      await archiveSticky(n.id, on, t);
    } catch {
      /* しまえなかったぶんは戻す。**「読みに行けなかった」の顔にしない。**
         読めてはいるので、そう言うと直せない1枚が板ぜんぶを覆う
         （並びは出すときに `ordered` で作り直すので、末尾に戻せばよい）。 */
      setNotes((cur) => (cur ? [...cur, n] : cur));
    }
  };

  const inner = (
    <>
      {/* `title={null}` で見出しを出さない（面の題と同じ字を2つ並べないため） */}
      {!bare && title !== null && <h2>{title ?? "みんなの付箋"}</h2>}
      {/* 宛先が決まって来た人にだけ、その宛先の一行を出す。
          選ぶ人には、選んだ宛先の一行を**書く欄の中**で出す（下の `.nt-lead`）。
          上にも出すと、同じことを2回言うことになる。 */}
      {fixed && <p className="muted">{fixed.lead}</p>}

      {/* 書く欄。**付箋の山より前に置く。**
          あとに置いていたときは、貼ってある枚数ぶん下までスクロールしないと
          書き出せなかった（あやとが6枚貼った企画で実際にそうなった）。
          読む場所と書く場所は同じ面のまま、指の移動だけ短くする。

          出しっぱなしにはしない。名前・本文・ボタンで 300px 近く取るので、
          開いたままだと今度は付箋の山が画面の外へ出る。押す段を1つ挟む。

          名前は本文の前に置く。あとに置いていたときは、書き終えた人が
          そこまで目を戻さず、本文の末尾に「by まこも」と書いていた。

          **読めていないあいだは出さない**（#36）。貼れても、貼った1枚だけが
          板ぜんぶの顔で並ぶ。区画は残して、押しどころだけ出さない。

          **紙の形そのものを付箋にした。** ここはただの箱で、貼られた付箋だけが
          画びょうの刺さった色紙だった。企画の書く欄も同じただの箱なので、
          選び違えた人に、書いているあいだ一度も手ごたえが無かった
          （あやと 2026-09-30「見た目も同じで使い分けがわかりにくいね」）。 */}
      {!bin && !open && !blank && read === "ok" && (
        <button
          className="nt-open"
          onClick={() => {
            setOpen(true);
            // 開いた先へ連れていく。開いただけだと、画面の外で欄が増える
            requestAnimationFrame(() => box.current?.focus());
          }}
        >
          {list.length > 0 ? "自分も書く" : "1枚目を書く"}
          <Icon name="chevron" size={13} />
        </button>
      )}

      {!bin && open && (
        <div className="nt-write">
          {/* 画びょう。貼られた付箋（`.nx-notes > li`）と同じ絵を同じ場所に刺す */}
          <span className="nx-pin" aria-hidden>
            <Pin tone={PINS[0]} size={19} />
          </span>
          {fixed ? (
            <p className="nt-to">
              <span>{fixed.name}</span>あてに貼ります
            </p>
          ) : (
            /* **書ける宛先だけを並べる**（`writable`）。棚は13〜15あるが、
               そのうち生きているのは4つ。終わった国と終わった企画を選び先に
               出しておくと、書いたものが誰も見ない棚に入る。 */
            <div className="nt-dest">
              <span className="nt-dest-l">どこへ</span>
              <div className="nt-dests">
                {writable.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`nt-destb${t.id === dest.id ? " is-on" : ""}`}
                    aria-pressed={t.id === dest.id}
                    onClick={() => {
                      setTo(t.id);
                      /* **下の一覧もここで絞る。** この丸札が、生きている宛先の
                         唯一の選び札になった（棚からは外した）。書く先だけ動かして
                         一覧が前の宛先のままだと、書いた1枚がどこにも出てこない。 */
                      setPick(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 選んだ宛先が「何を書く場所か」を言う一行（`content/themes.ts` の `lead`）。
              仕組みの話はしない。書くことだけを言う。 */}
          {!fixed && <p className="nt-lead">{dest.lead}</p>}
          {/* 島で押してきた人だけに出る。押した札をそのまま見せて、
              書き出しまで入れておく。ここで「何の話だっけ」に戻さない。 */}
          {ask && (
            <div className="bd-bridge">
              <b>さっき「{ask.label}」を押しましたね</b>
              <i>{ask.question}</i>
              <button
                type="button"
                className="bd-bridge-go"
                onClick={() => {
                  const seed = `${ask.label}で、`;
                  // すでに書いてあるものを消さない。書き出しは前に足すだけ
                  setText((t) => (t.startsWith(seed) ? t : seed + t));
                  box.current?.focus();
                }}
              >
                その続きから書く
                {/* 行き先は下の入力欄。矢印もそちらを向ける */}
                <Icon name="chevron" size={13} />
              </button>
            </div>
          )}
          <label className="nt-field">
            <span>名前（書かなくてもいい）</span>
            {user ? (
              <span className="bin bin-locked">{user.name} として貼ります</span>
            ) : (
              <input
                className="bin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="呼ばれたい名前"
              />
            )}
          </label>
          <label className="nt-field">
            <span>書くこと</span>
            <textarea
              ref={box}
              className="bin"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={MAX}
              placeholder={dest.placeholder}
            />
          </label>
          {/* **1本だけ。** 企画の欄は8本まで持てたが、こちらは本文が120字しか
              ない。URL は 2,048字まで入るので、何本も置ける欄にすると
              頼みごとより行き先のほうが長い付箋ができる。 */}
          <label className="nt-field">
            <span>リンク（なくてもいい）</span>
            <input
              className="bin"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={MAX_LINK}
              placeholder="https://"
            />
          </label>
          {/* 絵1枚（2026-10-08）。**ログインした人だけ。**
              あやとの言葉:「付箋に画像も貼れるようにしてほしくて」。

              ログインしていない人には、**押す前に**そう言う。押してから
              断られる形にすると、絵をえらんで焼いてから「駄目でした」になる。
              ここで入ってもらえば、書いた字はそのまま残る（同じ面のまま）。 */}
          <div className="nt-field nt-pics">
            <span>絵（なくてもいい）</span>
            {user ? (
              pic ? (
                <span className="nt-picked">
                  {/* 見本は、えらんだ絵そのもの。**貼ったあとの大きさで出す**
                      （`.nt-pic` と同じ背）ので、板での姿が先に分かる */}
                  <img src={pic.preview} alt="" />
                  <button type="button" className="nt-picoff" onClick={dropPic}>
                    <Icon name="close" size={12} />
                    この絵をはずす
                  </button>
                </span>
              ) : (
                <label className={`nt-pick${baking ? " is-busy" : ""}`}>
                  <Icon name="plus" size={13} />
                  {baking ? "よみこんでいます…" : "絵をえらぶ"}
                  <input
                    type="file"
                    /* **`image/*`。種類で絞らない。** iPhone の写真は HEIC で、
                       jpeg だけを並べると選べない写真ができる。**どの道、
                       送る前にこちらで jpeg か webp に焼き直す**（`notePic.ts`）し、
                       置くかどうかは口が中身のバイトで決める。
                       島のほかの2か所（`Characters.tsx` / `PhotoPost.tsx`）も同じ */
                    accept="image/*"
                    onChange={(e) => {
                      void takePic(e.target.files?.[0]);
                      /* 同じ絵をもう一度えらべるように空にする
                         （`change` は値が同じだと飛んでこない） */
                      e.target.value = "";
                    }}
                  />
                </label>
              )
            ) : (
              <span className="nt-picin">
                <i>絵を貼るのは、ログインしてから。字だけなら、そのまま貼れるよ。</i>
                <SignIn compact />
              </span>
            )}
          </div>
          <div className="brow">
            <button className="bbtn" onClick={submit} disabled={sending || baking}>
              {sending ? "はりだし中…" : "はりだす"}
            </button>
          </div>
          {err && (
            <p className="err">
              <Icon name="alert" size={13} /> {err}
            </p>
          )}
        </div>
      )}

      {/* 終わった旅と企画。**畳んで、閉じたまま出す。**
          前はここに13〜15の宛先が平らに並んでいて、あやとに
          「付箋の項目に古いのが多くて醜い」と言われた（2026-09-30）。
          生きている4つは、すぐ上の「どこへ」の丸札が同じ仕事をしているので、
          ここには出さない。**残るのは終わったぶんだけ**なので、畳みが1つになる。

          消さずに畳むのは、貼られた付箋をどこからも読めなくしないため。
          開けば今までどおり押せて、押せば下の一覧がその宛先に絞られる。

          **中が空なら、畳みごと出さない。** 空の畳みは、押しても何も無い札。

          厚みは1枚ずつ付ける。「付けなくてよい」例外が効くのは一面ぜんぶが
          押せるマスの並びのときだけで、ここは紙の面の途中にある
          （`docs/island-world.md` 3.5）。 */}
      {groups.length > 0 && (
        <Fold
          /* **「行き先」と書かない。** 中に「行ってきた企画」が入っている。
             企画は行き先ではないので、外の見出しだけを読むと嘘になる。
             中の見出し（`shelves` の group）は今までどおり分かれている。 */
          title="終わった旅と企画"
          note={closedNotes > 0 ? `${closedNotes}枚` : undefined}
        >
          {groups.map((g) => (
            <div className="nb-group" key={g.group}>
              <span className="nb-glabel">{g.group}</span>
              <div className="nb-tabs">
                {g.themes.map((t) => (
                  <button
                    key={t.id}
                    className={`nb-tab${t.id === pick ? " is-on" : ""}`}
                    aria-pressed={t.id === pick}
                    /* 終わった宛先なので、**読む先だけ動かす。**
                       書く先（`to`）は触らない。押した先にはもう書けない。 */
                    onClick={() => setPick(t.id)}
                  >
                    <b>{t.name}</b>
                    {(counts.get(t.id) ?? 0) > 0 && <i>{counts.get(t.id)}</i>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Fold>
      )}

      <div className="nb-board">
        {!fixed && (
          <div className="nb-head">
            <h3 className="sub">{here.name}</h3>
            {list.length > 0 && (
              <span className="bd-count">
                <b>{list.length}</b>枚
              </span>
            )}
            {here.href && (
              <Link className="nb-go" href={here.href} prefetch={false}>
                この話をしている場所へ
                <Icon name="right" size={13} />
              </Link>
            )}
          </div>
        )}

        {/* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く
            （`docs/island-world.md` 4.1）。 */}
        {read === "wait" && (
          <ul className="nx-notes is-wait" aria-hidden>
            <li />
            <li />
            <li />
          </ul>
        )}

        {/* 読みに行けなかった。**「まだ1枚も貼られていません」とは別の顔にする。**
            札は島じゅうで1つ（`components/me/ReadAgain.tsx`）。 */}
        {read === "down" && (
          <ReadAgain what={bin ? "しまったもの" : "付箋"} onRetry={() => setAgain((n) => n + 1)} />
        )}

        {read === "ok" && list.length === 0 && (
          <div className="blank">
            <b>{bin ? "しまったものはありません" : "まだ1枚も貼られていません"}</b>
            {/* **書く欄が開いているかで、言うことを変える。**
                開いたあとも「押すと、書く欄がひらきます」と言い続けていたころ、
                すぐ上に開いている欄を指して、もう一度開く札が出ていた。

                **いま読んでいる棚が書く宛先でないときは、何も言わない。**
                終わった国の空の棚で「1枚目になれるよ」と誘うと、押した先の
                宛先は別のところを指している。 */}
            {(bin || dest.id === here.id) && (
              <p>
                {bin ?
                  "しまったものが、ここに並びます。" :
                  open ?
                    `上の欄に書くと、${here.name}あての1枚目になります。` :
                    `${here.name}あての1枚目になれるよ。`}
              </p>
            )}
            {!bin && !open && dest.id === here.id && (
              <button
                className="blank-go"
                onClick={() => {
                  // 書く欄はこの上にある。開いてから、そこへ連れていく
                  setOpen(true);
                  requestAnimationFrame(() => {
                    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    box.current?.focus({ preventScroll: true });
                  });
                }}
              >
                いちばんに貼る
                <Icon name="chevron" size={14} />
              </button>
            )}
          </div>
        )}

        <Longer items={list} first={SHOW} step={STEP} unit="枚" className="nx-notes">
          {(n, i) => (
            <li key={n.id} className={n.byOwner ? "is-owner" : undefined}>
              <span className="nx-pin">
                <Pin tone={PINS[i % PINS.length]} size={19} />
              </span>
              {/* 運営者が立てた付箋。おたずねの選択肢がこれになる。
                  誰が立てたのかを言わないと、押された数の意味が変わる */}
              {n.byOwner && <em className="nt-owner">あやとから</em>}
              {/* **書いてくれたまま出す。** 改行を潰すと、行末と次の行頭が
                  くっついて別の語に読める（#83） */}
              <Wrote t={n.text} />
              {/* 貼られたリンク。**出す字はこちらで決める**（`linkLabel`）。
                  URL を素で出すと、付箋1枚が URL で埋まる。
                  島の外へ出るので、新しいタブで開いて、こちらの窓への
                  参照は渡さない（`noopener`。`noreferrer` で、どの付箋から
                  来たかも渡さない）。 */}
              {/* **出すときにも `okLink` を通す。** サーバー（`safeLink`）が
                  入れるときと読むときの両方で見ているが、ここは `href` に
                  人の字がそのまま入る出口なので、1枚に頼らない。React は
                  `javascript:` の `href` を止めてくれない（警告だけ）。
                  口を1つ足した日・古い答えが挟まった日に、ここが最後の壁 */}
              {/* 貼られた絵1枚（2026-10-08）。**閉じているあいだは切手1枚ぶん。**
                  押すと、その場で大きくなる（`NotePic.tsx`）。
                  字の下に置くのは、読む順を変えないため——絵を上に置くと、
                  絵のある付箋だけ字が1段下がって、流れが途切れる。 */}
              {n.pic && <NotePic pic={n.pic} />}
              {n.link && okLink(n.link) && (
                <a
                  className="nt-link"
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  /* 札の字は行き先の名前だけなので、読み上げには元の URL を添える */
                  title={n.link}
                >
                  <Icon name="right" size={12} />
                  {linkLabel(n.link)}
                </a>
              )}
              {n.by && <em className="nb-by">{n.by} さん</em>}

              {/* あやとからの返信。紙の上の紙なので、厚みは付けない */}
              {n.reply && (
                <span className="nt-reply">
                  <i>あやと</i>
                  <Wrote t={n.reply} />
                </span>
              )}

              <span className="nt-foot">
                <button
                  className={`nt-heart${hearted.has(n.id) ? " is-on" : ""}`}
                  onClick={() => heart(n)}
                  aria-pressed={hearted.has(n.id)}
                  aria-label={hearted.has(n.id) ? "ハートを外す" : "ハートを押す"}
                >
                  {/* 絵文字は使わない。同じ形を `Board.tsx` の企画のハートも描いている */}
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  <b>{n.hearts}</b>
                </button>
                {owner && (
                  <OwnerTools
                    note={n}
                    onReply={(reply, repliedAt) =>
                      setNotes(
                        (cur) =>
                          cur?.map((x) =>
                            x.id === n.id ?
                              {
                                ...x,
                                reply: reply ?? undefined,
                                repliedAt: repliedAt ?? undefined,
                              } :
                              x,
                          ) ?? cur,
                      )
                    }
                    onStow={(on) => stow(n, on)}
                    onDropPic={() =>
                      setNotes(
                        (cur) =>
                          cur?.map((x) =>
                            x.id === n.id ? { ...x, pic: undefined } : x,
                          ) ?? cur,
                      )
                    }
                    stowed={bin}
                  />
                )}
              </span>
            </li>
          )}
        </Longer>
      </div>

      {/* しまったものを見る。あやとだけ。**消していないので、戻せる。** */}
      {owner && (
        <button className="nt-bin" onClick={() => setBin((v) => !v)}>
          {bin ? "貼ってあるものに戻る" : "しまったものを見る"}
          <Icon name={bin ? "left" : "right"} size={13} />
        </button>
      )}
    </>
  );

  // 面は紙。板にするのは押すもの・書くものだけ（`docs/island-world.md` 2.1）
  return bare ? inner : <section className="panel paper">{inner}</section>;
}

/**
 * あやとの道具。**1枚につき、返信としまうの2つ**（絵が貼ってあれば3つ）。
 *
 * 出るかどうかは `/me` の `admin` で決めているが、それは道具を出すかどうかの
 * 話でしかない。実際に書けるかは、書く先の口がもう一度見ている
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 *
 * **「絵をはずす」は1タップ。** 確かめを挟まないのは、荒れた絵が公開の面に
 * 出ている時間をいちばん短くするため。外しても付箋の字は残る
 * （付箋ごと下ろすなら「しまう」。あちらは消さずにしまう）。
 */
function OwnerTools({
  note,
  onReply,
  onStow,
  onDropPic,
  stowed,
}: {
  note: Sticky;
  onReply: (reply: string | null, repliedAt: string | null) => void;
  onStow: (on: boolean) => void;
  onDropPic: () => void;
  stowed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const { token } = useAuth();

  const save = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    try {
      const r = await replySticky(note.id, text.trim(), t);
      onReply(r.reply, r.repliedAt);
      setOpen(false);
    } catch {
      /* 書けなかったら、開いたまま。書いた字は消さない */
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="nt-own">
      <button className="nt-obtn" onClick={() => setOpen((v) => !v)}>
        {note.reply ? "返信を直す" : "返信する"}
      </button>
      <button className="nt-obtn" onClick={() => onStow(!stowed)}>
        {stowed ? "もどす" : "しまう"}
      </button>
      {/* 絵が貼ってある1枚にだけ出る。**1タップで外れる。** */}
      {note.pic && (
        <button
          className="nt-obtn"
          onClick={async () => {
            const t = await token();
            if (!t) return;
            // 押した瞬間に消す。戻すものではないので、返事を待たせない
            onDropPic();
            try {
              await dropStickyPic(note.id, t);
            } catch {
              /* 外せなかったぶんは、次に読み直したときに戻ってくる。
                 ここで謝らない（板は読めている） */
            }
          }}
        >
          絵をはずす
        </button>
      )}
      {open && (
        <span className="nt-obox">
          <textarea
            className="bin"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="ここに返す。空にすると取り消し"
          />
          <button className="bbtn" onClick={save} disabled={busy}>
            {busy ? "送っています…" : "返す"}
          </button>
        </span>
      )}
    </span>
  );
}
