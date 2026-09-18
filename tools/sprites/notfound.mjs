/**
 * **無い道が、本当に 404 で返っているか**を本番で数える。
 *
 *   node tools/sprites/notfound.mjs                本番を叩く
 *   node tools/sprites/notfound.mjs --dist         **配る前に**手元の dist を数える
 *   ORIGIN=https://… node tools/sprites/notfound.mjs
 *   BREAK=live node tools/sprites/notfound.mjs     対照をわざと空振りさせる（下）
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・本番に届かない）
 *
 * 配る順番と、受け皿を置かない理由は `docs/island-routing.md`。
 *
 * ## なぜ要るか
 *
 * `firebase.json` のいちばん最後に `{"source": "**", "destination": "/index.html"}`
 * という受け皿があって、**存在しない URL が島の表紙を 200 で返していた**
 * （2026-09-18 の実測。`/kitchen/dummy-not-a-recipe` も `/totally-made-up` も
 * 同じ 314,816 バイトの表紙）。困るのは3つ。
 *
 * 1. 道を間違えた人が、間違えたことに気づけない。表紙に飛ばされる
 * 2. **本番では、死んだ内部リンクが鳴らない。** 手元の静的配信は 404 を返すので
 *    `crawl.mjs` のリンク切れ判定は効くが、本番は何を叩いても 200。
 *    つまり本番に出たリンク切れは、どの見張りにも見つけられない
 * 3. 検索の側から見ると、無限の URL が表紙の写しとして 200 で並ぶ（soft-404）
 *
 * 受け皿を外したので、**外れたままであることを数える。** 次に誰かが SPA の
 * つもりで足し直すと、この見張りが 1 で落ちる。
 *
 * ## 何を見ているか
 *
 * | 組 | 通る条件 |
 * | --- | --- |
 * | **在る道**（sitemap の全面 ＋ sitemap に無い面） | 200 で、その面の h1 が出ている |
 * | **404 の面そのもの**（`/404`） | 200 で、h1 が「この道の先には、なにも無い」 |
 * | **中身が紙ではない道**（Expo の4面・`sitemap.xml`・`robots.txt`） | 200（h1 は見ない） |
 * | **引っ越した道**（`/nordic/photos`） | 3xx（受け皿を外しても引っ越しは残る） |
 * | **無い道**（わざと作った URL） | **404** で、「この道の先には、なにも無い」が出ている |
 *
 * **状態コードと中身の両方を見る。** `/404.html` へ rewrite で飛ばす直し方だと
 * 中身は正しいのに 200 のままになる。それでは検索の側から見て何も変わらない。
 *
 * ## ブラウザを使わない理由
 *
 * この箱のブラウザは本番に届かないので `prod.mjs` が curl で横取りしているが、
 * **あれは何が返ってきても `status: 200` で fulfill する。** 状態コードを見たい
 * この見張りでは、横取りした先の 404 が全部 200 に化ける。だから curl で直に叩く。
 *
 * ## 対照（`island-standards.md` §15）
 *
 * 片側だけでは意味が無い。「無い道が404」だけを見ていると、**本番に届かない日も
 * 「違反0」**になる。両側 × 通る／落ちるの4通り、計6本を**毎回**回す。
 * 測るのは本物と同じ道具（curl → 状態コード → h1 → 言い回し）で、
 * 相手だけこちらが立てた小さな台にする。
 *
 * | 対照 | 台が返すもの | 期待する判定 |
 * | --- | --- | --- |
 * | `live-ok` | 200 ＋ 入れ子の h1 | 在る道として **通る** |
 * | `live-noh1` | 200 ＋ h1 なし | 在る道として **落ちる** |
 * | `live-is404` | 200 ＋ h1 が 404 の字 | 在る道として **落ちる**（受け皿の形） |
 * | `gone-ok` | 404 ＋ 404 の字 | 無い道として **通る** |
 * | `gone-soft` | 200 ＋ 404 の字 | 無い道として **落ちる**（状態コードを見ている証拠） |
 * | `gone-bare` | 404 ＋ 別の字 | 無い道として **落ちる**（中身を見ている証拠） |
 *
 * **1本でも期待と違ったら、本物の面の数字を1つも出さずに 2 で止まる。**
 * 「0件」と「測れていない」は別のもの。
 *
 * 足を1本ずつ抜いて、そのたびに対照が落ちることを見る:
 *
 *   BREAK=status   状態コードを見ない  → `gone-soft` が落ちる
 *   BREAK=phrase   404 の字を見ない    → `gone-bare` が落ちる
 *   BREAK=h1       h1 を見ない         → `live-noh1` `live-is404` が落ちる
 *   BREAK=live     台の「在る道」を壊す → `live-ok` が落ちる
 *   BREAK=gone     台の「無い道」を壊す → `gone-ok` が落ちる
 *
 * ## 分母
 *
 * 見た本数・組ごとの内訳・**読めなかった本数**を必ず出す。読めなかったものが
 * 1本でもあれば、違反0でも 2 で止まる（届いていないだけかもしれないので）。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./repo.mjs";

const run = promisify(execFile);

export const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";
const BREAK = process.env.BREAK || "";

/** 無い道に出る字。`site/app/not-found.tsx` の h1 と同じでなければならない */
const GONE_TEXT = "この道の先には、なにも無い";

