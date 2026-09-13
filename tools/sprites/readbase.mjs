/**
 * 「読めなかった」ときの顔を撮るための土台。
 *
 * `_ope.mjs` は**本番のバイト列**を開く。こちらは**いま書き出したもの**を開く
 * （直したものを確かめるため）。ログインの差し込み（`asme.mjs`）と
 * 住人の絵（`route.mjs`）はそのまま使う。
 *
 *   python3 -m http.server 4660 --directory site/.next-read &
 *   SPORT=4660 node tools/sprites/readshot.mjs
 *
 * 落とし方は3通り。**`abort` だけで判定しない**（`island-standards.md` 13）。
 *   - `abort` … 通信そのものが切れる
 *   - `503`   … 口は生きているが返事がエラー
 *   - `slow`  … 45秒返さない（細い電波でいちばん多いのはこれ）
 *
 * **名前に `_` を付けない。** `.gitignore` の `tools/sprites/_*` は
 * 使い捨ての測定スクリプトのための行で、ここに当たると git に入らない。
 * これは使い捨てではなく、**「読めなかった」を直すたびに使う土台**なので、
 * 入っていないとクローンしたところで確かめかたごと消える（1度そうなった）。
 * 使う側は `readshot.mjs`（#268）・`forkshot.mjs`（#272）・`lieshot.mjs`。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

export const ORIGIN = `http://127.0.0.1:${process.env.SPORT || 4660}`;
export const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** `asme.mjs` が置く人の uid。端末が覚えている答えも、この uid で持つ */
const UID = "fakeuid0001";

/** 本番と同じ形のセッション（`functions/src/remote.ts` の `shape`） */
const SESSION = {
  sessionId: "8f2b1c6a-4d3e-4a71-9b0c-5e7d2f9a1c34",
  at: null, view: null, scrollTo: null, say: "", showSay: true,
  seq: 0, updatedAt: Date.now(), pollMs: 2000,
};

export async function launch() {
  return chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
}

/**
 * @param memo 端末が覚えている「あやとか」の答え。
 *   `null` … 一度も読めたことのないまっさらな端末
 *   `true` / `false` … 前に口がそう返した端末
 */
export async function newCtx(b, { admin = true, mode = "ok", memo = null } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    isMobile: true,
  });
  await offline(ctx);
  await apply(ctx, { admin });
  if (memo !== null) {
    await ctx.addInitScript(
      ({ uid, admin }) => {
        try {
          localStorage.setItem("ayato-island-owner", JSON.stringify({ uid, admin }));
        } catch {}
      },
      { uid: UID, admin: memo },
    );
  }
  /* asme のあとに登録する＝こちらが先に当たる。用が無ければ fallback で asme へ */
  const box = { mode };
  await ctx.route(/\/island-api\//, async (r) => {
    const u = new URL(r.request().url());
    const path = u.pathname.replace("/island-api", "");
    if (box.mode === "abort") return r.abort("failed");
    if (box.mode === "503")
      return r.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
    if (box.mode === "slow") {
      await new Promise((s) => setTimeout(s, 45000));
      return r.abort("failed");
    }
    const json = (body, status = 200) =>
      r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    /* **本番と同じで、あやと以外には 403 を返す**（`functions/src/remote.ts`）。
       ここを 200 にすると、視聴者さんにコントローラーが丸ごと写る */
    if (path === "/remote/session" || path === "/remote") {
      if (!admin) return json({ error: "not allowed" }, 403);
      return json({ session: path === "/remote" ? { ...SESSION, seq: SESSION.seq + 1 } : SESSION });
    }
    return r.fallback();
  });
  ctx.__box = box;
  /* **1枚めくって捨てる。** `asme.mjs` の差し込みは IndexedDB に書くのに、
     書き終わる前に firebase/auth が読みにいくことがある。その1枚だけ
     「入っていない人」として写るので、数えるときの1件目がいつも落ちる。
     ここで空打ちして、DB が出来てから本番の1枚を撮る。 */
  const warm = await ctx.newPage();
  await warm.goto(`${ORIGIN}/index.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await warm.waitForTimeout(2500);
  await warm.close();
  return ctx;
}

/** 通信を戻す。**画面を開き直さずに読み直せるか**を見るために使う */
export function revive(ctx) {
  ctx.__box.mode = "ok";
}

export async function openPage(ctx, path, { wait = 8000 } = {}) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  p.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200));
  });
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(wait);
  p.__errs = errs;
  return p;
}

/** その面が何を出しているか。**絵だけでなく、数えて突き合わせる。** */
export const look = (p) =>
  p.evaluate(() => {
    const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim());
    return {
      見出し: txt("h2").slice(0, 4),
      骨: document.querySelectorAll(".wait").length,
      よみなおし: txt(".blank.is-off > b"),
      道具の札: document.querySelectorAll(".mp-tab").length,
      遠隔の押しどころ: document.querySelectorAll(".rm-key").length,
      机への入口: [...document.querySelectorAll("a[href='/me/desk']")].length,
      じぶんのものの数: txt(".mp-tab-n"),
      からっぽ: txt(".blank:not(.is-off) > b"),
      書く欄: document.querySelectorAll("textarea").length,
      書き出しの札: document.querySelectorAll(".dl-seed, .nlog-seed").length,
      高さ: Math.round(document.body.scrollHeight),
      横あふれ: document.body.scrollWidth > document.documentElement.clientWidth,
    };
  });
