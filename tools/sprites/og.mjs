/**
 * 共有画像（`site/public/og.png`、**1200×630**）の下絵を、いまの島から撮る。
 *
 *   python3 tools/sprites/avatars.py && python3 tools/sprites/chars.py   # 先に顔を落とす
 *   PORT=4200 node tools/sprites/og.mjs
 *   PORT=4200 OUT=/tmp/og-new.png node tools/sprites/og.mjs
 *
 * **ここは下絵を撮るだけで、`site/public/og.png` は置き換えない。**
 * 差し替えるかどうかは、撮ったものを見てから人が決める（表紙の島は章で
 * 入れ替わるので、撮れた絵が「いまの島」でも「配りたい絵」とは限らない）。
 *
 * ## 字を、この道具から渡さない
 *
 * 絵の中の言葉（島の名前・毎日の帯・いま何日目でどこにいるか）は、**全部
 * 画面がすでに出しているもの**を撮っているだけで、ここには1文字も書いていない。
 * 帯は `content/voice.ts`、旅のしるべは旅程（`content/nordic.ts`）から出る。
 * 本番に出ていた「いま ジョージア・トビリシ」は、画面のほうが直ったあとも
 * 絵だけが焼いた日のまま止まっていたもの（`island-misses.md` #134）。
 * **焼き込みから出ていれば、撮り直すだけで正しくなる。**
 *
 * ## 枠の埋めかた
 *
 * 引き（島ぜんぶ）は**島の縦幅を画面の高さに合わせる**（`IsleStage` の
 * `wideSpan`）。いまの島は縦が横の 1.6倍あるので、630px の枠に島まるごとを
 * 入れると横は 400px にしかならず、**残り 800px が海だけ**になる。
 * だから島を枠より大きく置いて、上下を枠で切る（`app/css/hero.css` の
 * `html[data-og]`）。切る量が偏らないように、**島の陸そのものを測って
 * 枠の中央に合わせる。** 島の形は章で変わるので、ここに座標を書かない。
 *
 * ## 顔は1人ずつ本物で
 *
 * `route.mjs` の `offline()` を通す。落としていないと全員 `ayato.webp` に
 * なり、**島の12人が全員そっくり同じ顔**で焼かれる（本番の og.png が
 * 実際にそうなっていた）。1枚でも落ちていたら撮らずに止まる——絵は出るので、
 * 見ただけでは気づけない。
 *
 * **終了コード**: 0＝撮れて、対照も通った / 1＝撮れたが絵が島に見えない /
 * 2＝撮れなかった（島が出ない・顔が揃わない・対照が落ちた）。
 */
import { spawnSync } from "child_process";
import { chromium } from "playwright-core";
import { offline, offlineTally } from "./route.mjs";
import { fromRoot } from "./repo.mjs";
import { findStage } from "./stage.mjs";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const OUT = process.env.OUT || "/tmp/og-new.png";
const W = 1200, H = 630;
/**
 * 島の陸を、枠の何割の幅にするか。**高さではなく幅で決める。**
 *
 * 高さを決め打ちにすると、**丸い島の章になった日に島が枠から溢れる。**
 * 引きの倍率は「島の縦幅を画面の高さに合わせる」ので（`IsleStage` の
 * `wideSpan`）、島の横幅は置いた高さにほぼ比例する。だから一度測って、
 * 幅がここに来る高さを計算する。**縦に細い島は上下が切れ、丸い島は
 * まるごと入る**——どちらも、こちらが決めなくてよい。
 */
const LAND_W = Number(process.env.OG_LAND || 540);
/** 測るための、最初の高さ。ここから比で伸ばすので、値そのものに意味は無い */
const PROBE = 780;
/** 伸ばしすぎ・縮めすぎの止め。島が枠の外まで伸びると、海が1本も写らない */
const ISLE_MIN = 520, ISLE_MAX = 1400;

