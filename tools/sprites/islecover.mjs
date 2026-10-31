/**
 * **島の入口が、ほかの「読まれるもの」にどれだけ覆われているかを数える。**
 *
 *   PORT=4140 node tools/sprites/islecover.mjs            # 0＝通った / 1＝見つかった / 2＝数えるものが無い
 *   PORT=4140 WIDTHS=390 node tools/sprites/islecover.mjs
 *   PORT=4140 PAGES=/index.html node tools/sprites/islecover.mjs
 *   PORT=4140 BREAK=1 node tools/sprites/islecover.mjs     # 仕込みを本物の面にも当てて、拾えることを見る
 *
 * ## なぜ要るか
 *
 * `islereach.mjs` は「指が届く入口がいくつあるか」を、**島に降りた直後の
 * あやとの位置で**数える。`islenav.mjs` は引きの札と隅の道具と南へ歩けるかを見る。
 * どちらも**あやとが歩いたあとの寄り**を見ていない。
 *
 * 寄りの札は「いま近づいている1軒」の開いた1枚（390px で 237x64）で、
 * **あやとが歩くたびに置き場所が変わる。** 置き場所が無いと、札は
 * ほかの建物の当たりの上に残る（`IsleStage` の「上にも下にも逃げ場が無いとき」）。
 * 寄りの札は落とさない決まりなので（`docs/island-design.md` 6章）、
 * **覆われた建物は押せないまま**になる。
 *
 * 実測（2026-10-13・master・幅390・表紙）で、「伝説の企画」の開いた札が
 * 「となりの島へ」の当たり（49x49）を **121/121 点**覆っていた。
 * その入口は、そこに立っているあいだ**押せない。**
 *
 * ## 何を「覆っている」と数えるか
 *
 * **別の読まれるもの**だけ。島の絵（木・岩・地面）に重なるのは構わない——
 * 当たりは絵の上にあるので、絵は指を取らない。取るのは次のもの:
 *
 *   ほかの建物の札（`.isle-mark`）／「今日の島」の板（`.today`）
 *   島の隅の道具（`.isle-view` `.isle-atlas`）／看板（`.hero-logo`）
 *   住人の吹き出し（`.isle-talk`）
 *
 * **覆われる側として数えるのは、島の建物（`.isle-spot`）だけ。**
 * 隅の道具（`.isle-view` `.isle-atlas`）は**覆う側**にしか居ない——
 * つまり「道具そのものが覆われたか」は、ここでは分からない。
 *
 * 2026-10-14、それで1度抜けた。画面の上へ寄せた札（`.isle-going`）が
 * 左上の道具2つをまるごと覆い（札 上10〜60 / 道具 上12〜60）、
 * あやとに「左上のボタンが押せなくなって困る」と言われるまで気づかなかった。
 * **押しどころの道具3本（`hitbox` `islereach` `reachwatch`）も全部緑だった**
 * ——札も看板も `pointer-events: none` なので、当たりでは道具が返る。
 * 押せてはいて、隠れているだけ。
 *
 * **そこは `islewalk.mjs` の足 (E) が見ている**（絵の重なりと重なり順で測る）。
 * ここに足すと仕事が二重になるので、足さない（`docs/island-misses.md` #260）。
 *
 * **自分の札は数えない。** 開いた札が自分の建物の当たりに重なるのは設計どおりで
 * （札が建物の真上に出る）、その建物の入口は札そのもの。
 *
 * **板（`.isle-sheet`）が開いている場面は測らない。** 板は島ぜんぶを覆う読みもので、
 * 閉じれば戻る。「覆われている」に数えると、正しい動きが赤くなる
 * （`docs/island-standards.md` §13）。
 *
 * ## 見た目の箱では測らない
 *
 * 当たりの箱を**島の見えている範囲で切ってから**、11x11 点を
 * `elementFromPoint` で突いて、自分が返らなかった点を数える
 * （`docs/island-standards.md`「押しどころは、見た目の箱で測らない」）。
 * 島は `overflow: hidden` の箱なので、**島の外に出たぶんは突きようが無い**
 * ——切ってから数える（`islereach.mjs` #85 と同じ）。
 *
 * ## あやとは矢印キーで歩かせる。地面を押さない
 *
 * 地面を押して歩かせると、押し先がたまたま建物だった回に板が開いたり
 * 別の面へ出ていったりして、**測る場面が回ごとに変わる。**
 * 矢印キーなら何も押さないので、同じ道を何度でも歩ける
 * （`IsleStage` の `keydown`。`islenav.mjs` も「矢印キーでは普通に南へ歩ける」と書いている）。
 *
 * ## 対照（これが通らなければ、本物の数字を1つも出さない）
 *
 * **当たらない道具の「0件」は証拠にならない**（`docs/island-misses.md` #79 #83）。
 * 測る前に、島の上へ2枚の板を仕込む:
 *
 *   覆う   … ある入口の当たりを**ぴったり覆う**板 → **100% として挙がること**
 *   かすめる … 別の入口の**左上の4分の1だけ**に乗る板 → **挙がらないこと**（0 < 割合 < 100）
 *
 * 片方でも外れたら、本物の面の数字を出さずに **2** で落ちる。
 * 「なんでも赤く言う道具」になっていないことまで見ないと、対照の意味が無い。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { viaCurl } from "./prod.mjs";
import { PAGES } from "./islepages.mjs";

const PORT = process.env.PORT || "4140";
const ORIGIN = process.env.ORIGIN || `http://127.0.0.1:${PORT}`;
const WIDTHS = (process.env.WIDTHS || "390,768,1280").split(",").map(Number);
/** 1軒へ向かって歩くときの、手数の上限（これを超えたら諦めて次の建物へ） */
const STOPS = Number(process.env.STOPS || 8);
/** 当たりの中を何点突くか（片辺）。11x11＝121点 */
const GRID = Number(process.env.GRID || 11);
/** 切り取ったあとの当たりがこれより小さければ「島のふち」として数えない。
    1〜2px の帯は、覆われていようがいまいが押しどころではない */
