/**
 * **カレンダーの試作（`/goods` の「カレンダー」の欄）が、焼いた絵と
 * いいねの鍵を取り違えていないか。**
 *
 *     node site/selftest/calendar_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い
 *
 * ## なぜ要るのか
 *
 * いいねは**付箋の字**に当たっている（`components/goods/wordVotes.tsx`）。
 * 付箋には「どの候補について書いたか」の欄が無いので、鍵に使えるのは字しかない。
 * つまり**字がかぶった瞬間に、別の欄のいいねを数える。** LINEスタンプの
 * セリフは19本あって、これから増える。目で見比べて気づける数ではない。
 *
 * 絵のほうも、面は寸法を1本（`CAL_SHOT_W` / `CAL_SHOT_H`）で持っていて、
 * 焼いた絵が別の寸法だと**3つぶんの行が、絵の届いた瞬間に飛ぶ**
 * （`docs/island-standards.md` 7章）。寸法はファイルの頭からしか読めない。
 *
 * ## 見ているもの
 *
 *  1. `CALENDARS` の `shots` が指す絵が**全部実在し、890×635**
 *     （`CAL_SHOT_W`×`CAL_SHOT_H`。**数は goods.ts から取る**）
 *  2. `vote` が**空でなく、3つとも違う**
 *  3. `vote` が `LINE_WORDS` と**かぶっていない**
 *  4. **いいねの仕掛けが1本しか無い。** 付箋の口（`heartSticky` ほか）を
 *     呼ぶのは `components/goods/` の中で1本だけで、LINEスタンプ側と
 *     カレンダー側は**その同じ1本を読んでいる**
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 1. 絵の寸法を変える（890×635 でない絵を置いたことにする）
 * python3 -c "from PIL import Image; import sys
 * for n in sys.argv[1:]: Image.new('RGB',(640,480),(200,200,200)).save(n,'WEBP')" \
 *   /tmp/badcal/illust-01.webp …
 * CAL_PUBLIC=/tmp/badcal-public node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 2. 3つのうち2つの vote を同じ字にする
 * sed 's/vote: "海外の風景のカレンダー"/vote: "イラストのカレンダー"/' \
 *   site/content/goods.ts > /tmp/broken-same.ts
 * CAL_GOODS_TS=/tmp/broken-same.ts node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 3. vote を LINEスタンプのセリフとかぶらせる
 * sed 's/vote: "イラストのカレンダー"/vote: "おはよう"/' \
 *   site/content/goods.ts > /tmp/broken-clash.ts
 * CAL_GOODS_TS=/tmp/broken-clash.ts node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 4. カレンダー側に2本目の仕掛けを持たせる
 * cp -r site/components/goods /tmp/broken-goods-dir
 * sed -i 's#.*from "@/components/goods/wordVotes";#import { heartSticky } from "@/lib/api";#' \
 *   /tmp/broken-goods-dir/CalendarTries.tsx
 * CAL_GOODS_DIR=/tmp/broken-goods-dir node site/selftest/calendar_selftest.mjs   # → 1
 * ```
 *
 * **対照は本物を1つも見る前に回る。** 絵の寸法を読む手と、仕掛けを数える手と、
 * 字のかぶりを見る手を、こちらで組んだ材料で両側から当てる（通るものが通り、
 * 壊したものが落ちる）。どれか1つでも外れたら、**本物の数字を出さずに 2**。
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GOODS_TS = process.env.CAL_GOODS_TS || join(SITE, "content", "goods.ts");
const PUBLIC = process.env.CAL_PUBLIC || join(SITE, "public");
const GOODS_DIR = process.env.CAL_GOODS_DIR || join(SITE, "components", "goods");

/** 仕掛けの置き場（この1本だけが付箋の口を呼ぶ） */
const SHARED = "wordVotes.tsx";
/** 仕掛けを使う側。**両方が同じ1本を読んでいること**を見る */
const CALLERS = ["StampVotes.tsx", "CalendarTries.tsx"];
/** 付箋の口。これを直に呼んでいるファイルを数える */
const API_CALLS = ["heartSticky", "postSticky", "getStickies", "heartedLocally"];

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
 * **画素は1つも展開しない**（`site/selftest/ayatoart_selftest.mjs` と同じ理由。
 * 展開できる道具をこの見張りのために足すと、CI に入っていない日に黙って外れる）。
 * 3つの形に対応する——`VP8X`（拡張。透過つき）・`VP8 `（非可逆）・`VP8L`（可逆）。
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

