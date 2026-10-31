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
 * ## ここが見ていないこと
 *
 * **`resident` の判定は題の頭だけ。** 「カサ・アヤトの住人 ◯」で始まってさえ
 * いれば通るので、**島に居ない誰かの住人グッズを作ると、どこからも行けない
 * ままここは黙る。** 島の名簿（`site/content/residents.ts`）は毎晩焼き直される
 * ので、ここから読むと判定が晩ごとに揺れる。
 * **いまのところ住人グッズを作るのは毎晩の `characters` だけ**で、あちらは
 * 島に居る人しか作らない。手で住人グッズを作ったら、台帳に `note` を足す。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 本物を1つも見る前に、**判定が落ちられるか**を11通り当てる。
 * 偽の名簿・偽の台帳・偽の注文書・偽の置き場をこしらえて `judge()` に渡し、
 * **狙ったところで 1、そろっていれば 0、材料が空なら 2** が出るのを見る。
 * 1つでも外れたら、本物の数字を1つも出さずに 2 で帰る。
 *
 * **対照は子プロセスを起こさない。** `judge()` をその場で呼ぶ。
 * 1件ずつ自分を起こし直す形も書いてみたが、**1回につき tsc が1本**要るので
 * 11本になり、箱が混んでいると見張り1本の持ち時間（`selftest_runner.py` の
 * `TIMEOUT_SEC` = 300秒）に届きかねない。tsc を通すのは本物の
 * `goods.ts` を読む1回だけでよく、**対照が確かめたいのは判定のほう**なので、
 * 組み立て済みの値を直に渡す。
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
/** 売り場の URL。`goods.ts` の `shopHref` と**同じ字でなければならない** */
const HREF = (id) => `https://suzuri.jp/ayato_arigato/designs/${id}`;

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

// ---- 判定 ------------------------------------------------------------------
/**
 * 組み立て済みの材料を見て、`{ code, ok, bad, lines }` を返す。
 *
 * **ここが見張りの中身ぜんぶ。** 本物も対照も、同じこの関数を通る
 * （対照だけ別の道を通ると、対照が通っても本物が守れていないことがある）。
 */
