/**
 * 「もう一度よみこむ」を**押して、本当に読み直るか**を見る。
 *
 *   DIST=site/.next-4370 SPORT=4370 node tools/sprites/stateagain.mjs
 *   WIDTHS=390 ROUNDS=3 node tools/sprites/stateagain.mjs
 *   BREAK=blind  node tools/sprites/stateagain.mjs   # 札が消えたら直ったと数える（対照が落ちる）
 *   BREAK=reload node tools/sprites/stateagain.mjs   # 押すかわりに面を開き直す（見張りが落ちる）
 *
 * ## なぜ要るか
 *
 * `lib/liveStats.tsx` の控えは、**一度 `null` に固まると戻らなかった。**
 * 最初の `/state` が落ちた面では `loadState()` が同じ `null` を返し続けるので、
 * 表紙の「もう一度よみこむ」（`components/home/Latest.tsx`）は
 * **押しても必ず元に戻っていた。** 字は正直（「読みに行けなかった」）だが、
 * **押しどころが効かないのは、押しどころが無いのより悪い。**
 *
 * 目で見るだけでは、これは直ったように見える。押した瞬間に `setOff(false)` が
 * 走って札が消えるので、**壊れていても「押したら消えた」**のである。
 * だから数えかたを決めておく。
 *
 * ## 何を「直った」と数えるか
 *
 * 押したあと、次の**3つがそろったとき**だけ。
 *
 * 1. 「読みに行けなかった」の札が消えている
 * 2. 並んでいる配信が、**口が返した直近の2本**になっている
 *    （焼き込みの見本2本のままなら、読み直っていない）
 * 3. 押してから `/state` を**もう1本**叩いている（控えを捨てて読みに行った証拠）
 *
 * 1 だけで数えると、`setOff(false)` のぶんで**壊れた作りが満点を取る。**
 * それが `BREAK=blind`。対照がこれを落とす。
 *
 * ## 分母は「押した回数」ではなく「札が出て押せた回数」
 *
 * `isletalk.mjs` と同じ。札が出ていない回を押しても、それは「見ていない」であって
 * 「直らなかった」ではない。開けなかった回・札が出なかった回は数に入れず、
 * **何回開いて何回押したか**を必ず並べて出す（`docs/island-standards.md` §15）。
 *
 * ## 対照を2つ、先に通す
 *
 * - **対照A（口を落としたまま押す）** — 読み手は「直らなかった」と言わなければ
 *   ならない。1回でも「直った」と言ったら、**データを見ずに数えている。**
 * - **対照B（最初から口が通っている面）** — 読み手は「出ている」と言えなければ
 *   ならない。言えないなら、この道具は**どう転んでも「直った」と言えない。**
 *
 * どちらかが外れたら、**数字を1つも出さずに終了コード2**で落ちる。
 *
 * 見張りもうひとつ。**開いてから押すまでに面が入れ替わっていないこと。**
 * 面を開き直すと控えは作り直されるので、**壊れた作りでも直って見える**
 * （`BREAK=reload` がそれ）。入れ替わりを見たら、数字は出さない。
 *
 * ついでに2つ数える。どちらも直しの条件そのもの。
 *
 * - **口が通っている面で `/state` を何本叩いたか** — 10か所が読む便りなので、
 *   1本でなければ控えが効いていない
 * - **落ちたあと、押さずに置いたあいだに叩いた本数** — 0でなければ、
 *   口が落ちているあいだ叩き続ける作りになっている
 *
 * 終了コード: 0＝通った / 1＝直っていない（または叩きすぎ） / 2＝数えるものが無い。
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { offline } from "./route.mjs";
import { openChecked } from "./served.mjs";

const run = promisify(execFile);
const PROD = "https://live-streaming-d3cac.web.app";
const SPORT = process.env.SPORT || "4370";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
/* 既定の書き出し先は、**この道具が置かれているリポジトリの中**から引く。
   worktree を切って並列で回すので、家のパスを焼き込むと隣の人の書き出しを読む。 */
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIST = process.env.DIST || join(ROOT, "site", `.next-${SPORT}`);
const WIDTHS = (process.env.WIDTHS || "390,1280").split(",").map((s) => parseInt(s, 10));
/** 幅ごとに何回ぶん開いて押すか。1回だけだと「たまたま」を見分けられない */
const ROUNDS = parseInt(process.env.ROUNDS || "2", 10);
/** わざと壊す。`blind`＝札が消えたら直ったと数える / `reload`＝押さずに開き直す */
const BREAK = process.env.BREAK || "";
const PAGE = process.env.PAGE || "/";
/** 札が出るまで・直るまで待つ上限。`withRead` の 12秒より長く取る */
const WAIT_MS = parseInt(process.env.WAIT_MS || "20000", 10);
/**
 * 口が通っている面が `/state` を何本叩いてよいか。
 *
 * **既定は2本。** 1本は控え（`lib/liveStats.tsx` の `loadState`。10か所が
 * ここから配ってもらう）で、もう1本は `components/island/Theme.tsx` が
 * **控えを通さず直に叩いている**ぶん（島の景色を決めるため。`app/layout.tsx` に
 * 置いてあるので全部の面で1本ずつ増える）。
 * ここが増えたら、控えを通さない読み手がもう1人できたということ。
 */
