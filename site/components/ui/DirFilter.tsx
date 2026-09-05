"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 「島のなか ぜんぶ」の絞り込み。
 *
 * ## React に一覧を持たせない
 *
 * 行き先は94ある。ここで配列を持って `map` すると、94件ぶんの文字が
 * **サーバの HTML とブラウザの束の両方に入る**（静的書き出しなので、
 * 束のほうは丸ごと無駄）。一覧はサーバで刷ってしまい、
 * ここは入力欄だけを持って、当たらなかった行に `hidden` を立てる。
 * `docs/island-design.md` 3章「動きは React の外で」と同じ考えかた。
 *
 * ## 表示を切るのは `hidden` 属性で
 *
 * `style.display` を書くと、あとから CSS で並べ直すときに勝ってしまう。
 * 属性なら CSS 側の都合と喧嘩しない。
 *
 * ## 見つからなかったとき
 *
 * 「0件」で終わらせない（`docs/island-world.md` 4.1）。
 * 何を打ったら当たるかを1つ書いて、空にする板を置く。
 */
export default function DirFilter({ total }: { total: number }) {
  const box = useRef<HTMLInputElement>(null);
  const [hit, setHit] = useState(total);
  const [word, setWord] = useState("");

  // 入力のたびに DOM を舐める。94行なので、絞り込みに要る時間は1ミリ秒に満たない。
  useEffect(() => {
    const w = word.trim().toLowerCase();
    let n = 0;
    document.querySelectorAll<HTMLElement>("[data-q]").forEach((el) => {
      const on = !w || (el.dataset.q ?? "").includes(w);
      el.hidden = !on;
      if (on) n++;
    });
    // 1行も残らなかった棚は、見出しごと引っ込める。
    // 名前だけの棚が並んでいると「あるのに出てこない」と読まれる。
    document.querySelectorAll<HTMLElement>(".dxs").forEach((sec) => {
      sec.hidden = !sec.querySelector("[data-q]:not([hidden])");
    });
    setHit(n);
  }, [word]);

  return (
    <div className="dxq">
      <label className="dxq-lab" htmlFor="dxq">
        名前でしぼる
      </label>
      <div className="dxq-box">
        <input
          id="dxq"
          ref={box}
          type="search"
          className="dxq-in"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="コロッケ / ジョージア / サウナ"
          autoComplete="off"
          enterKeyHint="search"
        />
        {word && (
          <button type="button" className="dxq-clear" onClick={() => { setWord(""); box.current?.focus(); }}>
            けす
          </button>
        )}
      </div>
      <p className="dxq-n" role="status">
        {word ? `${hit} / ${total}` : `ぜんぶで ${total}`}
      </p>
      {hit === 0 && (
        <div className="blank">
          <b>その名前の紙は無いみたい</b>
          <p>国の名前・料理の名前・企画の名前で当たるよ。「ジョージア」「うどん」など。</p>
          <button type="button" className="blank-go" onClick={() => { setWord(""); box.current?.focus(); }}>
            ぜんぶ出す
          </button>
        </div>
      )}
    </div>
  );
}
