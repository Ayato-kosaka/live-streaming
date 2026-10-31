import type { CSSProperties, ElementType, ReactNode } from "react";

import { cutLinks } from "@/lib/noteUrl";

/**
 * 視聴者さんが打った字を、**打ったまま**出す。
 *
 * ## なぜ要るのか
 *
 * HTML の既定（`white-space: normal`）は、改行を1つの空白に潰す。
 * 付箋も企画も、打つ欄は `<textarea>` なので**改行は来る。**
 * 箇条書きで書いてくれたものが、こちらの都合で1本の棒になる。
 * **書いてくれたものを、こちらが潰している**（`docs/island-misses.md` #83）。
 *
 * ## 素直に `pre-wrap` を当てるだけだと事故る
 *
 * - **長い1語であふれる。** URL や英数字の連なりは切れ目を持たないので、
 *   `pre-wrap` だけだと紙の外へ出ていく。`overflow-wrap: anywhere` を併せる
 *   （`break-word` ではなく `anywhere`。flex / grid の中で
 *   「最小の幅」を長い1語の幅にしないのは `anywhere` のほうだけ）
 * - **前後の空白と空行もそのまま出る。** 末尾に改行を3つ入れて送った人が
 *   いたら、3行ぶん紙が伸びる。溜まるものは背が変わらない形にする決まりが
 *   あるので（`docs/island-standards.md` 7章）、そこだけは整える
 *
 * ## どこまで整えて、どこから触らないか
 *
 * | すること | なぜ |
 * | --- | --- |
 * | `\r\n` `\r` を `\n` にそろえる | Windows から来たものが1行おきに空く |
 * | 前と後ろの空白・空行を落とす | 意味を持たない。紙の頭とお尻が間延びするだけ |
 * | 各行の**行末**の空白を落とす | 見えないのに、そこだけ余分に折り返す |
 * | 空行が2つ以上続いたら1つにする | 段落の切れ目は意味だが、5行の空きは意味ではない |
 *
 * **行の中の空白は1つも触らない。** 字下げも、語のあいだの全角空白も、
 * 書いた人が置いたもの。読みにくいと思っても、こちらが直すものではない。
 *
 * ## 打たれた URL は、押せるようにする
 *
 * あやと（2026-10-14）: 「付箋に url が貼られた場合は別タブ起動できるようにして欲しい」
 *
 * 付箋には**行き先を入れる欄が別にある**（`n.link`）。あちらは前から
 * 新しいタブで開く。**押せなかったのは本文のほう。** 欄があることを
 * 知らずに本文へ貼る人のほうが多くて、その字はただの黒い字だった。
 * 相手は押せると思って押し、何も起きない。
 *
 * 通すのは `http://` と `https://` だけ。`javascript:` や `data:` は
 * **頭で切って判じない**（空白やタブで姿を変えられる）。`new URL()` に
 * 解かせて `protocol` だけを見る——`Notes.tsx` の `okLink` と同じ考え。
 * 基準（第2引数）は渡さない。渡すと `/foo` が本物の URL に化ける。
 *
 * 札に付けるのは `noopener noreferrer`（開いた先からこちらを触らせない）と
 * `nofollow ugc`（**ここは誰でも書ける**ので、島を検索よけの踏み台にさせない）。
 *
 * **字は書き換えない。** URL をそのまま出す。`linkLabel` のように
 * 行き先の名前へ縮めるのは、行き先の欄（1枚に1つ、2048字まで）の話で、
 * 本文は120字しか入らないうえ、**前後の文と地続き**なので縮めると意味が切れる。
 *
 * ## 色と大きさは持たない
 *
 * 当てるのは「改行を残す」「長い1語を折る」の2つだけ。
 * 見た目は置かれた先の CSS がそのまま効く。
 */

/** 改行を残す。**当てるのはこの2つだけ。** */
const KEEP: CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

/** 打たれたままに整える。行の中の空白には触らない。 */
export function asWritten(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


export default function Wrote({
  t,
  as,
  className,
}: {
  /** 書いてくれた字。空・未定義なら何も出さない */
  t?: string | null;
  /** 包む札。既定は `span`（`<p>` や `<q>` の中に置きたいときはそのまま） */
  as?: ElementType;
  className?: string;
}) {
  const s = asWritten(String(t ?? ""));
  if (!s) return null;
  const Tag = (as ?? "span") as ElementType;
  const parts = cutLinks(s);
  return (
    <Tag className={className} style={KEEP}>
      {parts.map((p, i): ReactNode =>
        typeof p === "string" ? (
          p
        ) : (
          <a
            key={i}
            className="wr-url"
            href={p.href}
            target="_blank"
            /* `ugc` と `nofollow` は、ここが**誰でも書ける**ところだから。
               島を検索よけの踏み台にさせない */
            rel="noopener noreferrer nofollow ugc"
          >
            {p.href}
          </a>
        ),
      )}
    </Tag>
  );
}
