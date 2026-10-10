/**
 * 字の濃さを、**画面のぶんずつ送りながら**測る。
 *
 *   PORT=4150 PAGES=/,/nordic/finland node tools/sprites/inkband.mjs
 *
 * 終了コード: 0＝通った / 1＝見つかった（4.5 割れ） / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・字を1つも拾えなかった面がある・
 * **拾った字のうち測れた割合が下限に届かない面がある**）。
 *
 * ## 分母の関門（2026-10-07）
 *
 * 「拾った字／測れた字」を**報告に出してはいた**が、**その割合で止まって
 * いなかった。** しかも**どの帯にも収まらなかった字を分母に入れていなかった**
 * ので、**縮んだ分母のまま 100% に見えていた。**
 *
 *   直す前  /nordic/guide   拾った字 337 / 測れた 337 → 100%（緑）
 *   分母を出した            拾った字 502 / 測れた 344 → **69%**（2 で止まる）
 *   送り方も直した          拾った字 503 / 測れた 503 → 100%（`inkpx.mjs` と同数）
 *
 * **分母を出したら、隠れていた穴がもう1つ出てきた。** 帯を送る終わりを
 * **送る前に測った面の高さ**で決めていたので、送るうちに伸びたぶん
 * （`content-visibility: auto` の段が本当の高さに変わる）を**一度も見て
 * いなかった。** 158か所がそれ。背が高くて収まらなかったのではない
 * （実測で 844px を越える字は `/nordic/guide` に1つも無い）。
 * 面の高さは**毎回測り直す**ようにした。
 *
 * いまは割合が下限（`FLOOR=`、既定 0.9）に届かなければ、
 * **0 でも 1 でもなく 2** で止める。関門は `inkpx.mjs` と**同じ1か所**
 * （`inkrate.mjs`）から呼ぶ——あちらで直した関門が、こちらでは
 * 効いていなかったのがこの穴の正体。
 *
 * **背の高い字を測れるようにはしない。** 窓を面ごとに広げる側は
 * `inkpx.mjs` の持ち場（`CAP=4000`）。ここは
 * **「自分では数えられない」と言って止まる**のが仕事。
 *
 * ## `inkpx.mjs` と何が違うか（2026-09-17）
 *
 * **計算は同じ**（どちらも `inkjudge.mjs` を呼ぶ）。**撮りかただけが違う。**
 * あちらは面ぜんぶを1枚に撮る（`fullPage`）。それだと
 * **`content-visibility: auto` の段が描かれない。**
 * 表紙（`/`）の下半分（`.hchap-mat`）がそれで、120か所のうち **58か所**が
 * 「字の画素が足りない」で落ちていた。24面で 284か所。
 * **落ちたぶんは「割れ 0」に化ける**（`docs/island-misses.md` #130、§15）。
 *
 * ここは画面のぶんだけ送って、そのつど画面の大きさで2枚撮る。
 * 描かれていない段は送った時点で描かれるので、そこも測れる。
 * そうやって初めて出たのが `/nordic/finland` の街の札4件（4.10〜4.50）。
 * 実測（2026-10-07。分母を出し、送り方を直したあと）:
 * `/nordic/guide` 503/503、`/island/caucasus/streams` 1,461/1,461、`/friends` 33/33。
 * **どれも `inkpx.mjs` と同じ数**（あちらの 503 / 1,461 と一致）。
 *
 * 背の高い面を1枚に撮ると**2枚が食い違う**という別の穴（#130 の2）にも、
 * こちらは当たらない。撮る絵が画面1枚ぶんで収まるため。
 *
 * **あちらの代わりではない。** ここは
 * **画面より背の高い字（長い段落の入れ物）を測れない**——帯からはみ出すものは
 * どの帯にも収まらない。**ただし数には出す**（分母に入れて、割合で止まる）。
 * 測りたいなら `inkpx.mjs`。だから両方回して、両方の分母を読む。
 *
 * ## 対照
 *
 * 台はこの道具のもの（`inkbandfix/fix.html`）。`inkpxfix` の4つの字に、
 * **この道具にしか無い足を3本**足してある:
 *
 *   - 画面3枚ぶんより背が高い（送らないと下まで届かない）
 *   - `content-visibility: auto` の段がある（**1枚に撮る側は描かない**）
 *   - **画面より背の高い字が2つある**（この道具には測れない。
 *     **分母に出て、割合で 2 になる**ところまでが対照）
 *
 * 見るのは、割れてほしい3つ（うち1つは畳まれた段の中）を挙げること、
 * 割れてはいけない3つ（うち1つは畳まれた段の中）を挙げないこと、
 * 画面に出ていない2つを数に入れないこと、
 * **同じ字が帯をまたいで二重に数えられていないこと**、そして
 * **測れなかった2つが分母に出ていること**（縮んだ分母なら 100% で通って
 * しまうことまで、両方の計算を並べて見る）。1つでも外したら 2 で落ちる。
 *
 * **この台は「通る面」ではない。** 測れない字をわざと置いてあるので、
 * 台そのものの割合は下限に届かない。それが出ることが対照。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nolim     下限を 0 にする（何も割れにならない＝ゆるめる向き）
 *   nodedupe  同じ字を帯ごとに数え直す（重なった帯で同じ字が2回出る）
 *   noband    送らずに、いちばん上の画面だけ見る（畳まれた段に届かない）
 *   nofloor   測れた割合を見ない（**直す前の返しかた。測れていないのに緑**）
 *   nodenom   収まらなかった字を分母に入れない（**直す前の数えかた。
 *             縮んだ分母で 100% に見える**）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, serveDirectory, reportControl } from "./fixserve.mjs";
import { judgeInk } from "./inkjudge.mjs";
/* 関門は `inkpx.mjs` と**同じ1か所**から呼ぶ。片方だけ直すと、同じ面で
   0 と 2 に割れて、どちらが本当か分からなくなる（`inkrate.mjs` の頭） */
