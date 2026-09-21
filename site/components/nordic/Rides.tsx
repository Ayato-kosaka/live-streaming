import Icon, { type IconName } from "@/components/ui/Icon";
import Strong from "./Strong";
import type { Ride } from "@/content/nordic";

/**
 * その日の道のり。**1日の面の主役。**
 *
 * あやとの言葉（2026-09-21）:
 *
 * > この画面を通して、「旅の準備」の画面から「旅の振返り」の画面に責務を変えて欲しい。
 * > なので、実際に通ったルートや載せてくれた人などガッツリ。
 *
 * 旅が終わった日の面を開く人が知りたいのは、**誰が停まってくれたか**であって、
 * 何時に起きる予定だったかではない。だから縦の線を1本引いて、
 * **乗せてくれた人を1人ずつ、上から順に**並べる。
 *
 * ## 絵文字は出さない
 *
 * `Ride.mark` には目印の絵文字が入っているが、**画面には出さない**
 * （`docs/island-design.md` 1章。`content/*.ts` の絵文字は配信の OBS 側などで
 * 使うので消していないが、島の画面には1文字も置かない）。
 * 代わりに、**何で進んだかそのもの**を目印にする——車は「何台目」の数字、
 * バス・船・歩きは `Icon` の絵。目印が種類を言うので、絵文字より役に立つ。
 *
 * 絵は単色（`tone="ink"`）にしない。平らな単色を島の絵の隣に置くと、
 * そこだけ別の世界のものに見える（`docs/island-design.md` 2章）。
 *
 * ## バスと船は、細く
 *
 * その日の道のりではあるが、主役ではない。丸を小さく、線を細い点線にして、
 * **数えるのは車だけ**（`rideCount`）というデータ側の決まりを、見た目でも言う。
 */

/** 車以外の目印。**種類がそのまま絵になる。** */
const KIND_ICON: Record<"bus" | "ferry" | "walk", IconName> = {
  bus: "bus",
  ferry: "ferry",
  walk: "shoes",
};

/** 「どこから」「どこまで」の、あるほうだけを読める形にする。 */
function way(from?: string, to?: string) {
  if (from && to)
    return (
      <>
        {from} <span aria-hidden>→</span> {to}
      </>
    );
  if (from) return <>{from} から</>;
  if (to) return <>{to} まで</>;
  return null;
}

export default function Rides({ rides, count }: { rides: Ride[]; count: number }) {
  // 行が1つも無い日（動かない日）は、区画ごと出さない。
  // 「0台」も「まだありません」も書かない——**乗らなかったことは出来事ではない。**
  if (rides.length === 0) return null;

  return (
    <section className="panel paper ndrd" id="rides">
      <h2>
        その日の道のり
        {/* 車が1台も無い日（船だけの8日目）は数えない。
            「この日 0台」は、読んでも何も分からない数字になる。 */}
        {count > 0 && <em className="ndrd-n">この日 {count}台</em>}
      </h2>
      <ol className="ndrd-l">
        {rides.map((r, i) => {
          const kind = r.kind ?? "hitch";
          const w = way(r.from, r.to);
          return (
            <li key={i} className="ndrd-r" data-kind={kind}>
              {/* 目印は飾り。同じことを字でも言っている（「1台目」「バス」）ので、
                  読み上げには渡さない。 */}
              <span className="ndrd-pin" aria-hidden>
                {kind === "hitch" ? (
                  r.n
                ) : (
                  <Icon name={KIND_ICON[kind]} size={20} />
                )}
              </span>
              <div className="ndrd-b">
                {kind === "hitch" && r.n && <p className="ndrd-nth">{r.n}台目</p>}
                <p className="ndrd-who">{r.who}</p>
                {w && <p className="ndrd-way">{w}</p>}
                {/* `**…**` は「その一文がいちばん大事だから」囲んである。
                    記号ごと焼かずに太字にする（`Strong`）。 */}
                {r.note && (
                  <p className="ndrd-note">
                    <Strong t={r.note} />
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
