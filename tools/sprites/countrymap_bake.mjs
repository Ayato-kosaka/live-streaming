/**
 * **国の寄り地図の絵を、1枚の絵のファイルに焼く。**（#1262・#332）
 *
 *   cd tools/sprites && node countrymap_bake.mjs              # 古い・無い国だけ焼く
 *   FORCE=1 node countrymap_bake.mjs                          # 全部焼き直す
 *   SLUGS=bulgaria,uk node countrymap_bake.mjs                # 国を絞る
 *
 * 出すもの: `site/public/travel/<国>/<国名>の地図-<幅>.webp`（幅は `countryArt.ts` の `ART_WIDTHS`）と、
 * 焼いた絵の字の指紋の控え `site/content/atlas/mapArt.json`。面（`components/atlas/mapArt.ts`）は、
 * **いまの絵の字の指紋が控えと同じときだけ**焼いた絵を使う。
 *
 * ## いつ回すか
 *
 * 地図のデータ（`python/build_world_route.py` が焼く `site/content/atlas/c/*.json`）か、絵の組みかた
 * （`site/components/atlas/countryArt.ts`）を変えたとき。回し忘れると `countrymap_selftest.mjs` が赤くなる
 * （面は SVG を直に描くほうへ戻るので、見た目は壊れない。検索の点だけが落ちる）。
 *
 * ## なぜ Chrome で焼くか
 *
 * 面がいままで描いていたのと**同じ描き手**だから。ぼかし（`feGaussianBlur`）・膜（`mask`）・`<use>` を、
 * 面に直に描いたときと同じ画素にする。SVG を `<img>` に読ませて、焼く幅の canvas に描き、WebP にする。
 * 焼く前に SVG の `width` `height` を焼く幅に書き換える（小さく描いてから引き伸ばさない）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "playwright-core";

import { chromePath } from "./chrome.mjs";
import { BAKED, art, files, maps, names, readBaked, sha1 } from "./countryart.mjs";

/** WebP の質。0.86 で、地図の細かい点（森・砂丘・きらめき）が潰れずに 1200px で 100KB 前後 */
const Q = Number(process.env.Q || 0.86);
const only = (process.env.SLUGS || "").split(",").filter(Boolean);

const all = maps();
const nm = names();
const baked = readBaked();
const todo = Object.keys(all).filter((s) => (!only.length || only.includes(s)));
const missingName = todo.filter((s) => !nm[s]);
if (missingName.length) {
  console.error(`名前が引けない国: ${missingName.join(", ")}（content/countries.ts に slug と name が無い）`);
  process.exit(2);
}

const exe = chromePath();
if (!exe) {
  console.error("ブラウザが見つからない（tools/sprites/chrome.mjs）");
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
await page.setContent("<!doctype html><title>bake</title>");

let made = 0;
for (const slug of todo) {
  const name = nm[slug];
  const m = all[slug];
  const svg = art.countryArtSvg(m, slug);
  const hash = sha1(svg);
  const prev = baked[slug];
  if (!process.env.FORCE && prev && prev.hash === hash && prev.name === name) continue;
  const { w: vw, h: vh } = m.view;
  const sizes = {};
  for (const f of files(slug, name)) {
    const h = Math.round((f.w * vh) / vw);
    const sized = svg.replace(/^<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, `<svg$1 width="${f.w}" height="${h}"`);
    const b64 = await page.evaluate(
      async ({ sized, w, h, q }) => {
        const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const blob = await new Promise((r) => c.toBlob(r, "image/webp", q));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { sized, w: f.w, h, q: Q },
    );
    const bytes = Buffer.from(b64, "base64");
    if (bytes.subarray(8, 12).toString() !== "WEBP") throw new Error(`${slug}: WebP にならなかった`);
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, bytes);
    sizes[f.w] = bytes.length;
  }
  const big = art.ART_WIDTHS[art.ART_WIDTHS.length - 1];
  baked[slug] = { name, hash, w: big, h: Math.round((big * vh) / vw) };
  made += 1;
  console.log(`${slug}（${name}）: ${Object.entries(sizes).map(([w, n]) => `${w}px ${(n / 1024).toFixed(0)}KB`).join("・")}`);
}
await browser.close();

/* 控えは国の名前の順に（差分を読みやすく） */
const sorted = Object.fromEntries(Object.keys(baked).sort().map((k) => [k, baked[k]]));
writeFileSync(BAKED, JSON.stringify(sorted, null, 1) + "\n");
console.log(`焼いた ${made}国 / 面を持つ国 ${Object.keys(all).length}`);
