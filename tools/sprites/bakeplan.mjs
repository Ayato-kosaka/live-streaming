/**
 * Actions で焼く前に、**頼まれた名前が manifest に在るか**と、**どのキットを落とせばよいか**を決める。
 *
 *     node tools/sprites/bakeplan.mjs tools/sprites/bake-request.json
 *     node tools/sprites/bakeplan.mjs --names food-cheese-cut --check food-pepper
 *
 * 終了コード 0=焼ける / 1=名前がおかしい・manifest に無い / 2=焼くものが無い。
 * `GITHUB_OUTPUT` があれば names / check / kits を書く（`.github/workflows/bake_sprites.yml`）。
 *
 * ## なぜ要るか
 *
 * 素材（Kenney のキット）は作業箱から落とせない（kenney.nl にプロキシで届かない）。
 * Actions で焼くと1回に数分かかるので、**名前の打ち間違いで空回りしない**ように、
 * ランナーが素材を落とす前にここで止める。
 *
 * キットは5つあり、焼く絵が使うものだけ落とせば足りる。どの絵がどのキットを使うかは
 * manifest.mjs の部品の置き場（NK / HK / BK / FK）で決まっているので、名前の表を別に持たずに
 * そこから引く。表を持つと、絵が増えたとき表だけ古くなる。
 */
import fs from "node:fs";
import { SPRITES } from "./manifest.mjs";

// 名前はそのままシェルに渡るので、manifest の名前に使われている字だけを通す
const NAME = /^[a-z0-9][a-z0-9-]*$/;

function parseArgs(argv) {
  if (argv.length === 1 && argv[0].endsWith(".json")) {
    const req = JSON.parse(fs.readFileSync(argv[0], "utf8"));
    return { names: req.names ?? [], check: req.check ?? [] };
  }
  const out = { names: [], check: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (!(key in out)) throw new Error(`知らない引数: ${argv[i]}`);
    out[key] = String(argv[i + 1] ?? "").split(/[,\s]+/);
  }
  return out;
}

const clean = (xs) => [...new Set(xs.map((x) => String(x).trim()).filter(Boolean))];

/** 部品の置き場 → キットの名前。manifest.mjs の NK / HK / BK / FK と同じ並び */
function kitOf(url) {
  if (!url || !url.startsWith("./models/")) return null; // 箱や円盤だけの絵はキットが要らない
  if (url.startsWith("./models/gltf/")) return "nature-kit";
  if (url.startsWith("./models/holiday/")) return "holiday-kit";
  if (url.startsWith("./models/food/")) return "food-kit";
  // building-kit と mini-characters は同じ置き場。住人だけ character- で始まる
  if (url.startsWith("./models/character-")) return "mini-characters";
  return "building-kit";
}

let req;
try {
  req = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
const names = clean(req.names);
const check = clean(req.check).filter((n) => !names.includes(n));

if (!names.length) {
  console.error("焼く名前（names）が空");
  process.exit(2);
}

const bases = new Map(SPRITES.filter((s) => !s.name.startsWith("hero/")).map((s) => [s.name, s]));
const heroes = new Set(SPRITES.filter((s) => s.name.startsWith("hero/")).map((s) => s.name.slice(5)));

let bad = 0;
const kits = new Set();
for (const n of [...names, ...check]) {
  if (!NAME.test(n)) {
    console.error(`✕ 名前に使えない字がある: ${JSON.stringify(n)}`);
    bad++;
    continue;
  }
  const s = bases.get(n);
  if (!s) {
    console.error(`✕ manifest.mjs に無い: ${n}`);
    bad++;
    continue;
  }
  for (const p of s.parts) {
    const k = kitOf(typeof p === "string" ? p : p.url);
    if (k) kits.add(k);
  }
  const role = names.includes(n) ? "焼いてコミット" : "見比べるだけ";
  console.log(`  ${n}  ${role}${heroes.has(n) ? "（hero/ も焼く）" : ""}`);
}
if (bad) process.exit(1);

const kitList = [...kits].sort();
console.log(`落とすキット: ${kitList.join(" ") || "（なし）"}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `names=${names.join(",")}\ncheck=${check.join(",")}\nkits=${kitList.join(" ")}\n`,
  );
}
