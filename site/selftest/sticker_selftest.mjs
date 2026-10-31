/**
 * **あやとステッカーの名簿（`content/goods.ts` の `STICKERS`）と、
 * 置いてある絵が合っているか。**
 *
 *     node site/selftest/sticker_selftest.mjs
 *     # 0=合っている / 1=食い違っている / 2=数えるものが無い
 *
 * ## なぜ要るのか
 *
 * 2026-10-10 に3枚が8枚になった。1枚足すときに書くものが4つある——
 * 面に並べる絵（`art`）・落とす絵（`file`）・落ちてくる名前（`saveAs`）・
 * 場所を先に取る寸法（`w`/`h`）。**どれも、間違っていても型は通る。**
 *
 * 間違えると出るのはこう:
 *
 * | 外したもの | 画面で起きること |
 * | --- | --- |
 * | `art` の道 | **マスが空で並ぶ**（落ちた絵は alt も出ない。`alt=""`） |
 * | `w`/`h` | 絵が届いた瞬間に**升目ぜんぶが飛ぶ**（`island-standards.md` 7章） |
 * | 透過のし忘れ | 白い四角のまま配る。**白の無いところへ貼ると出る**（3枚目で一度やった） |
 * | `saveAs` のかぶり | 2枚落とすと**片方が上書きされる** |
 * | 市松の消し忘れ | **透明をあらわす灰色の格子**が、絵として配られる（2026-10-11、4枚目） |
 * | 写り込みの消し忘れ | 画面を撮ったときの**共有ボタン**が、絵として配られる |
 *
 * ## 見ているもの
 *
 *  1. `art` と `file` が**実在する**（`site/public` の下）
 *  2. `art` の**実寸**（webp の頭から読む）が `w`/`h` と同じ
 *  3. **透過であるべき絵が透過**。`sign-color` 以外は、`art` も `file` も
 *     **四隅が alpha 0**。あの1枚だけは青い四角ごとが絵なので、四隅は抜けない
 *  4. `id` と `saveAs` が**かぶっていない**。`saveAs` の拡張子が `file` と同じ
 *  5. 抜く道具（`tools/goods/stickercut.py`）の**対照が通っている**。
 *     あちらが壊れていたら、ここの数字は読まない
 *  6. **SUZURI のデザインの番号（`suzuri`）が、1枚ずつ決まっている**。
 *     書き忘れ（`undefined`）は型でも止まるが、**番号のかぶりは型を通る**——
 *     貼り間違えると、2枚の絵が同じグッズの面へ送る。`null` は
 *     「まだグッズになっていない」で、画面には「グッズを買う」が出ない
 *  7. **市松（透明をあらわす格子）が、焼いた絵に1画素も残っていない**。
 *     あわせて、**写り込んだ丸いボタン**も残っていない（`--audit`）。
 *     「目で見て気づく」に任せない——`plane.jpg` の格子は 34,842画素あって、
 *     抜き忘れても**絵としては成立して見える**
 *  8. **升目に出す小さい写し（`stickerThumb`）が、1枚ずつ在って実寸が合う**。
 *     焼くのは `tools/goods/stickerthumb.py`。**名簿に1枚足して焼き忘れると、
 *     升目のマスが空で並ぶ**（`art` と同じで、落ちた絵は alt も出ない）。
 *     寸法がずれると、絵が届いた瞬間に升目ぜんぶが飛ぶ。
 *     面の式（`content/goods.ts`）と焼く側の式が**別々に腐る**ので、
 *     ここは**焼いた絵の実寸**と面の式を突き合わせる
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 写しの置き場（本物の public は触らない）
 * mkdir -p /tmp/brk/pub && cp -r site/public/goods site/public/characters /tmp/brk/pub/
 *
 * # 1. 寸法だけ嘘にする → 「cooking: 999×475 — 絵は 480×475」
 * sed 's/    w: 480,$/    w: 999,/' site/content/goods.ts > /tmp/brk/size.ts
 * STK_GOODS_TS=/tmp/brk/size.ts node site/selftest/sticker_selftest.mjs   # → 1
 *
 * # 2. saveAs をかぶらせる → 「saveAs がかぶっていない — ayato-cooking.png」
 * sed 's/ayato-georgia.png/ayato-cooking.png/' site/content/goods.ts > /tmp/brk/dup.ts
 * STK_GOODS_TS=/tmp/brk/dup.ts node site/selftest/sticker_selftest.mjs    # → 1
 *
 * # 3. 1枚 焼き忘れる → 「stockholm: art … 絵が無い」ほか2件
 * rm /tmp/brk/pub/goods/stockholm.webp
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs         # → 1
 *
 * # 4. 透過を忘れた絵にすり替える → 「art の四隅が抜けている — alpha 255,255,255,255」
 * python3 -c "from PIL import Image
 * for e in ('png','webp'):
 *     Image.open('site/public/goods/cooking.'+e).convert('RGB').save('/tmp/brk/pub/goods/cooking.'+e)"
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs         # → 1
 *
 * # 5. 看板のカラーまで丸く切ってしまう → 「四隅も絵のまま … 四隅が抜けている」
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs         # → 1
 *
 * # 6. 市松を落とさずに焼く → 「plane.png … 市松が 34,842画素」
 * BREAK=nocheck+nowash+noblob STK_OUT=/tmp/brk/pub/goods python3 - <<'PY'
 * import importlib.util
 * s = importlib.util.spec_from_file_location("sc", "tools/goods/stickercut.py")
 * m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
 * m.bake([x for x in m.SPECS if x.id == "plane"][0])
 * PY
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs         # → 1
 *
 * # 7. 写り込んだボタンを消さずに焼く → 「sign.png … 写り込んだ丸が 13,224画素」
 * #    （上と同じ形で BREAK=noshare、id は sign）
 *
 * # 8. SUZURI の番号を貼り間違える → 「デザインの番号がかぶっていない — 21116647」
 * sed 's/    suzuri: 21116648,/    suzuri: 21116647,/' site/content/goods.ts > /tmp/brk/suz.ts
 * STK_GOODS_TS=/tmp/brk/suz.ts node site/selftest/sticker_selftest.mjs   # → 1
 *
 * # 9. 番号のつもりで 0 を書く → 「walk: デザインの番号が正の整数 — 0」
 * sed 's/    suzuri: 21116648,/    suzuri: 0,/' site/content/goods.ts > /tmp/brk/suz0.ts
 * STK_GOODS_TS=/tmp/brk/suz0.ts node site/selftest/sticker_selftest.mjs  # → 1
 *
 * # 10. 升目の小さい写しを焼き忘れる → 「isle: 写しが 111×160 — 写しが無い」
 * rm /tmp/brk/pub/goods/thumb/isle.webp
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs        # → 1
 *
 * # 11. 写しを縮め忘れる（art をそのまま置く）→ 「globe: 写しが 160×160 — 絵は 480×480」
 * cp /tmp/brk/pub/goods/globe.webp /tmp/brk/pub/goods/thumb/globe.webp
 * STK_PUBLIC=/tmp/brk/pub node site/selftest/sticker_selftest.mjs        # → 1
 * ```
 *
 * **どれも当てて、赤くなるところまで見てある**（1〜5 は 2026-10-10、
 * 6と7は 2026-10-11、10と11は 2026-10-15）。**ここに「ぜんぶで何通り」と
 * 書かない**——足すたびにずれて、古い数のほうが小さく出る。
 *
 * 3と4は同じ足ではない——3は「置き忘れ」、4は「置いたが抜いていない」で、
 * 4は**ファイルが在るので、実在を見るだけの見張りには一生かからない。**
 *
 * **6は、足を3本抜かないと作れない。** `plane.jpg` の格子は、別々の手が
 * 3つとも落としにかかる:
 *
 * | 手 | 止めると |
 * | --- | --- |
 * | 市松を見つけて地にする | 代わりに**写り込みを広げる手**が格子を落とす（そして**ステッカーの白いふち 41,052画素**を道連れにする） |
 * | 紙のふちから写り込みを広げる | 代わりに**白いふちが地**になり、絵の中と外が切れる |
 * | いちばん大きい塊だけ残す | 切れた2つのうち、飛行機（473,941画素）が格子（404,739画素）より大きいので勝つ |
 *
 * **1本ずつ抜いて落ちることを見るのが基本**（`island-misses.md` #128）だが、
 * ここは**別の足が代わりに持ってしまう**ので、3本抜いてはじめて
 * 「格子の残った絵」が作れる。7は1本（`BREAK=noshare`）で作れる。
 *
 * **7は、ここ以外のどの判定にもかからない**（実測で「通った 74 / 落ちた 1」。
 * 落ちた1つがこの見張り）。寸法も四隅も `saveAs` も、丸いボタンが絵の中に
 * 残っていることを知らない。
 *
 * **対照は本物を1枚も見る前に回る。** 寸法を読む手・透過を読む手・かぶりを
 * 見る手を、こちらで組んだ材料で**両側から**当てる（通るものが通り、壊した
 * ものが落ちる）。1つでも外れたら、**本物の数字を1つも出さずに 2。**
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GOODS_TS = process.env.STK_GOODS_TS || join(SITE, "content", "goods.ts");
const PUBLIC = process.env.STK_PUBLIC || join(SITE, "public");
const CUTTER = join(REPO, "tools", "goods", "stickercut.py");

/** 四隅が抜けていない1枚。**青い四角ごとが絵**なので、ここだけ別扱い */
const SOLID = "sign-color";

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
 * **画素は1つも展開しない**（`ayatoart_selftest.mjs` と同じ理由）。
 */
