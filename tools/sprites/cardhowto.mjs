/**
 * 「もらいかた」（`components/cards/HowToGet.tsx`）の余白を、5つの幅で測る。
 *
 *   PORT=4260 node tools/sprites/cardhowto.mjs
 *   PORT=4260 SHOTS=/tmp/howto node tools/sprites/cardhowto.mjs
 *
 * 0＝通った / 1＝合格に届かなかった / 2＝数えるものが無い。
 *
 * ## なぜ要るか
 *
 * あやと（2026-10-13）「もらい方の余白が変」。撮って測ったら3つ在った。
 *
 *  1. **紙の題（「もらいかた」）が、すぐ上の「あと◯日ぶんだす」に 10px
 *     乗っていた。** 題は紙の上ぶちより 32px 上へ出る意匠で、紙どうしが
 *     並ぶぶんには空きにちょうど収まるが、**直前が押しどころだと当たる**
 *  2. **「じぶんのことを見る ＞」の下だけ 38px 空いていた**（上は 18px）。
 *     48px の押しどころの中で字は真ん中にいるので、**箱で揃えると
 *     字では揃わない**
 *  3. 紙のいちばん下の行き先も同じ理由で、下だけ空いていた
 *
 * ## 測りかた
 *
 * **箱ではなく字で測る。** 押しどころの箱（48px）には、字の上下に 14px ずつ
 * 見えない余白が入っている。箱で測ると揃っているのに、読む人には
 * 揃って見えない。字の矩形は `Range` から取る。
 *
 * **中央寄せは、幅を変えて測る。** `getComputedStyle` は `margin-inline: auto`
 * を**解いたあとの px** で答えるので、1つの幅で測ると「数で押し込んだ
 * 中央寄せ」と見分けがつかない。5つの幅ぜんぶで左右が揃っていれば `auto`。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "4260";
const WIDTHS = (process.env.WIDTHS || "320,390,430,768,1280").split(",").map(Number);
const SHOTS = process.env.SHOTS || "";
/** 字から数えた上下の空きの、許せる差（px） */
const SKEW = 8;
/** 題と、すぐ上の押しどころのあいだに要る空き（px） */
const CLEAR = 8;

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const missing = [];
const bad = [];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 2,
    isMobile: W < 700,
    hasTouch: W < 700,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await apply(ctx, {});
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}/cards.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(700);

  const got = await p.evaluate(() => {
    const akg = document.querySelector(".akg");
    if (!akg) return null;
    const y = (b) => ({ t: Math.round(b.top), b: Math.round(b.bottom) });
    /** 字そのものの矩形。**箱ではなく字で測る** */
    const inkOf = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      r.detach?.();
      return b.height ? y(b) : y(el.getBoundingClientRect());
    };
    const out = { 題: null, 行き先: [], はみ出し: 0 };
    const h2 = akg.querySelector(":scope > h2");
    const prev = akg.previousElementSibling;
    if (h2 && prev) {
      const a = prev.getBoundingClientRect();
      const c = h2.getBoundingClientRect();
      out.題 = {
        前: prev.className,
        前が押せる: !!prev.closest("button,a") || prev.matches("button,a"),
        すきま: Math.round(c.top - a.bottom),
      };
    }
    for (const go of akg.querySelectorAll(".akg-go")) {
      const ink = inkOf(go);
      const box = go.getBoundingClientRect();
      /* 上下の相手。**押しどころの箱ではなく、隣の塊の字** */
      const up = go.previousElementSibling;
      const down = go.nextElementSibling;
      const 親 = go.parentElement;
      const 親箱 = 親.getBoundingClientRect();
      const cs = getComputedStyle(親);
      const 内左 = 親箱.left + parseFloat(cs.paddingLeft || "0");
      const 内右 = 親箱.right - parseFloat(cs.paddingRight || "0");
      /* 下の相手。**罫を引いている塊は、字ではなく罫までを測る**
         ——読む人に見えている切れ目はそこ。下に何も無ければ、紙
         （`.akg`）の**下ぶちまで**（紙の余白は、読む人には空きに見える）。 */
      const 紙 = go.closest(".akg");
      const 紙箱 = 紙.getBoundingClientRect();
      const 下まで = () => {
        if (!down) return 紙箱.bottom - ink.b;
        const 罫 = parseFloat(getComputedStyle(down).borderTopWidth || "0");
        const d = down.getBoundingClientRect();
        return (罫 > 0 ? d.top : inkOf(down).t) - ink.b;
      };
      out.行き先.push({
        字: go.textContent.trim().slice(0, 10),
        上: up ? Math.round(ink.t - inkOf(up).b) : null,
        下: Math.round(下まで()),
        左: Math.round(box.left - 内左),
        右: Math.round(内右 - box.right),
      });
    }
    /* 横あふれ */
    for (const el of akg.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > innerWidth + 1)) out.はみ出し++;
    }
    return out;
  });

  if (!got) {
    missing.push(`${W}px: もらいかた（.akg）が出ていない`);
    await ctx.close();
    continue;
  }
  console.log(`\n--- ${W}px ---`);
  console.log(` 題: ${JSON.stringify(got.題)}`);
  for (const g of got.行き先) console.log(` 行き先「${g.字}」: ${JSON.stringify(g)}`);
  if (got.はみ出し) bad.push(`${W}px: 横にあふれているものが ${got.はみ出し} 個`);

  if (!got.題) missing.push(`${W}px: 題（.akg > h2）が無い`);
  else if (got.題.前が押せる && got.題.すきま < CLEAR) {
    bad.push(
      `${W}px: 題が、すぐ上の押しどころと ${got.題.すきま}px しか離れていない` +
        `（${got.題.すきま < 0 ? "重なっている" : `${CLEAR}px 要る`}）`,
    );
  }
  if (!got.行き先.length) missing.push(`${W}px: 行き先（.akg-go）が1つも無い`);
  for (const g of got.行き先) {
    if (g.上 === null) continue;
    const 差 = Math.abs(g.上 - g.下);
    if (差 > SKEW) {
      bad.push(`${W}px:「${g.字}」の上下の空きが ${g.上}px / ${g.下}px（${差}px ちがう）`);
    }
  }
  /* 広い幅では真ん中へ寄る。**左右が揃っているか**（`margin-inline: auto`） */
  if (W >= 720) {
    for (const g of got.行き先) {
      if (g.字.startsWith("じぶん") && Math.abs(g.左 - g.右) > 2) {
        bad.push(`${W}px:「${g.字}」が真ん中に無い（左 ${g.左}px / 右 ${g.右}px）`);
      }
    }
  }
  if (SHOTS) {
    const el = p.locator(".akg");
    if (await el.count()) await el.screenshot({ path: join(SHOTS, `howto-${W}.png`) });
  }
  await ctx.close();
}

await b.close();

if (missing.length) {
  console.error(`\n見つからなかった: ${missing.join(" / ")}`);
  process.exit(2);
}
if (bad.length) {
  console.error(`\n届かなかった:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`\n${WIDTHS.join(" / ")}px: もらいかたの余白、ぜんぶ通りました。`);
