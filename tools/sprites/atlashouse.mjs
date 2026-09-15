/**
 * 建設中の家と、できあがった家の**寸法を突き合わせる。**
 *
 *   SPORT=4340 node atlashouse.mjs
 *
 * 「50%が100%より大きい」を目で気づけなかったので、数で出す
 * （`docs/island-misses.md` #10）。SVG のユーザ単位でそのまま比べる。
 *
 * ## 黙って null を返していたのを直した（#416 と同じ形）
 *
 * 2026-09-15 に回したら、3段階とも `{"build":null,"hut":null}` を出して
 * **終了コード 0 で終わった。** 理由は2つあって、どちらも道具の側。
 *
 * 1. 差し替える写真に `/home/user/atlas-wt/…` という**消えた worktree** を
 *    指していた。`offline()` は `fulfill({path})` に直で渡すので、外の絵が
 *    ぜんぶ読めなくなる。既定（`site/public/og.png`）に戻した
 * 2. 押す島を「北欧周遊」と焼き込んでいた。建設中の模型が出るのは
 *    **次の島**（`Isles.tsx` の `c === nextCh && planned`）だけで、北欧は
 *    もう次の島ではない。しかも次のアルバニアは `opensAt` も `plannedDays`
 *    も無いので `planned` が false になり、**いまはどの島にも家が出ない**
 *
 * 2 は島の側の状態なので道具では直せない。だから**そう言って落ちる。**
 * 家が1つも見つからなければ、何を探して見つからなかったかを並べて
 * **終了コード2**（0=通った / 1=途中で落ちた / 2=測るものが無い。
 * `cardshot.mjs` と同じ。`docs/island-standards.md` 10）。
 *
 *   ISLE=アルバニア  押す島を名前で指定する（既定: 家の出る島を自分で探す）
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4340";
/** 押す島。渡さなければ、家の出る島を総当たりで探す */
const ISLE = process.env.ISLE || "";
/** 見つからなかったもの。**空でなければ 2 で落ちる。** */
const missing = [];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

/** その島を出して、家の寸法を測る。出ていなければ null を返す */
async function measure(p, label) {
  await p.evaluate((l) => {
    const el = [...document.querySelectorAll(".atl-pin")].find((x) => x.getAttribute("aria-label") === l);
    el?.click();
  }, label);
  await p.waitForTimeout(900);
  return p.evaluate(() => {
    const svg = document.querySelector(".atl-isle.is-at .dio");
    if (!svg) return null;
    const g = svg.querySelector(".dio-house");
    const img = svg.querySelector("image[href*='hut-home']");
    const bb = (e) => { const k = e.getBBox(); return { x: +k.x.toFixed(1), y: +k.y.toFixed(1), w: +k.width.toFixed(1), h: +k.height.toFixed(1) }; };
    return { build: g ? bb(g) : null, hut: img ? bb(img) : null };
  });
}

for (const [tag, yen] of [["frame", 6000], ["walls", 30000], ["done", 52000]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // 外の絵は `route.mjs` の既定（`site/public/og.png`）に任せる。
  // ここで自前のパスを指すと、そのファイルが消えたときに黙って絵が落ちる
  await offline(ctx);
  await ctx.route(/\/island-api\/fund/, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: yen, given: yen, targetAmount: 50000, people: 12 }) }),
  );
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/atlas.html`, { waitUntil: "load" });
  await p.waitForTimeout(1400);

  /* 押す島。指定が無ければ**家の出る島を探す。**
     焼き込んだ名前を押して「出なかった」を null で返すのが、前の壊れ方 */
  const labels = ISLE
    ? [`${ISLE}を見る`]
    : await p.evaluate(() => [...document.querySelectorAll(".atl-pin")].map((x) => x.getAttribute("aria-label")));
  if (!labels.length) missing.push(`${tag}: 島の印（.atl-pin）が1つも無い`);

  let got = null, where = "";
  for (const lab of labels) {
    const r = await measure(p, lab);
    if (r && (r.build || r.hut)) { got = r; where = lab; break; }
  }
  if (!got) {
    // どの島にも家が無い。**null を出して 0 で終わらない**
    missing.push(`${tag}: ${labels.length}島ぜんぶに .dio-house も hut-home も無い`);
    console.log(tag, "家が出ていません（測っていません）");
  } else {
    console.log(tag, where, JSON.stringify(got));
  }
  await ctx.close();
}
await b.close();

if (missing.length) {
  console.error("\n測るものが見つかりませんでした:");
  for (const m of missing) console.error("  - " + m);
  console.error(
    "\n建設中の模型が出るのは**次の島**だけです（`Isles.tsx`: c === nextCh && planned）。\n" +
    "いまの次の島に `opensAt` も `plannedDays` も無いと、どの島にも家は出ません。\n" +
    "その状態なら、この道具で測れるものはありません。",
  );
  process.exitCode = 2;
}
