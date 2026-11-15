import type { Drawn } from "@/content/guidebook/manifest";
import type { Guidebook } from "@/content/guidebook/types";

import { Credit, jpDate } from "./parts";

/**
 * 1 表紙。**絵を先に、字をあとに。** 街の絵（描いた表紙。無ければ借りた写真）＋国・街の名前・ひとこと。
 *
 * 描いた表紙が縦と横の2枚あれば、狭い画面に縦を出す（`<picture>`）。行ったあとは「あやとが◯日いた」の札が乗る。
 */
export default function Cover({ g, drawn }: { g: Guidebook; drawn: Drawn }) {
  const wide = drawn.cover ?? g.cover;
  const tall = drawn.coverTall;
  const days = g.stay ? Math.round((Date.parse(g.stay.to) - Date.parse(g.stay.from)) / 86400000) + 1 : 0;
  return (
    <div className="gb-cover-wrap" data-gb="cover">
      <div className="gb-cover">
        <picture>
          {tall && <source media="(max-width: 719px)" srcSet={tall.src} width={tall.w} height={tall.h} />}
          <img
            className="gb-cover-img"
            src={wide.src}
            srcSet={wide.small && wide.small !== wide.src ? `${wide.small} 500w, ${wide.src} 960w, ${wide.big ?? wide.src} 1920w` : undefined}
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
        {wide.kind === "illust" && <i className="gb-pic-tag">イラスト</i>}
        <div className="gb-cover-body">
          <span className="gb-cover-k">{g.kicker}</span>
          <h1>{g.name}</h1>
          <span className="gb-cover-local" lang={g.local.lang}>
            {g.local.text}
          </span>
          <p>{g.lead}</p>
          {g.stay && (
            <span className="gb-cover-stay">
              あやとが{days}日いた（
              <time dateTime={g.stay.from}>{jpDate(g.stay.from)}</time>〜<time dateTime={g.stay.to}>{jpDate(g.stay.to)}</time>）
            </span>
          )}
        </div>
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
