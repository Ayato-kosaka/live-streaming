import Icon, { type IconName } from "@/components/ui/Icon";
import type { Guidebook } from "@/content/guidebook/types";

/**
 * 2 目次。下の節へ飛ぶ札の並び。**指で押せる大きさ**（1枚 64px 以上）。
 * 一面に並ぶ札が全部押せるので、1枚ずつに厚みは付けない（`docs/island-design.md` 3章3の例外）。
 *
 * 札の名前と絵は節の見出しと同じ（`tocOf`）。街の面ごとに書かない——前は2つの面に同じ表が別々に在った。
 */
export default function Toc({ items }: { items: { id: string; label: string; icon: IconName; note: string }[] }) {
  return (
    <nav className="gb-toc" id="toc" aria-label="この面の中身" data-gb="toc">
      {items.map((c) => (
        <a key={c.id} href={`#${c.id}`}>
          <Icon name={c.icon} size={30} />
          <b>{c.label}</b>
          <i>{c.note}</i>
        </a>
      ))}
    </nav>
  );
}

/**
 * 目次の札。**節の名前と絵は節の見出しと同じ**（やりたいこと＝チェック・見たいもの＝カメラ。あやと 2026-11-16）。
 * 行ったあとの街は、数の後ろに「行った◯」を足す
 */
export function tocOf(g: Guidebook): { id: string; label: string; icon: IconName; note: string }[] {
  const went = (xs: { went?: unknown }[]) => xs.filter((x) => x.went).length;
  const note = (n: number, unit: string, xs: { went?: unknown }[]) => `${n}${unit}${went(xs) ? `・行った${went(xs)}` : ""}`;
  return [
    { id: "about", label: "どんな街", icon: "oldtown", note: `問い${g.about.cards.length}つ・地図` },
    { id: "todo", label: `やりたいこと${g.todo.length}選`, icon: "checklist", note: note(g.todo.length, "つ", g.todo) },
    { id: "see", label: "見たいもの", icon: "camera", note: note(g.see.items.length, "か所", g.see.items) },
    { id: "eat", label: "食べたいもの", icon: "eat", note: note(g.eat.items.length, "品", g.eat.items) },
    { id: "buy", label: "買いたいもの", icon: "souvenir", note: note(g.buy.items.length, "つ", g.buy.items) },
    { id: "basics", label: "基本情報", icon: "info", note: "予算・移動・治安" },
  ];
}
