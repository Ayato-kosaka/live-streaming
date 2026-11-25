/**
 * **種類の表。道の型ごとに、どの種類の面で、どの入口の下か**（`docs/spec/routes.md` の2章、`docs/spec/model.md` 3章）。
 *
 * 仕様の道の表と**同じ行を、同じ並びで**持つ。食い違えば `python/route_spec_selftest.py` が書き出しの前に止める
 * （道の型を足す・畳むときは、仕様の表とここを同じ PR で直す。R-5）。
 *
 * ここから出るもの（#1357。R-22・R-23）:
 *
 * | 出るもの | 引くところ |
 * | --- | --- |
 * | 面と面を結ぶ道 | 下の `hrefOf`（道を字で組まない。M-6） |
 * | 面の一覧（索引 `sitemap.xml` と、島のなか ぜんぶ `/all` の行き先） | `lib/pages.ts` の `pagesOf`（種類ごとに1つ） |
 * | パンくずと、その名札（`BreadcrumbList`） | `lib/pages.ts` の `crumbsOf`（入口と、道の上の段から） |
 *
 * **この1枚は何も読まない。** どの表からも読めるように軽く置く（滞在の表・企画の表がここで道を組む）。
 */

/** 状態。廃止予定の行は、畳んだ PR で消す */
export type KindState = "現行" | "廃止予定";

export type KindRow = {
  /** 道の型。`<…>` は名前が1つ入る段 */
  route: string;
  /** 種類（`docs/spec/model.md` 3章の語。一覧は「（一覧）」を添える） */
  kind: string;
  /** 入口（島の建物）。`表紙`・`建物の外`・`—` は入口を持たない */
  entrance: string;
  state: KindState;
};

export const KINDS = [
  { route: "/", kind: "表紙", entrance: "表紙", state: "現行" },
  { route: "/about", kind: "あやと", entrance: "あやとのこと", state: "現行" },
  { route: "/streams", kind: "配信の型（一覧）", entrance: "配信", state: "現行" },
  { route: "/streams/<型>", kind: "配信の型", entrance: "配信", state: "現行" },
  { route: "/months", kind: "月（一覧）", entrance: "配信", state: "現行" },
  { route: "/months/<月>", kind: "月", entrance: "配信", state: "現行" },
  { route: "/legends", kind: "企画（一覧）", entrance: "伝説の企画", state: "現行" },
  { route: "/legends/<企画>", kind: "企画", entrance: "伝説の企画", state: "現行" },
  { route: "/travel", kind: "国（一覧。旅で束ねる）", entrance: "歩いた国", state: "現行" },
  { route: "/travel/<国>", kind: "国", entrance: "歩いた国", state: "現行" },
  { route: "/travel/<国>/<街>", kind: "街", entrance: "歩いた国", state: "現行" },
  { route: "/travel/<国>/<街>/<話題>", kind: "街の話題", entrance: "歩いた国", state: "現行" },
  { route: "/island", kind: "旅（一覧）", entrance: "歩いた国", state: "現行" },
  { route: "/island/<旅>", kind: "旅", entrance: "歩いた国", state: "現行" },
  { route: "/island/<旅>/day/<日>", kind: "旅の1日", entrance: "歩いた国", state: "現行" },
  { route: "/island/<旅>/guide", kind: "旅（しおり）", entrance: "歩いた国", state: "現行" },
  { route: "/island/<旅>/streams", kind: "旅（その旅の配信）", entrance: "歩いた国", state: "現行" },
  { route: "/kitchen", kind: "料理（一覧）", entrance: "作った料理", state: "現行" },
  { route: "/kitchen/<料理>", kind: "料理", entrance: "作った料理", state: "現行" },
  { route: "/apps", kind: "アプリ（一覧）", entrance: "アプリ", state: "現行" },
  { route: "/apps/<アプリ>", kind: "アプリ", entrance: "アプリ", state: "現行" },
  { route: "/friends", kind: "住人", entrance: "住んでる人", state: "現行" },
  { route: "/goods", kind: "グッズ", entrance: "あやとグッズ", state: "現行" },
  { route: "/goods/stickers", kind: "グッズ（ステッカー）", entrance: "あやとグッズ", state: "現行" },
  { route: "/cards", kind: "カード", entrance: "あやとグッズ", state: "現行" },
  { route: "/board", kind: "お題と付箋", entrance: "やってほしいこと", state: "現行" },
  { route: "/updates", kind: "島をなおしたところ", entrance: "やってほしいこと", state: "現行" },
  { route: "/all", kind: "索引", entrance: "建物の外", state: "現行" },
  { route: "/privacy", kind: "決まりごと", entrance: "建物の外", state: "現行" },
  { route: "/design", kind: "道具（部品の見本）", entrance: "建物の外", state: "現行" },
  { route: "/me", kind: "道具（自分のこと）", entrance: "建物の外", state: "現行" },
  { route: "/me/desk", kind: "道具（机）", entrance: "建物の外", state: "現行" },
  { route: "/me/roulette", kind: "道具（ルーレットの操作）", entrance: "建物の外", state: "現行" },
  { route: "/cards/import", kind: "道具（写真の取り込み）", entrance: "建物の外", state: "現行" },
  { route: "/roulette", kind: "道具（配信に映す盤）", entrance: "建物の外", state: "現行" },
  { route: "/tip", kind: "道具（投げ銭）", entrance: "建物の外", state: "現行" },
] as const satisfies readonly KindRow[];

/** 道の型（表に在るものだけ） */
export type Route = (typeof KINDS)[number]["route"];

/** 道の型の行。表に無い型は型の上で書けない */
export const kindOf = (route: Route): KindRow => KINDS.find((k) => k.route === route)!;

/**
 * 道の型に名前を入れて、道にする。**面どうしを結ぶ道は、ここからだけ組む**（M-6）。
 *
 *     hrefOf("/kitchen/<料理>", "iwashi-paella")      // "/kitchen/iwashi-paella"
 *     hrefOf("/travel/<国>/<街>", "bulgaria", "sofia") // "/travel/bulgaria/sofia"
 *
 * 名前の数が段の数と合わなければ投げる（足りない道・余った名前を、黙って作らない）。
 */
export function hrefOf(route: Route, ...names: string[]): string {
  let i = 0;
  const out = route.replace(/<[^>]+>/g, () => {
    const n = names[i++];
    if (!n) throw new Error(`content/kinds.ts: ${route} に入れる名前が足りない（${names.join(", ")}）`);
    return n;
  });
  if (i !== names.length) throw new Error(`content/kinds.ts: ${route} に名前が余っている（${names.join(", ")}）`);
  return out;
}

/** 道が、道の型に当たるか（`<…>` は名前1つ。段の数が同じときだけ） */
export function routeMatches(route: string, path: string): boolean {
  const a = route.split("/");
  const b = path.split("/");
  return a.length === b.length && a.every((x, i) => /^<.+>$/.test(x) ? /^[a-z0-9-]+$/.test(b[i]) : x === b[i]);
}

/** その道の型。**名指しの段（`/goods/stickers`）が先に当たる**ように、`<…>` の少ない型から見る */
export function routeOf(path: string): Route | undefined {
  const holes = (r: string) => (r.match(/</g) ?? []).length;
  return [...KINDS].sort((x, y) => holes(x.route) - holes(y.route)).find((k) => routeMatches(k.route, path))?.route;
}
