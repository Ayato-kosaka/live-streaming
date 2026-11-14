import type { ReactNode } from "react";
import Link from "next/link";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Vid } from "@/components/streams/Vid";
import type { CityStream } from "@/content/cityStreams";
import { LINKS, PROFILE } from "@/content/site";
import type {
  Article,
  Big,
  Item,
  Local,
  Mark,
  Measured,
  Photo,
  PriceRow,
  Quote,
  Scene,
  SectionId,
  Src,
  Went as WentT,
} from "@/content/travel/types";
import { AYATO_SRC } from "@/lib/ayatoArt";

import { hms, jpDate, md, videoUrl, watchUrl } from "./scene";

/**
 * 街のガイドの面の部品。**どの街の面も、これを同じ並びで使う。**
 *
 * ## 骨組みと肉付け（2026-11-14 の作り直し。`docs/island-misses.md` #323）
 *
 * 骨は `/bulgaria` と同じ絵のタイル（見たい・食べたい・買いたい）と札（したい・基本情報）。
 * 1件の中は**いつも同じ順**: 印の理由 → 行く前のガイド（`ExtBlock`。出どころつき）→
 * 行った人の話（`WentBlock`。場面のリンクは1つ）→ Google マップ → 写真の出どころ。
 *
 * | 印（属性） | 何の印か | 見張り（`python/guide_watch.py`） |
 * | --- | --- | --- |
 * | `data-src` | 外の出どころの事実。中の額は出どころが正 | 出どころのリンクと見た日が在るか |
 * | `data-went` | 行った人の話 | 場面のリンクが1つだけか |
 * | `data-quote="ayato"` | 本人の一言 | 節に1つまでか・場面の秒が facts と同じか |
 *
 * - 押せるものには厚み、押せないものは平ら（48px のボタンで 6px、30px の札で 4px）
 * - 字はここに書かない。**街ごとの字は焼いた中身から。** ここに残る字は部品の名札だけ
 */

/* ---------------------------------------------------------------- 節の名簿 */

/** 節の見出し・目次の短い形・絵。**`/bulgaria` と同じ骨組み**。街が変わっても変えない */
export const SECTION_HEAD: Record<SectionId | "articles" | "streams", { h: string; toc: string; icon: IconName }> = {
  see: { h: "見たいもの", toc: "見たい", icon: "see" },
  eat: { h: "食べたいもの", toc: "食べたい", icon: "eat" },
  buy: { h: "買いたいもの", toc: "買いたい", icon: "souvenir" },
  todo: { h: "ここでしたいこと", toc: "したい", icon: "sparkle" },
  basics: { h: "基本情報", toc: "基本情報", icon: "info" },
  articles: { h: "もっと詳しく", toc: "記事", icon: "book" },
  streams: { h: "の配信", toc: "配信", icon: "youtube" },
};

/** 印の字。**1か所で決める**（`/bulgaria` の `MARK` と同じ言葉） */
export const MARK: Record<Mark, { label: string; icon: IconName }> = {
  good: { label: "あやとの好みに合う", icon: "heart" },
  ok: { label: "たぶん合う", icon: "check" },
  warn: { label: "注意（豚・酒・中東の甘い菓子）", icon: "alert" },
};

/** 星の言葉。★の数より、**何をしたらいいか**が先に読めるようにする */
export const STAR = ["", "必見", "行けたら", "余裕があれば"];

/* ---------------------------------------------------------------- 小さな部品 */

/** 場面の札（「10/14 0:56:30」）。その話の場面へ */
export function At({ at }: { at: Scene }) {
  return (
    <a className="tg-at" href={watchUrl(at)} target="_blank" rel="noopener noreferrer">
      <i className="tg-yt" aria-hidden />
      <time dateTime={at.date}>{md(at.date)}</time>
      <span>{hms(at.t)}</span>
    </a>
  );
}

/**
 * 本人の一言（吹き出し）。**全体が1つのリンク**で、YouTube のその場面が開く。
 * 字は facts の `quote` のまま（字幕の字。直さない）。**節に1つまで。**
 */