/**
 * 字のかぶり。**同じ字が2つ以上あるものを並べて返す。**
 *
 * いいねは字に当たっているので、ここが空でないと別の欄の数を足す。
 * 空白のゆれ（前後の空白）も同じ字とみなす——付箋の側も `trim()` して
 * 突き合わせているので、見張りだけ厳しくすると見逃す。
 */
function clashes(words) {
  const seen = new Map();
  const out = [];
  for (const w of words) {
    const k = String(w).trim();
    if (seen.has(k)) out.push(k);
    else seen.set(k, true);
  }
  return out;
}

/**
 * 仕掛けを数える。
 *
 * 返すのは3つ——**付箋の口を直に呼んでいるファイル**（1本であってほしい）・
 * **共有の1本を読んでいる呼び出し側**・**ハートの形を自分で持っている
 * ファイル**（`nt-heart`。2本目の形が生えると、押し心地が片方だけ変わる）。
 */
function mechanisms(dir) {
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
  const api = [];
  const reads = [];
  const hearts = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    if (API_CALLS.some((c) => new RegExp(`\\b${c}\\b`).test(src))) api.push(f);
    if (/from "@\/components\/goods\/wordVotes"/.test(src)) reads.push(f);
    if (/nt-heart/.test(src)) hearts.push(f);
  }
  return { files, api, reads, hearts };
}

// ---- 対照。**本物を1つも見る前に回す** -------------------------------------
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
  vp8x.writeUIntLE(890 - 1, 4, 3);
  vp8x.writeUIntLE(635 - 1, 7, 3);
  const lossy = Buffer.alloc(14);
  lossy[3] = 0x9d; lossy[4] = 0x01; lossy[5] = 0x2a;
  lossy.writeUInt16LE(890, 6);
  lossy.writeUInt16LE(635, 8);
  const lossless = Buffer.alloc(5);
  lossless[0] = 0x2f;
  lossless.writeUInt32LE((890 - 1) | ((635 - 1) << 14), 1);
  for (const [tag, buf] of [
    ["VP8X", riff([chunk("VP8X", vp8x), chunk("ALPH", Buffer.alloc(3)), chunk("VP8 ", lossy)])],
    ["VP8 ", riff([chunk("VP8 ", lossy)])],
    ["VP8L", riff([chunk("VP8L", lossless)])],
  ]) {
    const got = webpSize(buf);
    if (!got || got.w !== 890 || got.h !== 635) {
      bad.push(`${tag} を ${JSON.stringify(got)} と読んだ（890×635 のはず）`);
    }
  }
  /* **違う寸法を「合っている」と言わないか。** ここが効かないと、
     どんな絵でも通る見張りになる */
  const other = Buffer.alloc(10);
  other.writeUIntLE(640 - 1, 4, 3);
  other.writeUIntLE(480 - 1, 7, 3);
  const o = webpSize(riff([chunk("VP8X", other), chunk("VP8 ", lossy)]));
  if (!o || o.w !== 640 || o.h !== 480) bad.push(`640×480 を ${JSON.stringify(o)} と読んだ`);
  if (webpSize(Buffer.from("not a webp file at all....", "ascii"))) {
    bad.push("webp でないものを読めたと言った");
  }
  if (webpSize(Buffer.alloc(4))) bad.push("短すぎるものを読めたと言った");

  // (2) 字のかぶりを見る手。**両側から当てる**
  if (clashes(["あ", "い", "う"]).length) bad.push("かぶっていない3つを、かぶったと言った");
  if (clashes(["あ", "い", "あ"]).join() !== "あ") bad.push("かぶった字を見つけられなかった");
  if (clashes(["あ", " あ "]).join() !== "あ") bad.push("前後の空白だけ違う字を、別の字と読んだ");

  // (3) 仕掛けを数える手。**こちらで組んだ3枚で、通る側と落ちる側の両方**
  const toy = mkdtempSync(join(tmpdir(), "calsel-toy-"));
  writeFileSync(join(toy, SHARED), 'import { heartSticky } from "@/lib/api";\nclassName="nt-heart"\n');
  writeFileSync(join(toy, "Good.tsx"), 'import { VoteHeart } from "@/components/goods/wordVotes";\n');
  writeFileSync(join(toy, "Bad.tsx"), 'import { heartSticky } from "@/lib/api";\nclassName="nt-heart"\n');
  const m = mechanisms(toy);
  if (m.api.join() !== [SHARED, "Bad.tsx"].sort().join()) {
    bad.push(`口を呼ぶファイルの数え方が外れた: ${m.api.join(" / ")}`);
  }
  if (m.reads.join() !== "Good.tsx") bad.push(`共有を読む側の数え方が外れた: ${m.reads.join(" / ")}`);
  if (m.hearts.length !== 2) bad.push(`ハートの形の数え方が外れた: ${m.hearts.join(" / ")}`);

  if (bad.length) give(2, `対照が外れた。本物は1つも見ていない\n  ${bad.join("\n  ")}`);
  console.log(
    "# 対照 通った（webp 3形 + 違う寸法 + webp でないもの2つ / 字のかぶり 3通り / 仕掛けの数え方 3枚）",
  );
}

