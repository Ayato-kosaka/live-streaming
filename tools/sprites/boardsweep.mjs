/**
 * `/board`（掲示板）の押しどころを、**場面ごとに**測る。
 *
 *   tools/build.sh 3300
 *   python3 -m http.server 4300 --directory site/.next-3300 &
 *   cd tools/sprites
 *   SPORT=4300 PROBE=1 ONLY=plan-down,note-down node boardsweep.mjs  # まず自己確認
 *   SPORT=4300 node boardsweep.mjs                                   # 数はこちら
 *   READ=1 node boardsweep.mjs                                       # 前の回を読み直すだけ
 *   PROD=1 node boardsweep.mjs                                       # 出したものを、本番で
 *
 * **数は `PROBE` を付けない回から読む。** 仕込みは画面の左上に固定で置くので、
 * そこにいる看板の「あやと島」が毎回「上に何かいる」で測れずに落ちる。
 * 自己確認と数取りは、別の回にする。
 *
 * ## なぜ要るのか
 *
 * 全130面を掃き出す `foldsweep.mjs` は、**畳み（`<details>`）は開くが、
 * 札で切り替える面は開かない。** 掲示板は `.bd-pane` が2つあって
 * **同時に1つしか出ない**ので、出ていないほうの中身は毎回
 * `display:none` として「数えなかったもの」に落ちる。
 * 落ちた数は内訳に出るが、**それが 48px を割っているかどうかは分からない。**
 * つまり「掲示板は割れ0件」は、**片方の札しか見ていない0件**だった
 * （`docs/island-misses.md` #85 と同じ形。あちらは畳み、こちらは札）。
 *
 * **force では開かない。** `hidden` を外して両方いっぺんに出すと、
 * 誰も見ていない姿を測ることになる。**実際に札を押して、出た姿で測る。**
 *
 * ## 場面の作りかた
 *
 * 手本は `mesweep.mjs`。あちらは `/me` を道具1つずつ押して撮る。
 * こちらが違うのは、**押しどころの出かたが「口が返した中身」で変わる**こと。
 * 静的に配った書き出しには `/island-api/*` が無いので、何も差し込まないと
 * 両方の札が「読みに行けなかった」になり、**視聴者さんが書く欄は1つも出ない。**
 * 口は `boardseed.mjs`（入っていない人）と `asme.mjs`（入っている人・あやと）で作る。
 *
 * ## 場面が作れたかを、測る前に確かめる
 *
 * 札を押しそこねても、画面は静かに前の姿のまま測れてしまう。
 * それは「その場面を測った」ではなく「同じ場面を2回測った」で、
 * **数は増えないのに表は埋まる。** だから場面ごとに**印**（`want`）を持たせて、
 * 出ていなければその行を「場面が作れず」として落とす。
 *
 * ## 自己確認（`PROBE=1`）
 *
 * 2本立てで確かめる。**片方だけでは足りない。**
 *   1. `hitbox.mjs` の仕込み（畳みの中の 40px が割れに挙がるか）
 *   2. **この道具のための仕込み**。出ていないほうの `.bd-pane` に 40px を入れて、
 *      **企画の札の場面では挙がらず、付箋の札の場面では挙がる**ことを見る。
 *      これが「札を押して中を見にいけている」ことの、ただ一つの証拠になる。
 *      同じものを `/` の `.today-fold` にも入れる（閉じている／開いた の対）。
 *
 * 出るもの: /tmp/boardsweep/<scene>-<幅>.png と report.json、画面のまとめ。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";
import { openFolds, measure, fmtHit, SEL_ALL, addProbe, delProbe, isProbe, probeVerdict } from "./hitbox.mjs";
import { seedBoard, MY_PLAN_ID } from "./boardseed.mjs";
import { apply as asme } from "./asme.mjs";
import { viaCurl, ORIGIN } from "./prod.mjs";

const SPORT = process.env.SPORT || "4300";
const PROD = process.env.PROD === "1";
const MIN = Number(process.env.MIN || 48);
const OUT = process.env.OUT || (PROD ? "/tmp/boardsweep-prod" : "/tmp/boardsweep");
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800").split(",").map((s) => s.split("x").map(Number));
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const DPR = Number(process.env.DPR || 2);

/* ------------------------------------------------------------------ *
 * 押す道具。**字で押す。** 並びが変わっても同じものが押せる            *
 * ------------------------------------------------------------------ */
const tap = async (p, sel, opts = {}) => {
  const l = opts.text ? p.locator(sel, { hasText: opts.text }) : p.locator(sel);
  await l.nth(opts.nth ?? 0).click({ timeout: 5000 });
  await p.waitForTimeout(opts.wait ?? 700);
};
const toNote = (p) => tap(p, ".mp-tab", { text: "付箋をはる", wait: 900 });
/* **出ているほうの札の中だけを押す。** 出ていないほうの `.bd-pane` にも
   同じ形の押しどころ（`.longer` `.nt-bin`）があって、素の `.first()` は
   そちらを掴む。掴んだ先は `display:none` なので押せず、**押せなかった場面が
   前の場面のまま測られる**（実際に「付箋の あと◯枚だす」と「しまったものを
   見る」の2場面が、押す前と1バイト違わない絵になっていた）。 */
