"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import Icon from "@/components/ui/IconCore";
import { STICKERS, stickerThumb, suzuriDesignHref } from "@/content/goods";

/**
 * あやとステッカーの図鑑（`/goods/stickers`）。
 *
 * あやとの言葉（2026-10-13）:
 *
 * > あやとステッカー無料は、増えてきたので、「住んでいる人」みたいに
 * > 個別ページが欲しい。そこで付箋も貼れる。
 *
 * > ステッカー毎に個別ページじゃなくて、あやとステッカーとして個別ページ一枚ね
 *
 * ## なぜ「一覧＋1枚」なのか
 *
 * 手本は住民図鑑（`components/live/FriendsWall.tsx`、`docs/ac-reference.md` 7章）。
 * **一覧は小さいマスをぎっしり、選んだ1枚だけが大きな紙になる。**
 * 何枚になっても縦は増えず、1枚あたりの中身は増やせる。
 *
 * この形でないと困るのは、**1枚について押せることが2つある**から。
 * 落とすのと、グッズの面へ出るの。`/goods` の升目は「マスぜんぶが1つの
 * 押しどころ」で持っていたので（`docs/island-design.md` 3-1）、
 * 2つ目を足すとマスの中に押しどころが2つできる。
 * 図鑑なら、一覧のマスは「選ぶ」1つだけ、押しどころは紙のほうに並ぶ。
 *
 * ## 字と形は、住民図鑑からそのまま借りる
 *
 * `.rzk-*` は `app/css/live.css` にある図鑑の型で、住民図鑑と
 * スタンプ帳（`components/streams/KitchenCatalog.tsx`）が同じものを着ている。
 * **ここで別の見た目を作らない**——同じ島の中で紙が3種類になる。
 * 絵の置きかただけ違う（住人は地面に立つので下寄せ、ステッカーは
 * 貼るものなので中寄せ。`app/goods/goods.css` の `.gsk-art`）。
 */
