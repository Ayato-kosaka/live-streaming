/**
 * **「測れなかった」を「合格」と言っていないか**を、毎 PR で確かめる。
 *
 *     node tools/sprites/inkpx_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ、道具の中の対照と別に要るのか
 *
 * `inkpx.mjs` は回るたびに自分で対照を18通す。**あれがいちばん強い**——
 * 本物のブラウザで、長い台（`inkpxfix/long.html`）を本当に送りながら測る。
 * だが**ブラウザと書き出しが要る**ので、毎 PR では回せない
 * （`tools/sprites/node_modules` は CI に入らない。`selftest_runner.py` の注）。
 *
 * すると腐るのは**関門の側**になる。しかも腐ったときに出るのは
 * **「割れ 0」＝緑**で、いちばん合格に見える（`docs/island-standards.md` §15）。
 * 2026-10-07 の実害がちょうどそれだった:
 *
 *   /island/caucasus/streams   拾った字 1,461 / 測れた 0   → 「割れ 0」で緑
 *   /nordic/guide              17,677px の面で 4.5 割れ 45 → **45件ぜんぶまぼろし**
 *
 * だから**ブラウザを1行も使わない部分**（`inkrate.mjs` の関門と、
 * `inkpx.mjs` が撮りかたの決めごとを守っているか）を切り出して、毎 PR で回す。
 *
 * ## 何を見るか
 *
 * 1. **関門の算数**——拾った 0 を「ぜんぶ測れた」にしないこと、下限の前後
 * 2. **終了コードの割り当て**——測れていない面を **0 でも 1 でもなく 2** で返すこと。
 *    **ここが本丸。** 割れの数より先に分母を見る並びになっているかまで見る
 * 3. **撮りかたの決めごと**（`CLAUDE.md`「つまずきやすいところ」の5つ）が
 *    `inkpx.mjs` に残っていること——面ぜんぶを1枚に撮らない・島を止める・
 *    dpr は 2 以上・中央値で決める・字の色は描かれた画素から
 * 4. **長い台が本当に長い**こと——`content-visibility: auto` の段と、
 *    画面より背の高い字が置いてあること。台が痩せると、道具の中の対照が
 *    黙って何も守らなくなる
 * 5. **わざと壊すと赤くなる**こと（2通り）
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=nofloor node tools/sprites/inkpx_selftest.mjs   # 1 で落ちる
 *     BREAK=badcode node tools/sprites/inkpx_selftest.mjs   # 1 で落ちる
 *
 *   nofloor  下限を見ない関門に差し替える（測れていなくても素通り）
 *   badcode  測れていない面を 2 ではなく 0 で返す割り当てに差し替える
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FLOOR, exitCode, rate, thin } from "./inkrate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BREAK = process.env.BREAK || "";

/** わざと壊した関門。**本物と同じ名前で呼べる形**にして差し替える */
const G = {
  // 下限を見ない＝測れていなくても素通り（直す前の返しかた）
  thin: BREAK === "nofloor" ? () => [] : thin,
  // 測れていない面を 2 ではなく 0 で返す（「測れなかった」を「合格」と言う）
  exitCode: BREAK === "badcode"
    ? ({ bad }) => (bad > 0 ? 1 : 0)
    : exitCode,
};

let OK = 0, BAD = 0, SEEN = 0;
const fails = [];

function check(name, cond, note = "") {
  SEEN++;
  if (cond) { OK++; } else { BAD++; fails.push(name); }
  console.log(`  ${cond ? "○" : "✕"} ${name}${note ? `  ${note}` : ""}`);
}

const src = readFileSync(join(HERE, "inkpx.mjs"), "utf8");
const longFix = readFileSync(join(HERE, "inkpxfix", "long.html"), "utf8");

console.log("=== 字の濃さの道具が、測れなかったものを合格と言っていないか ===");

console.log("\n[1] 関門の算数（inkrate.mjs）");
check("拾った 0 は「ぜんぶ測れた」ではなく 0", rate(0, 0) === 0);
check("1,461 拾って 0 測れたら 0.00（実害の値）", rate(1461, 0) === 0);
check("120 拾って 120 測れたら 1.00", rate(120, 120) === 1);
check("割合は 1 を越えない", rate(10, 99) === 1);
check(`既定の下限は ${FLOOR}`, FLOOR === 0.9);
check("下限ちょうどは通す", thin([{ path: "/a", picked: 100, measured: 90 }], 0.9).length === 0);
check("下限を1件割ったら挙げる", thin([{ path: "/a", picked: 100, measured: 89 }], 0.9).length === 1);
check("下限 0 なら素通り（BREAK=nofloor 用の口）", thin([{ path: "/a", picked: 100, measured: 0 }], 0).length === 0);
check(
  "実害の2面を、両方とも挙げる",
  G.thin([
    { path: "/island/caucasus/streams", picked: 1461, measured: 0 },
    { path: "/nordic/guide", picked: 355, measured: 160 },
  ], FLOOR).length === 2,
);

