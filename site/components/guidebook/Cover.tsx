import { GUIDE_LABEL, GUIDE_TOPICS } from "@/content/guidebook/heading";
import type { Drawn } from "@/content/guidebook/manifest";
import type { Guidebook } from "@/content/guidebook/types";

import { Credit, jpDate, widthOf } from "./parts";

/**
 * 1 表紙。街の絵（描いた表紙。無ければ借りた写真）＋国・街の名前・ひとこと。題を焼いていない絵は、**絵を先に、字をあとに**（下3分の1に重ねる）。
 *
 * 描いた表紙が縦と横の2枚あれば、狭い画面に縦を出す（`<picture>`）。行ったあとは「あやとが◯日いた」の札が乗る。
 *
 * **縦の表紙も、幅に合った1枚を読む**（小さい版と大きい版を `srcset` に並べる）。前は大きい版（1600px）だけを渡していて、
 * 390幅のスマホ（2倍の画面で 780px あれば足りる）でも 523KB を読み、最初の1画面の上限（`firstload.mjs`）を超えていた（#944）。
 *
 * ## 見出し（h1）は「〈街〉観光ガイド」
 *
 * h1 は「ソフィア観光ガイド」と、面が答える語（見どころマップ・やりたいこと・グルメ）。前は「ソフィア観光でやりたいこと8選」で、
 * 面の中身より狭い1節の名前だった（あやと 2026-11-18 #1228「この面は『やりたいこと8選』の面ではない」）。字は `content/guidebook/heading.ts`。
 *
 * ## 題を焼いた表紙（`drawn.coverTitled`）は、字を絵の上に重ねない
 *
 * 画像検索で押してもらうために、表紙の絵に街の名前・「観光ガイド」・キャッチを焼いてある（あやと 2026-11-18 #1228）。
 * その絵の上に h1 とキャッチを重ねると、同じ字が二重に見える。**焼いた絵はそのまま出し、h1 は絵の上に記事の題として置く**
 * （日本のブログの「記事の題 → アイキャッチ」の並び）。h1 は面が答える語までつないだ1つの文の大きさにして、
 * 絵の大きな字（街の名前）と張り合わせない——街の名前を大きく2回見せると、同じ字が二重に見える（390px で撮って確かめた）。
 * キャッチは絵の字と `alt` にあるので、面の字では繰り返さない。
 * 焼いていない表紙（借りた写真など）は、前のとおり絵の下3分の1に暗幕つきで重ねる
 */
export default function Cover({ g, drawn }: { g: Guidebook; drawn: Drawn }) {
  const wide = drawn.cover ?? g.cover;
  const tall = drawn.coverTall;
  const titled = drawn.coverTitled && !!drawn.cover;
  /* 小さい版の幅はファイル名から読む（`-800.webp`）。読めなければ大きい版だけを渡す（幅を当て推量で書かない） */
  const tallSmallW = tall?.small && tall.small !== tall.src ? widthOf(tall.small) : undefined;
  const tallSet = tall && (tallSmallW && tall.w ? `${tall.small} ${tallSmallW}w, ${tall.src} ${tall.w}w` : tall.src);
  const wideSmallW = wide.small && wide.small !== wide.src ? widthOf(wide.small) : undefined;
  /* 焼いた表紙の小さい版は 800px（ファイル名から読む）。借りた写真は前のとおり 500・960・1920 */
  const wideSet = titled
    ? wideSmallW && wide.w
      ? `${wide.small} ${wideSmallW}w, ${wide.src} ${wide.w}w`
      : undefined
    : wide.small && wide.small !== wide.src
      ? `${wide.small} 500w, ${wide.src} 960w, ${wide.big ?? wide.src} 1920w`
      : undefined;
  const days = g.stay ? Math.round((Date.parse(g.stay.to) - Date.parse(g.stay.from)) / 86400000) + 1 : 0;
  const stay = g.stay && (
    <span className="gb-cover-stay">
      あやとが{days}日いた（
      <time dateTime={g.stay.from}>{jpDate(g.stay.from)}</time>〜
      {/* 同じ年なら、終わりの日の年は書かない（札が2行に折れて、年だけが次の行に落ちる） */}
      <time dateTime={g.stay.to}>{g.stay.to.slice(0, 4) === g.stay.from.slice(0, 4) ? jpDate(g.stay.to).slice(5) : jpDate(g.stay.to)}</time>）
    </span>
  );
  const kicker = (
    <>
      <span className="gb-cover-k">{g.kicker}</span>
      <span className="gb-cover-local" lang={g.local.lang}>
        {g.local.text}
      </span>
    </>
  );
  return (
    <div className={`gb-cover-wrap${titled ? " is-titled" : ""}`} data-gb="cover">
      {titled && (
        <div className="gb-cover-head">
          <p className="gb-cover-kl">{kicker}</p>
          <h1>
            {g.name}
            {GUIDE_LABEL}
            {/* 読み上げと検索の字で「観光ガイド」と「見どころマップ」がつながらないように、空白を1つ（折り返しの外に置く） */}{" "}
            <span className="gb-cover-h1">{GUIDE_TOPICS}</span>
          </h1>
          {stay}
        </div>
      )}
      <div className="gb-cover">
        <picture>
          {tall && <source media="(max-width: 719px)" srcSet={tallSet} sizes="100vw" width={tall.w} height={tall.h} />}
          <img
            className="gb-cover-img"
            src={wide.src}
            srcSet={wideSet}
            sizes="(min-width: 960px) 900px, 100vw"
            width={wide.w}
            height={wide.h}
            alt={wide.kind === "illust" ? `イラスト：${wide.alt}` : wide.alt}
            /* 表紙の1枚だけは、下まで送る前に出す */
            loading="eager"
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
        </picture>
        {!titled && (
          <div className="gb-cover-body">
            {kicker}
            <h1>
              {g.name}
              <span className="gb-cover-h1">
                {GUIDE_LABEL} {GUIDE_TOPICS}
              </span>
            </h1>
            <p>{g.lead}</p>
            {stay}
          </div>
        )}
      </div>
      <div className="gb-cover-foot">
        <span>
          最終更新 <time dateTime={g.updated}>{jpDate(g.updated)}</time>
        </span>
        <Credit pic={wide} of={`${g.name}の表紙`} />
      </div>
    </div>
  );
}
