"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 打ったものを、送る前に端末へ残しておく。
 *
 * ## なぜ要るのか
 *
 * 旅の道具（写真・いまどこ）は、**ヒッチハイクの途中の、
 * 電波の悪いところで打つ。** 送信が失敗するのは事故ではなく前提で、
 * トンネルに入る・アプリが後ろに回されて再読み込みされる、も普通に起きる。
 *
 * そのときに消えていいのは通信だけで、打った字ではない。
 * 打つそばから `localStorage` に写しておいて、開き直したら続きから打てるようにする。
 * サーバーに入ったら消す。**残っている＝まだ送れていない、の印**にもなる。
 *
 * 端末の中だけに置く。誰かに見せるものではないので、サーバーには送らない。
 */
export function useDraft<T extends object>(
  key: string,
  empty: T,
): [T, (patch: Partial<T>) => void, () => void, (patch: Partial<T>) => void] {
  const [v, setV] = useState<T>(empty);
  /* 最初の読み出しが終わるまで書き戻さない。書き出しの前に
     空の値で上書きすると、開いた瞬間に下書きが消える。 */
  const ready = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV({ ...empty, ...(JSON.parse(raw) as T) });
    } catch {
      /* 読めない端末では、下書きが残らないだけ */
    }
    ready.current = true;
    // key が変わることは無い。empty は毎回作られるので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const put = useCallback(
    (patch: Partial<T>) => {
      setV((cur) => {
        const next = { ...cur, ...patch };
        if (ready.current) {
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
            /* 書けなくても打てる。落とさない */
          }
        }
        return next;
      });
    },
    [key],
  );

  /**
   * 島に入っている値を、**まだ1文字も打っていない欄にだけ**置く。
   *
   * ## `put` で置いてはいけない
   *
   * 島から読んだ値を `put` で入れていたころ、旅の道具（`TripPlace`）は
   * こう壊れていた。打ちかけの「ビャウィストク郊外の道の駅」が、開き直すと
   * 島の「ポーランド・カトヴィツェ」に戻り、**端末の控えまで島の値で
   * 上書きされていた。** 走っている車の中で打って、トンネルでタブが捨てられ、
   * 気づかずに送ると、島には古い場所が出る。
   *
   * 直した向きは2つ。
   *
   * 1. **そのときの値で決める。** `put` は渡された固まりをそのまま書くので、
   *    呼ぶ側が古い `v` を掴んでいても気づけない（`useCallback(…, [])` の
   *    中から呼ぶと、初回描画の空の値のまま固まる）。ここは `setV` の
   *    関数形で**そのときの値**を見るので、掴み方に左右されない。
   * 2. **端末には写さない。** 開いただけで控えが取られると、
   *    「控えが残っている＝まだ送れていない」の印が嘘になる。
   *    そのあと1文字でも打てば `put` が走って、そこから控えが取られる。
   */
  const seed = useCallback((patch: Partial<T>) => {
    setV((cur) => {
      let next: T | null = null;
      for (const k of Object.keys(patch) as (keyof T)[]) {
        const val = patch[k];
        if (val === undefined || (val as unknown) === "") continue;
        /* 打ちかけのある欄には触らない。**ここが「上書きしない」の全部。** */
        const has = cur[k] as unknown;
        if (has !== undefined && has !== null && has !== "") continue;
        next = next ?? { ...cur };
        next[k] = val as T[keyof T];
      }
      return next ?? cur;
    });
  }, []);

  /**
   * 送れたので、控えを片づける。**欄に出ている字はそのまま残す。**
   *
   * 消してしまうと、入れた直後に書き直したい人が打ち直しになる。
   * ここで消えるのは端末に残した控えだけなので、そのあとまた1文字でも
   * 打てば、その時点でまた控えが取られる（＝また送れていない、に戻る）。
   */
  const settle = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 消せなくても、次に開いたときに上書きされる */
    }
  }, [key]);

  return [v, put, settle, seed];
}

/**
 * いま電波が届いているか。
 *
 * **届いていないことを、押してから知らせない。** 押す前に言っておけば、
 * 打つだけ打って電波の来たところで送る、という使い方ができる。
 * `navigator.onLine` は「つながっている」を保証しないが、
 * 「切れている」はほぼ当たる。当たるほうだけ使う。
 */
export function useOnline(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => setOn(navigator.onLine !== false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return on;
}