const EXPECT = parseInt(process.env.EXPECT || "2", 10);
/** 落ちたあと、押さずに置いておく時間（ここで叩いたら「勝手に叩いている」） */
const IDLE_MS = parseInt(process.env.IDLE_MS || "8000", 10);

/** 面の中で1回ぶん読む。**札の有無と、並んでいる配信の id を両方持って帰る。** */
const READ = () => {
  const off = [...document.querySelectorAll(".blank.is-off")].find((e) =>
    /今夜までの配信/.test(e.textContent || ""),
  );
  const ids = [...document.querySelectorAll(".scards .scard")].map((a) => {
    const m = /[?&]v=([^&]+)/.exec(a.getAttribute("href") || "");
    return m ? m[1] : "";
  });
  return { off: !!off, press: !!off?.querySelector("button"), ids };
};

/** 押す。**札の中のボタンだけを押す**（面のどこかを押しても何も起きない） */
const PRESS = () => {
  const off = [...document.querySelectorAll(".blank.is-off")].find((e) =>
    /今夜までの配信/.test(e.textContent || ""),
  );
  const b = off?.querySelector("button");
  if (!b) return false;
  b.click();
  return true;
};

/** 直ったか。**3つそろって初めて「直った」**（`BREAK=blind` は1つ目しか見ない） */
const settled = (r, live, hits) =>
  BREAK === "blind"
    ? !r.off
    : !r.off && r.ids.length >= live.length && live.every((v, i) => r.ids[i] === v) && hits > 0;

async function until(p, fn, ms) {
  for (let t = 0; t < ms; t += 250) {
    const r = await p.evaluate(READ);
    if (fn(r)) return r;
    await p.waitForTimeout(250);
  }
  return null;
}

/** ブラウザの文脈をひとつ。`st.down` を切り替えると、その場で口が落ちる／通る。 */
async function makeCtx(b, w, st) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/\/island-api\//, async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith("/state")) st.hits.push(Date.now());
    if (st.down) return r.abort();
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
  /* 絵の差し替えは口と別。**落としているのは `/state` の返事だけ**で、
     住人の絵は本物を返す（`route.mjs`。あとに登録したほうが先に当たる） */
  await offline(ctx);
  return ctx;
}

/**
 * 1回ぶん。落とした面を開いて、札が出たら口を通して、押して、見る。
 *
 * `up` が真なら最初から口が通っている（対照B）。`keepDown` が真なら
 * 押すときも落としたまま（対照A）。
 */
