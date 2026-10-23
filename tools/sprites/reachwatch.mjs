/**
 * **押せるはずのものに、指が届くか**を島の面ぜんぶで数える。
 *
 *   PORT=4203 DIST=site/.next-3203 node tools/sprites/reachwatch.mjs
 *   PORT=4203 WIDTHS=390x844 node tools/sprites/reachwatch.mjs
 *   PORT=4203 BREAK=nocover node tools/sprites/reachwatch.mjs   # わざと盲点を作る
 *   FIXONLY=1 node tools/sprites/reachwatch.mjs   # 対照の台だけ（書き出しも配り先も要らない）
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある・押しどころが1つも無い）。
 * **印字された「0件」を目で読んで合格と言わない。** `| tail` を挟むと
 * 終了コードが消える（`docs/island-misses.md` #124 と同じ形）。
 *
 * ## なぜ要るか（2026-10-14）
 *
 * 押しどころを測る道具は在った。**どれも終了コードを持っていなかった。**
 *
 *   `pchit.mjs`      全面・4幅で測るが、**必ず 0 で帰る**。読む人が目で数える
 *   `hitbox.mjs`     終了コードを持つが、`PAGES=` で渡した面しか見ない
 *   `islecover.mjs`  覆いを数えるが、**島の立っている面だけ**（11面）
 *
 * つまり「図鑑の札が隣に食われた」「`/goods` の口が帯の下に入った」は、
 * **人が `pchit` の出力を読んだ回にしか見つからない。** 読まなかった回は
 * 緑に見える——`docs/island-misses.md` #171「道具は在って、繋いでいないだけ」
 * と同じ形。ここは**繋ぐために**、同じ `hitbox.mjs` を呼んで
 * 終了コードだけを足した。
 *
 * ## 2つを数える。どちらも「指が届かない」の形
 *
 *   **覆い**     … 押しどころの真ん中が、別の何かに取られている。
 *                  `measure()` が `skipped` に「◯◯ が上にいる」で返すもの
 *   **48px割れ** … 当たりの実寸が 48px に届かない（`docs/island-design.md` 3-2）。
 *                  隣に食われて削れたものもここに出る（`rivals`）
 *
 * **3つめ（押せないのに厚みがある）は `popcheck.mjs` が数えている。**
 * ここに写さない。写しを作ると、片方だけ直る（#83）。
 *
 * ## `reachkeys.mjs` と名前が近いが、見ているものは重なっていない
 *
 * **こちらは指**（押しどころの覆い・48px割れ）。**あちらはキーボードと
 * 読み上げ**（Tab で届くか・焦点が見えるか・名前が在るか・`alt`・見出しの段・
 * 同じ字のリンク）。同じ面を歩くが、数えている8つと2つに1つも重なりが無い。
 * どちらも `selftest.yml` の自分の job から毎 PR で走る（2026-10-15 / #883）。
 *
 * ## 測り方は自分で書かない。`hitbox.mjs` を呼ぶ
 *
 * **見た目の箱（`getBoundingClientRect`）では測らない。** `::after` で
 * 広げた当たりはそこに出ないし、隣に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして `elementFromPoint` がまだ自分を返すかで測る
 * （`hitbox.mjs` の `measure()`）。6本目の写しをここに作らない。
 *
 * ## 畳んだままの中を数えない
 *
 * 閉じた `<details>` と `content-visibility: auto` の中は、**開いて・
 * いちばん下まで送ってから**測る（`openFolds()`）。北欧の面は送らずに
 * 測ると 3,951px、送ると 5,067px で 1,100px 違った（`CLAUDE.md`）。
 * 視聴者さんは開いてから押すので、開いたあとが小さければ押せない。
 *
 * ## 対照（これが通らなければ、本物の数字を1つも出さない）
 *
 * `tools/sprites/reachwatchfix/fix.html` に10件植えてある。
 * **挙げてほしい4件**（覆い2・小さい2）と**挙げてはいけない6件**
 * （足りている2・透ける覆い1・見えていない3）を同じ表で見る。
 * 片側だけだと、しきい値をゆるめた道具も、なんでも赤く言う道具も通る
 * （`docs/island-misses.md` #125）。1つでも外したら 2 で落ちる。
 *
 * ## 島の中（`.isle` の中）は、ここでは数えない——**別の目が見ている**
 *
 * 島はあやとが歩き、カメラが寄る。**止めて1回測ると、その立ち位置1つぶん
 * しか見ない。** 実際、同じ `/` を2回測って、1回目は「となりの島へ」が
 * 49.5x25.8（`.today-tab` に下を食われた）、2回目は 0件だった。
 * **回ごとに違う数を出す見張りは、赤が出ても誰も信じない**（#200
 * 「毎回出る嘘は、本物の赤を埋める」）。
 *
 * 島の入口は専用の3本が見ている。**見ていないのではなく、別の目で見ている:**
 *
 *   `islecover.mjs` … 建物を1軒ずつ押して、**歩いているあいだも**覆いを測る
 *   `islereach.mjs` … 指が届く入口がいくつあるか
 *   `islenav.mjs`   … 引きの札6枚・隅の道具の重なり・南へ歩けるか
 *
 * 断りは `SKIP_SEL` に**理由ごと**置いて、**毎回印字する**（黙って落とさない。
 * `islepages.mjs` の `SKIP` と同じ決め）。
 *
 * ## 1枚で固まったら、その1枚の名前を出して落ちる（2026-10-16。#273）
 *
 * CI の 125回のうち **13回（10%）が、30分の枠で打ち切られていた。**
 * 残り 112回は 4.3〜5.2分に収まっていて、**その間が1回も無い**
 * ——遅いのではなく、**どこかで止まっている。**
 *
 * 止まった回のログは、対照（①）を通したあとの見出しまで出て、そこから
 * **30分ぶん1行も無い。** 本物の面の行は見つかったときしか出ないので、
 * **147面のどこで止まったのかが分からない。** 打ち切られた回を何回読んでも
 * 材料が増えないので、**次に止まった回で分かるようにした:**
 *
 *   - 1枚ごとに `PAGE_MS`（既定 120秒）の砂時計を置く。切れたら、その面と幅を
 *     名指しして `miss` に積み、**その page は捨てて開き直す**（残りは測り切る）
 *   - 幅ごとに「何枚済んだか」を印字する（止まった位置がログに残る）
 *   - 終わったあとの `close()` にも砂時計を置く（**出力はぜんぶ `b.close()` の
 *     あと**なので、ここで止まっても「1行も出ないまま30分」になる）
 *
 * **job の枠を伸ばすのは直しではない**（固まったまま30分待つのが40分になる
 * だけ）。1枚 120秒は、通っている回の1枚あたり 0.9秒の130倍。
 *
 * ## 止まっていたのは面ではなく、差し替えの絵だった（2026-10-23。#944）
 *
 * 名指しが効いて、止まる1枚が分かった。**`重い見張り` の直近40回のうち9回が赤で、
 * 読んだ5回はぜんぶ `390 /island/caucasus/streams`。** 覆いも48px割れも 0件で、
 * 落ちた理由は「120秒 返ってこない」だけだった。
 *
 * あの面にはサムネイルが491枚ある（コーカサスの配信ぶん）。畳みを開いていちばん
 * 下まで送ると、その491枚が一度に要求される。`route.mjs` の `offline()` は
 * YouTube のサムネイルを、手元に無ければ **`og.png`（1200x630・550KB）で返す。**
 * 1面で 270MB を Playwright の差し替え（`route.fulfill`）に通していた。
 *
 * この箱で同じ1面だけを開いて送ると（幅390・ほかに何も走らせない）:
 *
 * | 差し替えに返すもの | 止まった回 |
 * | --- | --- |
 * | `og.png`（550KB） | **6回中3回**（別の日に 5回中2回） |
 * | 320x180 の無地 PNG（173KB。中身は乱数） | 6回中2回 |
 * | 1200x630 の無地 JPEG（12KB） | 6回中0回 |
 * | 320x180 の無地 JPEG（1.6KB） | 8回中0回 |
 * | **差し替えずに、同じ `og.png` を配り先から491枚**（270MB） | **8回中0回** |
 *
 * この道具そのもので同じ1面を回しても同じだった（`PAGES=/island/caucasus/streams
 * WIDTHS=390x844`）。`BREAK=bigthumb`（`og.png` のまま）は**8回中2回**、1回目も
 * 取り直しも止まって 2 で落ちた。`THUMB` で返すと**8回中0回**、1面 8.5〜9.6秒。
 *
 * **効いているのは絵の大きさ（画素）ではなく、差し替えに通したバイト数。**
 * 同じ 270MB でも、配り先から届けば1回も止まらない。止まった回は、描画の手が
 * `futex` 待ちで CPU を使わずに固まり、CDP の `Runtime.evaluate` に5秒答えず、
 * 撮影も切れた（要求491のうち済んだのは268）。つまり**面が重いのではなく、
 * 道具がブラウザに渡す差し替えで詰まっていた。** 本物の視聴者さんの面は
 * 着いた時点で3枚しかサムネイルを要求しないし、YouTube の mqdefault は
 * 320x180 の JPEG で、`og.png` の数十分の一。
 *
 * だからここでは、**YouTube のサムネイルを本物と同じ 320x180 の小さな絵で返す**
 * （`THUMB`）。押しどころの大きさは絵の中身で変わらない（`.scard-thumb img` は
 * `object-fit: cover` で箱に合わせる）ので、数える答えは変わらない。
 * `route.mjs` の既定（`og.png`）は百本あまりの道具が使っているので、ここでは
 * 自分の入れ物の上で上書きするだけにしてある。
 *
 * ## それでも1枚が止まったら、新しい入れ物で1回だけ取り直す
 *
 * 差し替えを小さくしても、描画の手が固まる形は他の道（#963 の `reachkeys` は
 * 1x1 の絵しか返していないのに `/me/desk` で止まった）でも起きる。だから:
 *
 *   - 止まった page は**捨てて、次の面は新しいタブで開く**（立て直し）。
 *     #963 では止まったタブを使い回して、残り43面が `Page crashed` で消えた
 *   - 止まった面は、**新しい入れ物（context）で1回だけ**取り直す。
 *     2回目も止まったら、その面を名指しして 2 で落ちる（見ていない面）
 *   - **取り直した面は、緑の回でも必ず印字する**（まとめの「取り直した面」。
 *     Actions では `::warning::` にも出す）。黙って緑にしない
 *
 * 取り直しが効いているかは、対照の台（`reachwatchfix/stall.html`）で毎回見る。
 * 「一度だけ止まる面」「何度でも止まる面」「止まった次の面」の3つ。
 *
 * **本物の面でも、わざと覆って確かめられる。** `LID=1` を付けると、面ごとに
 * 砂浜の口（`.ifoot a`。どの面にもある）を1つ、ぴったり覆う板を置く。
 * **置いたら赤、外したら緑**が出なければ、この道具は本物の面に当たっていない
 * ——対照の面でしか効かない道具は、面を1枚も守っていない（#83）。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nofold    畳みを開かずに測る（畳みの中の2件が挙がらなくなる）
 *   noinline  横の道を引き出さずに測る（押せる「道4」が挙がってしまう）
 *   nocover   覆いを数えない
 *   nosmall   48px 割れを数えない
 *   allsmall  下限を 999 にする（足りているものまで赤くなる）
 *   anycover  `skipped` を全部「覆い」に数える（画面の外まで混ざる）
 *   noretry   止まった面を取り直さない（「一度だけ止まる面」が止まったままになる）
 *   noreopen  止まったタブを捨てずに使い回す（「止まった次の面」が開けなくなる）
 *   bigthumb  サムネイルを `og.png` のまま返す（#944 の止まりかたに戻す。
 *             本物の面で何回止まるかを測り直すとき用。対照では見ない）
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, reportControl } from "./fixserve.mjs";
import { openFolds, measure, fmtHit, SEL_ALL } from "./hitbox.mjs";
import { PAGES as ISLE_PAGES, DIST } from "./islepages.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { crc32, deflateSync } from "node:zlib";

const PORT = process.env.PORT || process.env.SPORT || "4203";
const ORIGIN = process.env.ORIGIN || `http://127.0.0.1:${PORT}`;
const MIN = Number(process.env.MIN || 48);
const OUT = process.env.OUT || "/tmp/reachwatch.json";
const BREAK = process.env.BREAK || "";
/** 1枚にかける上限（ミリ秒）。切れたら、その面を名指しして捨てる */
const PAGE_MS = Number(process.env.PAGE_MS || 120000);
/** 入れ物とブラウザを閉じるのにかける上限。**出力はぜんぶこのあと** */
const CLOSE_MS = Number(process.env.CLOSE_MS || 60000);
/** 対照の台だけ回して帰る（書き出しも配り先も要らない。mutation_drill 用） */
const FIXONLY = !!process.env.FIXONLY;