const MIN_BOX = Number(process.env.MIN_BOX || 8);
/** 仕込みを本物の面にも当てる（道具が拾えることを目で見るための逃がし口） */
const BREAK = process.env.BREAK === "1";

/** 指を取る読みもの。**島の絵は入れない**（絵は指を取らないので覆っていない） */
const READ = ".isle-mark,.today,.isle-view,.isle-atlas,.hero-logo,.ih-logo,.isle-talk";

/* ---- 面を決める --------------------------------------------------------- */

/** 書き出したものから、島の立っている面だけを拾う。
    **手で並べない。** 章が増えても増えないので、増えた面が「測って 0」に化ける
    （`docs/island-standards.md` §15、`islepages.mjs` と同じ考え） */
function isleOnly() {
  if (process.env.PAGES) return process.env.PAGES.split(",").filter(Boolean);
  return PAGES.filter((p) => p === "/" || /^\/island\/[^/]+$/.test(p));
}

/** 手元の静的サーバは拡張子なしの道を返さない */
/** 本番を見るときは `.html` を足さない（足すのは手元の静的サーバの都合だけ） */
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(ORIGIN);
const at = (path) => ORIGIN + (!LOCAL ? path : path === "/" ? "/index.html" : /\.[a-z]+$/.test(path) ? path : path + ".html");

/* ---- 測る --------------------------------------------------------------- */

