/**
 * **本番とローカルで押しどころの数が違ったとき、どちらが嘘かを見る。**
 *
 *   node foldwhy.mjs            # 本番の / を開いて、島の押しどころ・エラー・止めた通信を出す
 *   SPORT=4240 LOCAL=1 node foldwhy.mjs
 *
 * `docs/island-standards.md` 13「当座の判定は、まずその判定を疑う」。
 * 差が出たら、まず**測る仕掛けが対象を変えていないか**を見る。curl 横取りは
 * 本番に無いものなので、止めた通信と JS のエラーを必ず並べて出す。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

const LOCAL = process.env.LOCAL === "1";
const SPORT = process.env.SPORT || "4240";
const PATH = process.env.PATH_ || "/";
const W = Number(process.env.W || 390);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
if (LOCAL) await offline(ctx); else await viaCurl(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();
const errs = [], dead = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
p.on("requestfailed", (r) => dead.push(r.url().slice(0, 110)));
await p.goto(LOCAL ? `http://localhost:${SPORT}/index.html` : `${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(Number(process.env.WAIT || 15000));
const r = await p.evaluate(() => {
  const n = (s) => document.querySelectorAll(s).length;
  return {
    島: n(".isle, [class^=isle-], [class*=' isle-']"),
    押しどころ: n(".isle-hit, .isle-who-hit"),
    住人: n("[class*=isle-who]"),
    a: n("a[href]"), button: n("button"), details: n("details"),
    本文の長さ: document.body.innerText.length,
    /* 島は動いている。`is-talking` のあいだは押しどころが全部 `pointer-events:none`
       になる（`chain.css`）。**同じ面を測っても、状態で数が変わる。** */
    島の状態: document.querySelector(".isle")?.className || "（島なし）",
    はじめの案内: !!document.querySelector("[class*=first], [class*=arrive]"),
    /* **数が合わないときは、除かれた理由まで見る。** 「0個」は
       「無い」ではなく「全部除いた」でも出る（`docs/island-misses.md` #79） */
    島の押しどころの素性: [...document.querySelectorAll(".isle-hit, .isle-who-hit")].slice(0, 4).map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return `${e.className.split(/\s+/)[0]} display=${cs.display} visibility=${cs.visibility} pointer-events=${cs.pointerEvents} opacity=${cs.opacity} aria-hidden=${!!e.closest('[aria-hidden="true"]')} inert=${!!e.closest("[inert]")} 箱=${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  };
});
console.log(LOCAL ? "ローカル" : "本番", JSON.stringify(r, null, 1));
console.log("JS のエラー:", errs.length ? errs.slice(0, 6) : "なし");
console.log("止まった通信:", dead.length ? dead.slice(0, 10) : "なし");
await b.close();