const IN = ".bd-pane:not([hidden]) ";
/** 「あと◯枚だす」を、出し切るまで押す */
const pushLonger = async (p) => {
  for (let i = 0; i < 6; i++) {
    const b = p.locator(`${IN}.longer`).first();
    if (!(await b.count())) break;
    if (/たたむ/.test(await b.innerText())) break;
    await b.click({ timeout: 5000 });
    await p.waitForTimeout(500);
  }
};

/* ------------------------------------------------------------------ *
 * 場面表                                                              *
 *                                                                     *
 * seed … "none"  口が無い（静的な書き出しそのまま。旧の掃き出しと同じ）  *
 *        "ok"    入っていない人＋口は生きている（いちばん多い姿）        *
 *        "empty" 読めた上での0件                                       *
 *        "wait"  返ってこない                                          *
 *        "login" 入っている人（`asme.mjs`）                             *
 *        "admin" あやと（`asme.mjs` の ADMIN）                          *
 * want … その場面になった印。**出ていなければ測らない**                 *
 * ------------------------------------------------------------------ */
const SCENES = [
  /* ---- 口が落ちている日。**旧の掃き出しが見ていたのはここだけ** ---- */
  {
    id: "plan-down", page: "/board", seed: "none",
    say: "企画の札（着いたまま）／口が落ちている",
    want: '.bd-pane:not([hidden]) .blank.is-off',
  },
  {
    id: "note-down", page: "/board", seed: "none", act: toNote,
    say: "付箋の札を押した／口が落ちている ← 旧で測れなかった14個はここ",
    want: '.bd-pane:not([hidden]) .nb-tabs',
  },
  /* ---- 返ってこない日。押しどころは出ない（骨だけ）が、表には要る ---- */
  {
    id: "plan-wait", page: "/board", seed: "wait", nowait: true,
    say: "企画の札／まだ返ってきていない",
    want: ".bd-list.is-wait",
  },
  {
    id: "note-wait", page: "/board", seed: "wait", nowait: true, act: toNote,
    say: "付箋の札／まだ返ってきていない",
    want: ".nx-notes.is-wait",
  },
  /* ---- 口が生きている日（入っていない人）。ここがいちばん多い姿 ---- */
  {
    id: "plan", prod: true, page: "/board", seed: "ok",
    say: "企画の札／並んでいる（入っていない人）",
    want: ".bd-write textarea",
  },
  {
    id: "plan-ask", page: "/board", seed: "ok", poll: true,
    say: "企画の札／島でおたずねを押してきた人",
    want: ".bd-bridge-go",
  },
  {
    id: "plan-posted", page: "/board", seed: "ok",
    say: "企画の札／出した直後",
    act: async (p) => {
      await p.locator(".bd-write textarea").fill("島に温泉を作る回をやってほしい");
      await tap(p, ".bd-write .bbtn", { wait: 1200 });
    },
    want: ".bd-done-go",
  },
  {
    id: "plan-empty", page: "/board", seed: "empty",
    say: "企画の札／読めた上で1件も無い",
    want: ".bd-empty-go",
  },
  {
    id: "plan-mine", page: "/board", seed: "ok", mine: true,
    say: "企画の札／自分が出したものだけ",
    act: (p) => tap(p, `${IN}.bsort button`, { text: "じぶんの" }),
    want: ".bsort button.is-on",
  },
  {
    id: "plan-longer", prod: true, page: "/board", seed: "ok",
    say: "企画の札／「あと◯件だす」を押し切った",
    act: pushLonger,
    want: `${IN}.longer`, wantText: "たたむ",
  },
  /* ---- 入っている人 ---- */
  {
    id: "plan-login", page: "/board", seed: "login",
    say: "企画の札／入っている人（名前の欄が札になる・ログインの畳みが消える）",
    want: ".bin-locked",
  },
  /* ---- あやと ---- */
  {
    id: "plan-owner", page: "/board", seed: "admin",
    say: "企画の札／あやと（段を動かす・しまう が出る）",
    want: ".bd-own .nt-obtn",
  },
  {
    id: "plan-owner-open", page: "/board", seed: "admin",
    say: "企画の札／あやとが「段を動かす」を押した",
    act: (p) => tap(p, `${IN}.bd-own .nt-obtn`, { text: "段を動かす" }),
    want: ".bd-own .nt-obox select",
  },
  {
    id: "plan-owner-bin", page: "/board", seed: "admin",
    say: "企画の札／あやとが「しまったものを見る」を押した",
    act: (p) => tap(p, `${IN}.nt-bin`, { wait: 1500 }),
    want: `${IN}.nt-bin`, wantText: "出ているものに戻る",
  },
  /* ---- 付箋の札 ---- */
  {
    id: "note", prod: true, page: "/board", seed: "ok", act: toNote,
    say: "付箋の札／並んでいる（入っていない人）",
    want: ".nt-open",
  },
  {
    id: "note-write", prod: true, page: "/board", seed: "ok",
    say: "付箋の札／書く欄をひらいた",
    act: async (p) => { await toNote(p); await tap(p, `${IN}.nt-open`); },
    want: ".nt-write textarea",
  },
  {
    id: "note-blank", prod: true, page: "/board", seed: "ok",
    say: "付箋の札／1枚も貼られていない棚を選んだ",
    act: async (p) => { await toNote(p); await tap(p, `${IN}.nb-tab`, { text: "ポーランド" }); },
    want: ".blank-go",
  },
  {
    id: "note-longer", prod: true, page: "/board", seed: "ok",
    say: "付箋の札／「あと◯枚だす」を押し切った",
    act: async (p) => { await toNote(p); await pushLonger(p); },
    want: `${IN}.longer`, wantText: "たたむ",
  },
  {
    id: "note-down-ok", page: "/board", seed: "empty", act: toNote,
    say: "付箋の札／読めた上で0枚",
    want: ".blank-go",
  },
  {
    id: "note-owner", page: "/board", seed: "admin", act: toNote,
    say: "付箋の札／あやと（返信する・しまう が出る）",
    want: ".nt-own .nt-obtn",
  },
  {
    id: "note-owner-open", page: "/board", seed: "admin",
    say: "付箋の札／あやとが「返信する」を押した",
    act: async (p) => { await toNote(p); await tap(p, `${IN}.nt-own .nt-obtn`, { text: "返信" }); },
    want: ".nt-own .nt-obox textarea",
  },
  {
    id: "note-owner-bin", page: "/board", seed: "admin",
    say: "付箋の札／あやとが「しまったものを見る」を押した",
    act: async (p) => { await toNote(p); await tap(p, `${IN}.nt-bin`, { wait: 1500 }); },
    want: `${IN}.nt-bin`, wantText: "貼ってあるものに戻る",
  },
  /* ---- トップの畳み（`.today-fold`）。同じ形がもう1つある ---- */
  {
    id: "today-shut", prod: true, page: "/", seed: "none",
    say: "トップ／今日の島は閉じたまま",
    want: ".today-tab",
  },
  {
    id: "today-open", prod: true, page: "/", seed: "none",
    say: "トップ／今日の島をひらいた",
    act: (p) => tap(p, ".today-tab", { wait: 900 }),
    want: '.today-fold:not([hidden]) .today-go',
  },
];

