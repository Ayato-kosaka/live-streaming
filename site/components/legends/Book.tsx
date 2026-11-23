import type { CSSProperties, ReactNode } from "react";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Tiles } from "@/components/guidebook/Items";
import Sheet from "@/components/guidebook/Sheet";
import { Ext, Facts, MapsLink, Picture, Sec, SrcLine, jpDate, sheetId, shortName } from "@/components/guidebook/parts";
import type { BookDrawn } from "@/content/legends/drawn";
import type { BookDish, BookSection, Eaten, LegendBook } from "@/content/legends/types";
import type { Src } from "@/content/guidebook/types";

/**
 * **企画の面（`/legends/<企画>`）の部品。** 中身は焼いたもの（`content/legends/<企画>.ts`）で、**ここに字は書かない**——
 * 節の名前・★の言葉・欄の名前まで焼いた中身から読む（企画書 #1404 の字）。ここで持つ字は、街のガイドの部品と同じ
 * 押しどころの名前（目次へ・閉じる・すべて・出どころ）と、数の単位だけ。
 *
 * 形は街のガイド（`components/guidebook/`）のまま: 節（`Sec`）・札の格子と窓（`Tiles`・`Sheet`）・出どころ（`SrcLine`）。
 * 色は地域ごとに1つ（`legends.css` の `--lb-<地域>`）。
 */

/** 節の絵。目次の札と節の見出しで同じ（街のガイドの `tocOf` と同じ決まり） */
const ICON: Record<BookSection, IconName> = {
  rules: "checklist",
  stamps: "stampbook",
  words: "book",
  regions: "map",
  compare: "spice",
  dishes: "eat",
  route: "road",
  sights: "camera",
  tips: "firstaid",
  faq: "question",
};

/** 節の並び（企画書5章）。見ておきたい5か所は回りかたの中なので、目次には出さない */
const ORDER: BookSection[] = ["rules", "stamps", "words", "regions", "compare", "dishes", "route", "tips", "faq"];

/** 節の番号（01〜）。並びは `ORDER` から */
export const secNo = (s: BookSection) => ORDER.indexOf(s) + 1;

/** 目次の札（`components/guidebook/Toc.tsx` に渡す）。数の後ろの字は単位だけ */
export function bookToc(b: LegendBook, eaten: Eaten[]): { id: string; label: string; icon: IconName; note: string }[] {
  const note: Record<BookSection, string> = {
    rules: `${b.rules.length}つ`,
    stamps: `${eaten.length}/${b.goal.n}${b.goal.unit}`,
    words: `${b.words.length}語`,
    regions: `${b.regions.length}地域`,
    compare: `${b.compare.length}組`,
    dishes: `${b.dishes.length}品`,
    route: `${b.route.length}街・${b.sights.length}か所`,
    sights: `${b.sights.length}か所`,
    tips: `${b.tips.length}つ`,
    faq: `${b.faq.length}問`,
  };
  return ORDER.map((s) => ({ id: s, label: b.sections[s], icon: ICON[s], note: note[s] }));
}

/** 節ひとつ（街のガイドの `Sec` に、焼いた名前と絵を渡すだけ） */
function BookSec({ b, s, children }: { b: LegendBook; s: BookSection; children: ReactNode }) {
  return (
    <Sec id={s} n={secNo(s)} icon={ICON[s]} title={b.sections[s]}>
      {children}
    </Sec>
  );
}

/** 地域の色（`legends.css`）。地域の id から */
const tone = (region: string) => ({ "--lb-tone": `var(--lb-${region})` }) as CSSProperties;

const dishOf = (b: LegendBook, id: string) => b.dishes.find((d) => d.id === id) as BookDish;

/** 100品の窓へ送る小さな札（地域・食べ比べから） */
function DishChip({ d, note }: { d: BookDish; note?: string }) {
  return (
    <a className="lb-chip" href={`#${sheetId("dish", d.id)}`} style={tone(d.region)}>
      <b>{shortName(d.name)}</b>
      <i>{note ?? d.city}</i>
    </a>
  );
}

/**
 * 0 表紙。**見出し・見出しの下の一行・「◯/100食」・始まる日と入る街**（企画書4章の最初の1画面）。
 * 表紙の絵が来たら上に置く。来ないあいだは絵の枠を出さない（空のマスを置かない。`docs/guide-design.md` 4-1）
 */
