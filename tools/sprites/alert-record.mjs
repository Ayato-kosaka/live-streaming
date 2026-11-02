/**
 * 投げ銭アラート（`app/alertbox`）の試し表示を、配信画面に重ねて録る。
 *
 *   cd tools/sprites
 *   node alert-record.mjs --base http://localhost:4310 --amount 500 --out /tmp/a.mp4
 *   node alert-record.mjs --base http://localhost:4310 --mode bank --fill 100 \
 *        --size 640x360 --seconds 10 --out /tmp/bank.mp4
 *   node alert-record.mjs --base http://localhost:4310 --mode bank --fill 100 --rise 8 \
 *        --size 960x540 --seconds 11 --out /tmp/bank-rise.mp4   # 8秒かけて溜める
 *
 * ## 縦（スマホの配信。PRISM Live、9:16）
 *
 * あやとの配信は縦で、PRISM Live（スマホ）から出ている。`--portrait` で 1080×1920 に
 * なり、背景は**本物の配信画面のスクショ**（`prism-<名前>.jpg`）になる。
 *
 *   export ALERT_BG_DIR=/path/to/bg      # prism-street.jpg などの置き場
 *   node alert-record.mjs --portrait --ui --also-small --sheet 6 \
 *        --amount 7000 --out /tmp/v/halloween-7000.mp4
 *   node alert-record.mjs --portrait --ui --mode bank --theme none --fill 60 \
 *        --frame 401,722,607,1082 --zoom 1.39 --outline --seconds 4 --shots 3 --out /tmp/v/pig.mp4
 *
 * - `--bg street|face|alert-now|alert-fish` … 背景の配信画面（既定 street）。
 *   置き場は `--bg-dir` か `ALERT_BG_DIR`。**本人の顔が写っているので git には入れない。**
 *   どちらも渡さなければ、リポジトリの縦の写真で代えて、その旨を1行出す
 * - `--backdrop <絵>` … 背景を名指しする（`--bg` より強い）
 * - `--ui` … PRISM が配信の上に重ねているもの（固定コメントの箱・透かし）を、
 *   **アラートより上に**描く。スクショにも焼き込まれているが、それはアラートの下になるので、
 *   アラートが隠れる所を見るにはこちらが要る。位置は画面に対する % で、
 *   `--ui-comment 上,下[,左,右]`（既定 11,18,12,88。固定コメントは動く）と
 *   `--ui-mark 上,下[,左,右]`（既定 94,98,56,94）
 * - `--frame 左,上,幅,高さ` … アラートの面（iframe）を置く箱。px か `%`。既定は画面いっぱい。
 *   PRISM では貯金箱が右下に小さく出ている。`--outline` で箱に線を引く
 * - `--zoom 1.5` … 面を 幅/1.5 × 高さ/1.5 で描いてから、箱いっぱいに拡げる（既定 1）。
 *   ウィジェットの本当の大きさ（ふだん 436×776）は `--frame 401,722,607,1082 --zoom 1.39`。
 *   PRISM の縮み方を入れると、この箱で豚が幅 249px（箱の 41%）に出て、本物の配信の豚と揃う
 *   （2026-11-02 に測った）。2026-10-23 に豚の外形で合わせた `--frame 633,1622,310,180 --zoom 1.25`
 *   は、**豚を2倍に描いたまま箱を小さく取って**釣り合わせたもので、ウィジェットの大きさではない
 *
 * `--base` は Expo の web を書き出したもの（`npx expo export --platform web`）を
 * 静的に配っている先。開発サーバーでは録らない（`CLAUDE.md`「測るときは開発サーバーを
 * 使わない」）。
 *
 * ## 何をしているか
 *
 * - アラートは `?preview=1`（偽の投げ銭）か `?preview=bank`（貯金箱だけ）で開く。
 *   外の口・ログ・WebSocket には繋がない
 * - アラートの面は透過なので、**配信画面に見立てた絵**の上に iframe で重ねて録る。
 *   透過のままだと、背景を塞いでいるかが見えない
 * - キャラの絵は CDN（この箱から届かない）を、手元の絵（歩くあやと）に差し替える
 * - 録るのは CDP の screencast（JPEG）。Playwright の `recordVideo` は 1Mbps 固定で
 *   1080p が潰れるので使わない。コマの時刻を持ったまま ffmpeg で H.264 にする
 *   （ffmpeg が無ければ、コマの JPEG を置いたまま 2 で抜ける）
 * - **screencast のコマの大きさを数える。** 届いたコマが `--size` と違えば（縮めて
 *   送ってきたら）1 で抜ける。ffmpeg の scale で引き伸ばすと、縮んだことが見えなくなる
 * - 書き出しは**スマホでそのまま再生できる形**（H.264 main / yuv420p / faststart / 音なし）。
 *   書いたあと ffprobe と箱の並びで確かめて、1行ずつ出す
 *
 * `--name 名前` `--msg メッセージ` で、試し表示の名前とメッセージを変える（長い名前・3行のとき）。
 * `--shots 1.5,6,12` で、その秒（読み込みの完了から）に PNG も撮る（`--out` の横に置く）。
 * `--grow-at 秒`（と `--grow-frame 左,上,幅,高さ`）で、その秒に面の箱を大きくする。
 * `--shrink-at 秒` で `--frame` に戻す（オーナーが手で箱を広げる・戻すのに合わせて見る）。
 * `--also-small` で、短い辺を 720 に縮めた版（縦なら 720×1280）を `-small.mp4` で並べて出す。
 * `--sheet 6`（コマ数）か `--sheet 2,8,20`（秒）で、録れた mp4 からコマ一覧の PNG を `-sheet.png` で出す。
 *
 * PRISM の縮み方（`visualViewport.scale = 0.5`。豚だけが半分に描かれ、雨の落ちる先も半分の高さ）を
 * **既定で入れて撮る**（`prism.mjs`。`docs/island-misses.md` #311）。`--no-prism` で外すのは、
 * 外したときの数を見る対照だけ。外した数で判断しない。
 *
 * 終了コード: 0 = 録れた / 1 = 録れたが中身がおかしい（コマが 10 枚未満・コマの大きさ違い・
 * 書き出しの形が違う） / 2 = 録れなかった
 */
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  readFileSync,
  openSync,
  readSync,
  fstatSync,
  closeSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://localhost:4310").replace(/\/$/, "");
