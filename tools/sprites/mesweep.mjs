/**
 * `/me`（じぶんのこと）と `/me/desk`（島の手入れ）を、**道具1つずつ**撮って数える。
 *
 * `docs/island-misses.md` #77 のあと。あの日に絵で見たのは足元の札2種類だけで、
 * **道具9つの中身は1枚も撮っていなかった。** ここは、机の札を1つずつ押して
 * 開いた中身まで撮る。
 *
 *   tools/build.sh 3600
 *   python3 -m http.server 4600 --directory site/.next-3600 &
 *   SPORT=4600 node tools/sprites/mesweep.mjs                 # うまくいっている日
 *   SPORT=4600 MEMODE=empty node tools/sprites/mesweep.mjs    # 0件の日
 *   SPORT=4600 MEMODE=down  node tools/sprites/mesweep.mjs    # 読めなかった日
 *   SPORT=4600 MEMODE=wait  node tools/sprites/mesweep.mjs    # 取りに行っている最中
 *
 * 出るもの（/tmp/mesweep/<MEMODE>/）:
 *   <場面>-390.png … 面ぜんぶ（dpr 2、下まで送ってから）
 *   report.json    … 下の measure() が返した数
 *
 * ## 数えるもの
 *
 * 1. **島の外の顔**（ブラウザ既定のまま出ている `input` / `select` / `textarea` /
 *    `button`）。判定は**同じ親に素の部品を1つ置いて、見た目を突き合わせる。**
 *    クラス名や `.dform` の中にいるかでは決めない。`.nph-post-row` を `.dform`
 *    の外に置いた件（#77）は「入れ物の外にいる」で捕まるが、**入れ物の中に
 *    いても規則が当たっていない**ものは、それでは捕まらない。
 *    素の部品と同じ顔なら、どこにいても島の外にいる。
 *    **この素の部品は、そのまま「道具が効いているか」の校正にもなる**
 *    （`docs/island-misses.md` #19。捕まえられない道具は、いつでも0件と出る）。
 * 2. **押しどころ 48px**（`docs/island-design.md` 3-2）。見た目の箱では測らない。
 *    中心から1pxずつ外へ伸ばして `elementFromPoint` が自分を返すかで測る。
 *    `hitbox.mjs` と同じ逃げ（隠した入力は label で測る・閉じた畳みの中は
 *    数えない・折り返した行は行ごとの箱の中心から・画面の外は分ける）を持つ。
 * 3. **横あふれ**。`documentElement.scrollWidth > clientWidth`（#72）。360 と 390。
 * 4. 字の濃さは別の道具（`inkpx.mjs` → `inkpx.py`）。ここでは撮るだけ。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4600";
const MODE = process.env.MEMODE || "ok";
const DPR = Number(process.env.DPR || 2);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const OUT = `/tmp/mesweep/${MODE}${process.env.OPENALL ? "-open" : ""}`;
mkdirSync(OUT, { recursive: true });

/** 撮る場面。机の道具は `tools.ts` の並びそのまま（9つ）。 */
const SCENES = [
  { id: "me-note", page: "/me.html", tab: "付箋" },
  { id: "me-plan", page: "/me.html", tab: "企画" },
  { id: "me-card", page: "/me.html", tab: "カード" },
  // 名前とアイコンを出すか（畳みの中の `IslandMe`）。開かないと欄が出ない
  { id: "me-islandme", page: "/me.html", open: true },
  { id: "desk-photo", page: "/me/desk.html", tab: "写真" },
  { id: "desk-place", page: "/me/desk.html", tab: "いまどこ" },
  { id: "desk-video", page: "/me/desk.html", tab: "配信" },
  { id: "desk-sticky", page: "/me/desk.html", tab: "付箋" },
  { id: "desk-plan", page: "/me/desk.html", tab: "企画" },
  { id: "desk-donor", page: "/me/desk.html", tab: "投げ銭" },
  { id: "desk-chara", page: "/me/desk.html", tab: "キャラ" },
  { id: "desk-fund", page: "/me/desk.html", tab: "スパチャ" },
  { id: "desk-obs", page: "/me/desk.html", tab: "OBS" },
];

/* ------------------------------------------------------------------ */
/* 画面の中で回すもの。**ブラウザの中で完結させる**（外に持ち出すのは数だけ） */
/* ------------------------------------------------------------------ */

