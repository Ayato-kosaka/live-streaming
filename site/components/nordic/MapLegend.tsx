import Icon from "@/components/ui/Icon";

/** 地図の線の読み方。地図の中に文字を増やしたくないので、外に出す。 */
export default function MapLegend() {
  return (
    <ul className="nmlegend">
      <li className="is-hitch">
        <Icon name="thumb" size={15} />
        ヒッチハイク
      </li>
      <li className="is-ferry">
        <Icon name="ferry" size={15} />
        フェリー
      </li>
      <li className="is-side">
        <Icon name="pin" size={15} />
        寄り道
      </li>
      <li className="is-fly">
        <Icon name="plane" size={15} />
        飛行機（1本だけ）
      </li>
    </ul>
  );
}