/** 枠ごと送られたぶんを、上の箱まで全部ゼロに戻す（ブラウザの中で走る） */
const unscroll = () => {
  for (let n = document.querySelector(".hero"); n; n = n.parentElement) {
    n.scrollTop = 0;
    n.scrollLeft = 0;
  }
  window.scrollTo(0, 0);
};

const bye = async (browser, code, msg) => {
  if (msg) console.error(msg);
  await browser.close();
  process.exit(code);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4500);

let S;
try {
  S = await findStage(p);
} catch (e) {
  await bye(b, 2, String(e.message || e));
}

/* 共有画像のための寸法に切り替える。**この印が立つのはここだけ。**
   本番のブラウザでは立たないので、画面の見た目は変わらない。 */
await p.evaluate(([isle, h]) => {
  const r = document.documentElement;
  r.setAttribute("data-og", "1");
  r.style.setProperty("--og-h", `${h}px`);
  r.style.setProperty("--og-isle", `${isle}px`);
  // 昼の色で撮る。時間帯で色が変わるので固定する
  r.setAttribute("data-time", "day");
}, [PROBE, H]);
await p.waitForTimeout(900);

/* **引きで撮る。** 共有画像は島ぜんぶが写っていないと何の島か分からない。
   PC の既定は「島に降り立った視点」（寄り）なので、明示的に引く。 */
const z = await p.$(S.zoom);
if (!z) await bye(b, 2, `引きに切り替える札（${S.zoom}）がありません`);
if ((await p.getAttribute(S.root, "data-cam")) !== "wide") {
  await z.click();
  await p.waitForTimeout(2500);
}
/* **押したあと、送られたぶんを戻す。**
   共有画像の枠（`.hero`）は `overflow: hidden` ＝ **それ自体が送れる箱**で、
   島はその枠より背が高い。押すものを画面へ入れようとしてブラウザが枠ごと
   送るので、そのままだと中身が丸ごと上へずれる（実測で看板の屋根が 75px 切れ、
   `window.scrollY` は 0 のままだったので**送られたことに気づけなかった**）。 */
await p.evaluate(unscroll);
await p.waitForTimeout(300);

// 隅の道具・案内・吹き出しは共有画像には要らない（島ごとに名前が違う。`stage.mjs`）
await p.addStyleTag({ content: `${S.chrome}{display:none!important}` });
await p.waitForTimeout(1200);

/* 島の陸を測る。**座標も倍率も書かない。**
   島の形（縦横・カメラの寄せ先）は章で変わるので、そのたびに測り直す。 */
const measure = async () =>
  p.evaluate((sels) => {
    for (const s of sels) {
      const n = document.querySelector(s);
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) return { sel: s, x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return null;
  }, S.land ?? []);

let land = await measure();
if (!land) {
  await bye(b, 2, `島の陸（${(S.land ?? []).join(" / ")}）が見つかりません。` +
    `島の絵の class が変わったなら tools/sprites/stage.mjs の STAGES に足す`);
}
/* 測った幅から、**陸が LAND_W になる高さ**を出す（横幅は置いた高さにほぼ比例）。 */
const isle = Math.round(Math.max(ISLE_MIN, Math.min(ISLE_MAX, (PROBE * LAND_W) / land.w)));
await p.evaluate((v) => document.documentElement.style.setProperty("--og-isle", `${v}px`), isle);
await p.evaluate(unscroll);
await p.waitForTimeout(1200);
land = await measure();
if (!land) await bye(b, 2, "島の陸が、大きさを決め直したあとに見つかりません");
/* 寄せるのは、はみ出した陸のぶんだけ。**海の外まで送らない**——島の絵は
   画面より各辺 140px だけ広く描いてある（`SCENE_PAD`）ので、それ以上ずらすと
   端に地の色が出る。 */
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
const dx = clamp(W / 2 - (land.x + land.w / 2), 110);
const dy = clamp(H / 2 - (land.y + land.h / 2), 260);
await p.evaluate(([x, y]) => {
  const r = document.documentElement;
  r.style.setProperty("--og-shift-x", `${x}px`);
  r.style.setProperty("--og-shift", `${y}px`);
}, [dx, dy]);
await p.evaluate(unscroll);
await p.waitForTimeout(700);
const scrolled = await p.evaluate(() => {
  let n = document.querySelector(".hero");
  const out = [];
  for (; n; n = n.parentElement) if (n.scrollTop || n.scrollLeft) out.push(`${n.tagName}.${n.className}`);
  if (window.scrollY || window.scrollX) out.push("window");
  return out;
});
if (scrolled.length) await bye(b, 2, `送られたままの箱があります: ${scrolled.join(" / ")}`);

const after = await p.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, land.sel);
console.log(
  `島 ${S.kind}（${S.root}）  cam ${await p.getAttribute(S.root, "data-cam")}  枠 ${W}x${H}  ` +
    `島を置いた高さ ${isle}px  島の陸 ${Math.round(after.w)}x${Math.round(after.h)}（${land.sel}）  ` +
    `寄せ ${dx.toFixed(0)},${dy.toFixed(0)}`,
);
/* 狙った幅に届かなかったら黙って出さない。**止めの値に当たった**ということなので、
   島の形が変わったか、枠の決めごとのほうが合っていない */
