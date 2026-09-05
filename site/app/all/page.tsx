import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import DirFilter from "@/components/ui/DirFilter";
import Icon from "@/components/ui/Icon";
import { DEST_COUNT, SHELVES } from "@/content/directory";

export const metadata: Metadata = {
  title: "島のなか ぜんぶ",
  description:
    "島にある紙を、ぜんぶ1枚に並べました。名前を打つと絞れます。どのページの上からでもここへ来られます。",
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
 */
export default function AllPage() {
  return (
    <PageShell atAll crumbs={[{ label: "島のなか ぜんぶ" }]}>
      <PageHead
        mark={<Icon name="signpost" size={64} />}
        title="島のなか ぜんぶ"
        lead={`島にある紙、${DEST_COUNT}枚。どの面の上にもこの札が出ているので、ここを通ればどこへでも1回で行けます。`}
      />

      <DirFilter total={DEST_COUNT} />

      {SHELVES.map((s) => (
        <section className="panel paper dxs" key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          <p className="muted">{s.note}</p>
          <ul className="dxl">
            {s.items.map((d) => (
              <li key={d.href} data-q={d.q}>
                <Link className="dx" href={d.href} prefetch={false}>
                  <span className="dx-body">
                    <b>{d.name}</b>
                    <i>{d.note}</i>
                  </span>
                  <Icon name="right" size={15} className="dx-go" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