/** 1場面ぶん。入口ごとに「ほかの読まれるものに覆われた点の数」を返す */
const SAMPLE = `((GRID, MIN_BOX, READ) => {
  const isle = document.querySelector(".isle");
  if (!isle) return { skip: "島が無い" };
  // 板が開いている場面は測らない（閉じれば戻る読みもの。覆いとして数えない）
  if (document.querySelector(".isle-sheet")) return { skip: "板が開いている" };
  const ib = isle.getBoundingClientRect();
  const x0 = Math.max(0, ib.left), y0 = Math.max(0, ib.top);
  const x1 = Math.min(innerWidth, ib.right), y1 = Math.min(innerHeight, ib.bottom);
  const rows = [];
  const skip = {};
  const drop = (why) => { skip[why] = (skip[why] || 0) + 1; };
  document.querySelectorAll(".isle-spot").forEach((sp) => {
    const hit = sp.querySelector(".isle-hit");
    const mark = sp.querySelector(".isle-mark");
    const name = (hit?.getAttribute("aria-label") || "?").replace(/をみる$/, "");
    const look = (el, kind) => {
      if (!el) { drop(kind + "が無い"); return; }
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const lx = Math.max(b.left, x0), ly = Math.max(b.top, y0);
      const hx = Math.min(b.right, x1), hy = Math.min(b.bottom, y1);
      /* **島の外は「覆われている」ではない。** 切り取られて見えていないものは
         突きようが無い（islereach.mjs #85）。測れなかったほうへ寄せる */
      if (hx - lx < MIN_BOX || hy - ly < MIN_BOX) { drop(kind + "：島のふち（切れて " + Math.round(Math.max(0, hx - lx)) + "x" + Math.round(Math.max(0, hy - ly)) + "px）"); return; }
      if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) { drop(kind + "：出ていない"); return; }
      /** その点に乗っている「ほかの読まれるもの」。無ければ null */
      const over = (x, y) => {
        const e = document.elementFromPoint(x, y);
        if (e && (e === el || el.contains(e))) return null;
        const r = e && e.closest ? e.closest(READ) : null;
        /* **自分の札・自分の当たりは「ほかの読まれるもの」ではない。**
           開いた札が自分の建物に重なるのは設計どおり（札が建物の真上に出る） */
        return r && !sp.contains(r) ? r : null;
      };
      const mine = (x, y) => {
        const e = document.elementFromPoint(x, y);
        return !!e && (e === el || el.contains(e));
      };
      let n = 0, taken = 0; const who = {};
      for (let a = 0; a < GRID; a++) for (let c = 0; c < GRID; c++) {
        const px = lx + (hx - lx) * (a + 0.5) / GRID;
        const py = ly + (hy - ly) * (c + 0.5) / GRID;
        n++;
        const r = over(px, py);
        if (!r) continue;
        taken++;
        const t = (r.textContent || "").trim().replace(/\\s+/g, "").slice(0, 10);
        /* **留めた札（.isle-going）と、島の上の開いた札を分ける。** どちらも
           class は isle-mark なので、一緒にすると直す先が分からない */
        const kind2 = r.closest(".isle-going") ? "留めた札" : String(r.className || r.tagName).trim().split(/\\s+/)[0];
        const rb = r.getBoundingClientRect();
        const k = kind2 + (t ? "「" + t + "」" : "") +
          "[" + Math.round(rb.x) + "," + Math.round(rb.y) + "," + Math.round(rb.width) + "," + Math.round(rb.height) + "]" +
          (r.closest(".isle-spot") ? "" : "（島の上の札ではない）");
        who[k] = (who[k] || 0) + 1;
      }
      /* **割合だけでは「押せるか」は出ない。** 49x49 の当たりの上 8割に札が
         乗ると、残るのは下の 13px の帯で、指で押せる最小（48px。
         docs/island-design.md 3-2）を割っている。**割合は 73% で、
         100% ではない。** だから実寸も測る。

         測りかたは hitbox.mjs と同じ——**見た目の箱では測らない。**
         中心から1pxずつ外へ伸ばして、自分が返るかを見る。

         そして**同じことを2回測る。** 1回目はそのまま、2回目は
         「ほかの読まれるものが透けていたら」として数える。
         差が出たぶんだけが**覆いのせい**で、島のふちで切れたぶんや、
         もともと小さいぶんは差にならない（docs/island-standards.md §13。
         「覆われた」と「もともと足りない」を混ぜない）。 */
      const cx = (lx + hx) / 2, cy = (ly + hy) / 2;
      const grow = (dx, dy,透) => {
        let k = 0;
        for (; k < 90; k++) {
          const px = cx + dx * (k + 1), py = cy + dy * (k + 1);
          if (px < x0 || py < y0 || px > x1 || py > y1) break;
          if (mine(px, py)) continue;
          if (透 && over(px, py)) continue;
          break;
        }
        return k;
      };
      const size = (透) => {
        if (!mine(cx, cy) && !(透 && over(cx, cy))) return [0, 0];
        return [grow(-1, 0, 透) + grow(1, 0, 透), grow(0, -1, 透) + grow(0, 1, 透)];
      };
      const 実寸 = size(false);
      const 覆い無し = size(true);
      rows.push({ name, kind, n, taken, who, 実寸, 覆い無し,
        box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] });
    };
    look(hit, "当たり");
    look(mark, "札");
  });
  const t = document.querySelector("g.ayato")?.getAttribute("transform") || "";
  const m = t.match(/translate\\(([-\\d.]+) ([-\\d.]+)\\)/);
  const cam = isle.getAttribute("data-cam") === "wide" ? "引き" : "寄り";
  return { rows, skip, cam, at: (m ? Math.round(+m[1]) + "," + Math.round(+m[2]) : "?") };
})(${GRID}, ${MIN_BOX}, ${JSON.stringify(READ)})`;

