/**
 * **カレンダーの月の表（`content/goods.ts` の `CAL_MONTHS`）と、焼いた絵・元絵が
 * 食い違っていないか。** あわせて、グッズの面の**いいねの仕掛けが1本のまま**か。
 *
 *     node site/selftest/calendar_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い（対照が外れた・読めなかった）
 *
 * ## なぜ要るのか
 *
 * カレンダーは「暦の N月のページに、思い出の月のイラストが1枚」（あやと
 * 2026-10-12、#759）。絵は1枚ずつ届いて、月によっては候補が2〜3枚あり、
 * **あとで差し替わる。** 手で触るところが3つ（元絵・焼いた絵・表の1行）あるので、
 * どれか1つだけ古くなる日が必ず来る:
 *
 *  - 表が指す絵が無い・焼いた寸法と違う → 面で絵が落ちる／届いた瞬間に下が飛ぶ
 *  - 同じ月が2行ある・思い出の年がずれる → 見出しが嘘になる（暦11・12月は 2025年）
 *  - 焼いた絵が表に無い・元絵が消えたのに焼いた絵だけ残る → 配らない絵が配られ続ける
 *  - 元絵だけ置いて回し忘れる → 新しい絵が面に出ない
 *
 * **寸法は焼いた物で見る。** 元絵は月ごとに大きさが違う（943〜1024px）。
 * 揃えるのは道具（`tools/goods/calbake.py`）の仕事で、こちらは揃った結果を見る。
 *
 * ## 見ているもの
 *
 *  1. 表が**12行、暦の1〜12月の順に1行ずつ**（重複・抜け・順の入れ替わり）
 *  2. **思い出の年月**が決めごとどおり（暦1〜10月 → 2026年、11・12月 → 2025年。
 *     月の数は同じ）
 *  3. 候補は**3枚まで**、名前は `/goods/calendar/<MM>-<a|b|c>.webp` で
 *     `MM` が行の月、`a` `b` `c` が**抜けなく順に**。`alt` が空でない
 *  4. 指している絵が**実在し、`CAL_SHOT_W`×`CAL_SHOT_H`**（webp の頭から読む）。
 *     その数は道具の `SHOT_W, SHOT_H` とも同じ
 *  5. 焼いた置き場に、**表に無い絵が無い**（決まりの外の名前も無い）
 *  6. 指している絵に**元絵がある**（`tools/goods/cal-src/<MM>-<x>.png|jpg|jpeg|webp`）。
 *     元絵があるのに**焼いた絵が無い**ものも落とす（回し忘れ）
 *  7. `CAL_SHOWN` が「絵のある月」そのもの（手で並べ直していない）
 *  8. **焼く道具の対照**（`tools/goods/calbake.py --drill`）が通り、表を1日ずらす
 *     （`BREAK=shift`）と 1 で落ちる。絵の右下の一言を重ねない（`BREAK=sign`）と
 *     1 で落ちる。2027-01-01 が金曜、など12か月の曜日の答えは
 *     道具の側が持っている。元絵が無くても回る（2.2秒）
 *  9. **いいねの仕掛けが1本しか無い。** 付箋の口（`heartSticky` ほか）を呼ぶのも、
 *     ハートの形を持つのも `components/goods/wordVotes.tsx` だけで、
 *     LINEスタンプ（`StampVotes.tsx`）はその1本を読んでいる。カレンダーはもう
 *     いいねを使わない（`CalendarMonths.tsx` が読んでいたら落とす）。
 *     **ここは LINEスタンプの守り**——カレンダーが仕掛けから外れても、写しの
 *     仕掛けが生える道は同じように閉じておく
 *
 * ## わざと壊して、赤くなることを見る
 *
 * 見る手（`monthFaults`）は、**本物を1つも見る前に**こちらで組んだ表と置き場に
 * 当てる。通る1組と、壊した13通り（月の重複・思い出の年・寸法違い・存在しない絵・
 * 表に無い絵・決まりの外の名前・4枚目・月の取り違え・候補の抜け・alt が空・
 * 元絵が無い・回し忘れ・`CAL_SHOWN` の食い違い）。**壊したものは、その足の印で
 * 落ちること**まで見る（別の足で偶然落ちたのを「拾えた」と読まない）。
 * 1つでも外れたら、本物の数字を出さずに 2。
 *
 * 本物の置き場を差し替えて当てることもできる:
 *
 * ```bash
 * # 1. 焼いた絵の寸法を変える（890×760 でない絵を置いたことにする）
 * mkdir -p /tmp/badcal-public/goods/calendar
 * python3 -c "from PIL import Image; import sys
 * for n in sys.argv[1:]: Image.new('RGB',(640,480),(200,200,200)).save(n,'WEBP')" \
 *   /tmp/badcal-public/goods/calendar/{05,08,09,10}-a.webp
 * CAL_PUBLIC=/tmp/badcal-public node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 2. 同じ月を2行にする（6月の行を 5月にする）
 * sed 's/{ month: 6, memory: { year: 2026, month: 6 }/{ month: 5, memory: { year: 2026, month: 5 }/' \
 *   site/content/goods.ts > /tmp/cal-dup.ts
 * CAL_GOODS_TS=/tmp/cal-dup.ts node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 3. 存在しない絵を指す
 * sed 's#/goods/calendar/09-a.webp#/goods/calendar/09-b.webp#' \
 *   site/content/goods.ts > /tmp/cal-ghost.ts
 * CAL_GOODS_TS=/tmp/cal-ghost.ts node site/selftest/calendar_selftest.mjs   # → 1
 *
 * # 4. カレンダー側に、いいねの仕掛けを戻す
 * cp -r site/components/goods /tmp/cal-goods-dir
 * sed -i '1a import { VoteHeart } from "@/components/goods/wordVotes";' \
 *   /tmp/cal-goods-dir/CalendarMonths.tsx
 * CAL_GOODS_DIR=/tmp/cal-goods-dir node site/selftest/calendar_selftest.mjs   # → 1
 * ```
 *
 * **組み立てに失敗した写しは 1 ではなく 2 で落ちる**（型が合わない goods.ts を
 * 渡したとき）。1 で落とすと「中身が食い違った」に見えるが、中身は1つも
 * 読めていない。
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
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
const CAL_SRC = process.env.CAL_SRC || join(REPO, "tools", "goods", "cal-src");
const GOODS_DIR = process.env.CAL_GOODS_DIR || join(SITE, "components", "goods");
const BAKER = join(REPO, "tools", "goods", "calbake.py");

/** 焼いた絵の置き場（面から見た道） */
const CAL_DIR = "/goods/calendar/";
/** 候補の字。並びもこの順 */
const PICKS = "abc";
/** 元絵として認める拡張子（道具の `NAME` と同じ） */
const SRC_EXT = /\.(png|jpe?g|webp)$/;

