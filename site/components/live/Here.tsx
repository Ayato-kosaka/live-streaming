"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { HERE_BEAT_MS, HERE_WRITE_MS, here, hereSpot } from "@/lib/here";
import { dropHere, putHere } from "@/lib/hereRest";
import { loadState } from "@/lib/liveStats";
import { useAuth } from "@/lib/auth";

/**
 * 「いまここにいる」を置いてくる側（`docs/island-here.md`）。
 *
 * **どのページからも動く。** `/board` を読んでいる人は、島の掲示板のそばに立つ。
 * 島（`/`）にいるあいだは、その人が動かしているあやとの居場所をそのまま置く。
 * だから島を歩くと、他の人の画面でその絵が動く。
 *
 * ## Firestore の SDK を落とさない
 *
 * 置くのは REST（`lib/hereRest.ts`）。`firebase/firestore` を取りにいくと
 * それだけで 590KB。ここでやるのは2秒に1回、4つの値を置くだけなので、
 * その塊は要らない。ルールは REST にも同じものが効く。
 *
 * ## ログインしていない人には、何も起きない
 *
 * 置いてこられるのはログインした人だけなので、`user` が無いあいだは
 * `/state` も取りにいかない。島に来る人のほとんどはログインしないので、
 * そこに代金を乗せない。
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
  const { user, token } = useAuth();
  const path = usePathname();
  /* ページを移るたびに名簿を読み直したくないので、いまのページは ref で渡す。
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

      const put = async () => {
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
        // 鍵はここで取る。取れているあいだは通信が起きない（手元で使い回される）
        const t = await token();
        if (stop || !t) return;
        // 入るのはこの4つだけ。名前もアイコンも入れない（ルールでも弾いてある）
        await putHere(uid, at, x, y, t);
      };

      const gone = async () => {
        lastX = NaN;
        lastY = NaN;
        lastAt = 0;
        const t = await token();
        if (t) await dropHere(uid, t);
      };

      // ページを離れたら消す。閉じるときの書き込みは届かないこともあるが、
      // 届かなくても 60秒で消える（読む側が古いものを出さない）
      leave = () => void gone();
      erase = () => void gone();
      onVis = () => {
        if (document.visibilityState === "hidden") void gone();
        else void put();
      };
      window.addEventListener("pagehide", leave);
      document.addEventListener("visibilitychange", onVis);
      timer = window.setInterval(() => void put(), HERE_WRITE_MS);
      void put();
    })();

    return () => {
      stop = true;
      if (timer) clearInterval(timer);
      // ログアウトしたら、その場で消す。60秒待たせない
      if (erase) erase();
      if (leave) window.removeEventListener("pagehide", leave);
      if (onVis) document.removeEventListener("visibilitychange", onVis);
    };
    // token は useCallback で固定されているが、ここが組み直る理由にはしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return null;
}