/** sitemap に載っていないが、島に在る面。**索引に無いものは、誰も数えていない** */
const EXTRA_LIVE = ["/me", "/me/desk", "/me/remote", "/me/roulette", "/roulette", "/design"];

/** h1 が 404 の字で正しい面。受け皿を外しても、ここは 200 のまま在る */
const LIVE_404 = ["/404"];

/** 紙ではないもの。200 だけ見る（Expo の面は SPA の殻なので h1 を持たない） */
const STATUS_ONLY = ["/alertbox", "/daily_user_stats", "/ve-comment", "/ve-postit", "/sitemap.xml", "/robots.txt"];

/** 引っ越した道。受け皿より前に居るので、外しても残る */
const MOVED = ["/nordic/photos", "/nordic/photos/2024"];

/**
 * わざと作った、絶対に実在しない道。**道の系統ごとに1本ずつ**置く。
 * `/kitchen/**` だけ見ていると、他の系統に受け皿が残っても気づけない。
 * 最後の2本は毎回ちがう字にする——「たまたま実在していた」を起こさないため。
 */
function gonePaths() {
  const r = randomBytes(6).toString("hex");
  return [
    "/kitchen/dummy-not-a-recipe",
    "/map/atlantis",
    "/nordic/day/999",
    "/nordic/nowhereland",
    "/legends/nope",
    "/apps/no-such-app",
    "/streams/no-such-type",
    "/island/nowhere",
    "/next/no-such-page",
    "/me/no-such-thing",
    "/cards/nope",
    "/atlas/nope",
    "/a/b/c/deep-nowhere",
    "/totally-made-up",
    `/${r}-nowhere`,
    `/kitchen/${r}-nowhere`,
  ];
}

/* --------------------------------------------------------------- 測りかた -- */