export function Say({ q, of }: { q: Quote; of?: string | null }) {
  return (
    <a className="tg-say" href={watchUrl(q.at)} target="_blank" rel="noopener noreferrer">
      <img className="tg-say-face" src={AYATO_SRC} alt="" width={26} height={38} loading="lazy" />
      <span className="tg-say-b">
        <span className="tg-say-q">
          「<span data-quote="ayato">{q.q}</span>」
        </span>
        <span className="tg-say-at">
          <i className="tg-yt" aria-hidden />
          {of && <b>{of}で</b>}
          <time dateTime={q.at.date}>{md(q.at.date)}</time> {hms(q.at.t)}
        </span>
      </span>
    </a>
  );
}

/** 現地のつづり */
export function LocalName({ l, className = "tg-local" }: { l: Local; className?: string }) {
  return (
    <span className={className} lang={l.lang}>
      {l.text}
    </span>
  );
}

/**
 * 写真の出どころ。あやとの写真は「あやと撮影・日付」でその日の配信へ、
 * 借りた写真は作者とライセンスで元のページへ（CC の決まり）
 */
export function PhotoCredit({ p }: { p: Photo }) {
  if (p.page) {
    return (
      <p className="tg-credit">
        写真:{" "}
        {/* 同じ作者の写真が2枚あると、字が同じで行き先の違うリンクになる。読み上げでは何の写真かを言う（reachkeys の「おなじ字」） */}
        <a href={p.page} target="_blank" rel="noopener noreferrer" aria-label={`写真の元のページ（${p.alt}・${p.by}／${p.lic}）`}>
          {p.by}／{p.lic}（Wikimedia Commons）
        </a>
      </p>
    );
  }
  return (
    <p className="tg-credit">
      <a href={videoUrl(p.v ?? "")} target="_blank" rel="noopener noreferrer" aria-label={`この写真の日の配信（${jpDate(p.day ?? "")}）`}>
        あやと撮影・<time dateTime={p.day}>{jpDate(p.day ?? "")}</time>
      </a>
    </p>
  );
}

