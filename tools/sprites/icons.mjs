/**
 * 島のしるし（`site/app/icon.svg`）から、タブとホーム画面のアイコンを焼く。
 *
 * **手で作らない。** 2026-09-09 にあやとから「favicon 壊れてる」と言われて
 * 見たら、`site/app/apple-icon.png` が **180×180 の白い四角の左上に 32px の島**
 * だった。SVG を大きさを合わせずに書き出したまま置いてあった。
 * `assets/images/favicon.png` のほうは、**そもそも白黒のプレースホルダ**で、
 * 島ですらなかった。
 *
 * 3つとも同じ SVG から焼けば、しるしを描き直したときに揃って変わる。
 *
 *   node tools/sprites/icons.mjs
 *
 * ## 出す先が2つあるのは、面が2種類あるから
 *
 * - `site/app/apple-icon.png` … あやと島（Next.js）の面がホーム画面に置かれたとき
 * - `assets/images/favicon.png` … Expo の web ビルドが `/favicon.ico` にするもの。
 *   `/alertbox` と `/credits` がこれを見ていて、**ブラウザが既定で取りにいく
 *   `/favicon.ico` もこれ。** SVG のファビコンを読めないブラウザはここに落ちる
 *
 * ## ホーム画面のほうは、透けさせない
 *
 * iOS は透明なところを黒で塗る。四隅が黒くなると額縁のように見えるので、
 * **海の色で塗りつぶしてから**書き出す。タブのほうは小さくて角も丸まらないので
 * 透明のままでよい。
 */

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SVG = fs.readFileSync(path.join(ROOT, "site/app/icon.svg"), "utf8");

/** ホーム画面のアイコンの地。しるしの海と同じ色にする。 */
const SEA = "#0b62c4";

const OUT = [
  { file: "site/app/apple-icon.png", size: 180, bg: SEA },
  { file: "assets/images/favicon.png", size: 48, bg: null },
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const { file, size, bg } of OUT) {
  const p = await b.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  /* **`width`/`height` を viewport にそろえる。** ここを書かないと SVG が
     自分の 32px のまま描かれて、余りが地のまま残る（それが壊れていた形）。 */
  await p.setContent(
    `<style>html,body{margin:0;padding:0;` +
      `background:${bg ?? "transparent"}}` +
      `svg{display:block;width:${size}px;height:${size}px}</style>${SVG}`,
  );
  await p.screenshot({
    path: path.join(ROOT, file),
    omitBackground: !bg,
  });
  await p.close();
  console.log(`${file} ${size}x${size}${bg ? ` 地=${bg}` : " 透過"}`);
}
await b.close();
