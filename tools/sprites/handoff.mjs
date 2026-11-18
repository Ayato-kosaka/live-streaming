/** **古いドメイン → 新しいドメインで、手元の記録（`localStorage`）が残るかを、書き出したもので確かめる。**（#1202 の段 B）
 *
 *   tools/build.sh 3177
 *   node tools/sprites/handoff.mjs site/.next-3177
 *
 * 本番のホスト名（`live-streaming-d3cac.web.app` と `ayato-arigato.com`）を**そのまま**使う。
 * `localStorage` はホスト名ごとに分かれるので、localhost の2つのポートで試すと
 * 本物と同じ分かれかたにならない。ブラウザの外へは出さず、両方とも手元の
 * 書き出し（島は `site/.next-*`、受け渡しの面は `public/handoff.html`）を返す。
 * 古いドメインの 301 は `python/legacy_hosting.py build` が作った規則をそのまま当てる。
 *
 * 301 のクエリの足しかたは、プレビューの道で見た本物の Firebase に合わせてある
 * （元のクエリを行き先の後ろに足す）。本物の 301 そのものは
 * `.github/workflows/legacy_preview.yml` が数える。
 *
 * 0 = 通った / 1 = 外れがある / 2 = 試せなかった
 */
import { chromium } from "playwright-core";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { chromePath } from "./chrome.mjs";
import { repoPath } from "./repo.mjs";

const OUT = process.argv[2];
if (!OUT || !existsSync(join(OUT, "sitemap.xml"))) {
  console.log("書き出しの置き場を渡してください（例: site/.next-3177）");
  process.exit(2);
}
const NEW = "https://ayato-arigato.com";
const OLD = "https://live-streaming-d3cac.web.app";
const PUB = repoPath("public");

const tmp = join(mkdtempSync(join(tmpdir(), "handoff-")), "firebase.legacy.json");
execFileSync("python3", [repoPath("python", "legacy_hosting.py"), "build", "--sitemap", join(OUT, "sitemap.xml"), "--out", tmp], { stdio: "inherit" });
const RULES = JSON.parse(readFileSync(tmp, "utf8")).hosting.redirects.filter((r) => !/[:*]/.test(r.source));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain" };

/** cleanUrls と同じ引きかた */
function file(dirs, path) {
  for (const d of dirs) {
    for (const c of path === "/" ? ["index.html"] : [path, path + ".html", join(path, "index.html")]) {
      const f = join(d, c);
      if (existsSync(f) && statSync(f).isFile()) return f;
    }
  }
  return null;
}

/* **本物の 301 を返すために、手元に HTTPS の受け口を立てる。**
 * Playwright の `route.fulfill` で 301 を返すと、跳んだ先の要求が route を通らずに
 * 外（本番の ayato-arigato.com）へ出てしまい、本番の面を試すことになる（実際にそうなった）。
 * だから2つのホスト名をこの受け口に向け（`--host-resolver-rules`）、Host を見て返し分ける。
 * 他のホスト名は名前を引けなくして、外へは1本も出さない。 */
const ADDR = "127.0.0.77";
const dir = mkdtempSync(join(tmpdir(), "handoff-tls-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=handoff",
  "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const u = new URL(req.url, "https://" + host);
  if (u.pathname.startsWith("/island-api/") || u.pathname.startsWith("/__/")) { res.writeHead(404); return res.end("{}"); }
  if ("https://" + host === OLD) {
    const hit = RULES.find((x) => x.source === u.pathname);
    if (hit) {
      // 本物の Firebase と同じく、元のクエリを行き先の**後ろ**に足す
      // （`…/kitchen#from-legacy?from=yt`。2026-11-17 にプレビューの道で見た形）
      res.writeHead(301, { location: hit.destination + u.search });
      return res.end();
    }
  }
  const f = file("https://" + host === OLD ? [PUB, OUT] : [OUT, PUB], decodeURIComponent(u.pathname));
  if (!f) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
try {
  await new Promise((ok, ng) => { server.once("error", ng); server.listen(443, ADDR, ok); });
} catch (e) {
  console.log(`手元の受け口を立てられません（${ADDR}:443）: ${e.message}`);
  process.exit(2);
}

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
let bad = 0;
const rows = [];
const ok = (name, good, got = "") => { rows.push(`| ${name} | ${good ? "○" : "**✕**"} ${got} |`); if (!good) bad++; };

let b;
try {
  b = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox", "--no-proxy-server",
    `--host-resolver-rules=MAP ayato-arigato.com ${ADDR},MAP live-streaming-d3cac.web.app ${ADDR},MAP * ~NOTFOUND`] });
} catch (e) {
  console.log(`ブラウザが起きません: ${e.message}`);
  server.close();
  process.exit(2);
}

