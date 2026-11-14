import type { ReactNode } from "react";
import Link from "next/link";

import { Vid } from "@/components/streams/Vid";
import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { CityStream } from "@/content/cityStreams";
import { LINKS, PROFILE } from "@/content/site";
import { AYATO_SRC } from "@/lib/ayatoArt";

import { hms, jpDate, md, videoUrl, watchUrl } from "./scene";
import type { ArticleSection, Block, Day, Ext, Photo, PriceRow, Quote, Scene } from "./types";

/**
 * 旅のガイドの記事（`/travel/<国>/<街>/<話>`）の部品。型は `docs/guide-design.md` の ★ の章と 3章。
 *
 * 街の面の部品（`components/travel/Guide.tsx`）と見た目の言葉はそろえるが、**記事の側に写して持つ**
 * （あちらは作り直しの最中。#1203）。
 *
 * ## 見張りが読む印（`python/guide_watch.py`・`python/guide_article.py`）
 *
 * - 本文は `<article class="tg …">` の中だけを読む。**`tg` を外すと見張りが「本文が無い」で 2 になる**
 * - 本人の一言は `data-quote="ayato"`。場面のリンク（`<a href=…&t=…s>`）の中に置く
 * - 外の出どころの行は `tg-ext`（額を facts と突き合わせない）。配信の題の並びは `tg-vids`（題はそのまま）
 * - 足し算した額は `data-sum` と `data-parts`（部品の場面）。見張りが足し直して突き合わせる
 */

/* ---------------------------------------------------------------- 小さな部品 */

/** 場面の札（「10/14 0:56:30」）。表の行の場面へ */
export function At({ at }: { at: Scene }) {
  return (
    <a className="ta-at" href={watchUrl(at)} target="_blank" rel="noopener noreferrer">
      <i className="ta-yt" aria-hidden />
      <time dateTime={at.date}>{md(at.date)}</time>
      <span>{hms(at.t)}</span>
    </a>
  );
}

/** 本人の一言（吹き出し）。**全体が1つのリンク**で、YouTube のその場面が開く。字は facts の `quote` のまま */
export function Say({ q }: { q: Quote }) {
  return (
    <a className="ta-say" href={watchUrl(q.at)} target="_blank" rel="noopener noreferrer">
      <img className="ta-say-face" src={AYATO_SRC} alt="" width={26} height={38} loading="lazy" />
      <span className="ta-say-b">
        <span className="ta-say-q">
          「<span data-quote="ayato">{q.q}</span>」
        </span>
        <span className="ta-say-at">
          <i className="ta-yt" aria-hidden />
          <time dateTime={q.at.date}>{md(q.at.date)}</time> {hms(q.at.t)}
        </span>
      </span>
    </a>
  );
}

/** この場面の配信ボタン。**記事の山場に1つ** */
export function SceneButton({ at }: { at: Scene }) {
  return (
    <a className="ta-scene" href={watchUrl(at)} target="_blank" rel="noopener noreferrer">
      <Icon name="youtube" size={22} />
      <b>この場面</b>
      <span>
        <time dateTime={at.date}>{md(at.date)}</time> {hms(at.t)}
      </span>
    </a>
  );
}

