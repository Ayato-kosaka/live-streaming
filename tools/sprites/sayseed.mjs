/**
 * 付箋と企画を**本番の中身で**出した状態にする差し込み。
 *
 *   PORT=5000 TAG=saynote SEED=tools/sprites/sayseed.mjs \
 *     PAGES=/nordic/lithuania.html,/board.html node tools/sprites/inkpx.mjs
 *
 * どちらも口から来るので、書き出したものを開いただけでは1枚も出ない。
 * 字の濃さを測る道具はページを開くだけなので、ここで口を差し替える。
 * **中身は本番から引いたものをそのまま使う**（#1）。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";

const PROD = "https://live-streaming-d3cac.web.app/island-api";
const CACHE = "/tmp/say/api";

function prod(path, file) {
  mkdirSync(CACHE, { recursive: true });
  const at = `${CACHE}/${file}`;
  if (!existsSync(at)) {
    writeFileSync(at, execFileSync("curl", ["-s", "--max-time", "60", PROD + path], { maxBuffer: 1 << 26 }));
  }
  return JSON.parse(readFileSync(at, "utf-8"));
}

export async function apply(ctx) {
  const state = prod("/state", "state.json");
  const stickies = prod("/stickies", "stickies.json");
  const plans = prod("/nextplans?limit=60&events=1", "plans.json");
  const json = (r, v) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  /* **受け皿を先に。** Playwright はあとから登録した route を先に当てるので、
     受け皿をあとに書くと、その下の3本が1つも当たらない */
  await ctx.route(/\/island-api\//, (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/state/, (r) => json(r, state));
  await ctx.route(/\/island-api\/stickies/, (r) => json(r, stickies));
  await ctx.route(/\/island-api\/nextplans/, (r) => json(r, plans));
}
