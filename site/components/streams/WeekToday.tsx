"use client";

import { useEffect, useState } from "react";
import { jstNow } from "@/lib/nightly";
import { DAYS } from "./days";

/**
 * 曜日の見出しと、**今日の列。**
 *
 * この帯は「今夜は、何をやってる日」という問いの下にあるのに、
 * 7つの見出しに付いていた印は土日のしるしだけで、**今日がどれか出ていなかった。**
 * 問いを立てておいて答えを出さないのは、いちばん悪い形（`docs/island-design.md` 5-3）。
 *
 * **今日は焼けない。** 静的書き出し（`output: "export"`）なので、ここで焼くと
 * ビルドした日の曜日が固定で出る。画面が出てから決める。
 * `useEffect` の前は印が付かないので、焼いた HTML と最初の描画は同じ。
 *
 * 曜日は**日本時間**で切る。配信が日本時間の22時からと決まっているので、
 * 端末の時計がどこの国に合っていても、島の言う「今夜」は日本時間の今夜。
 */
export default function WeekToday() {
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => {
    const j = jstNow(new Date());
    // 0=日 で返るので、月はじまりに直す
    setToday((new Date(Date.UTC(j.y, j.m - 1, j.d)).getUTCDay() + 6) % 7);
  }, []);

  return (
    <>
      {today != null && (
        <span className="wk-col" style={{ ["--i" as string]: today }} aria-hidden />
      )}
      <div className="wk-days">
        {DAYS.map((d, i) => (
          <span
            key={d}
            className={[i > 4 ? "is-end" : "", i === today ? "is-today" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {d}
            {i === today && <b>今夜</b>}
          </span>
        ))}
      </div>
    </>
  );
}
