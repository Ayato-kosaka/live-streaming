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

/** 面を持つ国の地図（`countryMaps.ts` が束ねている JSON）。{ slug: 地図のデータ } */
export function maps() {
  const src = readFileSync(repoPath("site/components/atlas/countryMaps.ts"), "utf8");
  const out = {};
  for (const [, file] of src.matchAll(/from "@\/content\/atlas\/c\/([\w-]+)\.json"/g)) {
    out[file] = JSON.parse(readFileSync(repoPath(`site/content/atlas/c/${file}.json`), "utf8"));
  }
  return out;
}

/**
 * 国の日本語の名前（`content/countries.ts` の `slug: "…", name: "…"`）。面の `CountryMap` に渡る名前と同じもの。
 * **面の側で名前が合わなければ、焼いた絵は使われない**（`mapArt.ts` が名前も突き合わせる）
 */
export function names() {
  const src = readFileSync(repoPath("site/content/countries.ts"), "utf8");
  const out = {};
  for (const [, slug, name] of src.matchAll(/slug:\s*"([\w-]+)",\s*name:\s*"([^"]+)"/g)) {
    out[slug] ??= name;
  }
  return out;
}

export function readBaked() {
  return existsSync(BAKED) ? JSON.parse(readFileSync(BAKED, "utf8")) : {};
}

/** 焼いた絵のファイル（`site/public` の下の道）。面の `src` と同じ式 */
export const files = (slug, name) => art.ART_WIDTHS.map((w) => ({ w, path: `${PUBLIC}${art.artSrc(slug, name, w)}` }));