/** 仕掛けの置き場（この1本だけが付箋の口を呼ぶ） */
const SHARED = "wordVotes.tsx";
/** 仕掛けを使う側 */
const CALLER = "StampVotes.tsx";
/** もう仕掛けを使わない側 */
const NOT_CALLER = "CalendarMonths.tsx";
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

// ---- 見る手 ------------------------------------------------------------------

const mm = (n) => String(n).padStart(2, "0");

/** 暦の N月のページに載る、思い出の年月（あやと 2026-10-12）。道具の `memory_of` と同じ */
const memoryOf = (month) => ({ year: month <= 10 ? 2026 : 2025, month });

/**
 * 表と置き場を突き合わせて、食い違いを `{ leg, msg }` で返す。
 *
 * `leg` は**どの足で落ちたか**の印。対照は「壊したものが、その足で落ちた」まで見る。
 *
 * @param {object} t
 * @param {any[]} t.months `CAL_MONTHS`
 * @param {any[]} t.shown `CAL_SHOWN`
 * @param {number} t.W `CAL_SHOT_W`
 * @param {number} t.H `CAL_SHOT_H`
 * @param {(name: string) => ({w:number,h:number}|null|"missing")} t.sizeOf 焼いた1枚の寸法
 * @param {string[]} t.baked 焼いた置き場にあるファイルの名前
 * @param {string[]} t.sources 元絵の置き場にあるファイルの名前
 */
