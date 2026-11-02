/**
 * スマホ（Android の PRISM）と同じ字体で撮るための部品。アラートを撮る道具が `--phone-font` で使う。
 *
 *   import { phoneFont } from "./phonefont.mjs";
 *   const ctx = await browser.newContext({ ... });
 *   await phoneFont(ctx);          // ページを開く前に
 *
 * ## なぜ要るか（2026-11-02、#1078）
 *
 * 豚と貯金箱の字は react-native-web の既定の字体（`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …,
 * sans-serif`）で描かれる。スマホでは数字と英字が Roboto、日本語が Noto Sans CJK（ゴシック）になる。
 * この箱には Roboto も Noto の日本語も無く、日本語は IPA ゴシックの太字もどきで出る。字を入れた
 * 静止画で「綺麗に見えるか」を見るのに、スマホと違う字で撮っては比べられない。
 *
 * ## 何をするか
 *
 * - npm の `@fontsource-variable/roboto` と `@fontsource-variable/noto-sans-jp`（どちらも OFL）を
 *   `~/.cache/phonefont/` に落とす（初めの1回だけ。registry.npmjs.org はこの箱から届く）
 * - ページに `@font-face { font-family: Roboto }` を足す。**日本語の範囲は Noto Sans JP、英数字は Roboto**
 *   （同じ名前で unicode-range を分ける。あとに書いたほうが重なる字で勝つので、Roboto を後に書く）。
 *   既定の字体の並びの Roboto がこれに当たるので、スマホと同じく「英数字は Roboto、日本語は Noto」で描かれる
 * - 字体のファイルは route で返す（ページの生い立ちに依らない）
 *
 * **git に字体のファイルは入れない**（合わせて 7MB 余り。落とし直せる）。
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DIR = join(homedir(), ".cache", "phonefont");
const PKGS = {
  roboto: "@fontsource-variable/roboto@5.3.0",
  jp: "@fontsource-variable/noto-sans-jp@5.3.1",
};

/** 字体の包みを落として広げる（済んでいれば何もしない）。広げた先を返す */
function ensure(key) {
  const dst = join(DIR, key);
  if (existsSync(join(dst, "package", "index.css"))) return join(dst, "package");
  mkdirSync(dst, { recursive: true });
  const tgz = execFileSync("npm", ["pack", PKGS[key], "--silent"], { cwd: dst, encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["xzf", tgz], { cwd: dst });
  return join(dst, "package");
}

/**
 * fontsource の css から `@font-face` を1つずつ取り出し、family を Roboto に替えて、ファイルの場所を
 * route の先に書き換える。`keep` に当たる注釈（`roboto-latin-wght-normal` など）のものだけ残す
 */
function faces(css, key, keep) {
  const out = [];
  const re = /\/\* ([^*]+) \*\/\s*@font-face\s*\{[^}]*\}/g;
  for (const m of css.matchAll(re)) {
    if (!keep.test(m[1])) continue;
    out.push(
      m[0]
        .replace(/font-family:\s*'[^']+'/, "font-family: 'Roboto'")
        .replace(/url\(\.\/files\/([^)]+)\)/g, (_, f) => `url(/__phonefont/${key}/${f})`)
    );
  }
  return out;
}

/**
 * context（か page）に、スマホと同じ字体を入れる。**ページを開く前に呼ぶ。**
 * @returns {Promise<string>} 何を入れたかの1行（撮った条件に添える）
 */
export async function phoneFont(target) {
  const roots = { roboto: ensure("roboto"), jp: ensure("jp") };
  const jp = faces(readFileSync(join(roots.jp, "index.css"), "utf8"), "jp", /wght-normal/);
  // Roboto は英数字（latin と latin-ext）だけ。あとに書くので、重なる字（数字・英字・記号）は Roboto が勝つ
  const rb = faces(readFileSync(join(roots.roboto, "wght.css"), "utf8"), "roboto", /^roboto-latin(-ext)?-wght-normal$/);
  if (!jp.length || rb.length !== 2) throw new Error(`字体の css が読めない（日本語 ${jp.length}・英数字 ${rb.length}）`);
  const css = [...jp, ...rb].join("\n");
  await target.route("**/__phonefont/**", (r) => {
    const m = r.request().url().match(/__phonefont\/(roboto|jp)\/([^?#/]+)/);
    const f = m && join(roots[m[1]], "files", m[2]);
    if (!f || !existsSync(f)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ status: 200, contentType: "font/woff2", body: readFileSync(f) });
  });
  await target.addInitScript((text) => {
    const put = () => {
      const s = document.createElement("style");
      s.setAttribute("data-phonefont", "");
      s.textContent = text;
      document.head.appendChild(s);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put, { once: true });
  }, css);
  return `字体: スマホと同じ（英数字 Roboto・日本語 Noto Sans JP。日本語は ${jp.length} 個に分かれていて、使う字のぶんだけ読む）`;
}

/** 字体が読み終わるのを待つ（撮る前に） */
export async function phoneFontReady(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
}
