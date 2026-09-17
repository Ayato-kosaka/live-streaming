/**
 * じぶんのことの絵が、**ほんとうに描けたか**を見る（`facecheck.mjs` は URL を見る）。
 *
 *   SPORT=4150 node tools/sprites/iconcheck.mjs
 *   BREAK=nodead node tools/sprites/iconcheck.mjs   # わざと盲点を作る（対照が落ちる）
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い
 * （対照が落ちた・面が開けなかった）。**印字を目で読んで合格と言わない。**
 * ここは 2026-09-17 まで終了コードを持っていなかった（`docs/island-misses.md` #124）。
 *
 * 見るのは3つ。それぞれ**絵のある人（住人）と絵の無い人（あやと）の両方**で:
 *
 *   看板の右はし（`.ih-me img`）      … 描けているか
 *   じぶんのことの顔（`.mh-face`）    … 描けているか
 *   島のじぶん（`.mh-chara`）         … 住人には在って描けている／あやとには無い
 *
 * **判定の向きを、いまの目的に合わせる。** 一度「YouTube の顔を消す」が目的
 * だったときの判定（`yt3` を取りに行ったら失敗）をそのまま使っていて、
 * 正しく出ているものを「だめ」と読んだ。いまの正解は「顔が出ていること」。
 *
 * **面を作り替えたら、判定の指す先も直す。** じぶんのことを作り直したとき
 * （#239）、顔は `.mp-face` から `.mh-face`（YouTube の顔）と
 * `.mh-chara`（島のキャラクター）に分かれた。古い名前のままだと
 * 「正しく出ているのに無し」と読んで、直っているものを落とす。
 *
 * ## 数える前に対照を通す
 *
 * 指す先が消えたときにいちばん危ないのは、**落ちるのではなく黙ること**
 * （`document.querySelector` が null を返し、「無し」が0件に紛れる）。
 * だから毎回、生きた面をわざと壊して**判定がひっくり返ることまで**見る（7通り）。
 * 壊すところが見つからなければ、それも外れとして数える。
 * 1つでも外したら 2 で落ちて、本番の判定は出さない。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nohead   看板の絵を見ない
 *   noface   じぶんのことの顔を見ない
 *   nochara  島のじぶんを見ない
 *   nodead   描けたかを見ず、要素が在れば「出ている」とする
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
import { reportControl } from "./fixserve.mjs";

const PORT = process.env.SPORT || 4150;
const BREAK = process.env.BREAK || "";
const skip = {
  head: BREAK === "nohead", face: BREAK === "noface",
  chara: BREAK === "nochara", dead: BREAK === "nodead",
};

/** 面から、見るもの3つを読む。**対照にも本番にも同じものを当てる。** */
const read = (p, skipDead) =>
  p.evaluate((skipDead) => {
    const me = document.querySelector(".ih-me");
    const ok = (e) => (e ? (skipDead || e.naturalWidth > 0 ? "出ている" : "落ちた") : "無し");
    const chara = document.querySelector(".mh-chara");
    return {
      看板字: me?.querySelector(".ih-me-i")?.textContent ?? "(無し)",
      看板絵: ok(me?.querySelector("img")),
      中部: ok(document.querySelector(".mh-face")),
      島のじぶん: chara ? ok(chara) : "（絵なし）",
      /** 分母。**「落ちた 0本」が「見ていないから0本」と区別できるように出す** */
      見た絵: [me?.querySelector("img"), document.querySelector(".mh-face"), chara].filter(Boolean).length,
    };
  }, skipDead);

/**
 * 合否。**「だめな理由」を並べて返す。** 真偽1つだと、対照が
 * 「別の理由でだめになった」のを見のがす。
 */
function verdict(r, nochara) {
  const why = [];
  if (!skip.head && r.看板絵 !== "出ている") why.push(`看板の絵が ${r.看板絵}`);
  if (!skip.face && r.中部 !== "出ている") why.push(`じぶんのことの顔が ${r.中部}`);
  if (!skip.chara) {
    // あやとは住人の表に居ないので、島のじぶんは**無いのが正しい**
    if (nochara && r.島のじぶん !== "（絵なし）") why.push(`住人の表に居ない人に島のじぶんが ${r.島のじぶん}`);
    if (!nochara && r.島のじぶん !== "出ている") why.push(`島のじぶんが ${r.島のじぶん}`);
  }
  return { bad: why.length > 0, why };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const bail = async (msg) => { console.log(msg); await b.close(); process.exit(2); };

/** 面を1枚開いて返す。開けなければ null。取りに行った顔の URL も持って帰る */
async function openMe(nochara) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  const yt = [];
  p.on("request", (r) => { if (/yt3\.ggpht\.com|googleusercontent\.com\/ytc/.test(r.url())) yt.push(r.url()); });
  const res = await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  if (!res || res.status() !== 200) { await ctx.close(); return null; }
  await p.waitForTimeout(1500);
  return { ctx, p, yt };
}

