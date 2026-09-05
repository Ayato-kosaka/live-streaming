// 世界観の統一を見るための道具。全ページを1つのブラウザで撮る。
// ばらばらに見ても不統一は見つからないので、必ず並べて見る前提の連番で出す。
//   PORT=3032 node wsheet.mjs [出力フォルダ] [幅]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const PORT = process.env.PORT || "3032";
const OUT = process.argv[2] || "/tmp/wsheet";
const W = +(process.argv[3] || 390);
const H = +(process.argv[4] || 1400);
mkdirSync(OUT, { recursive: true });

// 並べて見たときに「島 → 島の外」の順に効くよう、島から遠い順ではなく導線の順に並べる
const PAGES = [
  ["00-top", "/"],
  ["01-about", "/about"],
  ["02-streams", "/streams"],
  ["03-streams-slug", "/streams/cooking"],
  ["04-kitchen", "/kitchen"],
  ["05-kitchen-slug", "/kitchen/egg-sandwich"],
  ["06-legends", "/legends"],
  ["07-legends-slug", "/legends/iran-walk"],
  ["08-apps", "/apps"],
  ["09-apps-slug", "/apps/nanitabeyo"],
  ["10-next", "/next"],
  ["11-next-new", "/next/new"],
  ["12-board", "/board"],
  ["13-map", "/map"],
  ["14-map-slug", "/map/france"],
  ["15-nordic", "/nordic"],
  ["16-nordic-guide", "/nordic/guide"],
  ["17-nordic-country", "/nordic/finland"],
  ["18-friends", "/friends"],
  ["19-now", "/now"],
  ["20-design", "/design"],
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 640 });
// サンドボックスから出られない先はローカル画像に差し替える（tools/sprites/talk.mjs と同じ）
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

// 他の担当が next.config を触ると開発サーバーが勝手に再起動する。
// 1枚失敗しただけで残り全部を落とさないよう、ページごとに数回待って撮り直す。
for (const [name, path] of PAGES) {
  const errs = [];
  const onErr = e => errs.push(String(e).slice(0, 160));
  p.on("pageerror", onErr);
  let done = false;
  for (let tryN = 0; tryN < 6 && !done; tryN++) {
    try {
      await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      const info = await p.evaluate(() => ({
        h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) || "(なし)",
        scrollH: document.documentElement.scrollHeight,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }));
      console.log(`${name}\t${path}\tscrollH=${info.scrollH}\toverflow=${info.overflow}\th1=${info.h1}\terr=${errs.length}`);
      done = true;
    } catch (e) {
      if (tryN === 5) console.log(`${name}\t${path}\tFAILED ${String(e).slice(0, 120)}`);
      else await p.waitForTimeout(8000);
    }
  }
  p.off("pageerror", onErr);
}
await b.close();
