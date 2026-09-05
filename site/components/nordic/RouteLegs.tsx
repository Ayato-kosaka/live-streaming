import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Fold from "@/components/ui/Fold";
import { Mark } from "./Marks";
import Signpost from "./Signpost";
import { Fare, Tie } from "./Carry";
import { FareMark, LogMark, PostMark } from "./Seats";
import { FARE_POUR, NORDIC_LOG, ROUTE, nordicCountry, type Leg } from "@/content/nordic";

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
 *   起きたこと      … 越えたあとに手で入れる（`content/nordic.ts` の `NORDIC_LOG`）
 *
 * 3つめは旅が終わってから入るので、出発前は空。空なら席そのものを出さない。
 * これが入って、区間カードは「出した人 / 言った人 / 実際に起きたこと」の3層になる。
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
        const log = NORDIC_LOG[l.id];
        return (
          <Fold
            key={l.id}
            title={
              <span className={`rleg-h ${m.cls}`} data-leg={l.id}>
                <Mark art={l.art} size={38} className="rleg-art" />
                <span className="rleg-way">
                  {/* 矢印は <i> にしない。`ui.css` の `.fold[open] > summary .fold-t i`
                      が「開いたら要約の一行を消す」ために i を消すので、
                      開いた区間だけ矢印が消えていた。 */}
                  {l.from} <span className="rleg-arrow" aria-hidden>→</span> {l.to}
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
            <p className="rleg-acts">
              {c && (
                <Link className="rleg-go" href={`/nordic/${c.slug}`}>
                  {c.name}で行くところを見る
                  <Icon name="right" size={14} />
                </Link>
              )}
              {/* 地図はこの面のずっと上にあるので、開けたままここから戻れるようにする。
                  開いているあいだ、その区間の線には帯が敷いてある（`Carry.tsx` の
                  `MapSync`）ので、上がるとどこの話だったかが分かる。 */}
              <a className="rleg-go" href="#map">
                地図で見る
                <Icon name="right" size={14} />
              </a>
            </p>

            {/* いま、この区間がどこまでつながっているか。決まりの説明ではなく、
                いまの状態を言う。埋まると文が変わる。 */}
            <Tie
              leg={l.id}
              needsFare={!!l.fare}
              cost={l.fare?.yen}
              before={pour.before}
              reach={pour.reach}
            />

            {/* 起きたこと。越えた区間にだけ出る。
                席の順は、そこがもう過ぎた区間なら「起きたこと」がいちばん上。
                これから行く区間の話（道しるべ・足代）より、
                実際に起きたことのほうが読みたいものになる。 */}
            {log && (
              <div className="rleg-seat">
                {/* 日付は見出しの外に出す。紙の見出しは蛍光ペンを字の下に敷くので、
                    h3 の中に入れると日付まで帯の中に入ってしまう。 */}
                <div className="rleg-seath-row">
                  <h3 className="rleg-seath">
                    <LogMark />
                    <span>起きたこと</span>
                  </h3>
                  <time className="rleg-when" dateTime={log.date}>
                    {Number(log.date.slice(5, 7))}月{Number(log.date.slice(8, 10))}日
                  </time>
                </div>
                <p className="rleg-log">{log.body}</p>
                {log.video && (
                  <a
                    className="rleg-go"
                    href={`https://www.youtube.com/watch?v=${log.video}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    その日の配信を見る
                    <Icon name="external" size={14} />
                  </a>
                )}
              </div>
            )}

            {/* 道しるべ。この区間で何をしてほしいか。
                言葉が1つも無い区間は、あやとがそこを走るだけの区間になる。 */}
            <div className="rleg-seat">
              <h3 className="rleg-seath">
                <PostMark />
                <span>道しるべ</span>
              </h3>
              <Signpost leg={l.id} ask={l.ask} />
            </div>

            {/* 足代。越えるのに要るもの1つに紐づける。
                お金の要らない区間（寄り道）には、この席そのものを置かない。 */}
            {l.fare && (
              <div className="rleg-seat">
                <h3 className="rleg-seath">
                  <FareMark />
                  <span>足代</span>
                </h3>
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
