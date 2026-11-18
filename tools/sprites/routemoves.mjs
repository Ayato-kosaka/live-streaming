/**
 * **道を動かしたあとも、前の道が全部どこかへ行くか。**
 *
 *   node tools/sprites/routemoves.mjs                                  # 置き場（site/app・public）から見る
 *   node tools/sprites/routemoves.mjs --dist site/.next-3130 --dist public   # 書き出したものから見る（正確）
 *
 * 終了コード 0=全部どこかへ行く / 1=行き先の無い道・転送の連鎖がある / 2=数えるものが無い。
 *
 * ## なぜ要るか（#1201）
 *
 * 道の作り直し（`/map` → `/travel` ほか）は、面を動かして `firebase.json` に 301 を足す。
 * **どちらか片方だけ**だと、前の道が 404 になる——検索に載っている道も、
 * 視聴者さんが LINE に貼った道も。しかも `crawl.mjs` は**島の中のリンク**しか辿らないので、
 * 島の中を新しい道に揃えた日ほど、前の道が死んでいることに誰も気づかない。
 * `notfound.mjs` と `prodsweep.mjs` は**配ったあと**に本番を見る。ここは配る前に見る。
 *
 * ## 何を数えるか
 *
 * 元帳は `tools/sprites/sitemap-*.txt`（作り直しの**便ごとに**、その前の本番の sitemap の写しを1枚ずつ足す。
 * 古い写しも消さない——第1便の前に載っていた道は、第2便のあとも行き場を持っていないといけない）。
 * 写しを全部合わせた道を、1本ずつ、Firebase Hosting と同じ順で引く（`docs/island-routing.md`。**転送が実ファイルより先**）:
 *
 * 1. `firebase.json` の `redirects` のどれかに当たる → その先が**実ファイルとして在る**か
 * 2. 当たらない → その道が**実ファイルとして在る**か
 *
 * あわせて、**転送の連鎖（301 → 301）**を数える。連鎖は着きはするが、1回ぶん遅く、
 * 検索の側では評価の引き継ぎが落ちる。先が固定の転送は、先が実ファイルかも見る。
 *
 * ## 「実ファイル」の見かた
 *
 * - `--dist`（何本でも重ねられる。後ろのものほど上）: 書き出したものの中を、
 *   Hosting と同じ探しかた（`cleanUrls`）で探す。`tools/sprites/notfound.mjs` の `--dist` と同じ
 * - 渡さないとき: `site/app` の面の形（`[slug]` は**どの1段にも当たる**）と、
 *   `public/`・`site/public/` のファイル。**動く段の中身までは見ない**（それは `--dist` の仕事）。
 *   毎 PR で書き出し無しに回すための、粗いほうの物差し
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./repo.mjs";

export const ROOT = repoRoot(fileURLToPath(import.meta.url));
/** 元帳（作り直しの便ごとの、本番の sitemap の写し）。古い順 */
export const SNAPSHOTS = readdirSync(join(ROOT, "tools", "sprites"))
  .filter((n) => /^sitemap-\d{4}-\d{2}-\d{2}[^/]*\.txt$/.test(n))
  .sort()
  .map((n) => join(ROOT, "tools", "sprites", n));
export const FIREBASE_JSON = join(ROOT, "firebase.json");

/* ------------------------------------------------------------ 転送の当てかた */

const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/**
 * Firebase Hosting の `source`（glob）を正規表現に。**読めない書きかたは当てずに投げる**
 * ——当たらないまま黙ると、その転送が無いものとして数えて「行き先が無い」の嘘が出る。
 *
 * 読めるもの: `**`（`/` を跨ぐ）・`*`（1段の中）・`:名前`（1段）・`:名前*`（残り全部）・
 * `@(a|b)`・`{a,b}`（中にも上の書きかたを入れてよい）。
 */