function monthFaults({ months, shown, W, H, sizeOf, baked, sources }) {
  const out = [];
  const say = (leg, msg) => out.push({ leg, msg });

  // 1. 12行、1〜12月の順に1行ずつ
  if (!Array.isArray(months)) {
    say("rows", "CAL_MONTHS が配列でない");
    return out;
  }
  const seen = new Map();
  for (const m of months) {
    if (seen.has(m.month)) say("rows", `${m.month}月の行が2つある`);
    seen.set(m.month, (seen.get(m.month) || 0) + 1);
  }
  for (let n = 1; n <= 12; n++) {
    if (!seen.has(n)) say("rows", `${n}月の行が無い`);
  }
  if (months.length !== 12) say("rows", `行が ${months.length}行（12行のはず）`);
  months.forEach((m, i) => {
    if (m.month !== i + 1) say("rows", `${i + 1}行目が ${m.month}月（暦の順に並べる）`);
  });

  const referenced = new Set();
  for (const m of months) {
    const tag = `${m.month}月`;
    // 2. 思い出の年月
    const want = memoryOf(m.month);
    if (!m.memory || m.memory.year !== want.year || m.memory.month !== want.month) {
      say(
        "memory",
        `${tag}: 思い出が ${m.memory ? `${m.memory.year}年${m.memory.month}月` : "無い"}` +
          `（${want.year}年${want.month}月のはず）`,
      );
    }
    // 3. 候補の数・名前・alt
    const picks = Array.isArray(m.picks) ? m.picks : [];
    if (picks.length > PICKS.length) say("count", `${tag}: 候補が ${picks.length}枚（${PICKS.length}枚まで）`);
    picks.forEach((p, i) => {
      const want = `${CAL_DIR}${mm(m.month)}-${PICKS[i] ?? "?"}.webp`;
      if (p.src !== want) {
        const mo = /\/(\d\d)-([a-z])\.webp$/.exec(p.src || "");
        say(
          mo && Number(mo[1]) !== m.month ? "month" : "letter",
          `${tag}: ${i + 1}枚目が ${p.src}（${want} のはず）`,
        );
      }
      if (!p.alt || !String(p.alt).trim()) say("alt", `${tag}: ${p.src} に alt が無い`);
      // 4. 実在して寸法が合う
      const name = String(p.src || "").replace(CAL_DIR, "");
      referenced.add(name);
      const size = sizeOf(name);
      if (size === "missing") say("missing", `${tag}: ${p.src} が置き場に無い`);
      else if (!size) say("size", `${tag}: ${p.src} の頭から寸法が読めない`);
      else if (size.w !== W || size.h !== H) {
        say("size", `${tag}: ${p.src} が ${size.w}×${size.h}（面は ${W}×${H} で場所を取っている）`);
      }
      // 6. 元絵がある
      const stem = name.replace(/\.webp$/, "");
      if (!sources.some((s) => s.replace(SRC_EXT, "") === stem && SRC_EXT.test(s))) {
        say("source", `${tag}: ${p.src} の元絵が cal-src に無い（焼き直せない）`);
      }
    });
  }

  // 5. 焼いた置き場に、表に無い絵・決まりの外の名前が無い
  for (const f of baked) {
    if (!/^(0[1-9]|1[0-2])-[abc]\.webp$/.test(f)) {
      say("stray", `${CAL_DIR}${f} は名前の決まり（<MM>-<a|b|c>.webp）の外`);
    } else if (!referenced.has(f)) {
      say("orphan", `${CAL_DIR}${f} が表に無い（配らない絵が配られる）`);
    }
  }
  // 6. 元絵があるのに焼いていない（回し忘れ）
  for (const s of sources) {
    if (!SRC_EXT.test(s)) continue;
    const name = s.replace(SRC_EXT, ".webp");
    if (/^(0[1-9]|1[0-2])-[abc]\.webp$/.test(name) && !baked.includes(name)) {
      say("unbaked", `cal-src/${s} はあるのに ${CAL_DIR}${name} が無い（calbake.py の回し忘れ）`);
    }
  }

  // 7. CAL_SHOWN は「絵のある月」そのもの
  const want = months.filter((m) => (m.picks || []).length > 0).map((m) => m.month);
  const got = (shown || []).map((m) => m.month);
  if (want.join() !== got.join()) say("shown", `CAL_SHOWN が ${got.join(",")}（${want.join(",")} のはず）`);
  return out;
}