function webpSize(buf) {
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
      if (buf[at + 3] !== 0x9d || buf[at + 4] !== 0x01 || buf[at + 5] !== 0x2a) return null;
      return { w: buf.readUInt16LE(at + 6) & 0x3fff, h: buf.readUInt16LE(at + 8) & 0x3fff };
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

// ---- 四隅の透け具合を読む（png も webp も） --------------------------------
/**
 * 渡した絵の**四隅の alpha** を読む。`{ 道: [左上, 右上, 左下, 右下] }`。
 *
 * webp の alpha は頭からは読めないので、ここだけ画素を展開する
 * （`tools/` が通っている PIL を子として起こす。この見張りのために
 * node 側へ絵の道具を足さない）。読めなければ `null` を返す。
 */
const PY = `import json, sys
from PIL import Image
out = {}
for p in sys.argv[1:]:
    try:
        im = Image.open(p).convert("RGBA")
    except Exception as e:
        out[p] = {"why": str(e)[:120]}
        continue
    w, h = im.size
    out[p] = {"w": w, "h": h,
              "corners": [im.getpixel(q)[3] for q in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]}
print(json.dumps(out))
`;
const PYBOX = mkdtempSync(join(tmpdir(), "stksel-py-"));
const PYFILE = join(PYBOX, "corners.py");
writeFileSync(PYFILE, PY);

function corners(paths) {
  if (!paths.length) return {};
  try {
    const r = execFileSync("python3", [PYFILE, ...paths], { encoding: "utf8" });
    return JSON.parse(r);
  } catch (e) {
    give(2, `絵の四隅を読めなかった（python3 と PIL が要る）: ${String(e).slice(0, 300)}`);
  }
}

/** 同じ字が2つ以上あるものを並べて返す。 */
function clashes(words) {
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const k = String(w).trim();
    if (seen.has(k)) out.push(k);
    else seen.add(k);
  }
  return out;
}