const mode = arg("mode", "alert"); // alert | bank
const amount = Number(arg("amount", "500"));
const fill = arg("fill", "60");
// 貯金箱を 0 から fill まで何秒かけて溜めるか（--mode bank のときだけ。0 は本番どおり）
const rise = arg("rise", "0");
const theme = arg("theme", "halloween");
const [W, H] = arg("size", flag("portrait") ? "1080x1920" : "1920x1080").split("x").map(Number);
// yuv420p は縦横とも偶数でないと書けない（ffmpeg が途中で落ちる）
if (!(W > 0 && H > 0 && W % 2 === 0 && H % 2 === 0)) die(`--size は偶数の 幅x高さ で（${W}x${H}）`);
const portrait = H > W;
const out = resolve(arg("out", join(tmpdir(), `alert-${mode}-${amount}.mp4`)));
const character = resolve(root, arg("character", "site/public/goods/ayato-walk.png"));
const shots = String(arg("shots", ""))
  .split(",")
  .filter((s) => s.trim() !== "")
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 0);

/* 背景。横は今までどおり旅先の写真。縦は**本物の配信画面**（PRISM のスクショを
   1080×1920 に切り出したもの）を使う。スクショにはあやとの顔が写っているので
   git には入れず、置き場を `--bg-dir` か `ALERT_BG_DIR` で受け取る。
   **渡されたのに無ければ止まる**（黙って別の絵で録ると、本物の画面で見たつもりになる）。
   何も渡されていなければ、リポジトリの縦の写真で代えて、そう言う。
   横は `--bg` を名指ししたときだけスクショを使う（`ALERT_BG_DIR` を export したまま
   横を録ると、縦のスクショを横に切った絵になって「今までどおり」でなくなる）。 */