/** あやと島カードの素の写真。真下に「あやと撮影・日付」（その日の配信へ） */
export function Figure({ p, sizes, eager, className = "ta-fig" }: { p: Photo; sizes: string; eager?: boolean; className?: string }) {
  return (
    <figure className={className}>
      <img
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
      <figcaption>
        <a href={videoUrl(p.v)} target="_blank" rel="noopener noreferrer" aria-label={`この写真の日の配信（${jpDate(p.day)}）`}>
          あやと撮影・<time dateTime={p.day}>{jpDate(p.day)}</time>
        </a>
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- 頭・目次 */

export function Head({
  h1,
  lead,
  cover,
  went,
  published,
  updated,
}: {
  h1: string[];
  lead: string;
  cover: Photo | null;
  went: { from: string; text: string };
  published: string;
  updated: string;
}) {
  const [main, ...sub] = h1;
  return (
    <header className="ta-head">
      <h1>
        <span className="ta-h1-main">{main}</span>
        {sub.map((s) => (
          <span key={s} className="ta-h1-sub">
            {s}
          </span>
        ))}
      </h1>
      <p className="ta-lead">{lead}</p>
      <p className="ta-dates">
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
      {cover && <Figure p={cover} sizes="(min-width: 940px) 900px, 100vw" eager className="ta-cover" />}
    </header>
  );
}

export function Toc({ items }: { items: { id: string; label: string; icon: IconName }[] }) {
  return (
    <nav className="ta-toc" id="toc" aria-labelledby="toc-h">
      <p className="ta-toc-h" id="toc-h">
        目次
      </p>
      <ol>
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#${it.id}`}>
              <span className="ta-toc-n">{String(i + 1).padStart(2, "0")}</span>
              <Icon name={it.icon} size={20} />
              <span>{it.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------- 節 */

export function Sec({
  id,
  n,
  icon,
  h,
  answer,
  className = "",
  children,
}: {
  id: string;
  n: number;
  icon: IconName;
  h: string;
  answer?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ta-sec ${className}`} id={id} aria-labelledby={`${id}-h`}>
      <h2 className="ta-sec-h" id={`${id}-h`}>
        <span className="ta-sec-n">{String(n).padStart(2, "0")}</span>
        <Icon name={icon} size={26} className="ta-sec-i" />
        <span>{h}</span>
      </h2>
      {answer && <p className="ta-answer">{answer}</p>}
      {children}
      <p className="ta-up">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

/**
 * 先に答え: 1日いくら。合計は道具が部品を足した額で、`data-sum` と部品の場面（`data-parts`）を持つ。
 * 見張りが部品の facts の額から足し直して、字と合っているかを見る（`python/guide_article.py`）。
 */
export function Days({ days }: { days: Day[] }) {
  const [base, ...more] = days;
  const sum = (d: Day) => (
    <b data-sum={d.value} data-parts={d.parts.map((p) => `${p.at.v}:${p.at.t}`).join(",")}>
      {d.sum}
    </b>
  );
  /* 2つ目からは「1つ目＋足したもの」で見せる。同じ内訳を3回並べると、スマホで1画面ぶん伸びる */
  const isBase = (p: Day["parts"][number]) => base.parts.some((b) => b.label === p.label && b.amount === p.amount);
  return (
    <ol className="ta-days">
      <li className="ta-day is-base">
        <p className="ta-day-h">{base.label}</p>
        <p className="ta-day-n">{sum(base)}</p>
        <ul>
          {base.parts.map((p) => (
            <li key={p.label}>
              <span>{p.label}</span>
              <span>{p.amount}</span>
            </li>
          ))}
        </ul>
      </li>
      {more.map((d) => (
        <li key={d.label} className="ta-day is-plus">
          <p className="ta-day-h">{d.label}</p>
          <p className="ta-day-n">{sum(d)}</p>
          <p className="ta-day-plus">
            {d.parts.every(isBase) || !d.parts.some(isBase) ? null : <>{base.label}</>}
            {d.parts
              .filter((p) => !isBase(p))
              .map((p) => (
                <span key={p.label}>
                  ＋ {p.label} {p.amount}
                </span>
              ))}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Points({ points }: { points: { head: string; text: string }[] }) {
  return (
    <dl className="ta-points">
      {points.map((p) => (
        <div key={p.head}>
          <dt>{p.head}</dt>
          <dd>{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Body({ blocks, sizes }: { blocks: Block[]; sizes: string }) {
  return (
    <>
      {blocks.map((b, i) =>
        "text" in b ? (
          <p key={i} className="ta-p">
            {b.text}
          </p>
        ) : "quote" in b ? (
          <div key={i} className="ta-says">
            <Say q={b.quote} />
          </div>
        ) : (
          <Figure key={i} p={b.photo} sizes={sizes} />
        ),
      )}
    </>
  );
}

/** 値段の表。**数字は `<table>` で**（6章）。行ごとに「いつ・場面」 */
export function PriceTable({ caption, rows }: { caption: string; rows: PriceRow[] }) {
  return (
    <table className="ta-price">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">何に</th>
          <th scope="col">いくら</th>
          <th scope="col">いつ・場面</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.at.v}-${r.at.t}-${r.what}`} className={r.total ? "is-total" : undefined}>
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

export function Pairs({ pairs }: { pairs: { head: string; text: string }[] }) {
  return (
    <dl className="ta-pairs">
      {pairs.map((p) => (
        <div key={p.head}>
          <dt>{p.head}</dt>
          <dd>{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 外の出どころの1行。押せる所は出どころの名前だけ。**`tg-ext` は見張りの印**（額を facts と突き合わせない） */
export function ExtLine({ e }: { e: Ext }) {
  return (
    <p className="tg-ext ta-ext">
      {e.text}（
      <a href={e.src} target="_blank" rel="noopener noreferrer">
        {e.name}
      </a>
      ・<time dateTime={e.seen}>{jpDate(e.seen)}</time>に見た）
    </p>
  );
}

export function Keyword({ k }: { k: NonNullable<ArticleSection["keyword"]> }) {
  return (
    <aside className="ta-key" aria-label={k.title}>
      <p className="ta-key-tag">Keyword</p>
      <p className="ta-key-t">{k.title}</p>
      {k.lines.map((l) => (
        <p key={l} className="ta-p">
          {l}
        </p>
      ))}
      {k.ext.map((e) => (
        <ExtLine key={e.src} e={e} />
      ))}
    </aside>
  );
}

/* ---------------------------------------------------------------- 面の終わり */

/** この記事の配信。場面をよく引いた回を先に。**題はそのまま**（`tg-vids` は見張りの印） */
export function Streams({ open, rest }: { open: CityStream[]; rest: CityStream[] }) {
  return (
    <>
      <div className="tg-vids ta-vids">
        {open.map((s) => (
          <Vid key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} />
        ))}
      </div>
      {rest.length > 0 && (
        <Fold title="ほかの回" note={`${rest.length}本`}>
          <div className="tg-vids ta-vids">
            {rest.map((s) => (
              <Vid key={s.videoId} videoId={s.videoId} title={s.title} date={s.date} />
            ))}
          </div>
        </Fold>
      )}
    </>
  );
}

export function NextRead({ items }: { items: { href: string; title: string; note: string; icon: IconName }[] }) {
  return (
    <nav className="ta-next" aria-labelledby="next-h">
      <h2 id="next-h" className="ta-end-h">
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

/** 書き手の枠。**文を書いているのは案内鳥、体験はあやと**（guide-design 9章の1） */
export function Writer() {
  const yt = LINKS.find((l) => l.id === "youtube");
  return (
    <aside className="ta-writer" aria-label="書き手">
      <img className="ta-writer-face" src={AYATO_SRC} alt={`${PROFILE.name}（あやと島の絵）`} width={66} height={96} loading="lazy" />
      <div className="ta-writer-b">
        <p className="ta-writer-name">
          <b>{PROFILE.name}</b>
        </p>
        <p className="ta-writer-sign">毎晩22時、世界のどこかから生配信</p>
        <p className="ta-writer-sub">旅して、食べて、グルメアプリを作る、夜の居場所</p>
        <p className="ta-writer-by">あやとの配信から、あやと島案内鳥がまとめています。</p>
        <div className="ta-writer-go">
          {yt && (
            <a className="ta-go" href={yt.href} target="_blank" rel="noopener noreferrer">
              <Icon name="youtube" size={20} />
              YouTube チャンネル
            </a>
          )}
          <Link className="ta-go" href="/about" prefetch={false}>
            <Icon name="island" size={20} />
            あやとのこと
          </Link>
          <Link className="ta-go" href="/" prefetch={false}>
            <Icon name="home" size={20} />
            あやと島へ
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** 出どころの一覧 */
export function Sources({ ext }: { ext: Ext[] }) {
  return (
    <section className="ta-sources" aria-labelledby="sources-h">
      <h2 id="sources-h" className="ta-end-h">
        出どころ
      </h2>
      <ul>
        <li>写真は、あやとがその日に撮ったもの</li>
        <li>値段・本人の一言・場面は、あやとの YouTube の配信</li>
        {ext.map((e) => (
          <li key={e.src}>
            <a href={e.src} target="_blank" rel="noopener noreferrer">
              {e.name}
            </a>
            （<time dateTime={e.seen}>{jpDate(e.seen)}</time>に見た）
          </li>
        ))}
      </ul>
    </section>
  );
}
