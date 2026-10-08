/**
 * **島に立っているあやとの絵と、コードが持っている寸法が合っているか。**
 *
 *     node site/selftest/ayatoart_selftest.mjs
 *     # 0=合っている / 1=ずれている / 2=数えるものが無い
 *
 * ## なぜ要るのか
 *
 * 2026-10-08 にあやとの絵を描き直したとき、縦横比が **0.856 → 0.691** へ
 * 変わった。そのとき島は `AYATO_H * 0.86`（＝ 273/319）を**2枚のファイルに
 * 別々に**持っていて、ステッカーの欄も `w: 273, h: 319` を持っていた。
 * **ファイルの寸法と、コードに書いた数が別々に置いてあった**ので、
 * 絵を入れ替えるだけだと、あやとは横に伸びたまま島を歩く。
 *
 * 数は `site/lib/ayatoArt.ts` 1本に寄せた。**寄せただけでは、次に絵を
 * 描き直した日に同じことが起きる**ので、ここで絵そのものを開いて突き合わせる。
 *
 * ## 見ているもの
 *
 *  1. **配っている webp の寸法**（ファイルの頭から読む）が `AYATO_W` /
 *     `AYATO_H_PX` と同じ
 *  2. `AYATO_ASPECT` が、その寸法から出した比と同じ
 *  3. **ステッカーの欄（`content/goods.ts` の `STICKERS[0]`）が、同じ1本から
 *     寸法を取っている**（数を写していない）。`art` / `file` も同じ絵を指す
 *  4. **島の2枚が、比を直に書いていない**
 *     （`AYATO_H * 0.86` のような小数が残っていない）し、`lib/ayatoArt.ts` を読んでいる
 *  5. **焼いた絵に、透明なふちが残っていない。** 焼くところ
 *     （`tools/characters/charbake.py`）が中身で切っているので、
 *     ファイルの比＝絵の中の人の比。ここが崩れると、比は合っているのに
 *     島のあやただけ小さく描かれる。**比は webp の頭からしか読めない**ので、
 *     ここは焼くところの対照（`--drill`）を子として起こして見る
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 1. 定数だけ古い比に戻す（入れ替え前の 273×319）
 * sed -e 's/AYATO_W = 442/AYATO_W = 273/' -e 's/AYATO_H_PX = 640/AYATO_H_PX = 319/' \
 *   site/lib/ayatoArt.ts > /tmp/broken-ayato.ts
 * AYATO_TS=/tmp/broken-ayato.ts node site/selftest/ayatoart_selftest.mjs   # → 1
 *
 * # 2. 絵だけ差し替える（定数はそのまま）
 * AYATO_WEBP=site/public/goods/ayato-walk.webp node site/selftest/ayatoart_selftest.mjs  # → 1
 *
 * # 3. ステッカーの欄に数を写し戻す
 * sed -e 's/w: AYATO_W,/w: 442,/' -e 's/h: AYATO_H_PX,/h: 640,/' \
 *   site/content/goods.ts > /tmp/broken-goods.ts
 * GOODS_TS=/tmp/broken-goods.ts node site/selftest/ayatoart_selftest.mjs   # → 1
 * ```
 *
 * 1 と 3 は**数が合っていても落ちる**ことが大事。寸法だけ見ていると、
 * 「写した数がたまたま合っている」あいだは通って、次の焼き直しで黙って壊れる。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const ART_TS = process.env.AYATO_TS || join(SITE, "lib", "ayatoArt.ts");
const GOODS_TS = process.env.GOODS_TS || join(SITE, "content", "goods.ts");
const WEBP = process.env.AYATO_WEBP || join(SITE, "public", "characters", "ayato.webp");
const BAKER = join(REPO, "tools", "characters", "charbake.py");
const STAGES = [
  join(SITE, "components", "isle", "IsleStage.tsx"),
  join(SITE, "components", "island", "IslandStage.tsx"),
];

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}
function give(code, why) {
  console.log(why);
  process.exit(code);
}

// ---- webp の頭から寸法を読む ----------------------------------------------
/**
 * RIFF/WebP の頭だけを読んで、画の大きさを返す。読めなければ null。
 *
 * **画素は1つも展開しない。** 展開できる道具（sharp / PIL）をこの見張りの
 * ために足すと、CI でそれが入っていない日に黙って外れる。頭の 30バイトで
 * 足りることしか見ないので、素のままで読む。
 *
 * 3つの形に対応する。`VP8X`（拡張。透過つきはこれ）・`VP8 `（非可逆）・
 * `VP8L`（可逆）。焼き方を変えた日に形が変わっても読めるように。
 */
