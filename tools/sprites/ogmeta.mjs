/**
 * **貼られたときの顔を、面ぜんぶで数える**（`og:*` / `twitter:*`）。
 *
 *   tools/build.sh 3208
 *   DIST=site/.next-3208 node tools/sprites/ogmeta.mjs
 *   DIST=site/.next-3208 TABLE=1 node tools/sprites/ogmeta.mjs   # 面ごとの表も出す
 *
 * 終了コード 0=通った / 1=見つかった / 2=数えるものが無い。
 *
 * ## なぜ要るか
 *
 * 2026-10-14 に焼き出した 137面を数えたら、こうだった。
 *
 * | | 無い | 種類 |
 * | --- | ---: | ---: |
 * | `og:title` | 0 | 134 |
 * | `og:description` | 0 | 135 |
 * | **`og:image`** | 0 | **1**（137面とも `/og.png`） |
 * | **`og:url`** | **137** | 0 |
 *
 * **題と一文は面ごとに在ったのに、絵は全部同じで、自分の居場所は誰も名乗って
 * いなかった。** 貼った人の画面では、料理のスタンプ帳も住人図鑑も月末の
 * ふりかえりも同じ絵で出る。貼り分けた意味がない。
 *
 * 直したあと、**同じことがまた起きる経路が2つある。**
 *
 * 1. 面を1枚足した人が `lib/share.ts` を通さない（`og:image` が器の1枚に戻る）
 * 2. 呼び名を変えたのに、焼いた絵（`site/public/og/*.png`）が古いまま
 *    （`docs/island-misses.md` #134 と同じ形。**絵は出るので見ても気づけない**）
 *
 * どちらも**赤くなる場所が無ければ戻る**ので、ここで毎回数える。
 *
 * ## 見る足（`BREAK=` で1本ずつ抜ける）
 *
 * | 足 | 見るもの |
 * | --- | --- |
 * | `empty` | 題・一文・絵・居場所・`twitter:card` の抜けと空 |
 * | `abs` | `og:image` と `og:url` が絶対 URL か（相対だと多くの場所で出ない） |
 * | `size` | 絵が配ったものの中に在って、1200×630 か |
 * | `same` | 面が2つ以上あるのに、絵が1種類しかない |
 * | `dup` | 同じ一文が2面以上に出ていないか |
 * | `self` | `og:url` がその面自身（か、その面が名乗る canonical）を指しているか |
 * | `label` | 絵に焼いた呼び名が、その絵を使う面の題に在るか |
 *
 * **絵が届くかは curl で見る側の仕事**（この箱のブラウザは本番に出られない）。
 * ここは**配ったものの中にファイルが在るか**を見る。置き忘れはこれで捕まる。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { htmlFiles, norm } from "./crawltargets.mjs";
import { DIST, checkAgainstSitemap } from "./islepages.mjs";
import { fromRoot, repoPath } from "./repo.mjs";

/** 本番の宛先。`metadataBase`（`site/app/layout.tsx`）と同じもの */
export const ORIGIN = "https://live-streaming-d3cac.web.app";

/** 貼られたときの1枚の名簿。`site/lib/ogCards.json` が1つの出どころ */
export const cardsOf = (root) =>
  JSON.parse(readFileSync(root ? join(root, "site/lib/ogCards.json") : repoPath("site/lib/ogCards.json"), "utf8")).cards;

/** 焼いた HTML の `<head>` から、貼られたときに使われるものだけ抜く */
export function headOf(html) {
  const head = html.split("</head>")[0];
  const meta = (name, attr) => {
    const m = new RegExp(`<meta ${attr}="${name.replace(/[:]/g, "\\$&")}" content="([^"]*)"`).exec(head);
    return m ? m[1] : null;
  };
  const t = /<title>([^<]*)<\/title>/.exec(head);
  return {
    title: t ? t[1] : null,
    ogTitle: meta("og:title", "property"),
    ogDesc: meta("og:description", "property"),
    ogImage: meta("og:image", "property"),
    ogUrl: meta("og:url", "property"),
    twCard: meta("twitter:card", "name"),
    twImage: meta("twitter:image", "name"),
    canonical: (/<link rel="canonical" href="([^"]*)"/.exec(head) || [])[1] ?? null,
  };
}

