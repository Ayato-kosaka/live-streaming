import { SrcLine } from "@/components/guidebook/parts";
import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import Dress from "./Dress";
import Photos from "./Photos";
import { KcSec } from "./Sec";
import Vehicles from "./Vehicles";

/**
 * 3 外装と内装。**キッチンカーの着せ替え（3D の置き場）→ 組の名前と内装の一行 → 車の候補の比較（札→窓）と買うか借りるか →
 * キッチンカーの実際の様子（本物の写真。撮った人と許諾）**（build-plan ①の4・あやとの答え「外装の4組」）。
 * 外装の組は、あやとが渡した絵と運営が描いた絵だけ（Q4）
 */
export default function Looks({ b, drawn }: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  return (
    <KcSec b={b} s="look">
      <h3 className="gb-sub" id="dress">
        {b.subs.dress}
      </h3>
      <Dress b={b} drawn={drawn} />
      <ul className="kc-looks">
        {b.looks.map((l) => (
          <li key={l.id} id={`look-${l.id}`}>
            <h4 className="kc-look-n">{l.name}</h4>
            <p>{l.lead}</p>
            <p className="kc-look-in">
              <b>{b.ui.interior}</b>
              <span>{l.interior.name}</span>
            </p>
            <p>{l.interior.lead}</p>
            {l.interior.src.length > 0 && <SrcLine src={l.interior.src} of={l.interior.name} />}
          </li>
        ))}
      </ul>
      <Vehicles b={b} drawn={drawn} />
      <Photos b={b} />
    </KcSec>
  );
}
