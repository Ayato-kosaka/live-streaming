/**
 * 図鑑（`/friends`）の札を1枚ずつ開いて、「今日いるところ」に**何が出ているか**を数える。
 *
 *   node tools/sprites/dexspot.mjs                 # 本番を見る
 *   SPORT=4310 node tools/sprites/dexspot.mjs      # 手元の書き出し（静的に配ったもの）
 *   BREAK=text node tools/sprites/dexspot.mjs      # わざと壊す（対照が落ちることを見る）
 *   BREAK=first node tools/sprites/dexspot.mjs     # もう1つの壊しかた
 *
 * ## 何を見ている欄か
 *
 * 「今日いるところ」を決めているのは**島を歩く22人の抽選**
 * （`useOnIslandToday` → `createVillagers`）。だからこの欄が言えるのは
 * 「今日この人が島を歩いているか」だけで、**その人が今日来たかどうかではない。**
 * 選ばれなかった人に「今日は出ていません」と出すのは、こちらの抽選結果を
 * 相手の不在にすり替えている（`docs/island-misses.md` #115 と同じ形）。
 *
 * 数えるのは3つ。
 *
 * - **「〇〇のあたり」** — 歩いている人。これは出てよい。**減らしてはいけない**
 * - **「今日は出ていません」** — 言い切ってはいけない字。0 でなければ落とす
 * - **「数えています」** — 抽選が終わるまでの字
 *
 * ## ついでに、欄を割る縦の罫も見る
 *
 * 図鑑の欄は**人によって出たり消えたりする**。2列に並ぶのは
 * 「はじめての人に／久しぶりの人に」の2枚だけで、そこを割る縦の罫を
 * `nth-child(2n)` で数え打ちしていると、**上に並ぶ欄が1つ増減しただけで
 * 罫が左端に落ちる**（実測。本番で45枚、この欄を消したあとで29枚）。
 * 欄を出す条件を触るたびに起きるので、同じ道具で一緒に見る。
 *
 * ## なぜ対照が先か
 *
 * 図鑑は**開いている1枚しか欄を持たない**うえ、「今日いるところ」は
 * 欄の3番目あたりに来る。面の字に正規表現を当てるのも、`.rzk-fields` の
 * 最初の欄だけを見るのも、どちらも「0に近い数」を出して**それが
 * 「壊れていない」に見える**（`docs/island-standards.md` §15、`dexdays.mjs` の頭）。
 *
 * だから数字を出す前に、**作り物の札6通り**をその場で組んで、読み手が
 * 全部を言い当てることを見る。囮も混ぜてある（欄の前に別の欄を置き、
 * **「今日は出ていません」という字を別の欄（島で言うこと）の中**にも置く）。
 * 1つでも外したら**面の数字を1つも出さずに**終了コード2で落ちる。
 * そのうえで**分母を突き合わせる**（送りの総数 `N / M` の M と、実際に
 * 開いて読めた枚数）。「読めず」が1枚でもあれば落とす。
 *
 * 終了コードは `dexdays.mjs` / `isletalk.mjs` / `served.mjs` に合わせる。
 * 0＝通った / 1＝「今日は出ていません」が出ている / 2＝数えるものが無い（対照が落ちた）。
 *
 * ## 口は本番のものを使う
 *
 * 手元の書き出しを静的に配っても `/island-api/*` は無いので、図鑑は空になる。
 * ここは **curl で本番の口を引いて流し込む**（`docs/island-standards.md` 4）。
 * 偽の名簿を作らない。
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
 * 開いている1枚から、「今日いるところ」の欄を読む。**ページの中で動く。**
 *
 * 渡すのは `.rzk-page`（作り物の札でもよい）と、わざと壊すときの名前。
 * 返すのは分類の名前
 * （`いる` / `出ていません` / `数えています` / `欄なし` / `それ以外` / `読めず`）。
 */
const READ = (page, broken) => {
  const LABEL = "今日いるところ";
  // 壊しかた `text`: 面の字に正規表現を当てる（欄を見ずに字だけ拾う）
  if (broken === "text") {
    const t = (page.innerText || "").replace(/\s+/g, "");
    if (/今日は出ていません/.test(t)) return { k: "出ていません" };
    if (/のあたり/.test(t)) return { k: "いる" };
    if (/数えています/.test(t)) return { k: "数えています" };
    return { k: "欄なし" };
  }
  const rows = [...page.querySelectorAll(".rzk-fields > div")];
  // 壊しかた `first`: 最初の欄だけ見る（欄の位置を決め打ちする）
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
  const t = (dd.textContent || "").replace(/\s+/g, "");
  if (/^.+のあたり$/.test(t)) return { k: "いる", t };
  if (t === "今日は出ていません") return { k: "出ていません" };
  if (t === "数えています") return { k: "数えています" };
  return { k: "それ以外", t: t.slice(0, 20) || "(空)" };
};

/**
 * 2列に並ぶ欄（はじめての人に／久しぶりの人に）を割る、縦の罫を読む。
 *
 * 正しいのは**右の1枚だけ**が左に罫を持っている形。左の1枚が持っていると、
 * 罫は紙の左端に落ちて、2列のあいだに何も無くなる。
 */