/* ---- 仕込み（対照） ------------------------------------------------------ */

/**
 * 島の上に2枚の板を置く。**本物の札と同じ見え方**（`.isle-mark`）にしないと、
 * 「読まれるもの」として数えられるかどうかを確かめたことにならない。
 *
 * 返すのは { 覆う: 入口の名前, かすめる: 入口の名前 }。置けなければ null。
 */
const PLANT = `(() => {
  const isle = document.querySelector(".isle");
  if (!isle) return null;
  const ib = isle.getBoundingClientRect();
  const x0 = Math.max(0, ib.left), y0 = Math.max(0, ib.top);
  const x1 = Math.min(innerWidth, ib.right), y1 = Math.min(innerHeight, ib.bottom);
  /** いま測れる当たり（島の中にあって、指を受けるもの）を広い順に */
  const live = [];
  document.querySelectorAll(".isle-spot").forEach((sp) => {
    const hit = sp.querySelector(".isle-hit");
    if (!hit) return;
    const cs = getComputedStyle(hit);
    if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return;
    const b = hit.getBoundingClientRect();
    const lx = Math.max(b.left, x0), ly = Math.max(b.top, y0);
    const hx = Math.min(b.right, x1), hy = Math.min(b.bottom, y1);
    if (hx - lx < 24 || hy - ly < 24) return;
    /* **仕込みを置く前から誰かに取られている当たりには、仕込みを置かない。**
       置くと「もともと押せない」のか「仕込みのせいで押せない」のかが
       混ざって、対照にならない（docs/island-standards.md §13） */
    const e = document.elementFromPoint((lx + hx) / 2, (ly + hy) / 2);
    if (!e || !(e === hit || hit.contains(e))) return;
    live.push({ name: (hit.getAttribute("aria-label") || "?").replace(/をみる$/, ""), lx, ly, hx, hy });
  });
  live.sort((a, b) => (b.hx - b.lx) * (b.hy - b.ly) - (a.hx - a.lx) * (a.hy - a.ly));
  /* **「かすめる」を置くのは、覆いが無ければ 48px 取れる当たりだけ。**
     小さい当たりに端から乗せると、残りが 48px を割る——それは道具が
     正しく赤を出しているのであって、「なんでも赤く言う」ではない。
     対照にならないので、**84px 四方より小さいものには置かない**
     （4割に乗せても残りは 6割。0.6 × 84 ＝ 50px で 48px を超える）。 */
  const 広い = live.filter((q) => q.hx - q.lx >= 84 && q.hy - q.ly >= 84);
  if (live.length < 2 || !広い.length) return null;
  const put = (id, x, y, w, h) => {
    const d = document.createElement("div");
    d.className = "isle-mark";
    d.id = id;
    d.textContent = id;
    d.setAttribute("style",
      "position:fixed;left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;" +
      "opacity:1;pointer-events:auto;z-index:99999;background:#fff;transform:none;bottom:auto;max-width:none;");
    document.body.appendChild(d);
  };
  // かすめる … 左上の4割だけ。残りは 6割あるので、48px は取れたまま
  const c = 広い[0];
  put("仕込みかすめる", c.lx, c.ly, (c.hx - c.lx) * 0.4, (c.hy - c.ly) * 0.4);
  // 覆う … ぴったり覆う（上下左右に 2px ずつはみ出して、丸めで取りこぼさない）
  const a = live.find((q) => q !== c);
  if (!a) return null;
  put("仕込み覆う", a.lx - 2, a.ly - 2, a.hx - a.lx + 4, a.hy - a.ly + 4);
  return { 覆う: a.name, かすめる: c.name };
})()`;

/* ---- 回す --------------------------------------------------------------- */