const FALLBACK_LANDSCAPE = "public/review/p/prQT3orQPQkICePGbi3K-w960.webp";
const FALLBACK_PORTRAIT = "public/review/p/0lFQ7XavMQpEsdFkAc7Q-w960.webp"; // 720×960 の街。cover で 9:16 に切れる
function pickBackdrop() {
  const named = arg("backdrop", null);
  if (named) {
    const p = resolve(root, named);
    if (!existsSync(p)) die(`--backdrop が無い: ${p}`);
    return p;
  }
  const dir = arg("bg-dir", process.env.ALERT_BG_DIR ?? "");
  const askedBg = arg("bg", null);
  if (askedBg || (portrait && dir)) {
    if (!dir) die("--bg を使うときは置き場を --bg-dir か ALERT_BG_DIR で渡す");
    const p = resolve(dir, `prism-${askedBg ?? "street"}.jpg`);
    if (!existsSync(p)) die(`背景が無い: ${p}`);
    return p;
  }
  if (portrait) {
    console.log(
      "背景: 本物の配信画面の置き場（--bg-dir / ALERT_BG_DIR）が無いので、リポジトリの写真で代える"
    );
    return resolve(root, FALLBACK_PORTRAIT);
  }
  return resolve(root, FALLBACK_LANDSCAPE);
}
const backdrop = pickBackdrop();

/* アラートの面を置く箱。px か %（画面に対して）。既定は画面いっぱい。
   PRISM の配信では、アラートは画面いっぱい・貯金箱は右下に小さく、と
   別々の大きさで置かれている */
function parseFrame(s) {
  const v = String(s).split(",").map((x) => x.trim());
  if (v.length !== 4) die(`--frame は 左,上,幅,高さ の4つ（${s}）`);
  const px = (x, total) =>
    x.endsWith("%") ? Math.round((total * parseFloat(x)) / 100) : Math.round(Number(x));
  const [x, y, w, h] = [px(v[0], W), px(v[1], H), px(v[2], W), px(v[3], H)];
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) die(`--frame が読めない（${s}）`);
  return { x, y, w, h };
}
const frame = parseFrame(arg("frame", `0,0,${W},${H}`));
/* 箱の大きさを途中で変える（オーナーは投げ銭が来てから手で箱を大きくし、終わったら戻す）。
   `--grow-at 秒` でその秒に `--grow-frame`（既定は画面いっぱい）へ、`--shrink-at 秒` で
   `--frame` へ戻す。拡げ方（--zoom）はそのまま。アラートの面がその場で描き直されるかを見るため */
const growAt = Number(arg("grow-at", "NaN"));
const shrinkAt = Number(arg("shrink-at", "NaN"));
const growFrame = parseFrame(arg("grow-frame", `0,0,${W},${H}`));
/* 面を何倍に拡げて箱に収めるか。アプリが小さく描いた面を拡げて置いている場合に合わせる
   （iframe は 幅/zoom × 高さ/zoom で描かれ、箱の大きさまで拡げられる）。
   字の大きさは px で決め打ちなので、拡げ方が違うと字と貯金箱の釣り合いが変わる */
const zoom = Number(arg("zoom", "1"));
if (!(zoom > 0)) die(`--zoom は正の数で（${arg("zoom")}）`);

/* PRISM が配信の上に重ねているものの位置（画面に対する %）。
   2つなら上下だけ、4つなら左右も。固定コメントの箱は配信ごとに動く */
function parseBand(name, fallback) {
  const v = String(arg(name, fallback)).split(",").map(Number);
  if (!(v.length === 2 || v.length === 4) || !v.every(Number.isFinite)) {
    die(`--${name} は 上,下 か 上,下,左,右（% で）`);
  }
  const d = fallback.split(",").map(Number);
  const [top, bottom, left, right] = v.length === 4 ? v : [v[0], v[1], d[2], d[3]];
  return { top, bottom, left, right };
}
const ui = flag("ui");
const uiComment = parseBand("ui-comment", "11,18,12,88");
const uiMark = parseBand("ui-mark", "94,98,56,94");
if (ui && !portrait) console.log("--ui は縦の画面（PRISM）の位置。横で描いても目安にならない");