console.log("\n[2] 終了コード（ここが本丸。0 と 1 と 2 を同じ顔で返さない）");
check(
  "測れた 0・割れ 0 は、**緑ではなく 2**（直す前はここが 0 だった）",
  G.exitCode({ thin: G.thin([{ path: "/x", picked: 1461, measured: 0 }], FLOOR).length, measured: 0, bad: 0 }) === 2,
);
check(
  "測れた割合が足りない面は、割れが出ていても 2（まぼろしの赤を出さない）",
  G.exitCode({ thin: G.thin([{ path: "/x", picked: 355, measured: 160 }], FLOOR).length, measured: 160, bad: 45 }) === 2,
);
check("ぜんぶ測れていて割れがあれば 1", G.exitCode({ thin: 0, measured: 120, bad: 3 }) === 1);
check("ぜんぶ測れていて割れが無ければ 0", G.exitCode({ thin: 0, measured: 120, bad: 0 }) === 0);
check("開けなかった面があれば 2", G.exitCode({ missing: 1, thin: 0, measured: 120, bad: 0 }) === 2);
check("1か所も測れていなければ 2", G.exitCode({ thin: 0, measured: 0, bad: 0 }) === 2);

console.log("\n[3] 撮りかたの決めごと（CLAUDE.md「つまずきやすいところ」）");
/* 注の中には `fullPage` の話が残っている（なぜやめたかの記録）。
   見るのは**撮るところ**だけ */
check("面ぜんぶを1枚に撮らない（撮るところに fullPage が無い）",
  !/screenshot\(\{[^}]*fullPage/.test(src));
check("窓を送って撮る（scrollTo で動かしている）", /window\.scrollTo\(0, yy\)/.test(src));
check("島を止めてから撮る（freeze.mjs を当てている）", /freeze\.mjs/.test(src));
check("dpr の既定は 2 以上", Number(/DPR \|\| (\d+)/.exec(src)?.[1]) >= 2);
check("字の色は描かれた画素から（declared を既定にしていない）", /declared: skip\.declared/.test(src) && !/declared: true/.test(src));
check("関門は inkrate.mjs から呼ぶ（道具の中で割り算を書き直さない）", /from "\.\/inkrate\.mjs"/.test(src));
check("長い台を道具の対照に通している", /long\.html/.test(src));
check("測れた割合を報告に出す", /測れた字/.test(src) && /%/.test(src));
check("窓に収まらなかった数も出す", /窓に収まらず/.test(src));
check("BREAK=noband がある（送らない足を折れる）", /noband/.test(src));
check("BREAK=nofloor がある（関門を外す足を折れる）", /nofloor/.test(src));

console.log("\n[4] 長い台が、ちゃんと長いか（台が痩せると対照が何も守らない）");
const cv = (longFix.match(/content-visibility:\s*auto/g) || []).length;
check("content-visibility: auto の段がある", cv >= 1, `${cv}か所`);
check("畳まれた段の中に、割れてほしい字がある", /ik-cv-bad/.test(longFix));
check("同じ段の中に、割れてはいけない字がある", /ik-cv-ok/.test(longFix));
check("画面より背の高い字がある", /ik-tall/.test(longFix));
const gaps = (longFix.match(/class="gap"/g) || []).length;
check("画面（844px）の何枚ぶんも背がある", gaps >= 4, `隙間 ${gaps}か所 × 1100px`);
check("台の class の名前は、道具の表と揃っている",
  ["ik-cv-bad", "ik-cv-ok", "ik-tall"].every((n) => src.includes(n) && longFix.includes(n)));

console.log();
if (SEEN === 0) { console.log("✕ 1件も見ていません（数えるものが無い）"); process.exit(2); }
if (BAD) {
  console.log(`✕ ${SEEN}件中 ${BAD}件 落ちました${BREAK ? `（BREAK=${BREAK}）` : ""}: ${fails.join(" / ")}`);
  process.exit(1);
}
console.log(`○ ${SEEN}件ぜんぶ通りました（関門の算数・終了コード・撮りかたの決めごと・台の中身）`);
process.exit(0);
