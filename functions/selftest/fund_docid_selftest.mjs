/**
 * **書類IDの式が、Python と TypeScript で1文字も違わないこと。**
 *
 * ## なぜこの見張りが要るか
 *
 * 台帳（`islandFundSuperChats` / `islandFundSpends`）に書く口が2つある。
 *
 * | 誰が | どこ |
 * | --- | --- |
 * | GitHub Actions | `python/admin/fund_add.py` → `python/fund_box.py` |
 * | あやとの机（`/me/desk`） | `functions/src/fundDesk.ts` |
 *
 * **「2回入れても増えない」は、書類IDが中身から決まることで成り立って
 * いる。** 出どころが違っても同じIDに着くから、同じ書類に上書きされる。
 *
 * ところが式が2つの言語に写してある。**片方だけ直した日に、同じ支出が
 * 2件になって貯金箱の額が変わる。** しかも赤くならない——どちらの側も
 * 単体では正しく動くので、気づけるのは額を数えた人だけ。
 *
 * 言語が違うので式を1本にはできない。**だから、同じ入力を両方に食わせて
 * 答えを突き合わせる。** 写しであることを、機械が見張る。
 *
 * ## 見るもの
 *
 * - 出費の書類ID（`spend_id` / `spendId`）
 * - 手入れのスパチャの書類ID（`manual_id` / `manualId`）
 * - 二重よけの札（`claim_key` / `claimKey`）
 * - **貯金箱に入るのはスパチャの半分**（`fund_box.box` の `// 2` と、
 *   焼き直しの `Math.floor(full / SUPERCHAT_RATE)`）
 *
 * 入力は**日本語・空文字・記号・奇数円**まで入れてある。sha1 は UTF-8 の
 * バイト列を食うので、**片方が UTF-16 で潰すと日本語のところだけ割れる。**
 *
 * ```bash
 * node functions/selftest/fund_docid_selftest.mjs
 * ```
 *
 * 0＝通った / 1＝食い違った / 2＝数えるものが無い
 */

import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync}
  from "node:fs";
import {tmpdir} from "node:os";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const REPO = join(FUNCTIONS, "..");
const LIB = process.env.FUND_LIB_DIR || join(FUNCTIONS, "lib");
const BUILD = !process.env.FUND_LIB_DIR;
const CONTROL = !process.env.FUND_LIB_DIR;

let ok = 0;
let bad = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} good 通ったか
 * @param {string} [why] 落ちたときに出す中身（**偽の字だけ**）
 */
function check(name, good, why = "") {
  if (good) {
    ok += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

if (BUILD) {
  console.log("# tsc を回して、いまの src から読み込む");
  execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), {cwd: FUNCTIONS});
} else {
  console.log(`# 差し替えた lib で回す: ${LIB}`);
}

/* ---------------- 突き合わせる入力（ぜんぶ偽の字） ---------------- */

/** [日付, 題, 円]。**題に日本語・記号・空白を混ぜる**（UTF-8 の潰し方） */
const SPENDS = [
  ["2026-05-21", "ドネルこれまでの退避", 156056],
  ["2026-09-12", "宿代", 4000],
  ["2026-01-01", "a", 1],
  ["2024-02-29", "うるう日の宿｜パイプ入り", 7],
  ["2026-12-31", "Caffè & Bar", 999],
  ["2026-07-04", "７月のアプリ運営費", 30801],
];

/** [日付, 円, 名前]。**名前は空でもよい**（分からない晩がある） */
const CHATS = [
  ["2026-09-10", 1000, "さくら"],
  ["2026-09-10", 1000, ""],
  ["2026-08-26", 1001, "ゆずたつ-q3n"],
  ["2026-02-29", 500, "＠全角"],
  ["2026-11-03", 3, "a|b"],
];

/* ---------------- TypeScript 側 ---------------- */

const nodeRequire = createRequire(import.meta.url);

/**
 * `lib/fundDesk.js` を、偽の firebase-admin で読み込む。
 * **本番の置き場には1バイトも触らない。**
 * @return {object} 書き出された関数
 */
