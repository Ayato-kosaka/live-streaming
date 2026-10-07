/**
 * **帯送りの側が、縮んだ分母で「合格」と言っていないか**を、毎 PR で確かめる。
 *
 *     node tools/sprites/inkband_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るのか（`inkpx_selftest.mjs` と別に）
 *
 * 2026-10-07 に `inkpx.mjs` の分母を直して、関門（`inkrate.mjs`）を置いた。
 * **`inkband.mjs` には、その関門が入らなかった。** あちらは
 *
 *   - 「拾った字／測れた字」を**報告には出す**が、**割合で止まらない**
 *   - 窓が画面（844px）に固定で、**どの帯にも収まらない字を分母に入れない**
 *
 * ので、**縮んだ分母のまま 100% に見えていた。** 実測（`/nordic/guide`）:
 *
 *   直す前          拾った 337 / 測れた 337 → 100%（緑）
 *   分母を出した     拾った 502 / 測れた 344 → **69%**（2 で止まる）
 *   送り方も直した   拾った 503 / 測れた 503 → 100%（`inkpx.mjs` と同数）
 *
 * **同じ穴が2本の道具に別々に開く。** 片方を直したときに、もう片方は
 * 誰も見ていない。だから**道具ごとに**毎 PR で回す見張りを置く。
 *
 * 道具そのものの対照（`inkbandfix/fix.html` を本物のブラウザで測る 25件）が
 * いちばん強いが、**ブラウザと書き出しが要る**ので毎 PR では回せない
 * （`tools/sprites/node_modules` は CI に入らない）。ここはブラウザを
 * 1行も使わない部分——関門の算数と、道具が決めごとを守っているか——を見る。
 *
 * ## 何を見るか
 *
 * 1. **縮んだ分母で通らない**（本丸）。収まらなかった字を分母に入れれば
 *    止まり、入れなければ通ってしまうことを、両方の計算で見る
 * 2. **終了コードの割り当て**——0 と 1 と 2 を同じ顔で返さない
 * 3. **`inkband.mjs` が関門を呼んでいる**こと。**分母を、収まるかを見る
 *    手前で足している**こと（ここが逆だと、黙って縮む）
 * 4. **対照の台に、この道具で測れない字が置いてある**こと（台が痩せると
 *    道具の中の対照が何も守らなくなる）
 * 5. **わざと壊すと赤くなる**こと（2通り）
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=nofloor node tools/sprites/inkband_selftest.mjs   # 1 で落ちる
 *     BREAK=badcode node tools/sprites/inkband_selftest.mjs   # 1 で落ちる
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
  thin: BREAK === "nofloor" ? () => [] : thin,
  exitCode: BREAK === "badcode" ? ({ bad }) => (bad > 0 ? 1 : 0) : exitCode,
};

let OK = 0, BAD = 0, SEEN = 0;
const fails = [];

function check(name, cond, note = "") {
  SEEN++;
  if (cond) { OK++; } else { BAD++; fails.push(name); }
  console.log(`  ${cond ? "○" : "✕"} ${name}${note ? `  ${note}` : ""}`);
}

const src = readFileSync(join(HERE, "inkband.mjs"), "utf8");
const fix = readFileSync(join(HERE, "inkbandfix", "fix.html"), "utf8");

console.log("=== 帯送りの側が、縮んだ分母で合格と言っていないか ===");

console.log("\n[1] 縮んだ分母で通らない（本丸）");
/* 台の実測（2026-10-07）。画面より背の高い字を2つ置いてあるので、
   拾った 9 / 測れた 7。**分母に入れれば 0.78 で止まり、入れなければ 100%** */
check(
  "収まらなかった字を分母に入れたら、下限を割る",
  G.thin([{ path: "/fix.html", picked: 9, measured: 7 }], FLOOR).length === 1,
  "拾った 9 / 測れた 7 = 0.78",
);
check(
  "入れなければ通ってしまう（これが直す前の姿）",
  thin([{ path: "/fix.html", picked: 7, measured: 7 }], FLOOR).length === 0,
  "拾った 7 / 測れた 7 = 1.00",
);
check(
  "実害の値でも止まる（/nordic/guide の 502 / 344）",
  G.thin([{ path: "/nordic/guide", picked: 502, measured: 344 }], FLOOR).length === 1,
  "0.69",
);
check(
  "直ったあとの値は通す（503 / 503）",
  G.thin([{ path: "/nordic/guide", picked: 503, measured: 503 }], FLOOR).length === 0,
);
check("拾った 0 は「ぜんぶ測れた」ではなく 0", rate(0, 0) === 0);
check(`既定の下限は ${FLOOR}（inkpx.mjs と同じ1か所から取る）`, FLOOR === 0.9);