/**
 * 約束に砂時計を付ける。**切れたら投げる。**
 *
 * `page.evaluate()` には時間切れが無い（Playwright の仕様）。中で待っている
 * 約束が解けないと**永久に帰ってこない**ので、呼ぶ側で切る。
 */
function withDeadline(pr, ms, what) {
  let t;
  const bell = new Promise((_, no) => {
    const howLong = ms >= 1000 ? `${Math.round(ms / 1000)}秒` : `${ms}ミリ秒`;
    t = setTimeout(() => no(new Error(`${what} が ${howLong} 返ってこない`)), ms);
  });
  return Promise.race([Promise.resolve(pr).finally(() => clearTimeout(t)), bell]);
}
const skip = {
  fold: BREAK === "nofold",
  cover: BREAK === "nocover",
  small: BREAK === "nosmall",
};
/** 幅は**スマホとPCの両方**。片方だけだと、もう片方で壊れたことが出ない */
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800")
  .split(",").filter(Boolean).map((s) => s.split("x").map(Number));

/* 面の一覧は**ここに書かない**。書き出したものを歩いて数える
   （`islepages.mjs`）。手で並べると、面が増えた日に一覧は増えず、
   増えたぶんが「測らないまま 0件」に化ける（`docs/island-misses.md` #79） */