/**
 * 仕掛けを数える。
 *
 * 返すのは3つ——**付箋の口を直に呼んでいるファイル**（1本であってほしい）・
 * **共有の1本を読んでいるファイル**・**ハートの形を自分で持っている
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

  // (1) webp の頭を読む手。3つの形と、違う寸法と、webp でないもの2つ
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
  vp8x.writeUIntLE(760 - 1, 7, 3);
  const lossy = Buffer.alloc(14);
  lossy[3] = 0x9d; lossy[4] = 0x01; lossy[5] = 0x2a;
  lossy.writeUInt16LE(890, 6);
  lossy.writeUInt16LE(760, 8);
  const lossless = Buffer.alloc(5);
  lossless[0] = 0x2f;
  lossless.writeUInt32LE((890 - 1) | ((760 - 1) << 14), 1);
  for (const [tag, buf] of [
    ["VP8X", riff([chunk("VP8X", vp8x), chunk("ALPH", Buffer.alloc(3)), chunk("VP8 ", lossy)])],
    ["VP8 ", riff([chunk("VP8 ", lossy)])],
    ["VP8L", riff([chunk("VP8L", lossless)])],
  ]) {
    const got = webpSize(buf);
    if (!got || got.w !== 890 || got.h !== 760) {
      bad.push(`${tag} を ${JSON.stringify(got)} と読んだ（890×760 のはず）`);
    }
  }
  const other = Buffer.alloc(10);
  other.writeUIntLE(640 - 1, 4, 3);
  other.writeUIntLE(480 - 1, 7, 3);
  const o = webpSize(riff([chunk("VP8X", other), chunk("VP8 ", lossy)]));
  if (!o || o.w !== 640 || o.h !== 480) bad.push(`640×480 を ${JSON.stringify(o)} と読んだ`);
  if (webpSize(Buffer.from("not a webp file at all....", "ascii"))) {
    bad.push("webp でないものを読めたと言った");
  }
  if (webpSize(Buffer.alloc(4))) bad.push("短すぎるものを読めたと言った");

  // (2) 表と置き場を突き合わせる手。**通る1組と、壊した13通り**
  const row = (n, picks = []) => ({ month: n, memory: memoryOf(n), picks });
  const pick = (n, x) => ({ src: `${CAL_DIR}${mm(n)}-${x}.webp`, alt: `${n}月の${x}` });
  /** 通る1組。5月に1枚、8月に2枚（候補の並びも見る） */
  const good = () => {
    const months = Array.from({ length: 12 }, (_, i) => row(i + 1));
    months[4].picks = [pick(5, "a")];
    months[7].picks = [pick(8, "a"), pick(8, "b")];
    return {
      months,
      shown: months.filter((m) => m.picks.length),
      W: 890,
      H: 760,
      baked: ["05-a.webp", "08-a.webp", "08-b.webp"],
      sources: ["05-a.png", "08-a.png", "08-b.jpg"],
      sizes: {},
    };
  };
  const run = (t) =>
    monthFaults({
      ...t,
      sizeOf: (name) =>
        name in t.sizes ? t.sizes[name] : t.baked.includes(name) ? { w: 890, h: 760 } : "missing",
    });

  const g = run(good());
  if (g.length) bad.push(`通るはずの1組が落ちた: ${g.map((f) => f.msg).join(" / ")}`);

  /** `[名前, 壊しかた, 落ちてほしい足]` */
  const breaks = [
    ["月の重複", (t) => { t.months[5].month = 5; t.months[5].memory = memoryOf(5); }, "rows"],
    ["思い出の年", (t) => { t.months[10].memory = { year: 2026, month: 11 }; }, "memory"],
    ["寸法違い", (t) => { t.sizes["05-a.webp"] = { w: 640, h: 480 }; }, "size"],
    ["存在しない絵", (t) => { t.months[4].picks[0] = pick(5, "a"); t.baked = t.baked.filter((f) => f !== "05-a.webp"); t.sources = t.sources.filter((s) => s !== "05-a.png"); }, "missing"],
    ["表に無い絵", (t) => { t.baked.push("09-a.webp"); t.sources.push("09-a.png"); }, "orphan"],
    ["決まりの外の名前", (t) => { t.baked.push("illust.webp"); }, "stray"],
    ["4枚目", (t) => { t.months[7].picks.push(pick(8, "c"), { src: `${CAL_DIR}08-d.webp`, alt: "d" }); t.baked.push("08-c.webp"); t.sources.push("08-c.png"); }, "count"],
    ["月の取り違え", (t) => { t.months[4].picks[0] = pick(8, "a"); }, "month"],
    ["候補の抜け", (t) => { t.months[7].picks[1] = pick(8, "c"); t.baked.push("08-c.webp"); t.sources.push("08-c.png"); }, "letter"],
    ["alt が空", (t) => { t.months[4].picks[0].alt = "  "; }, "alt"],
    ["元絵が無い", (t) => { t.sources = t.sources.filter((s) => s !== "08-b.jpg"); }, "source"],
    ["回し忘れ", (t) => { t.sources.push("10-a.png"); }, "unbaked"],
    ["CAL_SHOWN の食い違い", (t) => { t.shown = t.months.slice(0, 2); }, "shown"],
  ];
  for (const [name, breakIt, leg] of breaks) {
    const t = good();
    breakIt(t);
    const got = run(t);
    if (!got.some((f) => f.leg === leg)) {
      bad.push(
        `壊した「${name}」を ${leg} の足で拾えなかった` +
          `（出たのは ${got.map((f) => f.leg).join(",") || "0件"}）`,
      );
    }
  }

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
    `# 対照 通った（webp 3形 + 違う寸法 + webp でないもの2つ / ` +
      `月の表 通る1組 + 壊した${breaks.length}通りを、それぞれの足で / 仕掛けの数え方 3枚）`,
  );
}