export function Pic({ p, sizes, eager, className }: { p: Photo; sizes: string; eager?: boolean; className?: string }) {
  return (
    <img
      className={className}
      src={p.src}
      srcSet={p.srcSet}
      sizes={sizes}
      width={p.w}
      height={p.h}
      alt={p.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      style={p.pos ? { objectPosition: p.pos } : undefined}
    />
  );
}

/** 測った値の札。押すと、始まりと終わりの2つの場面が出る */
export function MeasuredTag({ m }: { m: Measured }) {
  const n = Number(m.mins);
  return (
    <details className="tg-meas">
      <summary>
        <b>
          実測 {Number.isInteger(n) ? "" : "約"}
          {m.mins}分
        </b>
        <span>{m.what}</span>
        <Icon name="chevron" size={14} className="tg-meas-c" />
      </summary>
      <p>
        <a href={watchUrl(m.from)} target="_blank" rel="noopener noreferrer">
          {hms(m.from.t)}
        </a>
        <span aria-hidden>→</span>
        <a href={watchUrl(m.to)} target="_blank" rel="noopener noreferrer">
          {hms(m.to.t)}
        </a>
      </p>
    </details>
  );
}

/**
 * 印ひとつ。**字（◎○⚠）ではなく絵で出す**（`/bulgaria` の `Badge` と同じ理由。
 * ⚠ は本文の書体に無く、そこだけ端末の書体に落ちて文字化けに見える）
 */
export function Badge({ mark, big }: { mark: Mark; big?: boolean }) {
  return (
    <span className={`tg-mark is-${mark}${big ? " is-big" : ""}`}>
      <b aria-hidden>
        <Icon name={MARK[mark].icon} size={big ? 15 : 12} />
      </b>
      <span className="tg-sr">{MARK[mark].label}</span>
    </span>
  );
}

export function Star({ rank }: { rank: number }) {
  return (
    <span className="tg-star">
      <b aria-hidden>{"★".repeat(rank)}</b>
      <i>{STAR[rank]}</i>
    </span>
  );
}

/** 「行った」の札（日付つき） */
function Stamp({ w }: { w: WentT }) {
  return (
    <p className="tg-stamp">
      <span className={`tg-stamp-tag${w.stamp === "行った" ? "" : " is-soft"}`}>
        <Icon name={w.stamp === "行った" ? "check" : "walk"} size={12} />
        {w.stamp}
      </span>
      {w.days.map((d, i) => (
        <span key={d}>
          {i > 0 && "・"}
          <time dateTime={d}>{md(d)}</time>
        </span>
      ))}
    </p>
  );
}

/** 値段の行。1行ずつ、その場面へ */
export function PriceTable({ rows }: { rows: PriceRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="tg-price">
      <thead>
        <tr>
          <th scope="col">何に</th>
          <th scope="col">いくら</th>
          <th scope="col">場面</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.at.v}-${r.at.t}`}>
            <th scope="row">{r.what}</th>
            <td>{r.amount}</td>
            <td>
              <At at={r.at} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- 骨組みと肉付け */

/** 出どころの1行（名前がリンク・見た日） */
function SrcLine({ src }: { src: Src[] }) {
  return (
    <p className="tg-src">
      <Icon name="book" size={12} />
      <span>
        {src.map((s, i) => (
          <span key={s.url}>
            {i > 0 && "・"}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.name}
            </a>
          </span>
        ))}
        （<time dateTime={src[0].seen}>{md(src[0].seen)}</time>に見た）
      </span>
    </p>
  );
}

/** 行く前のガイド（外の出どころの事実）。**中の額は出どころが正**（facts と突き合わせない） */
export function ExtBlock({ it }: { it: Pick<Item, "what" | "info" | "src"> }) {
  if (!it.what && !it.info.length) return null;
  return (
    <div className="tg-ext" data-src="">
      {it.what && <p>{it.what}</p>}
      {it.info.length > 0 && (
        <dl className="tg-ext-info">
          {it.info.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>
      )}
      <SrcLine src={it.src} />
    </div>
  );
}

/**
 * 行った人の話。**話は1つ、場面のリンクも1つ**（話の終わりに）。
 * 値段の行だけは1行ずつ場面を持つ（何をいくらで買ったかの証拠なので）。
 */
export function WentBlock({ w, photo = true, sizes = "(min-width: 720px) 440px, 92vw" }: { w: WentT; photo?: boolean; sizes?: string }) {
  return (
    <div className="tg-went" data-went="">
      <Stamp w={w} />
      {photo && w.photo && (
        <figure className="tg-went-ph">
          <Pic p={w.photo} sizes={sizes} />
          <figcaption>
            <PhotoCredit p={w.photo} />
          </figcaption>
        </figure>
      )}
      <p className="tg-went-t">
        {w.text} <At at={w.at} />
      </p>
      {w.measured && <MeasuredTag m={w.measured} />}
      <PriceTable rows={w.rows} />
    </div>
  );
}

function Maps({ it }: { it: Item }) {
  if (!it.maps) return null;
  return (
    <a className="tg-maps" href={it.maps} target="_blank" rel="noopener noreferrer" aria-label={`Google マップで開く（${it.name}）`}>
      <Icon name="map" size={15} />
      Google マップで開く
      <Icon name="external" size={13} />
    </a>
  );
}

/**
 * 絵のタイル（見たい・食べたい・買いたい）。`/bulgaria` の `.bgtile` と同じ作り:
 * 閉じているときは絵と名前だけ、押すと中身。**字は押すまで出さない**（縦を切る）
 */
export function Tile({ it, eager }: { it: Item; eager?: boolean }) {
  const meta = it.went ? `${it.went.stamp}・${it.went.days.map(md).join("・")}` : (it.local?.roman ?? it.info[0]?.text ?? "");
  return (
    <details className={`tg-tile is-${it.mark ?? "ok"}${it.went ? " is-went" : ""}`} id={it.key}>
      <summary>
        <span className={`tg-shot${it.photo ? "" : " is-none"}`}>
          {it.photo ? (
            <Pic p={it.photo} sizes="(min-width: 760px) 240px, 46vw" eager={eager} />
          ) : (
            <Icon name={it.icon as IconName} size={40} />
          )}
        </span>
        <span className="tg-tile-tag">
          {it.mark && <Badge mark={it.mark} />}
          {it.went && (
            <span className={`tg-tile-went${it.went.stamp === "行った" ? "" : " is-soft"}`}>
              {it.went.stamp === "行った" ? "行った" : it.went.stamp === "前を通った" ? "通った" : "調べた"}
            </span>
          )}
        </span>
        <span className="tg-tile-body">
          <b>{it.name}</b>
          {it.local && <i lang={it.local.lang}>{it.local.text}</i>}
          <em>{meta}</em>
        </span>
        <Icon name="chevron" size={16} className="tg-tile-c" />
      </summary>
      <div className="tg-tile-more">
        {it.markWhy && <p className="tg-tile-why">{it.markWhy}</p>}
        {it.local && (it.local.roman || it.local.kana) && (
          <p className="tg-tile-say">
            <Icon name="phrase" size={13} />
            {[it.local.roman, it.local.kana].filter(Boolean).join("／")}
          </p>
        )}
        <ExtBlock it={it} />
        {it.went && <WentBlock w={it.went} photo={false} />}
        <Maps it={it} />
        {it.photo && <PhotoCredit p={it.photo} />}
      </div>
    </details>
  );
}

/** タイルを★で3段に。★の無い件（行った人の話だけの件）は最後の段にまとめる */
export function Tiles({ items, rest }: { items: Item[]; rest: string }) {
  const groups: { title: ReactNode; items: Item[] }[] = [1, 2, 3]
    .map((r) => ({ title: <Star rank={r} />, items: items.filter((x) => x.rank === r) }))
    .filter((g) => g.items.length);
  const free = items.filter((x) => !x.rank);
  if (free.length) groups.push({ title: <span className="tg-star is-free"><i>{rest}</i></span>, items: free });
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="tg-group">
          <h3 className="tg-groupsub">
            {g.title}
            <em>{g.items.length}件</em>
          </h3>
          <div className="tg-tiles">
            {g.items.map((it, i) => (
              <Tile key={it.key} it={it} eager={gi === 0 && i < 2} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** したいこと。**番号つきの札**（`/bulgaria` の `.bgtodo`）。行った話には、その日の写真 */
export function Todos({ items }: { items: Item[] }) {
  return (
    <ol className="tg-todo">
      {items.map((it, i) => (
        <li key={it.key} id={it.key}>
          <span className="tg-todo-n">{i + 1}</span>
          <div className="tg-todo-b">
            <h3>
              {it.name}
              {it.mark && <Badge mark={it.mark} />}
            </h3>
            {it.rank && <Star rank={it.rank} />}
            {it.markWhy && <p className="tg-tile-why">{it.markWhy}</p>}
            {it.photo && !it.went?.photo && (
              <figure className="tg-went-ph">
                <Pic p={it.photo} sizes="(min-width: 720px) 640px, 88vw" />
                <figcaption>
                  <PhotoCredit p={it.photo} />
                </figcaption>
              </figure>
            )}
            <ExtBlock it={it} />
            {it.went && <WentBlock w={it.went} sizes="(min-width: 720px) 640px, 88vw" />}
            <Maps it={it} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 基本情報。1件1枚の札。外の事実が先、あやとの話があとに */
export function Basics({ items }: { items: Item[] }) {
  return (
    <div className="tg-basics">
      {items.map((it) => (
        <article key={it.key} className="tg-basic" id={it.key}>
          <h3>
            <Icon name={it.icon as IconName} size={20} />
            {it.name}
          </h3>
          <ExtBlock it={it} />
          {it.went && <WentBlock w={it.went} />}
        </article>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 節 */

/** 節ひとつ。番号・絵・見出し・頭の1〜2文・一言（節に1つ）・中身・目次へ */
export function Sec({
  id,
  n,
  head,
  note,
  lead,
  quote,
  quoteOf,
  children,
}: {
  id: string;
  n: number;
  head: { h: string; icon: IconName };
  note?: string;
  lead?: string;
  quote?: Quote | null;
  quoteOf?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="tg-sec" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="tg-sec-h" id={`${id}-h`}>
        <span className="tg-sec-n">{String(n).padStart(2, "0")}</span>
        <Icon name={head.icon} size={26} className="tg-sec-i" />
        <span className="tg-sec-t">{head.h}</span>
        {note && <em className="tg-sec-note">{note}</em>}
      </h2>
      {lead && <p className="tg-answer">{lead}</p>}
      {quote && (
        <div className="tg-says">
          <Say q={quote} of={quoteOf} />
        </div>
      )}
      {children}
      <p className="tg-up">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- 表紙・驚く数・目次・読みかた */

export function Hero({
  name,
  local,
  lead,
  cover,
  went,
  published,
  updated,
}: {
  name: string;
  local: Local | null;
  lead: string;
  cover: Photo | null;
  went: { from: string; to: string; text: string };
  published: string;
  updated: string;
}) {
  return (
    <header className="tg-hero-wrap">
      <div className={`tg-hero${cover ? "" : " is-none"}`}>
        {cover && <Pic p={cover} sizes="(min-width: 940px) 900px, 100vw" eager className="tg-hero-img" />}
        <div className="tg-hero-body">
          {local && <LocalName l={local} className="tg-hero-local" />}
          <h1>{name}</h1>
          <p>{lead}</p>
        </div>
      </div>
      <div className="tg-hero-meta">
        <p className="tg-dates">
          <span>
            行った日 <time dateTime={went.from}>{went.text}</time>
          </span>
          <span>
            公開 <time dateTime={published}>{jpDate(published)}</time>
          </span>
          <span>
            最終更新 <time dateTime={updated}>{jpDate(updated)}</time>
          </span>
        </p>
        {cover && <PhotoCredit p={cover} />}
      </div>
    </header>
  );
}

/** 頭の話（どんな街か）。外の事実と、行った人の話 */
export function Intro({ ext, went }: { ext: { text: string; src: Src[] }; went: { text: string; at: Scene } }) {
  return (
    <div className="tg-intro">
      <ExtBlock it={{ what: ext.text, info: [], src: ext.src }} />
      <div className="tg-went" data-went="">
        <p className="tg-went-t">
          {went.text} <At at={went.at} />
        </p>
      </div>
    </div>
  );
}

export function Nums({ nums }: { nums: Big[] }) {
  if (!nums.length) return null;
  return (
    <ul className="tg-nums">
      {nums.map((b) => (
        <li key={b.cap}>
          <a href={watchUrl(b.at)} target="_blank" rel="noopener noreferrer">
            <b>
              {b.measured && <em>実測</em>}
              {b.n}
              <i>{b.unit}</i>
            </b>
            <span>{b.cap}</span>
            <span className="tg-nums-at">
              <i className="tg-yt" aria-hidden />
              <time dateTime={b.at.date}>{md(b.at.date)}</time> {hms(b.at.t)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Toc({ items }: { items: { id: string; label: string; icon: IconName; note: string }[] }) {
  return (
    <nav className="tg-toc" id="toc" aria-label="中身">
      {items.map((c) => (
        <a key={c.id} href={`#${c.id}`}>
          <Icon name={c.icon} size={22} />
          <b>{c.label}</b>
          <i>{c.note}</i>
        </a>
      ))}
    </nav>
  );
}

