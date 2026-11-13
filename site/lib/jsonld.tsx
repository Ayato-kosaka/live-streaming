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
 *   いま在るのは3つ: 島そのもの（`WebSite`）・本人（`ProfilePage` ＋ `Person`）・
 *   現在地（`BreadcrumbList`）。記事・動画・問いと答え・場所は、まだ出さない
 *
 * ## 確かめかた
 *
 *   python3 python/seo_audit.py --base http://localhost:<port> \
 *     --expect 'jsonld:/=WebSite,jsonld:/about=ProfilePage+Person,crumbs=jsonld'
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