const PAGES = (process.env.PAGES || ISLE_PAGES.join(",")).split(",").filter(Boolean);

/**
 * **数えないもの と、その理由。**
 *
 * 名指しで外すと、そこが壊れた日も黙る。だから外すものはここに
 * **理由つきで**並べて、道具が**毎回印字する**（`islepages.mjs` の `SKIP`
 * と同じ決め）。理由は12文字以上。
 */
export const SKIP_SEL = [
  {
    sel: ".isle",
    why:
      "島の中（入口・札・隅の道具）。あやとが歩きカメラが寄るので、止めて1回測ると"
      + "立ち位置1つぶんしか見ない——同じ `/` を2回測って 1件 と 0件 が出た。"
      + "回ごとに揺れる赤は、本物の赤を埋める（docs/island-misses.md #200）。"
      + "島は islecover.mjs（歩きながら覆いを測る）/ islereach.mjs（届く入口の数）/ "
      + "islenav.mjs（引きの札6枚）が見ている。**見ていないのではなく、別の目で見ている**",
  },
];
const SKIP_Q = SKIP_SEL.map((s) => s.sel).join(",");

/** `measure()` の `skipped` のうち、**覆い**だけを拾う。
    「画面の外（送っても入らない）」は覆いではないので混ぜない */
const isCover = (s) => (BREAK === "anycover" ? true : /が上にいる$/.test(s.why || ""));

