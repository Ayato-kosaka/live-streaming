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
 *
 * **リダイレクトは追う。追ったことは言う。**（#164）
 * 本番には Hosting のリダイレクトが在る（`/nordic/photos` → 301 → `/cards`）。
 * 追わないと 301 の本文21バイトを面として掴んで「h1 が0個」と赤を出す。
 * 追うだけだと、今度は別の面を撮っているのに気づけない。だから
 * **追った先**（`redirects(ctx)`）と、**小さすぎた本文**（`thin(ctx)`）を
 * 数えて表に出し、その場でも1行ずつ標準エラーに出す。
 * 判定だけを切り出した見張りが `prodcurl_selftest.mjs`（毎 PR で走る）。
 */
/* **`playwright-core` は、回すときになってから読む。** 下の `main` の中で
   `await import` している。理由は、この道具の**判定だけ**を毎 PR で回したいから
   （`prodcurl_selftest.mjs`）。CI には `tools/sprites/node_modules` が無いので、
   ここで静的に読むと見張りが import の行で死ぬ。`preclaim.mjs` と同じ形。 */
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

   **2026-09-16 に3回目をやった。** 顔の置き場を `yt3\.ggpht\.com` と
   ホスト名で書いていたので、`yt4.ggpht.com` が止まっていた。他己紹介の面
   （`/about`）はそこから視聴者さんの顔を取るので、撮ると「絵が落ちた 3枚」と
   出る。**本番は無事**（3本とも curl で 200 / jpeg、本番の `/about` に
   22件焼かれている）。番号は YouTube の側の都合で振られるもので、こちらは
   選べない。**ホスト名ではなく置き場で書く**——`ggpht\.com` にした。
   `yt3` も `yt4` もこれで通る。

   **`upload.wikimedia.org` は、いちど入れて外した。** curl では 200 で
   取れるが、こちらが回数を出すと **429 を返してくる**。通しておくと
   「1枚だけ落ちた」が混み具合で出たり消えたりして、**確かめが揺れる。**
   揺れる確かめは、無いほうがまし（#106 と同じ理由）。外してあるので
   あの絵は「飢え」に数えられ、`??`（見ていない）と出る。**それが本当。** */
const PASS = /live-streaming-d3cac\.web\.app|ggpht\.com|googleusercontent\.com|storage\.googleapis\.com|i\.ytimg\.com|docs\.google\.com|i\.ibb\.co|cdn-public\.nanitabeyo\.net/;
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

/** **たどった先**（元の URL → 行き着いた URL）と、**小さすぎた本文**（URL → バイト数）。
 *  `BLOCKED` と同じ考え方で、ctx ごとに溜めて表に出す。 */
const REDIR = new WeakMap();
const THIN = new WeakMap();

/** その ctx で**リダイレクトを追った先**。撮った面が別の面だったかが分かる。 */
export function redirects(ctx) {
  return REDIR.get(ctx) || new Map();
}

/** その ctx で**本文が小さすぎた面**（URL → バイト数）。 */
export function thin(ctx) {
  return THIN.get(ctx) || new Map();
}

/** 本文が「面として数えてよい大きさ」かの境目。
 *
 * **本番130面の実測（2026-09-19）で、いちばん小さい面は `/roulette` の 35,738B。**
 * 掴んでしまう側は、Hosting のリダイレクトの本文が **21B**（`Redirecting to /cards`）、
 * 空の応答が 0B。**3桁空いている**ので、その谷に置けばどちらにも当たらない。
 *
 * 4,096B は最小の面の **1/8**——面が今の 1/8 まで痩せても鳴らないし、
 * リダイレクトの本文の 195倍なので、あちらは必ず鳴る。
 * **上げない。** 上げるほど「本当に小さい正しい面」を誤って鳴らす。 */
export const THIN_BYTES = 4096;

/** 掴んだものが「本当にその面か」を判じる。**route の中と見張りの両方から呼ぶ。**
 *
 * ブラウザも本番も要らない純粋な関数にしてあるのは、ここが腐ると出るのが
 * **「0件」**だから（#157）。0件はいちばん合格に見えるので、毎 PR で回す。
 *
 * @param doc その要求が**面そのもの**か（`resourceType() === "document"`）。
 *   小ささを見るのは面だけ。**小さい css や png は正しい**ので、
 *   そこまで鳴らすと誰も読まない道具になる。
 */
export function judge({ url, hops = 0, final = "", size = 0, doc = false },
                      { thinLimit = THIN_BYTES } = {}) {
  const at = (u) => { try { return new URL(u).pathname || u; } catch { return u; } };
  const out = [];
  if (hops > 0) {
    out.push({ kind: "たどった", url, final,
      msg: `⇢ たどった: ${at(url)} → ${at(final)}（撮れているのは ${at(final)} の中身）` });
  }
  if (doc && size < thinLimit) {
    out.push({ kind: "小さすぎ", url, size,
      msg: `⚠ 本文が ${size}B しかない: ${at(url)}（本番の最小の面は 35,738B）。面として数えない` });
  }
  return out;
}

