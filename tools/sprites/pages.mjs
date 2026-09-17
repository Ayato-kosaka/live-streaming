/**
 * 測る面を、**書き出したものから集める**。5本の出どころ。
 *
 *   pcsweep.mjs（横あふれ・伸びきり・絵の引き伸ばし）
 *   pchit.mjs  （押しどころ 48px）
 *   pcink.mjs  （字の濃さ 4.5）
 *   navcw.mjs / navuse.mjs（入れる上限の逆算・使っている幅）
 *
 * ## なぜ作ったか
 *
 * 手で書いた一覧（`pcpages.txt`）は **109行で止まっていた。**
 * 同じ書き出しを `crawl.mjs` が歩くと **130面**ある。抜けていたのは
 * `/about` `/atlas` `/design` `/island/*` `/nordic/photos` `/me*` `/404` など
 * **21面。**
 *
 * 困るのは抜けていること自体ではなく、**抜けたことがどこにも出ない**こと。
 * 「4.5割れ 0」が「測って 0 だった」のか「その面を見ていない」のか、
 * 読む側に区別がつかない（`docs/island-misses.md` #79）。
 * だから面は歩いて集め、**除くものは理由ごとここに書いて、毎回出す。**
 *
 * ## 歩き方は `crawl.mjs` と同じ
 *
 * `crawl.mjs` は本番の検品に使っていて他の担当も回すので、**読むだけで
 * 書き換えていない。** 同じ歩き方（`_next` `cache` `server` `static` を
 * 飛ばして `*.html` を拾う）をここに写してある。写した以上、あちらが
 * 変わったらここも合わせる。ずれていないことは `pagescheck.mjs` で見る。
 *
 * ## 使い方
 *
 *   import { collect, banner } from "./pages.mjs";
 *   const c = collect();
 *   console.log(banner(c));
 *   for (const path of c.pages) { ... }
 *
 * 面の決まり方は3通り。上から先に効く。
 *
 *   PAGES=/,/about       … 手で渡した面だけ（除く規則は当てない）
 *   LIST=…/pcpages.txt   … 一覧ファイル（除く規則は当てない）。前の回の数字を
 *                          そのまま出し直したいときに使う
 *   （何も渡さない）      … 書き出しを歩く。**ふだんはこれ**
 *
 * 書き出しの置き場は `DIST=` で渡す。渡さなければ `.next-verify` を見て、
 * 無ければ `site/` の `.next-*` のうち **index.html を持ついちばん新しいもの**を
 * 使う。どれを使ったかは `banner()` が必ず出すので、配っているものと違えば
 * そこで分かる。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { fromRoot, repoRoot } from "./repo.mjs";

const ROOT = repoRoot();
const SITE = `${ROOT}/site`;

/** `crawl.mjs` が飛ばしているのと同じ置き場。書き出した面ではない */
const SKIP_DIR = new Set(["_next", "cache", "server", "static"]);

/**
 * **除く面と、その理由。**
 *
 * 一覧から抜くのではなく、ここに理由ごと書く。抜いてしまうと「なぜこの面が
 * 測られていないか」が誰にも読めなくなり、面が増えたときと見分けがつかない。
 * ここに書いてあれば `banner()` が毎回出す。
 *
 * **「たぶん除外でよい」で足さない。** 足すなら、その面の作りに書いてある
 * 理由か、測った数字が当てにならない理由を書く。
 */
const EXCLUDE = [
  {
    re: /^\/roulette$/,
    why:
      "配信にそのまま映る画面で、島の面ではない。看板も砂浜も無く、書体（M PLUS Rounded 1c）も " +
      "CSS も島と別で、`app/roulette/page.tsx` に「島に寄せない。寄せた日から配信の絵が変わる」と " +
      "書いてある。島の基準（押しどころ 48px・字の濃さ 4.5）で挙がったものを直すと、" +
      "**その日から配信の絵が変わる。** そのかわり、この面は専用の道具が見ている——" +
      "`liveraw.mjs`（素で開くか）/ `livecheck.mjs`（48px・横あふれ・動くものの外接矩形）/ " +
      "`liveink.mjs`（字の濃さ）/ `livecpu.mjs`（代金）。**見ていないのではなく、別の目で見ている**",
  },
];

/**
 * **測ってはいるが、出た数がその面の全部ではない面。**
 *
 * 除いていない（数には入る）。ただし「0件だった」を全部の 0 と読まれると
 * #79 と同じことになるので、毎回いっしょに出す。
 */
const PARTIAL = [
  {
    re: /^\/me(\/|$)/,
    why:
      "ログインしていない人の姿（器と見出しだけ）で測っている。付箋も企画も投げ銭も " +
      "画面が出てから読むので、ここには出ていない。**開けない面ではないので測るが、" +
      "ここの 0 は「中身を見て 0」ではない。** 中身のある姿は `mesweep.mjs` / `meink.mjs` " +
      "（`asme.mjs` で差し込む。`/me/remote` `/me/roulette` は `livecheck.mjs` / `liveink.mjs`）が見る",
  },
  {
    re: /^\/design$/,
    why:
      "印の検品台。**潰れを見つけるために**小さい印（16px）と暗い地をわざと並べてある面なので、" +
      "薄い・小さいが挙がるのは作りどおり。ここの数は他の面と同じ意味ではない",
  },
  {
    re: /^\/404$/,
    why: "リンクの張られていない面。踏んだ人にだけ出るので、巡回で見つからない",
  },
];

