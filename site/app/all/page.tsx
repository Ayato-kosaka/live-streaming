import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import DirFilter from "@/components/ui/DirFilter";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import { DEST_COUNT, SHELVES } from "@/content/directory";
import AllIsleRow from "@/components/chain/AllIsleRow";
import { ISLE_ROW } from "@/components/chain/route";
import Say, { SayRoom } from "@/components/ui/Say";

export const metadata: Metadata = {
  title: "島のなか ぜんぶ",
  description:
    "島にある紙を、ぜんぶ1枚に並べました。名前を打つと絞れます。",
};

/**
 * 島のなか ぜんぶ。
 *
 * ## 何のための面か
 *
 * 「あの話どこだっけ」から2タップで着くための面。
 * どの面の上にもこの面への口が1つあるので、
 * **ここが全部の面のあいだの乗り換え駅になる**（口 → この面 → 行き先 で2タップ）。
 *
 * ## 板を1枚ずつ積まない
 *
 * 94行を厚みのあるカードで並べると、板が94枚積み重なる
 * （`docs/ac-reference.md` 7章が禁じている形）。
 * `docs/island-design.md` 3章の例外どおり、**一面ぜんぶ押せる並び**なので
 * 1行ずつに厚みを付けず、罫だけで区切る。押せないものを1行も混ぜない。
 *
 * ## 絞り込みは字だけ
 *
 * 種類のボタンを並べると、この面そのものが探しものになる。
 * 打った字が名前・添え書き・slug・英語名のどれかに当たれば残る、の1本にした。
 * 一覧はここ（サーバ）で刷って、ブラウザへ行くのは入力欄だけ（`DirFilter`）。
 *
 * ## 棚は畳む。開けておくのは先頭の1つだけ
 *
 * 素で並べると 390px で 10,473px ＝ **12.4画面**あった。
 * 棚が9つあるのに、**何の棚があるかを見るだけで12画面送らされる。**
 * 「全部ある」が見えていたのではなく、**端から端まで送らないと見えなかった。**
 *
 * 畳むと9つの見出しが1画面に収まって、棚ごとの枚数も並ぶ。
 * 「全部ある」はここで見える。開けておくのは先頭（島のなか）だけ
 * （`docs/island-design.md` 4章）。
 *
 * **2タップは壊れない。** 名前が分かっているときの道は絞り込み欄で、
 * 打つと当たった棚がひとりでに開く（`components/ui/DirFilter.tsx`）。
 * 畳んだのは「どこにあるか分からないから眺める」ほうの道で、
 * そちらは**まず棚を選ぶ**のが本来の形。
 */
export default function AllPage() {
  return (
    <PageShell atAll crumbs={[{ label: "島のなか ぜんぶ" }]}>
      <PageHead
        mark={<Icon name="signpost" size={64} />}
        title="島のなか ぜんぶ"
        lead={`島にある紙、${DEST_COUNT}枚。ここからどこへでも1回で行ける。`}
      />

      <DirFilter total={DEST_COUNT} />

      <div className="folds">
        {SHELVES.map((s, i) => (
        /* 絞り込みは棚ごと引っ込めるので、`.dxs` の囲みは畳みの外に残す
           （`components/ui/DirFilter.tsx`）。畳みを `.dxs` ごと引っ込めると、
           中身が当たっていない棚だけが消える。 */
        <section className="dxs" key={s.id} id={s.id}>
          {/* 枚数を見出しの右に出す。畳んだときに読むのはここなので、
              「何の棚が、いくつ」が見出しだけで揃う */}
          <Fold title={s.title} note={`${s.items.length}枚`} open={i === 0}>
          {/* 棚の見出しの下の1行。「配信の型」の棚だけ旅かどうかで言い方が変わり
              （`content/directory.ts` の `say("typesLong")`）、素の `Say` だと
              焼いた HTML は空白1文字ぶんしか取らないので、画面が出た瞬間に
              1→2行へ折れて棚が 28.26px 伸びていた（`docs/island-misses.md` #152）。
              印の付いていない棚は写しが本文と同じ1つになるだけで、背は動かない。 */}
          <SayRoom className="muted" t={s.note} />
          <ul className="dxl">
            {s.items.map((d) => (
              <li key={d.href} data-q={d.q}>
                {/* 章の島の行だけ、行き先を画面が出てから引き直す。
                    **いまいる島はトップそのもの**（`docs/island-atlas.md` 7章）で、
                    どれがいまいる島かは日付で変わる。焼いたままだと、旅に出た日から
                    ここだけが `/island/<章>` の薄い面へ案内しつづける
                    （`components/chain/AllIsleRow.tsx`）。 */}
                {ISLE_ROW[d.href] ? (
                  <AllIsleRow slug={ISLE_ROW[d.href]} name={d.name} note={d.note} />
                ) : (
                  <Link className="dx" href={d.href} prefetch={false}>
                    <span className="dx-body">
                      <b>{d.name}</b>
                      <i><Say t={d.note} /></i>
                    </span>
                    <Icon name="right" size={15} className="dx-go" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          </Fold>
        </section>
        ))}
      </div>
    </PageShell>
  );
}