async function once(b, w, live, { up = false, keepDown = false } = {}) {
  const st = { down: !up, hits: [] };
  const ctx = await makeCtx(b, w, st);
  const p = await ctx.newPage();
  const out = { opened: false, pressed: false, fixed: false, why: "", hitsOpen: 0, hitsIdle: 0, hitsPress: 0, navs: 0, ids: [] };
  const r = await openChecked(p, ORIGIN, PAGE, {});
  if (!r.ok) {
    out.why = `面が開けなかった（${r.why}）`;
    await ctx.close();
    return out;
  }
  /* **面が入れ替わっていないことの見張り。** `framenavigated` は Next が
     水あわせのときに打つ `replaceState` でも鳴るので、印のほうで見る。
     本当に開き直されたときだけ、この印は消える。 */
  await p.evaluate(() => {
    window.__stateagain = 1;
  });

  if (up) {
    // 対照B。**読み手が「出ている」と言えるか**だけを見る（押さない）
    const got = await until(p, (x) => !x.off && live.every((v, i) => x.ids[i] === v), WAIT_MS);
    out.opened = !!got;
    out.ids = got?.ids ?? (await p.evaluate(READ)).ids;
    out.hitsOpen = st.hits.length;
    if (!got) out.why = "口が通っているのに、直近の2本が出てこない";
    await ctx.close();
    return out;
  }

  // 札が出るまで待つ。出ない回は**数えない**（「直らなかった」ではなく「見ていない」）
  const shown = await until(p, (x) => x.off && x.press, WAIT_MS);
  if (!shown) {
    out.why = "落とした面に「もう一度よみこむ」が出なかった";
    out.hitsOpen = st.hits.length;
    await ctx.close();
    return out;
  }
  out.opened = true;
  out.hitsOpen = st.hits.length;

  // **押さずに置く。** ここで叩いていたら、落ちている口を叩き続けている
  await p.waitForTimeout(IDLE_MS);
  out.hitsIdle = st.hits.length - out.hitsOpen;

  if (!keepDown) st.down = false; // 口を通す
  const before = st.hits.length;
  if (BREAK === "reload") {
    // 壊しかた: 押すかわりに開き直す。**控えが作り直されるので、壊れた作りでも直る**
    await p.reload({ waitUntil: "domcontentloaded" });
    out.pressed = true;
  } else {
    out.pressed = await p.evaluate(PRESS);
  }
  if (!out.pressed) {
    out.why = "札は出ているのに、押しどころが押せなかった";
    await ctx.close();
    return out;
  }
  const done = await until(p, (x) => settled(x, live, st.hits.length - before), WAIT_MS);
  out.hitsPress = st.hits.length - before;
  out.fixed = !!done;
  out.ids = (done ?? (await p.evaluate(READ))).ids;
  out.navs = (await p.evaluate(() => window.__stateagain)) === 1 ? 0 : 1;
  await ctx.close();
  return out;
}

if (!existsSync(DIST)) {
  console.log(`${DIST} が無い。先に \`tools/build.sh ${SPORT}\` で書き出してください。`);
  process.exit(2);
}

