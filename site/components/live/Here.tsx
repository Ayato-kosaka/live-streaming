"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { firebaseDb } from "@/lib/firebase";
import { loadState } from "@/lib/liveStats";
import {
  HERE_BEAT_MS,
  HERE_COL,
  HERE_WRITE_MS,
  here,
  hereSpot,
} from "@/lib/here";
import { useAuth } from "@/lib/auth";

/**
 * 「いまここにいる」を置いてくる側（`docs/island-here.md`）。
 *
 * **どのページからも動く。** `/board` を読んでいる人は、島の掲示板のそばに立つ。
 * 島（`/`）にいるあいだは、その人が動かしているあやとの居場所をそのまま置く。
 * だから島を歩くと、他の人の画面でその絵が動く。
 *
 * ## ログインしていない人には、何も起きない
 *
 * 置いてこられるのはログインした人だけなので、`user` が無いあいだは
 * firebase/firestore も `/state` も取りにいかない。島に来る人のほとんどは
 * ログインしないので、そこに代金を乗せない。
 *
 * ## 出したくない人は、出さない
 *
 * 名前もアイコンも「出す」と言っていない人は、**居場所も置かない。**
 * 「いま見ている」は名前を出すより踏み込んだことなので、同じ同意より緩くできない。
 * 出してよいと言った人だけが `/state` の `residents` に載るので、
 * そこに自分の uid があるかどうかで決める（島の数字と同じ1回の読み込みで済む）。
 * 自分の姿は、置いてこなくても自分の画面には出る（`HereFolks`）。
 */
export default function Here() {
  const { user } = useAuth();
  const path = usePathname();
  /* ページを移るたびに firestore を読み直したくないので、いまのページは ref で渡す。
     置きにいくのは2秒に1回なので、切り替わりが1拍遅れて困ることはない。 */
  const pathRef = useRef(path);
  pathRef.current = path;

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    let stop = false;
    let timer = 0;
    /** 最後に置いた場所と時刻。同じ場所を置き直さないため */
    let lastX = NaN;
    let lastY = NaN;
    let lastAt = 0;
    let leave: (() => void) | null = null;
    let onVis: (() => void) | null = null;
    /** ログアウトしたとき・島から離れたときに、置いてきたものを消す */
    let erase: (() => void) | null = null;

    (async () => {
      const st = await loadState();
      // 出してよいと言った人だけ。載っていなければ、ここで終わり
      if (stop || !st?.residents?.some((r) => r.uid === uid)) return;
      const [db, fs] = await Promise.all([firebaseDb(), import("firebase/firestore")]);
      if (stop) return;
      const ref = fs.doc(db, HERE_COL, uid);

      const put = () => {
        /* 隠れているあいだは置かない。**タイマーは隠れても止まらない**
           （Chrome は1分に1回まで遅くするだけ）。ここで止めないと、
           裏に回したタブが1分おきに置き直して、その人はずっと島にいることになる。
           visibilitychange で1回消しても、次のタイマーがまた作る。 */
        if (document.visibilityState === "hidden") return;
        const at = pathRef.current.slice(0, 60);
        const p = here.pos.live ? here.pos : hereSpot(at, uid);
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        const now = Date.now();
        /* 指で動かすたびには書かない。**位置が変わったときだけ。**
           ただし動かないまま黙っていると 60秒で消えるので、その手前で1回置き直す。 */
        if (x === lastX && y === lastY && now - lastAt < HERE_BEAT_MS) return;
        lastX = x;
        lastY = y;
        lastAt = now;
        // 入るのはこの4つだけ。名前もアイコンも入れない（ルールでも弾いてある）
        fs.setDoc(ref, {at, x, y, seenAt: fs.serverTimestamp()}).catch(() => {
          /* 圏外や、ログインが切れたとき。次の2秒でまた試す */
        });
      };

      const gone = () => {
        lastX = NaN;
        lastY = NaN;
        lastAt = 0;
        fs.deleteDoc(ref).catch(() => {
          /* 消せなくても、60秒で読む側が無視する */
        });
      };

      // ページを離れたら消す。閉じるときの書き込みは届かないこともあるが、
      // 届かなくても 60秒で消える（読む側が古いものを出さない）
      leave = () => gone();
      erase = () => gone();
      onVis = () => {
        if (document.visibilityState === "hidden") gone();
        else put();
      };
      window.addEventListener("pagehide", leave);
      document.addEventListener("visibilitychange", onVis);
      timer = window.setInterval(put, HERE_WRITE_MS);
      put();
    })();

    return () => {
      stop = true;
      if (timer) clearInterval(timer);
      // ログアウトしたら、その場で消す。60秒待たせない
      if (erase) erase();
      if (leave) window.removeEventListener("pagehide", leave);
      if (onVis) document.removeEventListener("visibilitychange", onVis);
    };
  }, [uid]);

  return null;
}