/* ------------------------------------------------------------------ *
 * `Board.tsx` / `Notes.tsx` の側から見た、押しどころの出どころ         *
 *                                                                     *
 * **表の行数を数えても、数え漏れは見つからない。**（漏れた場面は表にも  *
 * 無いので、行数どうしは必ず合う。）だから**画面の側の分かれ道を並べて**  *
 * 「どの場面で出るか」を書き、その場面でそれが**実際に出ていたか**を     *
 * 機械で確かめる。出ていなければ、その分かれ道は測れていない。          *
 * ------------------------------------------------------------------ */
const BRANCHES = [
  // Board.tsx
  ["Board.tsx .bd-pick の札", ".mp-tab", 2, "plan"],
  ["Board.tsx 名前の欄（入っていない人）", ".bd-write input.bin", 1, "plan"],
  ["Board.tsx 本文の欄", ".bd-write textarea", 1, "plan"],
  ["Board.tsx 「出す」", ".bd-write .bbtn", 1, "plan"],
  ["Board.tsx 書き出しの札", ".nx-seed", 4, "plan"],
  ["Board.tsx むちゃの証拠（伝説へ）", ".bd-write .chip.link", 5, "plan"],
  ["Board.tsx ページ1枚で書く", '.bd-write a.tile[href*="/next/new"]', 1, "plan"],
  ["Board.tsx ログインの畳み（入っていない人）", ".bd-write details.fold summary", 1, "plan"],
  ["Board.tsx 畳みの中のログイン", ".bd-write .signin-go", 1, "plan"],
  ["Board.tsx 並べ替え", ".bsort button", 2, "plan"],
  ["Board.tsx ハート", ".bd-list .vote", 1, "plan"],
  ["Board.tsx 立ったページへ", ".bd-list .bd-go", 1, "plan"],
  ["Board.tsx これから／伝説のタイル", 'section.panel a.tile[href="/next"]', 1, "plan"],
  ["Board.tsx もっと出す", ".longer", 1, "plan"],
  ["Board.tsx おたずねの橋", ".bd-bridge-go", 1, "plan-ask"],
  ["Board.tsx 出したあとの「くわしく書く」", ".bd-done-go", 1, "plan-posted"],
  ["Board.tsx 空の板の「いちばんに出す」", ".bd-empty-go", 1, "plan-empty"],
  ["Board.tsx 「じぶんの◯」", ".bsort button.is-on", 1, "plan-mine"],
  ["Board.tsx 自分のものを直す", '.bd-list a.bd-go[href*="/next/new"]', 1, "plan-mine"],
  ["Board.tsx 読み直す（板）", ".bd-pane:not([hidden]) .blank-go", 1, "plan-down"],
  ["Board.tsx 入っている人の行き先", '.bd-write a.tile[href="/me"]', 1, "plan-login"],
  ["Board.tsx あやとの道具", ".bd-own .nt-obtn", 2, "plan-owner"],
  ["Board.tsx しまったものを見る", ".nt-bin", 1, "plan-owner"],
  ["Board.tsx 段を動かす（開いた中）", ".bd-own .nt-obox select", 1, "plan-owner-open"],
  ["Board.tsx 結び付け先の欄", ".bd-own .nt-obox input", 1, "plan-owner-open"],
  ["Board.tsx 「動かす」", ".bd-own .nt-obox .bbtn", 1, "plan-owner-open"],
  // Notes.tsx（付箋の札の中）
  ["Notes.tsx 宛先の札", ".nb-tab", 12, "note"],
  ["Notes.tsx この話をしている場所へ", ".nb-go", 1, "note"],
  ["Notes.tsx 書く欄をひらく", ".nt-open", 1, "note"],
  ["Notes.tsx 付箋のハート", ".nt-heart", 1, "note"],
  ["Notes.tsx もっと出す（付箋）", ".bd-pane:not([hidden]) .longer", 1, "note"],
  ["Notes.tsx 名前の欄", ".nt-write input.bin", 1, "note-write"],
  ["Notes.tsx 本文の欄", ".nt-write textarea", 1, "note-write"],
  ["Notes.tsx 「はりだす」", ".nt-write .bbtn", 1, "note-write"],
  ["Notes.tsx いちばんに貼る", ".blank-go", 1, "note-blank"],
  ["Notes.tsx 読み直す（付箋）", ".bd-pane:not([hidden]) .blank-go", 1, "note-down"],
  ["Notes.tsx あやとの道具", ".nt-own .nt-obtn", 2, "note-owner"],
  ["Notes.tsx 返信の欄", ".nt-own .nt-obox textarea", 1, "note-owner-open"],
  ["Notes.tsx 「返す」", ".nt-own .nt-obox .bbtn", 1, "note-owner-open"],
  // Today.tsx
  ["Today.tsx 今日の島の札", ".today-tab", 1, "today-shut"],
  ["Today.tsx 畳みの中の行き先", ".today-fold .today-go", 1, "today-open"],
  ["Today.tsx 掲示板への橋", ".today-fold .poll-why", 1, "today-open"],
];

