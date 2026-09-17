/**
 * 図鑑（`/friends`）の札を1枚ずつ開いて、「いっしょにいた日数」に**何が出ているか**を数える。
 *
 *   node tools/sprites/dexdays.mjs                 # 本番を見る
 *   SPORT=4230 node tools/sprites/dexdays.mjs      # 手元の書き出し（静的に配ったもの）
 *   BREAK=text node tools/sprites/dexdays.mjs      # わざと壊す（対照が落ちることを見る）
 *   BREAK=first node tools/sprites/dexdays.mjs     # もう1つの壊しかた
 *
 * ## なぜ要るか（数えかたを2回つづけて外した）
 *
 * 「0日」が何人に出ているかを数えようとして、2回とも数字のほうが壊れていた。
 *
 * - 1回目。面ぜんぶの `innerText` に正規表現を当てた。図鑑は**開いている1枚しか
 *   欄を持たない**ので、123マスあっても字は1枚ぶんしか出ていない。2件しか拾えなかった
 * - 2回目。DOM を辿ったが `.rzk-fields` の**最初の欄**だけを見ていた。日数の欄は
 *   4番目にあるので、わざと3件仕込んでも1件しか読めなかった
 *
 * どちらも「0件に近い数」が出て、**それが「直っている」に見えた**
 * （`docs/island-standards.md` §15）。だから、この道具は数字を出す前に
 * **対照を2つ通す。**
 *
 * 1. **作り物の札**（`CASES`）を6通り——0日・7日・543日・骨・欄なし・別の字——
 *    その場で組んで、**読み手が6通りすべてを言い当てることを見る。**
 *    紛らわしい囮も混ぜてある（日数の欄の前に別の欄を置き、「今日いるところ」に
 *    わざと「0日」と書いた欄も足す）。1つでも外したら**数字を1つも出さずに**
 *    終了コード2で落ちる
 * 2. **分母を突き合わせる。** 送りの札が言っている総数（`N / M` の M）と、
 *    実際に開いて読めた枚数が合わなければ落ちる。「読めず」が1枚でもあれば落ちる
 *
 * 終了コードは `isletalk.mjs` / `served.mjs` に合わせる。
 * 0＝通った / 1＝「0日」が出ている / 2＝数えるものが無い（対照が落ちた）。
 *
 * ## 口は本番のものを使う
 *
 * 手元の書き出しを静的に配っても `/island-api/*` は無いので、図鑑は空になる。
 * ここは **curl で本番の口を引いて流し込む**（`docs/island-standards.md` 4
 * 「差し込みはの本番と同じものにする」）。偽の名簿を作らない。
 */
import { chromium } from "playwright-core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { viaCurl } from "./prod.mjs";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";

const run = promisify(execFile);

const PROD = "https://live-streaming-d3cac.web.app";
const SPORT = process.env.SPORT || "";
const ORIGIN = process.env.ORIGIN || (SPORT ? `http://127.0.0.1:${SPORT}` : PROD);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(ORIGIN);
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
/** わざと壊す。`text`＝面の字に正規表現、`first`＝最初の欄だけ見る */
const BREAK = process.env.BREAK || "";
/** 口の返事を待つ上限 */
const LOAD_MS = parseInt(process.env.LOAD_MS || "12000", 10);

/**
 * 開いている1枚から、日数の欄を読む。**ページの中で動く。**
 *
 * 渡すのは `.rzk-page`（作り物の札でもよい）と、わざと壊すときの名前。
 * 返すのは分類の名前（`0日` / `1日以上` / `待ち` / `欄なし` / `それ以外` / `読めず`）。
 */