console.log("\n[2] 終了コード（0 と 1 と 2 を同じ顔で返さない）");
check(
  "測れた割合が足りなければ、割れ 0 でも **2**",
  G.exitCode({ thin: G.thin([{ path: "/x", picked: 502, measured: 344 }], FLOOR).length, measured: 344, bad: 0 }) === 2,
);
check(
  "割合が足りない面は、割れが出ていても 2（まぼろしの赤を出さない）",
  G.exitCode({ thin: G.thin([{ path: "/x", picked: 502, measured: 344 }], FLOOR).length, measured: 344, bad: 45 }) === 2,
);
check("ぜんぶ測れていて割れがあれば 1", G.exitCode({ thin: 0, measured: 503, bad: 3 }) === 1);
check("ぜんぶ測れていて割れが無ければ 0", G.exitCode({ thin: 0, measured: 503, bad: 0 }) === 0);
check("開けなかった面があれば 2", G.exitCode({ missing: 1, thin: 0, measured: 503, bad: 0 }) === 2);
check("1か所も測れていなければ 2", G.exitCode({ thin: 0, measured: 0, bad: 0 }) === 2);

console.log("\n[3] inkband.mjs が、その関門をほんとうに呼んでいるか");
check("関門は inkrate.mjs から呼ぶ（道具の中で割り算を書き直さない）",
  /from "\.\/inkrate\.mjs"/.test(src));
check("終わりは exitCode() が決める（if を並べて返さない）",
  /exitCode\(\{/.test(src) && /process\.exit\(code\)/.test(src));
check("測れた割合を報告に出す", /測れた字/.test(src) && /%/.test(src));
check("どの帯にも収まらなかった数も出す", /帯に収まらず/.test(src));
/* **ここが本丸の見張り。** 分母の札（`data-inkbandseen`）は、
   帯に収まるかを見る `continue` の**手前**で貼らなければならない。
   後ろに回すと、収まらなかった字が分母から消えて黙って縮む */
const iSeen = src.indexOf('setAttribute("data-inkbandseen"');
const iFit = src.indexOf("if (r.top < 0 || r.bottom > innerHeight");
check("分母の札は、帯に収まるかを見る手前で貼る", iSeen > 0 && iFit > 0 && iSeen < iFit,
  `分母 ${iSeen} / 収まり ${iFit}`);
check("分母は要素に貼る（字づらで束ねない。分子と単位を揃える）",
  /data-inkbandseen/.test(src) && /data-inkbanddone/.test(src));
check("面の高さは毎回測り直す（送るうちに伸びたぶんを見落とさない）",
  /for \(let y = 0, i = 0; ;/.test(src) && /const docH = await p\.evaluate/.test(src));
check("島を止めてから撮る（freeze.mjs を当てている）", /freeze\.mjs/.test(src));
check("dpr の既定は 2 以上", Number(/DPR \|\| (\d+)/.exec(src)?.[1]) >= 2);
check("BREAK=nofloor がある（関門を外す足を折れる）", /nofloor/.test(src));
check("BREAK=nodenom がある（分母を縮める足を折れる）", /nodenom/.test(src));

console.log("\n[4] 対照の台に、この道具で測れない字が置いてあるか");
const tall = (fix.match(/ik-tall/g) || []).length;
check("画面より背の高い字が2つある（1つだと「たまたま」と見分けが付かない）",
  tall >= 4, `ik-tall ${tall}か所（class 2つ＋注2つ）`);
check("2つは別の段落として置いてある（報告に出たときどちらか分かる）",
  /ik-tall ik-tall-a/.test(fix) && /ik-tall ik-tall-b/.test(fix) &&
  /1つめの長い段落。/.test(fix) && /2つめの長い段落。/.test(fix));
check("畳まれた段（content-visibility: auto）がある", /content-visibility:\s*auto/.test(fix));
check("畳まれた段の中に、割れてほしい字と割れてはいけない字がある",
  /ik-cv-bad/.test(fix) && /ik-cv-ok/.test(fix));
check("台の class の名前は、道具の表と揃っている",
  ["ik-cv-bad", "ik-cv-ok", "ik-tall", "ik-hidden-clip"].every((n) => src.includes(n) && fix.includes(n)));
check("道具の対照が、分母の4件を見ている",
  ["画面より背の高い字を、分母に出した", "縮んだ分母", "止まるときは 0 でも 1 でもなく 2"]
    .every((n) => src.includes(n)));

console.log();
if (SEEN === 0) { console.log("✕ 1件も見ていません（数えるものが無い）"); process.exit(2); }
if (BAD) {
  console.log(`✕ ${SEEN}件中 ${BAD}件 落ちました${BREAK ? `（BREAK=${BREAK}）` : ""}: ${fails.join(" / ")}`);
  process.exit(1);
}
console.log(`○ ${SEEN}件ぜんぶ通りました（分母の関門・終了コード・道具の決めごと・台の中身）`);
process.exit(0);
