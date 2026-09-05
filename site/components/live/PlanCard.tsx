"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { planDaysLeft, type Plan } from "@/content/plans";
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
function useDays({ date, at }: Plan) {
  const [d, setD] = useState<number | null>(null);
  // 依存はかならず文字列にする。企画のオブジェクトを渡すと、下書きの下見のように
  // 毎回作り直される場所で、描くたびに数え直しが走る。
  useEffect(() => setD(planDaysLeft({ date, at }, new Date())), [date, at]);
  return d;
}

/**
 * 始まるまでの残り。日・時間・分。
 *
 * 「あと1日」だけだと、その日の朝なのか夜なのかが分からない。
 * 出発の時刻まで決まっているものは、そこまで数える。
 * 1分ごとに数え直すほどの面ではないので30秒おき（分がずれて見えない程度）。
 */
export function useCountdown(plan: Plan) {
  const [left, setLeft] = useState<{ d: number; h: number; m: number } | null>(null);
  useEffect(() => {
    if (!plan.date) return;
    const [y, mo, dd] = plan.date.split("-").map(Number);
    // 時刻が分かっていなければ、その日の始まりを目標にする（端末の時計の日付で）
    const target = plan.at ? new Date(plan.at).getTime() : new Date(y, mo - 1, dd, 0, 0, 0).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) return setLeft({ d: -1, h: 0, m: 0 });
      const s = Math.floor(ms / 1000);
      setLeft({ d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [plan.date, plan.at]);
  return left;
}

/**
 * 主役の企画の時計。
 * ページを開いていちばん先に目に入るのがこれ。数字だけ大きく出す。
 *
 * 出発の時刻まで決まっているもの（`at`）だけ、時間と分まで刻む。
 * 決まっていないものを「あと0日23時間」と出すと、
 * 明日のことなのに0日と書いてあることになって、かえって分からない。
 */
export function LeadClock({ plan }: { plan: Plan }) {
  const left = useCountdown(plan);
  const days = useDays(plan);
  if (!plan.date) return null;

  // 画面が出るまでは日付だけ。焼き込みの日数を一瞬でも見せない
  if (days === null || (plan.at && left === null)) {
    return (
      <p className="nx-clock is-one">
        <em>
          <b>{shortDate(plan.date)}</b>その日まで
        </em>
      </p>
    );
  }
  if (days < 0) {
    return (
      <p className="nx-clock is-one">
        <em>
          <b>おわった</b>
          {shortDate(plan.date)}
        </em>
      </p>
    );
  }
  if (plan.at && left) {
    if (left.d < 0) {
      return (
        <p className="nx-clock is-one">
          <em>
            <b>いま</b>やっているところ
          </em>
        </p>
      );
    }
    return (
      <p className="nx-clock">
        <em>
          <span>あと</span>
          <b>{left.d}</b>日
        </em>
        <em>
          <b>{left.h}</b>時間
        </em>
        <em>
          <b>{left.m}</b>分
        </em>
      </p>
    );
  }
  if (days === 0) {
    return (
      <p className="nx-clock is-one">
        <em>
          <b>今日</b>
          {shortDate(plan.date)}
        </em>
      </p>
    );
  }
  return (
    <p className="nx-clock is-one">
      <em>
        <span>あと</span>
        <b>{days}</b>日
      </em>
    </p>
  );
}

/** 一覧のほうの日数の札。小さいほう。 */
function Count({ plan }: { plan: Plan }) {
  const d = useDays(plan);
  const date = plan.date;
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
  return (
    <span className={`count${d === 0 ? " is-today" : ""}${d !== null && d < 0 ? " is-past" : ""}`}>{body}</span>
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
function Links({ plan, mapDone }: { plan: Plan; mapDone?: boolean }) {
  if (!plan.links?.length && (!plan.place?.map || mapDone)) return null;
  return (
    <div className="chips" style={{ marginTop: 12 }}>
      {plan.place?.map && !mapDone && (
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
 * きみができること。
 *
 * 「いつ」「何が起きる」の次に来る問いは「じゃあ自分は何をすればいいのか」。
 * 写真と説明を読み終わるまでこれが出てこないと、そこで読むのをやめてしまう。
 * だから説明より先、題名のすぐ下に置く。
 */
function Doing({ plan }: { plan: Plan }) {
  const youtube = LINKS.find((l) => l.id === "youtube")!;
  return (
    <div className="nx-do">
      <span>きみができること</span>
      <div className="nx-dos">
        <a className="nx-do-b is-go" href={`#${plan.id}-notes`}>
          <Icon name="comment" size={26} />
          <span>
            <b>付箋を貼る</b>
            <i>知ってることを教える</i>
          </span>
        </a>
        {plan.href && (
          <Link className="nx-do-b" href={plan.href}>
            <Icon name="signpost" size={26} />
            <span>
              <b>企画のページを見る</b>
              <i>ルート・行き先・見どころ</i>
            </span>
          </Link>
        )}
        <a className="nx-do-b" href={youtube.href} target="_blank" rel="noopener noreferrer">
          <Icon name="live" size={26} />
          <span>
            <b>その日の配信で見る</b>
            <i>毎晩22時・YouTube</i>
          </span>
        </a>
        {plan.place?.map && (
          <a className="nx-do-b" href={plan.place.map} target="_blank" rel="noopener noreferrer">
            <Icon name="map" size={26} />
            <span>
              <b>どこにあるか見る</b>
              <i>{plan.place.area ?? plan.place.name}</i>
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * まだ決まっていないこと。
 *
 * 「日にちはあやとが決めますが、中身はみんなで」がこの島の企画の作り方。
 * どこが空いているのかを見せないまま「付箋を貼ってください」と言っても、
 * 何を書けばいいのか分からない。空いている場所を先に出す。
 */
function Asks({ plan }: { plan: Plan }) {
  if (!plan.asks?.length) return null;
  return (
    <div className="nx-asks">
      <span>まだ決まっていないこと</span>
      <ul>
        {plan.asks.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <a href={`#${plan.id}-notes`}>
        付箋で教える
        <Icon name="right" size={12} />
      </a>
    </div>
  );
}

/**
 * これからの予定ひとつ。
 *
 * lead を付けたものが、そのページの主役。
 * 開いた瞬間に3つの問いに答える形にしてある。
 *   1. あと何日か   … 時計を題名の左に、いちばん大きく
 *   2. 何が起きるのか … 題名・日付・場所・ひとこと
 *   3. 自分は何をすればいいのか … 説明より先に、押せるものを並べる
 * それ以外の企画は説明を畳んで、題名と日付だけで先へ進めるようにする。
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
      {lead ? (
        <div className="nx-lead-head">
          <LeadClock plan={plan} />
          <h2>{plan.title}</h2>
        </div>
      ) : (
        <div className="phead-row">
          <h2 style={{ margin: 0 }}>{plan.title}</h2>
          <Count plan={plan} />
        </div>
      )}

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

      {lead && <Doing plan={plan} />}

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
          <Links plan={plan} mapDone />
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

      <Asks plan={plan} />

      {children}
    </section>
  );
}