export function BookCover({ b, eaten, drawn }: { b: LegendBook; eaten: Eaten[]; drawn: BookDrawn }) {
  return (
    <header className="lb-cover" data-gb="cover">
      {drawn.cover && (
        <div className="lb-cover-art">
          <Picture pic={drawn.cover} sizes="(min-width: 960px) 900px, 100vw" ratio="16 / 9" eager />
        </div>
      )}
      <h1 className="lb-h1">{b.meta.h1}</h1>
      <p className="lb-sub">{b.meta.sub}</p>
      <p className="lb-count">
        <b>{eaten.length}</b>
        <span>
          / {b.goal.n}
          {b.goal.unit}
        </span>
      </p>
      <p className="lb-start">
        <time dateTime={b.meta.start}>{b.start}</time>
      </p>
      {/* 台紙の頭（企画書4章の最初の1画面）。押すと台紙の節へ */}
      <a className="lb-cover-card" href="#stamps" aria-label={`${b.sections.stamps} ${eaten.length}/${b.goal.n}`}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={eaten[i] ? "is-done" : undefined} />
        ))}
      </a>
      <p className="lb-updated">
        最終更新 <time dateTime={b.updated}>{jpDate(b.updated)}</time>
      </p>
    </header>
  );
}

/** 1 決まり。本人の言葉を1つ（場面から開く） */
export function Rules({ b }: { b: LegendBook }) {
  const q = b.quote;
  return (
    <BookSec b={b} s="rules">
      <ol className="lb-rules">
        {b.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <figure className="lb-quote">
        <blockquote>「{q.text}」</blockquote>
        <figcaption>
          <a href={`https://www.youtube.com/watch?v=${q.v}&t=${q.t}s`} target="_blank" rel="noreferrer">
            <Icon name="play" size={14} />
            <time dateTime={q.date}>{q.cite}</time>
          </a>
        </figcaption>
      </figure>
    </BookSec>
  );
}

/**
 * 2 食べた100食（スタンプラリーの台紙）。**丸がゴールの数だけ**並び、食べた順に埋まる（企画書5章の2）。
 * 旅の前は台紙だけ。払った額の合計は、食べた分だけ出す（0食のときは出さない）
 */
export function Stamps({ b, eaten }: { b: LegendBook; eaten: Eaten[] }) {
  const yen = eaten.reduce((n, e) => n + (e.yen ?? 0), 0);
  const slots = Array.from({ length: b.goal.n }, (_, i) => eaten[i]);
  return (
    <BookSec b={b} s="stamps">
      <p className="lb-count is-sec">
        <b>{eaten.length}</b>
        <span>
          / {b.goal.n}
          {b.goal.unit}
        </span>
        {yen > 0 && <i>{yen.toLocaleString("ja-JP")}円</i>}
      </p>
      <ol className="lb-card" aria-label={`${b.sections.stamps} ${eaten.length}/${b.goal.n}`}>
        {slots.map((e, i) => (
          <li key={i} className={e ? "is-done" : undefined}>
            {e ? <Stamp e={e} b={b} /> : <span aria-hidden="true">{i + 1}</span>}
          </li>
        ))}
      </ol>
    </BookSec>
  );
}

/** 食べた1食の丸。写真・何食目・街・料理・払った額・配信の時刻 */
function Stamp({ e, b }: { e: Eaten; b: LegendBook }) {
  const d = e.dish ? dishOf(b, e.dish) : undefined;
  const body = (
    <>
      {e.pic ? <Picture pic={e.pic} sizes="80px" ratio="1 / 1" /> : <b>{e.n}</b>}
      <span className="lb-stamp-b">
        <b>
          {e.n}
          {b.goal.unit}目 {e.name}
        </b>
        <i>
          <time dateTime={e.date}>{jpDate(e.date).slice(5)}</time>・{e.city}
          {e.yen !== undefined && `・${e.yen.toLocaleString("ja-JP")}円`}
        </i>
      </span>
    </>
  );
  if (e.scene) {
    return (
      <a href={`https://www.youtube.com/watch?v=${e.scene.v}&t=${e.scene.t}s`} target="_blank" rel="noreferrer" style={d ? tone(d.region) : undefined}>
        {body}
      </a>
    );
  }
  return <span style={d ? tone(d.region) : undefined}>{body}</span>;
}

/** 3 インド料理の基本用語。札は名前と一行、押すと窓 */
export function Words({ b }: { b: LegendBook }) {
  return (
    <BookSec b={b} s="words">
      <ul className="lb-words">
        {b.words.map((w) => (
          <li key={w.id}>
            <a href={`#${sheetId("word", w.id)}`}>
              <b>{w.name}</b>
              <i>{w.lead}</i>
            </a>
          </li>
        ))}
      </ul>
      {b.words.map((w) => (
        <Sheet key={w.id} id={sheetId("word", w.id)} kicker={b.sections.words} title={w.name}>
          <Ext>
            <p className="lb-lead">{w.lead}</p>
            <p>{w.body}</p>
            <SrcLine src={w.src} of={w.name} />
          </Ext>
        </Sheet>
      ))}
    </BookSec>
  );
}

/** 4 地域ごとの料理の違い。色を塗った地図（絵が来たら）と、地域のカード（主食・油・よく食べるもの） */
export function Regions({ b, drawn }: { b: LegendBook; drawn: BookDrawn }) {
  const L = b.regionLabels;
  return (
    <BookSec b={b} s="regions">
      {drawn.map && (
        <div className="lb-map">
          <Picture pic={drawn.map} sizes="(min-width: 720px) 640px, 100vw" ratio={null} />
        </div>
      )}
      <ul className="lb-regions">
        {b.regions.map((r) => (
          <li key={r.id} id={`region-${r.id}`} style={tone(r.id)}>
            <h3>{r.name}</h3>
            <Ext>
              <dl className="gb-facts">
                <div>
                  <dt>{L.staple}</dt>
                  <dd>{r.staple}</dd>
                </div>
                <div>
                  <dt>{L.oil}</dt>
                  <dd>{r.oil}</dd>
                </div>
              </dl>
              <p>{r.body}</p>
              <p className="lb-chips">
                <span>{L.dishes}</span>
                {r.dishes.map((id) => (
                  <DishChip key={id} d={dishOf(b, id)} />
                ))}
              </p>
              <SrcLine src={r.src} of={r.name} />
            </Ext>
          </li>
        ))}
      </ul>
    </BookSec>
  );
}

/** 5 街ごとの食べ比べ。同じ料理が街で変わる組。品は100品の窓へ */
export function Compare({ b, drawn }: { b: LegendBook; drawn: BookDrawn }) {
  return (
    <BookSec b={b} s="compare">
      <div className="lb-compare">
        {b.compare.map((c) => (
          <article key={c.id} id={`compare-${c.id}`}>
            <h3>{c.title}</h3>
            <Ext>
              <p className="lb-lead">{c.lead}</p>
              <ul className="lb-row">
                {c.items.map((it) => {
                  const d = dishOf(b, it.dish);
                  return (
                    <li key={it.dish} style={tone(d.region)}>
                      <a href={`#${sheetId("dish", d.id)}`}>
                        <Picture pic={drawn.dishes[d.id]} sizes="120px" ratio="1 / 1" label={shortName(d.name).slice(0, 1)} />
                        <b>{d.city}</b>
                        <i>{it.note}</i>
                      </a>
                    </li>
                  );
                })}
              </ul>
              <SrcLine src={c.src} of={c.title} />
            </Ext>
          </article>
        ))}
      </div>
    </BookSec>
  );
}

/**
 * 6 食べるべき100品。**札の格子と窓は街のガイドの `Tiles` のまま**（★と豚・酒・牛は窓の中だけ。`docs/guide-design.md` ★7）。
 * 地域で絞る札は、街のガイドの「食べたいもの」と同じ作り（JS を使わず、`:has()` で格子の札を隠す）
 */
export function Dishes({ b, drawn }: { b: LegendBook; drawn: BookDrawn }) {
  const name = `lb-region-${b.slug}`;
  const items = b.dishes.map((d) => ({ ...d, pic: drawn.dishes[d.id] }));
  return (
    <BookSec b={b} s="dishes">
      <div className="gb-eat lb-dishes">
        <fieldset className="gb-kinds">
          <legend className="sr-only">{b.sections.regions}</legend>
          <input type="radio" name={name} id={`${name}-all`} value="all" defaultChecked />
          <label htmlFor={`${name}-all`}>
            すべて<i>{items.length}</i>
          </label>
          {b.regions.map((r) => (
            <Radio key={r.id} name={name} id={r.id} count={items.filter((it) => it.region === r.id).length}>
              {r.name}
            </Radio>
          ))}
        </fieldset>
        <style>
          {b.regions.map((r) => `.lb-dishes:has(#${name}-${r.id}:checked) .gb-tiles > li:not([data-kinds~="${r.id}"]){display:none}`).join("")}
        </style>
        <Tiles kind="dish" items={items} cols={3} todo={[]} kicker={b.sections.dishes} stars={b.stars} />
      </div>
    </BookSec>
  );
}

function Radio({ name, id, count, children }: { name: string; id: string; count: number; children: ReactNode }) {
  return (
    <>
      <input type="radio" name={name} id={`${name}-${id}`} value={id} />
      <label htmlFor={`${name}-${id}`}>
        {children}
        <i>{count}</i>
      </label>
    </>
  );
}

/**
 * 7 回りかた。**順番だけ**（日付は書かない。企画書8章）。点と線の図は、道の街の緯度・経度から描く（国の形は描かない）。
 * その下に見ておきたい5か所（札を押すと窓）
 */
export function Route({ b }: { b: LegendBook }) {
  const pts = b.route;
  const W = 300;
  const H = 360;
  const pad = 28;
  const [x0, x1] = [Math.min(...pts.map((p) => p.lon)), Math.max(...pts.map((p) => p.lon))];
  const [y0, y1] = [Math.min(...pts.map((p) => p.lat)), Math.max(...pts.map((p) => p.lat))];
  const k = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1));
  const at = (p: { lat: number; lon: number }) => [pad + (p.lon - x0) * k, H - pad - (p.lat - y0) * k] as const;
  return (
    <BookSec b={b} s="route">
      <div className="lb-route">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={pts.map((p) => p.city).join(" → ")}>
          <polyline points={pts.map((p) => at(p).join(",")).join(" ")} />
          {pts.map((p, i) => {
            const [x, y] = at(p);
            return (
              <g key={`${p.city}-${i}`} style={tone(p.region)}>
                <circle cx={x} cy={y} r={9} />
                <text x={x} y={y + 3.5}>
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
        <ol className="lb-stops">
          {pts.map((p, i) => (
            <li key={`${p.city}-${i}`} style={tone(p.region)}>
              <b>{i + 1}</b>
              {p.city}
            </li>
          ))}
        </ol>
      </div>
      <h3 className="gb-sub" id="sights">
        <Icon name={ICON.sights} size={20} />
        {b.sections.sights}
      </h3>
      <ul className="lb-words is-sights">
        {b.sights.map((s) => (
          <li key={s.id}>
            <a href={`#${sheetId("sight", s.id)}`}>
              <b>{s.name}</b>
              <i>{s.lead}</i>
            </a>
          </li>
        ))}
      </ul>
      {b.sights.map((s) => (
        <Sheet key={s.id} id={sheetId("sight", s.id)} kicker={b.sections.sights} title={s.name}>
          <Ext>
            <p className="lb-lead">{s.lead}</p>
            <p>{s.what}</p>
            <Facts rows={[{ label: "入場", text: s.price }]} />
            <SrcLine src={s.src} of={s.name} />
          </Ext>
          <MapsLink href={s.maps} of={s.name} />
        </Sheet>
      ))}
    </BookSec>
  );
}

/** 8 屋台でお腹を壊さないコツ。医療の助言はしない（出どころは外務省・検疫所。材料が持つ） */
export function Tips({ b }: { b: LegendBook }) {
  return (
    <BookSec b={b} s="tips">
      <div className="gb-qa">
        {b.tips.map((t) => (
          <div className="gb-qa-one" key={t.id}>
            <h3 className="gb-qa-q">{t.title}</h3>
            <Ext>
              <p className="gb-qa-a">{t.body}</p>
              <SrcLine src={t.src} of={t.title} />
            </Ext>
          </div>
        ))}
      </div>
    </BookSec>
  );
}

/** よくある質問（検索の問い）。問いも答えも面にそのまま見える字（名札 `FAQPage` と同じ字） */
export function Faq({ b }: { b: LegendBook }) {
  return (
    <BookSec b={b} s="faq">
      <div className="gb-qa">
        {b.faq.map((f) => (
          <div className="gb-qa-one" key={f.q}>
            <h3 className="gb-qa-q">{f.q}</h3>
            <Ext>
              <p className="gb-qa-a">{f.a}</p>
              <SrcLine src={f.src} of={f.q} />
            </Ext>
          </div>
        ))}
      </div>
    </BookSec>
  );
}

/** 面の終わりの出どころの一覧（畳む）。窓の中にも、その1件の出どころがある */
export function BookSources({ b, drawn }: { b: LegendBook; drawn: BookDrawn }) {
  const all: Src[] = [
    ...b.words.flatMap((x) => x.src),
    ...b.regions.flatMap((x) => x.src),
    ...b.compare.flatMap((x) => x.src),
    ...b.dishes.flatMap((x) => x.src),
    ...b.sights.flatMap((x) => x.src),
    ...b.tips.flatMap((x) => x.src),
    ...b.faq.flatMap((x) => x.src),
  ];
  const seen = new Set<string>();
  const src = all.filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  const drew = !!(drawn.cover || drawn.map || Object.keys(drawn.dishes).length);
  return (
    <section className="gb-sources" aria-labelledby="sources-h" data-gb="sources">
      <h2 id="sources-h" className="sr-only">
        出どころ
      </h2>
      <Fold title="出どころ" note={`${src.length}件`}>
        <ul className="gb-src-list">
          {src.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" aria-label={`${s.name}（${s.url.replace(/^https?:\/\//, "").slice(0, 64)}）`} data-quote="src">
                {s.name}
              </a>
              <i>{s.url.replace(/^https?:\/\//, "").slice(0, 64)}</i>
            </li>
          ))}
        </ul>
        {/* 街のガイドと同じ1行（`components/guidebook/Sources.tsx`）。絵の上には「イラスト」の札を乗せない */}
        {drew && <p className="gb-note">写真ではない絵（表紙・地図・料理のイラスト）は、あやと島案内鳥が AI で描いたもの。</p>}
      </Fold>
    </section>
  );
}
