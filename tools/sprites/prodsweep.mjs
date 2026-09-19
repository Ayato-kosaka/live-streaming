/**
 * **配ったあとに、本番の面を一周する。**
 *
 *   node tools/sprites/prodsweep.mjs
 *   ORIGIN=https://… node tools/sprites/prodsweep.mjs
 *   BREAK=status|h1|title|thin|follow|tell node tools/sprites/prodsweep.mjs   # 対照を空振りさせる
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・読めない面がある）。
 * `| tail` を挟まない——終了コードが消える。
 *
 * ## なぜ要るか
 *
 * **本番の面を一周する見張りが、1本も無かった。**
 *
 * | 道具 | 見ているもの |
 * | --- | --- |
 * | `crawl.mjs` | **手元の書き出し**（`localhost`）。本番は1バイトも見ない |
 * | `prod.mjs` を直に起こす | `/me` の看板と顔だけ（2面） |
 * | `notfound.mjs`（配ったあと） | **無い道**が 404 で返るか |
 *
 * つまり **Hosting のリダイレクト・配信ヘッダ・実際に配られたバイト列**の層は、
 * 配ったあと誰も見ていなかった。**手元のビルドでは絶対に出ない層**で、
 * 本番だけで壊れる（`firebase.json` を触った・書き出しが1面ぶん欠けた・
 * `redirects` が増えた／消えた）。
 *
 * 2026-09-19 に手の curl で一周したときは 126面ぜんぶ無事だった。
 * **無事なことが問題ではない。壊れたときに鳴るものが無いのが問題。**
 *
 * ## ここで見ないもの（見ないと決めたこと）
 *
 * **ブラウザを使わない。** この箱のブラウザは本番に届かない（`prod.mjs` が
 * curl で横取りしているのはそのため）し、横取りは**何が返っても 200 で
 * fulfill する**ので、状態コードを見たいここでは使えない。そのぶん、
 * 次の4つは**ここでは見ない。見ないと決めた。**
 *
 * | 見ないもの | どこで見ているか |
 * | --- | --- |
 * | JS の例外・横あふれ・島の中のリンク切れ | `tools/sprites/crawl.mjs`（手元の書き出し） |
 * | 絵が本当に描けたか | `tools/sprites/iconcheck.mjs` / `crawl.mjs` |
 * | 画面が出たあとに入る値 | `tools/sprites/preclaim.mjs` |
 * | 無い道が 404 で返るか | `tools/sprites/notfound.mjs`（同じワークフローの1つ前） |
 *
 * ここが見るのは**配られたバイト列の層だけ**。中身の意味ではなく、
 * 「その面が、その面として配られているか」。
 *
 * ## 面の一覧を手で並べない
 *
 * 手で並べた一覧は、面が増えた日に**片方だけ古くなる**
 * （`docs/island-standards.md` §8）。2か所から出して足し合わせる。
 *
 * 1. **本番の `sitemap.xml`** — 119面（2026-09-19 の実測）
 * 2. **リポジトリの `site/app` の下の `page.tsx` ぜんぶ** — `[` を含む道（動く段）を除いた
 *    静的な道。sitemap に載っていない7面がここで出る:
 *    `/design` `/me` `/me/desk` `/me/remote` `/me/roulette` `/nordic/photos` `/roulette`
 *
 * **`/roulette` は配信に映る。** sitemap に無いので、1 だけ見ていると落ちる。
 * どちらかが痩せたら（sitemap が 20面を割る・静的な道が 5本を割る）、
 * 面の数字を1つも出さずに 2 で止まる。
 *
 * ## 見るもの（足は6本。**どれも分母を出す**）
 *
 * | 足 | 見るもの | 抜くと（`BREAK=`） |
 * | --- | --- | --- |
 * | `status` | HTTP が 200 か | 404 の面が通る |
 * | `h1` | `h1` がちょうど1つか | h1 が0個／2個の面が通る |
 * | `title` | `<title>` が空でないか | 空の題名が通る |
 * | `thin` | 本文が痩せていないか | 21B の本文が面として通る |
 * | `follow` | リダイレクトを**追う** | 301 の本文21バイトを掴む（#164） |
 * | `tell` | 追ったことを**表に出す** | 別の面を見ているのに気づけない（#164） |
 *
 * **追うだけにしない。追って、追ったと言う。** `/nordic/photos` を見たつもりで
 * `/cards` の中身を見ている、というのは**見た人が知るべきこと**（#164 の決めごと3）。
 *
 * ## 痩せの境目
 *
 * `prod.mjs` の `THIN_BYTES`（4,096B）を**そのまま借りる。** ここで別の数字を
 * 決めると、同じことを言う数が2つになって片方だけ古くなる。
 * 2026-09-19 に126面を実測して、いちばん小さい面は `/roulette` の **36,076B**。
 * 掴んでしまう側はリダイレクトの本文 **21B** と空の応答 **0B**。**3桁空いている。**
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * **本番を1本も叩く前に**、偽のサーバを 127.0.0.1 に立てて8本当てる。
 * 1本でも外れたら、本番の数字を1つも出さずに 2 で止まる。
 * 足を1本ずつ抜いて落ちるところまで見るのは `prodsweep_selftest.mjs`（毎 PR）。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";

import { repoPath } from "./repo.mjs";
/* 痩せの境目は `prod.mjs` のものを借りる。**ここで決め直さない**
   （同じことを言う数が2つになると、片方だけ古くなる） */
