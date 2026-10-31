"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { SPOTS, spotOfPath } from "../island/layout";

/**
 * 看板の札6つ（900px から上でだけ出る帯）。
 *
 * **いまその面にいる札だけ朱枠**（`.ih-link.is-on`。`app/css/pages.css`）。
 * 砂浜の「いま居る場所」と同じことを言う印なので、**同じ式から引く**
 * （`layout.ts` の `spotOfPath`）。
 *
 * 前はここも面から `current` を受け取っていた。砂浜と帯で同じ値を
 * 同じ経路で受けていたので、面が渡し忘れると**上と下が揃って消えた**
 * （#718）。いまはどちらも道から引くので、渡す口そのものが無い。
 *
 * 札を別ファイルにしたのは、ここだけ画面側で道を読むから。看板の残り
 * （島へ戻る板・いまどこ・自分のアイコン）は焼いたまま出す。
 *
 * ## 絵は `<img>` ではなく、CSS の地にする（2026-10-14）
 *
 * この帯は **900px から下では `display: none`**（`app/css/pages.css`）。
 * それでも `<img src>` は**消えている札のぶんまで落ちてくる。**
 * `display: none` は絵の取り寄せを止めない。
 *
 * そのうえ React は、最初に書き出した `<img>` を見て `<head>` に
 * `<link rel="preload" as="image">` を**6本**足す。先読みは CSS より先に
 * 走るので、「どうせ隠れる」ことが決まる前に、いちばん高い優先度で取りに行く。
 *
 * 実測（幅390・dpr2・送らずに静まるまで。`tools/sprites/firstload.mjs`）:
 * tent 6,510 / hut-ayato 7,700 / tower-studio 5,534 / hut-workshop 11,360 /
 * signpost-flags 7,390 / signboard 8,466 = **45.9KB**。
 * これが**島の面ぜんぶ（136面）**の最初の1画面に乗っていた。
 * スマホの人は1枚も見ないのに払っている。
 *
 * CSS の地（`background-image`）にすると、**箱が作られないかぎり取りに行かない。**
 * `display: none` の中では箱が作られないので、390px では0バイト。
 * 900px から上では今までどおり出る。絵は `alt=""` の飾りだったので、
 * 読み上げに出していたものも変わらない。
 */
export default function IslandNav() {
  const current = spotOfPath(usePathname());
  return (
    <nav className="ih-nav" aria-label="島のなか">
      {SPOTS.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          prefetch={false}
          className={`ih-link${current === s.id ? " is-on" : ""}`}
          /* 砂浜の印と同じことを、読み上げにも言う。朱枠は 900px から下では
             出ない（`display: none`）ので、そこでは帯ごと読み上げに出てこない */
          aria-current={current === s.id ? "page" : undefined}
        >
          {/* 飾りの絵。地にしてあるのは、隠れている幅で取り寄せさせないため
              （この上の但し書き）。名前は隣の字が言うので、ここは空のまま */}
          <i
            className="ih-ic"
            aria-hidden
            style={{ "--ih-ic": `url(/sprites/${s.icon}.webp)` } as CSSProperties}
          />
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