const measure = (probe) => {
  const px = (n) => Math.round(n * 100) / 100;

  /* ---- 1. 島の外の顔 ----------------------------------------------
     同じ親に素の部品を1つ置いて、顔（字・地・枠・角・厚み）を突き合わせる。
     素の部品は `position:absolute; visibility:hidden` で置く。どちらも
     字や地や枠の計算には効かないので、見ている値は動かない。 */
  const FACE = [
    "fontFamily", "fontSize", "fontWeight",
    "backgroundColor", "backgroundImage",
    "borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderTopLeftRadius", "boxShadow", "color", "paddingTop",
  ];
  const faceOf = (el) => {
    const cs = getComputedStyle(el);
    return FACE.map((k) => cs[k]).join(" | ");
  };
  /**
   * ブラウザ既定の顔。**素の部品を、規則の当たらないところ（`<body>` の直下）
   * に置いて読む。**
   *
   * 最初はこれを「その部品と同じ親」に置いて突き合わせていた。**それだと
   * 逆のことを測る。** `.dform input` は子孫に当たる規則なので、`.dform` の
   * 中に置いた素の部品にも同じ規則が当たり、**正しく島の顔をしている欄が
   * ぜんぶ「素の部品と同じ」= 否**と出た（27件。全部まちがい）。
   * 比べる相手は「同じ場所に置いた素の部品」ではなく、**どこの規則も
   * 当たっていない素の部品**。
   */
  const uaCache = new Map();
  const uaFace = (tag, type) => {
    const key = `${tag}:${type || ""}`;
    if (uaCache.has(key)) return uaCache.get(key);
    const box = document.createElement("div");
    box.className = "me-probe-ua";
    box.style.cssText = "position:absolute;left:-9999px;top:0";
    const e = document.createElement(tag);
    if (type) e.setAttribute("type", type);
    if (tag === "select") e.appendChild(new Option("あ"));
    if (tag === "button") e.textContent = "あ";
    box.appendChild(e);
    document.body.appendChild(box);
    const f = faceOf(e);
    box.remove();
    uaCache.set(key, f);
    return f;
  };

  /* ---- 2. 押しどころ ----------------------------------------------
     `hitbox.mjs` と同じ測りかた。中心から1pxずつ外へ。 */
  const hit = (el) => {
    /* 隠してある入力は、指が押しているのは label のほう（`hitbox.mjs`）。 */
    let target = el;
    if (el.tagName === "INPUT") {
      const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      target = byFor || el.closest("label") || el;
    }
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { why: "箱が無い" };
    // 折り返した行内リンクの外接矩形の中心は行間に落ちる。行ごとの箱で測る
    const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const box = lines.length
      ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a))
      : r;
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight)
      return { why: "画面の外（送っても入らない）" };
    /* **親を「自分」に数えない。** 最初ここに `e.contains(target)` を足して
       いて、点が親の `<p>` に落ちたときも当たりに数えていた。当たり幅が
       いつも画面いっぱい（360 / 390）と出て、**狭い押しどころが広く見えて
       いた。** `hitbox.mjs` は自分と子、それと自分を指す a/button/label だけ。 */
    const mine = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return !!e && (e === target || target.contains(e) || e.closest?.("a,button,label,summary") === target);
    };
    if (!mine(cx, cy)) {
      const e = document.elementFromPoint(cx, cy);
      return { why: `上に ${e ? e.tagName + "." + (typeof e.className === "string" ? e.className.split(/\s+/)[0] : "") : "なし"}` };
    }
    let l = 0, rr = 0, up = 0, dn = 0;
    while (l < 300 && cx - l - 1 >= 0 && mine(cx - l - 1, cy)) l++;
    while (rr < 300 && cx + rr + 1 < innerWidth && mine(cx + rr + 1, cy)) rr++;
    while (up < 300 && cy - up - 1 >= 0 && mine(cx, cy - up - 1)) up++;
    while (dn < 300 && cy + dn + 1 < innerHeight && mine(cx, cy + dn + 1)) dn++;
    return { w: l + rr + 1, h: up + dn + 1 };
  };

  const name = (el) =>
    `${el.tagName.toLowerCase()}${
      el.className && typeof el.className === "string"
        ? "." + el.className.split(/\s+/).filter(Boolean).join(".")
        : ""
    }`;

  /* 校正用。**道具が本物を捕まえるかを、毎回その場で確かめる**
     （`docs/island-misses.md` #19「数え方が届いていない場所は0件に見える」）。
     2つ置く。どちらも挙がらなければ、この報告の「0件」は信じてはいけない。

       A) 紙の上の素の部品4つ … いちばん素朴な形
       B) `.nph-post-row` を `.dform` の外に置いたもの … **#77 でみつかった
          本物と同じ形。** 「入れ物の中に見えるのに規則が当たっていない」
          ほうを捕まえられるかは、A だけでは分からない */
  if (probe) {
    const box = document.createElement("div");
    box.id = "me-probe";
    box.innerHTML =
      '<input type="text" placeholder="校正A"><select><option>校正A</option></select>' +
      "<textarea></textarea><button>校正A</button>";
    document.body.appendChild(box);
    const panel = document.querySelector("section.panel");
    if (panel) {
      const row = document.createElement("div");
      row.id = "me-probe2";
      row.innerHTML =
        '<label class="nph-post-row"><span>校正B</span>' +
        "<select><option>校正B</option></select></label>";
      panel.appendChild(row);
    }
  }

  /* **読み上げにだけ残してあるものを、押せないものとして数えない。**
     パンくずは狭い画面で `clip-path: inset(50%)` の 1x1 に畳んである
     （`app/css/pages.css` の `.crumbs:not(:has(> span + span))`）。
     中の `<a>` は自分の箱（13x21）を持ったままなので、そのまま測ると
     「押しどころ 13x21 で否」と出る。**画面に出ていないものは数えない。**
     最初に書いたときこれで `/me` の「島」が否に挙がった（#72 と同じ形）。 */
  const hiddenForEyes = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ac = getComputedStyle(a);
      const ar = a.getBoundingClientRect();
      if ((ar.width <= 1 || ar.height <= 1) && (ac.overflow === "hidden" || ac.clipPath !== "none"))
        return true;
    }
    return false;
  };

  const faces = [];
  const taps = [];
  /* `summary` も押しどころ。**`button` でも `a` でもないので、選び方に
     書かないと1つも数えない。** 畳み（`components/ui/Fold.tsx`）は
     `<details><summary>` でできていて、`/me` にも机にも出てくる。 */
  for (const el of document.querySelectorAll("input, select, textarea, button, a[href], summary")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.offsetParent === null && cs.position !== "fixed") continue;
    if (hiddenForEyes(el)) continue;
    /* **指が触れないものは、押しどころではない。** 写真の file の欄
       （`.nph-post-file`）は `opacity: 0` と `pointer-events: none` で
       脇へどけてあり、指が押すのは「写真を選ぶ」のほう。ここを数えると
       「当たり 上に SECTION.panel」が毎回1件出る（実際に出た）。
       **隠してあるものを、押せないものとして数えない**（#72）。 */
    if (cs.opacity === "0" || cs.pointerEvents === "none") continue;
    // 閉じた畳みの中は、押せなくて当たり前（`hitbox.mjs`）
    const det = el.closest("details");
    if (det && !det.open && !det.querySelector("summary")?.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    if (tag !== "a" && tag !== "summary") {
      const my = faceOf(el);
      const why = [];
      if (my === uaFace(tag, type)) why.push("ブラウザ既定の顔そのまま");
      /* 印（チェック・ラジオ）は、`appearance` を戻していなければ**OS が描く。**
         島の絵柄のとなりに、端末ごとに形の変わる四角が混ざる
         （`docs/island-design.md` 1・2章）。顔の突き合わせでは捕まらない
         （大きさや accent-color だけ当てていると別の顔に見える）ので、別に見る。 */
      if ((type === "checkbox" || type === "radio") && getComputedStyle(el).appearance !== "none")
        why.push("OS が描く印（appearance が戻っていない）");
      /* 選ぶ欄の**矢印**も OS が描く。地も枠も字も島のものに替えてあっても、
         右端の ∨ だけはブラウザのもので、端末で形も位置も変わる
         （島の印は `components/ui/Icon.tsx` の自前 SVG。`island-design.md` 1章）。
         **顔の突き合わせでは出てこない**ので、別に見る。
         `.dform input.dday`（日を選ぶ欄）だけは `appearance: none` に戻して
         あるので、やればできることは分かっている。 */
      if (tag === "select" && getComputedStyle(el).appearance !== "none")
        why.push("OS が描く矢印（select の appearance が戻っていない）");
      if (why.length) {
        faces.push({
          what: name(el) + (type ? `[${type}]` : ""),
          why,
          label: (
            el.closest("label")?.querySelector("span")?.textContent ||
            el.closest("label")?.textContent ||
            ""
          ).trim().slice(0, 30),
          text: (el.textContent || el.value || el.placeholder || "").trim().slice(0, 24),
          onForm: !!el.closest(".dform"),
          face: my,
          probe: el.closest("#me-probe") || el.closest("#me-probe2") ? true : undefined,
        });
      }
    }
    const h = hit(el);
    const row = {
      what: name(el),
      text: (el.textContent || el.value || el.placeholder || "").trim().slice(0, 20),
      box: [px(r.width), px(r.height)],
      hit: h.w ? [h.w, h.h] : null,
      why: h.why,
      probe: el.closest("#me-probe") || el.closest("#me-probe2") ? true : undefined,
    };
    taps.push(row);
  }

  document.getElementById("me-probe")?.remove();
  document.getElementById("me-probe2")?.remove();

  const de = document.documentElement;
  return {
    w: innerWidth,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    over: de.scrollWidth - de.clientWidth,
    height: de.scrollHeight,
    faces,
    taps,
  };
};