if (Math.abs(after.w - LAND_W) > LAND_W * 0.08) {
  await bye(b, 2, `島の陸が ${Math.round(after.w)}px（狙いは ${LAND_W}px）。` +
    `止め（${ISLE_MIN}〜${ISLE_MAX}px）に当たっています`);
}

/* **看板と帯が、枠の中にまるごと入っているか。**
   紙と浜の砂はほとんど同じ色なので、**画素では板の有無を見分けられない**
   （砂だけの絵が「板 3.2%」と出た）。要素の箱で見るのはここしかない。
   実際、島を上へずらした回に看板の屋根が 75px 切れていた。 */
const musts = { 看板: ".hero-logo-full", 帯: ".hero-say" };
const cut = await p.evaluate(([m, w, h]) => {
  const out = [];
  for (const [name, sel] of Object.entries(m)) {
    const n = document.querySelector(sel);
    if (!n) { out.push(`${name}（${sel}）が画面にいません`); continue; }
    const r = n.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) { out.push(`${name} の大きさが ${Math.round(r.width)}x${Math.round(r.height)}`); continue; }
    if (r.x < -0.5 || r.y < -0.5 || r.right > w + 0.5 || r.bottom > h + 0.5) {
      out.push(`${name} が枠からはみ出しています（${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}）`);
    }
  }
  return out;
}, [musts, W, H]);
if (cut.length) await bye(b, 2, cut.join(" / "));

/* **顔が1枚でも既定の絵に落ちていたら、出さない。**
   落ちても絵は出るので、撮った写真を見ても「そういう顔」にしか見えない。
   本番の og.png は、これで12人が全員おなじ顔のまま配られていた。 */
const tally = offlineTally();
const face = tally["キャラ"] ?? { asked: 0, real: 0 };
console.log(`顔 本物 ${face.real}/${face.asked} 枚`);
if (face.asked === 0 || face.real < face.asked) {
  await bye(b, 2,
    `住人の顔が ${face.asked - face.real}枚 足りません（既定の絵に落ちています）。` +
      `python3 tools/sprites/chars.py と avatars.py を先に回す`);
}

await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
console.log(`書いた ${OUT}  ${W}x${H}`);

await b.close();

/* 撮っただけでは「島が写っている」ことにならない。**判定は別の道具に任せて、
   終了コードだけを読む**（#132 の決めごと1: 名指しした側が回す）。 */
const judge = spawnSync("python3", [fromRoot("tools/sprites/ogcheck.py"), OUT], { stdio: "inherit" });
process.exit(judge.status === 0 ? 0 : judge.status === 1 ? 1 : 2);