import { THIN_BYTES } from "./prod.mjs";

const run = promisify(execFile);

export const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";

/** 一度に何本まで curl を走らせるか。箱の CPU は4つしかない */
const LANES = Number(process.env.LANES || 6);

/* ------------------------------------------------------------ 面の一覧 -- */

/**
 * 本番の `sitemap.xml` から面を引く。
 * @returns {{paths:string[], why:string}}
 */
export async function sitemapPaths(origin = ORIGIN) {
  const r = await fetchOne(`${origin}/sitemap.xml`);
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

/**
 * リポジトリの `site/app` の下の `page.tsx` ぜんぶから**静的な道**を出す。
 *
 * - `[slug]` `[...rest]` のような**動く段を含む道は落とす**（面の数が中身で
 *   決まるので、ここからは出せない。そちらは sitemap が持っている）
 * - `(group)` は Firebase から見た道に出ないので**段ごと落とす**
 * - `@slot`（並行 route）も道に出ないので落とす
 *
 * @param dir 既定はこのリポジトリの `site/app`
 */
export function staticAppPaths(dir = repoPath("site", "app")) {
  let files;
  try {
    files = readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (e) {
    return { paths: [], why: `${dir} を読めない（${String(e.message || e).slice(0, 80)}）` };
  }
  const out = [];
  for (const d of files) {
    if (!d.isFile() || d.name !== "page.tsx") continue;
    /* `parentPath` は Node 20.12 から。古い版は `path` */
    const parent = d.parentPath ?? d.path;
    const rel = relative(dir, parent);
    const segs = rel === "" ? [] : rel.split(sep);
    if (segs.some((s) => s.includes("["))) continue;
    const keep = segs.filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"));
    out.push(`/${keep.join("/")}`.replace(/\/$/, "") || "/");
  }
  return { paths: [...new Set(out)].sort(), why: "" };
}

/* ------------------------------------------------------------- 測りかた -- */

/** 本文の `<head>` の中だけを返す。無ければ本文ぜんぶ */
function headOf(html) {
  const m = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html || "");
  return m ? m[1] : html || "";
}

/**
 * `<title>` の中の字。**`<head>` の中だけを見る。**
 * 本文の側には SVG の `<title>`（絵の説明）が幾つも居るので、
 * ぜんぶから探すと**面の題名ではないもの**を掴む。
 * @returns {string|null} 題名。`<title>` そのものが無ければ null
 */
export function titleOf(html) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headOf(html));
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** `<h1>` が何個あるか。**0個も2個も違反**（1つに絞られていることを見る） */
export function countH1(html) {
  return (String(html || "").match(/<h1[\s>]/gi) || []).length;
}

/**
 * curl で1本取る。**`-f` は付けない**——付けると 4xx で本文が取れず、
 * 「404 が返った」を「読めなかった」と混ぜることになる（#157）。
 *
 * @param follow `false` にすると `-L` を外す（`BREAK=follow`＝#164 を外した状態）
 * @returns {{status:number|null, body:string, bytes:number, hops:number, final:string, err:string|null}}
 */
