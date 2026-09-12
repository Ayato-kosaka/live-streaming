/**
 * 開いたカードの「だれを入れますか」が、**何人になっても保存の帯と重ならないか**を測る。
 *
 *   PORT=4160 node pickfit.mjs          # 1・3・4・5・8・12人で測って撮る
 *   PORT=4160 REAL=1 node pickfit.mjs   # 本番の9月11日（4人＝札5つ）で測る
 *
 * ## なぜ要るか
 *
 * 候補は**絵に結びついた人しか出ない。** 口が `icon` を返していなかったあいだは
 * 3人までしか出ず、1段で収まっていた。**直して4人目が出た日に、2段目が
 * 「ほぞんする」の帯の下へ潜った**（2026-09-12。`/tmp/cardicon/zoom.png`）。
 * **直したことで出てくる壊れ方**なので、候補の数を変えて測らないと見つからない。
 *
 * ## 横あふれでは見つからない
 *
 * 潜っているのは**縦の重なり**なので、`scrollWidth > clientWidth` では出ない。
 * ここでは**札と、下にある押しどころの矩形どうしの交差面積**を出す。
 * 「重なっていないように見える」ではなく、**0 と書ける数**にする。
 *
 * ## 紙を送りながら測る
 *
 * 帯は紙の底に貼り付けてある（`position: sticky`）ので、**紙を送っている
 * 途中でしか重ならない。** 開いた直後だけ測ると 0件と出る。
 * 紙のいちばん上からいちばん下まで、120px ずつ送りながら**いちばん重なった
 * ところ**を採る。
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const PORT = process.env.PORT || "4160";
const OUT = process.env.OUT || "/tmp/pickfit";
mkdirSync(OUT, { recursive: true });

const PROD = "https://live-streaming-d3cac.web.app";
const ICONS = JSON.parse(readFileSync("/tmp/pickicons.json", "utf8"));
/** 本番の返事。写真の URL と大きさは**本番のものをそのまま使う。** */
const REALCARDS = JSON.parse(readFileSync("/tmp/cards-after.json", "utf8"));
const PHOTOS = readFileSync("/tmp/photos.json", "utf8");

/** n人ぶんの候補が出るカードを作る。写真は本番の1枚。 */
function cardsOf(n) {
  const base = REALCARDS.cards[0];
  return {
    cards: Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `${base.photoId}__UCtest${i}`,
      channelId: `UCtest${i}`,
      icon: ICONS[i % ICONS.length],
      name: null,
    })),
  };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const viaCurl = (r, type) => {
  const was = r.request().url();
  const url = was.startsWith("http://localhost") ?
    was.replace(/^https?:\/\/[^/]+/, PROD) : was;
  try {
    const body = execFileSync("curl",
      ["-sS", "--retry", "2", "--max-time", "40", url], { maxBuffer: 1 << 28 });
    r.fulfill({ status: 200, contentType: type, body,
      headers: { "access-control-allow-origin": "*" } });
  } catch {
    r.abort();
  }
};

/* **矩形そのままでは測れない。**
   `getBoundingClientRect` は、送って窓の外へ出た札の矩形も**そのまま返す。**
   紙の胴が `overflow: auto` で切っていても、矩形は切られない。
   そのままぶつけると、**見えていない札まで「帯と重なっている」と出る**
   （直したあとに 3,696px² と出て、絵を見たら何も重なっていなかった）。
   だから**まず窓で切ってから**ぶつける。切って何も残らない札は、
   そもそも画面に出ていない。 */
const OVERLAP = `(a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? Math.round(w * h) : 0;
}`;
/** a を b の窓で切る。何も残らなければ null（＝見えていない） */
const CLIP = `(a, b) => {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? {left, right, top, bottom} : null;
}`;