/** 本番から1本取る。**リダイレクトを追い、追った事実を返す。**
 *
 * **`-L` が無いと、301 の本文21バイトを「その面の中身」として掴む。**
 * 本番には Hosting のリダイレクトが在る（`firebase.json` の `redirects`）。
 * `/nordic/photos` → 301 → `/cards` がそれで、全面巡回が
 * **「h1 が0個」を赤として出していた。本番は無事**（`-L` なら 200 / 76,701B で
 * `/cards` と md5 が一致する）。**測れていないものを、測れた顔で 0 として出す形**
 * （#157 と同じ）。道具の側に在るので、次に使う人も同じように踏む。
 *
 * **追うだけにはしない。** 黙って追うと、今度は「リダイレクトされているのに、
 * されていないと思って測る」という別の穴になる。`/nordic/photos` を撮ったのに
 * 中身が `/cards` だった、というのは**撮った人が知るべきこと**なので、
 * 追った回数と行き着いた先を curl から取って返す。
 * 本文を汚さないように、書き出しは `%{stderr}` で**標準エラーへ**送る。
 *
 * @param follow 対照のための足。`false` にすると**この直しを外した状態**になる。
 */
export async function fetchProd(u, { follow = true } = {}) {
  /* **`-f` を付ける。** 付けないと 4xx / 5xx でも curl は 0 で終わり、
     **エラーの HTML を `image/jpeg` として流し込む。** 絵は当然デコードに
     失敗するので、画面には「絵が落ちた」と出る。**本番は無事なのに。**
     実際 `upload.wikimedia.org` がこの箱の curl を絞って 429 を返し、
     それを絵として配って1枚を不具合に見せていた。

     **同期で回さない。** 前は `execFileSync` だったので、要求が1本ずつ
     順番に並んだ。非同期にして並ばせてある。**これで直った数字は無い**
     （`/streams` の「絵 26/41」は畳みの中の `loading="lazy"` で、
     ブラウザが最初から要求していなかった）。**何かを直した証拠として引かない。** */
  const args = ["-fsS", "--retry", "3", "--max-time", "40",
    /* 本文は標準出力、追った記録は標準エラー。混ぜると画像が壊れる */
    "-w", "%{stderr}\n%{num_redirects} %{url_effective}\n"];
  if (follow) args.push("-L");
  args.push(u);
  const { stdout, stderr } = await run("curl", args, { maxBuffer: 1 << 28, encoding: "buffer" });
  /* curl は `-sS` でも警告を出すことがあるので、**最後の行**だけを読む */
  const last = String(stderr).trim().split("\n").pop() || "";
  const m = last.match(/^(\d+) (\S+)$/);
  return { body: stdout, hops: m ? Number(m[1]) : 0, final: m ? m[2] : u };
}

/** 同じことを何度も言わない。面の数だけ出すと読まれなくなる */
const SAID = new Set();

export async function viaCurl(ctx) {
  BLOCKED.set(ctx, new Map());
  REDIR.set(ctx, new Map());
  THIN.set(ctx, new Map());
  await ctx.route("**/*", async (r) => {
    const u = r.request().url();
    if (!PASS.test(u)) {
      const m = BLOCKED.get(ctx);
      const h = (() => { try { return new URL(u).host; } catch { return u.slice(0, 40); } })();
      m.set(h, (m.get(h) || 0) + 1);
      return r.abort();
    }
    try {
      const { body, hops, final } = await fetchProd(u);
      /* **たどった事実を、撮った人に届ける。**
         `blocked()` と同じく ctx に溜めて表に出す。それに加えて**その場で
         標準エラーに1行出す**——この道具を呼んでいる巡回は18本あって、
         こちらからは直せない。溜めるだけだと、誰も読まない場所に溜まる。
         同じ行は1度だけ（`SAID`）。 */
      const doc = r.request().resourceType() === "document";
      for (const n of judge({ url: u, hops, final, size: body.length, doc })) {
        if (n.kind === "たどった") REDIR.get(ctx).set(u, final);
        else THIN.get(ctx).set(u, n.size);
        if (!SAID.has(n.msg)) { SAID.add(n.msg); console.error(n.msg); }
      }
      /* 種類は**行き着いた先**の拡張子で決める。`/a.png` → `/b.webp` と
         追ったときに、元の名前で決めると別物として流し込むことになる */
      const ext = ((final || u).split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "html").toLowerCase();
      await r.fulfill({ status: 200, contentType: TYPE[ext] || "text/html", body });
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
  const { chromium } = await import("playwright-core");
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
    /* **追った先と、小さすぎた本文を、撮るたびに表に出す。**
       追ったのは事故ではない（本番の設計どおりのこともある）ので数えて見せるだけ。
       小さすぎる本文は**その面について何も言えない**という意味なので、
       0件を合格に見せないために**だめに数える**（#157 の決めごと1）。 */
    for (const [from, to] of redirects(ctx)) console.log(`  たどった ${from} → ${to}`);
    for (const [u, n] of thin(ctx)) { bad++; console.log(`  小さすぎ ${u} ${n}B ← だめ`); }
    await p.screenshot({ path: `/tmp/prod-me-${nochara ? "ayato" : "chara"}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `だめ ${bad}件` : "本番：看板・顔・キャラクターの絵、どれも出ている");
  process.exit(bad ? 1 : 0);
}
