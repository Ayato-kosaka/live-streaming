/**
 * 島の吹き出し（`.isle-talk`）を、**開いていることを確かめてから**測る。
 *
 *   node tools/sprites/isletalk.mjs                  # 本番を 360 / 390 / 1280 で
 *   WIDTHS=390 node tools/sprites/isletalk.mjs       # 幅を指定する
 *   SPORT=4220 node tools/sprites/isletalk.mjs       # 手元の書き出し（静的に配ったもの）
 *   BREAK=open node tools/sprites/isletalk.mjs       # 道具をわざと壊す（対照が落ちることを見る）
 *
 * ## なぜ要るか（2026-09-16 に3回続けて外した）
 *
 * 本番の島を開いて住人を押し、「吹き出しが画面の左に食い込んで各行の1文字目が
 * 切れている」と報告しかけた。**絵もそう撮れていた。** けれど不具合ではなく、
 * 測りかたのほうが壊れていた。
 *
 * - 押す相手（`.isle-who-hit`）を**1回だけ取って使い回していた**
 * - 押したあと **160ms** で測っていた。島の住人は遠ければ**歩いて近づいてから**
 *   話すので（`IsleStage` の `approach`）、160ms ではまだ開いていない
 * - 島の吹き出しは「**画面のどこかを押すと閉じる**」（`onStageClick`）。
 *   しかも話しているあいだは `.isle-who-hit` の `pointer-events` が切れるので、
 *   **同じ座標への次の押しが、前の吹き出しを閉じる。**
 *   自分で開けて自分で閉じるのを、110回くり返していた
 *
 * 開いているかを見ずに数えたので、**閉じている面を「はみ出し0件」に数えていた。**
 * 間を置いて測り直すと 14人 × 7点 = 98回すべて `left=12` / `right=378`（幅390）で、
 * CSS の指定どおり。別の道具の24回も合わせて**122回、1件も食い込んでいない。**
 *
 * だから、この道具は次の3つを守る。
 *
 * 1. **1回ごとに `.isle-who-hit` を取り直す。** 使い回さない
 * 2. **測る前に「いま開いているか」を必ず見る**（`offsetParent` と大きさ）。
 *    開いていない回は**数えない。**「0件」に混ぜない
 * 3. **「押した回数」ではなく「開いた回数」と「測れた回数」を出す。**
 *    分母の出ていない0件は読めない（`docs/island-standards.md` §15）
 *
 * ## 対照を中に持っている
 *
 * 「はみ出し0件」は、**見ていないから0件**かもしれない。数字を出す前に、
 * `.isle-talk` を横へずらし・高さを潰した細工を差し込んで1度測り、
 * **はみ出しと字の切れが両方とも拾えることを見る。** 拾えなければ、
 * 本番の数字は**1つも出さずに**終了コード2で落ちる。
 *
 * 通す条件は「1件でも拾えたら」**ではない。** 細工はずっと当たっているので、
 * **測れたと言った点すべてで拾えないとおかしい。**「1件でも」にしていると、
 * `BREAK=open` で壊した道具が「2点測って1件拾えた」で素通りして、
 * そのあと堂々と 0件の合格を出す（実際に1度そうなった）。
 *
 * 終了コードは `cardshot.mjs` / `served.mjs` に合わせる。
 * 0＝通った / 1＝違反があった / 2＝数えるものが無い（対照が落ちた・開かなかった）。
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { viaCurl, blocked } from "./prod.mjs";
import { offline } from "./route.mjs";
import { openChecked } from "./served.mjs";

const SPORT = process.env.SPORT || "";
const ORIGIN =
  process.env.ORIGIN || (SPORT ? `http://127.0.0.1:${SPORT}` : "https://live-streaming-d3cac.web.app");
/** 手元に配ったものを見ているか。本番は curl 経由にしないとブラウザが届かない */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(ORIGIN);
const WIDTHS = (process.env.WIDTHS || "360,390,1280").split(",").map((s) => parseInt(s, 10));
const PATH = process.env.ISLE_PATH || "/";
/** わざと壊す（対照が落ちることを見せる用）。`open`＝開いているかを見ない */
const BREAK = process.env.BREAK || "";

