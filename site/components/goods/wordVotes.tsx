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
 * グッズの面には、まだ決まっていないものが2つある（LINEスタンプの候補、
 * カレンダーの型）。どちらも用事は同じ——**候補を並べて、どれがいいか
 * 押してもらう**。同じ用事に仕掛けを2つ置くと、**片方だけ直す日が必ず来る**
 * ので、読む・押す・立てる・楽観更新・読めなかった日の扱いを、全部ここに置く。
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
 * @param theme 付箋の宛先（`content/themes.ts` の id）。**新しく作らない**
 * @param words 候補の字。**呼び出し側が持つ定数を渡す**——
 *   その場で組んだ配列を渡すと、毎回新しいものに見えて数え直しが止まらない
 */
export function useWordVotes(theme: string, words: string[]): WordVotes {
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

  /** 字 → その札（付箋1枚）と、いいねの数 */
  const byWord = useMemo(() => {
    const m = new Map<string, { note: Sticky; hearts: number }>();
    for (const w of words) {
      const hit = (notes ?? []).filter((n) => n.text.trim() === w);
      if (hit.length) {
        m.set(w, {
          note: oldest(hit),
          /* 同じ字が2枚立ってしまった回のために、**足して出す。**
             札は1枚だが、数は字ぜんぶぶん。見ている人には1つの数に見える */
          hearts: hit.reduce((n, x) => n + x.hearts, 0),
        });
      }
    }
    return m;
  }, [notes, words]);

  const press = useCallback(
    async (word: string) => {
      if (busy) return;
      const t = await token();
      const hit = byWord.get(word);
      if (!hit) {
        /* まだ1枚も無い字。**立ててから押す。** */
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
      const hit = byWord.get(word);
      return hit ? hearted.has(hit.note.id) : false;
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
 * 2か所（LINEスタンプ・カレンダー）で同じものが出るように、絵も札も
 * ここ1か所から出す。押しどころの背は 48px（`live.css` の `.nt-heart`）。
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
