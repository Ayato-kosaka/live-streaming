/**
 * **SUZURI に在るデザインのうち、島のどこからも行けないものが
 * `/goods` に並んでいるか。**
 *
 *     node tools/sprites/shopgoods_selftest.mjs
 *     # 0=合っている / 1=行けないものが在る / 2=数えるものが無い
 *
 * ## なぜ要るのか
 *
 * あやとの言葉（2026-10-13）:
 *
 * > 住人ページ、あやとステッカーページから「グッズを買う」ボタンで
 * > …スズリデザインページへの導線あると良い。
 * > **住人からもステッカーからも導線がないものは** …
 * > **SUZURI のグッズお店 に導線作ると良い**
 *
 * SUZURI のデザインは3つに分かれる——住人グッズ（「カサ・アヤトの住人 ◯」）、
 * あやとステッカー（「あやと ― ◯」）、そのどちらでもないもの。
 * 前の2つはそれぞれの面から行けるので、**残りが `/goods` の
 * `SHOP_GOODS` に並んでいないと、島のどこからも辿れないデザインになる。**
 *
 * **一覧を手で並べているので、増えた日に黙って古くなる。**
 * 一覧は手で作らないのが決め（`docs/island-standards.md` 8章）だが、
 * SUZURI のデザイン一覧は**鍵の要る API からしか引けない**
 * （店の頁は JS で描かれるので HTML に出ない。鍵はこの箱にもビルドにも無い）。
 * 導出できないなら、**せめて食い違いを判定にする**（同 8章）。
 *
 * ## 何を読むか
 *
 * | 読むもの | 何を言っているか |
 * | --- | --- |
 * | `site/content/goods.ts` の `SHOP_GOODS` | 島が並べているもの |
 * | `tools/sprites/shopgoods-census.json` | **SUZURI にその日あったもの全部**（下） |
 * | `tools/goods/goods.json` | これから作る／作ったグッズの注文書 |
 *
 * 台帳（census）の取り直しかた——**鍵はここでは使わない。**
 * `SUZURI API` ワークフロー（`suzuri_api.yml`）を `command: materials` で押し、
 * 出た「id 公開/非公開 利益 題」の行から `designs` を作り直す。
 * 行き先（`route`）の付けかたは下の `routeOf` と同じ規則。
 *
 * ## 6つの見かた
 *
 * | | 外れると |
 * | --- | --- |
 * | 1. 台帳の `route: "shop"` が、`SHOP_GOODS` に**過不足なく**在る | 1 |
 * | 2. `route` が題と合っている（`resident` は住人の題、`sticker` はあやとの題） | 1 |
 * | 3. `SHOP_GOODS` の id が**かぶっていない**。題が台帳と同じ字 | 1 |
 * | 4. 写真が**実在して**、`w`/`h` が実寸と同じ | 1 |
 * | 5. 店の札の写真（`SUZURI.shot`）も実在する | 1 |
 * | 6. `tools/goods/goods.json` の注文が、全部 `SHOP_GOODS` に出ている | 1 |
 *
 * **2 が要るのは、`route` を付け替えるだけで1を黙らせられるから。**
 * 「このデザインは住人グッズです」と台帳に書けば、住人の面から行けなくても
 * 1 は通る。だから `route` のほうを題で裏取りする。
 *
 * **6 が要るのは、台帳が古いときに効く唯一の足だから。** 台帳は手で取り直す
 * ものなので、グッズを作った人が取り直さないと 1 は何も言わない。
 * `goods.json` はリポジトリの中にあるので、**作る前から赤くなる。**
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 本物を1つも見る前に、**自分が落ちられるか**を実測する。
 * 偽の `goods.ts`・偽の台帳・偽の注文書・偽の置き場をこしらえて、
 * **自分自身を子として起こし**、6つとも狙ったところで 1 が出るのを見る
 * （`SG_DRILL=0` で子は対照を回さない。入れ子にならない）。
 * **そろった材料では 0、材料が空なら 2** も見る。
 * 1つでも外れたら、本物の数字を1つも出さずに 2 で帰る。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SITE = join(REPO, "site");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GOODS_TS = process.env.SG_GOODS_TS || join(SITE, "content", "goods.ts");
const CENSUS = process.env.SG_CENSUS || join(HERE, "shopgoods-census.json");
const SPEC = process.env.SG_SPEC || join(REPO, "tools", "goods", "goods.json");
const PUBLIC = process.env.SG_PUBLIC || join(SITE, "public");

const RESIDENT_HEAD = "カサ・アヤトの住人 ";
const STICKER_HEAD = "あやと ― ";

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

/**
 * 題から行き先を決める。**台帳の `route` は、これと合っていなければならない。**
 *
 * 非公開のものは売り場が無いので、どこからも行けなくて当たり前（`draft`）。
 */