/** 吹き出しが開くまで待つ上限。住人が遠いと歩いて近づいてから話す */
const OPEN_MS = 9000;
/** 開いたあと、時間を追って測る点（開いたのを見た時刻からの ms） */
const AT = [0, 120, 300, 600, 1000, 1500, 2200];
/** 閉じてから次を押すまで置く間。ここを詰めると自分の押しが次の押しを潰す */
const SETTLE_MS = 500;

const CTRL_CSS = `
.isle-talk { left: -40px !important; right: auto !important; width: 300px !important;
             height: 24px !important; overflow: hidden !important; }
`;

/** ページの中で1回ぶん読む。**開いていなければ測らずに理由を返す。** */
const READ = (broken) => {
  const el = document.querySelector(".isle-talk");
  // 壊しかた `open`: 開いているかを見ずに数える（2026-09-16 にやった作り）
  if (!el) return broken ? { open: true, ok: true, empty: true } : { open: false, why: "出ていない" };
  if (!broken) {
    if (!el.offsetParent) return { open: false, why: "offsetParent が無い" };
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return { open: false, why: "見えない" };
  }
  const r = el.getBoundingClientRect();
  if (!broken && (r.width < 1 || r.height < 1)) return { open: false, why: "大きさが0" };
  const W = window.innerWidth;
  const H = window.innerHeight;
  const T = 0.5; // 小数の丸めぶん
  const over = [];
  if (r.left < -T) over.push(`左 ${r.left.toFixed(1)}`);
  if (r.right > W + T) over.push(`右 ${(r.right - W).toFixed(1)}`);
  if (r.top < -T) over.push(`上 ${r.top.toFixed(1)}`);
  if (r.bottom > H + T) over.push(`下 ${(r.bottom - H).toFixed(1)}`);
  // 字の切れ。**はみ出しとは別に数える。** 画面には収まっていても中で切れる
  const cut = [];
  const seen = [["吹き出し", el], ["文", el.querySelector("p")], ["添え", el.querySelector(".isle-talk-tap")]];
  for (const [name, e] of seen) {
    if (!e) continue;
    if (e.scrollWidth - e.clientWidth > 1) cut.push(`${name} 横 ${e.scrollWidth}>${e.clientWidth}`);
    if (e.scrollHeight - e.clientHeight > 1) cut.push(`${name} 縦 ${e.scrollHeight}>${e.clientHeight}`);
  }
  return {
    open: true,
    box: { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) },
    vw: W,
    over,
    cut,
    text: (el.querySelector("p")?.textContent || "").slice(0, 18),
  };
};

/**
 * **押しても大丈夫な場所**を1つ返す。
 *
 * 吹き出しを閉じるには島のどこかを押せばよいが、**画面のまん中あたりには
 * 行き先のリンクがいる。** 幅1280で (640,240) を押したら島ごと別の面へ飛んで、
 * そこから先の「住人0人／はみ出し0件」が**全部「見ていない」の0**だった。
 * 押す前に `elementFromPoint` で、リンクでも押しどころでもないことを見る。
 */
const SAFE_POINT = () => {
  const host = document.querySelector(".isle");
  if (!host) return null;
  const r = host.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  for (const fy of [0.3, 0.22, 0.38, 0.46, 0.14, 0.54]) {
    for (const fx of [0.5, 0.36, 0.64, 0.26, 0.74, 0.44, 0.56]) {
      const x = Math.round(r.left + r.width * fx);
      const y = Math.round(r.top + r.height * fy);
      if (x < 2 || y < 2 || x > W - 2 || y > H - 2) continue;
      const e = document.elementFromPoint(x, y);
      if (!e || !host.contains(e)) continue;
      if (e.closest("a, button, [role='button'], [data-ui]")) continue;
      return { x, y };
    }
  }
  return null;
};

/** 島の面のままか。押した先が別の面なら、そこから数えたものは全部「見ていない」 */
const ON_ISLE = () => !!document.querySelector(".isle");

/** いま開いているか（開閉の見張り用。測りには使わない） */
const IS_OPEN = () => {
  const el = document.querySelector(".isle-talk");
  if (!el || !el.offsetParent) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
};