function loadTs() {
  const file = join(LIB, "fundDesk.js");
  const src = readFileSync(file, "utf8");
  const mod = {exports: {}};
  const db = {collection: () => ({doc: () => ({})})};
  const admin = {
    apps: [],
    initializeApp: () => {
      admin.apps.push({});
    },
    firestore: Object.assign(() => db, {
      FieldPath: {documentId: () => ({})},
      AggregateField: {count: () => ({}), sum: () => ({})},
    }),
  };
  const req = (id) => {
    if (id === "firebase-admin") return admin;
    if (id === "firebase-functions") return {logger: {warn() {}, info() {}}};
    return nodeRequire(id);
  };
  new Function(
    "require", "exports", "module", "__filename", "__dirname", src,
  )(req, mod.exports, mod, file, dirname(file));
  return mod.exports;
}

const ts = loadTs();
for (const f of ["spendId", "manualId", "claimKey"]) {
  if (typeof ts[f] !== "function") {
    console.error(`lib/fundDesk.js から ${f} を取り出せなかった`);
    process.exit(2);
  }
}

/* ---------------- Python 側 ---------------- */

/** `python/fund_box.py` に同じ入力を食わせて、答えを JSON で返させる。 */
const PY = `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(REPO, "python"))})
import fund_box as fb
args = json.load(sys.stdin)
print(json.dumps({
  "spends": [fb.spend_id(d, t, y) for d, t, y in args["spends"]],
  "chats": [fb.manual_id(d, y, w) for d, y, w in args["chats"]],
  "claims": [fb.claim_key(d, y) for d, y, _ in args["chats"]],
  "rate": fb.SUPERCHAT_RATE,
  "box": [fb.box(f, 0, s) for f, s in args["box"]],
  "start": [fb.start_amount(s) for s in args["start"]],
}, ensure_ascii=False))
`;

/** 貯金箱の式を突き合わせる入力。[スパチャの合計, 支出の合計]。奇数を混ぜる */
const BOX = [[1501, 4400], [0, 0], [3, 0], [341916, 255406]];
const START = [0, 1, 255406];

const py = spawnSync("python3", ["-c", PY], {
  input: JSON.stringify({spends: SPENDS, chats: CHATS, box: BOX, start: START}),
  encoding: "utf8",
});
if (py.status !== 0) {
  console.error("python/fund_box.py を回せなかった:", (py.stderr ?? "").slice(0, 400));
  process.exit(2);
}
const want = JSON.parse(py.stdout);

/* ---------------- 突き合わせ ---------------- */

console.log("\n# 出費の書類ID（`spend_id` ⇄ `spendId`）");
{
  let ng = [];
  SPENDS.forEach(([d, t, y], i) => {
    const got = ts.spendId(d, t, y);
    if (got !== want.spends[i]) ng.push(`${d}/${t}: ${got} ≠ ${want.spends[i]}`);
  });
  check(`${SPENDS.length}件とも同じID`, ng.length === 0, ng.join(" / "));
}

console.log("\n# 手入れのスパチャの書類ID（`manual_id` ⇄ `manualId`）");
{
  let ng = [];
  CHATS.forEach(([d, y, w], i) => {
    const got = ts.manualId(d, y, w);
    if (got !== want.chats[i]) ng.push(`${d}/${w}: ${got} ≠ ${want.chats[i]}`);
  });
  check(`${CHATS.length}件とも同じID`, ng.length === 0, ng.join(" / "));
}

console.log("\n# 二重よけの札（`claim_key` ⇄ `claimKey`）");
{
  let ng = [];
  CHATS.forEach(([d, y], i) => {
    const got = ts.claimKey(d, y);
    if (got !== want.claims[i]) ng.push(`${d}: ${got} ≠ ${want.claims[i]}`);
  });
  check(`${CHATS.length}件とも同じ札`, ng.length === 0, ng.join(" / "));
  check("日付が無ければ札を付けない（両方とも空）",
    ts.claimKey("", 500) === "", JSON.stringify(ts.claimKey("", 500)));
}