function judge({ goods, storeShot, href, designs, spec, publicDir }) {
  const lines = [];
  let ok = 0;
  let bad = 0;
  const say = (s) => lines.push(s);
  const check = (name, good, why = "") => {
    if (good) { ok++; say(`  ok   ${name}`); return; }
    bad++; say(`  NG   ${name}${why ? ` — ${why}` : ""}`);
  };

  // 数えるものが無いなら、1つも見ずに 2（`docs/island-standards.md` §15）
  if (!Array.isArray(goods) || goods.length === 0) return { code: 2, ok, bad, lines, why: "SHOP_GOODS が空" };
  if (!Array.isArray(designs) || designs.length === 0) return { code: 2, ok, bad, lines, why: "台帳に designs が1件も無い" };
  if (!Array.isArray(spec)) return { code: 2, ok, bad, lines, why: "注文書が配列ではない" };

  /** 公開の道（`/goods/x.webp`）を、配る前のファイルに直す */
  const at = (src) => join(publicDir, String(src).replace(/^\//, ""));

  say("\n# 2. 台帳の行き先が、題と合っているか");
  for (const d of designs) {
    const want = routeOf(d);
    check(`${d.id} route=${d.route}`, d.route === want, `題から決まるのは ${want}`);
  }

  say("\n# 1. 島のどこからも行けないものが、ぜんぶ並んでいるか");
  const shopIds = designs.filter((d) => d.route === "shop").map((d) => d.id);
  const haveIds = goods.map((g) => g.id);
  for (const id of shopIds) {
    const d = designs.find((x) => x.id === id);
    check(`${id}「${d.title}」が並んでいる`, haveIds.includes(id), "島のどこからも辿れない");
  }
  for (const id of haveIds) {
    const d = designs.find((x) => x.id === id);
    check(`${id} が台帳に在る`, shopIds.includes(id),
      d ? `台帳では ${d.route}。ほかの面から行けるなら、ここには重ねない`
        : "SUZURI に無い（消されたか、台帳が古い）");
  }

  say("\n# 3. id がかぶっていないか・題が店と同じ字か");
  check("id がかぶっていない", new Set(haveIds).size === haveIds.length,
    `${haveIds.length}件のうち別物は ${new Set(haveIds).size}件`);
  for (const g of goods) {
    const d = designs.find((x) => x.id === g.id);
    if (!d) continue;
    check(`${g.id} の題`, g.name === d.title, `島は「${g.name}」・店は「${d.title}」`);
  }
  check("リンクの組み立て", typeof href === "function" && href(1) === HREF(1),
    `href(1) = ${typeof href === "function" ? href(1) : typeof href}`);

  say("\n# 4. 写真が実在して、寸法が合っているか");
  for (const shot of [...goods.map((g) => g.shot), storeShot].filter(Boolean)) {
    const f = at(shot.src);
    if (!existsSync(f)) { check(`${shot.src}`, false, "絵が無い"); continue; }
    const size = webpSize(readFileSync(f));
    check(`${shot.src}`, !!size && size.w === shot.w && size.h === shot.h,
      size ? `${shot.w}×${shot.h} と書いてあるが、絵は ${size.w}×${size.h}` : "webp の頭を読めない");
  }

  say("\n# 6. 作ったグッズが、島に出ているか");
  const names = new Set(goods.map((g) => g.name));
  for (const s of spec) {
    check(`注文書「${s.title}」`, names.has(s.title),
      "SUZURI に作ったのに、島の /goods に並んでいない（台帳の取り直しも要る）");
  }

  return { code: bad ? 1 : 0, ok, bad, lines };
}

// ---- 対照 ------------------------------------------------------------------
/** 偽の材料を11通り当てて、狙ったところで落ちることを見る */
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
  // 絵のつもりで置いた webp でないもの。**「在る」だけでは通らないことを見る**
  writeFileSync(join(pub, "notwebp.webp"), Buffer.from("これは webp ではない"));

  const shot = (src) => ({ src, alt: "", w: size.w, h: size.h });
  const store = shot("/goods/store.webp");
  const good = [{ id: 11, name: "あ", shot: shot("/goods/a.webp") }];
  const okCensus = [
    { id: 11, title: "あ", published: true, route: "shop" },
    { id: 12, title: `${RESIDENT_HEAD}🦊`, published: true, route: "resident" },
    { id: 13, title: `${STICKER_HEAD}い`, published: true, route: "sticker" },
    { id: 14, title: "", published: false, route: "draft" },
  ];
  const okSpec = [{ key: "k", title: "あ" }];
  const run = (o) => judge({
    goods: good, storeShot: store, href: HREF,
    designs: okCensus, spec: okSpec, publicDir: join(dir, "public"), ...o,
  }).code;

  const bad = [];
  const want = (why, got, expect) => { if (got !== expect) bad.push(`${why}: ${got} が出た（${expect} のはず）`); };

  want("そろった材料", run({}), 0);
  // 1. 台帳の shop が島に並んでいない
  want("台帳の shop が1つ多い",
    run({ designs: [...okCensus, { id: 99, title: "う", published: true, route: "shop" }] }), 1);
  // 1'. 島に在るのに台帳に無い
  want("島に在るのに台帳に無い",
    run({ goods: [...good, { id: 77, name: "え", shot: shot("/goods/a.webp") }] }), 1);
  // 2. route を付け替えて隠す（島に並べず、台帳では住人グッズだと言い張る）
  want("shop を resident と偽る",
    run({ designs: [...okCensus, { id: 99, title: "う", published: true, route: "resident" }] }), 1);
  // 2'. 非公開なのに売れることになっている
  want("非公開を shop と偽る",
    run({ designs: okCensus.map((r) => (r.id === 14 ? { ...r, route: "shop" } : r)) }), 1);
  // 3. 題が台帳と違う
  want("題が台帳と違う",
    run({ goods: [{ ...good[0], name: "ちがう" }], spec: [{ key: "k", title: "ちがう" }] }), 1);
  // 3'. id がかぶる
  want("id がかぶる",
    run({ goods: [good[0], { ...good[0], name: "あ" }] }), 1);
  // 3''. リンクの組み立てがずれる
  want("リンクの組み立てがずれる", run({ href: (id) => `https://suzuri.jp/${id}` }), 1);
  // 4. 写真が無い（置き場ごと差し替える）
  want("写真が無い", run({ publicDir: join(dir, "からっぽ") }), 1);
  // 4'. 寸法が嘘
  want("寸法が嘘", run({ goods: [{ ...good[0], shot: { ...good[0].shot, w: size.w + 7 } }] }), 1);
  // 4''. 在るが webp ではない
  want("絵が webp ではない",
    run({ goods: [{ ...good[0], shot: shot("/goods/notwebp.webp") }] }), 1);
  // 6. 注文書に在るのに島に出ていない
  want("注文書に在るのに島に出ていない",
    run({ spec: [...okSpec, { key: "z", title: "まだ出していないグッズ" }] }), 1);
  // 空なら 2
  want("台帳が空", run({ designs: [] }), 2);
  want("島が空", run({ goods: [] }), 2);

  return bad;
}

const bad = drill();
if (bad.length) give(2, `対照が外れた。本物は1つも見ていない\n  ${bad.join("\n  ")}`);
console.log(
  "# 対照 通った（そろい / 台帳との過不足2通り / route の偽り2通り / 題・かぶり・リンク3通り / " +
  "写真3通り / 注文書 / 空2通り）",
);

// ---- 本物を読む ------------------------------------------------------------
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

const mod = loadGoods(GOODS_TS);
if (!mod) give(2, `${relative(REPO, GOODS_TS)} を組み立てられなかった（上の tsc を見る）`);

let census;
try {
  census = JSON.parse(readFileSync(CENSUS, "utf8"));
} catch (e) {
  give(2, `${relative(REPO, CENSUS)} を読めなかった: ${String(e).slice(0, 200)}`);
}
let spec;
try {
  spec = JSON.parse(readFileSync(SPEC, "utf8"));
} catch (e) {
  give(2, `${relative(REPO, SPEC)} を読めなかった: ${String(e).slice(0, 200)}`);
}

const designs = Array.isArray(census?.designs) ? census.designs : [];
const byRoute = {};
for (const d of designs) byRoute[d.route] = (byRoute[d.route] || 0) + 1;
console.log(
  `# 見たもの: ${relative(REPO, GOODS_TS)} の SHOP_GOODS ${(mod.SHOP_GOODS || []).length}件 / ` +
  `台帳（${census?.takenAt}）の ${designs.length}件 ` +
  `[${Object.entries(byRoute).map(([k, v]) => `${k} ${v}`).join(" / ")}] / ` +
  `注文書 ${Array.isArray(spec) ? spec.length : "?"}件`,
);

const r = judge({
  goods: mod.SHOP_GOODS,
  storeShot: mod.SUZURI?.shot,
  href: mod.shopHref,
  designs,
  spec,
  publicDir: PUBLIC,
});
if (r.code === 2) give(2, `数えるものが無い: ${r.why}`);
console.log(r.lines.join("\n"));
console.log(`\n通った ${r.ok} / 落ちた ${r.bad}`);
process.exit(r.code);
