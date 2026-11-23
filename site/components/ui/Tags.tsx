import Link from "next/link";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import type { Tag, TagRow } from "@/lib/tags";
import { miniSprite } from "@/lib/miniSprite";

/**
 * 札の段を描く。**札を選ぶのは `lib/tags.ts`**（ここでは並べるだけ。表を読まない）。
 *
 * 段の見出しは小さい字1行（面の見出し `h2` の下に入るので、見出しの段を増やさない）。
 * 0段なら何も描かない——見出しだけの空の箱を面に残さない（`lib/tags.ts` が0件の段を返さない）。
 */
export default function Tags({ rows }: { rows: TagRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="ktags">
      {rows.map((r) => (
        <div className="ktags-row" key={r.kind}>
          <p className="ktags-h">{r.title}</p>
          <div className="chips">
            {r.tags.map((t) => (
              <Link key={t.key} className="chip ktag" href={t.href} prefetch={false}>
                <Art t={t} />
                <span className="ktag-t">
                  {t.label}
                  {t.note && <i>{t.note}</i>}
                </span>
              </Link>
            ))}
            {r.more && (
              <Link className="chip ktag is-more" href={r.more.href} prefetch={false}>
                <span className="ktag-t">{r.more.label}</span>
                <Icon name="right" size={14} />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Art({ t }: { t: Tag }) {
  if ("flag" in t.art) return <Flag slug={t.art.flag} size={22} />;
  if ("sprite" in t.art) return <img className="mini-icon" src={miniSprite(t.art.sprite)} alt="" />;
  return <Icon name={t.art.icon} size={20} />;
}