export function webpSize(buf) {
  if (buf.length < 16) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WEBP") return null;
  let i = 12;
  while (i + 8 <= buf.length) {
    const tag = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const at = i + 8;
    if (at + Math.min(size, 10) > buf.length) return null;
    if (tag === "VP8X" && size >= 10) {
      return { w: buf.readUIntLE(at + 4, 3) + 1, h: buf.readUIntLE(at + 7, 3) + 1 };
    }
    if (tag === "VP8 " && size >= 10) {
      // キーフレームの印 0x9d 0x01 0x2a のあとに 14bit ずつ
      if (buf[at + 3] !== 0x9d || buf[at + 4] !== 0x01 || buf[at + 5] !== 0x2a) return null;
      return {
        w: buf.readUInt16LE(at + 6) & 0x3fff,
        h: buf.readUInt16LE(at + 8) & 0x3fff,
      };
    }
    if (tag === "VP8L" && size >= 5) {
      if (buf[at] !== 0x2f) return null;
      const b = buf.readUInt32LE(at + 1);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    i = at + size + (size & 1);
  }
  return null;
}

// ---- 対照。**本物を1つも見る前に回す** -------------------------------------
/* 読み手が壊れていたら、どんな絵でも「読めない」に落ちて、
   そのまま「ずれている」と言い出す。先に自分を測る。 */
{
  const bad = [];
  // (1) 3つの形を、こちらで組んだ頭から読めるか
  const riff = (chunks) => {
    const body = Buffer.concat([Buffer.from("WEBP", "ascii"), ...chunks]);
    const head = Buffer.alloc(8);
    head.write("RIFF", 0, "ascii");
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const chunk = (tag, payload) => {
    const h = Buffer.alloc(8);
    h.write(tag, 0, "ascii");
    h.writeUInt32LE(payload.length, 4);
    return Buffer.concat([h, payload, payload.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(442 - 1, 4, 3);
  vp8x.writeUIntLE(640 - 1, 7, 3);
  const lossy = Buffer.alloc(14);
  lossy[3] = 0x9d; lossy[4] = 0x01; lossy[5] = 0x2a;
  lossy.writeUInt16LE(123, 6);
  lossy.writeUInt16LE(456, 8);
  const lossless = Buffer.alloc(5);
  lossless[0] = 0x2f;
  lossless.writeUInt32LE((77 - 1) | ((88 - 1) << 14), 1);
  const want = [
    ["VP8X", riff([chunk("VP8X", vp8x), chunk("ALPH", Buffer.alloc(3)), chunk("VP8 ", lossy)]), 442, 640],
    ["VP8 ", riff([chunk("VP8 ", lossy)]), 123, 456],
    ["VP8L", riff([chunk("VP8L", lossless)]), 77, 88],
  ];
  for (const [tag, buf, w, h] of want) {
    const got = webpSize(buf);
    if (!got || got.w !== w || got.h !== h) bad.push(`${tag} を ${JSON.stringify(got)} と読んだ（${w}×${h} のはず）`);
  }
  // (2) webp でないものを「読めた」と言わないか
  if (webpSize(Buffer.from("not a webp file at all....", "ascii"))) bad.push("webp でないものを読めたと言った");
  if (webpSize(Buffer.alloc(4))) bad.push("短すぎるものを読めたと言った");
  // (3) 焼くところの対照（塵を落とす・中身で切る）。あちらが壊れていたら数えない
  const r = execFileSync("python3", [BAKER, "--drill"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!/通った/.test(r)) bad.push(`焼くところの対照が通らない: ${r.trim().slice(0, 300)}`);
  if (bad.length) give(2, `対照が外れた。本物は1つも見ていない\n  ${bad.join("\n  ")}`);
  console.log("# 対照5つ 通った（VP8X / VP8 / VP8L / webp でないもの2つ）＋ 焼くところの対照");
}

// ---- 1〜2. 絵と定数 --------------------------------------------------------
const buf = readFileSync(WEBP);
const size = webpSize(buf);
if (!size) give(2, `${relative(REPO, WEBP)} の寸法が読めなかった（webp ではない？）`);

/* `lib/ayatoArt.ts` と `content/goods.ts` を**そのまま組み立てて**読む。
   字を正規表現で拾うと、`w: 442` と `w: AYATO_W` の見分けが付かない。 */
const OUT = mkdtempSync(join(tmpdir(), "ayatoart-out-"));
const WORK = mkdtempSync(join(tmpdir(), "ayatoart-src-"));
copyFileSync(ART_TS, join(WORK, "ayatoArt.ts"));
// 別名（`@/lib/…`）は tsc が道に直してくれない
writeFileSync(join(WORK, "goods.ts"), readFileSync(GOODS_TS, "utf8").replace(/@\/lib\//g, "./"));
execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
  join(WORK, "goods.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], { stdio: "inherit" });
const req = createRequire(import.meta.url);
const art = req(join(OUT, "ayatoArt.js"));
const goods = req(join(OUT, "goods.js"));
console.log(`# 見た絵: ${relative(REPO, WEBP)}（${size.w}×${size.h} / ${(buf.length / 1024).toFixed(1)}KB）`);

check(
  `配っている絵の寸法と AYATO_W / AYATO_H_PX が同じ（${size.w}×${size.h}）`,
  art.AYATO_W === size.w && art.AYATO_H_PX === size.h,
  `コードは ${art.AYATO_W}×${art.AYATO_H_PX}`,
);
check(
  `AYATO_ASPECT が絵の比と同じ（${(size.w / size.h).toFixed(4)}）`,
  Math.abs(art.AYATO_ASPECT - size.w / size.h) < 1e-9,
  `コードは ${art.AYATO_ASPECT}`,
);
check("AYATO_SRC が、見た絵を指している", art.AYATO_SRC === "/characters/ayato.webp", art.AYATO_SRC);

// ---- 3. ステッカーの欄 -----------------------------------------------------
const isle = (goods.STICKERS ?? []).find((s) => s.id === "isle");
if (!isle) give(2, "goods.ts の STICKERS に id=isle が無い（ステッカーの1枚目が読めない）");
check(
  "ステッカー（島にいるあやと）の寸法が、絵と同じ",
  isle.w === size.w && isle.h === size.h,
  `goods.ts は ${isle.w}×${isle.h}`,
);
/* **数を写していないこと**も見る。写しても今日は合うが、次の焼き直しで黙って壊れる */
const goodsSrc = readFileSync(GOODS_TS, "utf8");
const sticker = goodsSrc.slice(goodsSrc.indexOf('id: "isle"'), goodsSrc.indexOf('id: "walk"'));
check(
  "ステッカーの寸法が、数の写しではなく lib/ayatoArt.ts から来ている",
  /w:\s*AYATO_W\b/.test(sticker) && /h:\s*AYATO_H_PX\b/.test(sticker),
  "goods.ts に数が直に書いてある（絵を焼き直した日に、ここだけ古くなる）",
);
check(
  "ステッカーが、島と同じ1枚を指している",
  isle.art === art.AYATO_SRC && isle.file === art.AYATO_SRC,
  `art=${isle.art} file=${isle.file}`,
);

// ---- 4. 島の2枚 ------------------------------------------------------------
for (const f of STAGES) {
  const src = readFileSync(f, "utf8");
  const name = relative(SITE, f);
  check(`${name} が lib/ayatoArt.ts を読んでいる`, /from "@\/lib\/ayatoArt"/.test(src));
  /* `AYATO_H * 0.86` のたぐい。**ここが残っていると、絵を替えても潰れたまま** */
  const hard = [...src.matchAll(/AYATO_H\s*\*\s*0?\.\d+/g)].map((m) => m[0]);
  check(`${name} が、比を直に書いていない`, hard.length === 0, hard.join(" / "));
  check(`${name} が、絵の道を直に書いていない`, !src.includes('"/characters/ayato.webp"'));
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