async function run(tag, body) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    reducedMotion: "reduce",
  });
  await ctx.route(/\/island-api\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/island-api\/cards$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body }));
  await ctx.route(/\/island-api\/nordic\/photos$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: PHOTOS }));
  await ctx.route(/\/island-api\/characters\/[^/]+\/(plain|scene)-\d+\./, (r) =>
    viaCurl(r, "image/webp"));
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) =>
    viaCurl(r, "image/jpeg"));

  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  /* **カードの付いている棚を開く。** ただの `.akd-tile` の1枚目は
     写真だけの日（9月12日）で、候補が0枚になる。1度それで「交差0」と
     出して、直っていないものが直って見えた。 */
  await p.locator(".akd-day", { hasText: "9月11日" })
    .locator(".akd-tile").first().click();
  await p.waitForTimeout(2500);

  /* 紙を上から下まで送りながら、いちばん重なったところを採る。
     送る先は紙そのもの（`.akd-sheet` が `overflow: auto`）。 */
  const r = await p.evaluate(async ([over, cut]) => {
    const hit = eval(over);
    const clip = eval(cut);
    const sheet = document.querySelector(".akd-sheet") ||
      document.querySelector(".akd-sheet-body");
    const box = document.querySelector(".akd-sheet-body") || sheet;
    const wait = () => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    const worst = [];
    /** 覆われた点の数。**矩形とは別の測り方で裏を取る**（`hitbox.mjs` と同じ手）。
        札の見えているところを 8px 刻みで突いて、いちばん上に何が居るかを見る。 */
    let covered = 0;
    /** 覆っていたのは何か。**数だけ出して「何かが乗っている」で終わらせない** */
    const by = {};
    const pts = [];
    let picks = 0;
    const stops = [];
    for (let y = 0; y <= box.scrollHeight; y += 120) stops.push(y);
    stops.push(box.scrollHeight);
    for (const y of stops) {
      box.scrollTop = y;
      await wait();
      const ps = [...document.querySelectorAll(".npick")];
      picks = ps.length;
      const foot = [
        [".nstudio-go", document.querySelector(".nstudio-go")],
        [".nstudio-tab", document.querySelector(".nstudio-tab")],
        [".nstudio-tip", document.querySelector(".nstudio-tip")],
        [".nstudio-save", document.querySelector(".nstudio-save")],
        /* 閉じるボタンも入れる。**前は紙の隅に絶対位置で置いてあった**ので、
           送ると札がその下を通っていた。同じ形の重なりなので一緒に数える。 */
        [".akd-close", document.querySelector(".akd-close")],
      ].filter(([, e]) => e);
      const covers = foot.map(([, e]) => e)
        .concat([document.querySelector(".akd-sheet-head")].filter((e) => e));
      const win = box.getBoundingClientRect();
      for (const [i, pk] of ps.entries()) {
        // **見えているぶんだけ。** 送って窓の外にいる札は、そこに無い
        const vis = clip(pk.getBoundingClientRect(), win);
        if (!vis) continue;
        for (const [name, e] of foot) {
          const a = hit(vis, e.getBoundingClientRect());
          if (a > 0) worst.push({ 札: i, 相手: name, 面積: a, 送り: y });
        }
        for (let x = vis.left + 4; x < vis.right; x += 8) {
          for (let v = vis.top + 4; v < vis.bottom; v += 8) {
            const top = document.elementFromPoint(x, v);
            /* **数えるのは「頭か足に覆われた」ときだけ。**
               札の角は丸いので、右下の角の外を突くと親（`.nstudio-pick`）が
               返る。あれは覆われているのではなく、そもそも札が無い場所。
               「何かが乗っている」で数えると、丸みのぶんが毎回8点出る。 */
            const on = top && covers.some((e) => e === top || e.contains(top));
            if (on && !pk.contains(top) && top !== pk) {
              covered++;
              const who = `${top.tagName}.${top.className || ""}`.slice(0, 40);
              if (pts.length < 8) {
                const b = pk.getBoundingClientRect();
                pts.push({x: Math.round(x), y: Math.round(v), 札: i, 送り: y,
                  札の上: Math.round(b.top), 札の下: Math.round(b.bottom),
                  窓の上: Math.round(win.top), 窓の下: Math.round(win.bottom)});
              }
              if (!by[who]) by[who] = 0;
              by[who]++;
            }
          }
        }
      }
    }
    box.scrollTop = 0;
    await wait();
    return {
      札: picks,
      覆われた点: covered,
      覆っていたもの: by,
      覆われた点の場所: pts,
      交差した組: worst.length,
      いちばん広い交差: worst.reduce((m, x) => Math.max(m, x.面積), 0),
      内訳: worst.slice(0, 6),
      紙の高さ: box.scrollHeight,
      紙の窓: box.clientHeight,
      横あふれ_body: document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      横あふれ_紙: box.scrollWidth > box.clientWidth + 1,
    };
  }, [OVERLAP, CLIP]);

  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  console.log(
    `${tag.padEnd(10)} 札${String(r.札).padStart(3)}  交差した組 ${r.交差した組}` +
    `  いちばん広い交差 ${r.いちばん広い交差}px²  覆われた点 ${r.覆われた点}` +
    `  紙 ${r.紙の高さ}px/窓 ${r.紙の窓}px` +
    `  横あふれ body=${r.横あふれ_body} 紙=${r.横あふれ_紙}`);
  if (r.内訳.length) console.log("   ", JSON.stringify(r.内訳));
  if (r.覆われた点) {
    console.log("    覆っていたもの:", JSON.stringify(r.覆っていたもの));
    console.log("    場所:", JSON.stringify(r.覆われた点の場所));
  }
  await ctx.close();
  return r;
}

let bad = 0;
if (process.env.REAL === "1") {
  const r = await run("本番9月11日", JSON.stringify(REALCARDS));
  if (r.交差した組 || r.覆われた点 || r.横あふれ_body) bad++;
} else {
  const ns = (process.env.NS || "1,3,4,5,8,12").split(",").map(Number);
  for (const n of ns) {
    const r = await run(`候補${String(n).padStart(2, "0")}人`,
      JSON.stringify(cardsOf(n)));
    if (r.交差した組 || r.覆われた点 || r.横あふれ_body || r.横あふれ_紙) bad++;
  }
}
await b.close();
console.log(bad === 0 ? "\n重なり0・あふれ0" : `\n${bad}通りでだめ`);
process.exit(bad === 0 ? 0 : 1);