/**
 * 1面ぶん測る。戻り: { covers, smalls, n, folds, dropped }
 *
 * `SKIP_SEL` に当たるものは、**数える前に印を付けて**落とす。
 * 落とした数は返して、まとめで印字する（0 を「測って 0」と読ませないため）。
 */
/** 本物の面に、わざと覆いを1枚かぶせる（`LID=1`）。置いた先の字を返す */
const LID_JS = `(() => {
  const a = document.querySelector(".ifoot a[href]");
  if (!a) return "";
  const r = a.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return "";
  /* **板は、相手と同じ重なりの箱の中に置く。** body の直下へ置いて
     z-index を最大にしても、相手の祖先が transform / filter を持っていると
     あちらが別の重なりの箱になり、**板のほうが下に沈む**（実際に沈んで
     「置いたのに 0件」が出た）。親に入れれば、同じ箱の中で後ろに積まれる。 */
  const par = a.parentElement;
  if (getComputedStyle(par).position === "static") par.style.position = "relative";
  const pr = par.getBoundingClientRect();
  const d = document.createElement("div");
  d.id = "rwlid";
  d.setAttribute("style",
    "position:absolute;left:" + (r.left - pr.left - 2) + "px;top:" + (r.top - pr.top - 2) + "px;" +
    "width:" + (r.width + 4) + "px;height:" + (r.height + 4) + "px;" +
    "background:#c33;z-index:99999");
  par.appendChild(d);
  return (a.textContent || "").trim().slice(0, 12);
})()`;

async function look(p, min, { useSkip = true } = {}) {
  const folds = skip.fold ? { opened: 0, stillClosed: 0, folds: 0 } : await openFolds(p);
  /* **横も真ん中まで引き出してから測る**（`inline: "center"`）。
     既定の `nearest` だと、`scroll-snap` の効いた横の道で止まった先が悪く、
     押せる石を「押せない」と数える（`/about` の年表で実際に出た。
     `hitbox.mjs` の `inline` のところに書いてある）。
     **それでも中心が外に落ちるなら、そこは本当に出しきれない**ので挙がる。 */
  const got = await measure(p, {
    sel: SEL_ALL, min, fold: skip.fold ? "skip" : "open",
    inline: BREAK === "noinline" ? "nearest" : "center",
  });
  /* 当たった押しどころが `SKIP_SEL` の中にいるかは、**ブラウザの中で**見る。
     返ってきた行には DOM が無いので、鍵（`k`）で引き直す道が要る——
     `measure()` が付けている `k` は body からの道すじなので、同じ順で
     たどれば同じ要素に着く。 */
  const inSkip = useSkip && SKIP_Q
    ? await p.evaluate((q) => {
        const hit = new Set();
        for (const el of document.querySelectorAll(q))
          for (const t of el.querySelectorAll("*")) hit.add(t);
        for (const el of document.querySelectorAll(q)) hit.add(el);
        const key = (el) => {
          const a = [];
          for (let e = el; e && e !== document.body; e = e.parentElement)
            a.push(e.tagName + ":" + [...(e.parentElement?.children || [])].indexOf(e));
          return a.join("/");
        };
        return [...hit].map(key);
      }, SKIP_Q)
    : [];
  const skipKeys = new Set(inSkip);
  const out = (r) => skipKeys.has(r.k);
  const covers0 = skip.cover ? [] : got.skipped.filter(isCover);
  const smalls0 = skip.small ? [] : got.rows.filter((r) => r.small);
  return {
    n: got.rows.length,
    folds,
    covers: covers0.filter((r) => !out(r)),
    smalls: smalls0.filter((r) => !out(r)),
    dropped: covers0.filter(out).length + smalls0.filter(out).length,
    excluded: got.excluded,
  };
}

/* 思わぬ投げで落ちたら **2**（数えられなかった）。Node の既定は 1 で、
   それだと「見つかった」と読めてしまう */
const fatal = (e) => {
  console.error(`\n道具が思わぬところで落ちました（数えられていません）: ${String(e?.stack || e).slice(0, 400)}`);
  process.exit(2);
};
process.on("unhandledRejection", fatal);
process.on("uncaughtException", fatal);

/**
 * YouTube のサムネイルの代わりに返す、**本物と同じ 320x180** の無地の PNG（数百バイト）。
 *
 * `route.mjs` の既定は `og.png`（1200x630・550KB）で、491枚ある面では
 * 1面で 270MB を差し替えに通すことになり、描画の手が固まった（上の表）。
 * 押しどころの大きさは絵の中身で変わらないので、ここは軽いもので足りる。
 */
