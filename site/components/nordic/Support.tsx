"use client";

import { useFund } from "./fund";

/**
 * 応援。**面のいちばん下に、これだけの区画として置く。**
 *
 * ここは前まで、旅程の一日ずつに「足代の席」として混ぜてあった。
 * 旅の話とお金の話を1つの言い方に押し込んだせいで、どちらも読みにくくなった
 * （`docs/nordic-fund.md` 「捨てた設計」）。分ける。
 *
 * 出す数字は2つだけ。**いくら集まっているかと、何人が出したか。**
 *   - 誰がいくら出したかは出さない。順位表も作らない。出す人は60人しかいなくて、
 *     上位は常連で固定される。中央値320円が1万円の隣に並ぶと、320円が恥ずかしくなる
 *   - 目標に対するバーを出さない。目標額がまだ決まっていない（GitHub #107）し、
 *     届かない絵は「みんなが応えなかった」に見える
 *   - 1円も読めないときは、数字の行ごと消す。0円は「誰も出していない」に見える
 *     （`GET /island-api/fund` は、そのために 200 で 0 を返さず 503 を返す）
 */

const yen = (n: number) => `${n.toLocaleString()}円`;

export default function Support() {
  const f = useFund();
  if (!f) return null;
  if (f.people > 0) {
    return (
      <p className="nback-now">
        いままでに <b>{f.people}人</b> が、あわせて <b>{yen(f.total)}</b> 出してくれました。
      </p>
    );
  }
  return (
    <p className="nback-now">
      いままでに <b>{yen(f.total)}</b> 集まっています。
    </p>
  );
}
