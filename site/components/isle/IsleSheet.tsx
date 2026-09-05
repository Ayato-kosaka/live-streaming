"use client";

import Link from "next/link";

import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/IconCore";
import { shortHref, shortThumb } from "@/content/shorts";
import type { IslePlaceSpec } from "./spec";

/**
 * 建物の中。
 *
 * あやとの言葉:「その中の**やぐらみたいな感じで**、この島で歩いた国とか、
 * この島で起きたこととか、この島の代表的な企画とかが見れて」。
 *
 * だから**押しても島から出ない。** 島の上に板が1枚開いて、その中に一覧が出る。
 * 島の外へ出るのは、その一覧の1つを押したときだけ。
 *
 * ## なぜ板か
 *
 * ここは島の中なので板（`docs/island-world.md` 1.5）。紙にすると
 * 「島から出て紙を拾った」ことになり、押した先がページなのか島なのか
 * 分からなくなる。**島の上に開くものは板。**
 *
 * ## 閉じかた
 *
 * 押すまで出ないし、閉じるまで消えない（`docs/island-design.md` 3-6）。
 * 島の吹き出しと同じで、うしろの暗幕を押しても閉じる。
 */
export default function IsleSheet({
  place,
  onClose,
}: {
  place: IslePlaceSpec;
  onClose: () => void;
}) {
  return (
    <div
      className="isle-sheet-wrap"
      data-ui
      onClick={(e) => {
        // うしろの暗幕を押したときだけ閉じる。板の中を押したときは閉じない
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="isle-sheet" role="dialog" aria-label={place.label}>
        <div className="isle-sheet-head">
          <img src={`/sprites/${place.icon}.webp`} alt="" width={44} height={44} />
          <span>
            <b>{place.label}</b>
            {place.note && <i>{place.note}</i>}
          </span>
          <button className="isle-sheet-x" onClick={onClose} aria-label="閉じる">
            <Icon name="close" size={16} />
          </button>
        </div>

        {place.facts && (
          <ul className="isle-facts">
            {place.facts.map((f) => (
              <li key={f.cap}>
                <b>
                  {f.n}
                  {f.unit && <span>{f.unit}</span>}
                </b>
                <i>{f.cap}</i>
              </li>
            ))}
          </ul>
        )}

        {/* ショート動画。**埋め込まない。**
            プレイヤーを31個並べると、板を開いた瞬間に外へ31本つなぎにいく。
            サムネイル1枚は 15KB で、しかも見えるまで取りにいかない（`loading="lazy"`）。

            **絵は縦。** YouTube が配っている 480×360 は、縦の絵を中心に置いて
            まわりをぼかしで埋めたもの。縦の枠に `object-fit: cover` で入れると、
            ぼかしの左右が落ちて**元の縦の絵だけ**が残る。

            題名は絵の中に焼かれているので、外では2行で止める。
            読み上げには `alt` で全文が渡る。 */}
        {place.shorts && (
          <ul className="isle-shots">
            {place.shorts.map((s) => (
              <li key={s.id}>
                <a href={shortHref(s.id)} target="_blank" rel="noopener noreferrer">
                  <img
                    src={shortThumb(s.id)}
                    alt={s.title}
                    width={480}
                    height={360}
                    loading="lazy"
                    decoding="async"
                  />
                  <b>{s.title}</b>
                  {/* 年は板の頭に書いてある（「2024年10月から12月まで」）ので、月日だけ。
                      「ヴェルサイユ・2024-11-05」は 107px の桁に入らず、年のほうが切れる */}
                  <i>{s.city ? `${s.city}・${md(s.date)}` : md(s.date)}</i>
                </a>
              </li>
            ))}
          </ul>
        )}

        {place.items && (
          <ul className="isle-list">
            {place.items.map((it) => (
              <li key={it.href + it.label}>
                {it.ext ? (
                  <a href={it.href} target="_blank" rel="noopener noreferrer">
                    <ItemBody item={it} />
                  </a>
                ) : (
                  <Link href={it.href} prefetch={false}>
                    <ItemBody item={it} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {place.more && (
          <Link className="isle-more" href={place.more.href} prefetch={false}>
            <span>
              <b>{place.more.label}</b>
              <i>{place.more.sub}</i>
            </span>
            <Icon name="right" size={16} />
          </Link>
        )}

        {place.href && (
          <Link className="isle-more" href={place.href} prefetch={false}>
            <span>
              <b>{place.label}のページへ</b>
              <i>島の外に出ます</i>
            </span>
            <Icon name="right" size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}

/** 2024-11-05 → 11/5 */
const md = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};

function ItemBody({ item }: { item: NonNullable<IslePlaceSpec["items"]>[number] }) {
  return (
    <>
      {item.flag && <Flag slug={item.flag} size={26} />}
      {item.icon && <img src={`/sprites/${item.icon}.webp`} alt="" width={34} height={34} loading="lazy" />}
      <span>
        <b>{item.label}</b>
        {item.sub && <i>{item.sub}</i>}
      </span>
      <Icon name="right" size={14} />
    </>
  );
}