/** 島の地面を1回押す。リンクを踏まない場所を選んでから押す */
async function tapGround(p) {
  const at = await p.evaluate(SAFE_POINT);
  if (at) await p.mouse.click(at.x, at.y);
  // 空いている場所が1つも無ければ、島そのものに押しを渡す（`onStageClick`）
  else await p.evaluate(() => document.querySelector(".isle")?.click());
}

/** 吹き出しを閉じる。島のどこかを押すだけ（`onStageClick`）。閉じるまで見届ける */
async function ensureClosed(p) {
  for (let i = 0; i < 6; i++) {
    if (!(await p.evaluate(IS_OPEN))) return true;
    // 話しているあいだは建物も住人も当たりを持たないので、島のどこを押しても閉じる
    await tapGround(p);
    await p.waitForTimeout(250);
  }
  return !(await p.evaluate(IS_OPEN));
}

/**
 * 1つの幅ぶん測る。
 *
 * 返すのは数の内訳。**「押した」と「開いた」と「測れた」を分けて持つ。**
 * この3つを1つに潰した瞬間、見ていない回が0件のほうへ混ざる。
 *   taps 押した / reach 画面の中にいて届いた / opened 吹き出しが開いた /
 *   samples 開いた状態で測れた点 / over はみ出し / cut 字の切れ /
 *   boxes 出た位置 / who 住人 / folk 押しどころ / leftIsle 途中で島から出たか
 */
async function pass(p, w, h, { broken = false, max = 0 } = {}) {
  const out = { taps: 0, reach: 0, opened: 0, samples: 0, over: [], cut: [], boxes: new Set(), folk: 0, who: 0, leftIsle: false };
  const c = await p.evaluate(() => ({
    who: document.querySelectorAll(".isle-who").length,
    hit: document.querySelectorAll(".isle-who-hit").length,
  }));
  out.who = c.who;
  out.folk = c.hit;
  const n = max ? Math.min(max, out.folk) : out.folk;
  for (let i = 0; i < n; i++) {
    // 押した先が別の面に飛んでいたら、ここから先は島を見ていない
    if (!(await p.evaluate(ON_ISLE))) {
      out.leftIsle = true;
      break;
    }
    // **毎回ここで取り直す。** 住人は歩くので、前に取った座標はもう別の場所
    const at = await p.evaluate((k) => {
      const b = document.querySelectorAll(".isle-who-hit")[k];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const inView = x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;
      return { x, y, inView, self: document.elementFromPoint(x, y) === b };
    }, i);
    if (!broken) {
      // 押す前に必ず閉じておく。開いたままだと、この押しが「閉じる押し」になる
      if (!(await ensureClosed(p))) continue;
      await p.waitForTimeout(SETTLE_MS);
    }
    out.taps++;
    if (!at || !at.inView) continue;
    out.reach++;
    if (at.self) await p.mouse.click(Math.round(at.x), Math.round(at.y));
    // 他のものに覆われている住人は、座標を押しても届かない。要素ごしに押す
    else await p.evaluate((k) => document.querySelectorAll(".isle-who-hit")[k]?.click(), i);

    if (broken) {
      // 壊しかた: 160ms 決め打ちで、開いているかを見ずに数える
      await p.waitForTimeout(160);
      const r = await p.evaluate(READ, true);
      out.samples++;
      if (r.over?.length) out.over.push(`#${i} ${r.over.join(" / ")}`);
      if (r.cut?.length) out.cut.push(`#${i} ${r.cut.join(" / ")}`);
      continue;
    }

    // 開くまで待つ。遠い住人は歩いて近づいてから話す
    let open = false;
    for (let t = 0; t < OPEN_MS; t += 100) {
      if (await p.evaluate(IS_OPEN)) {
        open = true;
        break;
      }
      await p.waitForTimeout(100);
    }
    if (!open) continue;
    out.opened++;
    // 時間を追って測る。開いた直後だけ見ると、寄りのカメラが動いている途中を拾う
    let prev = 0;
    for (const ms of AT) {
      await p.waitForTimeout(ms - prev);
      prev = ms;
      const r = await p.evaluate(READ, false);
      if (!r.open) continue; // 途中で閉じた回は数えない
      out.samples++;
      out.boxes.add(`${r.box.l}..${r.box.r}/${r.vw}`);
      if (r.over.length) out.over.push(`#${i}+${ms}ms ${r.over.join(" / ")}「${r.text}」`);
      if (r.cut.length) out.cut.push(`#${i}+${ms}ms ${r.cut.join(" / ")}「${r.text}」`);
    }
  }
  return out;
}

