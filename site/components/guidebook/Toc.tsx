import Icon, { type IconName } from "@/components/ui/Icon";

/**
 * 2 目次。下の節へ飛ぶ札の並び。**指で押せる大きさ**（1枚 64px 以上）。
 * 一面に並ぶ札が全部押せるので、1枚ずつに厚みは付けない（`docs/island-design.md` 3章3の例外）。
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
