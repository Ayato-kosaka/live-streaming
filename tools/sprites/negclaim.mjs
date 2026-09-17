/**
 * **「無い・していない・まだだ」と言い切っている日本語**を、面ぜんぶから洗い出す。
 *
 *   DIST=site/.next-4340 SPORT=4340 node tools/sprites/negclaim.mjs
 *   BREAK=noopen node tools/sprites/negclaim.mjs   # わざと壊す（対照が落ちる）
 *
 * ## なぜ `zeroclaim.mjs` と別に要るか
 *
 * `zeroclaim.mjs` は「0◯」という**数**の言い切りしか見ていない。
 * 2026-09-17 に図鑑で見つかった2件のうち、
 *
 * - 「いっしょにいた日数 **0日**」（`island-misses.md` #115）は数なので、あちらで捕まる
 * - 「今日いるところ **今日は出ていません**」（#116）は**言葉**なので、
 *   あちらでは永久に捕まらない
 *
 * どちらも形は同じ。**こちらが知らないことを、そうではないと言い切っている。**
 * 「抽選に外れた」を「あなたは来ていない」に言い換えていた。
 * こちらは、その**言葉のほう**を受け持つ。
 *
 * ## 機械の仕事はどこまでか
 *
 * **候補を漏れなく並べるところまで。** 「まだ見ていない人はこちらから」のような
 * 誘いの文と、「今日は出ていません」のような言い切りは、**字面では区別できない。**
 * どちらが嘘かを決めるのは読む人なので、ここで混ぜない。
 * だから終了コード1は「**候補があった**」であって「壊れている」ではない。
 *
 * ## 面を2回開く（`docs/island-standards.md` 10）
 *
 * 1. **口を落として**（`/island-api/*` を全部 abort）
 * 2. **口を通して**（curl で本番の返事を流し込む）
 *
 * 出かたで3つに分ける。
 *
 * - **A: 両方で出る** — 口に関係なく出ている字。焼き込みの読みもの、飾り、本当の否定
 * - **B: 落としたときだけ出る** — 読めないことを「無い」と言っている。**危ない**
 * - **C: 通したときだけ出る** — 読めた上での否定。**ここがいちばん危ない。**
 *   #115 #116 はどちらもこれだった。「名簿は読めた。でもこの人の数は入っていなかった」が
 *   「0日」「今日は出ていません」になって出ていた。
 *   **落とす／通すの2回だけでは、C は合格に見える。** だから別枠で、1件ずつ出す。
 *
 * ## 押さないと出ない中身を、開いてから数える
 *
 * 図鑑は**開いている1枚しか欄を持たない**（#116）。開かずに測ると「0件」が出て、
 * それが合格に見える（`docs/island-standards.md` §15）。この島で中身を隠すのは4種類。
 *
 * | 隠しかた | 開きかた |
 * | --- | --- |
 * | 折りたたみ（`components/ui/Fold.tsx` の `<details>`） | `open = true` |
 * | 出し切り（`components/ui/Longer.tsx` の「あと◯件だす」） | 「たたむ」になるまで押す |
 * | 札（`[role="tab"]`。図鑑の102枚もこれ） | 1枚ずつ押して、そのつど読む |
 * | 帳面の送り（`nav.kt-pager`） | 「つぎのページ」が押せなくなるまで |
 *
 * **開いた場所の数を、必ず分母として出す。** 開けなかった面も隠さず並べる。
 *
 * ## 数える前に対照を通す
 *
 * 作り物の面をその場で組んで、**拾ってほしい6件を全部拾い、拾ってはいけない5件を
 * 拾わないこと**を見る。1つでも外したら**面の数字を1つも出さずに**終了コード2で落ちる。
 * 囮は、過去に踏んだ形をそのまま入れてある（隠れている要素・字が別の要素に割れている・
 * 押さないと出ない中身・「少ない」のような紛らわしい語・長すぎる地の文）。
 *
 * 壊しかたは3つ。どれも過去に実際にやった数えかた。
 *
 * - `BREAK=noopen` — 押さずに数える（#116 の「開いている1枚しか見ていない」）
 * - `BREAK=leaf`   — 葉の要素だけ見る（#115 の「`<b>0</b>日` がどこにも引っかからない」）
 * - `BREAK=plain`  — 見えているかを見ない（隠れている字まで数える）
 *
 * 終了コード: 0＝候補なし / 1＝候補あり / 2＝数えるものが無い（対照が落ちた・面が読めない）。
 */
