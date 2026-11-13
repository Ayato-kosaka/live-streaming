import type { ReactNode } from "react";
import Link from "next/link";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Vid } from "@/components/streams/Vid";
import type { CityStream } from "@/content/cityStreams";
import { LINKS, PROFILE } from "@/content/site";
import type {
  Big,
  Card,
  Ext,
  Keyword as KeywordT,
  Line,
  Local,
  Measured,
  Move,
  Photo,
  PriceTable,
  Quote,
  Scene,
  SectionId,
} from "@/content/travel/types";
import { AYATO_SRC } from "@/lib/ayatoArt";

import { hms, jpDate, md, videoUrl, watchUrl } from "./scene";

/**
 * 街のガイドの面の部品（`docs/guide-design.md` 3章）。**どの街の面も、これを同じ並びで使う。**
 *
 * - 押せるものには厚み、押せないものは平ら（48px のボタンで 6px、30px の札で 4px）
 * - 吹き出し・驚く数・場面の札は押せる（配信のその場面へ。素の `<a href>`）
 * - Keyword・表の地・出どころの1行は押せない
 *
 * 字はここに書かない。**街ごとの字は焼いた中身から、節の見出しと並びは面の側から。**
 * ここに残る字は、部品の名札（「この場面」「実測」「行った」など）だけ。
 */

/* ---------------------------------------------------------------- 節の名簿 */

/** 節の見出し（問いの形）・目次の短い形・絵。**街が変わっても変えない**（2-0） */
export const SECTION_HEAD: Record<SectionId | "streams", { h: string; toc: string; icon: IconName }> = {
  about: { h: "どんな街？ 歩いて安心？", toc: "どんな街？", icon: "oldtown" },
  move: { h: "どう行く？ 着いたら、どう動く？", toc: "どう行く？", icon: "bus" },
  money: { h: "いくらかかった？", toc: "いくら？", icon: "wallet" },
  places: { h: "どこへ行った？", toc: "どこへ？", icon: "pin" },
  food: { h: "何を食べた？", toc: "食べた", icon: "eat" },
  stay: { h: "どこに泊まった？", toc: "泊まる", icon: "bunk" },
  caution: { h: "気をつけることは？", toc: "気をつける", icon: "alert" },
  trip: { h: "日帰りで、どこへ行ける？", toc: "日帰り", icon: "mountain" },
  streams: { h: "の配信", toc: "配信", icon: "youtube" },
};

/* ---------------------------------------------------------------- 小さな部品 */

/** 場面の札（「10/14 0:56:30」）。その行の事実の場面へ */
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
 * 字は facts の `quote` のまま（字幕の字。直さない）。
 */
export function Say({ q }: { q: Quote }) {
  return (
    <a className="tg-say" href={watchUrl(q.at)} target="_blank" rel="noopener noreferrer">
      <img className="tg-say-face" src={AYATO_SRC} alt="" width={26} height={38} loading="lazy" />
      <span className="tg-say-b">
        <span className="tg-say-q">
          「<span data-quote="ayato">{q.q}</span>」
        </span>
        <span className="tg-say-at">
          <i className="tg-yt" aria-hidden />
          <time dateTime={q.at.date}>{md(q.at.date)}</time> {hms(q.at.t)}
        </span>
      </span>
    </a>
  );
}

