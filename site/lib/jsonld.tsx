import { guidebookOf } from "@/content/guidebook";
import { LINKS, PROFILE, SITE } from "@/content/site";

/**
 * **機械に渡す名札**（構造化データ。`<script type="application/ld+json">`）を、1か所から出す。
 *
 * ## なぜ要るか
 *
 * 2026-11-13 に本番の 149面を JS なしで読んだら、**構造化データは 0/149** だった
 * （`python/seo_audit.py`）。検索と AI の読み手は、字を読んで「これは誰の、何の面か」を
 * 当てにいくしかなかった。名札を渡せば、当てなくて済む。
 *
 * ## 決めごと
 *
 * - **見えている字と同じことだけを書く。** 画面に無い事実を、機械にだけ渡さない。
 *   名札と本文が食い違うと、名札ごと信用されなくなる
 * - **値は `content/site.ts` から引く。** ここに字を直に書かない。
 *   ドメインも `SITE.url` から（近く独自ドメインへ移る。直書きは移した日に嘘になる）
 * - **本人から聞いた事実だけ**（`PROFILE` の頭の注と同じ）。推測で欄を足さない。
 *   生年月日は画面に出しているが、名札には入れない——年齢は画面が数え直すもので、
 *   機械に配って回るものではない
 * - **型を増やすのは、その型の中身が見えている面ができてから。**
 *   いま在るのは6つ: 島そのもの（`WebSite`）・本人（`ProfilePage` ＋ `Person`）・
 *   現在地（`BreadcrumbList`）・街のガイドの記事（`Article`。2026-11-14、`/travel/<国>/<街>`）・
 *   面に埋めたショート（`VideoObject`。#1228）・街の見どころの一覧（`ItemList` ＋ `TouristAttraction`。#1262）・
 *   街のガイドの「どんな街」の問いと答え（`FAQPage`。#1262。下の `articleLd`）
 *
 * ## 確かめかた
 *
 *   tools/build.sh 3130
 *   python3 python/seo_audit.py --dist site/.next-3130 --no-site \
 *     --expect 'jsonld:/=WebSite,jsonld:/about=ProfilePage+Person,jsonld-bad=0,crumbs=jsonld'
 *
 * 見張りは `python/seo_audit_selftest.py`（名札を外した偽の面で、その足だけ落ちること）。
 */

export type Ld = Record<string, unknown>;

/** 島の中の道を、外から引ける URL に。表紙は `/` を付けない（sitemap と canonical と同じ形） */
export const abs = (path: string) => `${SITE.url}${path === "/" ? "" : path}`;

/** パンくずの頭の1つ。`Crumbs` が同じ字を出す（あちらがここを読む） */
export const SITE_ROOT_LABEL = "島";

/** 同じものを別の面から指すための名前。`@id` は URL の形をした名前で、開ける必要は無い */
const ID = {
  site: `${SITE.url}/#website`,
  person: `${SITE.url}/about#person`,
  org: `${SITE.url}/#org`,
};

/**
 * `<script>` 1つ。**画面には何も出ない**（`<script>` は箱を作らない）。
 *
 * `<` を `<` にしてから埋める。面の名前は自分たちの字だが、
 * `</script>` を含む字が1つでも来たら、そこで `<script>` が閉じて残りが本文に出る。
 */
export function JsonLd({ data }: { data: Ld }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/**
 * 島そのもの。表紙（`/`）にだけ置く。
 *
 * `alternateName` は `<title>` の後ろ半分（`SITE.tagline`）。
 * 検索結果の「サイト名」は、ここと `<title>` と `og:site_name` から選ばれる。
 */
export function websiteLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": ID.site,
    name: SITE.name,
    alternateName: SITE.tagline,
    url: abs("/"),
    inLanguage: "ja",
  };
}

/**
 * **本人のページとして名乗ってよい外の面**だけを `sameAs` に並べる。
 *
 * `LINKS` には4つ在るが、App Store と Google Play は**アプリの面**で、本人の面ではない。
 * `sameAs` は「これも同じ人です」という印なので、アプリを入れると人とアプリが混ざる。
 * ここに id を足すのは、本人が自分の名前で持っている面だけ。
 */