export async function fetchOne(url, { follow = true } = {}) {
  const SEP = "\n__prodsweep__";
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(url);
  const args = ["-sS", "--retry", "2", "--max-time", "60",
    "-w", `${SEP}%{http_code} %{num_redirects} %{url_effective}`];
  /* 対照の台はこの箱の中。proxy に回すと自分の 127.0.0.1 にも届かない */
  if (local) args.push("--noproxy", "127.0.0.1,localhost,::1");
  if (follow) args.push("-L");
  args.push(url);
  try {
    const { stdout } = await run("curl", args, { maxBuffer: 1 << 28, encoding: "utf8" });
    const i = stdout.lastIndexOf(SEP);
    if (i < 0) return { status: null, body: "", bytes: 0, hops: 0, final: url, err: "書き出しが取れない" };
    const [code, hops, final] = stdout.slice(i + SEP.length).trim().split(" ");
    const body = stdout.slice(0, i);
    const status = Number(code);
    return {
      status: Number.isFinite(status) && status > 0 ? status : null,
      body,
      bytes: Buffer.byteLength(body, "utf8"),
      hops: Number(hops) || 0,
      final: final || url,
      err: null,
    };
  } catch (e) {
    return { status: null, body: "", bytes: 0, hops: 0, final: url,
      err: String(e.message || e).split("\n")[0].slice(0, 120) };
  }
}

/** URL を道だけにして出す（表が横に伸びないように） */
const at = (u) => { try { return new URL(u).pathname || u; } catch { return u; } };

/**
 * 1本ぶんの判定。**ブラウザも本番も要らない純粋な関数。**
 *
 * ここが腐ると出るのは**「違反 0」**（#157 #164）。0件はいちばん合格に見えるので、
 * 判定だけを切り出して毎 PR で回す（`prodsweep_selftest.mjs`）。
 *
 * @param legs 抜く足（`Set`）。`BREAK=` で1本ずつ抜いて、対照が落ちることを見る
 * @returns {{unread:boolean, err:string|null, checks:{key:string,name:string,ok:boolean,why:string}[], hops:number}}
 */
export function judgePage(r, { legs = new Set(), thinLimit = THIN_BYTES } = {}) {
  /* **読めなかったものを、測れた顔で 0 に畳まない**（#157）。
     判定に混ぜず、呼ぶ側が「読めなかった」として数える */
  if (r.err) return { unread: true, err: r.err, checks: [], hops: 0, notes: [] };
  const on = (l) => !legs.has(l);
  const url = r.url || r.final || "";
  const checks = [];
  const notes = [];

  checks.push({ key: "status", name: "HTTP が 200", ok: !on("status") || r.status === 200,
    why: `${r.status} で返った` });

  const n = countH1(r.body);
  checks.push({ key: "h1", name: "h1 がちょうど1つ", ok: !on("h1") || n === 1,
    why: `h1 が ${n}個` });

  const t = titleOf(r.body);
  checks.push({ key: "title", name: "<title> が空でない", ok: !on("title") || !!t,
    why: t === null ? "<title> が無い" : "<title> が空" });

  checks.push({ key: "thin", name: `本文が ${thinLimit}B 以上`, ok: !on("thin") || r.bytes >= thinLimit,
    why: `本文が ${r.bytes}B しかない（本番の最小の面は 36,076B）` });

  /* **追ったことを表に出す。** 溜めるだけにしない（#164 の決めごと3）。
     `tell` を抜くと黙って追うだけになる＝別の面を見ているのに気づけない */
  if (r.hops > 0 && on("tell")) {
    notes.push(`⇢ たどった: ${at(url)} → ${at(r.final)}（見ているのは ${at(r.final)} の中身）`);
  }
  checks.push({ key: "tell", name: "追ったことが表に出る", ok: r.hops === 0 || notes.length > 0,
    why: "リダイレクトを追ったのに、そのことがどこにも出ていない" });

  return { unread: false, err: null, checks, hops: r.hops, notes };
}

/* --------------------------------------------------------------- 対照 -- */

/** 対照の台。**本物と同じ道具で測る**（curl → 状態コード → 本文）。相手だけ小さくする。
 *
 * **落ちてほしい台は、狙った足だけで落ちるように作る。** 1枚で2つも3つも
 * 折れる台を置くと、その足を抜いても台が別の理由で落ち続けて、
 * **抜いたことに気づけない**（`/ctl/thin` を 21B の裸の本文にすると、
 * `h1` と `title` でも落ちるので `BREAK=thin` が空振りする。実際に1度そうなった）。 */