const pages = isleOnly();
if (!pages.length) {
  console.log("島の面が1つも見つからない（書き出しが無いか、置き場が変わった）。数えずに落ちる");
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/**
 * 歩かせかたは、**建物を1軒ずつ押して、歩いているあいだも測る。**
 *
 * 建物を押すと `IsleStage` の `goTo` が走って、あやとがそこへ歩き出す。
 * **札はその瞬間に開く**ので、あやとがまだ島の反対側にいるあいだも、
 * 目当ての建物の札は島の上に置かれている。**いちばん悪い場面はそこ。**
 * 着いたところだけを測ると、この途中が1回も数に入らない
 * （矢印キーで1軒ずつ訪ねる形を先に書いて、**0% しか出なかった**。
 * 別の測りかたで 73% が出ていた場面を、1度も通っていなかった）。
 *
 * **押すのは建物の当たり（`.isle-hit`）だけ。札は押さない。**
 * 札を押すと板（`.isle-sheet`）が開いて、そこから先は別の面になる
 * （`islereachpress.mjs`「建物を押しても板は開かない」）。
 */
const pressSpot = (p, i) =>
  p.evaluate((j) => {
    const sp = document.querySelectorAll(".isle-spot")[j];
    const hit = sp?.querySelector(".isle-hit");
    if (!hit) return false;
    const cs = getComputedStyle(hit);
    // 指が受けないものは、人も押せない。押せないものを押して測らない
    if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) return false;
    hit.click();
    return true;
  }, i);

async function open(ctx, path, w) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
  await p.goto(at(path), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2400);
  return { p, errs };
}

/** 吹き出しを閉じる。出ているあいだは島の押しどころが全部止まる */
async function shut(p) {
  for (let i = 0; i < 20; i++) {
    const t = await p.evaluate(() => document.querySelector(".isle")?.classList.contains("is-talking") ?? false).catch(() => false);
    if (!t) return;
    await p.mouse.click(4, 4).catch(() => {});
    await p.waitForTimeout(250);
  }
}

/** 指で押せる最小（`docs/island-design.md` 3-2） */
const TAP = 48;

/**
 * **その場面で、覆いのせいで押せなくなっているか。**
 *
 * 覆われた割合だけでは出ない。49x49 の当たりの上 8割に札が乗ると、
 * 割合は 73% だが、残るのは下の 13px の帯で**指では押せない。**
 * 逆に、島のふちで切れて小さいものは覆いのせいではない。
 * だから「そのまま測った実寸」と「覆いが透けていたら取れた実寸」を比べて、
 * **覆いが無ければ 48px 取れていたのに、覆われて割っている**ときだけ赤。
 */
const 押せない = (r) =>
  (Math.round(r.実寸[0]) < TAP && Math.round(r.覆い無し[0]) >= TAP) ||
  (Math.round(r.実寸[1]) < TAP && Math.round(r.覆い無し[1]) >= TAP);

/** 覆われ具合のいちばん悪いところを、入口ごとに覚えておく */
function keep(worst, rows, where, cam) {
  for (const r of rows) {
    const key = `${r.name} ${r.kind}`;
    const rate = r.taken / r.n;
    const cur = worst.get(key);
    /* **「いちばん覆われた回」は、割合ではなく押せるかで選ぶ。**
       割合がいちばん大きい回と、押せなくなっている回は別のことがある */
    const 順 = (v) => (押せない(v) ? 1 : 0) * 10 + (v.taken / v.n);
    const now = { rate, ...r, where, cam };
    if (!cur || 順(now) > 順(cur)) worst.set(key, now);
  }
}

const 件 = [];
let 見た面 = 0, 見た場面 = 0, 測れた入口 = 0;
const 測れず = {};