import { exitCode, rate, thin as thinPages, FLOOR as FLOOR0 } from "./inkrate.mjs";

const PORT = process.env.PORT || "4150";
const PAGES = (process.env.PAGES || "/").split(",");
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
const LIM = Number(process.env.LIM || 4.5);
const TAG = process.env.TAG || "band";
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });
const BREAK = process.env.BREAK || "";
const lim = BREAK === "nolim" ? 0 : LIM;
/* 対照の字は 4.5 に合わせて選んである（2.85 / 1.84 / 6.93 / 21.0）ので、
   `LIM=` を上げると対照のほうが先に落ちる。ゆるめる向きだけ両方に効かせる
   （`inkpx.mjs` と同じ決まり。`docs/island-misses.md` #128 の決めごと3）。 */
const ctlLim = BREAK === "nolim" ? 0 : 4.5;
/** `noband` … 送らない（`inkpx.mjs` が届かないところに、こちらも届かなくなる） */
const noBand = BREAK === "noband";
/** 拾った字のうち、これだけ測れていなければ **2**（根拠は `inkpx.mjs` の「下限を 0.9 にした根拠」） */
const FLOOR = Number(process.env.FLOOR ?? FLOOR0);
/** `nofloor` … 関門を外す（0 を渡すと `thin()` が素通りする。直す前の返しかた） */
const floor = BREAK === "nofloor" ? 0 : FLOOR;
/** `nodenom` … 収まらなかった字を分母に入れない（直す前の数えかた） */
const noDenom = BREAK === "nodenom";

/**
 * 画面に出ている字を拾う。**帯からはみ出すものは撮らないが、分母には入れる。**
 *
 * 数えるのは**要素**（`data-inkbandseen` を貼る）。字づらで束ねていたころは、
 * **分母が要素・分子が測った数**という別々の単位で割っていて、
 * 同じ字（「9/20」が何枚もある）を1つに潰したぶん**分子が分母を越えた**
 * （`/nordic/guide` で 451 拾って 337 測れて、収まらなかったのが 126 ——
 * 足すと分母を越える）。要素に貼れば取り違えない（`inkpx.mjs` と同じ）。
 *
 * @param {boolean} nodedupe 同じ要素を帯ごとに撮り直す（`BREAK=nodedupe`）
 * @returns {object[]} この帯に**収まりきっていて、まだ撮っていない**字（これを撮る）
 */
