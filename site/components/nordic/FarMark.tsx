/**
 * 街の窓に入らなかった見どころの、**向き。**
 *
 * 「南東へ8.9km」の字だけだと、どっちなのか読み取るのに一拍かかる。
 * 真北を 0 にした角度ぶん回した矢印を、字といっしょに置く。
 * 角度は焼くときに出してある（`tools/nordic/citymap.py` の `bearing`）。
 *
 * 日ページ（`WantList`）と国ページ（`Spot`）の両方から呼ぶので、
 * ここに1つだけ置く。**同じものを2か所に書かない。**
 */
export default function FarMark({ deg, className }: { deg: number; className?: string }) {
  return (
    <i className={className} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 2.6l6.2 18.4L12 16.6 5.8 21z" transform={`rotate(${deg} 12 12)`} />
      </svg>
    </i>
  );
}
