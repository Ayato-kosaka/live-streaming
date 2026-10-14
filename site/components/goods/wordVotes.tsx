"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getStickies,
  heartSticky,
  heartedLocally,
  postSticky,
  rememberHeart,
  type Sticky,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import ReadAgain from "@/components/me/ReadAgain";

/**
 * **「字1つに、いいねを1つ」の仕掛け。ここ1本だけ。**
 *
 * 用事は**候補を並べて、どれがいいか押してもらう**こと。いま使っているのは
 * LINEスタンプの候補だけ（カレンダーの型も 2026-10-12 まで使っていた）。
 * 同じ用事に仕掛けを2つ置くと、**片方だけ直す日が必ず来る**ので、
 * 読む・押す・立てる・楽観更新・読めなかった日の扱いを、全部ここに置く。
 *
 * ## 新しい入れ物を作っていない
 *
 * 押した数を置く先は、**付箋そのもの**（`islandNotes`）。付箋は
 * 「字1つ ＋ ハート」を持つ書類なので、**候補1つ＝付箋1枚**に当てると、
 * ハートがそのままいいねになる。足したものは1つも無い——読むのは
 * `GET /stickies?theme=<宛先>`、押すのは `POST /stickies/:id/heart`。
 *
 * **当てる鍵は、付箋の字そのもの。** 付箋には「どの候補について書いたか」の
 * 欄が無いので、鍵に使えるのは字しかない。だから `text` が候補の字と
 * **ぴったり同じ**ものを、その1つの札とみなす（OBS の名簿と同じ完全一致。
 * `docs/island-api.md` 9章）。
 *
 * まだ1枚も無い字を押した人には、**その場で1枚立ててから**ハートを押す。
 * 立つのはその字の付箋で、これは押した人が言いたかったことそのもの。
 * 一覧には出さない（面の上ですでに枠として出ているので、同じ字が2回ならぶ。
 * `Notes` の `omitTexts`）。
 *
 * ## 1つの候補を、2つ以上の字が指すことがある
 *
 * 字が鍵なので、**言い方が変わると、すでに付いているいいねが迷子になる。**
 * LINEスタンプは提案のときの言い方で付箋が立ち、あとから届いた絵の字が
 * それと少し違うことがある（「サプラ〜イズ！！」→「サプラーイズ！」）。
 *
 * だから候補は**字1つではなく、字の並び**で渡せる。先頭が
 * **枠に出て、押すと立つ字**で、2つ目から先は**同じ候補を指すほかの字**。
 *
 *   - いいねの数は、**並びぜんぶを足して**出す（同じ字が2枚立った回のために
 *     足していたのと同じ形。足す相手が増えるだけ）
 *   - 押して立つ／切り替わるのは**先頭の付箋だけ。** 後ろのほうは読むだけ
 *   - 字1つだけの候補は、これまでどおり字で渡してよい
 *
 * ## 読めなかった日に「0いいね」と言わない
 *
 * `docs/island-standards.md` 10章。数は読めたときだけ出す。読めていない
 * あいだは**押しどころも出さない**（押せたように見えて消える書き込みは、
 * 出ない書き込みより悪い）。
 */

/** いちばん古いものを札にする。**毎回同じ1枚を指す**ように、字で並べ替えない */
const oldest = (xs: Sticky[]) =>
  xs.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));

/** 呼び出し側が受け取るもの。**画面の形はここで決めない** */
export type WordVotes = {
  /** 読めたか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  read: Read;
  /**
   * その字のいいねの数。**読めていないあいだは `undefined`。**
   * `0` に畳まない（`||` も `??` も使わない。`island-standards.md` 10章）
   */
  hearts: (word: string) => number | undefined;
  /** この端末が押してあるか */
  on: (word: string) => boolean;
  press: (word: string) => void;
  /** いま立てている最中の字。二度押しで2枚立てないため */
  busy: string | null;
  /** 押したのに動かなかったときの1行 */
  why: string | null;
  retry: () => void;
};

/**
 * 候補1つぶんの鍵。字1つか、**同じ候補を指す字の並び**（先頭が押す字）。
 */
export type VoteWord = string | string[];