/** h1 の中の字。`<h1><img><span>あやと島</span></h1>` のような入れ子も拾う */
export function h1of(html) {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html || "");
  if (!m) return null;
  const t = m[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

/**
 * curl で1本叩く。**`-f` は付けない**（付けると 4xx で本文が取れず、
 * 「404 の面に何が書いてあるか」を見られなくなる）。
 * @returns {{status:number|null, body:string, bytes:number, err:string|null}}
 */
export async function fetchOne(url) {
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(url);
  const args = ["-sS", "--retry", "2", "--max-time", "40", "-w", "\n__code__%{http_code}"];
  // 台はこの箱の中。proxy に回すと届かない
  if (local) args.push("--noproxy", "127.0.0.1,localhost,::1");
  args.push(url);
  try {
    const { stdout } = await run("curl", args, { maxBuffer: 1 << 28, encoding: "utf8" });
    const i = stdout.lastIndexOf("\n__code__");
    if (i < 0) return { status: null, body: "", bytes: 0, err: "状態コードが取れない" };
    const status = Number(stdout.slice(i + 9).trim());
    const body = stdout.slice(0, i);
    return { status: Number.isFinite(status) && status > 0 ? status : null, body, bytes: Buffer.byteLength(body), err: null };
  } catch (e) {
    return { status: null, body: "", bytes: 0, err: String(e.message || e).split("\n")[0].slice(0, 120) };
  }
}

/**
 * 1本ぶんの判定。**組ごとに見るものが違う。**
 * @param {"live"|"live404"|"status"|"moved"|"gone"} kind
 * @returns {{ok:boolean, why:string, h1:string|null}}
 */
export function judge(kind, r) {
  if (r.err) return { ok: false, why: `読めず（${r.err}）`, h1: null };
  const h1 = h1of(r.body);
  const seeStatus = BREAK !== "status";
  const seePhrase = BREAK !== "phrase";
  const seeH1 = BREAK !== "h1";
  const hasPhrase = (r.body || "").includes(GONE_TEXT);

  if (kind === "gone") {
    if (seeStatus && r.status !== 404) return { ok: false, why: `${r.status} で返った（404 のはず・${r.bytes}B）`, h1 };
    if (seePhrase && !hasPhrase) return { ok: false, why: `404 の面が出ていない（h1=${h1 ?? "なし"}）`, h1 };
    return { ok: true, why: "", h1 };
  }
  if (kind === "live") {
    if (seeStatus && r.status !== 200) return { ok: false, why: `${r.status} で返った（200 のはず）`, h1 };
    if (seeH1 && !h1) return { ok: false, why: "h1 が無い", h1 };
    // 受け皿が生きていると、在る道のつもりの面まで 404 の紙が出る
    if (seeH1 && h1 === GONE_TEXT) return { ok: false, why: "在るはずの面に 404 の紙が出た", h1 };
    return { ok: true, why: "", h1 };
  }
  if (kind === "live404") {
    if (seeStatus && r.status !== 200) return { ok: false, why: `${r.status} で返った（200 のはず）`, h1 };
    if (seeH1 && h1 !== GONE_TEXT) return { ok: false, why: `h1 が「${GONE_TEXT}」ではない（${h1 ?? "なし"}）`, h1 };
    return { ok: true, why: "", h1 };
  }
  if (kind === "status") {
    if (seeStatus && r.status !== 200) return { ok: false, why: `${r.status} で返った（200 のはず）`, h1 };
    return { ok: true, why: "", h1 };
  }
  if (kind === "moved") {
    if (seeStatus && !(r.status >= 300 && r.status < 400)) return { ok: false, why: `${r.status} で返った（3xx のはず）`, h1 };
    return { ok: true, why: "", h1 };
  }
  throw new Error(`judge: 知らない組 ${kind}`);
}

/* ------------------------------------------------------------------ 対照 -- */

/** 対照の台。本番と同じ道具で測るために、HTTP で返す */
function controlServer() {
  const page = (h1) =>
    `<!doctype html><html lang="ja"><head><title>台</title></head><body><main><h1 class="t"><img src="/x.png" alt=""><span>${h1}</span></h1><p>台</p></main></body></html>`;
  const srv = createServer((req, res) => {
    const p = (req.url || "").split("?")[0];
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    };
    if (p === "/ctl/live") return BREAK === "live" ? send(500, "<h1>こわした</h1>") : send(200, page("ある面の名前"));
    if (p === "/ctl/noh1") return send(200, "<!doctype html><html><body><p>h1 が無い紙</p></body></html>");
    if (p === "/ctl/is404") return send(200, page(GONE_TEXT));
    if (p === "/ctl/gone") return BREAK === "gone" ? send(200, page(GONE_TEXT)) : send(404, page(GONE_TEXT));
    if (p === "/ctl/soft") return send(200, page(GONE_TEXT));
    if (p === "/ctl/bare") return send(404, page("Not Found"));
    return send(404, "<h1>台にない道</h1>");
  });
  return srv;
}

/** 6本の対照。`want` は「その判定が通ってほしいか」 */
const CONTROLS = [
  ["live-ok", "/ctl/live", "live", true],
  ["live-noh1", "/ctl/noh1", "live", false],
  ["live-is404", "/ctl/is404", "live", false],
  ["gone-ok", "/ctl/gone", "gone", true],
  ["gone-soft", "/ctl/soft", "gone", false],
  ["gone-bare", "/ctl/bare", "gone", false],
];