const COLLECT = (nodedupe) => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    /* **その字そのものの箱を測る。入れ物の箱ではない。**
       入れ物には子が入っていることがあり、子の地まで「この字の地」として
       数えてしまう。`/map` の `.atrip-when` がそれで、中に「いまここ」の
       赤い札（白字）が入っている。入れ物の箱で測ると、茶色い日付の墨を
       赤い札の地と比べることになって 1.42 が出た——**画面のどこにも
       起きていない組み合わせ**（#130）。Range なら字の行だけを囲む。 */
    const rng = document.createRange();
    rng.selectNodeContents(n);
    const rr = rng.getBoundingClientRect();
    const r = rr.width >= 2 && rr.height >= 2 ? rr : el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    /* 畳んである折りたたみの中身は、`overflow: hidden` で切られているだけで
       箱の大きさは残っている。そのまま数えると、**画面に出ていない字が分母に
       入って**、どうやっても届かない割合になる（`inkpx.mjs` の `SCAN` と同じ検査。
       片方だけ直すと、同じ面で 0 と 2 に割れる） */
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
      const ar = a.getBoundingClientRect();
      if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) {
        clipped = true;
        break;
      }
    }
    if (clipped) continue;
    const svg = el.ownerSVGElement != null || el.tagName === "text";
    /* **分母は、収まるかを見る手前で貼る。**
       この札を下の `continue` の後ろで貼ると、**画面より背の高い字が分母から
       消えて、縮んだ分母のまま 100% に見える**（2026-10-07 の穴そのもの）。
       測れないことと、数えないことは別。 */
    el.setAttribute("data-inkbandseen", "1");
    // 帯は重ねてある。同じ要素を帯ごとに撮り直すと、同じ字が2回数えられる
    if (!nodedupe && el.hasAttribute("data-inkbanddone")) continue;
    /* 撮るのは画面に入りきっているものだけ。半分だけ写っている字を測ると、
       切れたところが「字の画素が足りない」に化ける。またぐものは次の帯で拾う
       （**画面より背の高い字は、どの帯でもここで落ちる。** 分母には上で入れた） */
    if (r.top < 0 || r.bottom > innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    out.push({
      t: t.slice(0, 24),
      c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
      tag: el.tagName,
      color: svg ? cs.fill : cs.color,
      opacity: cs.opacity, size: cs.fontSize,
      x: r.x, y: r.y, w: r.width, h: r.height,
    });
    el.setAttribute("data-inkbanddone", "1");
    el.setAttribute("data-inkband", "1");
  }
  return out;
};
const HIDE = () => {
  for (const el of document.querySelectorAll("[data-inkband]")) {
    el.style.setProperty("color", "transparent", "important");
    el.style.setProperty("text-shadow", "none", "important");
    el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    if (el.ownerSVGElement || el.tagName === "text") {
      el.style.setProperty("fill", "transparent", "important");
      el.style.setProperty("stroke", "transparent", "important");
    }
  }
};
/** 印と差し込みを戻す。戻さないと、次の帯で「字の無い面」を撮ることになる */
const SHOW = () => {
  for (const el of document.querySelectorAll("[data-inkband]")) {
    for (const k of ["color", "text-shadow", "-webkit-text-stroke-color", "fill", "stroke"]) el.style.removeProperty(k);
    el.removeAttribute("data-inkband");
  }
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR,
  isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce",
});
await offline(ctx);
/* 島は rAF で動く。2枚のあいだに住人が歩くと、差分に字と関係ない画素が混ざる
   （`CLAUDE.md`「島を止めてから撮る」）。`SEED=` を渡さないときは止めるだけ。 */