export function controlServer() {
  const fat = "あ".repeat(20000);
  /* 絵の説明の `<title>`。**本文の側に居る**ので、面の題名として拾ってはいけない */
  const svg = `<svg><title>絵の説明</title></svg>`;
  const page = (h1, title) =>
    `<!doctype html><html lang="ja"><head><title>${title}</title></head><body>` +
    `<main>${h1}<p>${fat}</p>${svg}</main></body></html>`;
  const H1 = `<h1 class="t"><img src="/x.png" alt=""><span>ある面の名前</span></h1>`;
  /* Firebase Hosting が 301 で返す本文。**実測21バイト** */
  const STUB = "Redirecting to /cards";
  const srv = createServer((req, res) => {
    const p = (req.url || "").split("?")[0];
    const send = (code, body, extra = {}) => {
      res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...extra });
      res.end(body);
    };
    if (p === "/ctl/ok") return send(200, page(H1, "ある面"));
    if (p === "/ctl/404") return send(404, page(H1, "ある面"));
    if (p === "/ctl/h1none") return send(200, page("", "ある面"));
    if (p === "/ctl/h1two") return send(200, page(H1 + H1, "ある面"));
    if (p === "/ctl/titleempty") return send(200, page(H1, ""));
    /* `<head>` に題名が無く、**本文には SVG の題名が在る**台。
       `<head>` の中だけを見ていなければ「絵の説明」を題名として拾って通る */
    if (p === "/ctl/titlenone") return send(200,
      `<!doctype html><html><head></head><body>${H1}<p>${fat}</p>${svg}</body></html>`);
    /* **痩せだけで落ちる台。** h1 も題名も揃えてある */
    if (p === "/ctl/thin") return send(200,
      `<!doctype html><html><head><title>小さい面</title></head><body><h1>小さい</h1></body></html>`);
    if (p === "/ctl/moved") return send(301, STUB, { location: "/ctl/ok" });
    return send(404, "<h1>台にない道</h1>");
  });
  return srv;
}

/**
 * 8本の対照。`want` は「その面が**通ってほしい**か」、
 * `keys` は落ちてほしいときに**どの足で**落ちてほしいか。
 * **狙った足「だけ」で落ちること**まで見る（多いのも違反）。
 * 足を抜いたときに**別々の項目で**落ちることを、ここで名指ししている。
 */
export const CONTROLS = [
  ["ok", "/ctl/ok", true, []],
  ["404", "/ctl/404", false, ["status"]],
  ["h1none", "/ctl/h1none", false, ["h1"]],
  ["h1two", "/ctl/h1two", false, ["h1"]],
  ["titleempty", "/ctl/titleempty", false, ["title"]],
  ["titlenone", "/ctl/titlenone", false, ["title"]],
  ["thin", "/ctl/thin", false, ["thin"]],
  /* 追えば `/ctl/ok` に着いて通る。**追ったことが表に出る**ところまで見る。
     `BREAK=follow` だと 301 の本文21バイトを掴んで `status h1 title thin` で落ち、
     `BREAK=tell` だと追えてはいるが `tell` だけで落ちる。**別の足**だと分かる */
  ["moved", "/ctl/moved", true, []],
];

/**
 * 対照を8本回す。**本番を1本も叩く前に呼ぶ。**
 *
 * @param controls 台の表。差し替えられるのは**見張りの見張り**のため
 *   （`prodsweep_selftest.mjs` が、わざと足を書き違えた表を渡して
 *   「狙った足だけで落ちる」の守りが生きているかを見る）
 * @returns {{name:string,want:boolean,got:boolean,keys:string[],notes:string[],ok:boolean}[]}
 */
export async function runControls({ legs = new Set(), controls = CONTROLS } = {}) {
  const srv = controlServer();
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const rows = [];
  for (const [name, path, want, wantKeys] of controls) {
    const r = await fetchOne(base + path, { follow: !legs.has("follow") });
    const v = judgePage({ ...r, url: base + path }, { legs });
    const keys = v.checks.filter((c) => !c.ok).map((c) => c.key);
    const got = !v.unread && keys.length === 0;
    /* **狙った足だけで落ちること。** 別の足でも落ちていると、見たかった足を
       抜いても台が落ち続けて、抜いたことに気づけない */
    const rightLeg = want ? true : [...keys].sort().join(" ") === [...wantKeys].sort().join(" ");
    rows.push({ name, want, got, keys, notes: v.notes, unread: v.unread,
      ok: got === want && rightLeg });
  }
  await new Promise((ok) => srv.close(ok));
  return rows;
}

/* --------------------------------------------------------------- 本番 -- */

async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(LANES, items.length) }, async () => {
      for (;;) {
        const n = i++;
        if (n >= items.length) return;
        out[n] = await fn(items[n]);
      }
    }),
  );
  return out;
}