const OWN_PAGES = ["youtube", "doneru"];

/** 本人。`/about` の頭に見えている名前と一言（`PROFILE.name` / `PROFILE.lead`）から */
function personLd(): Ld {
  const own = OWN_PAGES.map((id) => LINKS.find((l) => l.id === id)?.href).filter(
    (href): href is string => !!href,
  );
  return {
    "@type": "Person",
    "@id": ID.person,
    name: PROFILE.name,
    description: PROFILE.lead,
    url: abs("/about"),
    ...(own.length ? { sameAs: own } : {}),
  };
}

/** `/about` に置く。「この面は、この人のことを書いた面」 */
export function profileLd(pageName: string): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: abs("/about"),
    name: pageName,
    inLanguage: "ja",
    isPartOf: { "@id": ID.site },
    mainEntity: personLd(),
  };
}

/**
 * 現在地。**見えているパンくず（`components/ui/PageShell.tsx` の `Crumbs`）と同じ並びから作る。**
 *
 * 別に並べ直さない。パンくずを直した日に、名札だけ古い道を指し続けることになる
 * （`docs/island-standards.md` 8章「名簿・一覧を手で作らない」）。
 *
 * いちばん奥（いま居る面）は、パンくずが行き先を持っていない。名札でも `item` を省く
 * ——その面自身の URL として読まれる決まりなので、足す必要が無い。
 * **途中の段が行き先を持っていなければ、名札を出さない**（`null`）。
 * 途中の `item` が欠けた名札は、読む側で丸ごと捨てられる。
 */
export function breadcrumbLd(items: { label: string; href?: string }[]): Ld | null {
  const steps = [{ label: SITE_ROOT_LABEL, href: "/" }, ...items];
  if (steps.slice(0, -1).some((s) => !s.href)) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.label,
      ...(s.href ? { item: abs(s.href) } : {}),
    })),
  };
}

/**
 * 面に埋めた動画（ショート）1本。**埋めた動画にだけ付ける**（見えていない動画を名乗らない。上の決めごと）。
 * 必須は `name` `thumbnailUrl` `uploadDate`（`python/seo_audit.py` の `LD_NEEDS` が見る）。#1228
 */
export function videoLd(o: { id: string; name: string; uploadDate: string; description?: string }): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: o.name,
    description: o.description ?? o.name,
    thumbnailUrl: [`https://i.ytimg.com/vi/${o.id}/hqdefault.jpg`],
    uploadDate: o.uploadDate,
    embedUrl: `https://www.youtube-nocookie.com/embed/${o.id}`,
    url: `https://www.youtube.com/shorts/${o.id}`,
    inLanguage: "ja",
  };
}

/** 島の道だけ島の頭を付ける（借りた写真は道が丸ごと外の URL） */
const absAny = (p: string) => (/^https?:\/\//.test(p) ? p : abs(p));

/**
 * 街の見どころの一覧（`ItemList` ＋ `TouristAttraction`）。#1262
 *
 * 見どころの点は埋め込みのマイマップの中にしか無く、**Google は埋め込みの中身をこの面の中身として数えない。**
 * 名前と座標を字で渡して、「この面は、どの場所の話か」を機械が当てなくて済むようにする。
 *
 * - 形は Google の「1枚の面に全部載っている一覧」（all-in-one-page）: `ListItem` に `position`、
 *   中身の `url` は**同じ面の錨**（見どころの窓 `#see-<id>`。直に開くと窓が開く）
 * - 欄は面に見えているものだけ: 名前・現地のつづり・窓の本文・窓の写真。座標だけは面に字で出ていないが、
 *   面のマイマップの点そのもの（同じ材料の緯度・経度）
 * - 並びは面の札と同じ（必見 → 行けたら → 余裕があれば）。組むのは `components/guidebook/SpotsLd.tsx`
 */
export function attractionListLd(o: {
  path: string;
  name: string;
  items: { anchor: string; name: string; lat: number; lon: number; alternateName?: string[]; description?: string; image?: string }[];
}): Ld {
  const page = abs(o.path);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: o.name,
    url: page,
    numberOfItems: o.items.length,
    itemListElement: o.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "TouristAttraction",
        name: it.name,
        url: `${page}#${it.anchor}`,
        ...(it.alternateName?.length ? { alternateName: it.alternateName } : {}),
        ...(it.description ? { description: it.description } : {}),
        ...(it.image ? { image: absAny(it.image) } : {}),
        geo: { "@type": "GeoCoordinates", latitude: it.lat, longitude: it.lon },
      },
    })),
  };
}