function solidPng(w, h, [r, g, bl]) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([r, g, bl], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 1色 8bit
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
const THUMB = solidPng(320, 180, [196, 170, 140]);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** 幅ひとつぶんの入れ物を開く */
async function openCtx(W, H) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  /* **サムネイルは小さい絵で返す**（上の「止まっていたのは面ではなく、差し替えの絵
     だった」）。`offline()` より**後に**登録する——Playwright は後に登録した
     route から当てるので、ここが `og.png` を返す側より先に取る。 */
  if (BREAK !== "bigthumb")
    await ctx.route(/i\.ytimg\.com\/vi\//, (r) => r.fulfill({ status: 200, contentType: "image/png", body: THUMB }));
  /* ログインした人にしか中身の出ない面（`/me` `/me/desk`）を測るための差し込み口。
     `SEED=$PWD/tools/sprites/asme.mjs` を渡すと、入っている人として開く
     （`hitbox.mjs` と同じ渡し方）。**CI では渡していない。** 渡さない回に
     測っているのは「入っていない人の姿」で、そこの 0 は「中身を見て 0」では
     ない——中身のある姿は `mesweep.mjs` が見る（`pages.mjs` の断りと同じ）。 */
  if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  return ctx;
}

/** 捨てる。閉じるのにも砂時計を付ける（固まった page は閉じるのも遅い） */
async function discard(thing, what) {
  try {
    await withDeadline(thing.close(), what === "page" ? 10000 : CLOSE_MS, `${what} を閉じる`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 1枚開いて測る。**見つけたものは返すだけで、外の数には足さない**
 * （止まって捨てた1回目が、あとから帰ってきて二重に数えないため）。
 *
 * 戻り: `{ g, lid }` 測れた / `{ miss }` サーバは答えたが面ではなかった
 * （404・一覧。取り直しても変わらないので取り直さない）。
 * **返事が無かった**（時間切れ・`Page crashed`）ときは投げる——取り直しに回す。
 */
async function one(p, path, origin) {
  const r = await openChecked(p, origin, path, {});
  if (!r.ok) {
    /* `openChecked` は `.html` 付きが時間切れでも、素の綴りの 404 を聞いて
       「答えた」と返すことがある。字に Playwright の失敗が混ざっていれば、
       それは**止まった側**として扱う */
    if (r.definitive && !/Timeout|crash|closed|Target|net::/i.test(r.why)) return { miss: `${path}（${r.why}）` };
    throw new Error(`開けない（${r.why.slice(0, 80)}）`);
  }
  await p.waitForTimeout(500);
  const lid = process.env.LID ? !!(await p.evaluate(LID_JS)) : false;
  const g = await look(p, MIN);
  return { g, lid };
}

/**
 * 面の並びを、`jobs` 枚ずつ同時に測る。**本物の面と対照の台が、同じこれを通る**
 * （台でだけ効く守りは、面を1枚も守っていない——#83）。
 *
 * 1枚が `ms` で返ってこなければ:
 *   1. その page は捨てて、**次の面は新しいタブで開く**（`BREAK=noreopen` で外れる）
 *   2. その面だけ、**新しい入れ物で1回だけ**取り直す（`BREAK=noretry` で外れる）
 *   3. 取り直しも止まったら `stuck` に名指しで積む（→ 2 で落ちる）
 *
 * 戻り: { results: Map(path → {g,lid}), miss, stuck, retried, took: Map(path → 秒) }
 */
async function sweep({ W, H, pages, origin, jobs, ms }) {
  const out = { results: new Map(), miss: [], stuck: [], retried: [], took: new Map() };
  const ctx = await openCtx(W, H);
  const queue = [...pages];
  const short = (e) => String(e?.message || e).split("\n")[0].slice(0, 120);
  await Promise.all(
    Array.from({ length: Math.max(1, jobs) }, async () => {
      let p = await ctx.newPage();
      for (let path = queue.shift(); path; path = queue.shift()) {
        const t0 = Date.now();
        let res;
        try {
          res = await withDeadline(one(p, path, origin), ms, `${W} ${path}`);
        } catch (e) {
          const why = short(e);
          console.error(`!! ${W} ${path} で止まりました: ${why}`);
          /* **止まったタブで次の面を開かない。** 描画の手が固まったままなので、
             次の `goto` も返ってこないか、`Page crashed` が続く（#963 で43面ぶん） */
          if (BREAK !== "noreopen") {
            await discard(p, "page");
            p = await ctx.newPage();
          }
          if (BREAK === "noretry") {
            out.stuck.push(`${W} ${path}（${why}）`);
            out.took.set(path, (Date.now() - t0) / 1000);
            continue;
          }
          /* **取り直しは新しい入れ物で、1回だけ。** 同じ入れ物だと同じ描画の手に
             当たることがある。何回も取り直すと、本当に重い面が「そのうち通る」で
             緑に化けるので、1回で打ち切る */
          const c2 = await openCtx(W, H);
          try {
            const p2 = await c2.newPage();
            res = await withDeadline(one(p2, path, origin), ms, `${W} ${path}（取り直し）`);
            out.retried.push({ W, path, why });
            console.error(`↻ ${W} ${path} は、新しい入れ物で取り直して測れました（1回目: ${why}）`);
          } catch (e2) {
            out.stuck.push(`${W} ${path}（1回目: ${why} / 取り直し: ${short(e2)}）`);
            console.error(`!! ${W} ${path} は、取り直しても返ってきません: ${short(e2)}`);
          } finally {
            await discard(c2, "取り直しの入れ物");
          }
        }
        out.took.set(path, (Date.now() - t0) / 1000);
        if (!res) continue;
        if (res.miss) out.miss.push(res.miss);
        else out.results.set(path, res);
      }
      await discard(p, "page");
    }),
  );
  if (!(await discard(ctx, `幅 ${W} の入れ物`))) {
    console.error(`!! 幅 ${W} の入れ物が閉じません（先へ進みます）`);
    out.stuck.push(`幅 ${W} の入れ物が閉じない`);
  }
  return out;
}

/* ---- ① 対照。本物を1面も測る前に通す --------------------------------- */

const fx = await serveFixtures("reachwatchfix");
const cctx = await openCtx(390, 844);
const cp = await cctx.newPage();
await cp.goto(fx.base + "/fix.html", { waitUntil: "domcontentloaded" });
await cp.waitForTimeout(200);
const fixMin = BREAK === "allsmall" ? 999 : MIN;
const got = await look(cp, fixMin);
await cctx.close();
fx.close();

/* **返ってこない面の対照。** 本物と同じ `sweep()` に、止まる台を流す。
   何回目に何を返すかは、ここの小さな配り口が持つ（台の HTML は2枚だけ）。
     /once.html   … 1回目だけ `stall.html`、2回目からは `calm.html`
     /always.html … 何回でも `stall.html`
     /after.html  … `calm.html`。**止まった面のすぐ次に置く**（立て直しを見る）
   1本の手（jobs=1）で always → once → after の順に回すので、
   「止まったタブを使い回したか」が after に必ず出る。 */
const stallSrc = readFileSync(new URL("./reachwatchfix/stall.html", import.meta.url));
const calmSrc = readFileSync(new URL("./reachwatchfix/calm.html", import.meta.url));
const asked = new Map();
const stallSrv = createServer((req, res) => {
  const path = req.url.split("?")[0];
  const n = (asked.get(path) || 0) + 1;
  asked.set(path, n);
  const body = path === "/always.html" || (path === "/once.html" && n === 1) ? stallSrc
    : ["/once.html", "/after.html"].includes(path) ? calmSrc : null;
  if (!body) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("no");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((r) => stallSrv.listen(0, "127.0.0.1", r));
/** 台は小さいので、1枚 5秒で止まったとみなす（本物は `PAGE_MS`） */
const CTL_MS = Number(process.env.CTL_MS || 5000);
const st = await sweep({
  W: 390, H: 844, pages: ["/always.html", "/once.html", "/after.html"],
  origin: `http://127.0.0.1:${stallSrv.address().port}`, jobs: 1, ms: CTL_MS,
});
stallSrv.close();
const stuckOf = (p) => st.stuck.some((s) => s.includes(p));
const retriedOf = (p) => st.retried.some((r) => r.path === p);
const measured = (p) => (st.results.get(p)?.g.n || 0) >= 1;

const cov = new Set(got.covers.map((s) => s.t));
const sml = new Set(got.smalls.map((r) => r.t));
const checks = [
  { name: "まるごと覆われた 60px「ふた下」", want: true, got: cov.has("ふた下") },
  { name: "畳みの中で覆われた「畳ふた」", want: true, got: cov.has("畳ふた") },
  { name: "覆いの無い 30px「ちび」", want: true, got: sml.has("ちび") },
  { name: "閉じた畳みの中の 30px「畳ちび」", want: true, got: sml.has("畳ちび") },
  { name: "足りている 60px「足大」", want: false, got: cov.has("足大") || sml.has("足大") },
  { name: "畳みの中の 60px「畳大」", want: false, got: cov.has("畳大") || sml.has("畳大") },
  { name: "指の通る覆いの下「透け下」", want: false, got: cov.has("透け下") },
  { name: "display:none の 30px「隠ちび」", want: false, got: cov.has("隠ちび") || sml.has("隠ちび") },
  { name: "1px に畳んだ読み上げ用「読上」", want: false, got: cov.has("読上") || sml.has("読上") },
  { name: "札で押す入力「札つき」", want: false, got: cov.has("札つき") || sml.has("札つき") },
  { name: "横へ送る道の中「道4」", want: false, got: cov.has("道4") || sml.has("道4") },
  { name: "横の道でふたに取られた「道ふた」", want: true, got: cov.has("道ふた") },
  { name: "道より広い札「道広」", want: false, got: cov.has("道広") || sml.has("道広") },
  { name: "画面の外に置いた「外出」", want: false, got: cov.has("外出") || sml.has("外出") },
  /* ここから3件は「返ってこない面」。**挙げる＝止まったと名指しする** */
  { name: "何度でも止まる面「always」", want: true, got: stuckOf("/always.html"),
    note: retriedOf("/always.html") ? "（取り直しで通ってしまった）" : "" },
  { name: "一度だけ止まる面「once」", want: false, got: stuckOf("/once.html") || !measured("/once.html"),
    note: retriedOf("/once.html") ? "取り直して測れた" : "" },
  /* 次の面は**1回目で**測れること。取り直しで通ったなら、止まったタブを使い回している */
  { name: "止まった次の面「after」", want: false,
    got: stuckOf("/after.html") || !measured("/after.html") || retriedOf("/after.html"),
    note: retriedOf("/after.html") ? "（1回目に止まった＝止まったタブを使い回した）" : "" },
];
console.log(`===== 対照（仕込んだ${checks.length}件） =====`);
const ctl = reportControl(checks);
/* **足りているものが数に入っていること**まで見る。0 は「全部足りている」では
   なく「その札が1枚も無かった」でも出る（`docs/island-misses.md` #79） */
const seen = got.n;
console.log(`  仕込みの面で数えた押しどころ ${seen}個`);
/* 「once」が通ったのが**取り直しのおかげ**であることまで見る。1回目で止まって
   いなければ、止まる台そのものが効いていない（何も守っていない緑） */
const stalledOnce = (asked.get("/once.html") || 0) >= 2 || stuckOf("/once.html");
if (!stalledOnce) console.error("  止まる台「once」が1回目に止まっていません（台が効いていない）");
if (ctl.miss || seen < 6 || !stalledOnce) {
  console.error(
    `\n対照が ${ctl.miss}/${ctl.total} 件外れました` +
      (seen < 6 ? `（数えた押しどころ ${seen}個。仕込みに届いていない）` : "") +
      (!stalledOnce ? "（止まる台が止まっていない）" : "") +
      "。本物の面の数字は出しません。",
  );
  await b.close();
  process.exit(2);
}
console.log(`  ${ctl.total}件ぜんぶ、仕込みはそのとおりに出た\n`);

/* **対照だけで帰る口**（`FIXONLY=1`）。書き出しも配り先も要らないので、
   `python/mutation_drill.py` がここに当てる——測っている実物
   （`hitbox.mjs` の `measure()`）を壊して、上の対照が外れるかを見る。
   本物の面を測らないので、**これが通っても面の合格ではない。** */
if (FIXONLY) {
  await b.close();
  console.log("FIXONLY=1。対照の台だけ見て帰ります（本物の面は測っていません）");
  process.exit(0);
}

/* ---- ② 本物の面 ------------------------------------------------------- */

if (!PAGES.length) {
  console.error(`面が1枚も見つかりません（書き出しの置き場: ${DIST}）。`);
  console.error("`tools/build.sh <ポート>` を回してから、`DIST=` で置き場を渡してください。");
  await b.close();
  process.exit(2);
}

console.log(`書き出しの置き場 ${DIST}`);
console.log(`測る面 ${PAGES.length}面 × 幅 ${WIDTHS.map(([w]) => w).join(" / ")}  下限 ${MIN}px`);
/* **断りは毎回印字する。** 黙って落とすと、そこが壊れた日も 0件 で通る */
console.log("数えないものと、その理由:");
for (const s of SKIP_SEL) console.log(`  ${s.sel} — ${s.why}`);
if (BREAK) console.log(`**わざと盲点を作っています（BREAK=${BREAK}）**`);
if (process.env.LID) console.log("**わざと覆いをかぶせています（LID=1）。1 で落ちなければ、この道具は本物の面に当たっていない**");
console.log("");

const miss = [];
const rows = [];
/** **固まった1枚を名指しするための入れ物。** 1つでもあれば 2 で落ちる */
const stuck = [];
/** 1回目に止まって、取り直して測れた面。**緑の回でも必ず印字する** */
const retried = [];
let taps = 0, opened = 0, stillClosed = 0, dropped = 0, lids = 0, measuredPairs = 0;

/* **何枚かを同時に開く。** 136面 × 2幅を1枚ずつ測ると、この箱で2時間かかる
   （北欧の1日ぶりの面は畳みが多く、1枚で30秒を超える）。測っているのは
   `elementFromPoint` ——**版組みの話で、時刻の話ではない**ので、同時に開いても
   答えは変わらない（動くものが混ざる島は `SKIP_SEL` で外してある）。
   コア数より多く開くと取り合って遅くなるだけなので、既定は 3。 */
const JOBS = Number(process.env.JOBS || 3);

for (const [W, H] of WIDTHS) {
  const t0 = Date.now();
  const r = await sweep({ W, H, pages: PAGES, origin: ORIGIN, jobs: JOBS, ms: PAGE_MS });
  miss.push(...r.miss);
  stuck.push(...r.stuck);
  retried.push(...r.retried);
  measuredPairs += r.results.size;
  for (const [path, { g, lid }] of r.results) {
    if (lid) lids++;
    taps += g.n;
    dropped += g.dropped;
    opened += g.folds.opened;
    stillClosed += g.folds.stillClosed;
    for (const s of g.covers)
      rows.push({ W, path, kind: "覆い", t: s.t, c: s.c, box: s.box, fold: s.fold, why: s.why });
    for (const s of g.smalls)
      rows.push({
        W, path, kind: `${MIN}px割れ`, t: s.t, c: s.c, href: s.href,
        box: s.box, hit: fmtHit(s), fold: s.fold,
        rivals: s.rivals.map((v) => `${v.dir}:${v.who}「${v.t}」`),
      });
    if (g.covers.length || g.smalls.length)
      console.log(`${W} ${path}  覆い ${g.covers.length}  ${MIN}px割れ ${g.smalls.length}`);
  }
  /* **進みと、いちばん遅かった面をログに残す。** 止まった回に「どこまで行ったか」
     「ふだん何秒の面か」の手がかりが無かった（#944 は名指しが出るまで1週間読めなかった） */
  const slow = [...r.took].sort((a, c) => c[1] - a[1]).slice(0, 3)
    .map(([p, s]) => `${p} ${s.toFixed(1)}秒`).join(" / ");
  console.log(`幅 ${W}: ${PAGES.length}面 を ${((Date.now() - t0) / 1000).toFixed(0)}秒で見た（遅かった面: ${slow}）`);
}
/* **ここで止まると、下の出力が1行も出ないまま枠を使い切る。**
   打ち切られた13回が全部そう見えていたので、ここにも砂時計を置く */
try {
  await withDeadline(b.close(), CLOSE_MS, "ブラウザを閉じる");
} catch (e) {
  console.error(`!! ${String(e.message || e)}（数えたものは下に出します）`);
  stuck.push("ブラウザが閉じない");
}

/* 並べ替えておく。同時に測ると出る順が回ごとに変わるので、**読み比べられない**
   （前の回と diff を取りたくなるのは必ず起きる） */
rows.sort((a, c) => a.W - c.W || a.path.localeCompare(c.path) || String(a.t).localeCompare(String(c.t)));

writeFileSync(OUT, JSON.stringify(rows, null, 1));

/* **開けなかった面が1枚でもあれば、0 という数字を出して終わらない。**
   `reportMissing` が終了コードを 2 にする */
reportMissing(miss);

console.log("\n===== まとめ =====");
console.log(
  /* **止まった面は「測った」に数えない。** 前は開けなかった面しか引いておらず、
     1面が止まった回も「148/148面」と出ていた */
  `測った面 ${measuredPairs}/${PAGES.length * WIDTHS.length}（${PAGES.length}面 × ${WIDTHS.length}幅）` +
    `  押しどころ ${taps}個  畳み ${opened}個を開いた` +
    `  断ったぶん ${dropped}件（上の理由）` +
    (stillClosed ? `（**開かなかった ${stillClosed}個**）` : ""),
);
/* **取り直した面は、緑の回でも出す。** 同じ面が毎晩ここに出るなら、それは
   たまたまではない——その面か道具に、まだ直していない詰まりがある */
console.log(`取り直した面 ${retried.length}件（1回目に止まり、新しい入れ物で1回だけ測り直せたもの）`);
for (const r of retried) {
  console.log(`  ↻ ${r.W} ${r.path}  1回目: ${r.why}`);
  if (process.env.GITHUB_ACTIONS)
    console.log(`::warning::reachwatch: ${r.W} ${r.path} は1回目に止まり、取り直して測った（${r.why}）`);
}
const covers = rows.filter((r) => r.kind === "覆い");
const smalls = rows.filter((r) => r.kind !== "覆い");
console.log(`覆い ${covers.length}件 / ${MIN}px割れ ${smalls.length}件  （控え: ${OUT}）`);
if (process.env.LID) console.log(`わざと置いた覆い ${lids}枚（面ごとに1枚）`);
for (const r of covers)
  console.log(`  覆 ${r.W} ${r.path}  ${r.c}「${r.t || "(字なし)"}」 見た目 ${r.box[0]}x${r.box[1]}  ${r.why}${r.fold ? "  畳みの中" : ""}`);
for (const r of smalls)
  console.log(
    `  小 ${r.W} ${r.path}  ${r.c}「${r.t || "(字なし)"}」${r.href ? ` → ${r.href}` : ""}` +
      `  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit}${r.fold ? "  畳みの中" : ""}` +
      (r.rivals.length ? `  隣に食われた: ${r.rivals.join(" ")}` : ""),
  );

/* **止まった面は「見ていない面」。** 0件を出して終わらない */
if (stuck.length) {
  console.error(`\n止まったところが ${stuck.length} 件あります（取り直しても返ってこなかった）。出した数は当てになりません:`);
  for (const m of stuck) console.error("  - " + m);
  console.error("1枚にかける上限は PAGE_MS（既定 120秒）。**枠を伸ばすのは直しではありません**");
  process.exitCode = 2;
}

if (process.exitCode === 2) process.exit(2);
if (taps < 100) {
  console.error(`\n押しどころが ${taps}個しか見つかりません。数えられていないので 2 で落ちます。`);
  process.exit(2);
}
process.exit(rows.length ? 1 : 0);