/* アラートの長さは `index.tsx` の `calculateAdjustedAlertDuration` と同じ式
   （30秒 + 1,000円以上で 15秒 + 10,000円以上で 30秒）。
   偽の投げ銭が出るまでの 0.8秒と、消えるまでの 0.5秒、前後の余白を足す。 */
const alertSec = 30 + (amount >= 10000 ? 30 : amount >= 1000 ? 15 : 0);
const seconds = Number(arg("seconds", mode === "alert" ? alertSec + 0.8 + 0.5 + 1.2 : 10));

/* 短い辺を 720 にした大きさ（縦なら 720×1280）。チャットや artifact に置くのはこちら。
   もとが 720 以下なら作らない（大きくするだけになる） */
const even = (n) => Math.round(n / 2) * 2;
const small = (() => {
  if (!flag("also-small")) return null;
  const k = 720 / Math.min(W, H);
  if (k >= 1) {
    console.log(`--also-small: もとが ${W}x${H} で 720 以下なので作らない`);
    return null;
  }
  return [even(W * k), even(H * k)];
})();

/* `chrome.mjs` は `chromium-<番号>/chrome-linux/chrome` しか探さない。
   2026-10 の箱は `chrome-linux64/` に入っていて当たらないので、箱が用意している
   `/opt/pw-browsers/chromium`（実行ファイルへの symlink）に落とす */
const exe =
  chromePath() ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

const q = new URLSearchParams({
  preview: mode === "bank" ? "bank" : "1",
  theme,
  fill,
  amount: String(amount),
  ...(Number(rise) > 0 ? { rise } : {}),
  // 試し表示の名前とメッセージ（長い名前・3行で並べ方を見る）。古い書き出しは読まずに既定の字を出す
  ...(arg("name", null) != null ? { name: arg("name") } : {}),
  ...(arg("msg", null) != null ? { msg: arg("msg") } : {}),
});
const target = `${base}/alertbox/?${q}`;

/* PRISM の上乗せ。アラートの面（iframe）より上に置く（本物もアラートの上に出る）。
   大きさは画面の幅（vw）で決めて、縮めた版でも同じ見え方にする。
   寸法は本物のスクショ（1080×1920）から測った: 固定コメントの箱は x130〜945・y215〜350、
   丸い絵 70px、字 28px と 32px。透かしはロゴ 56px・「PRISM」太字 180px・「Live」104px、
   字の高さ 42px（Liberation Sans なら 58px で同じ幅になる）。スクショに焼き込まれた
   ものとずれると字が二重に見えるので、ここを動かしたら重ねて撮って確かめる。
   固定コメントの箱は本物（6割ほどの濃さ）より濃くしてある。スクショの側の固定コメントの
   字が透けて、字が二重に読めてしまうため */
const pct = (b) =>
  `top:${b.top}%;height:${b.bottom - b.top}%;left:${b.left}%;width:${b.right - b.left}%`;
const uiCss = `
.ui{position:fixed;z-index:10;pointer-events:none;box-sizing:border-box;color:#fff}
.ui-pin{display:flex;align-items:center;gap:2.3vw;padding:0 1.9vw;border-radius:1.1vw;
  background:rgba(30,30,30,.8);font-family:"IPAPGothic","IPAGothic","Noto Sans CJK JP",sans-serif}
.ui-pin i{flex:none;width:6.5vw;height:6.5vw;border-radius:50%;background:rgba(255,255,255,.4)}
.ui-pin div{display:flex;flex-direction:column;gap:1.4vw;min-width:0}
.ui-pin b{font-weight:400;font-size:2.6vw;opacity:.85}
.ui-pin span{font-size:3vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ui-mark{display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.88);
  font:5.37vw/1 "Liberation Sans",Arial,Helvetica,sans-serif}
.ui-mark svg{flex:none;width:5.4vw;height:5.1vw;margin-right:3.4vw}
.ui-mark b{font-weight:700}
.ui-mark span{margin-left:2.3vw}`;
const uiHtml = `
<div class="ui ui-pin" style="${pct(uiComment)}"><i></i><div><b>固定コメント</b><span>ここに固定したコメントが出る</span></div></div>
<div class="ui ui-mark" style="${pct(uiMark)}"><svg viewBox="0 0 60 56" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M30 3 57 53H3Z"/><path d="M30 17 46 46H14Z"/><path d="M30 30 36 40H24Z"/></svg><b>PRISM</b><span>Live</span></div>`;

