import Link from "next/link";

import { Picture, jpDate } from "@/components/guidebook/parts";
import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";
import { travelPage } from "@/content/travel";

import { KcSec, SceneLink } from "./Sec";

/**
 * 1 ルートと景色。**線だけの絵地図**（近づいてから読む。`LateArt`）・添える字「イメージ。まだ決まっていない」・あやとの例
 * （案内鳥の地の文。「」で引かない。日付つき・リンクなし）・島に面の在る国の札（無い国は書き出しで止める。`travelPage`）・
 * 景色5枚（4:3・縦1列。題と一行と、場面を持つものだけ場面へのリンク）。
 * 線には日付・季節・長さを付けない（決まっていない時期を約束しない。#1418 本文3章）
 */
export default function Route({ b, drawn }: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  const places = b.route.countries.map((slug) => travelPage(slug));
  return (
    <KcSec b={b} s="route" lead={b.side.route}>
      {drawn.map && (
        <figure className="kc-map kc-late" data-gb-late="">
          <Picture pic={drawn.map} sizes="(min-width: 720px) 640px, 100vw" ratio={drawn.map.w && drawn.map.h ? `${drawn.map.w} / ${drawn.map.h}` : "4 / 5"} />
        </figure>
      )}
      <p className="kc-plan">{b.route.plan.text}</p>
      <p className="kc-when">
        <time dateTime={b.route.plan.date}>{jpDate(b.route.plan.date)}</time>
      </p>
      {places.length > 0 && (
        <ul className="kc-chips">
          {places.map((p) => (
            <li key={p.slug}>
              <Link prefetch={false} href={p.href}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ol className="kc-views">
        {b.views.map((v) => (
          <li key={v.id} id={`view-${v.id}`}>
            {drawn.views[v.id] && (
              <span className="kc-late" data-gb-late="">
                <Picture pic={drawn.views[v.id]} sizes="(min-width: 640px) 600px, 100vw" ratio="4 / 3" />
              </span>
            )}
            <h3 className="kc-view-t">{v.title}</h3>
            {v.lead && <p className="kc-view-l">{v.lead}</p>}
            {v.scene.v && <SceneLink s={v.scene} of={v.title} />}
          </li>
        ))}
      </ol>
    </KcSec>
  );
}