/* ── 対照が先。落ちたら本物の判定は出さない ──────────────────────── */
{
  /* **落とす先は、手元で 404 になるものにする。** `yt3` や
     `googleusercontent` に化けさせても `route.mjs` の差し替えが
     受け取ってしまい、**壊したつもりで 200 が返る**（差し替えは
     「この箱から出られない先」を埋めるためのもの）。 */
  const DEAD = "/no-such-picture.webp";
  const BREAKS = [
    { name: "素のまま（住人）", nochara: false, want: false, fix: () => true },
    {
      name: "看板の絵が落ちる", nochara: false, want: true,
      fix: (u) => { const i = document.querySelector(".ih-me img"); if (!i) return false; i.src = u; return true; },
    },
    {
      name: "じぶんのことの顔が落ちる", nochara: false, want: true,
      fix: (u) => { const i = document.querySelector(".mh-face"); if (!i) return false; i.src = u; return true; },
    },
    {
      name: "じぶんのことの顔が無い", nochara: false, want: true,
      fix: () => { const i = document.querySelector(".mh-face"); if (!i) return false; i.remove(); return true; },
    },
    {
      name: "島のじぶんが落ちる", nochara: false, want: true,
      fix: (u) => { const i = document.querySelector(".mh-chara"); if (!i) return false; i.src = u; return true; },
    },
    { name: "素のまま（あやと）", nochara: true, want: false, fix: () => true },
    {
      name: "あやとに島のじぶんが出ている", nochara: true, want: true,
      fix: () => {
        const w = document.querySelector(".mh-pics"); if (!w) return false;
        const i = document.createElement("img");
        i.className = "mh-chara";
        i.src = "/island-api/characters/dare-ka/plain-256.webp";
        w.insertBefore(i, w.firstChild);
        return true;
      },
    },
  ];
  console.log("── 対照（壊した面で、判定がひっくり返るか／素のままで鳴らずにいられるか）");
  const checks = [];
  for (const t of BREAKS) {
    const got = await openMe(t.nochara);
    if (!got) await bail("対照の面（/me.html）が開けませんでした。先に書き出して静的に配ってください。");
    const touched = await got.p.evaluate(t.fix, DEAD);
    if (!touched) {
      checks.push({ name: t.name, want: t.want, got: !t.want, note: "← 壊すところが見つからない（判定の指す先が消えている）" });
      await got.ctx.close();
      continue;
    }
    // 差し替えた絵が落ちる（または新しく描ける）のを待つ
    await got.p.waitForTimeout(900);
    const v = verdict(await read(got.p, skip.dead), t.nochara);
    checks.push({ name: t.name, want: t.want, got: v.bad, note: v.why.join(" / ") });
    await got.ctx.close();
  }
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の判定は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物 ─────────────────────────────────────────────────────── */
let bad = 0, seen = 0, imgs = 0;
for (const nochara of [false, true]) {
  const got = await openMe(nochara);
  if (!got) { console.log(`${nochara ? "あやと" : "住人"}  /me.html が開けませんでした`); continue; }
  seen++;
  const r = await read(got.p, skip.dead);
  imgs += r.見た絵;
  const v = verdict(r, nochara);
  if (v.bad) bad++;
  console.log(
    `${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=${r.看板絵} / ` +
      `YouTubeの顔=${r.中部} / 島のじぶん=${r.島のじぶん} / 顔の取得=${got.yt.length}回` +
      (v.bad ? `  ← だめ（${v.why.join(" / ")}）` : ""),
  );
  await got.ctx.close();
}
await b.close();

console.log(`\n── 数えたもの`);
console.log(`  見た組み合わせ ${seen} / 2（住人・あやと）`);
console.log(`  見た絵         ${imgs} 枚（看板・顔・島のじぶん）`);
console.log(`  だめ           ${bad} / ${seen}`);
console.log(`  見ていないもの: 出ている絵が**誰の**絵か（それは facecheck.mjs）・図鑑や島の側の絵`);

if (seen < 2) { console.log("\n見るものが足りません。"); process.exit(2); }
if (bad) { console.log(`\nだめ ${bad}件`); process.exit(1); }
console.log("\n看板・中部とも顔が出ている");
process.exit(0);