/** ★と印と「行った」の読みかた。**畳んでおく**——記号の意味は、見たくなってから読めばいい */
export function Legend({ good, warn, went, rate }: { good: number; warn: number; went: number; rate: { text: string; src: Src[] } }) {
  return (
    <Fold title="★ と 印 と「行った」の読みかた" lead="重要度と好みを分けてあります" note={`◎${good} 注意${warn} 行った${went}`}>
      <div className="tg-key">
        <p>
          <b>★</b>は一般の重要度（必見／行けたら／余裕があれば）、丸い<b>印</b>は<b>あやとの好みに合うか</b>です。
          「有名だけど合わない」を隠さないために、2つを混ぜていません。
        </p>
        <ul className="tg-key-marks">
          {(Object.keys(MARK) as Mark[]).map((m) => (
            <li key={m}>
              <Badge mark={m} big />
              {MARK[m].label}
            </li>
          ))}
        </ul>
        <p>
          <b>「行った」</b>の札が付いた所は、あやとが実際に歩いた所で、写真はその日のもの。札の無い所は、行く前のガイドです。
        </p>
        <div className="tg-ext" data-src="">
          <p>{rate.text}</p>
          <SrcLine src={rate.src} />
        </div>
      </div>
    </Fold>
  );
}

/** 記事への入口。**面がある記事だけ**を渡される（面の側が確かめる） */
export function Articles({ items }: { items: Article[] }) {
  return (
    <ul className="tg-arts">
      {items.map((a) => (
        <li key={a.href}>
          <Link href={a.href} prefetch={false}>
            <Icon name={a.icon as IconName} size={26} />
            <b>{a.title}</b>
            <i>{a.note}</i>
            <Icon name="right" size={16} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** その街の配信の一覧。この面で場面を引いた回を先に、残りは畳む */
export function StreamList({ cited, rest }: { cited: CityStream[]; rest: CityStream[] }) {
  return (
    <>
      <div className="tg-vids">
        {cited.map((s) => (
          <Vid key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} />
        ))}
      </div>
      {rest.length > 0 && (
        <Fold title="ほかの回" note={`${rest.length}本`}>
          <div className="tg-vids">
            {rest.map((s) => (
              <Vid key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} />
            ))}
          </div>
        </Fold>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 面の終わり */

/**
 * 書き手の枠。**文を書いているのは案内鳥、体験はあやと**（9章の1）。
 * 島の看板の2行は、看板が持っていた文（island-design 6章）。
 */
export function Writer() {
  const yt = LINKS.find((l) => l.id === "youtube");
  return (
    <aside className="tg-writer" aria-label="書き手">
      <img className="tg-writer-face" src={AYATO_SRC} alt={`${PROFILE.name}（あやと島の絵）`} width={66} height={96} loading="lazy" />
      <div className="tg-writer-b">
        <p className="tg-writer-name">
          <b>{PROFILE.name}</b>
        </p>
        <p className="tg-writer-sign">毎晩22時、世界のどこかから生配信</p>
        <p className="tg-writer-sub">旅して、食べて、グルメアプリを作る、夜の居場所</p>
        <p className="tg-writer-by">あやとの配信から、あやと島案内鳥がまとめています。</p>
        <div className="tg-writer-go">
          {yt && (
            <a className="tg-go" href={yt.href} target="_blank" rel="noopener noreferrer">
              <Icon name="youtube" size={20} />
              YouTube チャンネル
            </a>
          )}
          <Link className="tg-go" href="/about" prefetch={false}>
            <Icon name="island" size={20} />
            あやとのこと
          </Link>
          <Link className="tg-go" href="/" prefetch={false}>
            <Icon name="home" size={20} />
            あやと島へ
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** 出どころの一覧。外の事実の URL（見た日）と、借りた写真 */
export function Sources({ src, photos }: { src: Src[]; photos: { name: string; p: Photo }[] }) {
  return (
    <section className="tg-sources" aria-labelledby="sources-h">
      <h2 id="sources-h" className="tg-sources-h">
        出どころ
      </h2>
      <ul>
        <li>「行った」の話と写真は、あやとの YouTube の配信と、その日に撮った写真</li>
        {src.map((e) => (
          <li key={e.url}>
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.name}
            </a>
            （<time dateTime={e.seen}>{jpDate(e.seen)}</time>に見た）
          </li>
        ))}
        {photos.map(({ name, p }) => (
          <li key={p.src}>
            {name}の写真:{" "}
            <a href={p.page} target="_blank" rel="noopener noreferrer" aria-label={`${name}の写真の元のページ`}>
              {p.by}／{p.lic}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NextRead({ items }: { items: { href: string; title: string; note: string; icon: IconName }[] }) {
  return (
    <nav className="tg-next" aria-labelledby="next-h">
      <h2 id="next-h" className="tg-sources-h">
        次に読む
      </h2>
      <ul>
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} prefetch={false}>
              <Icon name={it.icon} size={26} />
              <b>{it.title}</b>
              <i>{it.note}</i>
              <Icon name="right" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
