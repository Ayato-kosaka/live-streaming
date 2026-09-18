/**
 * `preclaim.mjs` の**判定そのもの**を、ブラウザも書き出しも無しで確かめる。
 *
 *     node tools/sprites/preclaim_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ、道具の中の対照と別に要るのか
 *
 * `preclaim.mjs` は回るたびに自分で対照を5つ通す。**あれがいちばん強い**——
 * 本物のブラウザで、本物の引き算の道を通る。だが**書き出し（`next build`）と
 * ブラウザが要る**ので、毎 PR では回せない。
 *
 * すると腐るのは**判定の側**になる。正規表現は1文字直せば黙って穴が開くし、
 * 穴が開いても出るのは「0件」で、**0件はいちばん合格に見える**
 * （`docs/island-standards.md` §15）。だから、**判定だけを切り出して毎 PR で回す。**
 *
 * `python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾うので、
 * ここに置いたぶんは**何も書き足さなくても** `pull_request` で走る。
 *
 * ## 何を見るか
 *
 * 1. **拾わなければいけない字**（#143 で本番に出ていた2件を含む）
 * 2. **拾ってはいけない字**（いつ読んでも本当な字。ここが緩むと、件数が増えて
 *    誰にも読まれない道具になる。`#136` の決めごと2）
 * 3. **引き算**——割れた行・繋がった行で差が出ないこと、入れ替わった字は残ること
 * 4. **終了コード**——0件と「見ていない」を混ぜないこと（§15）
 * 5. **配っている先と盤の突き合わせ**（同じなら通る／違えば落ちる。両側から）
 * 6. **`BREAK=` の足が、ほんとうに1本ずつ折れること**（#128 の決めごと1）。
 *    子として起こして、外した状態で**判定が死ぬ**ことまで見る。
 *    ここが無いと、「対照が5つとも通った」は
 *    **`BREAK=` が何も外していないとき**にも出る
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=nopat node tools/sprites/preclaim_selftest.mjs     # 1 で落ちる
 *     BREAK=greedy node tools/sprites/preclaim_selftest.mjs    # 1 で落ちる
 *     BREAK=zerook node tools/sprites/preclaim_selftest.mjs    # 1 で落ちる
 *     BREAK=nodist node tools/sprites/preclaim_selftest.mjs    # 1 で落ちる
 *
 * （`nojsguard` はブラウザの側の足なので、ここでは折れない。あれは
 * `preclaim.mjs` の対照3が見る）
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { judge, servedDiff, subtract, verdict } from "./preclaim.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
let OK = 0;
let BAD = 0;
/** 数えたものの総数。**1つも無ければ 2 で落ちる**（§15） */
let SEEN = 0;

function check(name, ok, got) {
  SEEN++;
  if (ok) {
    OK++;
    return;
  }
  BAD++;
  console.log(`  ✕ ${name}${got === undefined ? "" : `  出た: ${got}`}`);
}

/* ------------------------------------------------ 1. 拾わなければいけない字 -- */

/** [字, なぜ嘘になりうるか] 。**理由を言えないものは置かない**（#136 の決めごと1） */
const MUST = [
  ["まもなく", "出発の日を過ぎたら嘘。#143 で本番の1画面目に出ていた"],
  ["2024年9月11日に日本を出て、きょうで 724 日目。", "#143 で本番に出ていた。毎日1ずつ離れる"],
  ["クタイシ発まで", "どこから発つかが読む日で変わる。#143 の `/nordic`"],
  ["進行中", "終わった企画にも出てしまう"],
  ["いま、島にいます", "「いま」の指す先が読む日で変わる"],
  ["あと 7 日", "焼いた日からの残りなので、翌日には合わない"],
  ["もう出発しました", "出発の前に読むと嘘"],
  ["旅は7日目です", "日ごとに1ずつずれる"],
  ["きょうの配信はお休みです", "焼いた日の「きょう」でしかない"],
  ["ストックホルムに到着。", "着く前に読むと嘘"],
  ["募集中", "締め切ったあとも残る"],
  ["現在はノルウェーにいます", "国境を越えた日から嘘"],
  ["1年ぶりの日本", "数えている起点が読む日で変わる"],
  ["3日前に着きました", "同上"],
  // **今日を知らないと出せない数が、見出しと別の行に割れている形**（#115 と同じ落とし穴）
  ["614", "隣の行が「毎日配信の日数」。数だけの行に見えるので逃げやすい", "毎日配信の日数"],
];

