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
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
import { apply } from "./asme.mjs";

export const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";
/* 通す先。**置き場も配信のサムネも通す。** 図鑑の「落とす」は名簿が
   持っている置き場の URL を直に取りに行く。ここを止めたまま撮ると
   「絵が落ちた」と出て、直っているものを直っていないと読む
   （2026-09-10 に1回やった。同じ轍）。

   **2026-09-16 に2回目をやった。** `firebasestorage.googleapis.com` しか
   通していなかったので、素の `storage.googleapis.com` が止まっていた。
   料理ランキングの面（`#853_…`）はそこから 18,140 行を取るので、撮ると
   「いまはランキングを出せません」の空っぽな絵になる。**本番は無事だった**
   （curl では 200 / 5.1MB 返る）。あやうく直っているものを不具合として
   報告するところだった。
   `storage\.googleapis\.com` は `firebasestorage\.googleapis\.com` にも
   当たるので、短いほうだけ書けば両方通る。

   `i.ytimg.com` も足した。配信のサムネはここから来る。**ただしこちらは
   「止まっていたせいで壊れて写っていた」わけではない。** `/streams` の
   サムネ15枚は閉じた `<details>` の中の `loading="lazy"` で、そもそも
   ブラウザが要求しない（route に1本も来ないことを数えた）。畳みを開いて
   撮るときに要るので、先に通してある。

   **足すときは curl で届くことを先に見る。** 届かない先を通しても
   abort が fulfill に変わるだけで、絵は空のまま。

   **`upload.wikimedia.org` は、いちど入れて外した。** curl では 200 で
   取れるが、こちらが回数を出すと **429 を返してくる**。通しておくと
   「1枚だけ落ちた」が混み具合で出たり消えたりして、**確かめが揺れる。**
   揺れる確かめは、無いほうがまし（#106 と同じ理由）。外してあるので
   あの絵は「飢え」に数えられ、`??`（見ていない）と出る。**それが本当。** */
const PASS = /live-streaming-d3cac\.web\.app|yt3\.ggpht\.com|googleusercontent\.com|storage\.googleapis\.com|i\.ytimg\.com|docs\.google\.com|i\.ibb\.co|cdn-public\.nanitabeyo\.net/;
const TYPE = { js: "application/javascript", css: "text/css", html: "text/html",
  json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain" };

/** curl 経由で本番に届くようにする。**apply より先に呼ぶ**
    （Playwright はあとから登録した route が先に効くので、差し込みが勝つ） */
/** **止めた先を数える。** `viaCurl` を掛けた ctx ごとに溜める。
 *
 * 通していない先があると、面は**壊れているのではなく飢えている。**
 * 見分けがつかないまま「本番の不具合」と読んだことが3回ある
 * （2026-09-10 の顔、2026-09-16 の `storage.googleapis.com` と
 *  `docs.google.com` / `i.ibb.co`）。宛先を1つずつ足して追いかけても、
 * **次に増えた先でまた同じことになる。** so 数えて表に出す。 */
const BLOCKED = new WeakMap();

/** その ctx で止めた先（ホスト名 → 回数）。撮ったあとに必ず見る。 */
export function blocked(ctx) {
  return BLOCKED.get(ctx) || new Map();
}

export async function viaCurl(ctx) {
  BLOCKED.set(ctx, new Map());
  await ctx.route("**/*", async (r) => {
    const u = r.request().url();
    if (!PASS.test(u)) {
      const m = BLOCKED.get(ctx);
      const h = (() => { try { return new URL(u).host; } catch { return u.slice(0, 40); } })();
      m.set(h, (m.get(h) || 0) + 1);
      return r.abort();
    }
    try {
      /* **同期で curl を回さない。** 前は `execFileSync` だったので、
         要求が1本ずつ順番に並んだ。非同期にして並ばせる。

         **これで直った数字は無い。** `/streams` の「絵 26/41」を詰まりだと
         疑って変えたが、実際は**閉じた `<details>` の中の `loading="lazy"`**
         で、ブラウザが最初から要求していなかった（route に1本も来ない）。
         本番も道具も無事だった。変えたこと自体は損にならないので残すが、
         **何かを直した証拠として引かない。** */
      /* **`-f` を付ける。** 付けないと 4xx / 5xx でも curl は 0 で終わり、
         **エラーの HTML を `image/jpeg` として流し込む。** 絵は当然デコードに
         失敗するので、画面には「絵が落ちた」と出る。**本番は無事なのに。**
         実際 `upload.wikimedia.org` がこの箱の curl を絞って 429 を返し、
         それを絵として配って1枚を不具合に見せていた。 */
      const { stdout } = await run("curl", ["-fsS", "--retry", "3", "--max-time", "40", u],
        { maxBuffer: 1 << 28, encoding: "buffer" });
      const ext = (u.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "html").toLowerCase();
      await r.fulfill({ status: 200, contentType: TYPE[ext] || "text/html", body: stdout });
    } catch {
      /* **取れなかったぶんも「止めた」に数える。** 通してあっても向こうが
         断れば、面は同じように飢える。壊れと混ぜない。 */
      const m = BLOCKED.get(ctx);
      const h = (() => { try { return new URL(u).host + "(取れず)"; } catch { return "取れず"; } })();
      m.set(h, (m.get(h) || 0) + 1);
      await r.abort().catch(() => {});
    }
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
    /* **選ぶところは、いまの class に合わせる。** `/me` を作り直したとき
       （#53）に `.mp-face` は無くなっていて、ここだけ古い名前を探し続けて
       いた。**要素が無いので毎回「中部=無し ← だめ」**と出て、本番が
       壊れているように読める。2026-09-11 に直した。 */
    const r = await p.evaluate(() => {
      const src = (e) => ((e?.currentSrc || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 46) || "(空)");
      const ok = (e) => (e ? (e.naturalWidth > 0 ? `出ている ${src(e)}` : `落ちた ${src(e)}`) : "無し");
      const face = document.querySelector(".mh-face");
      return {
        看板: ok(document.querySelector(".ih-me img")),
        // YouTube の顔。絵の無い人は字（頭文字）の丸になる
        顔: face && face.tagName !== "IMG" ? `字「${face.textContent.trim()}」` : ok(face),
        // キャラクターの絵。**あやとは持っていない**ので、無くてよい
        絵: ok(document.querySelector(".mh-chara")),
      };
    });
    /* あやと（`nochara`）はキャラクターの絵を持たない。**そこを「だめ」に
       しない。** 看板と顔はどちらの人でも出ていないとだめ。 */
    const ng = !/^出ている/.test(r.看板) ||
      !/^(出ている|字「)/.test(r.顔) ||
      (!nochara && !/^出ている/.test(r.絵));
    if (ng) bad++;
    console.log(`${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=${r.看板} / 顔=${r.顔} / 絵=${r.絵}${ng ? "  ← だめ" : ""}`);
    await p.screenshot({ path: `/tmp/prod-me-${nochara ? "ayato" : "chara"}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `だめ ${bad}件` : "本番：看板・顔・キャラクターの絵、どれも出ている");
  process.exit(bad ? 1 : 0);
}
