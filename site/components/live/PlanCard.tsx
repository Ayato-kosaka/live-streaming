"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { daysUntil, type Plan } from "@/content/plans";
import { LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";

/** 「9/6」。数え直す前に出しておく、日付だけの表示。 */
function shortDate(date?: string) {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * あと何日か。
 *
 * 静的書き出しなので、ここで素直に数えるとビルドした日の日数がHTMLに焼き込まれ、
 * 何日経っても「あと1日」のままになる。
 * サーバー側では日付だけ出しておいて、画面が出てから今日の日付で数え直す。
 */
function useDays(date?: string) {
  const [d, setD] = useState<number | null>(null);
  useEffect(() => setD(daysUntil(date, new Date())), [date]);
  return d;
}

/** 日数の札。big はいちばん近い企画に使う、大きいほう。 */
function Count({ date, big }: { date?: string; big?: boolean }) {
  const d = useDays(date);
  if (!date) return null;

  const body =
    d === null ? <b>{shortDate(date)}</b> :
    d === 0 ? <b>今日</b> :
    d > 0 ? (
      <>
        あと<b>{d}</b>日
      </>
    ) : (
      <b>おわった</b>
    );

  if (big) return <span className="nextup-count">{body}</span>;
  return (
    <span className={`count${d === 0 ? " is-today" : ""}${d !== null && d < 0 ? " is-past" : ""}`}>
      {body}
    </span>
  );
}

/** 写真。外から借りたものは、出どころを必ず添える。 */
function Photos({ plan }: { plan: Plan }) {
  if (!plan.photos?.length) return null;
  return (
    // 既定は 220px 折り返しなのでスマホでは1列になり、縦に積むと下が遠くなる。
    // 2枚並ぶところまで詰めて、写真は「見当がつく大きさ」で足りるものとする。
    <div className="pphotos" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
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

/** 行き先の地図と、公式の紹介。 */
function Links({ plan }: { plan: Plan }) {
  if (!plan.links?.length && !plan.place?.map) return null;
  return (
    <div className="chips" style={{ marginTop: 12 }}>
      {plan.place?.map && (
        <a className="chip link" href={plan.place.map} target="_blank" rel="noopener noreferrer">
          地図で見る
          <Icon name="external" size={12} />
        </a>
      )}
      {plan.links?.map((l) => (
        <a className="chip link" key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
          {l.label}
          <Icon name="external" size={12} />
        </a>
      ))}
    </div>
  );
}

/**
 * これからの予定ひとつ。
 *
 * lead を付けたものが、そのページの主役。
 * 日数の札を大きくして題名の左に置き、写真と説明もぜんぶ開いたまま出す。
 * それ以外は説明を畳んで、題名と日付だけで先へ進めるようにする。
 */
export default function PlanCard({
  plan,
  lead,
  children,
}: {
  plan: Plan;
  /** ページでいちばん近い企画。1ページにひとつだけ。 */
  lead?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className="panel"
      id={plan.id}
      // 主役の札だけ、板の縁を濃くして厚みを増す。
      // 「.panel.is-lead」が無いので、ここだけ手で足している。
      style={
        lead ?
          {
            borderColor: "var(--frame-dark)",
            boxShadow:
              "inset 0 0 0 6px var(--pg-rim), inset 0 8px 0 -2px rgba(255,255,255,.6), 0 10px 0 var(--frame-deep), var(--shadow-3)",
            scrollMarginTop: 78,
          } :
          { scrollMarginTop: 78 }
      }
    >
      <div
        className="phead-row"
        style={lead ? { gap: 14, alignItems: "center", flexWrap: "nowrap" } : undefined}
      >
        {lead && <Count date={plan.date} big />}
        <h2 style={lead ? { margin: 0, fontSize: "clamp(20px,5.6vw,30px)", lineHeight: 1.32 } : { margin: 0 }}>
          {plan.title}
        </h2>
        {!lead && <Count date={plan.date} />}
      </div>

      <div className="chips" style={{ margin: "12px 0" }}>
        <span className="chip">
          <Icon name="calendar" size={12} />
          {plan.when}
        </span>
        {plan.place && (
          <span className="chip">
            <Icon name="pin" size={12} />
            {plan.place.name}
          </span>
        )}
        {plan.tags.map((t) => (
          <span className="chip" key={t}>
            #{t}
          </span>
        ))}
      </div>

      <p style={lead ? { fontSize: 16 } : undefined}>{plan.note}</p>

      {/* 主役の企画だけ、来た人が次にやることを題名のすぐ下に置く。
          写真や説明を読み終わるまで「自分は何をすればいいのか」が出てこないと、そこで止まる。 */}
      {lead && (
        <>
          {/* 専用のページを持つ大きい企画は、写真より先に入口を出す。
              下まで読まないと入口が出てこないと、そこで止まってしまう。 */}
          {plan.href && (
            <Link className="tile" href={plan.href} style={{ marginTop: 16 }}>
              <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
              <span className="tile-text">
                <b>この企画のページへ</b>
                <i>ルート・行き先・国ごとの見どころ</i>
              </span>
              <Icon name="right" size={15} className="tile-go" />
            </Link>
          )}
          <div className="chips" style={{ marginTop: 14 }}>
            <a className="chip link" href={`#${plan.id}-notes`}>
              付箋を貼る
              <Icon name="right" size={12} />
            </a>
            <a
              className="chip link"
              href={LINKS.find((l) => l.id === "youtube")!.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              配信を見る
              <Icon name="external" size={12} />
            </a>
          </div>
        </>
      )}

      {/* 主役は開いたまま。それ以外は「どんなところ」を畳んで、先へ進みやすくする。 */}
      {lead ? (
        <>
          <Photos plan={plan} />
          {plan.about?.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
          {/* 埋め込みは1枚で画面を埋めてしまう。見たい人だけ開く。 */}
          {!!plan.embeds?.length && (
            <div style={{ margin: "14px 0" }}>
              <Fold title="去年の様子を見る" lead={plan.embeds[0].note ?? "投稿と動画"}>
                <Embeds plan={plan} />
              </Fold>
            </div>
          )}
          <Links plan={plan} />
        </>
      ) : (
        (plan.about?.length || plan.photos?.length || plan.embeds?.length || plan.links?.length || plan.place?.map) && (
          <Fold title="どんなところか" lead={plan.place?.area ?? plan.tags.join(" / ")}>
            <Photos plan={plan} />
            {plan.about?.map((a, i) => (
              <p key={i}>{a}</p>
            ))}
            <Embeds plan={plan} />
            <Links plan={plan} />
          </Fold>
        )
      )}

      {/* 主役でない企画の入口は、説明のあと。 */}
      {!lead && plan.href && (
        <Link className="tile" href={plan.href} style={{ marginTop: 16 }}>
          <img className="tile-icon" src="/sprites/signpost.webp" alt="" />
          <span className="tile-text">
            <b>この企画のページへ</b>
            <i>ルート・行き先・国ごとの見どころ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      )}

      {children}
    </section>
  );
}