export function compileSource(source) {
  const keys = [];
  const frag = (src) => {
    let re = "";
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (src.startsWith("**", i)) {
        re += ".*";
        i += 2;
      } else if (c === "*") {
        re += "[^/]*";
        i += 1;
      } else if (c === ":") {
        const m = /^:([A-Za-z_][A-Za-z0-9_]*)(\*)?/.exec(src.slice(i));
        if (!m) throw new Error(`読めない書きかた: ${source}（${i}文字目の :）`);
        keys.push(m[1]);
        re += m[2] ? "(.+)" : "([^/]+)";
        i += m[0].length;
      } else if (c === "@" && src[i + 1] === "(") {
        const j = src.indexOf(")", i);
        if (j < 0) throw new Error(`読めない書きかた: ${source}（閉じない @(）`);
        re += `(?:${src.slice(i + 2, j).split("|").map(esc).join("|")})`;
        i = j + 1;
      } else if (c === "{") {
        const j = src.indexOf("}", i);
        if (j < 0) throw new Error(`読めない書きかた: ${source}（閉じない {）`);
        re += `(?:${src.slice(i + 1, j).split(",").map(frag).join("|")})`;
        i = j + 1;
      } else if ("?()+![]}|".includes(c)) {
        throw new Error(`読めない書きかた: ${source}（${c}）`);
      } else {
        re += esc(c);
        i += 1;
      }
    }
    return re;
  };
  return { re: new RegExp(`^${frag(source)}$`), keys };
}

/** `firebase.json` の転送を、上から順に。`regex` で書いた行は読まずに投げる（まだ1本も無い） */
export function loadRedirects(file = FIREBASE_JSON) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  return (j.hosting?.redirects ?? []).map((r, n) => {
    if (!r.source) throw new Error(`firebase.json の転送 ${n + 1}本目は source で書かれていない（regex は読まない）`);
    return { ...r, n: n + 1, ...compileSource(r.source) };
  });
}

/**
 * その道が転送に当たるなら、行き先。**最初に当たった1本だけ**（Hosting と同じ）。
 * 行き先の `#` と `?` は落として `to` に、元の字は `raw` に。
 */
