"use client";

import { useEffect, useState } from "react";
import { DEPART } from "@/content/nordic";

/**
 * 出発までの残り。
 *
 * 静的書き出しなのでビルド時の値を焼くわけにいかない。
 * 画面が出てから毎秒数え直す。
 */
export default function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const t = new Date(DEPART).getTime();
    const tick = () => setLeft(t - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (left === null) {
    return (
      <div className="cdown" aria-hidden>
        <span className="cdown-load">出発まで</span>
      </div>
    );
  }
  if (left <= 0) {
    return (
      <div className="cdown is-gone">
        <b>もう出発しました</b>
        <i>いまどこにいるかは「いまのポスト」で</i>
      </div>
    );
  }
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <div className="cdown">
      <span className="cdown-label">クタイシ発まで</span>
      <span className="cdown-nums">
        <em>
          <b>{d}</b>日
        </em>
        <em>
          <b>{String(h).padStart(2, "0")}</b>時間
        </em>
        <em>
          <b>{String(m).padStart(2, "0")}</b>分
        </em>
        <em>
          <b>{String(sec).padStart(2, "0")}</b>秒
        </em>
      </span>
      <span className="cdown-when">2026年9月11日(金) 23:30 ジョージア時間 / 日本時間 9月12日 04:30</span>
    </div>
  );
}
