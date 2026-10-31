/**
 * **視聴者さんが打った字の中の URL を、押せる形に切り分ける。**
 *
 * あやと（2026-10-14）: 「付箋に url が貼られた場合は別タブ起動できるようにして欲しい」
 *
 * 付箋には行き先を入れる欄が別にある（`Notes.tsx` の `n.link`）。あちらは
 * 前から新しいタブで開く。**押せなかったのは本文のほう。** 欄があることを
 * 知らずに本文へ貼る人のほうが多くて、その字はただの黒い字だった。
 * 相手は押せると思って押し、何も起きない。
 *
 * **画面の部品（`Wrote.tsx`）から切り出してここに置いてある。**
 * 見張り（`site/selftest/noteurl_selftest.mjs`）が `tsc` で組み立てて
 * **この規則そのものを**回すため。字を写すと、本体を直した日に
 * 見張りだけ古い規則で緑になる。
 */

/**
 * 本文の中の URL を見つける。
 *
 * **終わりの約物を飲み込まない。** 「…は https://example.com です。」の
 * 句点まで URL に入れると、押した先が 404 になる。閉じ括弧も同じで、
 * 「（https://example.com）」の `）` は URL ではない。
 * だから**終わりに来られない字**を決めて、そこで切る。
 *
 * 逆に、URL の中に正しく出てくる記号（`?` `=` `&` `#` `/` `-` `_` `%`）は
 * 途中にある限り残す。`https://x.test/a?b=1&c=2#d` は1つの URL。
 */
const URL_RE = /https?:\/\/[^\s<>"'`、。，．！？「」『』（）【】〔〕〈〉《》…　]+/g;

/**
 * URL の終わりに来られない字。ここに当たったら、当たる手前までが URL。
 *
 * **和の約物は上の `URL_RE` のほうで外してある。** こちらが見るのは
 * **URL の途中には正しく出てくるが、終わりには来ない**半角の記号だけ
 * （`https://x.test/a.` の `.`、`(https://x.test/a)` の `)`）。
 *
 * 和の約物を「終わりだけ」で外そうとして1度落ちた。
 * 「https://example.com、すごい！」の読点は**終わりではない**ので、
 * `、すごい` まで URL に飲み込まれた。見張りの [3] がそこを見ている。
 */
const TRAIL = /[)\]}>,.;:'"!?]+$/;

/**
 * `http(s)` だけ通す。`Notes.tsx` の `okLink` と同じ考えかた。
 *
 * **いまは `URL_RE` が `https?://` しか拾わないので、ここまで来る字は
 * もう安全。つまりこれは2枚目の守り。** 消してよさそうに見えるが、残す:
 * `URL_RE` を広げた人（`ftp://` も拾いたい、など）が出たとき、
 * **1枚目しか無いと、その日から `javascript:` が通る。**
 *
 * **2枚目は、見張りから直に呼ぶ**（`noteurl_selftest.mjs` の [6]）。
 * `cutLinks` ごしにしか見ないと、1枚目が先に弾くので**この関数を
 * 丸ごと消しても緑のまま**になる。実際に対照でそれが起きて、
 * 「危ないものは押せない」が**通る理由が違っていた**ことが分かった。
 */
export function okHref(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 字を、そのままの字と「押せる URL」に切り分ける。
 *
 * **返すのは配列で、字は1文字も変えない。** つなぎ直すと元の字に戻る
 * （見張りがそこを見ている）。`white-space: pre-wrap` が効いたままに
 * なるよう、字のところは**ただの文字列**として置く。
 */
export function cutLinks(s: string): (string | { href: string }) [] {
  const out: (string | { href: string })[] = [];
  let at = 0;
  for (const m of s.matchAll(URL_RE)) {
    let href = m[0];
    const tail = href.match(TRAIL);
    if (tail) href = href.slice(0, -tail[0].length);
    if (!href || !okHref(href)) continue;
    const i = m.index ?? 0;
    if (i > at) out.push(s.slice(at, i));
    out.push({ href });
    at = i + href.length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}