async function main() {
  const legs = new Set(process.env.BREAK ? process.env.BREAK.split(",").filter(Boolean) : []);
  const known = new Set(["status", "h1", "title", "thin", "follow", "tell"]);
  for (const l of legs) {
    if (!known.has(l)) {
      console.log(`::error::BREAK=${l} は知らない足です（${[...known].join(" ")}）`);
      return 2;
    }
  }

  // 1. 対照。**ここが揃うまで本番の面は1本も測らない**
  const ctl = await runControls({ legs });
  const ctlNg = ctl.filter((c) => !c.ok);
  console.log(`対照 ${ctl.length}本${legs.size ? `（BREAK=${[...legs].join(",")}）` : ""}`);
  for (const c of ctl) {
    const got = c.got ? "通った" : `落ちた（${c.keys.join(" ") || "—"}）`;
    console.log(`  ${c.ok ? "ok" : "NG"} ${c.name}: ${c.want ? "通ってほしい" : "落ちてほしい"} → ${got}`);
  }
  if (ctlNg.length) {
    console.log(`::error::対照が ${ctlNg.length}本 外れました（${ctlNg.map((c) => c.name).join(" ")}）。` +
      "測りかたが壊れているので、本番の数字は1つも出しません");
    return 2;
  }

  // 2. 数えるものを集める。**手で並べない**（§8）
  const sm = await sitemapPaths();
  if (sm.paths.length < 20) {
    console.log(`::error::sitemap から面が引けません（${sm.paths.length}本・${sm.why}）。数えるものが無いので止めます`);
    return 2;
  }
  const app = staticAppPaths();
  if (app.paths.length < 5) {
    console.log(`::error::site/app から静的な道が引けません（${app.paths.length}本・${app.why}）。数えるものが無いので止めます`);
    return 2;
  }
  const extra = app.paths.filter((p) => !sm.paths.includes(p));
  const pages = [...sm.paths, ...extra];

  console.log(`\n${ORIGIN} を一周する`);
  console.log(`  面の一覧: sitemap ${sm.paths.length}面 ＋ サイトマップに無い静的な道 ${extra.length}面 = ${pages.length}面`);
  console.log(`  サイトマップに無い静的な道（site/app/**/page.tsx から）: ${extra.join(" ")}`);

  // 3. 測る
  const res = await pool(pages, async (p) => {
    const r = await fetchOne(ORIGIN + p, { follow: !legs.has("follow") });
    return { p, r, v: judgePage({ ...r, url: ORIGIN + p }, { legs }) };
  });

  // 4. 出す。**分母から**（§15）
  const unread = res.filter((x) => x.v.unread);
  const seen = res.filter((x) => !x.v.unread);
  console.log(`\n見た ${seen.length}面 / 読めなかった ${unread.length}面（一覧は ${pages.length}面）`);

  let ng = 0;
  for (const [key, name] of [["status", "HTTP が 200"], ["h1", "h1 がちょうど1つ"],
    ["title", "<title> が空でない"], ["thin", `本文が ${THIN_BYTES}B 以上`],
    ["tell", "追ったことが表に出る"]]) {
    const rows = seen.filter((x) => x.v.checks.some((c) => c.key === key));
    const bad = rows.filter((x) => x.v.checks.some((c) => c.key === key && !c.ok));
    ng += bad.length;
    console.log(`  ${name}: ${rows.length}面中 ${rows.length - bad.length}面 通った / 違反 ${bad.length}`);
    for (const x of bad) {
      const c = x.v.checks.find((y) => y.key === key && !y.ok);
      console.log(`     NG ${x.p} ${c.why}`);
    }
  }

  /* リダイレクトは**違反ではない**（設計どおりのものが在る）。数えて表に出す */
  const hopped = seen.filter((x) => x.v.hops > 0);
  console.log(`  リダイレクト: ${seen.length}面中 追った ${hopped.length}面`);
  for (const x of hopped) for (const n of x.v.notes) console.log(`     ${n}`);

  if (unread.length) {
    console.log(`\n読めなかった ${unread.length}面`);
    for (const x of unread) console.log(`  ?? ${x.p} ${x.v.err}`);
    console.log("::error::読めなかった面があります。違反の数を「0」と読めないので 2 で止めます");
    return 2;
  }
  if (ng) {
    console.log(`\n::error::${ng}件 見つかりました`);
    return 1;
  }
  console.log(`\n${seen.length}面ぜんぶ通りました`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
