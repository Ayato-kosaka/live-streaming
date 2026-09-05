"use client";

import { useEffect, useState } from "react";
import { getState, type IslandCurrent } from "@/lib/api";
import { NOW_FALLBACK } from "@/content/site";
import Icon from "@/components/ui/Icon";

export default function NowLive() {
  const [cur, setCur] = useState<IslandCurrent>({ ...NOW_FALLBACK });
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    getState()
      .then((s) => {
        if (!alive || !s.current) return;
        setCur((prev) => ({ ...prev, ...s.current } as IslandCurrent));
        setLive(true);
      })
      .catch(() => {
        /* API がまだ無い/落ちている時は焼き込みの値のまま出す */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <section className="panel now-hero">
        <img className="now-pin" src="/sprites/signpost.webp" alt="" />
        <b className="now-place">{cur.place}</b>
        <p className="now-word">{cur.word}</p>
        <span className="chip">
          <Icon name={live ? "live" : "clock"} size={13} />
          {live ? " 最新 " : " "}
          {cur.updatedAt?.replace(/-/g, "/")} 時点
        </span>
      </section>

      {cur.week?.length > 0 && (
        <section className="panel">
          <h2>今週やること</h2>
          <ul className="week">
            {cur.week.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