/* ------------------------------------------------------------------ *
 * この道具のための仕込み                                              *
 *                                                                     *
 * 40px を**出ていないほうの中**に置く。企画の札では挙がらず、付箋の札で  *
 * 挙がる——その差だけが「札を押して中を見にいけている」ことの証拠。      *
 * `hitbox.mjs` の仕込み（畳みの中）とは別のものを見ているので、両方要る。 *
 * ------------------------------------------------------------------ */
const BD_PROBE = `(() => {
  document.getElementById("bdprobe")?.remove();
  const host =
    document.querySelectorAll(".bd-pane")[1] ||   // 掲示板：付箋の札のほう
    document.querySelector(".today-fold");        // トップ：今日の島の中
  if (!host) return false;
  const a = document.createElement("a");
  a.id = "bdprobe"; a.href = "/"; a.textContent = "板";
  /* **重なり順を上げる。** 板の中に素で入れると、隣の押しどころに
     覆われて「測れず」に落ち、挙がるはずの回で挙がらなくなる */
  a.style.cssText = "position:relative;z-index:999;display:block;width:40px;height:40px;font-size:9px;line-height:40px;overflow:hidden;background:#06c;color:#fff";
  host.insertBefore(a, host.firstChild);
  return true;
})()`;
const isBdProbe = (r) => r.t === "板";

/* 場面ごとに「仕込みが挙がるべきか」。**出ていないほうに入れてあるので、
   企画の札・閉じた今日の島では挙がらないのが正しい。** */
const bdProbeWant = (sc) =>
  sc.page === "/" ? sc.id === "today-open" : /^note/.test(sc.id);

/* ------------------------------------------------------------------ */

mkdirSync(OUT, { recursive: true });

/* **測るのと、読み上げるのを分ける。** 1回の掃き出しに10分かかるので、
   読み上げの書き方を直すたびに測り直していると、直すほど数が古くなる。
   `READ=1` は測らずに、前の回の `report.json` をそのまま読み上げる。 */
