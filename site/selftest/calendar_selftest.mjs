/**
 * **卓上カレンダーを焼く道具（`tools/goods/calbake.py`）の対照が通るか。**
 * あわせて、グッズの面の**いいねの仕掛けが1本のまま**か。
 *
 *     node site/selftest/calendar_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い（対照が外れた・読めなかった）
 *
 * ## 面の表を見るのをやめた（2026-10-14）
 *
 * 前はここで `/goods` の「カレンダー」の欄の月の表（`content/goods.ts` の
 * `CAL_MONTHS`）と、焼いた絵・元絵の食い違いを13の足で見ていた。
 * **その欄は消した**（あやと 2026-10-14「カレンダー検討中の項目は削除して」）。
 * カレンダーは SUZURI に出品して、面では SUZURI の升目の1マスになる。
 * 表が無いので、表と置き場を突き合わせる足も一緒に外した。
 *
 * **焼いた絵（`public/goods/calendar/`）と道具は残っている**（出品と来年のため。
 * `docs/goods-calendar.md`）。だから道具の対照はここで毎 PR 起こし続ける——
 * 外すと、`calbake.py` が**どこからも走らない道具**に戻る
 * （`python/watch_excuses.py` の断りの表が、ここで起こしている前提で外してある）。
 *
 * ## 見ているもの
 *
 *  1. **焼く道具の対照**（`tools/goods/calbake.py --drill`）が通り、表を1日ずらす
 *     （`BREAK=shift`）と 1 で落ちる。絵の右下の一言を重ねない（`BREAK=sign`）・地に溶かす（`BREAK=signdim`）・
 *     2行に戻す（`BREAK=signrows`）と 1 で落ちる。2027-01-01 が金曜、など12か月の曜日の答えは
 *     道具の側が持っている。元絵が無くても回る（2.2秒）
 *  2. **いいねの仕掛けが1本しか無い。** 付箋の口（`heartSticky` ほか）を呼ぶのも、
 *     ハートの形を持つのも `components/goods/wordVotes.tsx` だけで、
 *     LINEスタンプ（`StampVotes.tsx`）はその1本を読んでいる。
 *     **ここは LINEスタンプの守り**——写しの仕掛けが生える道を閉じておく
 *
 * ## わざと壊して、赤くなることを見る
 *
 * 2 の数える手は、**本物を1つも見る前に**こちらで組んだ3枚に当てる
 * （通る側と落ちる側の両方）。外れたら、本物を見ずに 2。
 * 1 は道具の側の対照なので、**折った回が 1 で落ちること**まで見る
 * （通る回だけだと、何も見ていない対照でも通る）。
 *
 * 本物の置き場を差し替えて当てることもできる:
 *
 * ```bash
 * # グッズの部品に、いいねの仕掛けの写しを生やす
 * cp -r site/components/goods /tmp/cal-goods-dir
 * printf 'import { heartSticky } from "@/lib/api";\n' > /tmp/cal-goods-dir/Copy.tsx
 * CAL_GOODS_DIR=/tmp/cal-goods-dir node site/selftest/calendar_selftest.mjs   # → 1
 * ```
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GOODS_DIR = process.env.CAL_GOODS_DIR || join(SITE, "components", "goods");
const BAKER = join(REPO, "tools", "goods", "calbake.py");

/** 仕掛けの置き場（この1本だけが付箋の口を呼ぶ） */
const SHARED = "wordVotes.tsx";
/** 仕掛けを使う側 */
const CALLER = "StampVotes.tsx";
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
  // 仕掛けを数える手。**こちらで組んだ3枚で、通る側と落ちる側の両方**
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
  console.log("# 対照 通った（仕掛けの数え方 3枚）");
}

// ---- 1. 焼く道具の対照（2027年の曜日ほか） ---------------------------------
/* 道具は人が回すものだが、**対照（`--drill`）は元絵が無くても回る**ので、毎 PR で
   起こす（2.2秒。2026-10-12 実測）。曜日の答え（2027-01-01 は金曜、など12か月）・
   名前の決まり・正方形・枠が月をまたいで同じ、を道具そのものに当てる。
   **折った回（`BREAK=shift`。表を1日ずらす）が 1 で落ちることも見る**——
   通る回だけだと、何も見ていない対照でも通る */
console.log("\n# 1. 焼く道具の対照（calbake.py --drill）");
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
/* 一言はふちの無い細い字なので、**地に溶けても重ねたことにはなる**（画素は動く）。
   影を消して字を薄めた回が、字と地の比で落ちることを見る */
const dimmed = drill({ BREAK: "signdim" });
check("一言が地に溶けると calbake.py --drill が 1 で落ちる", dimmed.code === 1,
  `終了コード ${dimmed.code}`);
/* 一言は1行（あやと 2026-10-13「1行にしたい」）。**12月を改行で2行に戻した回**が、
   表の決まりで落ちることを見る。字の出す道が投げて 1 になったのを「拾えた」と読まないように、
   落ちた理由の字まで見る */
const tworows = drill({ BREAK: "signrows" });
check("一言を2行に戻すと calbake.py --drill が 1 で落ちる（1行の決まり）",
  tworows.code === 1 && tworows.out.includes("暦12月の一言に改行がある"),
  `終了コード ${tworows.code}\n${tworows.out.slice(-400)}`);

// ---- 2. いいねの仕掛けが1本しか無いか --------------------------------------
console.log("\n# 2. いいねの仕掛けが1本しか無いか（LINEスタンプの守り）");
const mech = mechanisms(GOODS_DIR);
console.log(`  （見たファイル ${mech.files.length}枚: ${mech.files.join(" / ")}）`);
if (mech.files.length === 0) give(2, `${GOODS_DIR} に部品が1枚も無い`);
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

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (OK === 0) give(2, "数えるものがありませんでした。");
process.exit(BAD ? 1 : 0);
