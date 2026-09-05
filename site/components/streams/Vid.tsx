import Icon from "@/components/ui/Icon";
import type { Figure } from "@/content/legends";
import { peakOf } from "@/content/streamPeaks";
import { atText, watchAt } from "@/lib/peak";

/**
 * 配信カード。
 *
 * `components/ui/Bits.tsx` の StreamCard との違いは2つ。
 *   1. 型の色（`--ty`）を縁と札に受ける。5つの型が別物に見えないと意味がないので
 *   2. サムネが出ない環境でも板として成立する（下地の色と再生の印を先に置く）
 *
 * YouTube の埋め込みは重いので、ここではサムネと再生の印だけ出して外へ飛ばす。
 *
 * ## 3時間の頭から始めない
 *
 * 配信は毎晩2〜3時間ある。頭から出しても、たいていの人は再生しない。
 * コメントがいちばん重なったところが分かっている配信では、**そこから開く**
 * （`content/streamPeaks.ts`・`docs/island-play.md` 仕掛け15）。
 * どこから開くかは札に書く。書かずに途中から始まると、壊れていると思われる。
 *
 * 分かっていない配信のほうが多い（756本のうち212本）。**その時は黙って頭から。**
 * 出すために基準を下げると、出ているものまで信用されなくなる。
 */
export function Vid({
  videoId,
  title,
  date,
  tag,
  no,
}: {
  videoId: string;
  title: string;
  date?: string;
  tag?: string;
  /** 何本目か。長い企画で順番を見せたいときだけ渡す。 */
  no?: number;
}) {
  const peak = peakOf(videoId);
  return (
    <a
      className="vid"
      href={peak ? watchAt(videoId, peak.k) : `https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {no !== undefined && <span className="vid-no">{no}</span>}
      <span className="vid-th">
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" width={320} height={180} />
        <span className="vid-play" aria-hidden>
          <i>
            <Icon name="play" size={15} />
          </i>
        </span>
      </span>
      <span className="vid-b">
        {(tag || date) && (
          <span className="vid-m">
            {tag && <em>{tag}</em>}
            {date && <time>{date.replace(/-/g, "/")}</time>}
          </span>
        )}
        <b>{title}</b>
        {peak && <i className="vid-peak">コメントが重なった {atText(peak.k)} から</i>}
      </span>
    </a>
  );
}

/**
 * 一撃で伝わる数字。
 * 言葉のとき（「運まかせ」）は、数字と同じ大きさで出すと間が抜けるので一段落とす。
 */
export function Fig({ f, cap = true }: { f: Figure; cap?: boolean }) {
  const word = !/^[\d,.]+$/.test(f.n);
  return (
    <div>
      <span className={`fig${word ? " is-word" : ""}`}>
        <b>{f.n}</b>
        {f.unit && <i>{f.unit}</i>}
      </span>
      {cap && <span className="fig-cap">{f.cap}</span>}
    </div>
  );
}
