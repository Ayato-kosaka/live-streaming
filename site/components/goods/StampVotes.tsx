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
import { LINE_PENDING, LINE_STAMPS } from "@/content/goods";

/**
 * あやとの10枚に、いいねを押す。
 *
 * あやとの言葉（2026-10-08）:
 *
 * > LINEスタンプ（検討中）→ 検討中は色々候補を出していいねとか押せるように。
 *
 * ## 新しい入れ物を作っていない
 *
 * 押した数を置く先は、**付箋そのもの**（`islandNotes` / 宛先 `goods-linestamp`）。
 * 付箋は「字1つ ＋ ハート」を持つ書類なので、**セリフ1つ＝付箋1枚**に当てると、
 * ハートがそのままいいねになる。足したものは1つも無い——読むのは
 * `GET /stickies?theme=goods-linestamp`、押すのは `POST /stickies/:id/heart`。
 *
 * **当てる鍵は、付箋の字そのもの。** 付箋には「どの1枚について書いたか」の
 * 欄が無いので、鍵に使えるのは字しかない。だから `text` が
 * セリフと**ぴったり同じ**ものを、その1枚の札とみなす（OBS の名簿と同じ
 * 完全一致。`docs/island-api.md` 9章）。
 *
 * まだ1枚も無いセリフを押した人には、**その場で1枚立ててから**ハートを押す。
 * 立つのは「おはよう」という字の付箋で、これは押した人が言いたかったこと
 * そのもの。下の一覧には出さない（面の上ですでに枠として出ているので、
 * 同じ字が2回並ぶ。`Notes` の `omitTexts`）。
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

export default function StampVotes() {
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const [again, setAgain] = useState(0);
  const [hearted, setHearted] = useState<Set<string>>(new Set());
  /** いま立てている最中のセリフ。二度押しで2枚立てないため */
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * 押したのに動かなかったときの1行。
   *
   * **黙って何も起きない押しどころは「壊れている」と読まれる**
   * （`docs/island-design.md` 3-1）。いちばん起きるのは、まだ札の無いセリフを
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
        const r = await withRead(
          getStickies({ theme: "goods-linestamp", limit: 300 }),
        );
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
  }, [again]);

  /** セリフ → その札（付箋1枚）と、いいねの数 */
  const byLine = useMemo(() => {
    const m = new Map<string, { note: Sticky; hearts: number }>();
    for (const s of LINE_STAMPS) {
      const hit = (notes ?? []).filter((n) => n.text.trim() === s.line);
      if (hit.length) {
        m.set(s.line, {
          note: oldest(hit),
          /* 同じ字が2枚立ってしまった回のために、**足して出す。**
             札は1枚だが、数は字ぜんぶぶん。見ている人には1つの数に見える */
          hearts: hit.reduce((n, x) => n + x.hearts, 0),
        });
      }
    }
    return m;
  }, [notes]);

  const press = useCallback(
    async (line: string) => {
      if (busy) return;
      const t = await token();
      const hit = byLine.get(line);
      if (!hit) {
        /* まだ1枚も無いセリフ。**立ててから押す。**
           立てるのは「おはよう」という字の付箋で、宛先は LINEスタンプ */
        setBusy(line);
        setWhy(null);
        try {
          const { note } = await postSticky(
            { theme: "goods-linestamp", text: line },
            t,
          );
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
    [busy, byLine, hearted, token],
  );

  return (
    <div className="gd-stamps">
      <ol className="gd-grid">
        {LINE_STAMPS.map((s) => {
          const hit = byLine.get(s.line);
          const on = hit ? hearted.has(hit.note.id) : false;
          return (
            <li key={s.id}>
              {/* 絵はまだ届いていない。枠に出しているのは**透かしだけの板**で、
                  絵が入る場所がそのまま見える（`tools/goods/stampbake.py`）。
                  届いたら `content/goods.ts` の `art` に道を書くだけ */}
              <span className="gd-stampart">
                <img
                  src={s.art ?? LINE_PENDING}
                  alt=""
                  width={360}
                  height={360}
                  loading="lazy"
                />
                {!s.art && <em>絵はこれから</em>}
              </span>
              <b className="gd-stampline">{s.line}</b>
              {/* 読めていないあいだは押しどころを出さない。
                  **押せたように見えて消える書き込みは、出ない書き込みより悪い** */}
              {read === "ok" ? (
                <button
                  type="button"
                  className={`nt-heart${on ? " is-on" : ""}`}
                  onClick={() => press(s.line)}
                  disabled={busy === s.line}
                  aria-pressed={on}
                  aria-label={`「${s.line}」に${on ? "押したいいねを外す" : "いいねを押す"}`}
                >
                  {/* 絵文字は使わない。形は `Notes.tsx` のハートと同じ */}
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  <b>{hit?.hearts ?? 0}</b>
                </button>
              ) : read === "wait" ? (
                /* 取りに行っている最中。**0 と同じ絵にしない**ので、数は出さずに
                   場所だけ取る。**読めなかったときには使わない**——
                   灰色は「もうすぐ出る」の意味なので、出ないものの上に
                   置き続けてはいけない（`docs/island-standards.md` 10章） */
                <span className="gd-stampwait" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* 押したのに動かなかったとき。**読めなかった（下の札）とは別のこと** */}
      {why && <p className="gd-why">{why}</p>}
      {read === "down" && (
        <ReadAgain what="いいねの数" onRetry={() => setAgain((n) => n + 1)} />
      )}
    </div>
  );
}
