import Link from "next/link";
import { DOORS } from "../island/layout";
import Icon from "./Icon";

/** 行き先を全部並べた面。 */
export const ALL_HREF = "/all";
export const ALL_LABEL = "島のなか ぜんぶ";

/**
 * 島に建っている10軒 ＋「ぜんぶ」の一覧。
 *
 * **一覧を書くのはここだけ。** 9月5日まで、行き先の一覧は
 * ヘッダーの帯（6つ）・現在地の行の「ぜんぶ」の札・砂浜（12リンク）の
 * 3か所に別々に書いてあり、狭い画面ではヘッダーと砂浜だけで 613px、
 * 面の 12〜30% を使っていた（`docs/island-ux.md` 5.2 が「部品を1つ作って
 * 使い回す」と決めているのに、実物は3か所に散っていた）。
 *
 * いま一覧が開いたまま出る場所は砂浜だけで、看板は `/all` への板1枚に
 * なった（`PageShell` の但し書き）。行き先が増えても減っても、
 * 直すのは `layout.ts` の `PLACES` 1か所。
 */
export default function PlaceList({
  current,
  atAll,
}: {
  /** いま居る場所（`SpotId`）。そこだけ印を付けて、押しても同じ紙が出ないようにする。 */
  current?: string;
  /** この面が `/all` そのものか。自分への口は出さない。 */
  atAll?: boolean;
}) {
  return (
    <ul className="ifoot-doors">
      {DOORS.map((d) => (
        <li key={d.id}>
          {current === d.id ? (
            // いま居る場所は押させない。押しても同じ紙が出てくる板は、
            // 厚みが「どこかへ行ける」と嘘をつく（`docs/island-design.md` 3-3）。
            <span className="ifoot-door is-here" aria-current="page">
              <img src={`/sprites/${d.icon}.webp`} alt="" loading="lazy" />
              {d.label}
            </span>
          ) : (
            <Link href={d.href} prefetch={false} className="ifoot-door">
              <img src={`/sprites/${d.icon}.webp`} alt="" loading="lazy" />
              {d.label}
            </Link>
          )}
        </li>
      ))}
      {!atAll && (
        <li className="is-all">
          <Link href={ALL_HREF} prefetch={false} className="ifoot-door is-all">
            <Icon name="signpost" size={18} />
            {ALL_LABEL}
          </Link>
        </li>
      )}
    </ul>
  );
}
