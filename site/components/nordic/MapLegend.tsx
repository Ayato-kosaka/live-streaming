import { ROUTE } from "@/content/nordic";

/**
 * 地図の線の読み方。
 *
 * 地図の中に板で置くと、いちばん見せたいところ（ノルウェーとスウェーデン）が
 * 隠れる。だから外に出して、線そのものを見本として並べる。
 * 距離と本数もここで出す。「どれが何色か」だけの凡例は、読む理由がない。
 */

const KM = (m: string) =>
  ROUTE.filter((l) => l.move === m && l.km).reduce((a, b) => a + (b.km ?? 0), 0);

const KEYS: { cls: string; label: string; note: string }[] = [
  {
    cls: "is-hitch",
    label: "ヒッチハイク",
    note: `${KM("hitch").toLocaleString()}km / ${ROUTE.filter((l) => l.move === "hitch" && !l.side).length}区間`,
  },
  { cls: "is-ferry", label: "フェリー", note: "バルト海を2回わたる" },
  { cls: "is-side", label: "寄り道", note: "行って戻ってくる日帰り" },
  { cls: "is-fly", label: "飛行機", note: "クタイシ発の1本だけ" },
  { cls: "is-border", label: "国境", note: "歩いて越えるのが3か所" },
];

export default function MapLegend() {
  return (
    <ul className="nmkeys">
      {KEYS.map((k) => (
        <li key={k.label} className={k.cls}>
          <span className="nmkeys-s" aria-hidden />
          <b>{k.label}</b>
          <i>{k.note}</i>
        </li>
      ))}
    </ul>
  );
}