export default function StickerBook() {
  const [at, setAt] = useState(0);
  /** 送りで紙が差し替わったとき、目が迷子にならないよう題名へ焦点を戻す */
  const first = useRef(true);
  const head = useRef<HTMLParagraphElement>(null);
  const s = STICKERS[at];

  const go = (n: number) => {
    setAt((n + STICKERS.length) % STICKERS.length);
    if (!first.current) head.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    first.current = false;
  };

  return (
    <div className="rzk gsk">
      <div className="rzk-page">
        {/* **いま何枚目を見ているか**を、絵の上に出す。

            帳面の送り（`.rzk-pager`）が同じことを言っているが、あちらは
            一覧の升目のすぐ上——390px では画面を1つ送らないと出てこない。
            **一覧の面は「何がどれだけあって、いまどこを見ているか」が
            送らずに分かること**（`docs/island-standards.md` 7章・15章の読み方）。
            言い方は送りと1文字もそろえる（`◯ / 全部の数`）。 */}
        <p className="rzk-at">
          <b>{at + 1}</b> / {STICKERS.length}
        </p>

        {/* 題名の札は絵の上。テープで貼ったように少し傾ける（図鑑の型） */}
        <p className="rzk-tag" ref={head}>
          {s.name}
        </p>

        {/* 主役の絵。**面に並べるほう（`art`）を出す。**
            落とすのは元絵（`file`）で、押されたときだけ取りにいく。
            寸法を渡して場所を先に取る（`docs/island-standards.md` 7章）。 */}
        <div className="rzk-art gsk-art">
          <img key={s.id} src={s.art} alt="" width={s.w} height={s.h} />
        </div>

        <dl className="rzk-fields">
          <div className="rzk-wide rzk-take">
            <dt>持って帰る</dt>
            <dd>
              <div className="rzk-gets">
                {/* 落ちてくるのは元絵そのまま。`download` を付けるので、
                    押すと開かずに手元へ落ちる（`/goods` の升目と同じ） */}
                <a className="rzk-get" href={s.file} download={s.saveAs}>
                  <Icon name="download" size={14} />
                  おとす
                </a>
              </div>
              <i>印刷しても、画面に貼っても。</i>
            </dd>
          </div>

          {/* グッズ（あやと 2026-10-13「『グッズを買う』ボタンで…スズリ
              デザインページへの導線あると良い」）。

              **その絵のデザインが在る1枚にだけ出す**（`content/goods.ts` の
              `suzuri`）。無い絵では欄ごと出さない——「まだありません」と
              書くのは中の話（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。 */}
          {s.suzuri !== null && (
            <div className="rzk-wide">
              <dt>グッズにする</dt>
              <dd>
                <div className="rzk-gets">
                  {/* 島の外へ出る。印を付けて、新しいタブで開き、
                      こちらの窓もどこから来たかも渡さない（`/goods` の店と同じ作法） */}
                  <a
                    className="rzk-get gsk-out"
                    href={suzuriDesignHref(s.suzuri)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    グッズを買う
                    <Icon name="external" size={14} />
                  </a>
                </div>
                <i>押すと、島の外の店にうつる。</i>
              </dd>
            </div>
          )}

          {/* 貼れる先。**どの1枚も、カードに立たせて持って帰れる**
              （`components/cards/CardSheet.tsx` が `STICKERS` から選ばせている）。 */}
          <div className="rzk-wide">
            <dt>カードに貼る</dt>
            <dd>
              {/* **ここも厚みのある札にする。** 同じ欄の並びで、押せるものと
                  押せないものを見た目で割らない（`docs/island-design.md` 3-3）。
                  下線だけの字にしてみたが、上2つの札と並ぶと**押せない字**に見えた */}
              <div className="rzk-gets">
                <Link className="rzk-get" href="/cards" prefetch={false}>
                  カードをつくる
                  <Icon name="right" size={14} />
                </Link>
              </div>
              <i>配信のあった日の写真に、この1枚を立たせて。</i>
            </dd>
          </div>
        </dl>

        {/* 送り。住民図鑑の `.rzk-pager` と同じ役なので、同じ形 */}
        <nav className="rzk-pager" aria-label="ステッカー帳をめくる">
          <button type="button" onClick={() => go(at - 1)}>
            <Icon name="left" size={14} />
            まえの1枚
          </button>
          <span>
            <b>{at + 1}</b> / {STICKERS.length}
          </span>
          <button type="button" onClick={() => go(at + 1)}>
            つぎの1枚
            <Icon name="right" size={14} />
          </button>
        </nav>
      </div>

      {/* 一覧のマス。押すと上の紙が差し替わる。
          選んでいるものは塗りを変えず、細い枠だけで示す（ac-reference 7章 6）。 */}
      <div className="rzk-grid" role="tablist" aria-label="あやとステッカー">
        {STICKERS.map((x, i) => {
          /* **マスに出すのは小さい写し**（長辺160）。マスの中の絵は 390px の
             画面で 40.1px しかないのに、ここは上の紙と同じ 480px を出していた。
             13枚で 623.8KB——この面がスマホの最初の1画面で運ぶ量（903.3KB）の
             69% が升目だった（2026-10-15 実測）。

             住民図鑑も前からこの形（`FriendsWall.tsx` は一覧 128px /
             開いた1枚 640px）。**ステッカーだけが両方 480px だった。** */
          const t = stickerThumb(x);
          return (
            <button
              type="button"
              role="tab"
              aria-selected={i === at}
              aria-label={x.name}
              className={`rzk-cell${i === at ? " is-on" : ""}`}
              key={x.id}
              onClick={() => go(i)}
            >
              <span className="rzk-cell-no">{i + 1}</span>
              {/* 名前は札（`aria-label`）が持っているので、絵は飾り扱いにする */}
              <img src={t.src} alt="" loading="lazy" width={t.w} height={t.h} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