/** 拾ってはいけない字。**いつ読んでも本当** */
const MUST_NOT = [
  ["2026年9月11日(金) 23:30 出発", "絶対の日付。いつ読んでも本当"],
  ["9/11", "同上"],
  ["未定", "分からないと言っている（#143 の直しはこちら側へ替えた）"],
  ["—", "同上"],
  ["ノルウェー", "そのものが持っている値"],
  ["No.13", "順番であって、今日とは関係ない"],
  ["66人の住人", "数だけ。相対の単位が付いていない"],
  ["湖に浮かぶ城があります。", "丁寧形を「これから」と読まない（#136 の決めごと2）"],
  ["3ヶ月の予定だった", "過去の語り（#136 の狼少年1件目）"],
  ["中東に降りて、そこから歩いた", "て形は過去の語りにも使う（同2件目）"],
  ["とろりとした発酵乳", "連体（うしろに名詞が続く形）は段の言い切りではない"],
  ["ヒッチハイクで北欧へ", "企画の名前"],
  ["21カ国を歩いた", "数えた結果であって、今日を知らなくても出せる"],
  ["中央アジア", "「中」を含むが地名"],
];

console.log("# 1. 拾わなければいけない字");
for (const [line, why, next] of MUST) {
  const j = judge(line, "", next || "");
  check(`拾う「${line}」（${why}）`, j.hit, j.hit ? "" : "拾わなかった");
}

console.log("# 2. 拾ってはいけない字");
for (const [line, why] of MUST_NOT) {
  const j = judge(line, "", "");
  check(`拾わない「${line}」（${why}）`, !j.hit, j.hit ? `［${j.why}］で拾った` : "");
}

/* -------------------------------------------------------------- 3. 引き算 -- */

console.log("# 3. 引き算（割れ方の差を候補にしない）");
{
  // JS が入ると1つの段が2要素に割れる。**差にしてはいけない**
  const off = ["いま、ヒッチハイクで北欧へ"];
  const onDom = "いま、\nヒッチハイクで北欧へ";
  check("割れても差にならない", subtract(off, onDom).length === 0, String(subtract(off, onDom).length));
}
{
  // 逆向き。JS が入ると繋がる
  const off = ["いま、", "ヒッチハイクで北欧へ"];
  const onDom = "いま、ヒッチハイクで北欧へ";
  check("繋がっても差にならない", subtract(off, onDom).length === 0, String(subtract(off, onDom).length));
}
{
  // 入れ替わった字は残る。**ここが本体**
  const d = subtract(["まもなく", "ヒッチハイクで北欧へ"], "進行中ヒッチハイクで北欧へ");
  check("入れ替わった字だけが残る", d.length === 1 && d[0].line === "まもなく", JSON.stringify(d.map((x) => x.line)));
  check("残った字が言い切りとして拾われる", d.length === 1 && d[0].hit === true, JSON.stringify(d));
}
{
  // 同じ字が2度出ても、候補は1件
  const d = subtract(["まもなく", "まもなく"], "");
  check("同じ字は1件にまとめる", d.length === 1, String(d.length));
}

/* ------------------------------------------------------- 4. 終了コード -- */

