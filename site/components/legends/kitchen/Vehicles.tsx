import { Ext, Facts, Picture, SrcLine } from "@/components/guidebook/parts";
import Sheet from "@/components/guidebook/Sheet";
import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import { SceneLink } from "./Sec";

/** 車の候補の窓の id（`#kc-car-<id>` で直に開く） */
export const carSheet = (id: string) => `kc-car-${id}`;

/**
 * 車の候補の比較。**札→窓**（札は絵と名前と値段の幅、窓は値段の幅・免許・よいところ・弱いところと出どころ）と、買うか借りるか
 * （#1418 本文2章の5）。値段は掲載例の幅で、何の値段かを添える。絵が無いあいだは札に枠を出さない
 */
export default function Vehicles({ b, drawn }: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  const ui = b.ui.vehicle;
  return (
    <>
      <h3 className="gb-sub" id="vehicles">
        {b.subs.vehicles}
      </h3>
      <ul className="kc-cars">
        {b.vehicles.map((v) => (
          <li key={v.id}>
            <a href={`#${carSheet(v.id)}`}>
              {drawn.vehicles[v.id] && <Picture pic={drawn.vehicles[v.id]} sizes="(min-width: 640px) 300px, 45vw" ratio="4 / 3" />}
              <b>{v.name}</b>
              <i>{v.priceText}</i>
            </a>
          </li>
        ))}
      </ul>
      {b.vehicles.map((v) => (
        <Sheet key={v.id} id={carSheet(v.id)} kicker={b.subs.vehicles} title={v.name}>
          {v.said && (
            <figure className="kc-said">
              <blockquote>「{v.said.text}」</blockquote>
              <figcaption>
                <SceneLink s={v.said} of={v.name} />
              </figcaption>
            </figure>
          )}
          <Ext>
            <Facts
              rows={[
                { label: ui.price, text: v.priceText },
                { label: ui.license, text: v.license },
                { label: ui.good, text: v.good },
                { label: ui.weak, text: v.weak },
              ]}
            />
            <p className="kc-what">{v.price.what}</p>
            <SrcLine src={v.src} of={v.name} />
          </Ext>
        </Sheet>
      ))}
      <h4 className="kc-h4">{b.ui.buyOrRent}</h4>
      <ul className="kc-buy">
        {b.buyOrRent.map((x) => (
          <li key={x.id}>
            <b className="kc-buy-n">{x.name}</b>
            <Ext>
              <Facts
                rows={[
                  { label: b.ui.compare.price, text: x.price },
                  { label: ui.good, text: x.good },
                  { label: ui.weak, text: x.weak },
                ]}
              />
              <SrcLine src={x.src} of={x.name} />
            </Ext>
          </li>
        ))}
      </ul>
    </>
  );
}