/* ------------------------------------------------------------------ */

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = {};
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  report[sc.id] = {};
  for (const W of [360, 390]) {
    const ctx = await b.newContext({
      viewport: { width: W, height: 844 },
      deviceScaleFactor: DPR,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await seed(ctx, { admin: true, mode: MODE });
    await offline(ctx).catch(() => {});
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    /* **待っているところを撮るときは、読み込みの終わりを待たない。**
       返らない口を `networkidle` で待つと、そのまま時間切れになる。 */
    await p
      .goto(`http://localhost:${PORT}${sc.page}`, {
        waitUntil: MODE === "wait" ? "domcontentloaded" : "networkidle",
        timeout: 60000,
      })
      .catch(() => {});
    await p.waitForTimeout(MODE === "wait" ? 2500 : 1500);

    if (sc.tab) {
      /* 机の札も、じぶんのものの札も `.mp-tab`。**字で押す**
         （並びが変わっても同じ道具が開く）。 */
      await p
        .locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await p.waitForTimeout(MODE === "wait" ? 2000 : 1600);
    }
    /* 畳みの中。**閉じたままだと1つも数えない**（`hitbox.mjs` と同じ理由で
       閉じた `<details>` の中は飛ばしている）。畳みの中にも欄と押しどころが
       ある——OBS の鍵、今週やること、つないである人——ので、
       `OPENALL=1` でぜんぶ開けてもう一度回す。**開けた回と開けない回は
       別の数として出す。** 混ぜると、どちらを見た数なのか分からなくなる。 */
    if (sc.open || process.env.OPENALL) {
      await p.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      await p.waitForTimeout(700);
    }

    /* 下まで送ってから測る。`content-visibility: auto` の畳みは、画面の外に
       いるあいだ `contain-intrinsic-size` の値で高さを答える（`CLAUDE.md`）。 */
    for (let i = 0; i < 40; i++) {
      const before = await p.evaluate(() => {
        window.scrollBy(0, 2000);
        return document.documentElement.scrollHeight;
      });
      await p.waitForTimeout(60);
      const after = await p.evaluate(() => document.documentElement.scrollHeight);
      if (before === after && i > 2) break;
    }
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);

    const r = await p.evaluate(measure, true);
    r.errs = errs;
    report[sc.id][W] = r;
    if (W === 390) {
      await p.screenshot({ path: `${OUT}/${sc.id}-390.png`, fullPage: true });
    }
    await ctx.close();
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await b.close();

/* ---- 読み上げ ---------------------------------------------------- */
let ngFace = 0;
let ngTap = 0;
let ngOver = 0;
for (const [id, byW] of Object.entries(report)) {
  console.log(`\n=== ${id} ===`);
  for (const W of [360, 390]) {
    const r = byW[W];
    if (!r) continue;
    const probe = r.faces.filter((f) => f.probe).length;
    const real = r.faces.filter((f) => !f.probe);
    const realTaps = r.taps.filter((t) => !t.probe);
    const small = realTaps.filter((t) => !t.hit || t.hit[0] < 48 || t.hit[1] < 48);
    if (r.over > 0) ngOver++;
    if (W === 390) {
      ngFace += real.length;
      ngTap += small.length;
    }
    console.log(
      `  ${W}px  高さ ${r.height}px  横あふれ ${r.over}px  ` +
        `島の外の顔 ${real.length}（校正 ${probe}/5）  押しどころ否 ${small.length}/${realTaps.length}` +
        (r.errs.length ? `  JSエラー ${r.errs.length}` : ""),
    );
    if (probe < 5) console.log(`    ※ 校正が ${probe}/5。**この面の「島の外の顔」は信じない**`);
    for (const f of real)
      console.log(`    外の顔 ${f.what}「${f.label || f.text}」 台の上=${f.onForm} ${f.why.join(" / ")}`);
    for (const t of small)
      console.log(`    小さい ${t.what}「${t.text}」 箱 ${t.box.join("x")} 当たり ${t.hit ? t.hit.join("x") : t.why}`);
    for (const e of r.errs) console.log(`    JS ${e}`);
  }
}
console.log(`\n[${MODE}] 島の外の顔 ${ngFace} / 押しどころ否 ${ngTap} / 横あふれの出た幅 ${ngOver}`);
