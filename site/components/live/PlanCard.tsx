"use client";

import Link from "next/link";
import { daysUntil, type Plan } from "@/content/plans";

/** あと何日か。当日なら「今日」、過ぎていれば経過日数。 */
function Countdown({ date }: { date?: string }) {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d === 0) return <span className="count is-today">今日</span>;
  if (d < 0) return <span className="count is-past">{-d}日前に終わった</span>;
  return (
    <span className="count">
      あと<b>{d}</b>日
    </span>
  );
}

/** 写真。外から借りたものは、出どころを必ず添える。 */
function Photos({ plan }: { plan: Plan }) {
  if (!plan.photos?.length) return null;
  return (
    <div className="pphotos">
      {plan.photos.map((ph) => (
        <figure key={ph.src}>
          <img src={ph.src} alt={ph.alt} loading="lazy" referrerPolicy="no-referrer" />
          <figcaption>
            {ph.alt}
            {ph.credit && (
              <>
                {" — "}
                {ph.creditHref ? (
                  <a href={ph.creditHref} target="_blank" rel="noopener noreferrer">
                    {ph.credit}
                  </a>
                ) : (
                  ph.credit
                )}
              </>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** SNS の埋め込み。押されるまで読み込まないので、ページは重くならない。 */
function Embeds({ plan }: { plan: Plan }) {
  if (!plan.embeds?.length) return null;
  return (
    <div className="pembeds">
      {plan.embeds.map((e) => (
        <div className="pembed" key={`${e.kind}-${e.id}`}>
          <iframe
            src={
              e.kind === "instagram" ?
                `https://www.instagram.com/p/${e.id}/embed` :
                `https://www.youtube.com/embed/${e.id}`
            }
            title={e.note ?? (e.kind === "instagram" ? "Instagramの投稿" : "動画")}
            loading="lazy"
            allowFullScreen
          />
          {e.note && <p className="pembed-note">{e.note}</p>}
        </div>
      ))}
    </div>
  );
}

/** これからの予定ひとつ。どんなものかが分かるところまで見せる。 */
export default function PlanCard({ plan, children }: { plan: Plan; children?: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="phead-row">
        <h2 style={{ margin: 0 }}>{plan.title}</h2>
        <Countdown date={plan.date} />
      </div>
      <div className="chips" style={{ margin: "10px 0" }}>
        <span className="chip">{plan.when}</span>
        {plan.place && <span className="chip">{plan.place.name}</span>}
        {plan.tags.map((t) => (
          <span className="chip" key={t}>
            #{t}
          </span>
        ))}
      </div>
      <p>{plan.note}</p>

      <Photos plan={plan} />

      {plan.about?.map((a, i) => (
        <p key={i}>{a}</p>
      ))}

      <Embeds plan={plan} />

      {(plan.links?.length || plan.place?.map) && (
        <div className="chips" style={{ marginTop: 12 }}>
          {plan.place?.map && (
            <a className="chip link" href={plan.place.map} target="_blank" rel="noopener noreferrer">
              地図で見る ↗
            </a>
          )}
          {plan.links?.map((l) => (
            <a className="chip link" key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      {plan.href && (
        <Link className="tile" href={plan.href} style={{ marginTop: 14 }}>
          <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
          <span className="tile-text">
            <b>この旅をくわしく見る</b>
            <i>ルート・行き先・ガイド</i>
          </span>
          <span className="tile-go" aria-hidden>
            →
          </span>
        </Link>
      )}

      {children}
    </section>
  );
}
