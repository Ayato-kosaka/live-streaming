"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicCharacters, type CharacterPublic } from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";

/**
 * 図鑑に並ぶ人を、口から全員ぶん取ってくる。
 *
 * ## なぜ焼き込みではないのか
 *
 * 焼き込み（`content/residents.ts`）に載っているのは**島に立つ22人だけ**で、
 * 絵のある人は95人いる。あやとの言葉（2026-09-11）:
 *
 * > 全員分を、キャラクター作成順に出せば良い。
 *
 * 絵の置き場そのものは Firebase Storage で、1枚ずつに別々の合言葉が
 * 付いている。URL は1本 200字あるので、95人ぶんを焼き込むと 150KB になる。
 * 焼くほうが得な大きさではない。
 *
 * **旅のあいだに増える**、というのがもう一つの理由。あやとは17日間、
 * スマホから絵を足せる（`/me` の図鑑）。焼き込みだと、足した人は
 * こちらが焼き直すまで出ない。口から取れば、足した次の瞬間から出る。
 *
 * ## 並び
 *
 * `order`（作った順。Viewers 表の行の並びから入れた）で並べる。
 * 番号を持たない人——表より後に画面から足した人——は**末尾**へ回して、
 * その中では `createdAt` の古い順。番号が無いのは「新しい人」なので、
 * 前に割り込ませない。
 *
 * ## 読めなかったときに、空にしない（#34 #36 #43）
 *
 * `cards` と同じで、答えは3つ持つ（`lib/auth.tsx` の `Read`）。
 * 空の配列は「読めた上での0人」のことばで、届かなかった日の返事ではない。
 * 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。
 */
export type CharactersState = {
  /** 読めた人。**`read !== "ok"` のあいだの null を「0人」と読まないこと** */
  chars: CharacterPublic[] | null;
  read: Read;
  /** 落ちたぶんを読み直す。「もう一度よみこむ」の札から呼ぶ */
  reload: () => void;
};

/** 作った順。番号の無い人は末尾（その中では足した順）。 */
export function inOrder(list: CharacterPublic[]): CharacterPublic[] {
  return [...list].sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao != null && bo != null) return ao - bo;
    // 番号を持っているほうが必ず前。持たないのは表より後に足した人
    if (ao != null) return -1;
    if (bo != null) return 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
}

export function useCharacters(): CharactersState {
  const [chars, setChars] = useState<CharacterPublic[] | null>(null);
  const [read, setRead] = useState<Read>("wait");
  const miss = useRef(0);
  /* いまの読めぐあい。**電波が戻ったとき、落ちているときだけ読み直す**ために持つ */
  const now = useRef<Read>("wait");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  /* `showWait` は押されて読み直すときだけ true。ひとりでに読み直すときに
     顔を入れ替えると、骨と「読みに行けなかった」が数秒おきに入れ替わる（#277）。 */
  const load = useCallback((showWait: boolean) => {
    if (showWait) {
      now.current = "wait";
      setRead("wait");
    }
    withRead(getPublicCharacters())
      .then((r) => {
        if (!alive.current) return;
        // 絵の無い人は図鑑に出せない（マスが空く）。数にも入れない
        setChars(inOrder((r?.characters ?? []).filter((c) => c.plain?.sizes?.["128"])));
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

  return { chars, read, reload: () => load(true) };
}