/** 1面1幅ぶん測る。`plant` が真なら仕込みを置いてから測る */
async function run(ctx, path, w, plant) {
  const { p, errs } = await open(ctx, path, w);
  if (!(await p.$(".isle"))) {
    await p.close();
    return { ok: false, why: "島が出ていない" };
  }
  await shut(p);
  let names = null;
  if (plant) {
    names = await p.evaluate(PLANT);
    if (!names) { await p.close(); return { ok: false, why: "仕込みを置ける入口が2つ無い" }; }
  }
  const worst = new Map();
  const first = await p.evaluate(SAMPLE);
  if (first.rows) { keep(worst, first.rows, first.at, first.cam); 見た場面++; for (const [k, n] of Object.entries(first.skip)) 測れず[k] = (測れず[k] || 0) + n; }
  /* 仕込みの回は歩かない。**歩くと仕込みの板だけが画面に貼りついたまま
     島が動く**ので、「ぴったり覆う」が崩れて、対照が対照でなくなる */
  if (!plant) {
    const n = await p.evaluate(() => document.querySelectorAll(".isle-spot").length);
    for (let i = 0; i < n; i++) {
      if (!(await pressSpot(p, i))) continue;
      for (let s = 0; s < STOPS; s++) {
        await p.waitForTimeout(420);
        await shut(p);
        const r = await p.evaluate(SAMPLE).catch(() => ({ skip: "測れなかった" }));
        if (!r.rows) continue;
        見た場面++;
        keep(worst, r.rows, r.at, r.cam);
        for (const [key, m] of Object.entries(r.skip)) 測れず[key] = (測れず[key] || 0) + m;
      }
    }

    /* **建物のそばだけでは足りない。建物と建物のあいだにも立つ。**
       いちばん悪い場面は、1軒に寄り切る手前にある——開いた札は建物の真上に
       出ようとして、そこが埋まっていると下へ回る。**下に次の建物がいると、
       その当たりの上に乗る。** 実測（幅390・表紙）で「伝説の企画」の札が
       「となりの島へ」の当たりに乗ったのは、2軒のあいだに立ったときだった。
       1軒ずつ訪ねる道だけでは、そこを1度も通らずに「0%」と出る。

       押す先は**地面だけ**。`[data-ui]` と板の上は押さない——建物を押すと
       板が開いて別の面へ出ていくので、測る場面が回ごとに変わる
       （`islenav.mjs` の GROUND と同じ見かた）。 */
    const COLS = 5, ROWS = 6;
    for (let c = 0; c < COLS; c++) for (let rI = 0; rI < ROWS; rI++) {
      const pt = await p.evaluate(([cc, rr, nc, nr]) => {
        const isle = document.querySelector(".isle");
        if (!isle) return null;
        const b = isle.getBoundingClientRect();
        const x = Math.round(b.left + b.width * (cc + 0.5) / nc);
        const y = Math.round(b.top + b.height * (rr + 0.5) / nr);
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
        const el = document.elementFromPoint(x, y);
        if (!el || !isle.contains(el) || el.closest("[data-ui]") || el.closest(".panel")) return null;
        return { x, y };
      }, [c, rI, COLS, ROWS]).catch(() => null);
      if (!pt) continue;
      await p.mouse.click(pt.x, pt.y).catch(() => {});
      await p.waitForTimeout(1700);
      await shut(p);
      const r = await p.evaluate(SAMPLE).catch(() => ({ skip: "測れなかった" }));
      if (!r.rows) continue;
      見た場面++;
      keep(worst, r.rows, r.at, r.cam);
      for (const [key, m] of Object.entries(r.skip)) 測れず[key] = (測れず[key] || 0) + m;
    }

    /* **引き（島をながめる）も見る。** 入口の置き方が寄りと違う——看板の6軒は
       当たりを止めて札1枚に寄せてあるので（`chain.css` の
       `.isle[data-cam="wide"] .isle-spot.is-sign .isle-hit`）、
       覆われて困るのは当たりではなく**札**のほう。別の面として測る
       （`islereach.mjs` が寄りと引きを別に出しているのと同じ理由）。 */
    const view = await p.$(".isle-view");
    if (view) {
      await view.click().catch(() => {});
      await p.waitForTimeout(2500);
      await shut(p);
      for (let s = 0; s < 4; s++) {
        const r = await p.evaluate(SAMPLE).catch(() => ({ skip: "測れなかった" }));
        if (r.rows) {
          見た場面++;
          keep(worst, r.rows, r.at, r.cam);
          for (const [key, m] of Object.entries(r.skip)) 測れず[key] = (測れず[key] || 0) + m;
        }
        await p.waitForTimeout(400);
        await shut(p);
      }
    }
  }
  await p.close();
  return { ok: true, worst, errs, names };
}

