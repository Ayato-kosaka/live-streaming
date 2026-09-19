/**
 * ブラウザの在りかを**版で決め打ちせずに**見つける。
 *
 *   import { chromePath } from "./chrome.mjs";
 *   const exe = chromePath();       // 見つからなければ null
 *
 * ## なぜ要るか（2026-09-19）
 *
 * 道具は **213本**で
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を**直に名指し**している。
 * この箱ではそれで合っているし、`CLAUDE.md` も版を 1.56.0 で止めてある
 * （「上げると各スクリプトの `executablePath` が外れる」）。
 *
 * 困るのは、**CI の中で誰も見ていないときに外れる**場合。
 * `cardgo.mjs` は配りの後ろ（`firebase-hosting-deploy-prod.yml`）で走るように
 * なったが、あそこはその場で `playwright-core` に**ブラウザを落とさせて**いる。
 * 落ちてくる先は `chromium-<playwright の build 番号>` で、**版を上げた日に
 * 番号が変わる。** 番号が変われば:
 *
 *   - 手前の歯止め（`[ -x …/chromium-1194/… ]`）が永遠に偽になって、
 *     **毎回「警告」で抜けたまま、緑に見えて1行も数えない**
 *   - 歯止めだけを glob に直すと、今度は道具のほうが古い番号を掴んで
 *     **起動に失敗し、本番は無事なのに赤くなる**（偽の赤）
 *
 * どちらも「繋いだつもりで繋がっていない」の顔をしている。だから
 * **在りかを1か所で決める。** 番号は誰も書かない。
 *
 * ## 探す順番
 *
 *   1. `CHROME=` … 手で渡された道。**渡されたのに無ければ null**（黙って
 *      別のものに落ちない。渡した人は、その1本を測りたい）
 *   2. `PLAYWRIGHT_BROWSERS_PATH` … `playwright-core` に落とさせたときの置き場
 *   3. `/opt/pw-browsers` … この箱と、CI で使っている置き場
 *   4. `~/.cache/ms-playwright` … `playwright-core` の既定
 *
 * 置き場の中は `chromium-<数字>` を全部見て、**番号のいちばん大きいもの**を採る。
 * `chromium_headless_shell-1194` は別物なので採らない（`_` で始まるので、
 * `chromium-` では当たらない）。
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 置き場を探す順番。**空の環境変数は無視する**（`FOO=` を渡されただけで探し先が消える） */
function roots() {
  const out = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) out.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  out.push("/opt/pw-browsers");
  out.push(join(homedir(), ".cache", "ms-playwright"));
  return out;
}

/**
 * その置き場に在る chromium のうち、**番号のいちばん大きいもの**の実行ファイル。
 * @returns {string|null}
 */
function inRoot(root) {
  let best = null;
  let n = -1;
  let dirs;
  try {
    dirs = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dirs) {
    const m = /^chromium-(\d+)$/.exec(d.name);
    if (!m) continue;
    const exe = join(root, d.name, "chrome-linux", "chrome");
    if (!existsSync(exe)) continue;
    if (Number(m[1]) > n) {
      n = Number(m[1]);
      best = exe;
    }
  }
  return best;
}

/**
 * ブラウザの実行ファイル。**見つからなければ `null`。**
 *
 * 投げずに `null` を返すのは、呼ぶ側に**「測れていない（2）」と
 * 「見つけた（1）」を区別させる**ため。例外にすると、ブラウザが無いだけの回が
 * 本番の不具合と同じ顔で赤くなる。
 */
export function chromePath() {
  if (process.env.CHROME) return existsSync(process.env.CHROME) ? process.env.CHROME : null;
  for (const r of roots()) {
    const hit = inRoot(r);
    if (hit) return hit;
  }
  return null;
}

/** 探した先。見つからなかったときに、どこを見たかを言うため。 */
export function chromeLookedIn() {
  return process.env.CHROME ? [process.env.CHROME] : roots();
}