const READ = (page, broken) => {
  const LABEL = "いっしょにいた日数";
  // 壊しかた `text`: 面の字に正規表現を当てる（1回目にやった数えかた）
  if (broken === "text") {
    const m = /いっしょにいた日数\s*(\d+)\s*日/.exec(page.innerText || "");
    if (!m) return { k: "欄なし" };
    return { k: m[1] === "0" ? "0日" : "1日以上", n: Number(m[1]) };
  }
  const rows = [...page.querySelectorAll(".rzk-fields > div")];
  // 壊しかた `first`: 最初の欄だけ見る（2回目にやった数えかた）
  const row =
    broken === "first"
      ? rows[0]
      : rows.find((d) => (d.querySelector("dt")?.textContent || "").trim() === LABEL);
  if (!row) return { k: "欄なし" };
  if (broken !== "first" && (row.querySelector("dt")?.textContent || "").trim() !== LABEL) {
    return { k: "読めず", t: "見出しが違う" };
  }
  const dd = row.querySelector("dd");
  if (!dd) return { k: "読めず", t: "dd が無い" };
  if (dd.querySelector(".rzk-days-wait")) return { k: "待ち" };
  const t = (dd.textContent || "").replace(/\s+/g, "");
  const m = /^(\d+)日$/.exec(t);
  if (!m) return { k: "それ以外", t: t.slice(0, 20) || "(空)" };
  return { k: m[1] === "0" ? "0日" : "1日以上", n: Number(m[1]) };
};

/** 対照。作り物の札6通り。**読み手がこの通りに答えないと、本番の数字は出さない。** */
const CASES = [
  ["0日の札", `<dd><b class="rzk-days">0</b>日</dd>`, "0日"],
  ["7日の札", `<dd><b class="rzk-days">7</b>日</dd>`, "1日以上"],
  ["543日の札", `<dd><b class="rzk-days">543</b>日</dd>`, "1日以上"],
  ["骨（待ち）", `<dd><span class="rzk-days-wait"></span></dd>`, "待ち"],
  ["欄なし", null, "欄なし"],
  ["別の字", `<dd>まだ数えていません</dd>`, "それ以外"],
];

async function control(p) {
  return await p.evaluate(
    ({ cases, broken, src }) => {
      const read = new Function("return " + src)();
      const out = [];
      for (const [name, dd, want] of cases) {
        const page = document.createElement("div");
        page.className = "rzk-page";
        /* 囮を2つ。**日数の欄の前に別の欄**（最初の欄だけ見る壊れかたを捕まえる）と、
           **「0日」と書いた別の見出し**（見出しを見ずに字を拾う壊れかたを捕まえる）。 */
        page.innerHTML =
          `<dl class="rzk-fields">` +
          `<div><dt>絵を持ち帰る</dt><dd>背景なし</dd></div>` +
          (dd ? `<div><dt>いっしょにいた日数</dt>${dd}</div>` : "") +
          `<div><dt>今日いるところ</dt><dd>0日</dd></div>` +
          `</dl>`;
        document.body.appendChild(page);
        const got = read(page, broken);
        page.remove();
        out.push({ name, want, got: got.k, t: got.t });
      }
      return out;
    },
    { cases: CASES, broken: BREAK, src: READ.toString() },
  );
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2 });
if (LOCAL) {
  /* 手元の書き出しには口が無い。**本番の口を curl で引いて流し込む。**
     偽の名簿を置くと、直っていないものが直って見える（standards 4）。 */
  await ctx.route(/\/island-api\//, async (r) => {
    const u = PROD + new URL(r.request().url()).pathname + (new URL(r.request().url()).search || "");
    try {
      const { stdout } = await run("curl", ["-fsS", "--max-time", "40", u], {
        maxBuffer: 1 << 28,
        encoding: "buffer",
      });
      await r.fulfill({ status: 200, contentType: "application/json", body: stdout });
    } catch {
      await r.abort().catch(() => {});
    }
  });
} else {
  await viaCurl(ctx);
}
await offline(ctx);
const p = await ctx.newPage();

const miss = [];
const opened = await openChecked(p, ORIGIN, "/friends", { miss });
if (!opened.ok) {
  console.log(`図鑑を開けなかった: ${opened.why}`);
  reportMissing(miss);
  await b.close();
  process.exit(2);
}