/** 1つの幅で島を開く。開けなければ null（数えない） */
async function openIsle(b, w, h, { css = "" } = {}) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: w < 640,
    hasTouch: w < 640,
  });
  if (!LOCAL) await viaCurl(ctx);
  /* 住人の絵を1人ずつ本物にする（`route.mjs`）。**全員 ayato に潰さない。**
     ただし本番を見ているときは、落としてある写しが無ければ潰すほうが害なので、
     そのときは curl に任せる（`prod.mjs` が本物を取ってくる） */
  const cached = existsSync("/tmp/chars") || existsSync("/tmp/avatars");
  if (LOCAL || cached) await offline(ctx);
  const p = await ctx.newPage();
  const miss = [];
  const r = await openChecked(p, ORIGIN, PATH, { miss });
  if (!r.ok) {
    console.error(`  開けませんでした: ${miss.join(" / ")}`);
    await ctx.close();
    return null;
  }
  if (css) await p.addStyleTag({ content: css });
  /* 住人の絵が届いてからでないと押しどころが描かれない（`ready.has(v.icon)`）。
     **1個出た時点で進まない。** 幅1280では 464ms の時点で 11人中1人ぶんしか
     出ておらず、そこから数えると10人ぶんを黙って落としていた。
     `.isle-who` の数（住人そのもの）に追いつくまで待つ */
  try {
    await p.waitForFunction(
      () => {
        const who = document.querySelectorAll(".isle-who").length;
        const hit = document.querySelectorAll(".isle-who-hit").length;
        return who > 0 && hit >= who;
      },
      null,
      { timeout: 30000 },
    );
  } catch {
    /* 揃わなかったぶんは下で数に出る（住人 N人 と 押しどころ の差） */
  }
  await p.waitForTimeout(1500);
  // 初回の案内（`hint`）と、住人のほうから声をかけてくる1回を、先に片づける
  await tapGround(p);
  await p.waitForTimeout(800);
  if (!(await p.evaluate(ON_ISLE))) {
    console.error("  最初の押しで島から出てしまいました。数えません");
    await ctx.close();
    return null;
  }
  return { ctx, p };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

console.log(`島の吹き出し（.isle-talk）  ${ORIGIN}${PATH}  幅 ${WIDTHS.join(" / ")}`);
console.log(LOCAL ? "手元に配ったものを見ています" : "本番を curl 経由で見ています（prod.mjs）");
if (BREAK) console.log(`**道具をわざと壊しています（BREAK=${BREAK}）**`);

/* ---- まず対照。**細工を拾えなければ、本番の数字は1つも出さない。** ---- */
const CW = 390;
const ctrl = await openIsle(b, CW, 844, { css: CTRL_CSS });
if (!ctrl) {
  console.error("対照の面が開けませんでした。数字は出しません。");
  await b.close();
  process.exit(2);
}
// 対照は3人ぶんで足りる（拾えるかどうかだけを見る）
const cres = await pass(ctrl.p, CW, 844, { broken: BREAK === "open", max: 3 });
await ctrl.ctx.close();
const cOver = cres.over.length;
const cCut = cres.cut.length;
console.log(
  `\n対照（.isle-talk を左へ -40px・高さ 24px に潰した面）  幅${CW}\n` +
    `  住人 ${cres.who}人（押しどころ ${cres.folk}）/ 押した ${cres.taps} / 届いた ${cres.reach} / ` +
    `開いた ${cres.opened} / 測れた ${cres.samples}\n` +
    `  はみ出し ${cOver}件 / 字の切れ ${cCut}件`,
);
if (cres.over[0]) console.log(`    例 ${cres.over[0]}`);
if (cres.cut[0]) console.log(`    例 ${cres.cut[0]}`);
/* **「1件でも拾えた」では通さない。** 細工はずっと当たっているので、
   *測れたと言った回*は**すべて**拾えないとおかしい。1回でも拾えないなら、
   その回は開いていないものを数えている（それが 2026-09-16 にやったこと）。
   `BREAK=open` で壊すと、たまたま開いていた1回だけ拾えて 2点中1件になる。
   「1件でも拾えたら通す」にしていると、そこを素通りして 0件の合格を出す。 */