async function runControls() {
  const srv = controlServer();
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const rows = [];
  for (const [name, path, kind, want] of CONTROLS) {
    const v = judge(kind, await fetchOne(base + path));
    rows.push({ name, want, got: v.ok, why: v.why, ok: v.ok === want });
  }
  await new Promise((ok) => srv.close(ok));
  return rows;
}

/* ------------------------------------------------------------------ 本番 -- */

/** 一度に何本まで curl を走らせるか。箱の CPU は4つしかない */
const LANES = Number(process.env.LANES || 6);

async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(LANES, items.length) }, async () => {
      for (;;) {
        const n = i++;
        if (n >= items.length) return;
        out[n] = await fn(items[n], n);
      }
    }),
  );
  return out;
}

/** sitemap から島の面を引く。**手で並べない**（並べると片方だけ古くなる） */
async function sitemapPaths() {
  const r = await fetchOne(`${ORIGIN}/sitemap.xml`);
  if (r.err || r.status !== 200) return { paths: [], why: `sitemap.xml が ${r.status ?? r.err}` };
  const paths = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      try {
        return new URL(m[1].trim()).pathname.replace(/\/$/, "") || "/";
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { paths: [...new Set(paths)], why: "" };
}

async function main() {
  // 1. まず対照。**ここが揃うまで本物の面は1本も測らない**
  const ctl = await runControls();
  const ctlNg = ctl.filter((c) => !c.ok);
  console.log(`対照 ${ctl.length}本${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  for (const c of ctl) {
    console.log(
      `  ${c.ok ? "ok" : "NG"} ${c.name}: ${c.want ? "通ってほしい" : "落ちてほしい"} → ${c.got ? "通った" : `落ちた（${c.why}）`}`,
    );
  }
  if (ctlNg.length) {
    console.log(`::error::対照が ${ctlNg.length}本 外れました（${ctlNg.map((c) => c.name).join(" ")}）。測りかたが壊れているので、本番の数字は1つも出しません`);
    return 2;
  }

  // 2. 数えるものを集める
  const sm = await sitemapPaths();
  if (sm.paths.length < 20) {
    console.log(`::error::sitemap から面が引けません（${sm.paths.length}本・${sm.why}）。数えるものが無いので止めます`);
    return 2;
  }
  const live = [...new Set([...sm.paths, ...EXTRA_LIVE])].filter((p) => !LIVE_404.includes(p));
  const jobs = [
    ...live.map((p) => ({ p, kind: "live", group: "在る道" })),
    ...LIVE_404.map((p) => ({ p, kind: "live404", group: "404 の面" })),
    ...STATUS_ONLY.map((p) => ({ p, kind: "status", group: "紙ではない道" })),
    ...MOVED.map((p) => ({ p, kind: "moved", group: "引っ越した道" })),
    ...gonePaths().map((p) => ({ p, kind: "gone", group: "無い道" })),
  ];

  // 3. 測る
  const res = await pool(jobs, async (j) => {
    const r = await fetchOne(ORIGIN + j.p);
    return { ...j, r, v: judge(j.kind, r) };
  });

  // 4. 出す。**分母から**
  const groups = ["在る道", "404 の面", "紙ではない道", "引っ越した道", "無い道"];
  console.log(`\n${ORIGIN} を ${res.length}本（sitemap ${sm.paths.length} ＋ sitemap に無い ${EXTRA_LIVE.length + LIVE_404.length} ＋ 紙ではない ${STATUS_ONLY.length} ＋ 引っ越し ${MOVED.length} ＋ わざと作った ${res.filter((x) => x.kind === "gone").length}）`);
  const unread = res.filter((x) => x.r.err);
  let ng = 0;
  for (const g of groups) {
    const rows = res.filter((x) => x.group === g);
    const bad = rows.filter((x) => !x.v.ok);
    ng += bad.length;
    console.log(`\n${g}: ${rows.length}本中 ${rows.length - bad.length}本 通った / ${bad.length}本 落ちた`);
    for (const x of bad) console.log(`  NG ${x.p} [${x.r.status ?? "-"}] ${x.v.why}`);
  }
  if (unread.length) {
    console.log(`\n読めなかった: ${unread.length}本`);
    for (const x of unread) console.log(`  ?? ${x.p} ${x.r.err}`);
    console.log(`::error::読めなかった面があります。違反の数を「0」と読めないので 2 で止めます`);
    return 2;
  }
  if (ng) {
    console.log(`\n::error::${ng}本 落ちました`);
    return 1;
  }
  console.log(`\n${res.length}本ぜんぶ通りました`);
  return 0;
}

/* ------------------------------------------------- 配る前に、手元で数える -- */

/**
 * **受け皿を外す前に、これを回す。** 受け皿（`"**" → /index.html`）が無くなると、
 * 実ファイルとして書き出されていない道は本物の 404 になる。つまり
 * 「在る道が実ファイルで在るか」は、**配ってから本番で確かめるのでは遅い。**
 *
 *   npm run build:web
 *   node tools/sprites/notfound.mjs --dist
 *
 * Firebase Hosting の配りかたに合わせて探す（`cleanUrls: true` なので
 * `/me` は `me.html` で配られる）。
 */
function resolveInDist(dist, p) {
  const rel = p.replace(/^\//, "");
  const cand = rel === "" ? ["index.html"] : [rel, `${rel}.html`, join(rel, "index.html")];
  for (const c of cand) {
    const f = join(dist, c);
    if (existsSync(f) && statSync(f).isFile()) return c;
  }
  return null;
}

async function distMain() {
  const dist = fromRoot(process.env.DIST || "dist");
  if (!existsSync(dist)) {
    console.log(`::error::${dist} がありません。先に npm run build:web を通してください`);
    return 2;
  }

  // 対照。**在るはずのものが見つかり、無いはずのものが見つからないこと**を先に見る
  const ctl = [
    ["index が見つかる", resolveInDist(dist, "/") !== null, true],
    ["わざと作った道は見つからない", resolveInDist(dist, `/${randomBytes(6).toString("hex")}-nowhere`) === null, true],
    [".html を付けた道も見つかる", resolveInDist(dist, "/all") !== null, true],
  ];
  const ctlNg = ctl.filter(([, got, want]) => got !== want);
  console.log(`対照 ${ctl.length}本`);
  for (const [name, got, want] of ctl) console.log(`  ${got === want ? "ok" : "NG"} ${name}`);
  if (ctlNg.length) {
    console.log(`::error::対照が ${ctlNg.length}本 外れました。数字は出しません`);
    return 2;
  }

  const smf = join(dist, "sitemap.xml");
  if (!existsSync(smf)) {
    console.log(`::error::${smf} がありません。数えるものが無いので止めます`);
    return 2;
  }
  const paths = [
    ...new Set(
      [...readFileSync(smf, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => {
          try {
            return new URL(m[1].trim()).pathname.replace(/\/$/, "") || "/";
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    ),
  ];
  if (paths.length < 20) {
    console.log(`::error::sitemap.xml から ${paths.length}本しか引けません。数えるものが無いので止めます`);
    return 2;
  }
  const all = [...new Set([...paths, ...EXTRA_LIVE, ...LIVE_404, ...STATUS_ONLY])];
  const missing = all.filter((p) => resolveInDist(dist, p) === null);

  // **404 の紙そのものが要る。** これが無いと、受け皿を外した先が
  // Firebase の素っ気ない既定の 404 になる
  const has404 = existsSync(join(dist, "404.html"));

  console.log(
    `\n${dist} を ${all.length}本（sitemap ${paths.length} ＋ sitemap に無い ${EXTRA_LIVE.length + LIVE_404.length} ＋ 紙ではない ${STATUS_ONLY.length}）`,
  );
  console.log(`  実ファイルで在る: ${all.length - missing.length}本 / 無い: ${missing.length}本`);
  console.log(`  404.html: ${has404 ? `在る（${statSync(join(dist, "404.html")).size}B）` : "無い"}`);
  for (const p of missing) console.log(`  NG ${p} が実ファイルになっていない`);
  if (!has404) console.log("::error::dist/404.html がありません");
  if (missing.length || !has404) {
    console.log(`\n::error::受け皿を外すと、この ${missing.length}本が本物の 404 になります`);
    return 1;
  }
  console.log(`\n${all.length}本ぜんぶ実ファイルで在ります。受け皿を外して大丈夫です`);
  return 0;
}

process.exit(process.argv.includes("--dist") ? await distMain() : await main());
