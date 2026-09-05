"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { planDaysLeft, type Plan } from "@/content/plans";
import { LINKS } from "@/content/site";
import Icon from "@/components/ui/IconCore";
import Fold from "@/components/ui/Fold";
import { Stone } from "./art";

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

/**
 * 写真。外から借りたものは、出どころを必ず添える。
 *
 * `from` は「ここから先を出す」。主役の札は1枚目だけを開いておいて、
 * 残りは畳んだ中に入れる。写真は1枚あれば「何が起きるのか」は伝わるので、
 * 2枚目から先は見たい人のものにする。
 */
function Photos({ plan, from = 0, to }: { plan: Plan; from?: number; to?: number }) {
  const list = plan.photos?.slice(from, to);
  if (!list?.length) return null;
  return (
    // 既定は 220px 折り返しなのでスマホでは1列になり、縦に積むと下が遠くなる。
    // 2枚並ぶところまで詰めて、写真は「見当がつく大きさ」で足りるものとする。
    <div className="pphotos" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
      {list.map((ph) => (
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
    <div className="chips" style={{ marginTop: "var(--sp-3)" }}>
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
          <Link className="nx-do-b" href={plan.href} prefetch={false}>
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
function Asks({ plan, jump = true }: { plan: Plan; jump?: boolean }) {
  if (!plan.asks?.length) return null;
  return (
    <div className="nx-asks">
      <span>まだ決まっていないこと</span>
      <ul>
        {plan.asks.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {/* 付箋の欄が閉じているとき（道のりの段）だけ、そこへ連れていく。
          主役の札は、この真下に入力欄が開いている。同じ行き先の札を
          20px 下にもう1つ置いても、押しどころが2つに割れるだけ。 */}
      {jump && (
        <a href={`#${plan.id}-notes`}>
          付箋で教える
          <Icon name="right" size={12} />
        </a>
      )}
    </div>
  );
}

/**
 * 企画の中身。写真・説明・去年の様子・行き先。
 *
 * 主役の札では畳んだ中に、道のりの段では段の中に、同じものが入る。
 * 「くわしく知りたい人だけが開く」ものはここにまとめてあって、
 * 開くまでは1行も出さない。
 */
function PlanBody({ plan, from = 0 }: { plan: Plan; from?: number }) {
  return (
    <>
      <Photos plan={plan} from={from} />
      {plan.about?.map((a, i) => (
        <p key={i}>{a}</p>
      ))}
      <Embeds plan={plan} />
      <Links plan={plan} />
    </>
  );
}

/** 畳んだ中に入れるものが1つでもあるか。無いときは折りたたみ自体を出さない。 */
const hasBody = (plan: Plan, from = 0) =>
  (plan.photos?.length ?? 0) > from ||
  !!plan.about?.length ||
  !!plan.embeds?.length ||
  !!plan.links?.length ||
  !!plan.place?.map;

/**
 * いちばん近い企画。ページの主役。
 *
 * 開いた瞬間に3つの問いへ答える。ここに入れてよいのはその3つだけで、
 * それ以外は畳んだ中に入れる（`docs/island-ux.md` 5.8）。
 *   1. あと何日か     … 時計。この面でいちばん大きい数字
 *   2. 何が起きるのか … 題名・日付・場所・ひとこと・写真1枚
 *   3. 自分は何を     … 説明より先に、押せるものを並べる
 *
 * 写真を2枚とも開いて説明を3段落並べると、それだけで1画面を超える。
 * 「くわしく」は畳む。読みたい人は押せば全部出てくる。
 */
export default function PlanCard({ plan, children }: { plan: Plan; children?: React.ReactNode }) {
  return (
    <section
      // 企画の札は「これから」の面の本文。読むものなので紙にして、
      // その上に載る時計・できること・付箋の道具だけを板のまま残す
      // （`docs/island-world.md` 2.1）。
      className="panel paper"
      id={plan.id}
      // 主役の札は塗りを変えず、朱の細枠だけで示す。紙の型の選択と同じ作り
      // （`docs/ac-reference.md` 7章）。厚みは押せるものだけのものなので足さない。
      style={{ borderColor: "var(--pick)", scrollMarginTop: 78 }}
    >
      {/* 時計だけを四角く置くと、その右が丸ごと空いて、いちばん大事な数字が
          隅にぽつんと残る。日付と場所を時計のとなりに引き寄せて、
          「いつ・どこで」を一本の帯として読ませる。 */}
      <div className="nx-lead-head">
        <div className="nx-when">
          <LeadClock plan={plan} />
          <span className="nx-when-m">
            <span>
              <Icon name="calendar" size={13} />
              {plan.when}
            </span>
            {plan.place && (
              <span>
                <Icon name="pin" size={13} />
                {plan.place.name}
              </span>
            )}
          </span>
        </div>
        <h2>{plan.title}</h2>
      </div>

      <p style={{ fontSize: 16 }}>{plan.note}</p>

      <Doing plan={plan} />

      {/* 写真は1枚だけ開く。何が起きるのかは、字より絵のほうが早い。 */}
      <Photos plan={plan} to={1} />

      {hasBody(plan, 1) && (
        <div style={{ margin: "var(--sp-4) 0" }}>
          <Fold title="どんなところなんだろう" lead={plan.place?.area ?? plan.tags.join(" / ")}>
            <PlanBody plan={plan} from={1} />
          </Fold>
        </div>
      )}

      <Asks plan={plan} jump={false} />

      {children}
    </section>
  );
}

/**
 * 道のりの一段。
 *
 * ここが「目次と本文が同じ画面に2回出る」を直したところ（`docs/island-ux.md` 5.8）。
 * 一覧と札を別々に置くのをやめて、**一覧の段がそのまま開いて札になる**。
 * 閉じているあいだは日付・題名・ひとこと・あと何日だけ。押すと中身が出る。
 *
 * 石に彫るのは通し番号ではなく日付にした。番号は「何番目か」しか言わないが、
 * 日付なら石を目で追うだけで、この先の予定が何日おきに来るのかが分かる。
 */
export function PlanRow({ plan, children }: { plan: Plan; children?: React.ReactNode }) {
  const d = useDays(plan);
  return (
    <li id={plan.id} style={{ scrollMarginTop: 78 }}>
      <span className="nx-stone">
        <Stone tone={d !== null && d < 0 ? "past" : "stone"} />
        <b className="is-date">{shortDate(plan.date)}</b>
      </span>
      <div className="nx-road-b">
        <Fold title={plan.title} lead={plan.note} note={<Count plan={plan} />}>
          <div className="chips" style={{ marginBottom: "var(--sp-3)" }}>
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

          <PlanBody plan={plan} />

          {plan.href && (
            <Link className="tile" href={plan.href} prefetch={false} style={{ marginTop: "var(--sp-4)" }}>
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
        </Fold>
      </div>
    </li>
  );
}
