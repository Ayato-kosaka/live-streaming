/**
 * 字の濃さを、計算ではなく**描かれた画素**から測る。
 *
 * 3周続けて手で数えている（`docs/island-review-3.md` 17章 23）ので、道具にした。
 *
 *   PORT=3180 OPEN=1 PAGES=/map,/friends node tools/sprites/inkpx.mjs
 *   python3 tools/sprites/inkpx.py <TAG> <_map-0 など>      # どの字が薄いかの表（帯ごと）
 *   BREAK=declared node tools/sprites/inkpx.mjs             # わざと盲点を作る（対照が落ちる）
 *
 * 終了コード: 0＝通った / 1＝見つかった（4.5 割れ） / **2＝数えられなかった**
 * （対照が落ちた・開けなかった面がある・字を1つも拾えなかった面がある・
 * **拾った字のうち測れた割合が足りない**）。
 *
 * ## 撮るだけの道具から、合否を出す道具にした（2026-09-17）
 *
 * ここは長いこと**撮るだけ**で、合否は `inkpx.py` の表を人が読んでいた。
 * 人が読む表は `| tail` と一緒に消えるし、読まなければ何も止めない
 * （`docs/island-misses.md` #124 と同じ形）。なので撮った2枚をその場で読んで、
 * **4.5 を割った数を終了コードにする。**
 * 計算は `inkjudge.mjs`（`inkpx.py` と同じ式）。表が要るときは `.py` を回す。
 *
 * ## 面ぜんぶを1枚に撮るのをやめた（2026-10-07）
 *
 * ここは `fullPage: true` で面ぜんぶを1枚に撮っていた。**長い面で、
 * 何も測らないまま「割れ 0」を返していた。**
 *
 * | 面 | 背の高さ | 拾った字 | 測れた字 | 返していた答え |
 * | --- | --- | --- | --- | --- |
 * | `/island/caucasus/streams` | 長い | 1,461 | **0** | 「割れ 0」＝緑 |
 * | `/nordic/guide` | 17,677px（dpr3 で 53,031px） | 355 | 一部 | **割れ 45**（全部まぼろし） |
 *
 * 2つとも根は同じ。`content-visibility: auto` の段は**画面の外にいるあいだ
 * 描かれない**ので、1枚に撮った絵のその部分は**白いまま**になる。
 * 白と白を比べると「字の画素が足りない」で落ちるか（＝測れた 0）、
 * わずかなにじみを字として拾って 1.1〜1.5 と出る（＝まぼろしの割れ）。
 * どちらも**数えられなかった**が、片方は緑、片方は赤で出ていた。
 *
 * `docs/island-standards.md` §13 §15 の
 * 「満たしようのない見張りは、いつも通る見張りと同じだけ悪い」
 * 「0 と 1 と 2 を同じ顔で返さない」に、両方で当たっていた。
 *
 * **いまは窓を送りながら、そのつど画面の大きさで2枚撮る。**
 * 送った時点でその段は描かれるので、測れる。そのうえで
 * **拾った字のうち何割を測れたか**を出して、足りなければ 0 でも 1 でもなく
 * **2（数えられなかった）**で止める。下限は `FLOOR=`（既定 0.9）。
 *
 * ### 下限を 0.9 にした根拠（実測。2026-10-07 / 幅390 / dpr3）
 *
 * 直したあとの実測（測れた割合）:
 *
 * | 面 | 拾った字 | 測れた字 | 割合 |
 * | --- | --- | --- | --- |
 * | `/island/caucasus/streams` | 1,461 | 1,461 | **1.00**（直す前は 0.00） |
 * | `/nordic/guide` | 503 | 503 | **1.00**（直す前は一部。割れ45はまぼろし） |
 * | `/map` | 278 | 278 | 1.00 |
 * | `/about` | 120 | 120 | 1.00 |
 * | `/friends` | 33 | 33 | 1.00 |
 * | `/` | 116 | 113 | **0.97**（「字の画素が足りない」3件） |
 *
 * **いちばん低くて 0.97、直す前の壊れた面は 0.00。あいだが空いている**ので、
 * 下限をどこに置いても同じだけ効く。0.9 にしたのは、面を1つ足したときに
 * 数件落ちただけで赤くしないため（0.97 の面にまだ 7 ポイントの余裕がある）。
 *
 * ### `inkband.mjs` と何が違うか
 *
 * **計算は同じ**（どちらも `inkjudge.mjs` を呼ぶ。式を2か所に書かない）。
 * 違うのは窓の高さの決めかた。あちらは画面（844px）に固定なので、
 * **画面より背の高い字をどの帯にも収められず、数えずに落とす。**
 * ここは面ごとに**いちばん背の高い字に合わせて窓を広げる**（`CAP=4000` まで）ので、
 * 長い段落の入れ物も測れる。入らなかったものは
 * 「窓に収まらない」として**数に出す**（黙って落とさない）。
 *
 * ## 数える前に対照を通す
 *
 * `tools/sprites/inkpxfix/fix.html` に、**濃さの分かっている字**が置いてある。
 * 割れてほしい2つ（2.85 と、`opacity` で薄めた 1.84）を挙げ、
 * 割れてはいけない2つ（6.93 と 21.0）を挙げず、
 * 画面に出ていない2つを数に入れないことを見てから、本物の面を測る。
 * 片側だけだと、**しきい値をゆるめた道具も、なんでも割れと言う道具も通る**
 * （`docs/island-misses.md` #125）。1つでも外したら 2 で落ちる。
 *
 * **長い台（`inkpxfix/long.html`）も通す。** `content-visibility: auto` の段を
 * 3つ持った、画面8枚ぶんの面で、**測れた割合が 1.00 になること**を見る。
 * ここを見ないと、上の直しが効いているかを誰も確かめていないことになる。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   declared  字の色を、描かれた画素ではなく宣言された値から取る
 *             （`opacity` で薄めた字が 21:1 の黒として通る。`docs/island-review-4.md` 2章）
 *   nomask    字の画素だけでなく、箱の中ぜんぶを測る（地に薄められて何もかも割れになる）
 *   nolim     下限を 0 にする（何も割れにならない＝ゆるめる向き）
 *   noclip    切られて画面に出ていない字も数に入れる
 *   noband    窓を送らない（直す前の撮りかた。長い台で測れた割合が落ちる）
 *   nofloor   測れた割合を見ない（**直す前の返しかた。測れていないのに緑**）
 *
 * `INKDUMP=1` で、長い台の1行ずつ（class・中央・暗地・字の色・地の色）を出す。
 * 対照が外れたときに「どこで取り違えたか」を見るためのもの。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, serveDirectory, reportControl } from "./fixserve.mjs";
import { judgeInk } from "./inkjudge.mjs";
import { exitCode, rate, thin as thinPages, FLOOR as FLOOR0 } from "./inkrate.mjs";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.PORT || "3180";
const PATHS = (process.env.PAGES || "/map").split(",");
const TAG = process.env.TAG || "ink";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
/** **2 以上で撮る。** dpr1 だと同じ字が 7.02、dpr2 だと 9.25 と2〜3割低く出る（`CLAUDE.md`） */
const DPR = Number(process.env.DPR || 3);
const LIM = Number(process.env.LIM || 4.5);
/** 窓をどこまで広げてよいか。390x4000 を dpr3 で撮ると 1170x12000 画素 */
const CAP = Number(process.env.CAP || 4000);
/** 拾った字のうち、これだけ測れていなければ **2**（根拠は上の見出し） */
const FLOOR = Number(process.env.FLOOR ?? FLOOR0);
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });
/** わざと盲点を作る。何が効いているかを見るためのもの（上の一覧） */
const BREAK = process.env.BREAK || "";
const skip = {
  declared: BREAK === "declared",
  // -1 にすると「色の変わっていない画素」まで混ざる（地に薄められる）
  maskMin: BREAK === "nomask" ? -1 : 40,
  /* 本番の下限は `LIM=` で動かせるが、**対照の下限は動かさない。**
     対照の字は 4.5 に合わせて選んである（2.85 / 1.84 / 6.93 / 21.0）ので、
     `LIM=7` で回すと 6.93 の字が割れて、対照のほうが先に落ちる。
     ゆるめる向きの壊し方（`nolim`）だけは、両方に効かせる */
  lim: BREAK === "nolim" ? 0 : LIM,
  ctlLim: BREAK === "nolim" ? 0 : 4.5,
  clip: BREAK === "noclip",
  band: BREAK !== "noband",
  floor: BREAK === "nofloor" ? 0 : FLOOR,
};