/* 舞台（写真の上に iframe）は、書き出しと**同じ生い立ち**に置く。
   別の生い立ち（例 http://stage.test/）から localhost を iframe で開くと、
   Chrome の「ローカルネットワークへのアクセス」の検査で止められて、真っ白な
   エラーの板だけが録れる */
const STAGE = `${base}/__alert-stage__/`;
const stageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#222}
body{background:url(backdrop) center/cover no-repeat}
iframe{position:fixed;left:${frame.x}px;top:${frame.y}px;width:${frame.w / zoom}px;height:${frame.h / zoom}px;
  border:0;background:transparent;transform:scale(${zoom});transform-origin:0 0}
.outline{position:fixed;z-index:11;pointer-events:none;box-sizing:border-box;
  left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;
  outline:2px dashed rgba(0,255,200,.9);outline-offset:0}
${ui ? uiCss : ""}
</style></head><body><iframe allowtransparency="true" src="${target}"></iframe>${
  ui ? uiHtml : ""
}${flag("outline") ? '<div class="outline"></div>' : ""}</body></html>`;

/* 外へは出ない（全部ここで止める）ので、箱の proxy を使わせない。
   使わせると localhost まで proxy に渡って、iframe が開けない */
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
/* 舞台の iframe の中（アラートの面）にも効く。init script は frame ごとに走る */
await prism(ctx);
console.log(prismNote());

const external = [];
await ctx.route("**/*", async (route) => {
  const url = route.request().url();
  if (url === STAGE) {
    return route.fulfill({ contentType: "text/html", body: stageHtml });
  }
  if (url === `${STAGE}backdrop`) {
    return route.fulfill({
      contentType: `image/${extname(backdrop).slice(1).toLowerCase().replace("jpg", "jpeg")}`,
      body: readFileSync(backdrop),
    });
  }
  /* キャラの絵は CDN にある（この箱から届かない）。手元の絵で代える。本物の置き場
     （Firebase Storage）と同じく、よそからでも画素を読ませる（アラートが絵の中身の外接矩形を測る） */
  if (url.includes("cloudfront.net")) {
    return route.fulfill({
      contentType: "image/png",
      body: readFileSync(character),
      headers: { "access-control-allow-origin": "*" },
    });
  }
  if (url.startsWith(base)) return route.continue();
  if (url.startsWith("data:")) return route.continue();
  // 試し表示は外へ繋がないはず。来たら数えて、繋がずに落とす
  external.push(url);
  return route.abort();
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/* JPEG の頭（SOF）から縦横を読む。screencast は maxWidth/maxHeight や窓の大きさで
   黙って縮めて送ってくることがあるので、届いたコマを1枚ずつ数える */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return "読めない";
}

/* コマはその場で書き出す。1080×1920 だと1枚 200〜400KB で、50秒ぶんを
   持っておくと数百MB になる */
const dir = join(tmpdir(), `alert-record-${process.pid}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const frameName = (i) => `f${String(i).padStart(5, "0")}.jpg`;
const frames = [];
const sizes = new Map();
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async (f) => {
  const data = Buffer.from(f.data, "base64");
  writeFileSync(join(dir, frameName(frames.length)), data);
  frames.push(f.metadata.timestamp);
  const s = jpegSize(data);
  sizes.set(s, (sizes.get(s) ?? 0) + 1);
  try {
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
  } catch {
    /* 閉じたあとに届いた分 */
  }
});

await page.goto(STAGE, { waitUntil: "load" });
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 88,
  maxWidth: W,
  maxHeight: H,
  everyNthFrame: 1,
});
const t0 = Date.now();