/** PNG / JPEG の寸法。**外のものを入れない**ので、ヘッダだけ読む */
export function pixelsOf(buf) {
  if (buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG")
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * 面ぜんぶを見て、違反を並べる。**ここが本体。ファイルも本番も触らない。**
 *
 * @param {{path:string,head:object}[]} pages 面と、その `<head>` から抜いたもの
 * @param {Record<string,{file:string,label:string}>} cards 絵の名簿
 * @param {(url:string)=>({w:number,h:number,bytes:number}|null)} look 絵を1枚引く
 * @param {string[]} [skip] 抜いた足（`BREAK=`）
 */
export function judge(pages, cards, look, skip = []) {
  const on = (leg) => !skip.includes(leg);
  const bad = [];
  const say = (p, why) => bad.push(`${p}: ${why}`);

  for (const { path, head } of pages) {
    if (on("empty")) {
      if (!head.title) say(path, "題（<title>）が無い");
      if (!head.ogTitle) say(path, "og:title が無い");
      if (!head.ogDesc) say(path, "og:description が無い");
      if (!head.ogImage) say(path, "og:image が無い");
      if (!head.ogUrl) say(path, "og:url が無い");
      if (head.twCard !== "summary_large_image") say(path, `twitter:card が ${head.twCard}`);
      if (!head.twImage) say(path, "twitter:image が無い");
    }
    if (on("abs")) {
      for (const [k, v] of [["og:image", head.ogImage], ["og:url", head.ogUrl], ["twitter:image", head.twImage]])
        if (v && !/^https?:\/\//.test(v)) say(path, `${k} が絶対 URL でない（${v}）`);
    }
  }

  const imgs = [...new Set(pages.map((p) => p.head.ogImage).filter(Boolean))];
  if (on("same") && pages.length > 1 && imgs.length < 2)
    bad.push(`${pages.length}面あるのに、og:image が ${imgs.length}種類しかない（貼り分けていない）`);

  if (on("size")) {
    for (const url of imgs) {
      const got = look(url);
      if (!got) { bad.push(`og:image が配ったものの中に無い（${url}）`); continue; }
      if (got.w !== 1200 || got.h !== 630)
        bad.push(`og:image が 1200×630 でない（${url} は ${got.w}×${got.h}）`);
      if (got.bytes > 5 * 1024 * 1024)
        bad.push(`og:image が 5MB を超える（${url} は ${Math.round(got.bytes / 1024)}KB）`);
    }
  }

  if (on("dup")) {
    const seen = new Map();
    for (const { path, head } of pages) {
      // 404 は自分の面を持てない（Next の `not-found.tsx` は metadata を出せない）
      if (path === "/404") continue;
      if (!head.ogDesc) continue;
      const had = seen.get(head.ogDesc);
      if (had) bad.push(`同じ一文が2面に出ている（${had} と ${path}）`);
      else seen.set(head.ogDesc, path);
    }
  }

  /* **`share()` を通さなかった面を、ここで捕まえる。**
     器（`app/layout.tsx`）は `og:url` に `/` を持っているので、通さなかった面は
     **表紙を指したまま**出る。抜けではないので `empty` では出ない。
     いまいる章の島のように、わざと別の面を正とするものは canonical で名乗る。 */
  if (on("self")) {
    for (const { path, head } of pages) {
      if (path === "/404" || !head.ogUrl) continue;
      /* **原点だけの URL は `/`。** Next は表紙を
         `https://…web.app`（末尾のスラッシュ無し）で出すので、
         剥がすと空文字になる。`|| null` に落とすと「canonical が無い」に
         化けて、正しい面が落ちる（当てて気づいた） */
      const trim = (u) => (u ? u.replace(ORIGIN, "") || "/" : null);
      const here = trim(head.ogUrl);
      const canon = trim(head.canonical);
      if (here !== path && here !== canon)
        say(path, `og:url が自分（も canonical）も指していない（${here}）`);
    }
  }

  if (on("label")) {
    for (const [key, card] of Object.entries(cards)) {
      const url = `${ORIGIN}${card.file}`;
      const users = pages.filter((p) => p.head.ogImage === url);
      if (!users.length) continue;
      if (!users.some((p) => (p.head.ogTitle || "").includes(card.label)))
        bad.push(
          `絵に焼いた呼び名「${card.label}」（${key}）が、この絵を使う${users.length}面のどの題にも無い`
          + "（面の呼び名を変えたなら node tools/sprites/ogcards.mjs で焼き直す）",
        );
    }
  }
  return bad;
}

/* ------------------------------------------------------------------ 対照 --
 * **本物の面を1つも見る前に、自分が落ちられることを毎回見る。**
 * 1つの台につき1つの足を折って、その足を抜いたら台が通ってしまうことまで。 */

/**
 * 台は**3面**で組む。2面だと、1面の `og:image` を消した台が
 * `empty` だけでなく `same`（絵が1種類しかない）にも引っかかって、
 * **足が独立しているかを確かめられない**（`docs/island-misses.md` #128 の決めごと1）。
 */
const page = (path, label, file, desc) => ({
  path,
  head: {
    title: `${label}｜あやと島`, ogTitle: `${label}｜あやと島`, ogDesc: desc,
    ogImage: `${ORIGIN}${file}`, ogUrl: `${ORIGIN}${path}`, canonical: `${ORIGIN}${path}`,
    twCard: "summary_large_image", twImage: `${ORIGIN}${file}`,
  },
});

const CARDS_C = {
  kitchen: { file: "/og/kitchen.png", label: "台所" },
  streams: { file: "/og/streams.png", label: "配信" },
  map: { file: "/og/map.png", label: "地図" },
};

/** きれいな3面。どの台もこれを1か所だけ壊して作る */
const CLEAN = () => [
  page("/kitchen", "台所", "/og/kitchen.png", "台所の一文"),
  page("/streams", "配信", "/og/streams.png", "配信の一文"),
  page("/map", "地図", "/og/map.png", "地図の一文"),
];

/** 1面だけ壊した3面を作る */
const broke = (i, patch) => {
  const ps = CLEAN();
  ps[i] = { ...ps[i], head: { ...ps[i].head, ...patch } };
  return ps;
};

const LOOK_C = (url) =>
  /\/og\/(kitchen|streams|map)\.png$/.test(url) ? { w: 1200, h: 630, bytes: 90_000 } : null;

/** 台。`leg` が、この台を捕まえている足 */
export const CONTROLS = [
  { name: "きれいな3面", leg: null, pages: CLEAN() },
  { name: "og:image が無い", leg: "empty", pages: broke(2, { ogImage: null }) },
  { name: "og:url が無い", leg: "empty", pages: broke(2, { ogUrl: null }) },
  { name: "og:description が無い", leg: "empty", pages: broke(2, { ogDesc: null }) },
  { name: "題（<title>）が無い", leg: "empty", pages: broke(2, { title: null }) },
  { name: "twitter:card が summary", leg: "empty", pages: broke(2, { twCard: "summary" }) },
  { name: "og:image が相対", leg: "abs", pages: broke(2, { ogImage: "/og/map.png" }) },
  { name: "絵が配ったものに無い", leg: "size", pages: broke(2, { ogImage: `${ORIGIN}/og/nope.png` }) },
  { name: "絵の寸法が違う", leg: "size", look: () => ({ w: 800, h: 418, bytes: 90_000 }), pages: CLEAN() },
  { name: "絵が重すぎる", leg: "size", look: () => ({ w: 1200, h: 630, bytes: 6 * 1024 * 1024 }), pages: CLEAN() },
  {
    name: "全面おなじ絵", leg: "same",
    pages: CLEAN().map((p) => ({ ...p, head: { ...p.head, ogImage: `${ORIGIN}/og/kitchen.png` } })),
  },
  { name: "一文が2面で同じ", leg: "dup", pages: broke(2, { ogDesc: "台所の一文" }) },
  { name: "焼いた呼び名が題に無い", leg: "label", pages: broke(0, { ogTitle: "別のなまえ｜あやと島" }) },
  { name: "og:url が表紙のまま（share() を通していない）", leg: "self", pages: broke(2, { ogUrl: `${ORIGIN}/` }) },
  /* **原点だけの canonical を持つ面は、落ちてはいけない。** いまいる章の島は
     トップそのものなので、`og:url` も canonical も `https://…web.app`（末尾なし）。
     剥がすと空文字になるところを「canonical 無し」と読んで、実際に落とした */
  {
    name: "いまいる章の島（canonical が原点だけ）", leg: null,
    pages: broke(2, { ogUrl: ORIGIN, canonical: ORIGIN }),
  },
];

/** 対照を回す。**1つでも外れたら、本物の数字を1つも出さずに 2** */
export function runControls(skip = []) {
  const out = [];
  for (const c of CONTROLS) {
    const look = c.look || LOOK_C;
    const got = judge(c.pages, CARDS_C, look, skip).length;
    const want = c.leg === null || skip.includes(c.leg) ? 0 : 1;
    const bad = want === 0 ? got !== 0 : got < 1;
    if (bad) out.push(`対照「${c.name}」: 出た=${got}件 ほしい=${want === 0 ? "0件" : "1件以上"}`);
  }
  return out;
}

/** 台の名簿。対照（`ogmeta_selftest.mjs`）が同じ札で当てるために出す */
export { CARDS_C, LOOK_C };

async function main() {
  const skip = (process.env.BREAK || "").split(",").filter(Boolean);
  const off = runControls(skip);
  if (off.length) {
    for (const o of off) console.log(`::error::${o}`);
    console.log("::error::対照が外れた。本物の面は1つも数えていない");
    return 2;
  }
  console.log(`対照 ${CONTROLS.length}台 ぜんぶ思ったとおりに落ちた${skip.length ? `（抜いた足: ${skip.join(",")}）` : ""}`);

  const dist = process.env.DIST ? fromRoot(process.env.DIST) : DIST;
  const files = htmlFiles(dist);
  if (!files.length) {
    console.log(`::error::焼き出したものが無い（${dist}）。tools/build.sh を先に回す`);
    return 2;
  }
  const sm = checkAgainstSitemap(dist);
  if (!sm.ok) {
    console.log(`::error::sitemap.xml と面の数が合わない（${sm.why || sm.missing.join(" ")}）`);
    return 2;
  }

  const pages = files.map((f) => ({ path: norm(f), head: headOf(readFileSync(join(dist, f), "utf8")) }));
  const cards = cardsOf();
  const look = (url) => {
    const rel = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
    for (const base of [dist, repoPath("site/public")]) {
      const f = join(base, rel);
      if (existsSync(f) && statSync(f).isFile()) {
        const buf = readFileSync(f);
        const px = pixelsOf(buf);
        if (px) return { ...px, bytes: buf.length };
      }
    }
    return null;
  };

  const bad = judge(pages, cards, look, skip);
  const imgs = [...new Set(pages.map((p) => p.head.ogImage).filter(Boolean))];

  if (process.env.TABLE) {
    for (const p of [...pages].sort((a, b) => a.path.localeCompare(b.path)))
      console.log([p.path, p.head.ogTitle, (p.head.ogImage || "").replace(ORIGIN, ""), (p.head.ogUrl || "").replace(ORIGIN, "")].join(" | "));
  }
  console.log(`見た面 ${pages.length} / 絵 ${imgs.length}種類 / 名簿の札 ${Object.keys(cards).length}枚`);
  for (const b of bad) console.log(`::error::${b}`);
  console.log(`違反 ${bad.length}件`);
  return bad.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