import { chromium } from "playwright-core";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./repo.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";

const run = promisify(execFile);
const PROD = "https://live-streaming-d3cac.web.app";
const SPORT = process.env.SPORT || "4340";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
/* 既定の書き出し先は、**この道具が置かれているリポジトリの中**から引く。
   worktree を切って並列で回すので、家のパスを焼き込むと隣の人の書き出しを読む。
   根の探しかたは `repo.mjs` に1本化した。`dirname` 3重は「この道具が
   `tools/sprites/` の直下に在る」を前提にしていて、写すと黙って外れる（#131）。
   `DIST` は絶対で渡されたらそのまま通る。 */
const DIST = fromRoot(process.env.DIST || `site/.next-${SPORT}`);
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
/** わざと壊す。`noopen` / `leaf` / `plain` */
const BREAK = process.env.BREAK || "";
const WAIT_MS = parseInt(process.env.WAIT_MS || "3000", 10);
/** 面を絞る（`ONLY=/friends.html`）。直す前と後を突き合わせるときに使う */
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
/**
 * ここより長い字は「地の文」とみなして候補にしない。
 *
 * 言い切りの欄は、**それだけで1つの要素**になっている（「今日は出ていません」9字、
 * 「まだ1枚もありません」10字）。旅の読みものは1段が数百字あって、その中の
 * 「〜ない」は状態の宣言ではない。**外した数は必ず出す**ので、疑うときは上げて見る。
 */
const MAXLEN = parseInt(process.env.MAXLEN || "44", 10);

/**
 * 言い切りの形。**上から順に当てて、最初に当たった名前を付ける。**
 *
 * 出発点は指示のとおり（〜ていません／ありません／いません／まだ／なし／未）。
 * そこへ、実際に面を見て足したものが4つある。
 *
 * - `無い`  — 「まだ無い」「なにも無い」。かなの「ない」とは別に書かれている
 * - `不明`  — 「わからない」「不明」。**知らないことを知らないと言っている**側だが、
 *             欄の値として出ていれば同じ形の候補になるので拾って人に見せる
 * - `ゼロ`  — `zeroclaim.mjs` は算用数字の 0 しか見ない。かなで書かれると漏れる
 * - `空`    — 「からっぽ」「空です」
 *
 * `ない` に読み飛ばしを入れてあるのは、**「少ない」「危ない」「勿体ない」が
 * 否定ではない**から。対照の囮がこれを見張っている。
 */
const PATS = [
  { name: "ていません", re: "てい(?:ませんでした|ません)" },
  { name: "ていない", re: "てい(?:なかった|ない)(?![ぁ-ん])" },
  { name: "ありません", re: "(?:あり|ござい)ませ(?:んでした|ん)" },
  { name: "いません", re: "(?<!て)いませ(?:んでした|ん)" },
  { name: "ません", re: "ませ(?:んでした|ん)" },
  { name: "ない（言い切り）", re: "(?<!少|危|汚|勿体|切|はか)な(?:かった|い)(?:[。、．，）)」』\\]!！?？]|$)" },
  { name: "無い", re: "無(?:かった|い|し)" },
  { name: "まだ", re: "まだ" },
  { name: "なし", re: "な[しシ](?![ぁ-ん])" },
  { name: "未〜", re: "未(?:定|登録|入力|設定|取得|回答|公開|着|完了|使用|選択|記入|反映|確認|読)" },
  { name: "不明", re: "不明|わから(?:ない|ず|ません)|分から(?:ない|ず|ません)" },
  { name: "ゼロ", re: "ゼロ" },
  { name: "空っぽ", re: "からっぽ|空っぽ|空です" },
];

