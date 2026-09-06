"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  REMOTE_PARAM,
  readRemote,
  sayRemoteView,
  type RemoteState,
} from "@/lib/remote";

/**
 * 島の遠隔操作の、**受ける側**（#165）。
 *
 * スマホ版 OBS が `https://…/?remote=<sessionId>` で開いた面を、
 * あやとの手元（`/me/remote`）から動かす。
 *
 * ## 合言葉が付いていないときは、いっさい動かない
 *
 * これは器（`app/layout.tsx`）に載っていて**全部の面に降りる**。
 * ふつうに島へ来た人の画面で1回でも聞きにいくと、21面ぶんの余計な通信が
 * 毎日積み上がる。`?remote=` が付いていない面では、
 * **タイマーも張らず、fetch も1回もしない。**
 *
 * ## 飛ばずに、送る
 *
 * あやとの指定（#165）:「スクロールビューされていって」。瞬間移動すると
 * 見ている人には何が起きたか分からないので、`scrollTo({behavior:"smooth"})`
 * で送る。面をまたぐときだけ `router.push`。
 *
 * **`viewBox` は書き換えない。** 島は SVG で、1ドットでも動かすと中身を
 * 全部描き直す（`CLAUDE.md`）。寄り引きは島が自分で持っている状態
 * （CSS の `transform`）を合図で切り替えるだけにしてある。
 *
 * ## 開いた瞬間に、前のボタンをやり直さない
 *
 * 入れ物には「最後に押したもの」が残っている。開いていきなりそれに従うと、
 * OBS を読み込み直すたびに画面が飛ぶ。**1回目は番号を控えるだけ**にして、
 * そこから増えたぶんにだけ従う。
 */
export default function IslandRemote() {
  const router = useRouter();
  const path = usePathname();
  /** `?remote=` の中身。付いていなければ null のまま、何も起きない */
  const [sid, setSid] = useState<string | null>(null);
  /** 左下に2秒だけ出す一言 */
  const [toast, setToast] = useState<string | null>(null);
  /** 最後に従った通し番号。ここから増えたものにだけ従う */
  const seen = useRef<number | null>(null);
  /** 面をまたぐ指示のとき、着いてから送るぶん */
  const pending = useRef<string | null>(null);
  /** いまいる面。合図を受け取る側は ref で見る（タイマーを張り直さないため） */
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    /* 書き出した面なので、URL は画面が出てから読む。`useSearchParams` を
       使うと Suspense で包まないと書き出しが落ちる（器に包みを1つ増やす
       ことになる）ので、ここは素の location から取る。 */
    const v = new URLSearchParams(window.location.search).get(REMOTE_PARAM);
    if (v && /^[0-9a-f]{32}$/.test(v)) setSid(v);
  }, []);

  /** 送る。**飛ばさない。** */
  const send = useCallback((to: string) => {
    const doc = document.documentElement;
    const smooth: ScrollBehavior = "smooth";
    if (to === "top") {
      window.scrollTo({ top: 0, behavior: smooth });
      return;
    }
    if (to === "bottom") {
      window.scrollTo({ top: doc.scrollHeight, behavior: smooth });
      return;
    }
    /* 相対で送る2つ。**割合では書けないぶん。** コントローラーは
       表示側がいまどこを見ているかを知らない。 */
    if (to === "down" || to === "far") {
      const by = window.innerHeight * (to === "down" ? 0.8 : 3);
      window.scrollBy({ top: by, behavior: smooth });
      return;
    }
    if (to.startsWith("#")) {
      const el = document.getElementById(to.slice(1));
      if (el) el.scrollIntoView({ behavior: smooth, block: "start" });
      return;
    }
    const r = Number(to);
    if (!Number.isNaN(r)) {
      /* 割合。**畳んである面では当てにならない。** `content-visibility: auto`
         の畳みは、画面の外にいるあいだ 68px と報告する（北欧の面で 1,100px
         違った）。配信で使うのは上の相対のほうで、ここは補助。 */
      window.scrollTo({
        top: r * Math.max(doc.scrollHeight - window.innerHeight, 0),
        behavior: smooth,
      });
    }
  }, []);

  /* ---- 聞きにいく。**合言葉が付いている面だけ。** ---- */
  useEffect(() => {
    if (!sid) return;
    let gone = false;
    let timer: ReturnType<typeof setTimeout>;
    let toastTimer: ReturnType<typeof setTimeout>;

    const show = (text: string) => {
      setToast(text);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setToast(null), 2000);
    };

    const follow = (s: RemoteState) => {
      if (s.view) sayRemoteView(s.view);
      if (s.at && s.at !== pathRef.current) {
        /* 面をまたぐ。**合言葉を落とさない。** 落とすと、行った先で
           この道具が黙って、次のボタンから効かなくなる。 */
        pending.current = s.scrollTo;
        router.push(`${s.at}?${REMOTE_PARAM}=${s.sessionId}`);
      } else if (s.scrollTo) {
        send(s.scrollTo);
      }
      if (s.showSay && s.say) show(s.say);
    };

    const tick = async () => {
      let wait = 2000;
      try {
        const r = await readRemote(sid);
        if (gone) return;
        wait = r.session.pollMs || 2000;
        if (seen.current === null) {
          // 1回目。**従わない。** 開き直すたびに画面が飛ぶのを止める
          seen.current = r.session.seq;
          if (r.session.showSay) show("遠隔操作に繋がりました");
        } else if (r.session.seq > seen.current) {
          seen.current = r.session.seq;
          follow(r.session);
        }
      } catch {
        /* 電波が切れただけかもしれない。**止めない。** 配信の途中で
           止まると、直す手立てが無い。少し間を空けてまた聞く。 */
        wait = 6000;
      }
      if (gone) return;
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => {
      gone = true;
      clearTimeout(timer);
      clearTimeout(toastTimer);
    };
  }, [sid, router, send]);

  /* ---- 面をまたいだあとの送り ----
     着いた先はまだ絵を並べている途中なので、1拍おいてから送る。 */
  useEffect(() => {
    const to = pending.current;
    if (!sid || !to) return;
    pending.current = null;
    const t = setTimeout(() => send(to), 700);
    return () => clearTimeout(t);
  }, [path, sid, send]);

  if (!sid || !toast) return null;

  /* 左下に小さく。**面の CSS には足さない。** ここは器に載っていて
     全部の面に降りるので、遠隔操作を使わない人の CSS まで太らせない。
     色と字は島のもの（`globals.css` の変数）をそのまま借りる。 */
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "12px",
        bottom: "12px",
        zIndex: 90,
        maxWidth: "calc(100vw - 24px)",
        padding: "6px 12px",
        border: "2px solid var(--frame-dark, #6b4f2a)",
        borderRadius: "999px",
        background: "var(--paper, #fffaf0)",
        color: "var(--ink, #3c2f22)",
        fontSize: "13px",
        fontWeight: 900,
        lineHeight: 1.5,
        boxShadow: "0 3px 0 var(--frame-dark, #6b4f2a)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {toast}
    </div>
  );
}