function routeOf(row) {
  if (!row.published) return "draft";
  const t = String(row.title || "");
  if (t.startsWith(RESIDENT_HEAD)) return "resident";
  if (t.startsWith(STICKER_HEAD)) return "sticker";
  return "shop";
}

// ---- webp の頭から寸法を読む（画素は1つも展開しない） ----------------------
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

/** `goods.ts` を、字で拾わずに組み立てて読む（`site/selftest/sticker_selftest.mjs` と同じ手） */
function loadGoods(tsPath) {
  const out = mkdtempSync(join(tmpdir(), "sgsel-out-"));
  const work = mkdtempSync(join(tmpdir(), "sgsel-src-"));
  // 別名（`@/lib/…`）は tsc が道に直してくれない
  const libSrc = join(SITE, "lib", "ayatoArt.ts");
  if (existsSync(libSrc)) writeFileSync(join(work, "ayatoArt.ts"), readFileSync(libSrc, "utf8"));
  writeFileSync(join(work, "goods.ts"), readFileSync(tsPath, "utf8").replace(/@\/lib\//g, "./"));
  try {
    execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
      join(work, "goods.ts"),
      "--outDir", out,
      "--module", "commonjs",
      "--target", "es2022",
      "--strict",
      "--skipLibCheck",
    ], { stdio: "inherit" });
  } catch {
    return null;
  }
  return createRequire(import.meta.url)(join(out, "goods.js"));
}

// ---- 対照 ------------------------------------------------------------------
/**
 * 偽の材料を6通りこしらえて、**自分を子として起こす。**
 * 狙ったところで 1、そろっていれば 0、空なら 2 が出ることを見る。
 */
