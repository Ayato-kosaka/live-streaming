/**
 * 豚の貯金箱の机（`/me/desk` の「貯金箱」）を撮って、数で読む。
 *
 *   tools/build.sh 3170
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   SPORT=4170 OUT=/tmp/fund node tools/sprites/fundshot.mjs
 *
 * **2026-09-24 に作り直した。** それまでは読むだけの「スパチャ」の控え
 * （`FundHistory.tsx`）しか撮っていなかった。いまは出費・目標・スパチャの
 * 3つの札があって、**どれも入れられる**（`FundDesk.tsx`）。
 *
 * ## 何を撮るか
 *
 * | 撮るもの | なぜ |
 * | --- | --- |
 * | 2つの札 | 開いて最初に出るのは**スパチャ・ドネ**（配信中に開くほう） |
 * | もう一度出す | **押す前に、配信に出るものがそのまま見えるか** |
 * | 出したあと | 押しどころが戻らないこと（**二度押しで二度出さない**） |
 * | 内訳 | **足し引きが「いま」に戻るか**（画面の数字を足して見る） |
 * | 内訳が出せない | ドネの写しが無い日に、**0 を作っていないか** |
 * | 打っている最中 | **押す前に「いま◯円 → ◯円」が出るか** |
 * | 消す前の一拍 | 額が動くものは2段（1回押すと「ほんとうに消す／やめる」） |
 * | 焼き直しが読めない | **0円と見分けが付くか**（`island-standards.md` 10章） |
 * | 落ちた | 「読みに行けなかった」の1枚（0件と別の顔） |
 * | 視聴者さん | 道具そのものが出ないこと・口を1度も引かないこと |
 * | PC 幅 | スマホ幅だけで出さない |
 * | **とどくまでの秒数** | 「たぶん1秒」を答えにしない。**測る** |
 * | **裏に回したら聞かない** | 叩いた回数で見る |
 *
 * 差し込みの額は**本番と同じ数**にしてある（`asme.mjs` の `fundBox`）。
 * 違う値を置くと、直っていないものが直って見える（`island-misses.md` 決めごと2）。
 *
 * 0＝見つからなかった / 1＝見つかった（横あふれ・絵文字・48px 割れ・JSエラー）
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const ORIGIN = `http://127.0.0.1:${process.env.SPORT || 4170}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/tmp/fund";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function ctxOf(opts = {}) {
  const wide = !!opts.wide;
  const ctx = await b.newContext({
    viewport: wide ? { width: 1000, height: 900 } : { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent: wide ?
      undefined :
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    hasTouch: !wide,
    isMobile: !wide,
  });
  await offline(ctx);
  await apply(ctx, { admin: true, ...opts });
  await ctx.addInitScript(() => {
    window.__fundFetches = 0;
    const f = window.fetch;
    window.fetch = (...a) => {
      if (String(a[0]).includes("/fund/")) window.__fundFetches++;
      return f(...a);
    };
  });
  // 机も貯金箱も、前に開いていた札を覚えている。**開きたい札から始める**
  const pane = opts.pane || "got";
  await ctx.addInitScript((p) => {
    try {
      localStorage.setItem("ayato-desk-tool", "fund");
      localStorage.setItem("ayato-fund-pane", p);
      localStorage.setItem(
        "ayato-island-owner",
        JSON.stringify({ uid: "fakeuid0001", admin: true }),
      );
    } catch {}
  }, pane);
  if (opts.down) {
    await ctx.route(/\/island-api\//, (r) => {
      const path = new URL(r.request().url()).pathname;
      if (/\/characters\/[^/]+\/(plain|scene)-\d+\.webp$/.test(path)) return r.fallback();
      return r.abort("connectionfailed");
    });
  }
  const warm = await ctx.newPage();
  await warm.goto(`${ORIGIN}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await warm.waitForTimeout(2500);
  await warm.close();
  return ctx;
}

const look = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    const doc = document.documentElement;
    /** 押しどころの、いちばん小さい高さ。48px を割ったら出す */
    const taps = [...document.querySelectorAll(".mp-tool-body button")]
      .map((e) => Math.round(e.getBoundingClientRect().height))
      .filter((h) => h > 0);
    return {
      札: txt(".fd-tab"),
      開いている札: txt(".fd-tab.is-on"),
      額: txt(".fd-total"),
      いまの目標: txt(".fd-goalnow, .fd-splith"),
      押す前: txt(".fd-peek"),
      月の見出し: txt(".fd-monthh").slice(0, 3),
      行: document.querySelectorAll(".fd-rows > li").length,
      もらった行: document.querySelectorAll(".fd-got > li").length,
      本文: document.querySelectorAll(".fd-gottext").length,
      ドネの行: document.querySelectorAll(".fd-got > li.is-doneru").length,
      見ている間隔: txt(".fd-live"),
      配信に出すもの: txt(".fd-replaybody"),
      もう一度: txt(".fd-again").slice(0, 2),
      時刻なし: txt(".fd-notime"),
      /* **内訳の足し引きが、画面の上で「いま」に戻るか。**
         合わない内訳は、無いほうがマシ（数字で見る。目で読まない）。 */
      内訳: (() => {
        const rows = [...document.querySelectorAll(".fd-splitrows > div")];
        if (rows.length === 0) return null;
        const n = (i) =>
          Number((rows[i]?.querySelector("dd")?.textContent ?? "")
            .replace(/[^\d-]/g, "").replace(/^-/, "-")) *
          ((rows[i]?.querySelector("dd")?.textContent ?? "").startsWith("−") ?
            -1 : 1);
        const [start, sc, dn, sp, sum] = [0, 1, 2, 3, 4].map(n);
        const head = Number(
          (document.querySelector(".fd-total b")?.textContent ?? "")
            .replace(/[^\d]/g, ""));
        return {
          start, sc, dn, sp, sum,
          足し引き: start + sc + dn + sp,
          頭の額: head,
          合う: start + sc + dn + sp === sum && sum === head,
        };
      })(),
      けす: document.querySelectorAll(".fd-x").length,
      からっぽ: txt(".blank:not(.is-off) > b"),
      よみなおし: txt(".blank.is-off > b"),
      骨: document.querySelectorAll(".wait").length,
      引いた回数: window.__fundFetches ?? 0,
      押しどころの最小: taps.length ? Math.min(...taps) : null,
      /* **題が縮んで読めなくなっていないか。** 「…」で切れた行を数える */
      切れた題: [...document.querySelectorAll(".fd-title")]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      送り: [...document.querySelectorAll(".mp-send")]
        .map((e) => `${e.textContent.trim()}${e.disabled ? "（押せない）" : ""}`),
      高さ: Math.round(document.body.scrollHeight),
      横あふれ: doc.scrollWidth - doc.clientWidth,
      絵文字: (document.body.innerText.match(/\p{Extended_Pictographic}/gu) || []).length,
    };
  });

