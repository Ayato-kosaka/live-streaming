"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isSkipped, loadImage, thumbIfHave } from "@/lib/cardImport";

/**
 * 取り込みの候補1枚の絵。**ヘッダー付きで取って、blob の URL で出す。**
 *
 * 置き場に合言葉を付けていないので、`<img src>` に口の URL を書いても
 * あやとの ID トークンが乗らず、出ない（`docs/card-import.md` 2章）。
 *
 * 一覧（`thumb`）は**画面に入ったものから**取る。数百枚を開いた瞬間に
 * 全部取りにいくと、いま見ている数枚が最後になる。
 * 取れなかったら、もう一度画面に入ったときに取り直す（覚えない）。
 */
export default function ImportImg({
  sha,
  thumb,
  w,
  h,
  alt = "",
  className,
  eager = false,
}: {
  sha: string;
  thumb: boolean;
  w?: number;
  h?: number;
  alt?: string;
  className?: string;
  /** 画面に入るのを待たずに取る（拡大・認識合わせ） */
  eager?: boolean;
}) {
  const { token } = useAuth();
  const box = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(eager);
  const [url, setUrl] = useState<string | null>(null);
  /* 本体を待つあいだ、一覧の絵が手元にあれば下に敷く（拡大を押した瞬間に白くしない） */
  const [under, setUnder] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  /** 取れなかった回数。増えるたびに取り直す（間隔を倍にしながら） */
  const [again, setAgain] = useState(0);
  /** いま画面に入っているか。取りに行く直前に見る */
  const inView = useRef(eager);

  useEffect(() => {
    if (eager) {
      inView.current = true;
      setSeen(true);
      return;
    }
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      inView.current = true;
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          inView.current = e.isIntersecting;
          if (e.isIntersecting) setSeen(true);
        }
      },
      /* 1画面ぶん先まで取っておく。送っても白いマスが並ばないように */
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!seen) return;
    let gone = false;
    setMiss(false);
    if (!thumb) {
      const t = thumbIfHave(sha);
      t?.then((u) => !gone && setUnder(u), () => {});
    }
    loadImage(sha, thumb, token, () => !gone && inView.current).then(
      (u) => {
        if (!gone) setUrl(u);
      },
      (e) => {
        if (gone) return;
        /* 画面の外へ流れていったので取らなかった。次に入ったらまた取る */
        if (isSkipped(e)) setSeen(false);
        else setMiss(true);
      },
    );
    return () => {
      gone = true;
    };
  }, [seen, sha, thumb, token, again]);

  /* 取れなかったものは、黙って取り直す。**押されるまで待たない**
     （`docs/island-misses.md` 決めごと9の4）。画面の外なら、入ったときに取る */
  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => {
      if (inView.current) setAgain((n) => n + 1);
      else setSeen(false);
    }, Math.min(2000 * 2 ** again, 30000));
    return () => clearTimeout(t);
  }, [miss, again]);

  const shown = url ?? under;
  return (
    <span
      ref={box}
      className={`cim-img${shown ? " is-on" : ""}${miss ? " is-miss" : ""}${className ? ` ${className}` : ""}`}
      style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined}
    >
      {shown && <img src={shown} alt={alt} draggable={false} decoding="async" />}
    </span>
  );
}