function drill() {
  const dir = mkdtempSync(join(tmpdir(), "sgsel-drill-"));
  const pub = join(dir, "public", "goods");
  mkdirSync(pub, { recursive: true });
  // 本物の1枚を材料に借りる（560角の webp。寸法を読む手の校正になる）
  const realArt = join(SITE, "public", "goods", "suzuri-tote.webp");
  if (!existsSync(realArt)) return ["材料にする絵が無い: site/public/goods/suzuri-tote.webp"];
  const art = readFileSync(realArt);
  writeFileSync(join(pub, "a.webp"), art);
  writeFileSync(join(pub, "store.webp"), art);
  const size = webpSize(art);
  if (!size) return ["webp の頭を読めない（寸法を読む手が壊れている）"];

  const ts = (goods) => `
export type ShopShot = { src: string; alt: string; w: number; h: number };
export type ShopGoods = { id: number; name: string; shot: ShopShot };
export const shopHref = (id: number) => \`https://suzuri.jp/ayato_arigato/designs/\${id}\`;
export const SUZURI = { href: "x", shot: { src: "/goods/store.webp", alt: "", w: ${size.w}, h: ${size.h} }, cap: "", what: "" };
export const SHOP_GOODS: ShopGoods[] = ${JSON.stringify(goods)};
`;
  const good = [
    { id: 11, name: "あ", shot: { src: "/goods/a.webp", alt: "", w: size.w, h: size.h } },
  ];
  const census = (designs) => JSON.stringify({ takenAt: "2026-01-01", designs });
  const okCensus = [
    { id: 11, title: "あ", published: true, route: "shop" },
    { id: 12, title: `${RESIDENT_HEAD}🦊`, published: true, route: "resident" },
    { id: 13, title: `${STICKER_HEAD}い`, published: true, route: "sticker" },
    { id: 14, title: "", published: false, route: "draft" },
  ];
  const okSpec = [{ key: "k", title: "あ" }];

  /** 1回ぶんの材料を置いて、自分を子として回す。戻るのは終了コード */
  let n = 0;
  const run = (goods, designs, spec, pubDir = join(dir, "public")) => {
    const at = join(dir, `t${n++}`);
    mkdirSync(at, { recursive: true });
    writeFileSync(join(at, "goods.ts"), ts(goods));
    writeFileSync(join(at, "census.json"), census(designs));
    writeFileSync(join(at, "spec.json"), JSON.stringify(spec));
    try {
      execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
        env: {
          ...process.env,
          SG_DRILL: "0",
          SG_GOODS_TS: join(at, "goods.ts"),
          SG_CENSUS: join(at, "census.json"),
          SG_SPEC: join(at, "spec.json"),
          SG_PUBLIC: pubDir,
        },
        stdio: "pipe",
      });
      return 0;
    } catch (e) {
      return e.status ?? -1;
    }
  };

  const bad = [];
  const want = (why, got, expect) => { if (got !== expect) bad.push(`${why}: ${got} が出た（${expect} のはず）`); };

  // そろっていれば通る
  want("そろった材料", run(good, okCensus, okSpec), 0);
  // 1. 台帳の shop が島に並んでいない
  want("台帳の shop が1つ多い",
    run(good, [...okCensus, { id: 99, title: "う", published: true, route: "shop" }], okSpec), 1);
  // 1'. 島に在るのに台帳に無い
  want("島に在るのに台帳に無い",
    run([...good, { id: 77, name: "え", shot: { src: "/goods/a.webp", alt: "", w: size.w, h: size.h } }],
      okCensus, okSpec), 1);
  // 2. route を付け替えて隠す（島には並べず、台帳で住人グッズだと言い張る）
  want("shop を resident と偽る",
    run(good, [...okCensus, { id: 99, title: "う", published: true, route: "resident" }], okSpec), 1);
  // 3. 題が台帳と違う
  want("題が台帳と違う",
    run([{ ...good[0], name: "ちがう" }], okCensus, [{ key: "k", title: "ちがう" }]), 1);
  // 4. 写真が無い（置き場ごと差し替える）
  want("写真が無い", run(good, okCensus, okSpec, join(dir, "からっぽ")), 1);
  // 4'. 寸法が嘘
  want("寸法が嘘",
    run([{ ...good[0], shot: { ...good[0].shot, w: size.w + 7 } }], okCensus, okSpec), 1);
  // 6. 注文書に在るのに島に出ていない
  want("注文書に在るのに島に出ていない",
    run(good, okCensus, [...okSpec, { key: "z", title: "まだ出していないグッズ" }]), 1);
  // 空なら 2
  want("台帳が空", run(good, [], okSpec), 2);
  want("島が空", run([], okCensus.filter((r) => r.route !== "shop"), []), 2);

  return bad;
}

if (process.env.SG_DRILL !== "0") {
  const bad = drill();
  if (bad.length) give(2, `対照が外れた。本物は1つも見ていない\n  ${bad.join("\n  ")}`);
  console.log("# 対照 通った（そろい / 台帳との過不足2通り / route の偽り / 題の食い違い / 写真と寸法2通り / 注文書 / 空2通り）");
}

// ---- 本物を読む ------------------------------------------------------------
const mod = loadGoods(GOODS_TS);
if (!mod) give(2, `${relative(REPO, GOODS_TS)} を組み立てられなかった（上の tsc を見る）`);
const { SHOP_GOODS, SUZURI, shopHref } = mod;
if (!Array.isArray(SHOP_GOODS) || SHOP_GOODS.length === 0) {
  give(2, `${relative(REPO, GOODS_TS)} から SHOP_GOODS を読めなかった`);
}

let census;
try {
  census = JSON.parse(readFileSync(CENSUS, "utf8"));
} catch (e) {
  give(2, `${relative(REPO, CENSUS)} を読めなかった: ${String(e).slice(0, 200)}`);
}
const designs = Array.isArray(census?.designs) ? census.designs : [];
if (designs.length === 0) give(2, `${relative(REPO, CENSUS)} に designs が1件も無い`);

