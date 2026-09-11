/** **本番そのものを開いて確かめる。** ローカルの書き出しではなく、出したバイト列を見る。
 *
 *   node tools/sprites/prod.mjs            # 顔（看板・中部）を見る
 *   PAGES=/,/cards,/nordic node tools/sprites/prod.mjs   # 面を撮るだけ
 *
 * **この箱のブラウザは本番に届かない。** proxy が ERR_CONNECTION_RESET を返す。
 * けれど curl では取れる（顔の置き場 yt3 / lh3 も取れる）。なのでブラウザの
 * 要求を横取りして curl の結果を返す。これで「出したもの」で判定できる。
 *
 * 通すのは本番と顔の置き場だけ。**外を止めたまま撮ると顔が「落ちた」と出て、
 * 直っているものを直っていないと読む**（2026-09-10 に1回やった）。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { apply } from "./asme.mjs";

export const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";
/* 通す先。**置き場（firebasestorage）も通す。** 図鑑の「落とす」は名簿が
   持っている置き場の URL を直に取りに行く。ここを止めたまま撮ると
   「絵が落ちた」と出て、直っているものを直っていないと読む
   （2026-09-10 に1回やった。同じ轍）。 */
const PASS = /live-streaming-d3cac\.web\.app|yt3\.ggpht\.com|googleusercontent\.com|firebasestorage\.googleapis\.com/;
const TYPE = { js: "application/javascript", css: "text/css", html: "text/html",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain" };

/** curl 経由で本番に届くようにする。**apply より先に呼ぶ**
    （Playwright はあとから登録した route が先に効くので、差し込みが勝つ） */
export async function viaCurl(ctx) {
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (!PASS.test(u)) return r.abort();
    try {
      const body = execFileSync("curl", ["-sS", "--retry", "3", "--max-time", "40", u], { maxBuffer: 1 << 28 });
      const ext = (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "html").toLowerCase();
      r.fulfill({ status: 200, contentType: TYPE[ext] || "text/html", body });
    } catch { r.abort(); }
  });
}

export async function open(b, { nochara = false, path = "/" } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await viaCurl(ctx);
  await apply(ctx, { nochara });
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  /* curl 経由なので1本ずつ順に取る。**待ちを短くすると絵が間に合わず「落ちた」と出る** */
  await p.waitForTimeout(8000);
  return { ctx, p };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"],
  });
  let bad = 0;
  for (const nochara of [false, true]) {
    const { ctx, p } = await open(b, { nochara, path: "/me" });
    const r = await p.evaluate(() => {
      const src = (e) => ((e?.currentSrc || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 46) || "(空)");
      const ok = (e) => (e ? (e.naturalWidth > 0 ? `出ている ${src(e)}` : `落ちた ${src(e)}`) : "無し");
      const face = document.querySelector(".mp-face");
      return {
        看板: ok(document.querySelector(".ih-me img")),
        中部: face && face.tagName !== "IMG" ? `字「${face.textContent}」` : ok(face),
      };
    });
    const ng = !/^出ている/.test(r.中部) || !/^出ている/.test(r.看板);
    if (ng) bad++;
    console.log(`${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=${r.看板} / 中部=${r.中部}${ng ? "  ← だめ" : ""}`);
    await p.screenshot({ path: `/tmp/prod-me-${nochara ? "ayato" : "chara"}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `だめ ${bad}件` : "本番：看板・中部とも顔が出ている");
  process.exit(bad ? 1 : 0);
}