/**
 * 面を1枚、**開けるところを開きながら**読む。**ページの中で動く。**
 *
 * `root` を渡せるようにしてあるのは、**同じ関数を対照にも当てるため。**
 * 作り物の面に当てて読み手と開き手の両方を試してから、本物に当てる。
 *
 * 返すのは候補（`t` 当たった字 / `where` どの要素 / `pat` どの形 / `view` どの札で）と、
 * **開いた場所の数**（`spots`）と、**長すぎて外した数**（`long`）。
 */
const DRIVE = async (root, opt) => {
  const { pats, maxlen, broken } = opt;
  const res = pats.map((p) => ({ name: p.name, re: new RegExp(p.re) }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const spots = { fold: 0, toggle: 0, longer: 0, tab: 0, sheet: 0 };
  const out = [];
  const seen = new Set();
  /** 長すぎて外した字。**札を替えるたびに同じ段を数え直さない**ので、中身で持つ */
  const longSeen = new Set();
  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  const which = (t) => {
    for (const r of res) if (r.re.test(t)) return r.name;
    return "";
  };
  const shown = (el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const pick = (view) => {
    const all = [...root.querySelectorAll("*")].filter(
      (el) => !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|TITLE|HEAD)$/.test(el.tagName),
    );
    /* **「葉だけ見る」にしない。** 図鑑の日数は `<b>0</b>日` で、字が別の要素に
       割れていた。葉だけ見ると単位に当たらず、親は「子に字がある」で飛ばされて、
       どこにも引っかからない（#115）。当たった要素のうち、**中にもっと小さい
       当たりを持たないもの**だけ残す。 */
    const match = all.filter((el) => {
      if (broken === "leaf" && el.children.length) return false;
      const t = txt(el);
      if (!t || !which(t)) return false;
      if (t.length > maxlen) {
        if (!el.children.length) longSeen.add(t);
        return false;
      }
      return true;
    });
    const inner = new Set(match);
    for (const el of match) {
      for (const o of match) {
        if (o !== el && el.contains(o)) {
          inner.delete(el);
          break;
        }
      }
    }
    const got = [];
    for (const el of inner) {
      // 壊しかた `plain`: 見えているかを見ない（隠れている字まで数える）
      if (broken !== "plain" && !shown(el)) continue;
      const t = txt(el);
      const cls =
        el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "";
      const where = el.tagName.toLowerCase() + cls;
      const key = where + "|" + t;
      if (seen.has(key)) continue;
      seen.add(key);
      got.push({ t: t.slice(0, 90), where, pat: which(t), view });
    }
    out.push(...got);
    return got;
  };

  /** 折りたたみ・畳んだ札・出し切りを開く。**札を替えるたびに呼び直す。** */
  const openAll = async () => {
    if (broken === "noopen") return;
    let did = 0;
    for (const d of root.querySelectorAll("details")) {
      if (!d.open) {
        d.open = true;
        spots.fold++;
        did++;
      }
    }
    for (const b of root.querySelectorAll('[aria-expanded="false"]')) {
      b.click();
      spots.toggle++;
      did++;
    }
    if (did) await sleep(160);
    /* 「あと◯件だす」は押すたびに増える。**上限で切らない**（Longer.tsx）ので、
       「たたむ」に変わるまで押し切る。回数に蓋をしてあるのは、押しても字が
       変わらない作りに当たったときに回り続けないため。 */
    for (let i = 0; i < 60; i++) {
      const bs = [...root.querySelectorAll("button.longer")].filter((b) =>
        /だす/.test(b.textContent || ""),
      );
      if (!bs.length) break;
      for (const b of bs) {
        b.click();
        spots.longer++;
      }
      await sleep(150);
    }
  };

  await openAll();
  pick("はじめ");

  /* 札（`[role="tab"]`）。図鑑の102枚もこれ。**1枚ずつ押して、そのつど読む。**
     押さずに数えると、開いている1枚ぶんしか見ないまま「0件」が出る（#116）。 */
  if (broken !== "noopen") {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      if (!t.isConnected) continue;
      t.click();
      spots.tab++;
      await sleep(140);
      await openAll();
      pick(`札 ${i + 1}/${tabs.length}`);
    }
  }

  /* 帳面の送り（`nav.kt-pager`）。端まで来ると押せなくなるので、それで止まる。 */
  if (broken !== "noopen") {
    for (let i = 0; i < 40; i++) {
      const nav = root.querySelector("nav.kt-pager");
      if (!nav) break;
      const next = [...nav.querySelectorAll("button")].find((b) => /つぎ/.test(b.textContent || ""));
      if (!next || next.disabled) break;
      next.click();
      spots.sheet++;
      await sleep(200);
      await openAll();
      pick(`帳面 ${i + 2}枚目`);
    }
  }

  return { hits: out, spots, long: longSeen.size };
};

/**
 * 対照。**作り物の面を組んで、読み手と開き手の両方を試す。**
 *
 * `want` が真なら拾ってほしい字、偽なら拾ってはいけない字。
 * 囮は、過去に踏んだ形をそのまま置いてある。
 */
const CASES = [
  ["そのまま出ている", "まだ1枚もありません", true],
  ["字が別の要素に割れている", "きょうは出ていません", true],
  ["折りたたみの中", "この国はまだ登録されていません", true],
  ["畳んだ札の中", "受け取ったものはありません", true],
  ["「あと◯件だす」の先", "いまは見つかりません", true],
  ["送りの2枚目", "この月はまだ押していません", true],
  ["隠れている（display:none）", "かくれた分はありません", false],
  ["隠れている（visibility:hidden）", "透けた分もありません", false],
  ["大きさが無い", "つぶれた分もありません", false],
  ["紛らわしい語（否定ではない）", "この道は車が少ない", false],
  ["長すぎる地の文", "たどり着けない日や、電波が切れる日もそのまま配信になる。宿が取れない晩もあるし、停まってくれる車が一台も来ない朝もある。", false],
];

/** 対照の面を組んで、`DRIVE` をそのまま当てる。**本物と同じ関数を通す。** */
const CONTROL = async (opt) => {
  const box = document.createElement("div");
  box.innerHTML = `
    <p>まだ1枚もありません</p>
    <p>きょうは<b>出て</b>いません</p>
    <details><summary>ひらく</summary><p>この国はまだ登録されていません</p></details>
    <div role="tablist">
      <button role="tab" aria-selected="true">いま</button>
      <button role="tab" aria-selected="false" id="ng-tab">あと</button>
    </div>
    <div id="ng-panel" hidden><p>受け取ったものはありません</p></div>
    <ul id="ng-more" hidden><li>いまは見つかりません</li></ul>
    <button type="button" class="longer">あと3件だす</button>
    <nav class="kt-pager">
      <button type="button" id="ng-prev" disabled>まえのページ</button>
      <span><b>1</b> / 2</span>
      <button type="button" id="ng-next">つぎのページ</button>
    </nav>
    <div id="ng-sheet"></div>
    <p style="display:none">かくれた分はありません</p>
    <p style="visibility:hidden">透けた分もありません</p>
    <p style="position:absolute;width:0;height:0;overflow:hidden">つぶれた分もありません</p>
    <p>この道は車が少ない</p>
    <p>たどり着けない日や、電波が切れる日もそのまま配信になる。宿が取れない晩もあるし、停まってくれる車が一台も来ない朝もある。</p>`;
  document.body.appendChild(box);
  // 押すと出る中身は、innerHTML の中の script では動かないのでここで配線する
  box.querySelector("#ng-tab").addEventListener("click", () => {
    box.querySelector("#ng-panel").removeAttribute("hidden");
  });
  const lg = box.querySelector("button.longer");
  lg.addEventListener("click", () => {
    box.querySelector("#ng-more").removeAttribute("hidden");
    lg.textContent = "たたむ";
  });
  box.querySelector("#ng-next").addEventListener("click", (e) => {
    box.querySelector("#ng-sheet").innerHTML = "<p>この月はまだ押していません</p>";
    e.currentTarget.disabled = true;
  });
  const r = await opt.drive(box, opt);
  box.remove();
  return opt.cases.map(([name, want, wantHit]) => ({
    name,
    want: wantHit,
    hit: r.hits.some((h) => h.t.includes(want)),
  }));
};

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.log(`${DIST} が無い。先に \`tools/build.sh ${SPORT}\` で書き出してください。`);
  process.exit(2);
}
const pages = walk(DIST)
  .sort()
  .filter((x) => !ONLY.length || ONLY.includes(x));