let spec;
try {
  spec = JSON.parse(readFileSync(SPEC, "utf8"));
} catch (e) {
  give(2, `${relative(REPO, SPEC)} を読めなかった: ${String(e).slice(0, 200)}`);
}
if (!Array.isArray(spec)) give(2, `${relative(REPO, SPEC)} が配列ではない`);

const byRoute = {};
for (const d of designs) byRoute[d.route] = (byRoute[d.route] || 0) + 1;
console.log(
  `# 見たもの: ${relative(REPO, GOODS_TS)} の SHOP_GOODS ${SHOP_GOODS.length}件 / ` +
  `台帳（${census.takenAt}）の ${designs.length}件 ` +
  `[${Object.entries(byRoute).map(([k, v]) => `${k} ${v}`).join(" / ")}] / ` +
  `注文書 ${spec.length}件`,
);

/** 公開の道（`/goods/x.webp`）を、配る前のファイルに直す */
const at = (src) => join(PUBLIC, String(src).replace(/^\//, ""));

// ---- 2. 台帳の route が、題と合っているか -----------------------------------
console.log("\n# 2. 台帳の行き先が、題と合っているか");
for (const d of designs) {
  const want = routeOf(d);
  check(`${d.id} route=${d.route}`, d.route === want, `題から決まるのは ${want}`);
}

// ---- 1. 台帳の shop と、島の SHOP_GOODS が過不足なく同じか -------------------
console.log("\n# 1. 島のどこからも行けないものが、ぜんぶ並んでいるか");
const shopIds = designs.filter((d) => d.route === "shop").map((d) => d.id);
const haveIds = SHOP_GOODS.map((g) => g.id);
for (const id of shopIds) {
  const d = designs.find((x) => x.id === id);
  check(`${id}「${d.title}」が並んでいる`, haveIds.includes(id), "島のどこからも辿れない");
}
for (const id of haveIds) {
  check(`${id} が台帳に在る`, shopIds.includes(id),
    designs.some((x) => x.id === id)
      ? `台帳では ${designs.find((x) => x.id === id).route}。ほかの面から行けるなら、ここには重ねない`
      : "SUZURI に無い（消されたか、台帳が古い）");
}

// ---- 3. id のかぶりと、題の食い違い -----------------------------------------
console.log("\n# 3. id がかぶっていないか・題が店と同じ字か");
check("id がかぶっていない", new Set(haveIds).size === haveIds.length,
  `${haveIds.length}件のうち別物は ${new Set(haveIds).size}件`);
for (const g of SHOP_GOODS) {
  const d = designs.find((x) => x.id === g.id);
  if (!d) continue;
  check(`${g.id} の題`, g.name === d.title, `島は「${g.name}」・店は「${d.title}」`);
}
check("リンクの組み立て", typeof shopHref === "function"
  && shopHref(1) === "https://suzuri.jp/ayato_arigato/designs/1",
  `shopHref(1) = ${typeof shopHref === "function" ? shopHref(1) : typeof shopHref}`);

// ---- 4 と 5. 写真が実在して、寸法が合っているか ------------------------------
console.log("\n# 4. 写真が実在して、寸法が合っているか");
for (const shot of [...SHOP_GOODS.map((g) => g.shot), SUZURI?.shot].filter(Boolean)) {
  const f = at(shot.src);
  if (!existsSync(f)) {
    check(`${shot.src}`, false, "絵が無い");
    continue;
  }
  const size = webpSize(readFileSync(f));
  check(`${shot.src}`, !!size && size.w === shot.w && size.h === shot.h,
    size ? `${shot.w}×${shot.h} と書いてあるが、絵は ${size.w}×${size.h}` : "webp の頭を読めない");
}

// ---- 6. 注文書（`tools/goods/goods.json`）が、島に出ているか ------------------
console.log("\n# 6. 作ったグッズが、島に出ているか");
const names = new Set(SHOP_GOODS.map((g) => g.name));
for (const s of spec) {
  check(`注文書「${s.title}」`, names.has(s.title),
    "SUZURI に作ったのに、島の /goods に並んでいない（台帳の取り直しも要る）");
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
