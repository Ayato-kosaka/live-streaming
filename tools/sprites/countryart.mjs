/**
 * **国の寄り地図の絵（`site/components/atlas/countryArt.ts`）を、Node から面と同じ1本で読む。**（#1262・#332）
 *
 *   import { art, slugs, names, readBaked, BAKED, sha1 } from "./countryart.mjs";
 *
 * 焼く道具（`countrymap_bake.mjs`）と見張り（`countrymap_selftest.mjs`）が使う。
 *
 * ## TS をそのまま読む
 *
 * Node は 22.18 から TS の型を剥がして読める（この箱は 22、CI は 24）。ただし `import "./peak"` のような
 * **拡張子の無い道は読めない**（Next は読める）。面の側の書きかたを Node に合わせて崩さないよう、
 * ここで「無ければ `.ts` を足す」だけの道の解決を1つ挟む（`registerHooks`。Node 22.15 から）。
 * 読むのは `countryArt.ts` と、そこから読む `./peak` `./dots` だけ（JSX と `@/` の道は読まない）。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";

import { repoPath } from "./repo.mjs";
import { must, readArray } from "./tsread.mjs";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND" && /^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec)) {
        return next(`${spec}.ts`, ctx);
      }
      throw e;
    }
  },
});

/** 絵の組みかた（面と同じ1本） */
export const art = await import(repoPath("site/components/atlas/countryArt.ts"));

export const BAKED = repoPath("site/content/atlas/mapArt.json");
export const PUBLIC = repoPath("site/public");
export const sha1 = (s) => createHash("sha1").update(s).digest("hex");

/**
 * 国の面を持つ国の、日本語の名前。歩き終わった国（`COUNTRIES`）といま歩いている旅の国（`AHEAD_COUNTRIES`）。
 * 面の `CountryMap` に渡る名前と同じもの。**面の側で名前が合わなければ、焼いた絵は使われない**
 * （`mapArt.ts` が名前も突き合わせる）。焼き込みは字で読む口（`tsread.mjs`）から——読み落としたら 2 で止まる
 */
export function names() {
  const src = readFileSync(repoPath("site/content/countries.ts"), "utf8");
  const out = {};
  for (const list of ["COUNTRIES", "AHEAD_COUNTRIES"]) {
    for (const r of must(readArray(src, list, { keys: ["slug", "name"] }), `content/countries.ts の ${list}`)) out[r.slug] ??= r.name;
  }
  return out;
}

/**
 * 面を持つ国の地図（`python/build_world_route.py` が焼いた `site/content/atlas/c/<国>.json`）。{ slug: 地図のデータ }。
 * 国の表に在って、地図の JSON が在る国（行く前の案内だけの国・地図の無い国は焼かない）
 */
export function maps() {
  const out = {};
  for (const slug of Object.keys(names())) {
    const f = repoPath(`site/content/atlas/c/${slug}.json`);
    if (existsSync(f)) out[slug] = JSON.parse(readFileSync(f, "utf8"));
  }
  return out;
}

export function readBaked() {
  return existsSync(BAKED) ? JSON.parse(readFileSync(BAKED, "utf8")) : {};
}

/** 焼いた絵のファイル（`site/public` の下の道）。面の `src` と同じ式 */
export const files = (slug, name) => art.ART_WIDTHS.map((w) => ({ w, path: `${PUBLIC}${art.artSrc(slug, name, w)}` }));