console.log("\n# 貯金箱の式（`fund_box.box` ⇄ 焼き直し）");
{
  const lib = readFileSync(join(LIB, "fundDesk.js"), "utf8");
  const m = /SUPERCHAT_RATE = (\d+)/.exec(lib);
  check("「÷ いくつ」が同じ", !!m && Number(m[1]) === want.rate,
    `ts=${m?.[1]} py=${want.rate}`);
  /* **足してから半分にする。** 1件ずつ半分にすると、奇数円のスパチャの
     数だけ豚とずれる（`python/fund_box.py` の頭）。 */
  let ng = [];
  BOX.forEach(([full, spend], i) => {
    const got = Math.floor(full / Number(m?.[1] ?? 0)) - spend;
    if (got !== want.box[i]) ng.push(`${full}/${spend}: ${got} ≠ ${want.box[i]}`);
  });
  check(`${BOX.length}とおりとも同じ額（奇数を含む）`, ng.length === 0,
    ng.join(" / "));
  let ngs = [];
  START.forEach((s, i) => {
    if (-s !== want.start[i]) ngs.push(`${s}: ${-s} ≠ ${want.start[i]}`);
  });
  check("起点の符号も同じ（0 を含む）", ngs.length === 0, ngs.join(" / "));
}

/* ---------------- 対照 ---------------- */

/** [名前, 探す字, 置き換える字, 落ちてほしい確かめ] */
const BREAKS = [
  [
    "出費のIDの種を変える",
    "`${day}|${title}|${yen}`",
    "`${day}|${title}|${yen}|x`",
    `${SPENDS.length}件とも同じID`,
  ],
  [
    "スパチャのIDの並びを変える",
    "sha8(`${day}|${yen}|${who}`)",
    "sha8(`${day}|${who}|${yen}`)",
    `${CHATS.length}件とも同じID`,
  ],
  [
    "札の区切りを変える",
    "day ? `${day}|${yen}` : \"\"",
    "day ? `${day}-${yen}` : \"\"",
    `${CHATS.length}件とも同じ札`,
  ],
  [
    "「÷ いくつ」を変える",
    "const SUPERCHAT_RATE = 2;",
    "const SUPERCHAT_RATE = 3;",
    "「÷ いくつ」が同じ",
  ],
];

if (CONTROL) {
  console.log("\n# 対照（壊した写しで回して、狙った行が赤くなるか）");
  const src = readFileSync(join(LIB, "fundDesk.js"), "utf8");
  /**
   * `lib` の写しを作る。
   * @param {string|null} broken 壊した `fundDesk.js`。null ならそのまま
   * @return {string} 写しの置き場
   */
  const copyLib = (broken) => {
    const box = mkdtempSync(join(tmpdir(), "funddocid-"));
    cpSync(LIB, box, {recursive: true});
    try {
      symlinkSync(join(FUNCTIONS, "node_modules"), join(box, "node_modules"));
    } catch {
      /* 既に在るなら、そのまま */
    }
    if (broken !== null) writeFileSync(join(box, "fundDesk.js"), broken, "utf8");
    return box;
  };
  {
    const box = copyLib(null);
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    check("壊していない写しは緑のまま", run.status === 0,
      `終了コード ${run.status} / ${(run.stdout ?? "").slice(-200)}`);
  }
  for (const [what, from, to, wantRow] of BREAKS) {
    if (!src.includes(from)) {
      check(`${what}: 壊す字が当たる`, false,
        `lib/fundDesk.js に「${from}」が無い`);
      continue;
    }
    const box = copyLib(src.replace(from, to));
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: {...process.env, FUND_LIB_DIR: box},
      encoding: "utf8",
    });
    rmSync(box, {recursive: true, force: true});
    const hit = (run.stdout ?? "").includes(`NG   ${wantRow}`);
    check(`${what}: 「${wantRow}」が赤くなる`, run.status === 1 && hit,
      `終了コード ${run.status} / その行が赤い: ${hit}`);
  }
}

console.log(`\n通った ${ok}件 / 落ちた ${bad}件`);
if (ok === 0) {
  console.log("数えるものが1件も無かった。");
  process.exit(2);
}
process.exit(bad ? 1 : 0);