const RULE = (page) => {
  const rows = [...page.querySelectorAll(".rzk-fields > div")];
  const narrow = rows.filter((d) => !d.classList.contains("rzk-wide"));
  if (!narrow.length) return { k: "対なし" };
  if (narrow.length !== 2) return { k: "読めず", t: `2列の欄が ${narrow.length}枚` };
  const m = narrow.map((d) => ({
    x: Math.round(d.getBoundingClientRect().x),
    bl: parseFloat(getComputedStyle(d).borderLeftWidth) || 0,
  }));
  if (m[1].x <= m[0].x) return { k: "読めず", t: "左右が取れない" };
  return m[0].bl === 0 && m[1].bl > 0 ? { k: "罫が真ん中" } : { k: "罫がずれている" };
};

/** 罫の対照。**罫の値は差し込みで作る**（面の CSS ではなく、読み手を試す）。 */
const RULE_CASES = [
  [
    "右に罫（正）",
    `<div class="rzk-wide"><dt>絵を持ち帰る</dt><dd>a</dd></div>` +
      `<div style="border-left-width:0"><dt>はじめての人に</dt><dd>a</dd></div>` +
      `<div style="border-left:1px solid #000"><dt>久しぶりの人に</dt><dd>b</dd></div>`,
    "罫が真ん中",
  ],
  [
    "左に罫（ずれ）",
    `<div class="rzk-wide"><dt>絵を持ち帰る</dt><dd>a</dd></div>` +
      `<div style="border-left:1px solid #000"><dt>はじめての人に</dt><dd>a</dd></div>` +
      `<div style="border-left-width:0"><dt>久しぶりの人に</dt><dd>b</dd></div>`,
    "罫がずれている",
  ],
  ["どちらにも罫", `<div style="border-left:1px solid #000">a</div><div style="border-left:1px solid #000">b</div>`, "罫がずれている"],
  ["2列の欄が無い", `<div class="rzk-wide"><dt>絵を持ち帰る</dt><dd>a</dd></div>`, "対なし"],
  ["2列の欄が1枚だけ", `<div><dt>はじめての人に</dt><dd>a</dd></div>`, "読めず"],
];

/** 対照。作り物の札6通り。**読み手がこの通りに答えないと、本番の数字は出さない。** */
const CASES = [
  [
    "いる（あたり）",
    `<dd><span class="rzk-spot"><svg class="ic"></svg>たき火広場のあたり</span></dd>`,
    "いる",
  ],
  ["出ていません", `<dd><span class="rzk-quiet">今日は出ていません</span></dd>`, "出ていません"],
  ["数えています", `<dd><span class="rzk-quiet">数えています</span></dd>`, "数えています"],
  ["欄なし", null, "欄なし"],
  ["別の字", `<dd>まだ分かりません</dd>`, "それ以外"],
  ["空の欄", `<dd></dd>`, "それ以外"],
];