if (!cres.opened || !cres.samples || cOver !== cres.samples || cCut !== cres.samples) {
  console.error(
    `\n対照が通りませんでした。細工はずっと当たっているので、**測れたと言った ` +
      `${cres.samples}点すべて**で拾えないとおかしい` +
      `（拾えたのは はみ出し ${cOver} / 字の切れ ${cCut}、開いた ${cres.opened}）。\n` +
      "**この道具は、開いていないものを数えています。**\n" +
      "本番の数字は出しません（0件と出しても、見ていないだけかもしれないため）。",
  );
  await b.close();
  process.exit(2);
}
console.log(`  → 測れた ${cres.samples}点すべてで拾えた。ここから本番の数字を出します`);

/* ---- 本番（または手元）を、幅ごとに ---- */
let over = 0;
let cut = 0;
let samples = 0;
let opened = 0;
const rows = [];
/** 1点も測れなかった幅。**「0件」ではなく「見ていない」として落とす** */
const blind = [];
for (const w of WIDTHS) {
  const h = w >= 1024 ? 800 : 844;
  const r = await openIsle(b, w, h);
  if (!r) {
    rows.push(`幅${w}  開けなかった`);
    blind.push(`幅${w}（開けなかった）`);
    continue;
  }
  const res = await pass(r.p, w, h, { broken: BREAK === "open" });
  const stopped = [...blocked(r.ctx).entries()].map(([k, v]) => `${k}×${v}`);
  await r.ctx.close();
  over += res.over.length;
  cut += res.cut.length;
  samples += res.samples;
  opened += res.opened;
  if (!res.samples) blind.push(`幅${w}（${res.leftIsle ? "島から出た" : res.who ? "吹き出しが1つも開かなかった" : "住人が居ない"}）`);
  rows.push(
    `幅${w}  住人 ${res.who}人（押しどころ ${res.folk}）/ 押した ${res.taps} / 届いた ${res.reach} / ` +
      `**開いた ${res.opened}** / **測れた ${res.samples}** / ` +
      `はみ出し ${res.over.length}件 / 字の切れ ${res.cut.length}件` +
      (res.leftIsle ? "\n        **途中で島から出ました。ここから先は見ていません**" : "") +
      (res.boxes.size ? `\n        出た位置 ${[...res.boxes].join(" , ")}` : "") +
      (stopped.length ? `\n        止めた先 ${stopped.join(" , ")}` : ""),
  );
  for (const m of res.over) rows.push(`        はみ出し ${m}`);
  for (const m of res.cut) rows.push(`        字の切れ ${m}`);
}
await b.close();

console.log("");
for (const r of rows) console.log(r);
console.log(
  `\n合計  開いた ${opened}回 / 測れた ${samples}点 / ` +
    `はみ出し ${over}件 / 字の切れ ${cut}件`,
);

/* 開いた回より多くの点を測れるはずがない。合わないときは、開いているかを
   見ずに数えている（`IS_OPEN` を通していない）ということ */
if (samples > opened * AT.length) {
  console.error(
    `\n開いた ${opened}回では 測れた ${samples}点 になりません。` +
      "**開いていないものを数えています。**",
  );
  process.exit(2);
}
if (blind.length) {
  console.error(
    `\n測れていない幅が ${blind.length} 件あります: ${blind.join(" , ")}\n` +
      "**「0件」は「無い」ではなく「見ていない」です**（`docs/island-standards.md` §15）。",
  );
  process.exit(2);
}
if (over || cut) {
  console.error(`\nだめ: はみ出し ${over}件 / 字の切れ ${cut}件`);
  process.exit(1);
}
console.log("島の吹き出しは、どの幅でも画面に収まっていて、字も切れていない");
process.exit(0);