/* --- 対照を先に通す。通らなければ本物の数字を1つも出さない --- */
{
  const w = WIDTHS[0];
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  if (LOCAL) await offline(ctx); else await viaCurl(ctx);
  const r = await run(ctx, pages[0], w, true);
  await ctx.close();
  if (!r.ok) {
    console.log(`対照が置けなかった（${r.why}）。数えずに落ちる`);
    await b.close();
    process.exit(2);
  }
  const 覆う = r.worst.get(`${r.names.覆う} 当たり`);
  const かすめる = r.worst.get(`${r.names.かすめる} 当たり`);
  const say = (n, v) => `${n}: ${v ? `${v.taken}/${v.n}（${Math.round(v.rate * 100)}%）実寸 ${v.実寸.map(Math.round).join("x")}（覆い無し ${v.覆い無し.map(Math.round).join("x")}）${押せない(v) ? " → 押せない" : " → 押せる"}` : "挙がらなかった"}`;
  console.log(`対照（${pages[0]} ${w}px）  ${say("覆う=" + r.names.覆う, 覆う)}  ／  ${say("かすめる=" + r.names.かすめる, かすめる)}`);
  const 言 = [];
  if (!覆う) 言.push("ぴったり覆った板の入口そのものが挙がっていない");
  else {
    if (覆う.taken !== 覆う.n) 言.push(`ぴったり覆った板を 100% として拾えていない（${覆う.taken}/${覆う.n}）`);
    if (!押せない(覆う)) 言.push("ぴったり覆われた入口を「押せる」と言っている");
  }
  if (!かすめる) 言.push("端だけに乗った板の入口そのものが挙がっていない");
  else if (Math.round(かすめる.覆い無し[0]) < 48 || Math.round(かすめる.覆い無し[1]) < 48)
    /* **「覆いが無ければ 48px 取れる」入口でないと、対照にならない。**
       もともと 48px に足りない当たりに端から乗せても、落ちないのは当たり前 */
    言.push(`端に乗せた入口が、覆いが無くても ${かすめる.覆い無し.map(Math.round).join("x")}px しかない（対照にならない）`);
  else {
    if (かすめる.taken === 0) 言.push("端に乗った板を1点も拾えていない");
    if (かすめる.taken === かすめる.n) 言.push("端にしか乗っていない板を 100% と言っている");
    if (押せない(かすめる)) 言.push("端にしか乗っていない入口を「押せない」と言っている（なんでも赤く言う道具になっている）");
  }
  if (言.length) {
    for (const m of 言) console.log(`  ！ ${m}`);
    console.log("対照が外れた。本物の面は測らずに落ちる");
    await b.close();
    process.exit(2);
  }
}

/* --- 本物の面 --- */
console.log(`見るところ: ${ORIGIN}  面 ${pages.length}  幅 ${WIDTHS.join("/")}  1軒あたり最大 ${STOPS + 1}場面`);
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  if (LOCAL) await offline(ctx); else await viaCurl(ctx);
  for (const path of pages) {
    const r = await run(ctx, path, w, BREAK);
    if (!r.ok) { console.log(`  ${path} ${w}px  ${r.why}`); continue; }
    見た面++;
    const list = [...r.worst.entries()].sort((a, c) => c[1].rate - a[1].rate);
    測れた入口 += list.length;
    const bad = list.filter(([, v]) => 押せない(v));
    const top = list[0];
    console.log(
      `  ${path.padEnd(22)} ${String(w).padStart(4)}px  測れた入口 ${String(list.length).padStart(2)}` +
      `  いちばん覆われた ${top ? `${top[0]} ${Math.round(top[1].rate * 100)}%` : "-"}` +
      `  覆われて押せない ${bad.length}件  JSエラー${r.errs.length}`,
    );
    for (const [k, v] of bad) {
      件.push(`${path} ${w}px ${k}`);
      console.log(`    ← ${k} が ${v.taken}/${v.n} 点（${Math.round(v.rate * 100)}%）覆われて、押しどころが ` +
        `${v.実寸.map(Math.round).join("x")}px しか残っていない（覆いが無ければ ${v.覆い無し.map(Math.round).join("x")}px）。` +
        `覆っているのは ${Object.entries(v.who).map(([a, n]) => `${a}=${n}点`).join(" ")}` +
        ` 当たり${JSON.stringify(v.box)} ${v.cam ?? "?"}・あやと ${v.where}`);
    }
  }
  await ctx.close();
}
await b.close();

console.log("");
console.log(`見た面 ${見た面}（${pages.length}面 × ${WIDTHS.length}幅）／ 測った場面 ${見た場面} ／ 測れた入口 ${測れた入口}`);
const 内訳 = Object.entries(測れず).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" ");
console.log(`測れなかった入口の内訳: ${内訳 || "なし"}`);
if (!測れた入口) {
  console.log("入口を1つも測れていない。0件を答えとして出さずに落ちる");
  process.exit(2);
}
if (件.length) {
  console.log(`\nほかの読まれるものに覆われて、48px を割っている入口 ${件.length}件`);
  for (const m of 件) console.log(`  ・${m}`);
  process.exit(1);
}
console.log("島の入口は、ほかの読まれるものに覆われて 48px を割っているものが1つも無い");
process.exit(0);