console.log("# 4. 終了コード（0件と「見ていない」を混ぜない）");
check("何も無ければ 0", verdict({ seen: 10, miss: 0, hits: 0 }) === 0, String(verdict({ seen: 10, miss: 0, hits: 0 })));
check("在れば 1", verdict({ seen: 10, miss: 0, hits: 3 }) === 1, String(verdict({ seen: 10, miss: 0, hits: 3 })));
check("1面も読めなければ 2", verdict({ seen: 0, miss: 0, hits: 0 }) === 2, String(verdict({ seen: 0, miss: 0, hits: 0 })));
check("開けなかった面があれば 2", verdict({ seen: 10, miss: 1, hits: 0 }) === 2, String(verdict({ seen: 10, miss: 1, hits: 0 })));
check(
  "**言い切りが在っても、開けなかった面があれば 2**（1 に落とさない）",
  verdict({ seen: 10, miss: 1, hits: 3 }) === 2,
  String(verdict({ seen: 10, miss: 1, hits: 3 })),
);

/* ------------------------------------------ 5. 配っている先と盤の突き合わせ -- */

console.log("# 5. 配っている先が、測ろうとしている書き出しか");
{
  const dir = mkdtempSync(join(tmpdir(), "preclaim-selftest-"));
  const disk = "<!doctype html><p>盤の中身</p>";
  writeFileSync(join(dir, "same.html"), disk);
  writeFileSync(join(dir, "other.html"), disk);
  const srv = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/same.html" ? disk : "<!doctype html><p>べつの書き出し</p>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const same = await servedDiff(["/same.html"], dir, origin);
  const other = await servedDiff(["/other.html"], dir, origin);
  const gone = await servedDiff(["/missing.html"], dir, origin);
  await new Promise((r) => srv.close(r));
  rmSync(dir, { recursive: true, force: true });
  check("同じ中身なら通る", same.length === 0, JSON.stringify(same));
  check("違う中身なら落ちる", other.length === 1, JSON.stringify(other));
  check("盤に無い面も落ちる", gone.length === 1, JSON.stringify(gone));
}

/* ------------------------------------------------- 6. BREAK の足が折れる -- */

/**
 * 子として起こして、**外した状態の答え**を1行で受け取る。
 *
 * 同じ工程の中で `BREAK` を差し替えることはできない（読むのは読み込みの1回だけ）。
 * 子にすれば、**本物の読み込みの道**を通ったうえで外れた姿が見られる。
 */
function askChild(brk, code) {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: HERE,
    env: { ...process.env, BREAK: brk },
    encoding: "utf8",
  });
  return out.trim();
}

console.log("# 6. BREAK の足が、1本ずつ折れる");
{
  const J = `import { judge } from "./preclaim.mjs"; console.log(judge("まもなく","","").hit);`;
  check("BREAK=nopat で判定が死ぬ", askChild("nopat", J) === "false", askChild("nopat", J));
  check("BREAK を渡さなければ生きている", askChild("", J) === "true", askChild("", J));
}
{
  const S = `import { subtract } from "./preclaim.mjs"; console.log(subtract(["いま、ヒッチハイクで北欧へ"],"いま、\\nヒッチハイクで北欧へ").length);`;
  check("BREAK=greedy で引き算が死ぬ", askChild("greedy", S) === "1", askChild("greedy", S));
  check("BREAK を渡さなければ引く", askChild("", S) === "0", askChild("", S));
}
{
  const V = `import { verdict } from "./preclaim.mjs"; console.log(verdict({seen:0,miss:0,hits:0}));`;
  check("BREAK=zerook で「見ていない」が 0 に化ける", askChild("zerook", V) === "0", askChild("zerook", V));
  check("BREAK を渡さなければ 2", askChild("", V) === "2", askChild("", V));
}
{
  const D =
    `import { servedDiff } from "./preclaim.mjs";` +
    `console.log((await servedDiff(["/nowhere-at-all.html"], "/nonexistent-dir", "http://127.0.0.1:1")).length);`;
  check("BREAK=nodist で突き合わせが死ぬ", askChild("nodist", D) === "0", askChild("nodist", D));
  check("BREAK を渡さなければ落ちる", askChild("", D) === "1", askChild("", D));
}

/* ------------------------------------------------------------------ まとめ -- */

console.log("");
if (SEEN === 0) {
  console.log("::error::数えるものが1つも無かった。");
  process.exit(2);
}
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件 / 見たのは ${SEEN} 件）。`);
  process.exit(1);
}
console.log(`${SEEN} 件ぜんぶ通った。`);
