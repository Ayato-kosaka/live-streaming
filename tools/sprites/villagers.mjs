/**
 * 焼いた住人48点を、島の上に実際に置いてみる道具。
 *
 *   PORT=3011 node villagers.mjs [出力先ディレクトリ]
 *
 * いまの IslandStage は視聴者さんの写真を出していて、この48点はどこからも
 * 参照されていない。「置くとしたらこう見える」を、絵の合成ではなく
 * 動いている島のDOMを差し替えて出す。島の並べ替え(足元のyで前後を決める)や
 * 時間帯の色かぶせを、そのまま通したまま見られるのが理由。
 *
 * ------------------------------------------------------------------
 * 置いてみて分かったこと(出すか出さないかは島の担当が決める)
 * ------------------------------------------------------------------
 *
 * **背の高さは 34。** 木が 80〜114、小屋が 44〜74、配信やぐらが 128。
 * 30 だと木の根元の茂み(高さ 20 前後)に埋もれ、38 だと小屋の扉より
 * 背が高くなって、島が箱庭ではなくミニチュアの町に見える。
 * 34 のとき、頭のてっぺんが樹冠の下端あたりに来る。あつ森の縮尺もこれ。
 *
 * **影は焼いたものだけでよい。いまの楕円(ellipse)は消せる。**
 * スプライトには他の物と同じ広がり・濃さの接地影が焼き込んである。
 * 34 の大きさだと楕円(rx13 ry5)は焼いた影とほぼ重なるので、
 * 並べて撮っても差はごく小さい。ただし楕円は縁が固く、島の他の物の影が
 * みなぼけていることを考えると、住人だけ縁の立った影を持つ理由が無い。
 * 消すほうが1つ減る。
 *
 * **歩きの2コマは、いまの上下の揺れと同じ位相から出す。**
 * villagers.ts の villagerPose は歩きのとき
 *   dy = -|sin(t * 0.011 + phase)| * 3.2
 * で体を上下させている。この sin の周期は 2π/0.011 ≒ 571ms、
 * 絶対値を取っているので**踏み込みは 286ms ごと**に来る。
 * コマの入れ替えを別のタイマーで回すと、足が地面に着く瞬間と
 * 絵が変わる瞬間がずれて、歩幅と体の上下が食い違う。
 *   frame = Math.sin(t * 0.011 + v.phase) >= 0 ? "walk-a" : "walk-b"
 * と同じ式から出せば、1コマ 286ms で、必ず揺れの底で切り替わる。
 * タイマーも状態も増えない。
 * (150ms より速いと歩きではなく震えに見え、350ms より遅いと
 *  コマ落ちに見える。286ms はその真ん中に入る)
 *
 * **座りは4人に1人まで。** 全員が歩くと島が忙しい。
 * 立ち・歩き・座りが混ざっているときだけ「暮らしている」ように見える。
 *
 * **female-a と female-e は、モデルが手に物を持っている。**
 * 姿勢の付け方が失敗しているのではなく(素のT字と idle を並べて確かめた)、
 * body-mesh にその形が入っている。34 の大きさだと、その青灰色の塊が
 * 手足の一部に見えて、1人だけ手足が横へ開いた人形のように写る。
 * 12人から選ぶなら、この2人は後ろのほうへ置くか、外す。
 *
 * ------------------------------------------------------------------
 *
 * 出るもの:
 *   size-30 / 34 / 38.png  背の高さを変えて撮ったもの
 *   shadow-baked / shadow-ellipse.png  焼いた影だけ / いまの楕円も足したもの
 *   walk-0 / walk-1.png    歩きの2コマ
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3000";
const OUT = process.argv[2] ?? "/tmp/villagers";
const ROOT = "/home/user/live-streaming";
const META = JSON.parse(fs.readFileSync(`${ROOT}/site/content/sprites.json`, "utf8"));

fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
// このサンドボックスからは住人の写真に届かない。本番と同じ「写真がある」状態にする
await ctx.route(/googleusercontent\.com/, (r) => r.fulfill({ path: `${ROOT}/site/public/characters/ayato.webp` }));
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
// 引きにする。人が何人も入る画にしないと、馴染むかどうかが見えない
const z = await p.$(".bar-zoom");
if (z) { await z.click(); await p.waitForTimeout(2500); }

/**
 * 住人の写真を、焼いたスプライトに差し替える。
 * @param {object} o size / frame / ellipse
 */
async function swap(o) {
  await p.evaluate(([meta, opt]) => {
    const imgs = [...document.querySelectorAll('svg image[href^="https://lh3"]')];
    // 誰がどの姿になるかは並び順で決め打ち。撮り直しても入れ替わらないようにする
    const IDS = ["male-a", "female-b", "male-c", "female-d", "male-e", "female-f",
      "female-a", "male-b", "female-c", "male-d", "female-e", "male-f"];
    imgs.forEach((im, i) => {
      const g = im.parentNode;
      // 姿。1人おきに歩き、4人に1人は座らせて、島の絵に「間」を作る
      const kind = i % 4 === 3 ? "-sit" : i % 2 === 0 ? (opt.frame === 1 ? "-walk-b" : "-walk-a") : "";
      const name = `villager-${IDS[i % IDS.length]}${kind}`;
      const m = meta[name];
      if (!m) return;
      const k = opt.size / m.oh;
      im.setAttribute("href", `/sprites/${name}.webp`);
      im.setAttribute("x", -(m.ox + m.ow / 2) * k);
      im.setAttribute("y", -(m.oy + m.oh) * k);
      im.setAttribute("width", m.w * k);
      im.setAttribute("height", m.h * k);
      im.setAttribute("preserveAspectRatio", "none");
      // 焼いた影が入っているので、手描きの楕円は二重になる
      const el = g.querySelector("ellipse");
      if (el) el.style.display = opt.ellipse ? "" : "none";
    });
    return imgs.length;
  }, [META, o]);
  await p.waitForTimeout(500);
}

const shots = [];
for (const size of [30, 34, 38]) {
  await swap({ size, frame: 0, ellipse: false });
  const f = path.join(OUT, `size-${size}.png`);
  await p.screenshot({ path: f });
  shots.push(f);
}
await swap({ size: 34, frame: 0, ellipse: true });
await p.screenshot({ path: path.join(OUT, "shadow-ellipse.png") });
await swap({ size: 34, frame: 0, ellipse: false });
await p.screenshot({ path: path.join(OUT, "shadow-baked.png") });

// 歩きの2コマ。同じ画角で2枚撮って、あとで並べる
for (const frame of [0, 1]) {
  await swap({ size: 34, frame, ellipse: false });
  await p.screenshot({ path: path.join(OUT, `walk-${frame}.png`) });
}
console.log("撮った:", fs.readdirSync(OUT).join(" "));
await b.close();