async function fresh(ua = UA) {
  const ctx = await b.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const hops = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) hops.push(f.url()); });
  return { ctx, page, hops };
}
const ls = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
async function settle(page, origin, path) {
  try {
    await page.waitForURL((u) => u.origin === origin && u.pathname === path && !u.hash, { timeout: 20000, waitUntil: "commit" });
    await page.waitForLoadState("domcontentloaded");
  } catch (e) {
    console.log(`着かなかった: いま ${page.url()}`);
    throw e;
  }
}

// 1. 古いドメインに記録がある常連さん。新しいドメインにも少しだけ記録がある
{
  const { page, hops } = await fresh();
  await page.goto(OLD + "/me");
  await page.evaluate(() => {
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-hearted", JSON.stringify(["p1", "p2"]));
    localStorage.setItem("ayato-island-cid", "cid-old");
    localStorage.setItem("ayato-island-met", "2026-11-16");
    localStorage.setItem("ayato-trip-place", JSON.stringify({ name: "ソフィア", note: "下書き" }));
    localStorage.setItem("ayato-island-signedin", "1");
    localStorage.setItem("ayato-island-owner", JSON.stringify({ uid: "u", admin: false }));
    localStorage.setItem("firebase:authUser:x", "token-like");
  });
  await page.goto(NEW + "/privacy");
  ok("目印の無い人は往復しない（新しいドメインに直に来た）", new URL(page.url()).pathname === "/privacy" && !hops.some((h) => h.includes("/handoff")), page.url());
  await page.evaluate(() => {
    localStorage.setItem("ayato-island-hearted", JSON.stringify(["p2", "p3"]));
    localStorage.setItem("ayato-island-cid", "cid-new");
  });

  hops.length = 0;
  const t0 = Date.now();
  await page.goto(OLD + "/kitchen?from=yt");
  await settle(page, NEW, "/kitchen");
  const ms = Date.now() - t0;
  const got = await ls(page);
  const path = hops.map((h) => new URL(h).host.split(".")[0] + new URL(h).pathname).join(" → ");
  ok("古い島の面 → 新しいドメインの同じ道（クエリも残る）", page.url() === NEW + "/kitchen?from=yt", page.url());
  ok("往復は古いドメインの /handoff を1回だけ", hops.filter((h) => h.startsWith(OLD + "/handoff")).length === 1, path);
  ok("歩いた記録が残る", got["ayato-island-walked"] === "1");
  ok("会った住人が残る", got["ayato-island-met"] === "2026-11-16");
  ok("下書きが残る", got["ayato-trip-place"] === JSON.stringify({ name: "ソフィア", note: "下書き" }));
  ok("いいね済みは両方を合わせる", JSON.stringify(JSON.parse(got["ayato-island-hearted"] || "[]").sort()) === JSON.stringify(["p1", "p2", "p3"]), got["ayato-island-hearted"]);
  ok("新しいドメインに在るものは上書きしない（cid）", got["ayato-island-cid"] === "cid-new", got["ayato-island-cid"]);
  ok("ログインの印は持ってこない", !("ayato-island-signedin" in got) && !("ayato-island-owner" in got) && !Object.keys(got).some((k) => k.startsWith("firebase:")));
  ok("URL に記録が残らない（#… を消す）", !new URL(page.url()).hash);
  ok("済みの印が付く", got["ayato-handoff-done"] === "1");
  rows.push(`| 　かかった時間（手元・往復ぶん込み） | ${ms}ms |`);

  // 2. 2回目は往復しない
  hops.length = 0;
  await page.goto(OLD + "/goods");
  await settle(page, NEW, "/goods");
  ok("2回目の 301 では往復しない", !hops.some((h) => h.includes("/handoff")), hops.map((h) => new URL(h).pathname).join(" → "));
}

// 3. 誰かが作った #handoff= のリンクでは書き込まない（合言葉が無い）
{
  const { page } = await fresh();
  const forged = Buffer.from(JSON.stringify({ "ayato-island-walked": "1" })).toString("base64url");
  await page.goto(`${NEW}/#handoff=${forged}&n=deadbeefdeadbeef`);
  await page.waitForFunction(() => !location.hash);
  const got = await ls(page);
  ok("作られたリンクでは書き込まない", !("ayato-island-walked" in got));
}

// 4. 検索のロボットは往復させない
{
  const { page, hops } = await fresh("Mozilla/5.0 (Linux; Android 6.0.1) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  await page.goto(OLD + "/kitchen");
  await settle(page, NEW, "/kitchen");
  ok("Googlebot は往復させない", !hops.some((h) => h.includes("/handoff")), hops.map((h) => new URL(h).host.split(".")[0] + new URL(h).pathname).join(" → "));
}

// 5. 古いドメインの OBS・受け渡しの面は 301 に当たらない（手元の規則で）
for (const p of ["/alertbox", "/roulette", "/handoff", "/me", "/island-api/fund", "/__/auth/handler"]) {
  ok(`古いドメインの ${p} に 301 の規則が当たらない`, !RULES.some((r) => r.source === p));
}

await b.close();
server.close();
console.log("| 見たもの | 結果 |\n| --- | --- |\n" + rows.join("\n"));
process.exit(bad ? 1 : 0);