// ---- goods.ts を、字で拾わずに組み立てて読む -------------------------------
/* 正規表現で拾うと、コメントに書いた字や導出まで混ざる。**実際に面が読む値**を
   見たいので、tsc に通して読む。 */
const OUT = mkdtempSync(join(tmpdir(), "calsel-out-"));
const WORK = mkdtempSync(join(tmpdir(), "calsel-src-"));
copyFileSync(join(SITE, "lib", "ayatoArt.ts"), join(WORK, "ayatoArt.ts"));
// 別名（`@/lib/…`）は tsc が道に直してくれない
writeFileSync(
  join(WORK, "goods.ts"),
  readFileSync(GOODS_TS, "utf8").replace(/@\/lib\//g, "./"),
);
/* 組み立てに失敗したら **2**（数えるものが無い）。1 で落とすと「カレンダーの
   中身が食い違った」に見えるが、ここで落ちているのは型のほうで、中身は
   1つも読めていない */
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
const goods = createRequire(import.meta.url)(join(OUT, "goods.js"));

const { CAL_MONTHS, CAL_SHOWN, CAL_SHOT_W, CAL_SHOT_H } = goods;
if (!Array.isArray(CAL_MONTHS) || CAL_MONTHS.length === 0) {
  give(2, `${relative(REPO, GOODS_TS)} から CAL_MONTHS を読めなかった`);
}
if (!CAL_SHOT_W || !CAL_SHOT_H) give(2, "CAL_SHOT_W / CAL_SHOT_H が読めなかった");

const bakedDir = join(PUBLIC, CAL_DIR);
const baked = existsSync(bakedDir) ? readdirSync(bakedDir).filter((f) => !f.startsWith(".")) : [];
const sources = existsSync(CAL_SRC) ? readdirSync(CAL_SRC).filter((f) => !f.startsWith(".")) : [];
const pickCount = CAL_MONTHS.reduce((n, m) => n + (m.picks || []).length, 0);
console.log(
  `# 見たもの: ${relative(REPO, GOODS_TS)} の月 ${CAL_MONTHS.length}行 / ` +
    `絵のある月 ${CAL_MONTHS.filter((m) => (m.picks || []).length).length} / 候補 ${pickCount}枚 / ` +
    `焼いた置き場 ${baked.length}枚 / 元絵 ${sources.length}枚`,
);

// ---- 1〜7. 表と置き場 --------------------------------------------------------
console.log("\n# 1〜7. 月の表と、焼いた絵・元絵");
const faults = monthFaults({
  months: CAL_MONTHS,
  shown: CAL_SHOWN,
  W: CAL_SHOT_W,
  H: CAL_SHOT_H,
  baked,
  sources,
  sizeOf: (name) => {
    const f = join(bakedDir, name);
    try {
      if (!statSync(f).isFile()) return "missing";
    } catch {
      return "missing";
    }
    return webpSize(readFileSync(f));
  },
});
const LEGS = [
  ["rows", "12行、暦の1〜12月の順に1行ずつ"],
  ["memory", "思い出の年月が、暦1〜10月は2026年・11〜12月は2025年"],
  ["count", "候補は3枚まで"],
  ["month", "候補の名前の月が、行の月と同じ"],
  ["letter", "候補の名前が a b c の順に抜けなく"],
  ["alt", "候補に alt がある"],
  ["missing", "指している絵が置き場にある"],
  ["size", `指している絵が ${CAL_SHOT_W}×${CAL_SHOT_H}`],
  ["orphan", "焼いた置き場に、表に無い絵が無い"],
  ["stray", "焼いた置き場に、名前の決まりの外のファイルが無い"],
  ["source", "指している絵に元絵がある"],
  ["unbaked", "元絵があるのに焼いていないものが無い"],
  ["shown", "CAL_SHOWN が、絵のある月そのもの"],
];
for (const [leg, name] of LEGS) {
  const hit = faults.filter((f) => f.leg === leg);
  check(name, hit.length === 0, hit.map((f) => f.msg).join(" / "));
}
/* 足の印が表に無い食い違いを、黙って捨てない */
const unknown = faults.filter((f) => !LEGS.some(([leg]) => leg === f.leg));
check("足の印の分からない食い違いが無い", unknown.length === 0, unknown.map((f) => f.msg).join(" / "));

/* 寸法の数は、焼く道具と面の2か所にある。**片方だけ変えた日に赤くする** */
const bakerSrc = existsSync(BAKER) ? readFileSync(BAKER, "utf8") : "";
const sm = /^SHOT_W, SHOT_H = (\d+), (\d+)/m.exec(bakerSrc);
check(
  `焼く道具の寸法（SHOT_W, SHOT_H）が面と同じ ${CAL_SHOT_W}×${CAL_SHOT_H}`,
  !!sm && Number(sm[1]) === CAL_SHOT_W && Number(sm[2]) === CAL_SHOT_H,
  sm ? `${sm[1]}×${sm[2]}` : `${relative(REPO, BAKER)} から読めない`,
);

// ---- 8. 焼く道具の対照（2027年の曜日ほか） ---------------------------------
/* 道具は人が回すものだが、**対照（`--drill`）は元絵が無くても回る**ので、毎 PR で
   起こす（2.2秒。2026-10-12 実測）。曜日の答え（2027-01-01 は金曜、など12か月）・
   名前の決まり・正方形・枠が月をまたいで同じ、を道具そのものに当てる。
   **折った回（`BREAK=shift`。表を1日ずらす）が 1 で落ちることも見る**——
   通る回だけだと、何も見ていない対照でも通る */
console.log("\n# 8. 焼く道具の対照（calbake.py --drill）");
const drill = (env) => {
  try {
    execFileSync("python3", [BAKER, "--drill"], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const plain = drill({ BREAK: "" });
if (plain.code === 2 || plain.code === -1) {
  give(2, `calbake.py --drill が数えられなかった（終了コード ${plain.code}）\n${plain.out.slice(-800)}`);
}
check("calbake.py --drill が通る（2027年の12か月の曜日を含む）", plain.code === 0,
  `終了コード ${plain.code}\n${plain.out.slice(-800)}`);
const shifted = drill({ BREAK: "shift" });
check("表を1日ずらすと calbake.py --drill が 1 で落ちる", shifted.code === 1,
  `終了コード ${shifted.code}`);
/* 絵の右下の一言（#786）。**重ねたことにして重ねない回**が落ちることを見る——
   一言を描く道が黙って空振りしても、通る回だけでは区別がつかない */
const unsigned = drill({ BREAK: "sign" });
check("一言を重ねないと calbake.py --drill が 1 で落ちる", unsigned.code === 1,
  `終了コード ${unsigned.code}`);

// ---- 9. いいねの仕掛けが1本しか無いか --------------------------------------
console.log("\n# 9. いいねの仕掛けが1本しか無いか（LINEスタンプの守り）");
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
check(
  `${CALLER} が、共有の1本を読んでいる`,
  mech.reads.includes(CALLER),
  `読んでいるのは ${mech.reads.join(" / ") || "0本"}`,
);
check(
  `${NOT_CALLER} が在って、いいねの仕掛けを読んでいない（カレンダーはもう押して選ばない）`,
  mech.files.includes(NOT_CALLER) && !mech.reads.includes(NOT_CALLER) &&
    !mech.api.includes(NOT_CALLER) && !mech.hearts.includes(NOT_CALLER),
  mech.files.includes(NOT_CALLER) ? `${NOT_CALLER} が仕掛けに触っている` : `${NOT_CALLER} が無い`,
);

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (OK === 0) give(2, "数えるものがありませんでした。");
process.exit(BAD ? 1 : 0);
