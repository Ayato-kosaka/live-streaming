/**
 * 字の濃さを、計算ではなく**描かれた画素**から測る。
 *
 * 3周続けて手で数えている（`docs/island-review-3.md` 17章 23）ので、道具にした。
 *
 *   PORT=3180 OPEN=1 PAGES=/map,/friends node tools/sprites/inkpx.mjs
 *   python3 tools/sprites/inkpx.py <TAG> <_map など>        # どの字が薄いかの表
 *   BREAK=declared node tools/sprites/inkpx.mjs             # わざと盲点を作る（対照が落ちる）
 *
 * 終了コード: 0＝通った / 1＝見つかった（4.5 割れ） / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・字を1つも拾えなかった面がある）。
 *
 * ## 撮るだけの道具から、合否を出す道具にした（2026-09-17）
 *
 * ここは長いこと**撮るだけ**で、合否は `inkpx.py` の表を人が読んでいた。
 * 人が読む表は `| tail` と一緒に消えるし、読まなければ何も止めない
 * （`docs/island-misses.md` #124 と同じ形）。なので撮った2枚をその場で読んで、
 * **4.5 を割った数を終了コードにする。**
 * 計算は `inkjudge.mjs`（`inkpx.py` と同じ式）。表が要るときは `.py` を回す。
 *
 * OPEN=1 で畳んであるものを全部開く。CLICK に "|" 区切りで押す先を渡せる。
 * GAP=6000 で、押すたびにそのぶん待つ（島の建物は歩いて着いてから2回目で入る）。
 * LIM=4.5 で合格の下限。
 *
 * 1. 字を持つ要素をぜんぶ拾って、位置と字の色を書き出す
 * 2. そのまま1枚撮る（shot.png）
 * 3. 字だけ消してもう1枚撮る（bg.png）
 * 4. 2枚の差＝「字が乗っている画素」を、その下の地と比べる
 *
 * 縁取りは字といっしょに消えるので、比を水増ししない。
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
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   declared  字の色を、描かれた画素ではなく宣言された値から取る
 *             （`opacity` で薄めた字が 21:1 の黒として通る。`docs/island-review-4.md` 2章）
 *   nomask    字の画素だけでなく、箱の中ぜんぶを測る（地に薄められて何もかも割れになる）
 *   nolim     下限を 0 にする（何も割れにならない＝ゆるめる向き）
 *   noclip    切られて画面に出ていない字も数に入れる
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, serveDirectory, reportControl } from "./fixserve.mjs";
import { judgeInk } from "./inkjudge.mjs";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.PORT || "3180";
const PATHS = (process.env.PAGES || "/map").split(",");
const TAG = process.env.TAG || "ink";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 3);
const LIM = Number(process.env.LIM || 4.5);
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
const p = await ctx.newPage();

/**
 * 面を1枚、2枚組で撮る。**対照にも本物にも同じものを当てる。**
 * 別々に書くと、対照が見ているものと本番が見ているものが食い違う。
 *
 * @returns {Promise<{boxes: object[], name: string}>}
 */
