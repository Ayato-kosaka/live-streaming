import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import { Mark } from "./Marks";
import Signpost from "./Signpost";
import { Fare, Tie } from "./Carry";
import { FareMark, PostMark } from "./Seats";
import { FARE_POUR, ROUTE, nordicCountry, type Leg } from "@/content/nordic";

/**
 * 区間ごとの話であり、連れていくボード。
 *
 * 地図が「どこを通るか」を受け持つので、こちらは「その区間で何が起きるか」だけを持つ。
 * 全部開いたまま並べると縦に長くなりすぎるので、畳んでおく。
 * 閉じていても、手段と距離だけは見えるようにしてある。
 *
 * 見出しの左には、その区間の**絵**を置く。以前はどの区間にも同じ親指の印が
 * 並んでいて、10行ぜんぶが同じ見た目になっていた。実際は、深夜の空港で
 * 朝を待つ日と、十字架の丘を越える日と、夜行フェリーで寝る日は別の一日なので、
 * 絵も別にする（`Marks.tsx`）。
 *
 * 新しいセクションを足していないのは、区間カードがもう
 * 「10本の短い話」の器になっているから。ここに席を2つ置く
 * （`docs/nordic-fund.md` 提案1）。
 *
 *   足代（お金）  … その区間を越えるのに実際に要るもの1つ
 *   道しるべ（言葉）… その区間で何をしてほしいか
 *
 * **両方そろって、はじめてその区間はつながる。** どちらが欠けても半分。
 * 席の順は 足代 → 道しるべ にしない。**道しるべを先に置く。**
 * 道しるべは出発前にしか集まらないし、先にお金の席を見せると、
 * 「お金の話のページ」になってしまう。
 */

const MOVE: Record<Leg["move"], { label: string; cls: string }> = {
  fly: { label: "飛行機", cls: "is-fly" },
  hitch: { label: "ヒッチハイク", cls: "is-hitch" },
  ferry: { label: "フェリー", cls: "is-ferry" },
  walk: { label: "歩き", cls: "is-walk" },
};

export default function RouteLegs() {
  return (
    <div className="folds rlegs">
      {ROUTE.map((l, i) => {
        const m = MOVE[l.move];
        const c = l.enters ? nordicCountry(l.enters) : undefined;
        const pour = FARE_POUR[l.id];
        return (
          <Fold
            key={l.id}
            title={
              <span className={`rleg-h ${m.cls}`}>
                <Mark art={l.art} size={38} className="rleg-art" />
                <span className="rleg-way">
                  {l.from} <i aria-hidden>→</i> {l.to}
                </span>
              </span>
            }
            lead={`${m.label}${l.km ? ` ${l.km.toLocaleString()}km` : ""}${l.time ? ` / ${l.time}` : ""}`}
            note={
              c ? (
                <span className="rleg-enter">
                  <Flag slug={c.slug} size={17} />
                  {c.name}へ
                </span>
              ) : l.side ? (
                "寄り道"
              ) : undefined
            }
            open={i === 0}
          >
            {l.fixed && <p className="rleg-fixed">{l.fixed}</p>}
            {l.note && <p>{l.note}</p>}
            {l.stay && <p className="rleg-stay">泊まる: {l.stay}</p>}
            {c && (
              <Link className="rleg-go" href={`/nordic/${c.slug}`}>
                {c.name}で行くところを見る
                <Icon name="right" size={14} />
              </Link>
            )}

            {/* いま、この区間がどこまでつながっているか。決まりの説明ではなく、
                いまの状態を言う。埋まると文が変わる。 */}
            <Tie
              leg={l.id}
              needsFare={!!l.fare}
              cost={l.fare?.yen}
              before={pour.before}
              reach={pour.reach}
            />

            {/* 道しるべ。この区間で何をしてほしいか。
                言葉が1つも無い区間は、あやとがそこを走るだけの区間になる。 */}
            <div className="rleg-seat">
              <p className="rleg-seath">
                <PostMark />
                <b>道しるべ</b>
              </p>
              <Signpost leg={l.id} ask={l.ask} />
            </div>

            {/* 足代。越えるのに要るもの1つに紐づける。
                お金の要らない区間（寄り道）には、この席そのものを置かない。 */}
            {l.fare && (
              <div className="rleg-seat">
                <p className="rleg-seath">
                  <FareMark />
                  <b>足代</b>
                </p>
                <Fare
                  what={l.fare.what}
                  cost={l.fare.yen}
                  src={l.fare.src}
                  before={pour.before}
                  reach={pour.reach}
                />
              </div>
            )}
          </Fold>
        );
      })}
    </div>
  );
}