if (process.env.READ) {
  say(JSON.parse(readFileSync(`${OUT}/report.json`, "utf8")));
  process.exit(0);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = [];
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  /* **本番で回してよい場面だけ回す**（`prod: true`）。
     理由は2つ。**(1) 押すと本番に書いてしまう場面がある**（「出した直後」は
     板に1件ほんとうに出す）。**(2) 差し込みでしか作れない場面がある**——
     あやとの道具・入っている人・0件・返ってこない は、本番では作れない。
     作れない場面を回すと「場面が作れず」がずらりと並んで、**本当に作れなかった
     ものが埋もれる。** */
  if (PROD && !sc.prod) continue;
  for (const [W, H] of WIDTHS) {
    const ctx = await b.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: DPR,
      isMobile: W < 900, hasTouch: W < 900,
      reducedMotion: "reduce",
    });
    /* 差し込みの順は**あとに書いたものが勝つ**（Playwright）。
       本番を見るときは curl 経由を先に敷いて、口は差し込まない。 */
    if (PROD) await viaCurl(ctx);
    else await offline(ctx);
    if (sc.seed === "login") await asme(ctx, { admin: false });
    if (sc.seed === "admin") await asme(ctx, { admin: true });
    if (!PROD && ["ok", "empty", "wait"].includes(sc.seed))
      await seedBoard(ctx, { mode: sc.seed, poll: !!sc.poll });
    if (!PROD && sc.poll && ["login", "admin"].includes(sc.seed))
      await seedBoard(ctx, { mode: "ok", poll: true });

    await ctx.addInitScript(
      ({ mine, id, poll }) => {
        try {
          localStorage.setItem("ayato-island-arrived", "2026-09-04");
          localStorage.setItem("ayato-island-walked", "1");
          if (mine) localStorage.setItem("ayato-island-myplans", JSON.stringify([id]));
          // 島でおたずねを押してきた控え（`lib/api.ts` の POLL_MINE と同じ形）
          if (poll) localStorage.setItem("ayato-island-poll", "poll-1\to1");
        } catch {}
      },
      { mine: !!sc.mine, id: MY_PLAN_ID, poll: !!sc.poll },
    );

    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    const url = PROD ?
      `${ORIGIN}${sc.page}` :
      `http://localhost:${SPORT}${sc.page === "/" ? "/index" : sc.page}.html`;
    const row = { scene: sc.id, say: sc.say, seed: sc.seed, W, page: sc.page };
    try {
      /* **返ってこない場面を `networkidle` で待たない。** そのまま時間切れになる */
      await p.goto(url, { waitUntil: sc.nowait ? "domcontentloaded" : "load", timeout: 60000 });
    } catch (e) {
      row.made = false; row.why = `開けず ${String(e).slice(0, 80)}`;
      report.push(row); await ctx.close(); continue;
    }
    await p.waitForTimeout(PROD ? 9000 : sc.nowait ? 2500 : 1800);

    /* 下まで送ってから触る。畳みの中は `content-visibility: auto` で
       画面の外にいるあいだ組まれない（`CLAUDE.md`）。 */
    const toBottom = async () => {
      for (let i = 0; i < 40; i++) {
        const before = await p.evaluate(() => { window.scrollBy(0, 2000); return document.documentElement.scrollHeight; });
        await p.waitForTimeout(60);
        const after = await p.evaluate(() => document.documentElement.scrollHeight);
        if (before === after && i > 2) break;
      }
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(300);
    };
    await toBottom();

    if (sc.act) {
      try { await sc.act(p); } catch (e) { row.actErr = String(e).slice(0, 90); }
      await toBottom();
    }

    /* **場面になっているかを、測る前に見る。** 押しそこねた場面を測ると、
       同じ場面を2回測って「増えなかった」と読むことになる */
    /* **印は「DOM にある」ではなく「画面に出ている」で見る。**
       今日の島の板は、開いても 0.2 秒の動きがあり、島の側の都合（住人と
       話しはじめる）で引っ込むこともある。`locator().count()` は
       display:none でも1を返すので、**中身が1つも出ていないのに
       「場面になった」と通ってしまう**（1280 で実際に通って、
       畳みの中の3個が数から消えた回があった）。
       出るまで少し待つ。出なければ、その行は測らない。 */
    const visible = async () =>
      p.evaluate(
        ({ sel, txt }) => {
          const es = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
          return txt ? es.filter((e) => (e.textContent || "").includes(txt)).length : es.length;
        },
        { sel: sc.want, txt: sc.wantText || null },
      ).catch(() => 0);
    let made = 0;
    for (let i = 0; i < 12 && !(made = await visible()); i++) await p.waitForTimeout(500);
    row.made = made > 0;
    row.height = await p.evaluate(() => document.documentElement.scrollHeight);

    /* 絵は**測る都合で開く前に**撮る。撮るのは「その場面がどう見えるか」 */
    await p.screenshot({ path: `${OUT}/${sc.id}-${W}.png`, fullPage: true }).catch(() => {});

    if (!row.made) {
      row.why = `場面の印（${sc.want}${sc.wantText ? ` の「${sc.wantText}」` : ""}）が、6秒待っても画面に出ない`;
      report.push(row); await ctx.close(); continue;
    }

    /* **画面にある押しどころの総数を、測る前に別に数えておく。**
       `measure()` の「測れた＋測れず＋数えなかった」は同じ 1本の走査を
       分けただけなので、足しても必ず合う——**検算にならない。**
       ここで独立に数えておくと、はじめて突き合わせになる（#87）。 */
    row.dom = await p.evaluate((sel) => document.querySelectorAll(sel).length, SEL_ALL);

    /* 画面の側の分かれ道が、この場面で実際に出ているか（`BRANCHES` の突き合わせ用）。
       **見えているものだけ数える**（`getClientRects` が空なら出ていない）。 */
    row.seen = await p.evaluate((sels) => {
      const o = {};
      for (const s of sels) {
        let n = 0;
        for (const e of document.querySelectorAll(s)) if (e.getClientRects().length) n++;
        o[s] = n;
      }
      return o;
    }, [...new Set(BRANCHES.map(([, s]) => s))]);

    /* 旧の掃き出しが「数えなかった」ぶん。**この場面で出ていない札の中身**を、
       出どころつきで数える。ここが14の出どころ。 */
    row.hiddenPane = await p.evaluate((sel) => {
      const out = [];
      for (const pane of document.querySelectorAll(".bd-pane[hidden], .today-fold[hidden]"))
        for (const e of pane.querySelectorAll(sel))
          out.push({
            c: e.tagName + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : ""),
            t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 14),
          });
      return out;
    }, SEL_ALL);

    /* **測るあいだだけ、島を止める。** トップは島が rAF で動いていて、
       住人が歩き、話しはじめると入口のマスが `pointer-events:none` に落ちる。
       止めずに測ると、1回目（旧の数え方）と2回目（畳みを開いたあと）の
       あいだに島の状態が変わって、**開いてもいないのに押しどころが14個減る。**
       実際に「新 2106 ＜ 旧 2121」が出て、検算がそれを捕まえた（`CLAUDE.md`
       「島を止めてから撮る」）。
       **止めるのは絵を撮ったあと。** はじめから止めると島が組み上がる前で
       固まって、幅を変えても同じ数しか出なくなる（試して戻した）。 */
    await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

    if (process.env.PROBE) await addProbe(p);
    /* 1回目 = 旧の数え方（畳みを開かない）。**前後の差が、見えていなかったぶん** */
    const before = await measure(p, { sel: SEL_ALL, min: MIN, fold: "skip" });
    const folds = await openFolds(p);
    await toBottom();
    const after = await measure(p, { sel: SEL_ALL, min: MIN, fold: "open" });

    if (process.env.PROBE) {
      row.probe = probeVerdict({ after: after.rows, before: before.rows, min: MIN });
      /* **2つの仕込みは、別の回で見る。** `hitbox.mjs` の仕込みは画面の隅に
         固定で置くので、そこに札の中身が来る幅では**こちらの仕込みを覆う。**
         同じ回に入れると「札の中を見にいけていない」と出る（1280 で実際に出た）。
         いっしょに入れないと確かめられないものでもないので、順に見る。 */
      await delProbe(p);
      const want = bdProbeWant(sc);
      /* **入れてすぐ測らない。** トップは板が 0.2 秒かけて開き、島も動いている。
         入れた場所に一瞬だけ何かが乗っていることがあって、そのときだけ
         「札の中を見にいけていない」と出る（48回に1回出た）。
         少し置いて、外れたらもう一度だけ入れ直して見る。 */
      let only, got = false;
      for (let i = 0; i < 3 && !got; i++) {
        row.bdProbeIn = await p.evaluate(BD_PROBE);
        await p.waitForTimeout(700);
        only = await measure(p, { sel: SEL_ALL, min: MIN, fold: "open" });
        got = only.rows.some((r) => isBdProbe(r) && r.small);
        if (got === want) break;
      }
      /* 挙がらなかったときに、**どこへ落ちたか**を残す。
         「挙がらない」だけでは、覆われたのか消えたのか分からない */
      const hit = only?.rows.find(isBdProbe);
      const miss = only?.skipped.find(isBdProbe);
      row.bdProbe = {
        want, got, ok: row.bdProbeIn === false ? false : want === got,
        where: hit ? `測れた ${hit.hit[0]}x${hit.hit[1]}` :
          miss ? `測れず（${miss.why}）` :
          row.bdProbeIn === false ? "入れる先が無い" : "数に入っていない（数えなかったもの側）",
        line: row.bdProbeIn === false ?
          "!! 仕込む先（出ていない札／畳み）が見つからなかった" :
          `出ていないほうに入れた 40px は、この場面で ${want ? "挙がるはず" : "挙がらないはず"} → ${got ? "挙がった" : "挙がらなかった"}`,
      };
      await p.evaluate(() => document.getElementById("bdprobe")?.remove());
    }

    const clean = (m) => ({
      rows: m.rows.filter((x) => !isProbe(x) && !isBdProbe(x)),
      skipped: m.skipped.filter((x) => !isProbe(x) && !isBdProbe(x)),
      excluded: m.excluded,
    });
    row.before = clean(before);
    row.after = clean(after);
    row.folds = folds;
    row.errs = errs;
    report.push(row);
    await ctx.close();
  }
}
await b.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));