let bad = 0;

async function shot(tag, opts = {}, after) {
  const ctx = await ctxOf(opts);
  const p = await ctx.newPage();
  /* **この箱から出られない宛先の証明書エラーは、本番には無い**
     （`ERR_CERT_AUTHORITY_INVALID`。proxy の CA）。混ぜると、測るために
     作った仕掛けが測る対象を変える（`island-standards.md` 13章）。
     **黙って落とさず、数えて別に出す。** */
  let boxErrs = 0;
  const outside = (t) => /ERR_CERT_|ERR_CONNECTION_|ERR_NAME_NOT_RESOLVED/.test(t);
  const errs = [];
  p.on("pageerror", (e) => {
    const t = String(e).slice(0, 200);
    if (outside(t)) boxErrs++;
    else errs.push(t);
  });
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 160);
    if (outside(t)) boxErrs++;
    else errs.push("console: " + t);
  });
  await p.goto(`${ORIGIN}/me/desk.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(16000);
  if (after) await after(p);
  const got = await look(p);
  console.log(tag.padEnd(18), JSON.stringify({...got, 箱の外: boxErrs}));
  if (errs.length) {
    bad++;
    console.log(" ".repeat(18), "JSエラー:", errs.join(" / "));
  }
  if (got.横あふれ > 0) {
    bad++;
    console.log(" ".repeat(18), `★横あふれ ${got.横あふれ}px`);
  }
  if (got.絵文字 > 0) {
    bad++;
    console.log(" ".repeat(18), `★絵文字 ${got.絵文字}文字`);
  }
  if (got.内訳 && !got.内訳.合う) {
    bad++;
    console.log(" ".repeat(18), `★内訳が合わない ${JSON.stringify(got.内訳)}`);
  }
  if (got.切れた題 > 0) {
    bad++;
    console.log(" ".repeat(18), `★題が ${got.切れた題}行 で切れている`);
  }
  if (got.押しどころの最小 !== null && got.押しどころの最小 < 48) {
    bad++;
    console.log(" ".repeat(18), `★押しどころ ${got.押しどころの最小}px`);
  }
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  await p.screenshot({ path: `${OUT}/${tag}-1画面.png` });
  await p.close();
  await ctx.close();
}

/** 欄を打つ。`.nph-post-row input` の並びで指す */
const type = async (p, i, v) => {
  const el = (await p.$$(".mp-tool-body .nph-post-row input"))[i];
  if (!el) throw new Error(`欄 ${i} が無い`);
  await el.fill(v);
};

await shot("1-スパチャドネ");
await shot("2-もう一度出す-押す前", {}, async (p) => {
  await p.click(".fd-got > li .fd-again");
  await p.waitForTimeout(400);
});
await shot("3-もう一度出す-出したあと", {}, async (p) => {
  await p.click(".fd-got > li .fd-again");
  await p.waitForTimeout(300);
  await p.click(".fd-replay .fd-x.is-yes");
  await p.waitForTimeout(1200);
});
await shot("4-来ていないぶんを足す", {}, async (p) => {
  await p.click(".fold > summary");
  await p.waitForTimeout(300);
  await type(p, 1, "1000");
  await p.waitForTimeout(400);
});
await shot("5-目標出費-内訳", { pane: "money" });
await shot("6-出費-打っている", { pane: "money" }, async (p) => {
  await type(p, 1, "宿代");
  await type(p, 2, "4000");
  await p.waitForTimeout(400);
});
await shot("7-出費-消す前", { pane: "money" }, async (p) => {
  await p.click(".fd-rows > li .fd-x");
  await p.waitForTimeout(400);
});
await shot("8-めざすものを変える", { pane: "money" }, async (p) => {
  await p.click(".fold > summary");
  await p.waitForTimeout(300);
  const el = (await p.$$(".mp-tool-body .fold .nph-post-row input"))[1];
  await el.fill("つぎのたび");
  const el2 = (await p.$$(".mp-tool-body .fold .nph-post-row input"))[2];
  await el2.fill("30000");
  await p.waitForTimeout(400);
});
/* **内訳が出せない回。** 0 を作っていないかを、ここで見る */
await shot("9-内訳が出せない", { pane: "money", fundnosplit: true });
await shot("10-1行もない", { pane: "money", fundnone: true });
await shot("11-額が読めない", { pane: "money", fundboxdown: true });
await shot("12-落ちた", { down: true });
await shot("13-視聴者", { admin: false });
await shot("14-PC幅", { wide: true });
await shot("15-PC幅-目標出費", { wide: true, pane: "money" });

/* ---------------- リアルタイムが何秒で出るか ----------------
   **「たぶん1秒」は答えにならない。** 差し込みに「N ミリ秒たったら1件
   届く」を仕込んで、**画面の上で新しい行が増えるまで**を測る。
   測っているのは口の遅れではなく、**この画面が聞きにいく間隔ぶんの遅れ**。 */
{
  const ctx = await ctxOf({ pane: "got", fundlive: 6000 });
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/me/desk.html`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await p.waitForTimeout(16000);
  const before = await p.evaluate(
    () => document.querySelectorAll(".fd-got > li").length);
  const t0 = Date.now();
  // 差し込みは「最初に聞かれてから 6秒後」に1件足す。**足された瞬間は
  // こちらからは見えない**ので、画面に出た時刻から引いて出す
  const came = await p
    .waitForFunction(
      (n) => document.querySelectorAll(".fd-got > li").length > n,
      before,
      { timeout: 60000 },
    )
    .then(() => Date.now() - t0)
    .catch(() => -1);
  const live = await p.evaluate(() => ({
    間隔: document.querySelector(".fd-live")?.textContent ?? "",
    いちばん上: document.querySelector(".fd-got > li .fd-gotwho")?.textContent ?? "",
  }));
  await p.screenshot({ path: `${OUT}/16-とどいた.png`, fullPage: true });
  console.log(
    "16-とどいた".padEnd(18),
    JSON.stringify({ ...live, 待った秒: came < 0 ? "こなかった" : came / 1000 }),
  );
  if (came < 0) {
    bad++;
    console.log(" ".repeat(18), "★リアルタイムで届かなかった");
  }
  await p.close();
  await ctx.close();
}