/* 対照が先。**通らなければ、面の数字は1つも出さない。** */
const ctrl = await control(p);
let ctrlBad = 0;
console.log("── 対照（作り物の札を、読み手が言い当てられるか）");
for (const c of ctrl) {
  const ok = c.got === c.want;
  if (!ok) ctrlBad++;
  console.log(`  ${ok ? "○" : "×"} ${c.name}: ほしい「${c.want}」/ 読んだ「${c.got}」${c.t ? ` (${c.t})` : ""}`);
}
console.log(`  対照 ${ctrl.length}件中 ${ctrl.length - ctrlBad}件 一致`);
if (ctrlBad) {
  console.log(`対照が ${ctrlBad}件 外れた。**面の数字は出さない。**`);
  await b.close();
  process.exit(2);
}

/* 口の返事を待つ。**「0日」の数は、`/state` が入る前と後で変わる。** */
await p
  .waitForFunction(() => document.querySelectorAll(".rzk-cell:not(.is-wait)").length > 0, {
    timeout: LOAD_MS,
  })
  .catch(() => {});
await p.waitForTimeout(LOCAL ? 4000 : 8000);

const total = await p.evaluate(() => {
  const t = document.querySelector(".rzk-pager span")?.textContent || "";
  const m = /\/\s*(\d+)/.exec(t);
  return m ? Number(m[1]) : 0;
});
const cells = await p.locator(".rzk-cell").count();
if (!total || !cells) {
  console.log(`図鑑に札が無い（送りの総数 ${total} / マス ${cells}）。数えるものが無い。`);
  await b.close();
  process.exit(2);
}
if (total !== cells) {
  console.log(`送りの総数 ${total} とマス ${cells} が合わない。数えかたが怪しい。`);
  await b.close();
  process.exit(2);
}

const seen = [];
for (let i = 0; i < total; i++) {
  await p.locator(".rzk-cell").nth(i).click();
  const ok = await p
    .waitForFunction(
      (n) => (document.querySelector(".rzk-pager span b")?.textContent || "") === String(n),
      i + 1,
      { timeout: 4000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    seen.push({ i: i + 1, k: "読めず", t: "札が差し替わらない" });
    continue;
  }
  const got = await p.evaluate(
    ({ broken, src }) => {
      const read = new Function("return " + src)();
      const page = document.querySelector(".rzk-page");
      return page ? read(page, broken) : { k: "読めず", t: ".rzk-page が無い" };
    },
    { broken: BREAK, src: READ.toString() },
  );
  seen.push({ i: i + 1, ...got });
}

const by = (k) => seen.filter((s) => s.k === k);
const zero = by("0日");
const bad = by("読めず");
console.log(`\n── 図鑑（${ORIGIN}${LOCAL ? "" : "／本番"}・幅 ${WIDTH}px）`);
console.log(`  札の総数      ${seen.length}（送りの総数 ${total}）`);
console.log(`  「0日」       ${zero.length}`);
console.log(`  1日以上       ${by("1日以上").length}`);
console.log(`  待ち（骨）    ${by("待ち").length}`);
console.log(`  欄なし        ${by("欄なし").length}`);
console.log(`  それ以外      ${by("それ以外").length}`);
console.log(`  読めず        ${bad.length}`);
if (zero.length) console.log(`  「0日」の番号: ${zero.map((z) => z.i).join(", ")}`);
const other = by("それ以外");
if (other.length) console.log(`  それ以外の中身: ${other.map((o) => `No.${o.i}「${o.t}」`).join(", ")}`);

await b.close();
if (seen.length !== total || bad.length) {
  console.log(`\n読めなかった札が ${bad.length}枚。**この数字は読めない。**`);
  process.exit(2);
}
if (zero.length) {
  console.log(`\n「いっしょにいた日数 0日」が ${zero.length}枚。数えられていない人に 0 と言っている。`);
  process.exit(1);
}
console.log("\n「0日」と言い切っている札は無い。");
process.exit(0);
