/**
 * 旅の文言を、**書き出したものの実 DOM で**確かめる。
 *
 * 静的 HTML を grep しても分からないものが3つある。
 *   1. 住人のセリフは client が話しかけられてから描く（HTML に無い）
 *   2. 島の札は client が組む（`components/isle/spec.ts` は HTML に出ない）
 *   3. `/now` の「今週やること」は API が返れば上書きされる
 * だから、時計を進めたブラウザで実際に開いて、住人に話しかけて読む。
 *
 *   ISO=2026-09-20T12:00:00Z SPORT=4320 node tools/sprites/tripwords.mjs
 *   DOWN=1 …                        /island-api/state を落とした状態で開く
 *
 * `DOWN=1` のとき落とすのは `/island-api/state` **だけ**。
 * 全部横取りすると島に人が0人になって、住人のセリフが1行も読めない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4320";
const ISO = process.env.ISO || new Date().toISOString();
const DOWN = process.env.DOWN === "1";
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await offline(ctx);
await ctx.route(/fonts\.googleapis\.com/, (r) =>
  r.fulfill({ status: 200, contentType: "text/css", body: "" }),
);
if (DOWN) {
  /* **`state` だけ落とす。** 住人（`/island-api/characters`）まで落とすと
     島が0人になって、セリフの確認ができなくなる */
  await ctx.route(/\/island-api\/state/, (r) => r.abort("failed"));
}
await ctx.addInitScript(`(() => {
  const FAKE = ${Date.parse(ISO)};
  const R = Date; const t0 = R.now();
  const shift = () => FAKE + (R.now() - t0);
  class F extends R {
    constructor(...a) { if (!a.length) super(shift()); else super(...a); }
    static now() { return shift(); }
    static parse(...a) { return R.parse(...a); }
    static UTC(...a) { return R.UTC(...a); }
  }
  Object.defineProperty(F, "name", { value: "Date" });
  globalThis.Date = F;
})();`);

const p = await ctx.newPage();
const say = (s) => console.log(s);

async function talkAll(url, tag) {
  await p.goto(`http://localhost:${SPORT}${url}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const hits = await p.$$(".isle-who-hit");
  const out = new Set();
  // 1人につき2回押す（1回目が挨拶になることがある。2言目から旅の行が回る）
  for (let round = 0; round < 3; round++) {
    for (const h of hits) {
      try {
        await h.click({ force: true, timeout: 2000 });
      } catch {
        continue;
      }
      for (let i = 0; i < 24; i++) {
        const t = await p.$eval(".isle-talk p", (e) => e.textContent?.trim() ?? "").catch(() => "");
        if (t) {
          out.add(t);
          break;
        }
        await p.waitForTimeout(250);
      }
      await p.mouse.click(195, 60); // 吹き出しを閉じる
      await p.waitForTimeout(80);
    }
  }
  say(`\n--- ${tag} ${url}  住人 ${hits.length}人 / セリフ ${out.size}行 ---`);
  return [...out];
}

async function isleInfo(url) {
  await p.goto(`http://localhost:${SPORT}${url}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  return p.evaluate(() => {
    const rows = [...document.querySelectorAll(".isle-spot")].map((el) =>
      (el.textContent || "").replace(/\s+/g, " ").trim(),
    );
    return {
      signs: rows.filter(Boolean),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      /* **`<script>` の中を数えない。** Next は焼いた画面の中身を
         `self.__next_f.push(...)` として body に埋める。読む人には見えないのに
         テキストノードなので、素朴に数えると毎回1件出る（`noemoji.mjs` も
         script を落としてから数えている）。 */
      emoji: (() => {
        const RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2600}-\u{27BF}]/u;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const out = [];
        let n;
        while ((n = w.nextNode())) {
          const tag = n.parentElement?.tagName;
          if (tag === "SCRIPT" || tag === "STYLE") continue;
          if (RE.test(n.textContent)) out.push(n.textContent.trim().slice(0, 60));
        }
        return out;
      })(),
    };
  });
}

say(`\n===== ISO=${ISO}  DOWN=${DOWN ? "state を落とした" : "ふつう"} =====`);

// 1) /now の「今週やること」
await p.goto(`http://localhost:${SPORT}/now.html`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const now = await p.evaluate(() => {
  const sec = [...document.querySelectorAll(".pap-sec, .panel")].find((s) =>
    /今週/.test(s.querySelector("h2")?.textContent || ""),
  );
  return {
    head: sec?.querySelector("h2")?.textContent?.trim() ?? null,
    rows: [...(sec?.querySelectorAll("li") ?? [])].map((li) => li.textContent.trim()),
    place: document.querySelector(".now-place")?.textContent?.trim() ?? null,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
say(`/now  いまどこ=「${now.place}」  横あふれ=${now.overflow}px`);
say(`/now  ${now.head}`);
now.rows.forEach((r) => say(`   ・${r}${EMOJI.test(r) ? "  << 絵文字" : ""}`));

// 2) 表紙の島と章の島の札
for (const u of ["/index.html", "/island/nordic.html"]) {
  const info = await isleInfo(u);
  say(`\n${u}  横あふれ=${info.overflow}px  絵文字=${info.emoji.length}${info.emoji.length ? " " + JSON.stringify(info.emoji) : ""}`);
  info.signs.forEach((s) => say(`   [札] ${s}`));
}

// 3) 住人のセリフ
for (const [u, tag] of [["/index.html", "表紙"], ["/island/nordic.html", "章の島"]]) {
  const lines = await talkAll(u, tag);
  lines.sort();
  lines.forEach((l) => say(`   ${EMOJI.test(l) ? "[絵文字] " : ""}${l}`));
}

await b.close();
