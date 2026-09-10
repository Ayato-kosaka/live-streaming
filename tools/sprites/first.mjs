/**
 * 島に降りた1画面目を測る。
 *
 * はじめての人がスマホで降りたとき、その1画面に残っているのは
 * 看板ロゴと「今日の島」の板の2つだけ（`docs/island-play.md` 6章 0:06）。
 * **その2つが、住人の吹き出しと隅の道具に潰されていないか**を数で見る。
 *
 *   cd tools/sprites
 *   SPORT=4730 node first.mjs
 *
 *   SPORT  書き出したものを配っている静的サーバのポート
 *   DATES  進める日（ISO、カンマ区切り）。既定は出発前と出発後
 *   OUT    撮ったものの置き場
 *
 * 出すもの（面ごと・寄り引きごと・幅ごと）:
 *   logo/atlas  … 看板ロゴと「島の地図」の箱と、**重なっている画素数**
 *   today       … 「今日の島」の板の opacity と、**まん中を押したら誰が受けるか**
 *                 （`elementFromPoint`。見た目の箱だけで判定しない＝`CLAUDE.md`）
 *   talk        … 吹き出しの箱と、ロゴ・板との重なり
 *   signs       … 引きに出ている札の数と、**札から建物までのずれ**
 *
 * **見た目の箱で判定しない。** 重なりは矩形の共通部分を画素で出し、
 * 押しどころは `elementFromPoint` で「実際に誰が受けるか」を見る。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4730";
const OUT = process.env.OUT || "/tmp/first";
const BASE = `http://localhost:${SPORT}`;
const DATES = (process.env.DATES || "2026-09-10T12:00:00+09:00,2026-09-13T12:00:00+09:00").split(",");

/** 時計を止める（`timetravel.mjs` と同じもの）。焼き込みは動かないが、島の章は動く */
function clockScript(iso) {
  return `(() => {
    const FAKE = ${Date.parse(iso)};
    const RealDate = Date;
    const start = RealDate.now();
    function shift() { return FAKE + (RealDate.now() - start); }
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
      static now() { return shift(); }
      static parse(...a) { return RealDate.parse(...a); }
      static UTC(...a) { return RealDate.UTC(...a); }
    }
    Object.defineProperty(FakeDate, "name", { value: "Date" });
    globalThis.Date = FakeDate;
  })();`;
}