async function control(p) {
  return await p.evaluate(
    ({ cases, broken, src }) => {
      const read = new Function("return " + src)();
      const out = [];
      for (const [name, dd, want] of cases) {
        const page = document.createElement("div");
        page.className = "rzk-page";
        /* 囮を2つ。**欄の前に別の欄**（最初の欄だけ見る壊れかたを捕まえる）と、
           **別の欄の中に置いた「今日は出ていません」**（見出しを見ずに面の字を
           拾う壊れかたを捕まえる）。後者は「欄なし」の札にも残るので、
           字だけ拾う読み手は**欄が無いのに「出ていません」**と答える。 */
        page.innerHTML =
          `<dl class="rzk-fields">` +
          `<div><dt>絵を持ち帰る</dt><dd>背景なし</dd></div>` +
          `<div><dt>いっしょにいた日数</dt><dd><b>7</b>日</dd></div>` +
          (dd ? `<div><dt>今日いるところ</dt>${dd}</div>` : "") +
          `<div><dt>島で言うこと</dt><dd>今日は出ていません、って札に書いてあったよ</dd></div>` +
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

async function controlRule(p) {
  return await p.evaluate(
    ({ cases, src }) => {
      const read = new Function("return " + src)();
      const out = [];
      for (const [name, html, want] of cases) {
        const page = document.createElement("div");
        page.className = "rzk-page";
        page.innerHTML = `<dl class="rzk-fields">${html}</dl>`;
        document.body.appendChild(page);
        const got = read(page);
        page.remove();
        out.push({ name, want, got: got.k, t: got.t });
      }
      return out;
    },
    { cases: RULE_CASES, src: RULE.toString() },
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
const ctrl = [...(await control(p)), ...(await controlRule(p))];
let ctrlBad = 0;
console.log("── 対照（作り物の札を、読み手が言い当てられるか）");
for (const c of ctrl) {
  const ok = c.got === c.want;
  if (!ok) ctrlBad++;
  console.log(
    `  ${ok ? "○" : "×"} ${c.name}: ほしい「${c.want}」/ 読んだ「${c.got}」${c.t ? ` (${c.t})` : ""}`,
  );
}
console.log(`  対照 ${ctrl.length}件中 ${ctrl.length - ctrlBad}件 一致`);
if (ctrlBad) {
  console.log(`対照が ${ctrlBad}件 外れた。**面の数字は出さない。**`);
  await b.close();
  process.exit(2);
}

/* 抽選は画面が出てから動く（`useOnIslandToday` は useEffect の中）。
   名簿が入るのを待ってから数える。 */
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

/* 島を歩いている人の数は、面の下の札（「今日、島を歩いているのは◯人」）と
   一覧の印（`.rzk-cell.is-here`）にも出ている。**欄の数え上げと突き合わせる。**
   片側だけ見ていると、両方0のときに気づけない（standards §15）。 */
const here = await p.evaluate(() => ({
  marks: document.querySelectorAll(".rzk-cell.is-here").length,
  note: Number(/(\d+)人/.exec(document.querySelector(".rz-today b")?.textContent || "")?.[1] || 0),
}));

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
    ({ broken, src, rsrc }) => {
      const read = new Function("return " + src)();
      const rule = new Function("return " + rsrc)();
      const page = document.querySelector(".rzk-page");
      if (!page) return { k: "読めず", t: ".rzk-page が無い", rule: "読めず" };
      return { ...read(page, broken), rule: rule(page).k };
    },
    { broken: BREAK, src: READ.toString(), rsrc: RULE.toString() },
  );
  seen.push({ i: i + 1, ...got });
}

const by = (k) => seen.filter((s) => s.k === k);
const out = by("出ていません");
const inn = by("いる");
const bad = by("読めず");
console.log(`\n── 図鑑（${ORIGIN}${LOCAL ? "" : "／本番"}・幅 ${WIDTH}px）`);
console.log(`  札の総数            ${seen.length}（送りの総数 ${total}）`);
console.log(`  「〇〇のあたり」    ${inn.length}`);
console.log(`  「今日は出ていません」${out.length}`);
console.log(`  「数えています」    ${by("数えています").length}`);
console.log(`  欄なし              ${by("欄なし").length}`);
console.log(`  それ以外            ${by("それ以外").length}`);
console.log(`  読めず              ${bad.length}`);
console.log(`  一覧の印 is-here ${here.marks} / 面の下の札「${here.note}人」`);
const ruled = seen.filter((s) => s.rule === "罫が真ん中" || s.rule === "罫がずれている");
const skew = seen.filter((s) => s.rule === "罫がずれている");
const ruleBad = seen.filter((s) => s.rule === "読めず");
console.log(`  2列の欄がある札 ${ruled.length}（うち罫が左端に落ちている ${skew.length} / 読めず ${ruleBad.length}）`);
if (skew.length) console.log(`  罫のずれている番号: ${skew.map((z) => z.i).join(", ")}`);
const other = by("それ以外");
if (other.length) {
  console.log(`  それ以外の中身: ${other.map((o) => `No.${o.i}「${o.t}」`).join(", ")}`);
}
if (inn.length) console.log(`  歩いている人の番号: ${inn.map((z) => z.i).join(", ")}`);

await b.close();
if (seen.length !== total || bad.length) {
  console.log(`\n読めなかった札が ${bad.length}枚。**この数字は読めない。**`);
  process.exit(2);
}
/* 欄の数え上げと、一覧の印が食い違ったら、数えかたを疑う。
   面の下の札（`here.size`）は**島を歩いている人の数**なので、その人の絵が
   図鑑に載っていなければ札のほうが多くなる。多いぶんは数えかたの誤りではない
   ので落とさないが、**少ない**のはありえない（印は札の部分集合）。 */
if (inn.length !== here.marks || here.note < here.marks) {
  console.log(
    `\n「あたり」の欄 ${inn.length}枚 と 一覧の印 ${here.marks}個／札の「${here.note}人」が合わない。数えかたが怪しい。`,
  );
  process.exit(2);
}
if (here.note !== here.marks) {
  console.log(`  （島を歩いている ${here.note}人のうち ${here.note - here.marks}人は、図鑑に絵が無い）`);
}
if (ruleBad.length) {
  console.log(`\n2列の欄を読めなかった札が ${ruleBad.length}枚。**この数字は読めない。**`);
  process.exit(2);
}
let ng = 0;
if (out.length) {
  console.log(
    `\n「今日は出ていません」が ${out.length}枚。島を歩く抽選に外れただけの人に、来ていないと言っている。`,
  );
  ng++;
}
if (skew.length) {
  console.log(`\n2列の欄を割る罫が、${skew.length}枚で左端に落ちている。欄の数で罫を決めている。`);
  ng++;
}
if (ng) process.exit(1);
console.log(
  `\n「今日は出ていません」と言い切っている札は無い（歩いている ${inn.length}人ぶんは出ている）。` +
    ` 2列の欄 ${ruled.length}枚の罫も、ぜんぶ真ん中。`,
);
process.exit(0);