/* ================== 読み上げ ================== */
function say(report) {
  const done = report.filter((r) => r.made && r.after);
  const fail = report.filter((r) => !r.made || !r.after);
  console.log(`\n===== ${PROD ? "本番" : `書き出し :${SPORT}`} / ${MIN}px / 絵は ${OUT} =====\n`);

  console.log("■ 場面表（どの札を押すと、どの姿になるか）");
  console.log("  場面 / 幅 / 口 / 押しどころ（旧→新） / 割れ / 測れず / 数えなかった");
  for (const r of report) {
    if (!r.made || !r.after) {
      console.log(`  ${r.scene.padEnd(16)} ${String(r.W).padStart(4)}  ${r.seed.padEnd(5)}  !! ${r.why || "測れず"}${r.actErr ? ` / 押せず ${r.actErr}` : ""}`);
      continue;
    }
    const s1 = r.after.rows.filter((x) => x.small).length;
    const s0 = r.before.rows.filter((x) => x.small).length;
    const ex = Object.values(r.after.excluded).reduce((a, v) => a + v, 0);
    console.log(
      `  ${r.scene.padEnd(16)} ${String(r.W).padStart(4)}  ${r.seed.padEnd(5)}  ` +
        `${String(r.before.rows.length).padStart(3)}→${String(r.after.rows.length).padStart(3)}` +
        `（畳みの中 ${r.after.rows.filter((x) => x.fold).length}）  ` +
        `割れ ${s0}→${s1}  測れず ${r.after.skipped.length}  数えず ${ex}` +
        (r.errs?.length ? `  JSエラー ${r.errs.length}` : ""),
    );
  }
  /* 場面の言い分は1行ずつ。幅ぶん繰り返さない */
  for (const id of [...new Set(done.map((r) => r.scene))])
    console.log(`  ${id.padEnd(16)} … ${done.find((r) => r.scene === id).say}`);

  /* ---- 画面の側との突き合わせ ---- */
  console.log("\n■ `Board.tsx` / `Notes.tsx` / `Today.tsx` の分かれ道と、場面の対応");
  let missBranch = 0, notRun = 0;
  for (const [what, sel, n, scene] of BRANCHES) {
    const rows = done.filter((r) => r.scene === scene);
    if (!rows.length) {
      /* **回していない場面と、回したのに出ていない場面を、同じ顔にしない。**
         本番は差し込みができないので「あやとの道具」「0件の日」は作れない。
         それを「!!」で並べると、**本当に出ていないもの**が埋もれる。 */
      notRun++;
      console.log(`  －  ${what}  → 場面「${scene}」は、この回では回していない`);
      continue;
    }
    const got = Math.max(...rows.map((r) => r.seen?.[sel] ?? 0));
    const ok = got >= n;
    if (!ok) missBranch++;
    console.log(`  ${ok ? "○" : "!!"} ${what}  ${sel}  要 ${n} / 出た ${got}  … 場面 ${scene}`);
  }
  console.log(
    `  分かれ道 ${BRANCHES.length}本。回した場面で出なかったもの ${missBranch}本` +
      `／回していない場面のぶん ${notRun}本` +
      (missBranch ? "  ← 出なかったぶんは、道具が届いていないのか中身が違うのかを目で確かめる" : ""),
  );

  /* ---- 旧で測れていなかったぶん ---- */
  console.log("\n■ 旧の掃き出しが数えていなかったぶん（出ていない札の中）");
  if (!done.some((r) => r.scene === "note-down"))
    console.log("  （この回は plan-down / note-down を回していないので、突き合わせなし）");
  for (const W of WIDTHS.map(([w]) => w)) {
    const base = done.find((r) => r.scene === "plan-down" && r.W === W);
    const opened = done.find((r) => r.scene === "note-down" && r.W === W);
    if (!base || !opened) continue;
    const want = base.hiddenPane || [];
    const got = opened.after.rows.concat(opened.after.skipped);
    const found = want.filter((x) => got.some((g) => g.c === x.c && g.t === x.t));
    console.log(
      `  幅 ${W}: 出ていない札の中にいた押しどころ ${want.length}個` +
        ` → 札を押して測れたもの ${found.length}個 / まだ ${want.length - found.length}個`,
    );
    for (const x of want) {
      const g = got.find((q) => q.c === x.c && q.t === x.t);
      console.log(`    ${x.c}「${x.t || "(字なし)"}」 → ${g ? (g.hit ? `当たり ${fmtHit(g)}${g.hit[0] < MIN || g.hit[1] < MIN ? "  ← 割れ" : ""}` : `測れず（${g.why}）`) : "**まだ測れていない**"}`);
    }
  }

  /* ---- 48px 未満 ---- */
  console.log(`\n■ ${MIN}px 未満（実寸。「≧」が付いたものは上限／画面端で止まった値で、実寸ではない）`);
  let nSmall = 0;
  for (const r of done)
    for (const x of r.after.rows.filter((y) => y.small)) {
      nSmall++;
      console.log(
        `  ${r.scene.padEnd(16)} ${String(r.W).padStart(4)}  ${x.c}「${x.t || "(字なし)"}」${x.href ? ` → ${x.href}` : ""}` +
          `  見た目 ${x.box[0]}x${x.box[1]}  当たり ${fmtHit(x)}  ${x.fold ? "畳みの中" : ""}` +
          (x.rivals.length ? `  かぶり:${x.rivals.map((v) => `${v.dir}=${v.who}`).join(",")}` : ""),
      );
    }
  if (!nSmall) console.log("  （なし）");

  console.log("\n■ 測れなかったもの（実寸として読まない）");
  let nSkip = 0;
  for (const r of done)
    for (const x of r.after.skipped) {
      nSkip++;
      console.log(`  ${r.scene.padEnd(16)} ${String(r.W).padStart(4)}  ${x.c}「${x.t || "(字なし)"}」  見た目 ${x.box[0]}x${x.box[1]}  （${x.why}）`);
    }
  if (!nSkip) console.log("  （なし）");

  /* ---- 検算（`docs/island-misses.md` #87） ---- */
  console.log("\n■ 検算（出た数どうしが矛盾していないか）");
  const sum = (f) => done.reduce((a, r) => a + f(r), 0);
  const nRows = sum((r) => r.after.rows.length);
  const nSk = sum((r) => r.after.skipped.length);
  const nFold = sum((r) => r.after.rows.filter((x) => x.fold).length);
  const nSm = sum((r) => r.after.rows.filter((x) => x.small).length);
  const nSat = sum((r) => r.after.rows.filter((x) => x.sat[0] || x.sat[1]).length);
  const nEdge = sum((r) => r.after.rows.filter((x) => x.edge[0] || x.edge[1]).length);
  const nBefore = sum((r) => r.before.rows.length);
  const chk = (ok, s) => console.log(`  ${ok ? "○" : "!!"} ${s}`);
    chk(nRows + nSk === sum((r) => r.after.rows.length + r.after.skipped.length), `測れた ${nRows} ＋ 測れず ${nSk} ＝ 掃き出した ${nRows + nSk}`);
    chk(nSm === nSmall, `割れの一覧 ${nSmall}行 ＝ 場面ごとの割れの合計 ${nSm}`);
    chk(nSk === nSkip, `測れずの一覧 ${nSkip}行 ＝ 場面ごとの測れずの合計 ${nSk}`);
    chk(nSm <= nRows, `割れ ${nSm} ≦ 測れた ${nRows}`);
    chk(nFold <= nRows, `畳みの中 ${nFold} ≦ 測れた ${nRows}`);
    /* 場面ごとに、測る前に数えた総数と合うか。**合わなければ、道具の側が壊れている** */
  const bad = process.env.PROBE ? [] : done.filter((r) => {
    const ex = Object.values(r.after.excluded).reduce((a, v) => a + v, 0);
    return r.dom != null && r.after.rows.length + r.after.skipped.length + ex !== r.dom;
  });
  /* **仕込みを入れた回では、この検算をしない。** 総数は仕込みを入れる前に
     数えているので、仕込んだぶんだけ必ず食い違う。「合わない」と出しても
     意味が無く、本当に合わない回を見落とす。 */
  chk(!bad.length,
    process.env.PROBE ?
      "（仕込みを入れた回なので、総数との突き合わせはしない）" :
    `測れた＋測れず＋数えなかった ＝ 画面にある押しどころの総数（別に数えたもの）` +
      (bad.length ? `  ← 合わない場面 ${bad.map((r) => `${r.scene}/${r.W}`).join(" ")}` : `（${done.filter((r) => r.dom != null).length}場面ぜんぶで一致）`));
  /* **「畳みを開いたぶん増える」は、畳みを開いた場面でしか言えない。**
     1つも開いていない場面で数が動いたなら、それは畳みの話ではなく
     **2回のあいだに画面のほうが動いた**（島は生きている）。
     混ぜて足すと、増えたぶんと減ったぶんが打ち消し合って、
     どちらの意味も読めない数になる。 */
  const opened = done.filter((r) => r.folds?.opened > 0);
  const oB = opened.reduce((a, r) => a + r.before.rows.length, 0);
  const oA = opened.reduce((a, r) => a + r.after.rows.length, 0);
  chk(oA >= oB, `畳みを開いた ${opened.length}場面：新 ${oA} ≧ 旧 ${oB}（開いたぶん増える。減ることはない）`);
  const moved = done.filter((r) => !(r.folds?.opened > 0) && r.before.rows.length !== r.after.rows.length);
  if (moved.length)
    console.log(
      `  ※ 畳みを1つも開いていないのに数の動いた場面 ${moved.length}: ` +
        moved.map((r) => `${r.scene}/${r.W} ${r.before.rows.length}→${r.after.rows.length}`).join(" / ") +
        "\n     （2回のあいだに画面のほうが動いている。島の面はこれが出る）",
    );
  console.log(`  実寸ではない値: 上限で止まった ${nSat}個 / 画面端で止まった ${nEdge}個`);
  console.log(`  場面 ${report.length}行のうち、作れた ${done.length}／作れず ${fail.length}`);

  /* ---- 自己確認 ---- */
  if (process.env.PROBE) {
    console.log("\n■ 自己確認（当たらない道具の0件は証拠にならない）");
    let bad = 0;
    for (const r of done) {
      const v = r.probe, q = r.bdProbe;
      const ok = (v?.ok ?? false) && (q?.ok ?? false);
      if (!ok) bad++;
      if (!ok || r === done[0]) {
        console.log(`  ${ok ? "○" : "!!"} ${r.scene} ${r.W}`);
        for (const l of v?.lines ?? []) console.log("    " + l);
        if (q) console.log(`    ${q.ok ? "○" : "!!"} ${q.line}${q.ok ? "" : `  … ${q.where}`}`);
      }
    }
    console.log(bad ? `\n  !! ${bad}/${done.length} 場面でだめ。この回の「0件」は読まない` : `\n  ${done.length}場面ぜんぶ、仕込みはそのとおりに出た`);
  }
}

say(report);