await (await import(process.env.SEED || "./freeze.mjs")).apply(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

const shots = await serveDirectory(OUT);
/** 撮った2枚を読ませるためだけの面。島の CSS を持ち込まない */
const judgePage = await (await b.newContext({ viewport: { width: 200, height: 200 } })).newPage();
await judgePage.goto(`${shots.base}/`).catch(() => {});

const bail = async (msg) => { console.log(msg); shots.close(); await b.close(); process.exit(2); };

/**
 * 面を1枚、帯ごとに測る。
 * @returns {Promise<{picked: number, rows: object[], dropped: object, over: number} | null>}
 *   picked … 画面に出ていた字（**収まらなかったものも入れる**。分母）
 *   over   … そのうち、どの帯にも収まらなかった字（**測れていない**）
 */
async function bandRun(base, path, miss) {
  /* **面ごとに新しいタブ。** 同じタブで撮り続けると、背の高い面で
     描画のプロセスが落ちる（`shotstable.mjs` と同じ理由） */
  /* **タブを開くところも try の中。** ブラウザごと落ちたとき、ここが外に
     あると `browserContext.newPage: Target page, context or browser has been
     closed` が**捕まらない例外**になって、道具が数を1つも出さずに死ぬ。
     2026-10-07 に 134面を一息で回したとき、75面目のあとで実際にそうなった
     （`tapink.mjs` はそれ以来、面を小分けにして子を起こす）。
     落ちたことは「測れなかった面」として数に残す——**黙って終わらない。** */
  let p;
  try {
    p = await ctx.newPage();
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) return null;
    await p.waitForTimeout(1500);
    // 畳んであるものは全部開く。開いた中身も測らないと、面の半分を見ないまま「読める」と言うことになる
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(1000);
    const rows = [];
    const dropped = {};
    const name = (path.replace(/\//g, "_").replace(/\.html$/, "") || "_");
    for (let y = 0, i = 0; ; y += Math.floor(H / 2), i++) {
      /* **送り先の限りは、毎回測り直す。** 送るうちに面は伸びる
         （`content-visibility: auto` の段が、見積りの高さから本当の高さに
         変わる）。頭で1回測った高さで終わりを決めていたので、
         **伸びたぶんの下を一度も見ていなかった。**
         分母を出してはじめて見えた穴で、`/nordic/guide` の 502か所のうち
         158か所がこれ（背が高いからではなかった。実測で 844px を越える字は
         1つも無い）。`inkpx.mjs` は毎回測り直している（2026-10-07）。 */
      const docH = await p.evaluate(() => document.documentElement.scrollHeight);
      if (noBand ? y > 0 : y >= docH) break;
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(500);
      const boxes = await p.evaluate(COLLECT, BREAK === "nodedupe");
      if (!boxes.length) { await p.evaluate(SHOW); continue; }
      const nm = `${name}-${i}`;
      await p.screenshot({ path: `${OUT}/${nm}.shot.png` });
      await p.evaluate(HIDE);
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${OUT}/${nm}.bg.png` });
      await p.evaluate(SHOW);
      const j = await judgeInk(judgePage, {
        shotUrl: `${shots.base}/${nm}.shot.png`, bgUrl: `${shots.base}/${nm}.bg.png`,
        boxes, dpr: DPR, lim,
      });
      if (j.err) { miss.push(`${path} の帯${i}（撮った2枚が読めない: ${j.err}）`); continue; }
      rows.push(...j.rows);
      for (const [k, v] of Object.entries(j.dropped)) dropped[k] = (dropped[k] || 0) + v;
    }
    /* **どの帯にも収まらなかった字を数える。** 画面には出ていたのに、
       一度も撮れなかったもの＝画面（`H`）より背の高い字。
       ここを出さないと、分母が勝手に縮んで「ぜんぶ測れた」に見える。
       `nodenom` のときは撮れたものだけを分母にする（直す前の数えかた）。 */
    const n = await p.evaluate(() => ({
      seen: document.querySelectorAll("[data-inkbandseen]").length,
      done: document.querySelectorAll("[data-inkbanddone]").length,
    }));
    return {
      picked: noDenom ? n.done : n.seen,
      rows, dropped,
      over: noDenom ? 0 : n.seen - n.done,
    };
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p?.close().catch(() => {});
  }
}

/* ── 対照が先。落ちたら本物の面の数字は出さない ──────────────────── */
{
  /** class ごとに、測ってほしいか（画面に出ているか）と、割れに挙げてほしいか */
  const WANT = [
    ["ik-bad-gray", true, true],       // #999 / 2.85
    ["ik-bad-opacity", true, true],    // #000 を 0.25 で薄めたもの / 1.84
    ["ik-ok-gray", true, false],       // #5a5a5a / 6.93
    ["ik-ok-black", true, false],      // #000 / 21.0
    ["ik-cv-bad", true, true],         // 畳まれた段の中の #999。**この道具の存在理由**
    ["ik-cv-ok", true, false],         // 同じ段の中の #000
    ["ik-hidden-clip", false, false],  // 切られて画面に出ていない
    ["ik-hidden-none", false, false],  // display:none
  ];
  const fx = await serveFixtures("inkbandfix");
  const miss0 = [];
  const r = await bandRun(fx.base, "/fix.html", miss0);
  fx.close();
  if (!r) await bail("対照の台が開けませんでした。");
  const cls = (x) => String(x.c || "").split(/\s+/);
  const checks = [];
  for (const [nm, wantSeen, wantBad] of WANT) {
    const hits = r.rows.filter((x) => cls(x).includes(nm));
    const row = hits[0];
    checks.push({ name: `${nm}（測れた）`, want: wantSeen, got: !!row, note: row ? `中央 ${row.mid.toFixed(2)}` : "" });
    if (wantSeen) {
      checks.push({ name: `${nm}（${ctlLim} 割れ）`, want: wantBad, got: !!row && row.mid < ctlLim });
      /* **帯は重ねてある。** 同じ字を帯ごとに数え直していたら、ここで2回出る。
         数が増える向きの間違いは「薄い字がたくさん見つかった」という
         仕事をしたような形で出るので、数える手前で止める */
      checks.push({ name: `${nm}（1回だけ数えた）`, want: false, got: hits.length > 1, note: `${hits.length}回` });
    }
  }

  /* ── 分母の対照。**ここがこの道具の直しの本体**（2026-10-07）─────────
     台には**画面より背の高い字（`ik-tall`）が2つ**置いてある。この道具には
     測れない。見るのは「測れないこと」ではなく、**測れなかったと言えること**。
     縮んだ分母（撮れたものだけ）だと 100% で通ってしまうので、両方の計算を
     並べて、**出した分母のほうでだけ止まる**ことまで見る。 */
  const measured = r.rows.length;
  const got = rate(r.picked, measured);
  checks.push({
    name: "画面より背の高い字を、分母に出した",
    want: true, got: r.over >= 2,
    note: `収まらなかった ${r.over}か所 / 拾った ${r.picked} / 測れた ${measured} = ${got.toFixed(2)}`,
  });
  checks.push({
    name: "その字は測れていない（挙げたふりをしない）",
    want: false, got: r.rows.some((x) => cls(x).includes("ik-tall")),
  });
  checks.push({
    name: `出した分母なら、下限 ${FLOOR} で止まる`,
    want: true,
    got: thinPages([{ path: "/fix.html", picked: r.picked, measured }], floor).length === 1,
  });
  checks.push({
    name: "縮んだ分母（撮れたものだけ）だと通ってしまう（直す前の姿）",
    want: true,
    got: thinPages([{ path: "/fix.html", picked: measured, measured }], FLOOR).length === 0,
  });
  checks.push({
    name: "止まるときは 0 でも 1 でもなく 2",
    want: true,
    got: exitCode({
      thin: thinPages([{ path: "/fix.html", picked: r.picked, measured }], floor).length,
      measured, bad: r.rows.filter((x) => x.bad).length,
    }) === 2,
  });

  console.log("── 対照（濃さの分かっている字を、割れに挙げられるか／挙げずにいられるか）");
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
const miss = [];
let seenPages = 0, nPicked = 0, nRows = 0, nBad = 0, nOver = 0;
const nDrop = {};
/** 面ごとの分母と分子。**測れた割合が足りなければ 0 でも 1 でもなく 2 で止める** */
const pages = [];
for (const path of PAGES) {
  const r = await bandRun(`http://localhost:${PORT}`, path, miss);
  if (!r) { console.log(`${path}  開けず`); continue; }
  seenPages++;
  /* **字が1つも無い面は「読める」ではなく「見ていない」。**
     島の面で字の無いものは1枚も無い（`docs/island-standards.md` §15） */
  if (!r.picked) { miss.push(`${path}（字を1つも拾えなかった）`); continue; }
  nPicked += r.picked;
  nRows += r.rows.length;
  nOver += r.over;
  for (const [k, v] of Object.entries(r.dropped)) nDrop[k] = (nDrop[k] || 0) + v;
  const bad = r.rows.filter((x) => x.bad).sort((a, c) => a.mid - c.mid);
  nBad += bad.length;
  pages.push({ path, picked: r.picked, measured: r.rows.length });
  console.log(
    `${path}  拾った字 ${r.picked}か所 / 測れた ${r.rows.length}か所` +
      `（${(rate(r.picked, r.rows.length) * 100).toFixed(0)}%。収まらず ${r.over}か所）` +
      ` / ${LIM} 割れ ${bad.length}か所`,
  );
  for (const x of bad)
    console.log(
      `  ${x.mid.toFixed(2).padStart(6)} 中央 / ${x.rhi.toFixed(2).padStart(6)} 明地 / ${x.rlo.toFixed(2).padStart(6)} 暗地  ` +
        `${x.size.padStart(6)}  字[${x.ink}] 地[${x.lo}]  ${x.tag}.${String(x.c).slice(0, 20)} «${String(x.t).slice(0, 18)}»`,
    );
}
shots.close();
await b.close();

// **分母から読む。** 「割れ 0」は、測っていないから 0 かもしれない（§15）
console.log(`\n── 数えたもの（幅 ${W}px / dpr ${DPR} / 下限 ${LIM} / 帯 ${Math.floor(H / 2)}px ずつ / 測れた割合の下限 ${FLOOR}）`);
console.log(`  見た面       ${seenPages} / ${PAGES.length}`);
console.log(`  拾った字     ${nPicked} か所`);
console.log(`  測れた字     ${nRows} か所（${nPicked ? ((nRows / nPicked) * 100).toFixed(1) : "0.0"}%）`);
console.log(`  測れなかった ${Object.entries(nDrop).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
console.log(`  帯に収まらず ${nOver} か所（画面 ${H}px に収まらない字。**測りたいなら inkpx.mjs**）`);
console.log(`  ${LIM} 割れ     ${nBad} か所`);
console.log(`  見ていないもの: 欄の中の字（placeholder と閉じた <select>。それは liveink.mjs）`);

/** **「測れなかった」を「合格」と言わない**（`docs/island-standards.md` §13 §15） */
const thin = thinPages(pages, floor);
const code = exitCode({ missing: miss.length, thin: thin.length, measured: nRows, bad: nBad });

if (miss.length) reportMissing(miss);
if (thin.length) {
  console.log(`\n測れた割合が ${FLOOR} に届かない面が ${thin.length} 枚あります。`);
  for (const t of thin) console.log(`  ・${t.path}（拾った ${t.picked} / 測れた ${t.measured} = ${t.rate.toFixed(2)}）`);
  console.log("  **この面の「割れ 0」は読んではいけません。** 数えられていません。");
  console.log("  画面より背の高い字が残っているなら、その面は `inkpx.mjs` で測ってください。");
}
if (!nRows) console.log("\n字を1か所も測れませんでした。数えるものがありません。");
if (code === 1) console.log(`\nだめ: ${LIM} を割る字が ${nBad} か所。`);
if (code === 0) console.log(`\n${seenPages}面、${LIM} 割れは見つかりませんでした。`);
process.exit(code);