// ---- 対照。**本物を1枚も見る前に回す** -------------------------------------
{
  const bad = [];

  // (1) webp の頭を読む手。3つの形と、webp でないもの2つ
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
  vp8x.writeUIntLE(480 - 1, 4, 3);
  vp8x.writeUIntLE(475 - 1, 7, 3);
  const lossy = Buffer.alloc(14);
  lossy[3] = 0x9d; lossy[4] = 0x01; lossy[5] = 0x2a;
  lossy.writeUInt16LE(123, 6);
  lossy.writeUInt16LE(456, 8);
  const lossless = Buffer.alloc(5);
  lossless[0] = 0x2f;
  lossless.writeUInt32LE((77 - 1) | ((88 - 1) << 14), 1);
  for (const [tag, buf, w, h] of [
    ["VP8X", riff([chunk("VP8X", vp8x), chunk("ALPH", Buffer.alloc(3)), chunk("VP8 ", lossy)]), 480, 475],
    ["VP8 ", riff([chunk("VP8 ", lossy)]), 123, 456],
    ["VP8L", riff([chunk("VP8L", lossless)]), 77, 88],
  ]) {
    const got = webpSize(buf);
    if (!got || got.w !== w || got.h !== h) {
      bad.push(`${tag} を ${JSON.stringify(got)} と読んだ（${w}×${h} のはず）`);
    }
  }
  if (webpSize(Buffer.from("not a webp file at all....", "ascii"))) {
    bad.push("webp でないものを読めたと言った");
  }
  if (webpSize(Buffer.alloc(4))) bad.push("短すぎるものを読めたと言った");

  // (2) 四隅を読む手。**抜けている絵と、抜けていない絵の両方**で当てる
  const toy = mkdtempSync(join(tmpdir(), "stksel-toy-"));
  const clear = join(toy, "clear.png");
  const solid = join(toy, "solid.png");
  const miss = join(toy, "no-such-file.png");
  execFileSync("python3", ["-c", `from PIL import Image, ImageDraw
import sys
a = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
ImageDraw.Draw(a).ellipse((2, 2, 37, 37), fill=(200, 30, 20, 255))
a.save(sys.argv[1])
Image.new("RGBA", (40, 40), (200, 30, 20, 255)).save(sys.argv[2])`, clear, solid]);
  const got = corners([clear, solid, miss]);
  if (!got[clear] || got[clear].corners.some((v) => v !== 0)) {
    bad.push(`抜けている絵の四隅を ${JSON.stringify(got[clear])} と読んだ`);
  }
  if (!got[solid] || got[solid].corners.some((v) => v !== 255)) {
    bad.push(`抜けていない絵の四隅を ${JSON.stringify(got[solid])} と読んだ`);
  }
  if (got[clear] && (got[clear].w !== 40 || got[clear].h !== 40)) bad.push("寸法を読み違えた");
  if (!got[miss] || !got[miss].why) bad.push("無いファイルを「読めた」と言った");

  // (3) かぶりを見る手。**両側から**
  if (clashes(["a", "b", "c"]).length) bad.push("かぶっていない3つを、かぶったと言った");
  if (clashes(["a", "b", "a"]).join() !== "a") bad.push("かぶった字を見つけられなかった");

  // (4) 抜く道具の対照。あちらが壊れていたら、ここの数字は読まない
  try {
    const r = execFileSync("python3", [CUTTER, "--drill"], {
      cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    if (!/通った/.test(r)) bad.push(`抜く道具の対照が通らない: ${r.trim().slice(0, 300)}`);
  } catch (e) {
    bad.push(`抜く道具の対照が落ちた: ${String(e).slice(0, 300)}`);
  }

  if (bad.length) give(2, `対照が外れた。本物は1枚も見ていない\n  ${bad.join("\n  ")}`);
  console.log(
    "# 対照 通った（webp 3形 + webp でないもの2つ / 四隅 抜けた・抜けない・無い / " +
    "かぶり 2通り / 抜く道具の対照）",
  );
}

// ---- goods.ts を、字で拾わずに組み立てて読む -------------------------------
const OUT = mkdtempSync(join(tmpdir(), "stksel-out-"));
const WORK = mkdtempSync(join(tmpdir(), "stksel-src-"));
copyFileSync(join(SITE, "lib", "ayatoArt.ts"), join(WORK, "ayatoArt.ts"));
// 別名（`@/lib/…`）は tsc が道に直してくれない
writeFileSync(join(WORK, "goods.ts"), readFileSync(GOODS_TS, "utf8").replace(/@\/lib\//g, "./"));
try {
  execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
    join(WORK, "goods.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2022",
    "--strict",
    "--skipLibCheck",
  ], { stdio: "inherit" });
} catch {
  give(2, `${relative(REPO, GOODS_TS)} を組み立てられなかった（上の tsc を見る）`);
}
const { STICKERS, stickerThumb, suzuriDesignHref, THUMB_LONG } =
  createRequire(import.meta.url)(join(OUT, "goods.js"));
if (!Array.isArray(STICKERS) || STICKERS.length === 0) {
  give(2, `${relative(REPO, GOODS_TS)} から STICKERS を読めなかった`);
}
console.log(`# 見たもの: ${relative(REPO, GOODS_TS)} の ${STICKERS.length}枚`);

/** 公開の道（`/goods/x.png`）を、配る前のファイルに直す */
const at = (src) => join(PUBLIC, String(src).replace(/^\//, ""));

// ---- 1. 絵が実在するか -----------------------------------------------------
console.log("\n# 1. art と file が実在するか");
const live = [];
for (const s of STICKERS) {
  for (const [kind, src] of [["art", s.art], ["file", s.file]]) {
    let why = "";
    try {
      if (!statSync(at(src)).isFile()) why = "ファイルではない";
    } catch {
      why = "絵が無い";
    }
    check(`${s.id}: ${kind} ${src}`, !why, why);
    if (!why) live.push(at(src));
  }
}

// ---- 2. art の実寸が w/h と同じか -------------------------------------------
console.log("\n# 2. art の実寸が w/h と同じか");
for (const s of STICKERS) {
  let size = null;
  let why = "";
  try {
    size = webpSize(readFileSync(at(s.art)));
    if (!size) why = "webp の頭から寸法が読めない";
  } catch {
    why = "絵が無い";
  }
  check(
    `${s.id}: ${s.w}×${s.h}`,
    !!size && size.w === s.w && size.h === s.h,
    why || `絵は ${size.w}×${size.h}`,
  );
}

// ---- 3. 透過であるべき絵が透過か -------------------------------------------
console.log("\n# 3. 四隅が抜けているか");
const seen = corners(live);
for (const s of STICKERS) {
  for (const [kind, src] of [["art", s.art], ["file", s.file]]) {
    const got = seen[at(src)];
    if (!got || got.why) {
      check(`${s.id}: ${kind} の四隅`, false, got?.why || "読めなかった");
      continue;
    }
    const clear = got.corners.every((v) => v === 0);
    if (s.id === SOLID) {
      /* **抜けていないことを、こちらでも言い切る。** 「抜けている/いない」を
         どちらでも通すと、この1枚だけ何も見ていないのと同じになる */
      check(`${s.id}: ${kind} は四隅も絵のまま（青い四角ごと配る）`, !clear,
        `四隅が抜けている（${got.corners.join(",")}）`);
    } else {
      check(`${s.id}: ${kind} の四隅が抜けている`, clear, `alpha ${got.corners.join(",")}`);
    }
  }
}

// ---- 4. id と saveAs ---------------------------------------------------------
console.log("\n# 4. id と saveAs");
const dupId = clashes(STICKERS.map((s) => s.id));
const dupSave = clashes(STICKERS.map((s) => s.saveAs));
check("id がかぶっていない", dupId.length === 0, dupId.join(" / "));
check("saveAs がかぶっていない", dupSave.length === 0, dupSave.join(" / "));
for (const s of STICKERS) {
  /* 落ちてくる名前と、中身の形が食い違うと、開けない1枚が手元に残る */
  check(
    `${s.id}: saveAs の拡張子が file と同じ（${extname(s.saveAs)}）`,
    extname(s.saveAs).toLowerCase() === extname(s.file).toLowerCase(),
    `file は ${extname(s.file)}`,
  );
}

// ---- 5. 市松と写り込みが残っていないか --------------------------------------
console.log("\n# 5. 焼いた絵に、市松と写り込みが残っていないか");
{
  let out = "";
  let code = 0;
  try {
    out = execFileSync("python3", [CUTTER, "--audit"], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, STK_OUT: join(PUBLIC, "goods") },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = `${e.stdout || ""}${e.stderr || ""}`;
    code = e.status ?? 1;
  }
  for (const line of out.trim().split("\n")) console.log(`  | ${line}`);
  /* 2＝焼かれていない絵がある。**何枚見たかが出せない**ので、数字を出さずに落ちる */
  if (code === 2) give(2, "焼いた絵を数えられなかった（上の | を見る）");
  check("市松も写り込みも残っていない", code === 0, `--audit が ${code} で落ちた`);
}

// ---- 6. SUZURI のデザインの番号 ---------------------------------------------
/* あやと（2026-10-13）「『グッズを買う』ボタンで…スズリデザインページへの
   導線あると良い」。行き先は1枚ずつ違うので、**1枚ずつ番号を持つ**
   （`content/goods.ts` の `suzuri`）。

   書き忘れは型が止める（`suzuri: number | null` は省略できない）が、
   **貼り間違いは型を通る。** 同じ番号を2枚に書くと、別の絵から同じグッズへ
   送ることになって、押した人には分からない。 */
console.log("\n# 6. SUZURI のデザインの番号");
{
  const has = STICKERS.filter((s) => s.suzuri !== undefined);
  check(`${STICKERS.length}枚とも番号の欄を持っている（\`null\` もそのうち）`,
    has.length === STICKERS.length,
    STICKERS.filter((s) => s.suzuri === undefined).map((s) => s.id).join(" "));
  for (const s of STICKERS.filter((x) => x.suzuri !== null && x.suzuri !== undefined)) {
    check(`${s.id}: デザインの番号が正の整数（${s.suzuri}）`,
      Number.isInteger(s.suzuri) && s.suzuri > 0);
  }
  const dupSuz = clashes(STICKERS.filter((s) => s.suzuri).map((s) => s.suzuri));
  check("デザインの番号がかぶっていない", dupSuz.length === 0, dupSuz.join(" / "));
  /* 道の組み立ても見る。**番号だけ合っていても、道が違えば 404 に送る。**
     住人の面も同じ関数を使う約束なので、ここが唯一の組み立て */
  const live = STICKERS.filter((s) => s.suzuri);
  check("グッズへ行ける1枚が在る（分母）", live.length > 0, `${live.length}枚`);
  for (const s of live) {
    check(`${s.id}: 行き先が店のデザインの面（${suzuriDesignHref(s.suzuri)}）`,
      suzuriDesignHref(s.suzuri) === `https://suzuri.jp/ayato_arigato/designs/${s.suzuri}`);
  }
}

// ---- 7. 升目に出す小さい写し ------------------------------------------------
/* 升目のマスの中の絵は 390px の画面で 40.1px、あやと島カードの選び札は 52px
   （実測）。そこへ長辺480の絵を出していた（2026-10-15 まで）。13枚で
   623.8KB——`/goods/stickers` が最初の1画面で運ぶ量（903.3KB）の 69% がこれ。

   **焼き忘れと寸法ずれは、どちらも型を通る。** 道は `id` から組み立てる
   （`stickerThumb`）ので、名簿に1枚足して焼かなければマスが空で並ぶ。 */
console.log("\n# 7. 升目に出す小さい写し（長辺 " + THUMB_LONG + "）");
{
  /* 手に持つ画面でいちばん大きい枠は、カードの選び札の 52px（実測）。
     広い画面のマス（820px 幅で 69.9px）は住民図鑑と同じ扱いで、ここでは見ない */
  check("長辺が、手に持つ画面でいちばん大きい枠（札 52px）の dpr3 に足りている",
    THUMB_LONG >= 52 * 3, `THUMB_LONG=${THUMB_LONG}`);
  const dupThumb = clashes(STICKERS.map((s) => stickerThumb(s).src));
  check("写しの道がかぶっていない", dupThumb.length === 0, dupThumb.join(" / "));
  for (const s of STICKERS) {
    const t = stickerThumb(s);
    let size = null;
    let why = "";
    try {
      size = webpSize(readFileSync(at(t.src)));
      if (!size) why = "webp の頭から寸法が読めない";
    } catch {
      why = `写しが無い（${t.src}）。tools/goods/stickerthumb.py を回す`;
    }
    check(
      `${s.id}: 写しが ${t.w}×${t.h}`,
      !!size && size.w === t.w && size.h === t.h,
      why || `絵は ${size.w}×${size.h}`,
    );
    /* **元絵より軽いこと**も見る。寸法だけ合わせて、画素を間引いていない
       （quality を上げすぎた）写しを置かれると、直した意味が消える */
    if (!why) {
      let heavy = false;
      try {
        heavy = statSync(at(t.src)).size >= statSync(at(s.art)).size;
      } catch {
        heavy = false;
      }
      check(`${s.id}: 写しが art より軽い`, !heavy, "写しのほうが重い");
    }
  }
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