const moveFrame = (f) =>
  page
    .evaluate(
      ({ f, zoom }) => {
        const el = document.querySelector("iframe");
        if (!el) return;
        Object.assign(el.style, {
          left: `${f.x}px`,
          top: `${f.y}px`,
          width: `${f.w / zoom}px`,
          height: `${f.h / zoom}px`,
        });
        const o = document.querySelector(".outline");
        if (o) Object.assign(o.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      },
      { f, zoom }
    )
    .catch(() => {});
if (Number.isFinite(growAt)) setTimeout(() => moveFrame(growFrame), growAt * 1000);
if (Number.isFinite(shrinkAt)) setTimeout(() => moveFrame(frame), shrinkAt * 1000);

const shotBase = join(dirname(out), basename(out, extname(out)));
mkdirSync(dirname(out), { recursive: true });
for (const s of [...shots].sort((a, b) => a - b)) {
  const wait = s * 1000 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const p = `${shotBase}-t${String(s).replace(".", "_")}.png`;
  await page.screenshot({ path: p });
  console.log("shot", p);
}
const rest = seconds * 1000 - (Date.now() - t0);
if (rest > 0) await page.waitForTimeout(rest);
await cdp.send("Page.stopScreencast");
await browser.close();

if (errors.length) console.log("JS の例外:", errors);
if (external.length) console.log("外へ出ようとした:", [...new Set(external)]);

if (frames.length < 2) {
  rmSync(dir, { recursive: true, force: true });
  die(`コマが ${frames.length} 枚しか取れなかった`);
}

let bad = frames.length < 10;
const want = `${W}x${H}`;
const sizeNote = [...sizes].map(([s, n]) => `${s} ×${n}`).join(" / ");
if (sizes.size !== 1 || !sizes.has(want)) {
  console.error(`screencast のコマが ${want} ではない: ${sizeNote}（引き伸ばして書くので、絵は粗い）`);
  bad = true;
}

/* コマは変わったときにしか届かないので、間隔がまちまち。ここで 30fps の並びに直す
   （1/30 秒ごとに、その時刻までに届いたいちばん新しいコマ）。並びは元のコマへの symlink。
   前は1枚ごとの長さを書いた concat で ffmpeg に揃えさせていたが、concat は1枚を 1/25 秒より
   短くできず、コマが速く届く場面（演出の山）ほど動画が間延びした（52 秒が 66.9 秒になった） */
const FPS = 30;
const nOut = Math.max(1, Math.round((frames[frames.length - 1] - frames[0]) * FPS) + 1);
let src = 0;
for (let k = 0; k < nOut; k++) {
  const t = frames[0] + k / FPS;
  while (src + 1 < frames.length && frames[src + 1] <= t + 1e-6) src++;
  symlinkSync(join(dir, frameName(src)), join(dir, `s${String(k).padStart(6, "0")}.jpg`));
}

const span = frames[frames.length - 1] - frames[0];
console.log(
  `コマ ${frames.length} 枚 / ${span.toFixed(1)} 秒 / 平均 ${(frames.length / span).toFixed(1)} fps / 大きさ ${sizeNote}`
);

const ff = spawnSync("ffmpeg", ["-version"]);
if (ff.status !== 0) die(`ffmpeg が無いので、コマを ${dir} に置いたまま抜ける`);

/* スマホでそのまま再生できる形にする。high より main のほうが古い端末でも通る。
   faststart で moov を頭に置かないと、置いた先で全部落ちてくるまで再生が始まらない。
   音は元から無いが、無いことを明示しておく */
const smallOut = `${shotBase}-small.mp4`;
const x264 = (crf) => [
  "-c:v", "libx264", "-profile:v", "main", "-preset", "medium", "-crf", crf,
  "-an", "-movflags", "+faststart",
];
const scale = (w, h) => `scale=${w}:${h}:flags=lanczos,format=yuv420p`;
const encArgs = [
  "-y", "-loglevel", "error",
  "-framerate", String(FPS), "-i", join(dir, "s%06d.jpg"),
  ...(small
    ? [
        "-filter_complex",
        `[0:v]fps=30,split=2[a][b];[a]${scale(W, H)}[big];[b]${scale(small[0], small[1])}[small]`,
        "-map", "[big]", ...x264("20"), out,
        "-map", "[small]", ...x264("21"), smallOut,
      ]
    : ["-vf", `fps=30,${scale(W, H)}`, ...x264("20"), out]),
];
const enc = spawnSync("ffmpeg", encArgs, { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
if (enc.status !== 0 || !existsSync(out)) die("ffmpeg で書けなかった");

/* 書いたものを確かめる。ffprobe で大きさ・profile・画素の形・音の有無、
   箱の並びで faststart（moov が mdat より前）を見る */
function moovFirst(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const hdr = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      readSync(fd, hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString("latin1", 4, 8);
      if (len === 1) len = Number(hdr.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (type === "moov") return true;
      if (type === "mdat" || len < 8) return false;
      pos += len;
    }
    return false;
  } finally {
    closeSync(fd);
  }
}
function probe(path, [w, h]) {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-show_entries",
    "stream=codec_type,codec_name,profile,width,height,pix_fmt:format=duration",
    "-of", "json", path,
  ]);
  if (r.status !== 0) {
    console.log(`確かめられない（ffprobe が無い）: ${path}`);
    return { ok: true, duration: null };
  }
  const j = JSON.parse(String(r.stdout));
  const v = j.streams.find((s) => s.codec_type === "video") ?? {};
  const audio = j.streams.some((s) => s.codec_type === "audio");
  const fast = moovFirst(path);
  const ok =
    v.width === w && v.height === h && v.codec_name === "h264" && v.profile === "Main" &&
    v.pix_fmt === "yuv420p" && !audio && fast;
  const duration = Number(j.format?.duration);
  console.log(
    `${ok ? "録れた" : "形が違う"} ${path}: ${v.width}x${v.height} ${v.codec_name} ${v.profile} ${v.pix_fmt}` +
      ` / ${duration.toFixed(1)} 秒 / ${audio ? "音あり" : "音なし"} / ${fast ? "faststart" : "moov が後ろ"}`
  );
  return { ok, duration };
}
const big = probe(out, [W, H]);
if (!big.ok) bad = true;
if (small && !probe(smallOut, small).ok) bad = true;

/* コマ一覧。録れた mp4 から何コマか抜いて1枚に並べる（引き伸ばし・切れ・黒帯を
   一目で見るため）。数なら全体に等間隔、カンマ区切りなら その秒 */
const sheetArg = arg("sheet", "");
if (sheetArg) {
  const dur = big.duration ?? span;
  const n = Math.max(1, Math.round(Number(sheetArg)) || 6);
  const times = sheetArg.includes(",")
    ? sheetArg.split(",").map(Number).filter((t) => Number.isFinite(t) && t >= 0 && t < dur)
    : Array.from({ length: n }, (_, i) => Number(((dur * (i + 0.5)) / n).toFixed(1)));
  // 長い辺を 640 にそろえる。縦は横一列、横は3列で折る
  const [tw, th] = portrait ? [even((640 * W) / H), 640] : [640, even((640 * H) / W)];
  const cols = Math.min(times.length, portrait ? 6 : 3);
  const pad = 8;
  const font = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
  ].find((p) => existsSync(p));
  const label = (t) =>
    font
      ? `,drawtext=fontfile=${font}:text='${t}s':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6`
      : "";
  const chains = times.map(
    (t, i) =>
      `[${i}:v]trim=end_frame=1,scale=${tw}:${th}:flags=lanczos${label(t)},pad=iw+${pad * 2}:ih+${pad * 2}:${pad}:${pad}:white[v${i}]`
  );
  const layout = times
    .map((_, i) => `${(i % cols) * (tw + pad * 2)}_${Math.floor(i / cols) * (th + pad * 2)}`)
    .join("|");
  const graph =
    times.length > 1
      ? `${chains.join(";")};${times.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${times.length}:layout=${layout}:fill=white[s]`
      : chains[0].replace(/\[v0\]$/, "[s]");
  const sheet = `${shotBase}-sheet.png`;
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      ...times.flatMap((t) => ["-ss", String(t), "-i", out]),
      "-filter_complex", graph, "-map", "[s]", "-frames:v", "1", sheet,
    ],
    { stdio: "inherit" }
  );
  console.log(r.status === 0 ? `コマ一覧 ${sheet}（${times.join(", ")} 秒）` : "コマ一覧を書けなかった");
}

process.exit(bad ? 1 : 0);