/** 画面の中で測る。島の実装が2つある（手で作った島 / 章の島）ので、両方の名前を見る */
const probe = () => {
  const R = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  /** 見えているか。**opacity だけで見ない。**
      手で作った島の札は `visibility` で出し入れしている（`app/css/island.css`）ので、
      opacity だけ見ると、寄りで隠している6枚を「出ている」と数えてしまう */
  const vis = (el) => {
    if (!el) return null;
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= +cs.opacity;
    }
    return +o.toFixed(3);
  };
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? Math.round(w * h) : 0;
  };
  /** その箱の中を格子状に突いて、いちばん上にいるのが自分（の中）かを見る */
  const owns = (el, step = 6) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let hit = 0;
    let all = 0;
    const blockers = new Set();
    for (let y = r.top + 3; y < r.bottom - 2; y += step) {
      for (let x = r.left + 3; x < r.right - 2; x += step) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        all++;
        const t = document.elementFromPoint(x, y);
        if (t && (el === t || el.contains(t))) hit++;
        else if (t) {
          const b = t.closest(".isle-talk, .talkbox, .hero-logo, .isle-atlas, .stage-atlas, .today, .isle-view, .stage-view");
          blockers.add(b ? (b.className.baseVal || b.className).split(" ")[0] : t.tagName.toLowerCase());
        }
      }
    }
    return { pts: all, own: hit, ratio: all ? +(hit / all).toFixed(3) : null, over: [...blockers] };
  };

  const q = (s) => document.querySelector(s);
  const logo = q(".hero-logo img:not([style*='display: none'])") ?? q(".hero-logo");
  const logoImg = [...document.querySelectorAll(".hero-logo img")].find(
    (i) => getComputedStyle(i).display !== "none",
  );
  const atlas = q(".isle-atlas") ?? q(".stage-atlas");
  const today = q(".today");
  const talk = q(".isle-talk") ?? q(".talkbox");
  const tab = q(".today-tab");

  const lb = R(logoImg ?? logo);
  const ab = R(atlas);
  const tb = R(today);
  const kb = R(talk);

  /* 引きの札。札の中心から、その建物の当たりの中心までのずれ */
  const signs = [...document.querySelectorAll(".isle-spot.is-sign, .spot.is-sign")]
    .map((sp) => {
      const mark = sp.querySelector(".isle-mark, .spot-mark");
      const hit = sp.querySelector(".isle-hit, .spot-hit");
      if (!mark || !hit) return null;
      const m = mark.getBoundingClientRect();
      const h = hit.getBoundingClientRect();
      const o = vis(mark);
      if (!m.width || !o) return null;
      return {
        name: (mark.textContent || "").trim().slice(0, 12),
        d: Math.round(Math.hypot(m.x + m.width / 2 - (h.x + h.width / 2), m.y + m.height / 2 - (h.y + h.height / 2))),
        mark: { x: +m.x.toFixed(0), y: +m.y.toFixed(0), w: +m.width.toFixed(0), h: +m.height.toFixed(0) },
        op: o,
      };
    })
    .filter(Boolean);

  return {
    logo: lb && { ...lb, op: vis(logoImg ?? logo), own: owns(logoImg ?? logo) },
    atlas: ab && { ...ab, op: vis(atlas), own: owns(atlas) },
    today: tb && { ...tb, op: vis(today), own: owns(tab ?? today), line: (q(".today-line b") || {}).textContent },
    talk: kb && { ...kb, text: (talk.textContent || "").trim().slice(0, 40) },
    ov: { logoAtlas: overlap(lb, ab), logoTalk: overlap(lb, kb), todayTalk: overlap(tb, kb) },
    signs,
    signCount: signs.length,
  };
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const rows = [];
for (const iso of DATES) {
  const day = iso.slice(0, 10);
  for (const [wname, vp] of [
    ["390", { width: 390, height: 844, isMobile: true, hasTouch: true }],
    ["pc", { width: 1280, height: 900, isMobile: false, hasTouch: false }],
  ]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2 });
    await offline(ctx);
    await ctx.addInitScript(clockScript(iso));
    await ctx.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await p.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(4500);

    const dir = `${OUT}/${day}-${wname}`;
    mkdirSync(dir, { recursive: true });

    for (const view of ["close", "wide"]) {
      if (view === "wide") {
        const v = await p.$(".isle-view, .stage-view");
        if (v) await v.click({ force: true });
        await p.waitForTimeout(1400);
      }
      // 喋る前
      const before = await p.evaluate(probe);
      await p.screenshot({ path: `${dir}/${view}-quiet.png` });
      rows.push({ day, w: wname, view, when: "quiet", ...before, errs: errs.length });

      /* 勝手に開く吹き出し（`callOut`）を待つ。到着から9秒。
         出なければ自分で話しかける。**押してから開くまで歩く**ので、
         1回押して 900ms で諦めると「出なかった」と読み違える */
      const wait = async (ms) => {
        for (let t = 0; t < ms; t += 400) {
          if (await p.evaluate(() => Boolean(document.querySelector(".isle-talk, .talkbox")))) return true;
          await p.waitForTimeout(400);
        }
        return false;
      };
      let talking = await wait(7000);
      if (!talking) {
        const ws = await p.$$(".isle-who-hit, .who-hit, .who-call");
        for (const w of ws.slice(0, 4)) {
          // 住人は歩くので、押そうとした相手が居なくなっていることがある
          await w.click({ force: true }).catch(() => {});
          talking = await wait(4000);
          if (talking) break;
        }
      }
      const after = await p.evaluate(probe);
      await p.screenshot({ path: `${dir}/${view}-talk.png` });
      rows.push({ day, w: wname, view, when: talking ? "talk" : "talk?", ...after, errs: errs.length });

      // 閉じてから次へ
      await p.mouse.click(vp.width / 2, vp.height - 120);
      await p.waitForTimeout(600);
    }
    await ctx.close();
  }
}
await b.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/first.json`, JSON.stringify(rows, null, 1));
for (const r of rows) {
  const f = (b) => (b ? `${b.x},${b.y} ${b.w}x${b.h}` : "—");
  console.log(
    `\n[${r.day} ${r.w} ${r.view} ${r.when}]`,
    `\n  ロゴ    ${f(r.logo)} op=${r.logo?.op} 自分のもの=${r.logo?.own?.ratio ?? "—"} ${r.logo?.own?.over?.join("/") || ""}`,
    `\n  今日の板 ${f(r.today)} op=${r.today?.op} 自分のもの=${r.today?.own?.ratio ?? "—"} ${r.today?.own?.over?.join("/") || ""}`,
    `\n  島の地図 ${f(r.atlas)} 自分のもの=${r.atlas?.own?.ratio ?? "—"}`,
    `\n  吹き出し ${f(r.talk)} ${r.talk?.text || ""}`,
    `\n  重なり  ロゴ×地図=${r.ov.logoAtlas}px2 ロゴ×吹=${r.ov.logoTalk}px2 板×吹=${r.ov.todayTalk}px2`,
    `\n  札 ${r.signCount}枚 ${r.signs.map((s) => `${s.name}:${s.d}px`).join(" ")}`,
    r.errs ? `\n  JSエラー ${r.errs}` : "",
  );
}