/* ---------------- 裏に回したら聞かない ----------------
   **見えていないあいだに聞き続けていないか。** 数えるのは口を叩いた回数。 */
{
  const ctx = await ctxOf({ pane: "got" });
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/me/desk.html`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await p.waitForTimeout(16000);
  const a0 = await p.evaluate(() => window.__fundFetches ?? 0);
  // 裏に回す（`visibilityState` を差し替えて、合図を投げる）
  await p.evaluate(() => {
    Object.defineProperty(document, "visibilityState",
      { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(12000);
  const a1 = await p.evaluate(() => window.__fundFetches ?? 0);
  await p.evaluate(() => {
    Object.defineProperty(document, "visibilityState",
      { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(2500);
  const a2 = await p.evaluate(() => window.__fundFetches ?? 0);
  console.log(
    "17-裏に回した".padEnd(18),
    JSON.stringify({ 裏で叩いた回数: a1 - a0, 戻ってすぐ叩いたか: a2 - a1 > 0 }),
  );
  if (a1 - a0 > 0) {
    bad++;
    console.log(" ".repeat(18), `★裏に回しても ${a1 - a0}回 叩いている`);
  }
  if (a2 - a1 === 0) {
    bad++;
    console.log(" ".repeat(18), "★戻ってきたのに、その場で聞き直していない");
  }
  await p.close();
  await ctx.close();
}

await b.close();
console.log(bad === 0 ? "\n見つかったもの 0件" : `\n見つかったもの ${bad}件`);
process.exit(bad ? 1 : 0);
