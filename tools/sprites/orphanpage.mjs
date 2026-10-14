/**
 * **島の中に、どこからも入れない面が無いか。**
 *
 *     DIST=site/.next-3210 node tools/sprites/orphanpage.mjs
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 *
 * ## なぜ要るか（2026-10-13）
 *
 * `crawl.mjs` は「**行き先の無いリンク**」を見ている。見ていないのは逆向きの
 * 「**リンクの無い行き先**」——面は在って、索引（`sitemap.xml`）にも載っていて、
 * **島のどこを押しても辿り着けない**という状態。
 *
 * 実測（2026-10-13・141面）で1枚あった。`/island/balkans` が
 * `sitemap.xml` には在って、141面のどこからもリンクが来ていなかった。
 * しかも `/now` の「バルカン諸国周遊の島へ」が、そこへ送っていた
 * ——読む人から見ると、トップとそっくり同じ面がもう1枚ある。
 *
 * **これは赤くならない。** リンクは切れていないし、面も 200 で返る。
 * 行き先として誰も指していないことは、1面ずつ見ていても分からない。
 *
 * ## いまいる章の島は、入口が無くて正しい
 *
 * **いまいる島はトップそのもの**（`content/chapters.ts` の `chapterHref`、
 * `docs/island-atlas.md` 7章）。だから `/island/<いまの章>` は、
 * 章が閉じる日まで誰も指さない。**章が閉じた瞬間に `/atlas` と `/all` から
 * 入口が立つ**ので、面のほうは先に焼いてある（`components/chain/route.ts`）。
 *
 * **この断りは名指しにしない。** 章の表から今日の章を引いて外す——
 * そうしないと、章が変わった日に断りのほうが古くなって、
 * **本当に迷子になった面を見逃す。**
 *
 * ## 断りは、理由ごと置く
 *
 * 残りは `EXCUSES` に**12文字以上の理由と日付**をつけて並べ、道具が印字する。
 * 名指しで黙らせると、そこが本当に壊れた日も黙る
 * （`docs/island-standards.md` §8）。
 *
 * ## 自分で対照を回してから数える
 *
 * **先に「壊していない写しが通ること」を見る**（同 §15）。
 * 仮の島を2つ組んで、片方は全部つながっていて、もう片方は1枚だけ
 * リンクを外してある。**両方が思ったとおりにならなければ、本物の数字を
 * 1つも出さずに 2 で落ちる。**
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlFiles, norm } from "./crawltargets.mjs";
import { fromRoot } from "./repo.mjs";
import { readArray } from "./tsread.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 入口が無くてよい面と、その理由。**12文字以上と、いつ時点かの日付。**
 *
 * いまいる章の島はここに書かない——章の表から引いて外す（頭の注）。
 */
const EXCUSES = new Map([
  ["/404", "踏んだ人にだけ出る面。リンクが張ってあったら、それは道が壊れている（2026-10-13）"],
  ["/roulette", "配信にそのまま映る画面。OBS が URL で直に開くもので、島からは行かない（2026-10-13）"],
  [
    "/me/roulette",
    "`/me` の中からだけ行く。その `/me` はログインした人の看板にしか出ないので、"
      + "焼いた字を歩いても道が見えない（2026-10-13）",
  ],
]);

const die = (why) => {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
};

/** 焼いた HTML から、島の中へのリンクを拾う */
function linksIn(html) {
  const out = new Set();
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const m of body.matchAll(/<a\b[^>]*href="(\/[^"#?]*)/g)) out.add(norm(m[1]));
  return out;
}

/**
 * 面の集合と、入ってくるリンクの数。
 *
 * `htmlFiles` が返すのは `/about.html` のような**配り先での綴り**なので、
 * 読むときは置き場と継ぐ。`norm` で `/about.html` も `/about/` も `/about` に揃える。
 */
function survey(dir) {
  const rels = htmlFiles(dir);
  if (!rels.length) return null;
  const pages = new Map();
  for (const rel of rels) pages.set(norm(rel), { rel, inbound: 0, from: new Set() });
  for (const rel of rels) {
    const here = norm(rel);
    let html;
    try {
      html = readFileSync(join(dir, rel), "utf8");
    } catch {
      continue;
    }
    for (const to of linksIn(html)) {
      if (to === here) continue; // 自分への錨は入口ではない
      const p = pages.get(to);
      if (p) {
        p.inbound++;
        p.from.add(here);
      }
    }
  }
  return pages;
}

// ------------------------------------------------------------------ 対照

{
  const root = mkdtempSync(join(tmpdir(), "orphanpage-"));
  const put = (name, html) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), html);
  };
  /* つながっている島: index から a と b へ、a から c へ */
  put("index.html", '<a href="/a">a</a><a href="/b">b</a>');
  put("a.html", '<a href="/c">c</a>');
  put("b.html", "<p>b</p>");
  put("c.html", "<p>c</p>");
  const good = survey(root);
  if (!good) die("対照の面を組み立てられなかった");
  const lonelyGood = [...good].filter(([u, p]) => p.inbound === 0 && u !== "/").map(([u]) => u);
  if (lonelyGood.length) die(`対照（つながっている島）で迷子が出た: ${lonelyGood.join(", ")}`);

  /* 1枚だけ外す: a が c を指すのをやめる */
  put("a.html", "<p>a</p>");
  const bad = survey(root);
  const lonelyBad = [...bad].filter(([u, p]) => p.inbound === 0 && u !== "/").map(([u]) => u);
  if (lonelyBad.length !== 1 || lonelyBad[0] !== "/c") {
    die(`対照（1枚外した島）で /c が挙がらなかった: ${JSON.stringify(lonelyBad)}`);
  }
  rmSync(root, { recursive: true, force: true });
  console.log("対照 2件中 2件 一致（つながっていれば挙げない／1枚外すと挙げる）\n");
}