/** 一言の並び。4つ目からは畳む（2-1 の終わり） */
export function Says({ qs, more = [] }: { qs: Quote[]; more?: Quote[] }) {
  if (!qs.length && !more.length) return null;
  return (
    <div className="tg-says">
      {qs.map((q) => (
        <Say key={`${q.at.v}-${q.at.t}`} q={q} />
      ))}
      {more.length > 0 && (
        <Fold title="ほかの一言" note={`${more.length}つ`}>
          <div className="tg-says">
            {more.map((q) => (
              <Say key={`${q.at.v}-${q.at.t}`} q={q} />
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}

/** この場面の配信ボタン。**節に1つ**（その節でいちばん見てほしい場面） */
export function SceneButton({ at }: { at: Scene }) {
  return (
    <a className="tg-scene" href={watchUrl(at)} target="_blank" rel="noopener noreferrer">
      <Icon name="youtube" size={22} />
      <b>この場面</b>
      <span>
        <time dateTime={at.date}>{md(at.date)}</time> {hms(at.t)}
      </span>
    </a>
  );
}

/** 案内鳥の行。**どの行も場面を1つ持つ** */
export function Lines({ lines }: { lines: Line[] }) {
  if (!lines.length) return null;
  return (
    <ul className="tg-lines">
      {lines.map((l) => (
        <li key={`${l.at.v}-${l.at.t}-${l.text.slice(0, 8)}`}>
          <p>
            {l.text} <At at={l.at} />
          </p>
          {l.quote && <Say q={l.quote} />}
        </li>
      ))}
    </ul>
  );
}

/** 外の出どころの1行。出どころの名前がリンク */
export function ExtLine({ e }: { e: Ext }) {
  return (
    <p className="tg-ext">
      {e.text}
      <span>
        （
        <a href={e.src} target="_blank" rel="noopener noreferrer">
          {e.name}
        </a>
        ）
      </span>
    </p>
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

/** 写真の出どころ。カードの写真は「あやと撮影・日付」、その日の配信へ */
export function PhotoCredit({ p }: { p: Photo }) {
  return (
    <p className="tg-credit">
      <a href={videoUrl(p.v)} target="_blank" rel="noopener noreferrer" aria-label={`この写真の日の配信（${jpDate(p.day)}）`}>
        あやと撮影・<time dateTime={p.day}>{jpDate(p.day)}</time>
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

/* ---------------------------------------------------------------- 節 */

/** 節ひとつ。番号・絵・問いの見出し・答えの1〜2文・中身・場面ボタン・目次へ */
export function Sec({
  id,
  n,
  head,
  answer,
  scene,
  children,
}: {
  id: string;
  n: number;
  head: { h: string; icon: IconName };
  answer?: string;
  scene?: Scene | null;
  children: ReactNode;
}) {
  return (
    <section className="tg-sec" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="tg-sec-h" id={`${id}-h`}>
        <span className="tg-sec-n">{String(n).padStart(2, "0")}</span>
        <Icon name={head.icon} size={26} className="tg-sec-i" />
        <span className="tg-sec-t">{head.h}</span>
      </h2>
      {answer && <p className="tg-answer">{answer}</p>}
      {children}
      {scene && <SceneButton at={scene} />}
      <p className="tg-up">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- 表紙・驚く数・目次 */

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
            行った日{" "}
            <time dateTime={went.from}>{went.text}</time>
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
    <nav className="tg-toc" id="toc" aria-label="この面の中身">
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

/* ---------------------------------------------------------------- 節の中身 */

export function MoveCard({ m }: { m: Move }) {
  return (
    <div className="tg-move">
      <p className="tg-move-h">
        <b>{m.from}</b>
        <Icon name="right" size={14} />
        <b>{m.to}</b>
        <em>{m.by}</em>
      </p>
      <p className="tg-move-got">
        {m.said && (
          <>
            <span className="tg-move-said">{m.said}</span>
            <Icon name="right" size={14} />
          </>
        )}
        <b>{m.got}</b> <At at={m.at} />
      </p>
      <Lines lines={m.lines} />
      {m.quote && <Say q={m.quote} />}
    </div>
  );
}

export function PriceTables({ tables }: { tables: PriceTable[] }) {
  if (!tables.length) return null;
  return (
    <div className="tg-prices">
      {tables.map((t) => (
        <table key={t.caption} className="tg-price">
          <caption>{t.caption}</caption>
          <thead>
            <tr>
              <th scope="col">何に</th>
              <th scope="col">いくら</th>
              <th scope="col">いつ・場面</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
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
      ))}
      <p className="tg-note">円は、あやとがその場で円に直して言った額。</p>
    </div>
  );
}

export function Keyword({ k }: { k: KeywordT }) {
  return (
    <aside className="tg-key" aria-label={k.title}>
      <p className="tg-key-tag">Keyword</p>
      <p className="tg-key-t">{k.title}</p>
      <Lines lines={k.lines} />
      {k.ext.map((e) => (
        <ExtLine key={e.src} e={e} />
      ))}
    </aside>
  );
}

/** カードの「行った」の札（日付つき） */
function Went({ days }: { days: string[] }) {
  if (!days.length) return null;
  return (
    <p className="tg-went">
      <span className="tg-went-tag">
        <Icon name="check" size={12} />
        行った
      </span>
      {days.map((d, i) => (
        <span key={d}>
          {i > 0 && "・"}
          <time dateTime={d}>{md(d)}</time>
        </span>
      ))}
    </p>
  );
}

/**
 * 見どころ・店・失敗談・遠出のカード。**並びは毎回同じ**（ca-voir の「1軒ぶん」）:
 * 写真 → 色の小見出し → 番号と名前 → 現地のつづり → 行った → 行 → 測った値 → 一言 → 最後に情報の塊
 */
export function CardView({ c, kind, sizes }: { c: Card; kind: "place" | "shop" | "caution" | "trip"; sizes: string }) {
  return (
    <article className={`tg-card is-${kind}`} id={`${kind}-${c.key}`}>
      {c.photo && (
        <figure className="tg-card-ph">
          <Pic p={c.photo} sizes={sizes} />
          <figcaption>
            <PhotoCredit p={c.photo} />
          </figcaption>
        </figure>
      )}
      <div className="tg-card-b">
        {c.sub && <p className="tg-card-sub">{c.sub}</p>}
        <h3 className="tg-card-h">
          {c.n !== undefined && <span className="tg-card-n">{c.n}</span>}
          {c.name}
        </h3>
        {c.local && <LocalName l={c.local} />}
        {kind !== "caution" && <Went days={c.went} />}
        <Lines lines={c.lines} />
        {c.measured.length > 0 && (
          <div className="tg-meases">
            {c.measured.map((m) => (
              <MeasuredTag key={`${m.from.t}-${m.to.t}`} m={m} />
            ))}
          </div>
        )}
        <Says qs={c.quotes} more={c.more} />
        {(c.info.length > 0 || c.maps) && (
          <dl className="tg-info">
            {c.info.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>
                  {f.text} <At at={f.at} />
                </dd>
              </div>
            ))}
            {c.maps && (
              <div>
                <dt>地図</dt>
                <dd>
                  <a className="tg-maps" href={c.maps} target="_blank" rel="noopener noreferrer" aria-label={`Google マップで開く（${c.name}）`}>
                    <Icon name="map" size={14} />
                    Google マップ
                    <Icon name="external" size={12} />
                  </a>
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </article>
  );
}

/** 料理の格子。写真が先、その下に名前。押すと開く: どこで・額・一言・場面 */
export function Dishes({ dishes }: { dishes: Card[] }) {
  if (!dishes.length) return null;
  return (
    <div className="tg-dishes">
      {dishes.map((d) => (
        <details key={d.key} className="tg-dish" id={`dish-${d.key}`}>
          <summary>
            {d.photo && (
              <span className="tg-dish-ph">
                <Pic p={d.photo} sizes="(min-width: 720px) 300px, 48vw" />
              </span>
            )}
            <span className="tg-dish-b">
              <h3>{d.name}</h3>
              {d.where && <span className="tg-dish-where">{d.where}</span>}
              <Went days={d.went} />
            </span>
            <Icon name="chevron" size={16} className="tg-dish-c" />
          </summary>
          <div className="tg-dish-more">
            <Lines lines={d.lines} />
            {d.price && (
              <p className="tg-dish-price">
                {d.price.what} <b>{d.price.amount}</b> <At at={d.price.at} />
              </p>
            )}
            <Says qs={d.quotes} more={d.more} />
            {d.photo && <PhotoCredit p={d.photo} />}
          </div>
        </details>
      ))}
    </div>
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

/** 出どころの一覧。外の事実の URL と、現地のつづりの出どころ */
export function Sources({ ext, locals }: { ext: Ext[]; locals: { name: string; l: Local }[] }) {
  return (
    <section className="tg-sources" aria-labelledby="sources-h">
      <h2 id="sources-h" className="tg-sources-h">
        出どころ
      </h2>
      <ul>
        <li>写真は、あやとがその日に撮ったもの</li>
        <li>本人の一言と場面は、あやとの YouTube の配信</li>
        {ext.map((e) => (
          <li key={e.src}>
            <a href={e.src} target="_blank" rel="noopener noreferrer">
              {e.name}
            </a>
            （<time dateTime={e.seen}>{jpDate(e.seen)}</time>に見た）
          </li>
        ))}
        {locals.map(({ name, l }) => (
          <li key={l.src}>
            {name}の現地のつづり <LocalName l={l} />（
            {/* 字は「Wikipedia」で揃えるが、読み上げでは場所ごとに名前を変える。
                同じ名前のリンクが別々の先を指すと、読み上げで聞き分けられない（reachkeys の「おなじ字」） */}
            <a href={l.src} target="_blank" rel="noopener noreferrer" aria-label={`${name}の Wikipedia`}>
              Wikipedia
            </a>
            ）
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