/**
 * 面の中の字を拾う。**窓を送るたびに呼ぶ。**
 *
 * `content-visibility: auto` の段は、画面の外にいるあいだ**中身が組まれない**
 * （子の `getBoundingClientRect()` が 0 で返る）。だから頭で1回数えても
 * 分母にならない。送った先で、そこに現れた字をそのつど数える。
 *
 * @returns {{fresh: object[], boxes: object[]}}
 *   fresh … この窓で**はじめて見つけた**字（分母に足す）
 *   boxes … この窓に**収まりきっていて、まだ測っていない**字（これを撮る）
 */
const SCAN = (skipClip) => {
  /** その要素の、いちばん最初の字（入れ物の箱ではなく、字そのものの行を囲む） */
  const rectOf = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !(n.textContent || "").trim()) continue;
      const rng = document.createRange();
      rng.selectNodeContents(n);
      const rr = rng.getBoundingClientRect();
      if (rr.width >= 2 && rr.height >= 2) return rr;
      break;
    }
    return el.getBoundingClientRect();
  };
  const fresh = [];
  const boxes = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    /* **その字そのものの箱を測る。入れ物の箱ではない。**
       `inkband.mjs` と同じ理由（#130）。入れ物に子が入っていると、
       子の地まで「この字の地」として数える。`/map` の `.atrip-when` は
       中に赤い「いまここ」の札（白字）を抱えていて、茶色い日付の墨を
       その赤と比べて 1.42 が出ていた——**画面には無い組み合わせ**。
       **2つの撮りかたで同じ直しが要る。** 片方だけ直すと、
       同じ面で 0 と 1 に割れて、どちらが本当か分からなくなる */
    const r = rectOf(el);
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    // 親が透明なもの（地図の「ぜんぶ」の街の名前は .acity ごと opacity:0）は、
    // 画面に出ていない。自分だけ見ても分からないので、上まで見る。
    const vis = el.checkVisibility?.({
      opacityProperty: true, visibilityProperty: true,
      checkOpacity: true, checkVisibilityCSS: true,
    });
    if (vis === false) continue;
    // 畳んである折りたたみの中身は、`overflow: hidden` で切られているだけで
    // 箱の大きさは残っている。そのまま測ると、画面には出ていない字を拾う。
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
    if (clipped && !skipClip) continue;
    const svg = el.ownerSVGElement != null || el.tagName === "text";
    const row = {
      t: t.slice(0, 24),
      c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
      tag: el.tagName,
      color: svg ? cs.fill : cs.color,
      opacity: cs.opacity,
      size: cs.fontSize,
      x: r.x, y: r.y, w: r.width, h: r.height,
    };
    /* **番号は要素に貼る。** 窓ごとに位置が変わるので座標は鍵にならないし、
       同じ字（「9/20」が何枚もある）を字づらで束ねると、別の札を1つに
       潰して分母が減る。要素そのものに番号を貼れば取り違えない */
    let id = el.getAttribute("data-inkmark");
    if (id === null) {
      id = String(window.__inkN = (window.__inkN || 0) + 1);
      el.setAttribute("data-inkmark", id);
      fresh.push({ ...row, i: Number(id) });
    }
    if (el.hasAttribute("data-inkdone")) continue;
    /* 窓に入りきっているものだけ撮る。半分だけ写っている字を測ると、
       切れたところが「字の画素が足りない」に化ける。またぐものは次の窓で拾う */
    if (r.top < 0 || r.bottom > innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    el.setAttribute("data-inkdone", "1");
    boxes.push({ ...row, i: Number(id) });
  }
  return { fresh, boxes };
};