/** 鍵を、かならず「先頭が押す字」の並びに直す */
const spell = (w: VoteWord) => (typeof w === "string" ? [w] : w);

/**
 * @param theme 付箋の宛先（`content/themes.ts` の id）。**新しく作らない**
 * @param words 候補の鍵。**呼び出し側が持つ定数を渡す**——
 *   その場で組んだ配列を渡すと、毎回新しいものに見えて数え直しが止まらない。
 *   字の並びで渡したときは、**先頭が枠に出る字**（`hearts` / `on` / `press`
 *   に渡すのもこれ）で、残りは数を足すだけの相手
 */
export function useWordVotes(theme: string, words: VoteWord[]): WordVotes {
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [again, setAgain] = useState(0);
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * 押したのに動かなかったときの1行。
   *
   * **黙って何も起きない押しどころは「壊れている」と読まれる**
   * （`docs/island-design.md` 3-1）。いちばん起きるのは、まだ札の無い字を
   * その日21枚目に押したとき——付箋は1日20枚までなので、立てるところで断られる。
   */
  const [why, setWhy] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    setHearted(heartedLocally());
  }, []);

  useEffect(() => {
    let gone = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;
    const go = async () => {
      try {
        const r = await withRead(getStickies({ theme, limit: 300 }));
        if (gone) return;
        setNotes(r.notes);
        setRead("ok");
      } catch {
        if (gone) return;
        /* **空の配列にしない。** 読めなかったことと、0枚だったことは別もの */
        setRead("down");
        miss += 1;
        wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };
    go();
    return () => {
      gone = true;
      clearTimeout(wait);
    };
  }, [again, theme]);

  /**
   * 枠に出る字 → その札（押す付箋1枚）と、いいねの数。
   *
   * **札が無くても、数が在ることがある。** ほかの言い方で付箋が立っていて、
   * 枠に出る字ではまだ1枚も立っていないとき（`also`）。そのときは
   * 数だけ出して、押されたらそこで先頭の付箋を立てる。
   */
  const byWord = useMemo(() => {
    const m = new Map<string, { note?: Sticky; hearts: number }>();
    for (const word of words) {
      const says = spell(word);
      const head = says[0];
      /* 同じ字が2枚立ってしまった回のために、**足して出す。**
         札は1枚だが、数は鍵の字ぜんぶぶん。見ている人には1つの数に見える */
      const hit = (notes ?? []).filter((n) => says.includes(n.text.trim()));
      if (!hit.length) continue;
      const mine = hit.filter((n) => n.text.trim() === head);
      m.set(head, {
        note: mine.length ? oldest(mine) : undefined,
        hearts: hit.reduce((n, x) => n + x.hearts, 0),
      });
    }
    return m;
  }, [notes, words]);

  const press = useCallback(
    async (word: string) => {
      if (busy) return;
      const t = await token();
      const hit = byWord.get(word);
      if (!hit?.note) {
        /* その字では、まだ1枚も立っていない。**立ててから押す。**
           ほかの言い方の付箋に数が付いていても、立てるのは押された字のほう */
        setBusy(word);
        setWhy(null);
        try {
          const { note } = await postSticky({ theme, text: word }, t);
          const { hearts, on } = await heartSticky(note.id, t);
          setNotes((cur) => [{ ...note, hearts }, ...(cur ?? [])]);
          rememberHeart(note.id, on);
          setHearted((s) => new Set(s).add(note.id));
        } catch (e) {
          /* 立てられなかった。数は動かさず、**押したことが消えたと分からせる** */
          setWhy(
            String(e).includes("429") ?
              "今日はたくさん押してくれた。また明日おねがい。" :
              "いま押せなかった。少し待って、もう一度。",
          );
        } finally {
          setBusy(null);
        }
        return;
      }
      const id = hit.note.id;
      const on = !hearted.has(id);
      // 押した瞬間に動かす。返事を待つと手ごたえが遅れる（`Notes.tsx` と同じ）
      setHearted((s) => {
        const next = new Set(s);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
      setNotes((cur) =>
        cur?.map((x) =>
          x.id === id ? { ...x, hearts: Math.max(0, x.hearts + (on ? 1 : -1)) } : x,
        ) ?? cur,
      );
      rememberHeart(id, on);
      try {
        const r = await heartSticky(id, t);
        setNotes((cur) =>
          cur?.map((x) => (x.id === id ? { ...x, hearts: r.hearts } : x)) ?? cur,
        );
        rememberHeart(id, r.on);
        setHearted((s) => {
          const next = new Set(s);
          if (r.on) next.add(id);
          else next.delete(id);
          return next;
        });
      } catch {
        /* 楽観更新のまま。次に開いたときに正しい数へ戻る */
      }
    },
    [busy, byWord, hearted, theme, token],
  );

  return {
    read,
    hearts: (word) => byWord.get(word)?.hearts,
    on: (word) => {
      const note = byWord.get(word)?.note;
      return note ? hearted.has(note.id) : false;
    },
    press,
    busy,
    why,
    retry: () => setAgain((n) => n + 1),
  };
}

/**
 * ハート1つ。**形も押し心地も、付箋のハート（`.nt-heart`）そのまま。**
 *
 * 使う欄が増えても同じものが出るように、絵も札もここ1か所から出す。押しどころの背は 48px（`live.css` の `.nt-heart`）。
 */
export function VoteHeart({ word, votes }: { word: string; votes: WordVotes }) {
  /* 読めていないあいだは押しどころを出さない。
     **押せたように見えて消える書き込みは、出ない書き込みより悪い** */
  if (votes.read === "wait")
    /* 取りに行っている最中。**0 と同じ絵にしない**ので、数は出さずに
       場所だけ取る。**読めなかったときには使わない**——灰色は「もうすぐ出る」
       の意味なので、出ないものの上に置き続けてはいけない
       （`docs/island-standards.md` 10章） */
    return <span className="gd-votewait" aria-hidden />;
  if (votes.read !== "ok") return null;
  const on = votes.on(word);
  return (
    <button
      type="button"
      className={`nt-heart${on ? " is-on" : ""}`}
      onClick={() => votes.press(word)}
      disabled={votes.busy === word}
      aria-pressed={on}
      aria-label={`「${word}」に${on ? "押したいいねを外す" : "いいねを押す"}`}
    >
      {/* 絵文字は使わない。形は `Notes.tsx` のハートと同じ */}
      <svg viewBox="0 0 24 22" aria-hidden>
        <path
          d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
          fill="currentColor"
        />
      </svg>
      <b>{votes.hearts(word) ?? 0}</b>
    </button>
  );
}

/**
 * **押せないハート。** 宛先を締め切ったあとに、付いた数だけを見せる。
 *
 * 締め切った宛先には、もう1枚も立てられない（`POST /stickies` が 409 で断る）。
 * `VoteHeart` を残すと、まだ札の無い字を押した人が**押して失敗する**。
 * かといって数を消すと、締め切った宛先の付箋は数もハートも今までどおり出る
 * （`Notes.tsx` の `shut`）のと食い違う。だから**数は出して、押しどころは出さない。**
 *
 * **厚みを付けない**（`docs/island-design.md` 3-3。厚みは押せる合図）。
 * 読めていないあいだの扱いは `VoteHeart` と同じ（0 と同じ絵にしない）。
 */
export function VoteTally({ word, votes }: { word: string; votes: WordVotes }) {
  if (votes.read === "wait") return <span className="gd-votewait is-still" aria-hidden />;
  if (votes.read !== "ok") return null;
  const n = votes.hearts(word) ?? 0;
  return (
    <span className="gd-votetally" aria-label={`「${word}」へのいいね ${n}`}>
      <svg viewBox="0 0 24 22" aria-hidden>
        <path
          d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
          fill="currentColor"
        />
      </svg>
      <b>{n}</b>
    </span>
  );
}

/**
 * 欄のしまい。**押せなかった1行と、読めなかった札。**
 *
 * この2つは別のこと——押せなかったのは「立てるところで断られた」で、
 * 読めなかったのは「数が取れていない」。同じ字にしない。
 */
export function VoteFoot({ votes }: { votes: WordVotes }) {
  return (
    <>
      {votes.why && <p className="gd-why">{votes.why}</p>}
      {votes.read === "down" && (
        <ReadAgain what="いいねの数" onRetry={votes.retry} />
      )}
    </>
  );
}