/** `crawl.mjs` の `walk()` と同じ。`*.html` を集める */
function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (SKIP_DIR.has(f)) continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

/** `/kitchen/kebab.html` → `/kitchen/kebab`、`/index.html` → `/` */
function toRoute(file) {
  const r = file.replace(/\.html$/, "").replace(/\/index$/, "");
  return r || "/";
}

/** 書き出しの置き場を決める。**どれを使ったかは必ず外へ出す** */
export function distRoot() {
  // 相対で渡されたら**根から**。cwd から解くと、tools/sprites の中から回したときに
  // 見つからない（渡した人は根から書いたつもりでいる）
  if (process.env.DIST) return fromRoot(process.env.DIST);
  const verify = `${SITE}/.next-verify`;
  if (existsSync(`${verify}/index.html`)) return verify;
  const cands = readdirSync(SITE)
    .filter((f) => f.startsWith(".next"))
    .map((f) => `${SITE}/${f}`)
    .filter((p) => existsSync(`${p}/index.html`))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!cands.length)
    throw new Error(
      `書き出しが見つからない。${SITE}/.next-* に index.html を持つものが1つも無い。` +
        `先に tools/build.sh <ポート> を回すか、DIST= で置き場を渡してください`,
    );
  return cands[0];
}

/** 一覧ファイルを読む。`#` で始まる行と空行は飛ばす */
function readList(file) {
  return readFileSync(fromRoot(file), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

/**
 * 面を集める。
 *
 * 返すもの:
 *   root     … 歩いた書き出しの置き場（一覧ファイルを渡したときは null）
 *   source   … どうやって集めたか（そのまま画面に出す）
 *   all      … 集まった面ぜんぶ
 *   pages    … 実際に測る面（= all から除いたもの）
 *   skipped  … 除いた面と理由
 *   partial  … 測るが、中身がそろっていない面と理由
 */
export function collect(opts = {}) {
  const raw = opts.pages ?? process.env.PAGES;
  const list = opts.list ?? process.env.LIST;
  let root = null, source, all, applied;

  if (raw) {
    all = raw.split(",").map((s) => s.trim()).filter(Boolean);
    source = `手で渡した面（PAGES=）${all.length}面`;
    applied = false;
  } else if (list) {
    all = readList(list);
    source = `一覧ファイル ${list}（${all.length}面）`;
    applied = false;
  } else {
    root = opts.root ?? distRoot();
    all = [...new Set(walk(root).map(toRoute))].sort();
    source = `書き出しを歩いた ${root}（${all.length}面）`;
    applied = true;
  }

  const skipped = [];
  const pages = [];
  for (const path of all) {
    const hit = applied ? EXCLUDE.find((e) => e.re.test(path)) : null;
    if (hit) skipped.push({ path, why: hit.why });
    else pages.push(path);
  }
  const partial = pages
    .map((path) => {
      const hit = PARTIAL.find((e) => e.re.test(path));
      return hit ? { path, why: hit.why } : null;
    })
    .filter(Boolean);

  return { root, source, all, pages, skipped, partial, applied };
}

/**
 * **何面を測るのかを、毎回いちばん上に出す。**
 *
 * これが無いと「0件」が「測って 0」なのか「そもそも見ていない」なのか
 * 読む側に分からない（`docs/island-misses.md` #79）。
 */
export function banner(c) {
  const L = [];
  L.push(`面の出どころ: ${c.source}`);
  L.push(`  集めた ${c.all.length}面 → **測る ${c.pages.length}面** / 除く ${c.skipped.length}面`);
  if (!c.applied) L.push("  面を手渡しされたので、除く規則は当てていない（pages.mjs の EXCLUDE）");
  if (c.skipped.length) {
    L.push("  除いた面と、その理由:");
    for (const s of c.skipped) L.push(`    ${s.path} — ${s.why}`);
  }
  if (c.partial.length) {
    L.push("  測ってはいるが、出た数がその面の全部ではないもの:");
    // 同じ理由のものは1行にまとめる。同じ文を4回出しても読まれない
    const g = new Map();
    for (const s of c.partial) g.set(s.why, [...(g.get(s.why) || []), s.path]);
    for (const [why, paths] of g) L.push(`    ${paths.join(" ")} — ${why}`);
  }
  return L.join("\n");
}

/**
 * 終わりに出す1行。**測れた数と、集めた数を並べる。**
 * 片方だけ出すと「0件でした」が読めない。
 */
export function tally(c, measured, label = "測れた") {
  return (
    `${label} ${measured}/${c.pages.length}面` +
    (c.skipped.length ? `（ほかに除いた ${c.skipped.length}面。理由はいちばん上）` : "") +
    (measured < c.pages.length ? `  ** ${c.pages.length - measured}面 測れていない **` : "")
  );
}