// ---- goods.ts を、字で拾わずに組み立てて読む -------------------------------
/* 正規表現で `vote:` を拾うと、コメントに書いた字や、`CAL_WORDS` のような
   導出まで混ざる。**実際に面が読む値**を見たいので、tsc に通して読む。 */
const OUT = mkdtempSync(join(tmpdir(), "calsel-out-"));
const WORK = mkdtempSync(join(tmpdir(), "calsel-src-"));
copyFileSync(join(SITE, "lib", "ayatoArt.ts"), join(WORK, "ayatoArt.ts"));
// 別名（`@/lib/…`）は tsc が道に直してくれない
writeFileSync(
  join(WORK, "goods.ts"),
  readFileSync(GOODS_TS, "utf8").replace(/@\/lib\//g, "./"),
);
execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
  join(WORK, "goods.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], { stdio: "inherit" });
const goods = createRequire(import.meta.url)(join(OUT, "goods.js"));

const { CALENDARS, CAL_SHOT_W, CAL_SHOT_H, CAL_WORDS, LINE_WORDS } = goods;
if (!Array.isArray(CALENDARS) || CALENDARS.length === 0) {
  give(2, `${relative(REPO, GOODS_TS)} から CALENDARS を読めなかった`);
}
if (!CAL_SHOT_W || !CAL_SHOT_H) give(2, "CAL_SHOT_W / CAL_SHOT_H が読めなかった");
if (!Array.isArray(LINE_WORDS) || LINE_WORDS.length === 0) {
  give(2, "LINE_WORDS が読めなかった（かぶりを見る相手がいない）");
}
console.log(
  `# 見たもの: ${relative(REPO, GOODS_TS)} の型 ${CALENDARS.length}つ / ` +
  `絵 ${CALENDARS.reduce((n, c) => n + c.shots.length, 0)}枚 / ` +
  `LINEスタンプのセリフ ${LINE_WORDS.length}本`,
);

// ---- 1. 絵が実在して、寸法が合っているか -----------------------------------
console.log(`\n# 1. 絵が実在して、${CAL_SHOT_W}×${CAL_SHOT_H} か`);
let shots = 0;
for (const cal of CALENDARS) {
  /* **1枚だけだと「同じ型で1年つづく」感じが分からない**（1月と7月） */
  check(`${cal.id}: 試作が2枚ある`, cal.shots.length === 2, `${cal.shots.length}枚`);
  for (const shot of cal.shots) {
    const f = join(PUBLIC, shot.src.replace(/^\//, ""));
    const name = `${cal.id}: ${shot.src}`;
    let size = null;
    let why = "";
    try {
      if (!statSync(f).isFile()) why = "ファイルではない";
      else size = webpSize(readFileSync(f));
      if (!size && !why) why = "webp の頭から寸法が読めない";
    } catch {
      why = "絵が無い";
    }
    shots += 1;
    check(
      `${name}（${size ? `${size.w}×${size.h}` : why}）`,
      !!size && size.w === CAL_SHOT_W && size.h === CAL_SHOT_H,
      why || `面は ${CAL_SHOT_W}×${CAL_SHOT_H} で場所を取っている`,
    );
    /* **`alt` を空にしない。** 絵が落ちた日に、3つの型が見分けられなくなる */
    check(`${name} に alt がある`, !!shot.alt && shot.alt.trim().length > 0);
  }
}
if (shots === 0) give(2, "絵を1枚も数えられなかった");

// ---- 2. いいねの鍵が、空でなく、3つとも違うか ------------------------------
console.log("\n# 2. いいねの鍵（付箋の字）");
for (const cal of CALENDARS) {
  check(`${cal.id}: vote が空でない`, !!cal.vote && cal.vote.trim().length > 0);
  check(`${cal.id}: name が空でない`, !!cal.name && cal.name.trim().length > 0);
}
const same = clashes(CALENDARS.map((c) => c.vote));
check("3つの vote が、どれも違う字", same.length === 0, `かぶり: ${same.join(" / ")}`);
/* `CAL_WORDS` は導出。**手で並べ直していないこと**も見る——写すと、
   型を1つ足した日に `Notes` の `omitTexts` だけ古くなる */
check(
  "CAL_WORDS が CALENDARS から出ている",
  Array.isArray(CAL_WORDS) &&
    CAL_WORDS.join("\u0000") === CALENDARS.map((c) => c.vote).join("\u0000"),
  JSON.stringify(CAL_WORDS),
);

// ---- 3. LINEスタンプのセリフとかぶっていないか -----------------------------
console.log("\n# 3. LINEスタンプのセリフとかぶっていないか");
const both = clashes([...CALENDARS.map((c) => c.vote), ...LINE_WORDS]);
check(
  `カレンダーの鍵が、セリフ ${LINE_WORDS.length}本のどれともかぶらない`,
  both.length === 0,
  `かぶり: ${both.join(" / ")}（別の欄のいいねを数える）`,
);

// ---- 4. いいねの仕掛けが1本しか無いか --------------------------------------
console.log("\n# 4. いいねの仕掛けが1本しか無いか");
const mech = mechanisms(GOODS_DIR);
console.log(`  （見たファイル ${mech.files.length}枚: ${mech.files.join(" / ")}）`);
check(
  `付箋の口を呼ぶのは ${SHARED} の1本だけ`,
  mech.api.length === 1 && mech.api[0] === SHARED,
  `呼んでいるのは ${mech.api.join(" / ") || "0本"}`,
);
check(
  `ハートの形を持つのも ${SHARED} の1本だけ`,
  mech.hearts.length === 1 && mech.hearts[0] === SHARED,
  `持っているのは ${mech.hearts.join(" / ") || "0本"}`,
);
for (const caller of CALLERS) {
  check(
    `${caller} が、共有の1本を読んでいる`,
    mech.reads.includes(caller),
    `読んでいるのは ${mech.reads.join(" / ") || "0本"}`,
  );
}
/* **両方が同じ1本を読んでいる**こと。片方が写しを読んでいたら、
   上の2つは通ってもここで落ちる */
check(
  "LINEスタンプ側とカレンダー側が、同じ1本を読んでいる",
  CALLERS.every((c) => mech.reads.includes(c)) && mech.reads.length >= CALLERS.length,
  mech.reads.join(" / "),
);

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (OK === 0) give(2, "数えるものがありませんでした。");
process.exit(BAD ? 1 : 0);