/**
 * 記事（街のガイド `/travel/<国>/<街>`・国の旅の記録 `/travel/<国>`・北欧の日 `/island/nordic/day/<n>`）。
 * `docs/guide-design.md` 6章・9章の1。
 *
 * - **`author` は島（`Organization`）。** 文を書いているのは案内鳥で、あやと本人ではない。
 *   案内鳥を `Person` にすると、人でないものを人として名乗ることになる（Google の「著者を偽らない」）
 * - **島の持ち主（`founder`）があやと（`Person`。`sameAs` に YouTube のチャンネル）。** #1262 で足した。
 *   検索と AI の読み手が「誰の体験の記事か」を、島の名前から本人まで辿れるようにする。
 *   あやとは `about` にも置く（体験したのは本人）
 * - 日付は、面に見えている日付と**同じ値**（`<time datetime>` と食い違わせない）。更新日が面に無い面は省く
 * - **街のガイドの面（`guidebookOf` が引ける道）は、「どんな街」の問いと答え（`about.cards`）を
 *   `FAQPage` として同じ塊（`@graph`）に添える**（#1262）。Google は FAQ の札を島のような面には出さないが、
 *   AI の読み手は問いと答えの組をそのまま引く。問いも答えも面にそのまま見えている字（窓の中ではない）。
 *   面のファイルを触らずに、ここで足す（街のガイドの中身は別の担当が作っている）
 */
export function articleLd(o: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  /**
   * 記事の絵。**並べて渡せる**——Google の Article の手引きは 16:9・4:3・1:1 の3枚（横 1200px 以上）を勧めている。
   * 街のガイドは字の無い表紙を3つの比に切って渡す（`content/guidebook/manifest.ts` の `ld`。#332）
   */
  image?: string | string[];
}): Ld {
  const person = personLd();
  const org = { "@type": "Organization", "@id": ID.org, name: SITE.name, url: abs("/"), founder: person };
  const article: Ld = {
    "@type": "Article",
    headline: o.headline,
    description: o.description,
    url: abs(o.path),
    mainEntityOfPage: abs(o.path),
    inLanguage: "ja",
    datePublished: o.datePublished,
    ...(o.dateModified ? { dateModified: o.dateModified } : {}),
    /* 借りた写真（Wikimedia）は道が丸ごと外の URL。島の道だけ島の頭を付ける */
    ...(o.image?.length ? { image: [o.image].flat().map(absAny) } : {}),
    author: org,
    publisher: org,
    about: person,
    isPartOf: { "@id": ID.site },
  };
  const faq = guideFaq(o.path);
  return { "@context": "https://schema.org", "@graph": faq ? [article, faq] : [article] };
}

/** 街のガイドの「どんな街」の問いと答え。ガイドの面でなければ null */
function guideFaq(path: string): Ld | null {
  const m = path.match(/^\/travel\/([^/]+)\/([^/]+)$/);
  const g = m ? guidebookOf(m[1], m[2]) : undefined;
  const cards = g?.about.cards ?? [];
  if (!cards.length) return null;
  return {
    "@type": "FAQPage",
    url: abs(path),
    inLanguage: "ja",
    mainEntity: cards.map((c) => ({
      "@type": "Question",
      name: c.q,
      acceptedAnswer: { "@type": "Answer", text: c.a },
    })),
  };
}