export function redirectOf(path, rules) {
  for (const r of rules) {
    const m = r.re.exec(path);
    if (!m) continue;
    let raw = r.destination;
    r.keys.forEach((k, i) => {
      raw = raw.replace(new RegExp(`:${k}\\*?(?![A-Za-z0-9_])`, "g"), m[i + 1]);
    });
    return { rule: r, raw, to: raw.replace(/[#?].*$/, "") || "/" };
  }
  return null;
}

/* ------------------------------------------------------------ 実ファイルの見かた */

/** 書き出したものの中を、Hosting と同じ探しかたで（`cleanUrls: true`） */
export function distTree(dirs) {
  return {
    label: `書き出し ${dirs.map((d) => (d.startsWith(ROOT) ? relative(ROOT, d) || "." : d)).join(" ＋ ")}`,
    has(path) {
      const rel = path.replace(/^\//, "");
      const cand = rel === "" ? ["index.html"] : [rel, `${rel}.html`, join(rel, "index.html")];
      return dirs.some((d) => cand.some((c) => existsSync(join(d, c)) && statSync(join(d, c)).isFile()));
    },
  };
}

/** `site/app` の面の形を並べる。`(まとめ)` は道に出ない段、`_下書き` `@枠` は面にならない段 */
export function appRoutes(app) {
  const out = [];
  const walk = (d, segs) => {
    let names;
    try {
      names = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of names) {
      if (e.isDirectory()) {
        if (/^[_@]/.test(e.name) || e.name === "node_modules") continue;
        walk(join(d, e.name), /^\(.*\)$/.test(e.name) ? segs : segs.concat(e.name));
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(e.name)) {
        out.push(segs);
      }
    }
  };
  walk(app, []);
  return out;
}

/** 置き場から見る（書き出し無し）。動く段は**どの1段にも当たる** */
export function srcTree({ app = join(ROOT, "site", "app"), pub = [join(ROOT, "public"), join(ROOT, "site", "public")] } = {}) {
  const routes = appRoutes(app);
  const files = distTree(pub);
  return {
    label: `置き場 site/app（面 ${routes.length}）＋ public`,
    routes,
    has(path) {
      const want = path.split("/").filter(Boolean);
      const hit = routes.some((segs) => {
        if (segs.length && segs[segs.length - 1].startsWith("[...")) return want.length >= segs.length;
        return segs.length === want.length && segs.every((s, i) => s.startsWith("[") || s === want[i]);
      });
      return hit || files.has(path);
    },
  };
}

/* ------------------------------------------------------------ 数える */

/** 元帳1枚の道。`#` で始まる行は注 */
export function readSnapshot(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** 元帳を全部合わせた道（同じ道は1本に）。写しの古い順 */
export function readSnapshots(files = SNAPSHOTS) {
  return [...new Set(files.flatMap((f) => readSnapshot(f)))];
}

/**
 * @returns {{ paths, kept, moved, lost, chains, fixed, deadFixed }}
 *   kept 実ファイルのまま / moved 転送で新しい道へ（先が在る） / lost 行き先の無い道 /
 *   chains 転送の先がまた転送 / fixed 先が固定の転送 / deadFixed そのうち先が無いもの
 */
export function check({ paths, rules, tree }) {
  const kept = [];
  const moved = [];
  const lost = [];
  /* 連鎖は「どの行からどの行へ」で1本と数える（同じ2行を、元帳の道の数だけ数えない） */
  const chainOf = new Map();
  const chain = (from, r, to) => {
    const again = redirectOf(to, rules);
    if (!again || again.to === to) return;
    const key = `${r.n}>${again.rule.n}`;
    if (!chainOf.has(key)) chainOf.set(key, { path: from, why: `${to} → ${again.to}（${r.n}行目 → ${again.rule.n}行目）` });
  };
  for (const p of paths) {
    const r = redirectOf(p, rules);
    if (!r) {
      (tree.has(p) ? kept : lost).push({ path: p, why: "実ファイルが無く、転送も無い" });
      continue;
    }
    chain(p, r.rule, r.to);
    if (tree.has(r.to)) moved.push({ path: p, to: r.to, n: r.rule.n });
    else lost.push({ path: p, why: `${r.rule.n}行目の転送の先 ${r.raw} が無い` });
  }
  /* 先が固定の転送は、元帳に無くても先を見られる。取り込み（`:slug`）は、元帳で当たった分だけ */
  const fixed = rules.filter((r) => !r.keys.length);
  const deadFixed = [];
  for (const r of fixed) {
    const to = r.destination.replace(/[#?].*$/, "") || "/";
    chain(r.source, r, to);
    if (!tree.has(to)) deadFixed.push({ path: r.source, why: `${r.n}行目の先 ${r.destination} が無い` });
  }
  return { paths, kept, moved, lost, chains: [...chainOf.values()], fixed, deadFixed };
}

/** 元帳の名前（印字用）。何枚を合わせたかが分かるように */
export const snapLabel = (files) =>
  `${files.length}枚: ${files.map((f) => f.replace(`${ROOT}/`, "").replace(/^tools\/sprites\//, "")).join(" ")}`;

/** 分母と一緒に印字して、終了コードを返す */
export function report(res, { tree, rules, snapshot, out = console.log }) {
  out(`前の道 ${res.paths.length}本（${snapshot}）／ ${tree.label} ／ 転送 ${rules.length}行`);
  out(`  実ファイルのまま在る        ${res.kept.length}本`);
  out(`  301 で新しい道へ（先が在る） ${res.moved.length}本`);
  out(`  行き先が無い                ${res.lost.length}本`);
  for (const x of res.lost) out(`    ✕ ${x.path}  ${x.why}`);
  out(`転送の行 ${rules.length}行（うち先が固定 ${res.fixed.length}行）`);
  out(`  先が実ファイル（固定の行）   ${res.fixed.length - res.deadFixed.length}/${res.fixed.length}`);
  for (const x of res.deadFixed) out(`    ✕ ${x.path}  ${x.why}`);
  out(`  転送の連鎖（301 → 301）      ${res.chains.length}本`);
  for (const x of res.chains) out(`    ✕ ${x.path}  ${x.why}`);
  return res.lost.length || res.deadFixed.length || res.chains.length ? 1 : 0;
}

/* ------------------------------------------------------------ 道具として */

async function main() {
  const argv = process.argv.slice(2);
  const dists = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--dist") dists.push(resolve(argv[++i] ?? ""));
  const fbj = process.env.FIREBASE_JSON || FIREBASE_JSON;
  const snaps = process.env.SNAPSHOT ? [process.env.SNAPSHOT] : SNAPSHOTS;
  const missing = dists.filter((d) => !existsSync(d));
  if (missing.length) {
    console.log(`✕ 書き出しが無い: ${missing.join(" ")}。数えるものが無いので 2 で止めます`);
    return 2;
  }
  if (!snaps.length) {
    console.log("✕ 元帳（tools/sprites/sitemap-*.txt）が1枚も無い。数えるものが無いので 2 で止めます");
    return 2;
  }
  const paths = readSnapshots(snaps);
  const rules = loadRedirects(fbj);
  const tree = dists.length ? distTree(dists) : srcTree();
  if (paths.length < 20 || !tree.has("/")) {
    console.log(`✕ 元帳 ${paths.length}本・表紙が見つかるか ${tree.has("/")}。数えるものが無いので 2 で止めます`);
    return 2;
  }
  return report(check({ paths, rules, tree }), { tree, rules, snapshot: snapLabel(snaps) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main());
}
