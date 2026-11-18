"use client";

import { useState } from "react";
import Icon from "@/components/ui/IconCore";
import type { ImportItem } from "@/lib/cardImport";
import { cardWhen } from "./cards";
import ImportImg from "./ImportImg";

/**
 * 認識合わせ。**1枚ずつ「この写真をカードに入れますか？」**
 *
 * 機械が「採りそう・迷う・落としそう」を混ぜて選んだ写真（status `calib`）。
 * 答えは次の回からの選びかたに効く（`docs/card-import.md` 4章の6）。
 * 一覧より先に出すのは、ここで答えたぶんだけ一覧の外し作業が減るから。
 *
 * 押したら次へ進む。押し間違えたら「ひとつ前」で戻って答え直せる。
 */
export default function ImportCalib({
  items,
  onAnswer,
}: {
  /** 認識合わせの写真ぜんぶ（答えたものも含む。戻って答え直すため） */
  items: ImportItem[];
  onAnswer: (sha: string, a: "yes" | "no") => void;
}) {
  /* はじめは、まだ答えていない最初の1枚から */
  const [at, setAt] = useState(() => {
    const i = items.findIndex((x) => !x.calibAnswer);
    return i < 0 ? 0 : i;
  });
  const it = items[at];
  if (!it) return null;
  const done = items.filter((x) => x.calibAnswer).length;

  const pick = (a: "yes" | "no") => {
    onAnswer(it.sha, a);
    /* 次のまだの1枚へ。無ければ最後の1枚で止まる（親が一覧に切り替える） */
    const rest = items.findIndex((x, i) => i > at && !x.calibAnswer);
    if (rest >= 0) setAt(rest);
    else {
      const any = items.findIndex((x) => !x.calibAnswer && x.sha !== it.sha);
      if (any >= 0) setAt(any);
    }
  };

  return (
    <section className="panel paper cim-calib" aria-label="この写真をカードに入れますか">
      <h2>この写真をカードに入れますか？</h2>
      <div className="cim-calib-top">
        <div className="cim-calib-bar" aria-hidden>
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        <p className="cim-calib-n" aria-live="polite">
          {Math.min(done + 1, items.length)} / {items.length}
        </p>
      </div>
      <figure className="cim-calib-pic">
        <ImportImg key={it.sha} sha={it.sha} thumb={false} w={it.w} h={it.h} eager alt="" />
        <figcaption>{cardWhen(it.day)}</figcaption>
      </figure>
      {/* 先読み。次の1枚を答えた瞬間に出す */}
      <span className="cim-pre" aria-hidden>
        {items[at + 1] && <ImportImg sha={items[at + 1].sha} thumb={false} eager />}
      </span>
      <div className="cim-calib-row">
        <button
          className={`cim-btn is-no${it.calibAnswer === "no" ? " is-picked" : ""}`}
          onClick={() => pick("no")}
        >
          入れない
        </button>
        <button
          className={`cim-btn is-yes${it.calibAnswer === "yes" ? " is-picked" : ""}`}
          onClick={() => pick("yes")}
        >
          入れる
        </button>
      </div>
      {at > 0 && (
        <button className="cim-link" onClick={() => setAt(at - 1)}>
          <Icon name="left" size={14} />
          ひとつ前
        </button>
      )}
    </section>
  );
}
