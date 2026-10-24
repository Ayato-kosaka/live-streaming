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
 * `--base` は Expo の web を書き出したもの（`npx expo export --platform web`）を
 * 静的に配っている先。開発サーバーでは録らない（`CLAUDE.md`「測るときは開発サーバーを
 * 使わない」）。
 *
 * ## 何をしているか
 *
 * - アラートは `?preview=1`（偽の投げ銭）か `?preview=bank`（貯金箱だけ）で開く。
 *   外の口・ログ・WebSocket には繋がない
 * - アラートの面は透過なので、**配信画面に見立てた写真**（既定は旅先の写真）の上に
 *   iframe で重ねて録る。透過のままだと、背景を塞いでいるかが見えない
 * - キャラの絵は CDN（この箱から届かない）を、手元の絵（歩くあやと）に差し替える
 * - 録るのは CDP の screencast（JPEG）。Playwright の `recordVideo` は 1Mbps 固定で
 *   1080p が潰れるので使わない。コマの時刻を持ったまま ffmpeg で H.264 にする
 *   （ffmpeg が無ければ、コマの JPEG を置いたまま 2 で抜ける）
 *
 * `--shots 1.5,6,12` で、その秒（読み込みの完了から）に PNG も撮る（`--out` の横に置く）。
 *
 * 終了コード: 0 = 録れた / 1 = 録れたが中身がおかしい（コマが 10 枚未満） / 2 = 録れなかった
 */
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:4310").replace(/\/$/, "");
const mode = arg("mode", "alert"); // alert | bank
const amount = Number(arg("amount", "500"));
const fill = arg("fill", "60");
// 貯金箱を 0 から fill まで何秒かけて溜めるか（--mode bank のときだけ。0 は本番どおり）
const rise = arg("rise", "0");
const theme = arg("theme", "halloween");
const [W, H] = arg("size", "1920x1080").split("x").map(Number);
const out = resolve(arg("out", join(tmpdir(), `alert-${mode}-${amount}.mp4`)));
const backdrop = resolve(
  root,
  arg("backdrop", "public/review/p/prQT3orQPQkICePGbi3K-w960.webp")
);
const character = resolve(root, arg("character", "site/public/goods/ayato-walk.png"));
const shots = String(arg("shots", ""))
  .split(",")
  .filter((s) => s.trim() !== "")
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 0);

/* アラートの長さは `index.tsx` の `calculateAdjustedAlertDuration` と同じ式
   （30秒 + 1,000円以上で 15秒 + 10,000円以上で 30秒）。
   偽の投げ銭が出るまでの 0.8秒と、消えるまでの 0.5秒、前後の余白を足す。 */
const alertSec = 30 + (amount >= 10000 ? 30 : amount >= 1000 ? 15 : 0);
const seconds = Number(arg("seconds", mode === "alert" ? alertSec + 0.8 + 0.5 + 1.2 : 10));

/* `chrome.mjs` は `chromium-<番号>/chrome-linux/chrome` しか探さない。
   2026-10 の箱は `chrome-linux64/` に入っていて当たらないので、箱が用意している
   `/opt/pw-browsers/chromium`（実行ファイルへの symlink）に落とす */
const exe =
  chromePath() ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) {
  console.error("ブラウザが見つからない（chrome.mjs）");
  process.exit(2);
}

const q = new URLSearchParams({
  preview: mode === "bank" ? "bank" : "1",
  theme,
  fill,
  amount: String(amount),
  ...(Number(rise) > 0 ? { rise } : {}),
});
const target = `${base}/alertbox/?${q}`;

/* 舞台（写真の上に iframe）は、書き出しと**同じ生い立ち**に置く。
   別の生い立ち（例 http://stage.test/）から localhost を iframe で開くと、
   Chrome の「ローカルネットワークへのアクセス」の検査で止められて、真っ白な
   エラーの板だけが録れる */
const STAGE = `${base}/__alert-stage__/`;
const stageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#222}
body{background:url(backdrop) center/cover no-repeat}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent}
</style></head><body><iframe allowtransparency="true" src="${target}"></iframe></body></html>`;

/* 外へは出ない（全部ここで止める）ので、箱の proxy を使わせない。
   使わせると localhost まで proxy に渡って、iframe が開けない */
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--no-proxy-server"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

const external = [];
await ctx.route("**/*", async (route) => {
  const url = route.request().url();
  if (url === STAGE) {
    return route.fulfill({ contentType: "text/html", body: stageHtml });
  }
  if (url === `${STAGE}backdrop`) {
    return route.fulfill({
      contentType: `image/${extname(backdrop).slice(1).replace("jpg", "jpeg")}`,
      body: readFileSync(backdrop),
    });
  }
  // キャラの絵は CDN にある（この箱から届かない）。手元の絵で代える
  if (url.includes("cloudfront.net")) {
    return route.fulfill({ contentType: "image/png", body: readFileSync(character) });
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

const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ t: f.metadata.timestamp, data: Buffer.from(f.data, "base64") });
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
  console.error(`コマが ${frames.length} 枚しか取れなかった`);
  process.exit(2);
}

/* コマは変わったときにしか届かないので、間隔がまちまち。
   1枚ごとの長さを書いた並び（concat）にして、ffmpeg に 30fps へ揃えさせる */
const dir = join(tmpdir(), `alert-record-${process.pid}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
let list = "";
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, "0")}.jpg`;
  writeFileSync(join(dir, name), f.data);
  const next = frames[i + 1]?.t ?? f.t + 1 / 30;
  list += `file '${name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
});
// 最後のコマは concat の決まりで、もう一度書かないと長さが効かない
list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(join(dir, "list.txt"), list);

const span = frames[frames.length - 1].t - frames[0].t;
console.log(`コマ ${frames.length} 枚 / ${span.toFixed(1)} 秒 / 平均 ${(frames.length / span).toFixed(1)} fps`);

const ff = spawnSync("ffmpeg", ["-version"]);
if (ff.status !== 0) {
  console.error(`ffmpeg が無いので、コマを ${dir} に置いたまま抜ける`);
  process.exit(2);
}
const enc = spawnSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-movflags", "+faststart",
    out,
  ],
  { stdio: "inherit" }
);
rmSync(dir, { recursive: true, force: true });
if (enc.status !== 0 || !existsSync(out)) {
  console.error("ffmpeg で書けなかった");
  process.exit(2);
}
console.log("録れた", out);
process.exit(frames.length < 10 ? 1 : 0);
