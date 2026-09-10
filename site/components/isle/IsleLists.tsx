"use client";

import Icon from "@/components/ui/Icon";
import Longer from "@/components/ui/Longer";
import type { AppMilestone } from "@/content/apps";
import type { Short } from "@/content/shorts";
import { shortHref, shortThumb } from "@/content/shorts";

/**
 * 島の紙の中で、**溜まる並び**を畳むところ（`docs/island-standards.md` 7）。
 *
 * 畳む部品（`components/ui/Longer.tsx`）はブラウザ側で開くので、
 * 紙のほう（サーバ側）から直に呼べない。**受け取るのは配列だけ**にして、
 * 章の表（配信240本・章ごとの数字）をブラウザへ連れてこないようにしてある。
 */

/** アプリの年表のうち、その島にいたあいだのぶん */
export function MarkList({ marks }: { marks: AppMilestone[] }) {
  return (
    <Longer items={marks} first={4} unit="件" className="isle-marks">
      {(m) => (
        <li key={`${m.date}${m.title}`}>
          {/* 押しどころは行まるごと。字だけを押させると、指で狙う高さが
              48px を切る（`docs/island-design.md` 3-2） */}
          {m.videoId ? (
            <a
              className="isle-mark-row"
              href={`https://www.youtube.com/watch?v=${m.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <time>{m.date.replace(/-/g, "/")}</time>
              <b>{m.title}</b>
              <Icon name="external" size={13} />
            </a>
          ) : (
            <span className="isle-mark-row">
              <time>{m.date.replace(/-/g, "/")}</time>
              <b>{m.title}</b>
            </span>
          )}
        </li>
      )}
    </Longer>
  );
}

/**
 * ショート動画。**埋め込まない。**
 * 31本のプレイヤーを並べると、開いた瞬間に外へ31本つなぎにいく
 * （`docs/island-atlas.md` 4章）。押したら YouTube へ出る絵にする。
 */
export function ShortGrid({ shorts }: { shorts: Short[] }) {
  return (
    <Longer items={shorts} first={8} step={12} unit="本" className="isle-shots">
      {(s) => (
        <li key={s.id}>
          <a href={shortHref(s.id)} target="_blank" rel="noopener noreferrer">
            <img src={shortThumb(s.id)} alt={s.title} loading="lazy" width={480} height={360} />
          </a>
        </li>
      )}
    </Longer>
  );
}