/* 口が返す直近の2本。**画面と突き合わせる相手**なので、先に取っておく */
let live = [];
try {
  const { stdout } = await run("curl", ["-fsS", "--max-time", "40", `${PROD}/island-api/state`], {
    maxBuffer: 1 << 28,
  });
  live = (JSON.parse(stdout)?.stats?.latest ?? []).slice(0, 2).map((v) => v.video_id);
} catch (e) {
  console.error(`本番の /state が読めませんでした（${String(e).slice(0, 80)}）。数字は出しません。`);
  process.exit(2);
}
if (live.length < 2 || live.some((v) => !v)) {
  console.error("本番の /state に直近の2本が無い。突き合わせる相手が無いので数えません。");
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

console.log(`「もう一度よみこむ」を押して直るか  ${ORIGIN}${PAGE}  幅 ${WIDTHS.join(" / ")} × ${ROUNDS}回`);
console.log(`口が返す直近の2本: ${live.join(" , ")}`);
if (BREAK) console.log(`**道具をわざと壊しています（BREAK=${BREAK}）**`);

/* ---- 対照B。読み手が「出ている」と言えるか ---- */
const cw = WIDTHS[0];
const cb = await once(b, cw, live, { up: true });
console.log(
  `\n対照B（最初から口が通っている面）  幅${cw}\n` +
    `  読み手が直近の2本を見つけた: ${cb.opened ? "はい" : "いいえ"} / 出ていた id ${cb.ids.join(" , ") || "（無し）"}\n` +
    `  この面が叩いた /state: ${cb.hitsOpen}本`,
);
if (!cb.opened) {
  console.error(`\n対照Bが通りませんでした（${cb.why}）。\n**この道具は、どう転んでも「直った」と言えません。** 数字は出しません。`);
  await b.close();
  process.exit(2);
}

/* ---- 対照A。口を落としたまま押して、「直った」と言わないか ---- */
const ca = [];
for (let i = 0; i < ROUNDS; i++) ca.push(await once(b, cw, live, { keepDown: true }));
const caOpen = ca.filter((x) => x.opened).length;
const caPress = ca.filter((x) => x.pressed).length;
const caFix = ca.filter((x) => x.fixed).length;
console.log(
  `\n対照A（口を落としたまま押す）  幅${cw}\n` +
    `  開いた ${caOpen} / 押した ${caPress} / **直ったと数えた ${caFix}**（0でなければならない）`,
);
for (const x of ca) if (x.why) console.log(`    ${x.why}`);
if (!caOpen || !caPress) {
  console.error("\n対照Aで札が出ませんでした。押していないので、ここから先は数えません。");
  await b.close();
  process.exit(2);
}
if (caFix) {
  console.error(
    `\n対照Aが通りませんでした。口は落としたままなのに ${caFix}回「直った」と数えています。\n` +
      "**この道具は、届いた中身を見ずに『札が消えたか』だけを見ています**" +
      "（押すと `setOff(false)` で必ず消える）。数字は出しません。",
  );
  await b.close();
  process.exit(2);
}
console.log("  → 落ちたままなら「直った」と言わない。ここから数字を出します");

/* ---- 本番（手元に配ったもの） ---- */
let opened = 0;
let pressed = 0;
let fixed = 0;
let idle = 0;
let navs = 0;
const blind = [];
const rows = [];
for (const w of WIDTHS) {
  for (let i = 0; i < ROUNDS; i++) {
    const x = await once(b, w, live);
    if (!x.opened) {
      blind.push(`幅${w} #${i + 1}（${x.why}）`);
      rows.push(`幅${w} #${i + 1}  ${x.why}`);
      continue;
    }
    opened++;
    if (x.pressed) pressed++;
    if (x.fixed) fixed++;
    idle += x.hitsIdle;
    navs += x.navs;
    rows.push(
      `幅${w} #${i + 1}  札が出た / 押した ${x.pressed ? "はい" : "いいえ"} / ` +
        `**直った ${x.fixed ? "はい" : "いいえ"}** / 出ている id ${x.ids.join(" , ")}\n` +
        `          開くまでに叩いた /state ${x.hitsOpen}本 / 押さずに${IDLE_MS / 1000}秒 置いて ${x.hitsIdle}本 / ` +
        `押して ${x.hitsPress}本${x.navs ? " / **面が入れ替わった**" : ""}`,
    );
  }
}
await b.close();

console.log("");
for (const r of rows) console.log(r);
console.log(
  `\n合計  札が出た ${opened}回 / 押した ${pressed}回 / **押して直った ${fixed} / ${opened}**\n` +
    `      押さずに置いたあいだに叩いた /state ${idle}本（0であること）\n` +
    `      口が通っている面が叩いた /state ${cb.hitsOpen}本（${EXPECT}本であること）`,
);

if (navs) {
  console.error(
    `\n押すまでに面が ${navs}回 入れ替わっています。**開き直すと控えは作り直される**ので、` +
      "壊れたままでも直って見えます。数字は当てになりません。",
  );
  process.exit(2);
}
if (blind.length) {
  console.error(
    `\n見ていない回が ${blind.length} 件あります: ${blind.join(" , ")}\n` +
      "**「直らなかった」ではなく「見ていない」です**（`docs/island-standards.md` §15）。",
  );
  process.exit(2);
}
if (!opened) {
  console.error("\n札が1回も出ませんでした。数えるものがありません。");
  process.exit(2);
}
if (fixed < opened) {
  console.error(`\nだめ: 押して直ったのは ${fixed} / ${opened} 回。**押しても元に戻っています。**`);
  process.exit(1);
}
if (idle) {
  console.error(`\nだめ: 押されていないのに /state を ${idle}本 叩いています。口が落ちているあいだ叩き続けます。`);
  process.exit(1);
}
if (cb.hitsOpen !== EXPECT) {
  console.error(
    `\nだめ: 口が通っている面が /state を ${cb.hitsOpen}本 叩いています（${EXPECT}本のはず）。\n` +
      "控えが効いていないか、控えを通さない読み手が増えています。",
  );
  process.exit(1);
}
console.log(`押したら読み直る。控えも効いている（開いて ${EXPECT}本・押して1本ずつ）`);
process.exit(0);