async function shoot(p, base, path, miss) {
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
    await p.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
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
  // 押したときに画面が動いていると、通しで撮った1枚と箱の座標がずれる
  // （固定ヘッダのある面で、貼り合わせがずれる）。先に頭まで戻す。
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);

  const boxes = await p.evaluate((skipClip) => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
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
      out.push({
        t: t.slice(0, 24),
        c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
        tag: el.tagName,
        color: svg ? cs.fill : cs.color,
        opacity: cs.opacity,
        size: cs.fontSize,
        x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      });
      el.setAttribute("data-inkmark", String(out.length - 1));
    }
    return out;
  }, skip.clip);

  const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
  await p.screenshot({ path: `${OUT}/${name}.shot.png`, fullPage: true });
  // 字だけ消す。`visibility: hidden` にすると、その要素の**地まで**消えて
  // ボタンの上の白い字が「クリームの上の白」に化ける。色を透明にして、
  // 縁取り・影も消す（縁取りは比を上げないので、いっしょに消すのが正しい）。
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      // fill / stroke は SVG の字にだけ効かせる。ふつうの要素に掛けると、
      // 中に入っている図（凡例の線）まで消えて、地の色を取り違える。
      if (el.ownerSVGElement || el.tagName === "text") {
        el.style.setProperty("fill", "transparent", "important");
        el.style.setProperty("stroke", "transparent", "important");
      }
    }
  });
  await p.screenshot({ path: `${OUT}/${name}.bg.png`, fullPage: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  return { boxes, name };
}

/** 撮った2枚を配って、ブラウザに読み直させる。Node に PNG を解く道具を足さない */
const shots = await serveDirectory(OUT);
/** 読ませるためだけの面。島の CSS を持ち込まない。
    **撮った2枚を配っているところへ先に行っておく。** `about:blank` のままだと
    出どころが `null` になって、同じ場所の絵すら `fetch` できない */
const judgePage = await (await b.newContext({ viewport: { width: 200, height: 200 } })).newPage();
await judgePage.goto(`${shots.base}/`).catch(() => {});
const judge = (r, lim = skip.lim) =>
  judgeInk(judgePage, {
    shotUrl: `${shots.base}/${r.name}.shot.png`,
    bgUrl: `${shots.base}/${r.name}.bg.png`,
    boxes: r.boxes, dpr: DPR, lim,
    declared: skip.declared, maskMin: skip.maskMin,
  });

/** 数字を1つも出さずに落ちる。**対照が外れた回に本番の数を読ませない** */
async function bail(msg) {
  console.log(msg);
  shots.close();
  await b.close();
  process.exit(2);
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
  const shot = await shoot(p, fx.base, "/fix.html", miss0);
  if (!shot) { fx.close(); await bail("対照の面が開けませんでした。"); }
  const j = await judge(shot, skip.ctlLim);
  fx.close();
  if (j.err) await bail(`対照が読めませんでした（${j.err}）。`);
  console.log("── 対照（濃さの分かっている字を、割れに挙げられるか／挙げずにいられるか）");
  const cls = (r) => String(r.c || "").split(/\s+/);
  const checks = [];
  for (const [name, wantSeen, wantBad] of WANT) {
    const row = j.rows.find((r) => cls(r).includes(name));
    /* **「拾った」と「測れた」を分けて見る。** 切られて画面に出ていない字は、
       拾ってしまっても2枚の絵が同じなので「字の画素が足りない」で落ちる。
       measured だけ見ていると、拾う側の守り（`clipped`）が外れても対照が
       10/10 で素通りする（`BREAK=noclip` が実際にそうだった）。 */
    checks.push({ name: `${name}（拾った）`, want: wantSeen, got: shot.boxes.some((b) => String(b.c || "").split(/\s+/).includes(name)) });
    if (wantSeen) {
      checks.push({
        name: `${name}（測れた）`, want: true, got: !!row,
        note: row ? `中央 ${row.mid.toFixed(2)} / 暗地 ${row.rlo.toFixed(2)}` : "",
      });
      checks.push({ name: `${name}（${skip.ctlLim} 割れ）`, want: wantBad, got: !!row?.bad });
    }
  }
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
/** 開けなかった面。**空でなければ 2 で落ちる**（`served.mjs`）。 */
const miss = [];
let seenPages = 0, nBoxes = 0, nRows = 0, nBad = 0;
const nDrop = {};
for (const path of PATHS) {
  const shot = await shoot(p, `http://localhost:${PORT}`, path, miss);
  if (!shot) continue;
  seenPages++;
  nBoxes += shot.boxes.length;
  /* **字が1つも無い面は「読める」ではなく「見ていない」。**
     島の面で字の無いものは1枚も無いので、0 は数え方か開いた先の間違い
     （`docs/island-standards.md` §15）。 */
  if (shot.boxes.length === 0) { miss.push(`${path}（字を1つも拾えなかった）`); continue; }
  const j = await judge(shot);
  if (j.err) { miss.push(`${path}（撮った2枚が読めない: ${j.err}）`); continue; }
  nRows += j.rows.length;
  for (const [k, v] of Object.entries(j.dropped)) nDrop[k] = (nDrop[k] || 0) + v;
  const bad = j.rows.filter((r) => r.bad).sort((a, b) => a.mid - b.mid);
  nBad += bad.length;
  console.log(`${path}  拾った字 ${shot.boxes.length}か所 / 測れた ${j.rows.length}か所 / ${LIM} 割れ ${bad.length}か所`);
  for (const r of bad)
    console.log(
      `  ${r.mid.toFixed(2).padStart(6)} 中央 / ${r.rhi.toFixed(2).padStart(6)} 明地 / ${r.rlo.toFixed(2).padStart(6)} 暗地  ` +
        `${r.size.padStart(6)}  ${String(r.c).slice(0, 26)} «${String(r.t).slice(0, 18)}»`,
    );
}
shots.close();
await b.close();

// **分母から読む。** 「割れ 0」は、測っていないから 0 かもしれない（§15）
console.log(`\n── 数えたもの（幅 ${W}px / dpr ${DPR} / 下限 ${LIM}）`);
console.log(`  見た面       ${seenPages} / ${PATHS.length}`);
console.log(`  拾った字     ${nBoxes} か所`);
console.log(`  測れた字     ${nRows} か所`);
console.log(`  測れなかった ${Object.entries(nDrop).map(([k, v]) => `${k} ${v}`).join(" / ") || "なし"}`);
console.log(`  ${LIM} 割れ     ${nBad} か所`);
console.log(`  見ていないもの: 欄の中の字（placeholder と閉じた <select>。それは liveink.mjs）`);
console.log(`  どの字が薄いかの表は python3 tools/sprites/inkpx.py ${TAG} <_map など>`);

if (miss.length) { reportMissing(miss); process.exit(2); }
if (!nRows) {
  console.log("\n字を1か所も測れませんでした。数えるものがありません。");
  process.exit(2);
}
if (nBad) {
  console.log(`\nだめ: ${LIM} を割る字が ${nBad} か所。`);
  process.exit(1);
}
console.log(`\n${seenPages}面、${LIM} 割れは見つかりませんでした。`);
process.exit(0);
