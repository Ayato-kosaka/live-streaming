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
 *
 * ## 打ったら、当たった棚を開ける
 *
 * 棚は畳んである（`app/all/page.tsx`）。当たった行だけを残しても、
 * その行が**閉じた畳みの中にいたら1枚も見えない。**
 * 「コロッケ」と打って何も出てこない面になるので、
 * **当たりのある棚はこちらで開ける。**
 *
 * 消したら元に戻す。打つ前にどこを開けていたかを控えておいて、
 * 字が空になったところで戻す。戻さないと、一度打っただけで
 * 面が 12画面に開ききったまま残る。
 */
export default function DirFilter({ total }: { total: number }) {
  const box = useRef<HTMLInputElement>(null);
  /** 打ち始める前の、棚の開き具合。字が空に戻ったらここへ戻す */
  const before = useRef<boolean[] | null>(null);
  const [hit, setHit] = useState(total);
  const [word, setWord] = useState("");

  // 入力のたびに DOM を舐める。94行なので、絞り込みに要る時間は1ミリ秒に満たない。
  useEffect(() => {
    const w = word.trim().toLowerCase();
    /* **行ではなく行き先を数える。** 上の見出しが「島にある紙、◯枚」と
       名乗っているのは紙の数（`content/directory.ts` の `DEST_COUNT`）で、
       いまいる島の行は「島」の行と同じ `/` を指す（`chain/AllIsleRow.tsx`）。
       行を数えると、ぜんぶ当たる字を打ったときだけ「122 / 121」と出る。
       `href` は画面が出てから引き直されるので、**DOM から読む。** */
    const seen = new Set<string>();
    document.querySelectorAll<HTMLElement>("[data-q]").forEach((el) => {
      const on = !w || (el.dataset.q ?? "").includes(w);
      el.hidden = !on;
      if (on) seen.add(el.querySelector("a")?.getAttribute("href") ?? el.dataset.q ?? "");
    });
    const n = seen.size;
    // 1行も残らなかった棚は、見出しごと引っ込める。
    // 名前だけの棚が並んでいると「あるのに出てこない」と読まれる。
    const shelves: { fold: HTMLDetailsElement | null; hit: boolean }[] = [];
    document.querySelectorAll<HTMLElement>(".dxs").forEach((sec) => {
      const hitHere = !!sec.querySelector("[data-q]:not([hidden])");
      sec.hidden = !hitHere;
      shelves.push({ fold: sec.querySelector<HTMLDetailsElement>("details.fold"), hit: hitHere });
    });
    if (w) {
      // 打ち始めた1回だけ、いまの開き具合を控える
      if (!before.current) before.current = shelves.map((x) => !!x.fold?.open);
      shelves.forEach((x) => { if (x.fold && x.hit) x.fold.open = true; });
    } else if (before.current) {
      const was = before.current;
      shelves.forEach((x, i) => { if (x.fold) x.fold.open = was[i] ?? false; });
      before.current = null;
    }
    setHit(n);
  }, [word]);

  return (
    <div className="dxq">
      {/* 見出しは**札ではなく、ただの字**にする。
          `<label for>` にしておくと、平らに見える 338x20px の字が押しどころに
          なる。島は「押せるものは板、押せないものは平ら」で分けている
          （`docs/island-world.md` 3.4）ので、平らな字が押せるのは嘘になるし、
          20px は指では狙えない（`docs/island-design.md` 3-2 の 48px 割れ）。
          読み上げには `aria-labelledby` で同じ名前が渡る。書く欄そのものは
          48px あるので、指はそちらを押す。 */}
      <span className="dxq-lab" id="dxq-lab">
        名前でしぼる
      </span>
      <div className="dxq-box">
        <input
          id="dxq"
          aria-labelledby="dxq-lab"
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