/**
 * 字だけ消す。**地は消さない。** 縁取りと影も字といっしょに消す（比を水増ししない）。
 *
 * **要素の `style` を直に触らない。** 窓ごとに消しては戻すので、
 * `style.removeProperty("color")` で戻すと、**その面が自分で書いていた
 * `style="color:…"` まで剥がしてしまう。** 長い台でこれを踏んで、
 * 2窓目から先の字が全部 body の色（#222）になり、うすい灰色の字（2.85）が
 * 15.91 として通っていた。差し込む札を1枚足して、剥がすだけにする。
 */
const HIDE = () => {
  const st = document.createElement("style");
  st.id = "ink-hide";
  st.textContent =
    "[data-inkmark]{color:transparent !important;text-shadow:none !important;" +
    "-webkit-text-stroke-color:transparent !important}" +
    // fill / stroke は SVG の中の字にだけ効かせる。ふつうの要素に掛けると、
    // 中に入っている図（凡例の線）まで消えて、地の色を取り違える。
    "svg [data-inkmark],svg[data-inkmark]{fill:transparent !important;stroke:transparent !important}";
  document.head.appendChild(st);
};
/** 戻す。戻さないと、次の窓で「字の無い面」を撮ることになる */
const SHOW = () => {
  document.getElementById("ink-hide")?.remove();
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
/* **島を止めてから撮る**（`CLAUDE.md`）。島は rAF で動くので、CSS の
   animation を切るだけでは足りない。2枚のあいだに住人が歩きカメラが寄ると、
   差分に字と関係ない画素が混ざる（「地が紫（住人の服）」が実際に出た）。
   ここは `reducedMotion` しか置いていなかった。 */
await (await import("./freeze.mjs")).apply(ctx);
/* ログインした人にしか出ない面（じぶんのこと）を測るための差し込み口。
   `SEED=tools/sprites/asme.mjs` を渡すと、入っている人として開く。 */
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
/* 2回撮って差を見る道具なので、**2枚のあいだに消えるものがあると差が嘘になる。**
   歩きかたの案内は 5.6 秒で消える。1枚目には写って2枚目には写らないので、
   その下の札が動いて、動いたぶんが「字の画素」として数えられていた
   （札の字を「クリーム色の字が海に乗っている」と報告した）。
   ほかの測り道具（framecpu / _abport / isleshot）と同じ鍵を置いて、
   **2回目以降に来た人**の画面で測る。案内が出ている数秒は別に見る。 */
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

/** 撮った2枚を配って、ブラウザに読み直させる。Node に PNG を解く道具を足さない */
const shots = await serveDirectory(OUT);
/** 読ませるためだけの面。島の CSS を持ち込まない。
    **撮った2枚を配っているところへ先に行っておく。** `about:blank` のままだと
    出どころが `null` になって、同じ場所の絵すら `fetch` できない */
const judgePage = await (await b.newContext({ viewport: { width: 200, height: 200 } })).newPage();
await judgePage.goto(`${shots.base}/`).catch(() => {});

/** 数字を1つも出さずに落ちる。**対照が外れた回に本番の数を読ませない** */
async function bail(msg) {
  console.log(msg);
  shots.close();
  await b.close();
  process.exit(2);
}

/**
 * 面を1枚、**窓を送りながら**測る。
 *
 * @returns {Promise<{picked: number, rows: object[], dropped: object, over: number, band: number} | null>}
 */
async function run(base, path, miss) {
  /* **面ごとに新しいタブ。** 同じタブで撮り続けると、背の高い面で
     描画のプロセスが落ちる（`shotstable.mjs` と同じ理由） */
  const p = await ctx.newPage();
  try {
    /* **素のパスで開かない。** 静的に配ると `/map` は 301 して
       `python3 -m http.server` の**ディレクトリ一覧**を返す。黒字に白地なので
       濃さは楽に 4.5 を越え、**一覧の字を測って「読める」と報告していた**
       （`/map` 37か所 → `/map.html` 108か所）。 */
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) { console.log(`${path}  開けず（${got.why}）`); return null; }
    await p.waitForTimeout(1500);
    if (process.env.OPEN) {
      // 畳んであるものを全部開く。開いた中身も測らないと、
      // 面の半分を見ないまま「読める」と言うことになる。
      await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    }
    if (process.env.CLICK) {
      /* 押すたびに待つ。島の建物は**1回目で歩き出して、着いてから2回目で中に入る**ので、
         間を置かずに2回押すと板が開かないまま撮ることになる（GAP は待つミリ秒） */
      const gap = Number(process.env.GAP || 0);
      for (const sel of process.env.CLICK.split("|")) {
        await p.click(sel, { force: true }).catch(() => {});
        if (gap) await p.waitForTimeout(gap);
      }
    }
    await p.waitForTimeout(1400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(500);

    /* **窓の高さを、いちばん背の高い字に合わせる。**
       画面に固定すると、入れ物が画面より高い字（長い段落）がどの窓にも
       収まらず、黙って落ちる（`inkband.mjs` がそれ）。いま見えている字から
       測って広げる。送った先でもっと高いものが出てきたら、そのぶんは
       「窓に収まらない」として数に出す。 */
    const tallest = await p.evaluate(() => {
      let m = 0;
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!(n.textContent || "").trim()) continue;
        const rng = document.createRange();
        rng.selectNodeContents(n);
        const h = rng.getBoundingClientRect().height;
        if (h > m) m = h;
      }
      return m;
    });
    const band = Math.min(CAP, Math.max(H, Math.ceil(tallest) + 40));
    if (band !== H) {
      await p.setViewportSize({ width: W, height: band });
      await p.waitForTimeout(600);
      if (process.env.OPEN) {
        await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
        await p.waitForTimeout(400);
      }
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(300);
    }

    const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
    const rows = [];
    const dropped = {};
    let picked = 0;
    const step = Math.max(1, Math.floor(band / 2));
    let i = 0;

    /** その位置で1窓ぶん測る。撮るものが無ければ撮らない */
    const sweep = async (y) => {
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(400);
      const { fresh, boxes } = await p.evaluate(SCAN, skip.clip);
      picked += fresh.length;
      if (!boxes.length) return 0;
      const nm = `${name}-${i++}`;
      await p.screenshot({ path: `${OUT}/${nm}.shot.png` });
      await p.evaluate(HIDE);
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${OUT}/${nm}.bg.png` });
      await p.evaluate(SHOW);
      writeFileSync(`${OUT}/${nm}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
      const j = await judgeInk(judgePage, {
        shotUrl: `${shots.base}/${nm}.shot.png`, bgUrl: `${shots.base}/${nm}.bg.png`,
        boxes, dpr: DPR, lim: skip.lim,
        declared: skip.declared, maskMin: skip.maskMin,
      });
      if (j.err) { miss.push(`${path} の窓${i - 1}（撮った2枚が読めない: ${j.err}）`); return boxes.length; }
      rows.push(...j.rows);
      for (const [k, v] of Object.entries(j.dropped)) dropped[k] = (dropped[k] || 0) + v;
      return boxes.length;
    };

    /* **送るのは、送った先で面が伸びることがあるから毎回測り直す。**
       畳みを開くと背が伸びるし、`content-visibility` の段は中身が組まれた
       ところで `contain-intrinsic-size` の見積りから本当の高さに変わる。 */
    for (let y = 0; ; y += step) {
      await sweep(y);
      const docH = await p.evaluate(() => document.documentElement.scrollHeight);
      if (!skip.band || y + band >= docH) break;
    }

    /* **拾い残しを、もう一周して拾う。**
       等間隔で送るだけだと、**窓とほぼ同じ背丈の字がどの窓にも収まらない。**
       窓 1182px に 1152px の段落だと、入るのは頭が 0〜30px にいるときだけで、
       591px ずつ送っていては一度も当たらない（実測で落ちた）。
       残っているものの頭へ**直に送って**撮る。1つも進まなくなったらやめる。 */
    if (skip.band) {
      for (let guard = 0; guard < 200; guard++) {
        const next = await p.evaluate(() => {
          const el = document.querySelector("[data-inkmark]:not([data-inkdone]):not([data-inkover])");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: el.getAttribute("data-inkmark"), y: Math.max(0, r.top + window.scrollY - 20) };
        });
        if (!next) break;
        await sweep(next.y);
        /* **進まなかったものに札を立てる。** 送っても収まらない＝窓より背が高い。
           ここで止めないと、同じ字の前で永遠に回る */
        await p.evaluate((id) => {
          const el = document.querySelector(`[data-inkmark="${id}"]`);
          if (el && !el.hasAttribute("data-inkdone")) el.setAttribute("data-inkover", "1");
        }, next.id);
      }
    }

    /* **窓に収まらなかったものを、黙って落とさない。**
       番号は貼ったのに一度も撮られていない字＝どの窓にも入らなかった字。
       ここを数に出さないと、分母が勝手に縮んで「ぜんぶ測れた」に見える */
    const over = await p.evaluate(
      () => document.querySelectorAll("[data-inkmark]:not([data-inkdone])").length,
    );
    return { picked, rows, dropped, over, band };
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p.close().catch(() => {});
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
    ["ik-hidden-clip", false, false],  // 切られて画面に出ていない
    ["ik-hidden-none", false, false],  // display:none
  ];
  const fx = await serveFixtures("inkpxfix");
  const miss0 = [];
  const r = await run(fx.base, "/fix.html", miss0);
  if (!r) { fx.close(); await bail("対照の面が開けませんでした。"); }
  console.log("── 対照（濃さの分かっている字を、割れに挙げられるか／挙げずにいられるか）");
  const cls = (x) => String(x.c || "").split(/\s+/);
  const checks = [];
  for (const [nm, wantSeen, wantBad] of WANT) {
    const hits = r.rows.filter((x) => cls(x).includes(nm));
    const row = hits[0];
    checks.push({
      name: `${nm}（測れた）`, want: wantSeen, got: !!row,
      note: row ? `中央 ${row.mid.toFixed(2)} / 暗地 ${row.rlo.toFixed(2)}` : "",
    });
    if (wantSeen) {
      checks.push({ name: `${nm}（${skip.ctlLim} 割れ）`, want: wantBad, got: !!row && (row.mid < skip.ctlLim || row.rlo < skip.ctlLim) });
      /* **窓は重ねてある。** 同じ字を窓ごとに数え直していたら、ここで2回出る。
         数が増える向きの間違いは「薄い字がたくさん見つかった」という
         仕事をしたような形で出るので、数える手前で止める */
      checks.push({ name: `${nm}（1回だけ数えた）`, want: false, got: hits.length > 1, note: `${hits.length}回` });
    }
  }

  /* **長い台。** ここがこの直しの本体（上の「面ぜんぶを1枚に撮るのをやめた」）。
     画面8枚ぶん・`content-visibility: auto` の段を3つ持った面で、
     **拾った字をぜんぶ測れること**を見る。`BREAK=noband` で送るのをやめると
     測れた割合が落ちて、**2 で止まる**ところまでが対照。 */
  const rl = await run(fx.base, "/long.html", miss0);
  fx.close();
  if (!rl) await bail("長い対照の台が開けませんでした。");
  /* **関門そのものに当てる。** 道具の中で割り算を書き直すと、本番の関門
     （`inkrate.mjs`）が壊れても対照は通ってしまう */
  const got = rate(rl.picked, rl.rows.length);
  checks.push({
    name: `長い台（${Math.round(FLOOR * 100)}% 以上を測れた）`,
    want: true, got: thinPages([{ path: "/long.html", picked: rl.picked, measured: rl.rows.length }], skip.floor).length === 0,
    note: `拾った ${rl.picked} / 測れた ${rl.rows.length} = ${got.toFixed(2)}`,
  });
  checks.push({
    name: "長い台（畳まれた段の薄い字を挙げた）", want: true,
    got: rl.rows.some((x) => cls(x).includes("ik-cv-bad") && (x.mid < skip.ctlLim || x.rlo < skip.ctlLim)),
  });
  checks.push({
    name: "長い台（同じ段の濃い字は挙げない）", want: false,
    got: rl.rows.some((x) => cls(x).includes("ik-cv-ok") && (x.mid < skip.ctlLim || x.rlo < skip.ctlLim)),
  });
  checks.push({
    name: "長い台（画面より背の高い字も測れた）", want: true,
    got: rl.rows.some((x) => cls(x).includes("ik-tall")),
    note: `窓 ${rl.band}px`,
  });

  if (process.env.INKDUMP) {
    for (const x of rl.rows) console.log("DUMP", x.c, x.mid.toFixed(2), x.rlo.toFixed(2), JSON.stringify(x.ink), JSON.stringify(x.lo), x.t);
  }
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
/** 開けなかった面。**空でなければ 2 で落ちる**（`served.mjs`）。 */
const miss = [];
let seenPages = 0, nBoxes = 0, nRows = 0, nBad = 0, nOver = 0;
const nDrop = {};
/** 面ごとの分母と分子。**測れた割合が足りなければ 0 でも 1 でもなく 2 で止める** */
const pages = [];
for (const path of PATHS) {
  const r = await run(`http://localhost:${PORT}`, path, miss);
  if (!r) continue;
  seenPages++;
  /* **字が1つも無い面は「読める」ではなく「見ていない」。**
     島の面で字の無いものは1枚も無いので、0 は数え方か開いた先の間違い
     （`docs/island-standards.md` §15）。 */
  if (r.picked === 0) { miss.push(`${path}（字を1つも拾えなかった）`); continue; }
  nBoxes += r.picked;
  nRows += r.rows.length;
  nOver += r.over;
  for (const [k, v] of Object.entries(r.dropped)) nDrop[k] = (nDrop[k] || 0) + v;
  const bad = r.rows.filter((x) => x.bad).sort((a, c) => a.mid - c.mid);
  nBad += bad.length;
  const got = rate(r.picked, r.rows.length);
  pages.push({ path, picked: r.picked, measured: r.rows.length });
  console.log(
    `${path}  拾った字 ${r.picked}か所 / 測れた ${r.rows.length}か所（${(got * 100).toFixed(0)}%）` +
      ` / ${LIM} 割れ ${bad.length}か所  [窓 ${r.band}px]`,
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
console.log(`\n── 数えたもの（幅 ${W}px / dpr ${DPR} / 下限 ${LIM} / 測れた割合の下限 ${FLOOR}）`);
console.log(`  見た面       ${seenPages} / ${PATHS.length}`);
console.log(`  拾った字     ${nBoxes} か所`);
console.log(`  測れた字     ${nRows} か所（${nBoxes ? ((nRows / nBoxes) * 100).toFixed(1) : "0.0"}%）`);
console.log(`  測れなかった ${Object.entries(nDrop).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
console.log(`  窓に収まらず ${nOver} か所（CAP=${CAP}px より背の高い字）`);
console.log(`  ${LIM} 割れ     ${nBad} か所`);
console.log(`  見ていないもの: 欄の中の字（placeholder と閉じた <select>。それは liveink.mjs）`);
console.log(`  どの字が薄いかの表は python3 tools/sprites/inkpx.py ${TAG} <_map-0 など>`);

/** **「測れなかった」を「合格」と言わない**（`docs/island-standards.md` §13 §15） */
const thin = thinPages(pages, skip.floor);
const code = exitCode({ missing: miss.length, thin: thin.length, measured: nRows, bad: nBad });

if (miss.length) reportMissing(miss);
if (thin.length) {
  console.log(`\n測れた割合が ${FLOOR} に届かない面が ${thin.length} 枚あります。`);
  for (const t of thin) console.log(`  ・${t.path}（拾った ${t.picked} / 測れた ${t.measured} = ${t.rate.toFixed(2)}）`);
  console.log("  **この面の「割れ 0」は読んではいけません。** 数えられていません。");
}
if (!nRows) console.log("\n字を1か所も測れませんでした。数えるものがありません。");
if (code === 1) console.log(`\nだめ: ${LIM} を割る字が ${nBad} か所。`);
if (code === 0) console.log(`\n${seenPages}面、${LIM} 割れは見つかりませんでした。`);
process.exit(code);