// ------------------------------------------------------------------ 断りを確かめる

for (const [p, why] of EXCUSES) {
  const dated = /（\d{4}-\d{2}-\d{2}）/.test(why);
  const body = why.replace(/（\d{4}-\d{2}-\d{2}）$/, "");
  if (!dated || body.length < 12) die(`断りが足りない: ${p}（12文字以上と、いつ時点かの日付が要る）`);
}

// ------------------------------------------------------------------ いまの章

/**
 * 今日の章の slug。**章の表から引く。名指ししない。**
 *
 * `from` が今日までに来ていて、`to` がまだ来ていない（または空）章のうち、
 * いちばん新しいもの。`content/chapters.ts` の `chapterNow` と同じ見かた。
 */
function nowChapter() {
  let src;
  try {
    src = readFileSync(fromRoot("site/content/chapters.ts"), "utf8");
  } catch (e) {
    die(`章の表を読めなかった: ${e.message}`);
  }
  /* 読み方は `tsread.mjs` の1本（#694）。前は `[\s\S]*?` で欄のあいだを跨いで
     いたので、`from` の無い章が**次の章の `from` と組んで**1件になりえた
     （章が1つ消えても、残りの数が合うので赤くならない）。 */
  const got = readArray(src, "CHAPTERS", { keys: ["slug", "from", "to"], idKey: "slug" });
  if (got.missed) die(`章の表を ${got.missed} 章 読み落とした（名乗り ${got.declared}）`);
  const rows = got.rows;
  if (rows.length < 3) die(`章の表から ${rows.length} 章しか読めなかった`);
  const today = new Date().toISOString().slice(0, 10);
  const live = rows.filter((r) => r.from && r.from <= today && (!r.to || today <= r.to));
  return live.length ? live[live.length - 1].slug : null;
}

const now = nowChapter();
if (now) {
  EXCUSES.set(
    `/island/${now}`,
    `いまいる章の島はトップそのもの（chapterHref）。章が閉じた日に /atlas と /all から入口が立つ（${new Date()
      .toISOString()
      .slice(0, 10)} 時点の章: ${now}）`,
  );
}

// ------------------------------------------------------------------ 本番

const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const pages = survey(DIST);
if (!pages) die(`面が1枚も見つからない: ${DIST}`);
if (pages.size < 50) die(`面が ${pages.size} 枚しかない（${DIST}）`);

/**
 * **送り紙**（貼られた URL を生かして、読む人を別の面へ送るだけの1枚）か。
 *
 * `canonical` が自分以外を指していれば送り紙。面ごと消すと、Hosting の
 * 受け皿が島の玄関を 200 で返して、踏んだ人はなぜ違う面が出たのか分からない
 * （`app/nordic/photos/page.tsx` にその理由が書いてある）。
 * **名指しにしない**——次に畳んだ面が、何もしなくてもここに入る。
 */
function forwarder(dir, rel, here) {
  let html;
  try {
    html = readFileSync(join(dir, rel), "utf8");
  } catch {
    return null;
  }
  const m = /<link rel="canonical" href="([^"]+)"/.exec(html);
  if (!m) return null;
  /* 本番の URL で焼いてあるので、宛先の頭を落としてから比べる */
  const to = norm(m[1].replace(/^https?:\/\/[^/]+/, ""));
  return to && to !== here ? to : null;
}

const lonely = [...pages].filter(([, p]) => p.inbound === 0).map(([u]) => u).sort();
const sent = new Map();
for (const u of lonely) {
  const to = forwarder(DIST, pages.get(u).rel, u);
  if (to) sent.set(u, to);
}
const excused = lonely.filter((u) => EXCUSES.has(u));
const found = lonely.filter((u) => !EXCUSES.has(u) && !sent.has(u));

console.log(`見た面 ${pages.size} 枚（${DIST}）`);
console.log(`入口のある面 ${pages.size - lonely.length} / 入口の無い面 ${lonely.length}`);
console.log("\n送り紙（canonical が別の面を指している。導出で外す）:");
if (sent.size) for (const [u, to] of sent) console.log(`  ・ ${u} → ${to}`);
else console.log("  （無し）");
console.log("\n入口が無くてよいと決めた面:");
for (const u of excused) console.log(`  ・ ${u} — ${EXCUSES.get(u)}`);
const unused = [...EXCUSES.keys()].filter((u) => !lonely.includes(u));
if (unused.length) {
  console.log("\n断りを書いてあるのに、入口が在る面（断りはもう要らないかもしれない）:");
  for (const u of unused) console.log(`  ・ ${u}`);
}

console.log();
if (found.length) {
  console.log(`どこからも入れない面 ${found.length} 枚:`);
  for (const u of found) console.log(`  × ${u}`);
  console.log(
    "\n島に建てるか、紙に1本引くか、断りを理由つきで置くか。" +
      "**索引（sitemap.xml）にだけ在る面**は、検索から来た人しか辿り着けない。",
  );
  process.exitCode = 1;
} else {
  console.log(`${pages.size}面、どこからも入れない面は見つかりませんでした。`);
}
