/**
 * **この箱のブラウザは `upload.wikimedia.org` に届かない**（CLAUDE.md）。
 * 届かないまま撮ると、写真の面が**壊れているのではなく飢えている**状態で写る——
 * 2026-09-16 に `storage.googleapis.com` で同じことをして、**直っているものを
 * 不具合として報告しかけた**（`tools/sprites/prod.mjs` の `blocked()` の注）。
 *
 * `prod.mjs` の `viaCurl(ctx)` は**全部の行き先**を引き受けて `PASS` に無いものを
 * 落とすので、手元の `http://127.0.0.1:4130` まで落ちる。こちらは
 * **Wikimedia だけ**を curl に回して、残りはブラウザにそのまま通す。
 *
 *   import { wikipix } from "./wikipix.mjs";
 *   const ctx = await b.newContext({ ... });
 *   await wikipix(ctx);          // これより先に route を足さない
 *
 * 返るのは「何本を curl で返したか」を数える口。撮ったあとに必ず見る——
 * **0本なら、通したつもりで通っていない。**
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * 落としたものの控え。**Wikimedia はこの箱を強く絞る**——53本を一度に取りに
 * 行くと、半分が 429 で返ってきた（実測 27/53）。1枚ずつ間をあけて取り、
 * **2回目からは取りに行かない。** 撮り直すたびに叩くと、絞りが強くなるだけ。
 */
const CACHE = process.env.WIKIPIX_CACHE || "/tmp/wikipix";

/** 次に叩いてよい時刻。**同じ瞬間に2本投げない** */
let gate = Promise.resolve();
const PACE = Number(process.env.WIKIPIX_PACE || 1100);

/** Wikimedia が求める名乗り。**付けないと 429 で弾かれる**（実測） */
const UA = "ayato-island-guide/1.0 (https://github.com/Ayato-kosaka/live-streaming)";

/** 既定の行き先。写真の本体はここから配られる */
const WIKI = /^https:\/\/upload\.wikimedia\.org\//;

export async function wikipix(ctx, re = WIKI) {
  const count = { ok: 0, ng: 0, cached: 0 };
  mkdirSync(CACHE, { recursive: true });
  await ctx.route(re, async (r) => {
    const u = r.request().url();
    const key = join(CACHE, createHash("sha1").update(u).digest("hex"));
    if (existsSync(key)) {
      count.cached++;
      return r.fulfill({ status: 200, contentType: guess(u), body: readFileSync(key) });
    }
    try {
      /* **1本ずつ、間をあけて。** 並べて投げると 429 が返る */
      const turn = gate.then(() => new Promise((ok) => setTimeout(ok, PACE)));
      gate = turn;
      await turn;
      /* `--compressed` を付けない。**画像は既に縮んでいて、付けると
         stdout の binary が壊れることがある。** `-sS` で進捗だけ落とす */
      const { stdout } = await run(
        "curl",
        ["-sS", "-L", "--max-time", "30", "-A", UA, "-w", "\\n%{http_code}", u],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
      const cut = stdout.lastIndexOf(0x0a);
      const code = Number(stdout.slice(cut + 1).toString());
      if (code !== 200) { count.ng++; return r.abort(); }
      const body = stdout.slice(0, cut);
      writeFileSync(key, body);
      count.ok++;
      return r.fulfill({ status: 200, contentType: guess(u), body });
    } catch {
      count.ng++;
      return r.abort();
    }
  });
  return count;
}

/** 道の終わりから見当をつける。Wikimedia のサムネは拡張子が素直に付いている */
function guess(u) {
  const e = (u.split("?")[0].split(".").pop() || "").toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" }[e] || "image/jpeg";
}

/**
 * 控えを先に満たす。**撮る前に1回**回しておくと、撮影中は1本も取りに行かない。
 *
 *   node tools/sprites/wikipix.mjs python/data/bulgaria/photos.json
 *
 * 落ちたものは名前を並べて、終了コード 1 で終わる（**黙って欠けさせない**）。
 */
export async function warm(urls) {
  mkdirSync(CACHE, { recursive: true });
  const ng = [];
  let got = 0, had = 0;
  for (const u of urls) {
    const key = join(CACHE, createHash("sha1").update(u).digest("hex"));
    if (existsSync(key)) { had++; continue; }
    try {
      const { stdout } = await run(
        "curl", ["-sS", "-L", "--max-time", "30", "-A", UA, "-w", "\\n%{http_code}", u],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
      const cut = stdout.lastIndexOf(0x0a);
      if (Number(stdout.slice(cut + 1).toString()) !== 200) { ng.push(u); }
      else { writeFileSync(key, stdout.slice(0, cut)); got++; }
    } catch { ng.push(u); }
    await new Promise((ok) => setTimeout(ok, PACE));
  }
  return { got, had, ng };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const d = JSON.parse(readFileSync(file, "utf8"));
  const urls = new Set();
  const take = (v) => { for (const k of ["img", "thumb", "big"]) if (v?.[k]) urls.add(v[k]); };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object" && (v.img || v.thumb)) take(v);
    else for (const x of Object.values(v || {})) take(x);
  }
  const { got, had, ng } = await warm([...urls]);
  console.log(`控え ${had} 本 / 落とした ${got} 本 / 落とせなかった ${ng.length} 本`);
  for (const u of ng.slice(0, 8)) console.log("  ×", u);
  process.exit(ng.length ? 1 : 0);
}