if (!pages.length) {
  console.log(`${DIST} に面が無い。先に書き出してください。`);
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** ブラウザの文脈をひとつ。`down` が真なら口を落とす。 */
async function makeCtx(down) {
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/\/island-api\//, async (r) => {
    if (down) return r.abort();
    const u = new URL(r.request().url());
    try {
      const { stdout } = await run("curl", ["-fsS", "--max-time", "40", PROD + u.pathname + u.search], {
        maxBuffer: 1 << 28,
        encoding: "buffer",
      });
      await r.fulfill({ status: 200, contentType: "application/json", body: stdout });
    } catch {
      await r.abort().catch(() => {});
    }
  });
  await offline(ctx);
  return ctx;
}

const ARGS = { pats: PATS, maxlen: MAXLEN, broken: BREAK };

/* 対照が先。落ちたら面の数字は出さない */
{
  const ctx = await makeCtx(true);
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/404.html`).catch(() => {});
  const got = await p.evaluate(
    async ({ args, cases, dsrc, csrc }) => {
      const drive = new Function("return " + dsrc)();
      const control = new Function("return " + csrc)();
      return await control({ ...args, cases, drive });
    },
    { args: ARGS, cases: CASES, dsrc: DRIVE.toString(), csrc: CONTROL.toString() },
  );
  let bad = 0;
  console.log("── 対照（作り物の面を、読み手と開き手が言い当てられるか）");
  for (const c of got) {
    const ok = c.hit === c.want;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "○" : "×"} ${c.name}: ${c.want ? "拾ってほしい" : "拾ってはいけない"} / ${c.hit ? "拾った" : "拾わなかった"}`,
    );
  }
  console.log(`  対照 ${got.length}件中 ${got.length - bad}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  await ctx.close();
  if (bad) {
    console.log(`対照が ${bad}件 外れた。**面の数字は出さない。**`);
    await b.close();
    process.exit(2);
  }
}

const miss = [];
const result = [];
const tally = { down: null, up: null };
for (const down of [true, false]) {
  const ctx = await makeCtx(down);
  const p = await ctx.newPage();
  const sum = { fold: 0, toggle: 0, longer: 0, tab: 0, sheet: 0, long: 0, seen: 0 };
  for (const page of pages) {
    const o = await openChecked(p, ORIGIN, page, { miss });
    if (!o.ok) continue;
    await p.waitForTimeout(WAIT_MS);
    /* 押して回るので、押した先が別の面へ飛ぶと読んでいる途中の窓ごと消える。
       そのときは**読めなかった面として残す。** 黙って落とすと、開けなかったぶんが
       「候補なし」に化ける（`docs/island-standards.md` §15）。 */
    let r;
    try {
      r = await p.evaluate(
        async ({ args, dsrc }) => {
          const drive = new Function("return " + dsrc)();
          return await drive(document.body, args);
        },
        { args: ARGS, dsrc: DRIVE.toString() },
      );
    } catch (e) {
      miss.push(`${page}（${down ? "落とす" : "通す"}／読んでいる途中で落ちた: ${String(e).slice(0, 80)}）`);
      continue;
    }
    sum.seen++;
    for (const k of ["fold", "toggle", "longer", "tab", "sheet"]) sum[k] += r.spots[k];
    sum.long += r.long;
    result.push({ page, down, hits: r.hits });
  }
  tally[down ? "down" : "up"] = sum;
  await ctx.close();
}
await b.close();

reportMissing(miss);

const byPage = new Map();
for (const r of result) {
  const e = byPage.get(r.page) || { down: [], up: [] };
  e[r.down ? "down" : "up"] = r.hits;
  byPage.set(r.page, e);
}

const key = (h) => h.where + "|" + h.t;
const A = [];
const B = [];
const C = [];
for (const [page, e] of byPage) {
  const up = new Map(e.up.map((h) => [key(h), h]));
  const dn = new Map(e.down.map((h) => [key(h), h]));
  for (const [k, h] of dn) (up.has(k) ? A : B).push({ page, ...h, upView: up.get(k)?.view });
  for (const [k, h] of up) if (!dn.has(k)) C.push({ page, ...h });
}

const line = (x) => `    ${x.page}  「${x.t}」  ${x.where}  ［${x.pat}／${x.view}］`;

console.log(`\n── 洗い出し（${pages.length}面 × 口を落とす/通す の2回・幅 ${WIDTH}px・${MAXLEN}字まで）`);
console.log(`  読めた面            落とす ${tally.down.seen} / 通す ${tally.up.seen}（全 ${pages.length}）`);
console.log(`  開いた折りたたみ    落とす ${tally.down.fold} / 通す ${tally.up.fold}`);
console.log(`  押した畳み（aria）  落とす ${tally.down.toggle} / 通す ${tally.up.toggle}`);
console.log(`  押した「あと◯だす」落とす ${tally.down.longer} / 通す ${tally.up.longer}`);
console.log(`  押した札（tab）     落とす ${tally.down.tab} / 通す ${tally.up.tab}`);
console.log(`  めくった帳面        落とす ${tally.down.sheet} / 通す ${tally.up.sheet}`);
console.log(`  長すぎて外した字    落とす ${tally.down.long} / 通す ${tally.up.long}（MAXLEN=${MAXLEN} を上げると見える）`);
console.log(`  読めなかった面      ${miss.length}`);

const byPat = new Map();
for (const x of [...A, ...B, ...C]) byPat.set(x.pat, (byPat.get(x.pat) || 0) + 1);
console.log(`\n  当たった形（${[...byPat].length}通り）`);
for (const p of PATS) {
  if (!byPat.has(p.name)) continue;
  console.log(`    ${String(byPat.get(p.name)).padStart(4)}  ${p.name}  /${p.re}/`);
}
const zero = PATS.filter((p) => !byPat.has(p.name)).map((p) => p.name);
if (zero.length) console.log(`    0件だった形: ${zero.join("・")}`);

console.log(`\n── C: 通したときだけ出る（${C.length}件）**読めた上での否定。1件ずつ人が読む**`);
for (const x of C) console.log(line(x));
if (!C.length) console.log("    なし");

console.log(`\n── B: 落としたときだけ出る（${B.length}件）**読めないことを「無い」と言っている**`);
for (const x of B) console.log(line(x));
if (!B.length) console.log("    なし");

console.log(`\n── A: 両方で出る（${A.length}件）口に関係なく出ている字`);
for (const x of A) console.log(line(x));
if (!A.length) console.log("    なし");

const total = A.length + B.length + C.length;
console.log(
  `\n  候補 ${total}件（A ${A.length} / B ${B.length} / C ${C.length}）。` +
    `**どれが嘘かは人が決める。** 誘い・お願い・本当に知っている否定はここに混ざっている`,
);
process.exit(total ? 1 : process.exitCode || 0);
