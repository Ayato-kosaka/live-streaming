/**
 * 看板の右はしと、じぶんのことの顔が、**同じ人の同じ絵**になっているか。
 *
 *   SPORT=4501 node tools/sprites/facecheck.mjs
 *   BREAK=nosame node tools/sprites/facecheck.mjs   # わざと盲点を作る（対照が落ちる）
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い
 * （対照が落ちた・面が開けなかった・見るべき要素が無かった）。
 * **印字された「だめ 1」を目で読むのをやめる。** ここは 2026-09-17 まで
 * 終了コードを持っていなくて、**「だめ 1」と言いながら緑で終わっていた**
 * （`docs/island-misses.md` #124 と同じ形）。
 *
 * ## 何を「そろっている」と呼ぶか（2026-09-17 に向きを直した）
 *
 * 出すのは `channelPhoto`（毎晩 islandChannels から入れ直る）。
 * ログインした日のまま止まる `photo` は出さない（`docs/island-misses.md` #1・#2）。
 *
 * **看板は、住人でも `channelPhoto` だけを出す。**
 *
 * > YouTube の顔写真がキャラクターより優先で、無いことはないので、
 * > 住人の絵の見切れを考慮してるのが意味分からない。
 * > 私が今まで住人キャラクターを右上に出すって話一度でもしました？
 * >   — あやと（2026-09-10。`site/components/ui/MeButton.tsx` の頭）
 *
 * ここは長いこと「住人はキャラクターで揃える」（看板＝`lh3.../d/<id>`）で
 * 見ていた。キャラクターが置き場へ移り（#284）看板が顔写真だけになった
 * あとも判定だけ残っていたので、**住人の回は必ず「そろっている=false」**で、
 * 毎回「だめ 1」を出しながら緑で終わっていた。
 * **面を作り替えたら、判定の指す先も直す**（`iconcheck.mjs` が同じ形で1度直している）。
 *
 * いまの正解:
 *   看板の絵 ＝ じぶんのことの顔 ＝ `channelPhoto`（`yt3.ggpht.com`）。キャラの有無によらず同じ
 *   島の絵（`.mh-chara`）は**住人だけ**に出る。あやと（住人の表に居ない）には出ない
 *
 * ## 数える前に対照を通す
 *
 * **判定が「指す先」を失っても、この道具は黙る。** class を書き替えた回に
 * 「そろっている」と出るのがいちばん危ない。だから毎回、生きた面を
 * わざと壊して**判定がひっくり返ることまで**見る（7通り）。
 * 壊すところで要素が見つからなければ、それも外れとして数える
 * （＝指す先が消えている）。1つでも外したら 2 で落ちて、本番の判定は出さない。
 *
 * `BREAK=` で、その守りが効いているかを確かめられる:
 *
 *   nosame   看板と顔が同じかを見ない
 *   nolive   毎晩入れ直る顔（`yt3.ggpht.com`）かを見ない
 *   nochara  島の絵が住人だけに出ているかを見ない
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
import { reportControl } from "./fixserve.mjs";

const PORT = process.env.SPORT || 4501;
const BREAK = process.env.BREAK || "";
const skip = { same: BREAK === "nosame", live: BREAK === "nolive", chara: BREAK === "nochara" };

/** 面から、見るもの3つを読む。**対照にも本番にも同じものを当てる。** */
const read = (p) =>
  p.evaluate(() => ({
    head: [...document.querySelectorAll(".ih-me img")].map((i) => i.getAttribute("src")),
    chara: document.querySelector(".mh-chara")?.getAttribute("src") ?? null,
    face: document.querySelector("img.mh-face")?.getAttribute("src") ?? null,
  }));

/**
 * 合否。**「だめな理由」を並べて返す。** 真偽1つだと、対照が
 * 「別の理由でだめになった」のを見のがす。
 *
 * @param {{head: string[], chara: string|null, face: string|null}} r
 * @param {boolean} nochara あやと（住人の表に居ない人）として開いたか
 */
function verdict(r, nochara) {
  const why = [];
  if (!r.head.length) why.push("看板に絵が無い");
  if (!r.face) why.push("じぶんのことに顔が無い");
  // 看板も顔も `channelPhoto`。住人でもキャラクターにはしない
  if (!skip.same && r.head[0] !== r.face) why.push("看板と顔がちがう絵");
  if (!skip.live && !/yt3\.ggpht\.com/.test(r.face || "")) why.push("顔が、毎晩入れ直るほう(channelPhoto)ではない");
  // 島の絵は住人だけ。あやとに出ていたら、住人の表の引きかたが壊れている
  if (!skip.chara) {
    if (nochara && r.chara) why.push("住人の表に居ない人に、島の絵が出ている");
    if (!nochara && !r.chara) why.push("住人なのに、島の絵が出ていない");
  }
  return { bad: why.length > 0, why };
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
/** 数字を1つも出さずに落ちる。**対照が外れた回に本番の判定を読ませない** */
const bail = async (msg) => { console.log(msg); await b.close(); process.exit(2); };

/**
 * 面を1枚開いて返す。**開けなければ null。**
 * 静的に配ると `/me` は 404 なので `.html` を付ける（`served.mjs` と同じ理由）。
 */
async function openMe(nochara) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { admin: true, nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  const res = await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  if (!res || res.status() !== 200) { await ctx.close(); return null; }
  await p.waitForTimeout(1200);
  return { ctx, p };
}

/* ── 対照が先。落ちたら本物の判定は出さない ──────────────────────── */
{
  /* 壊し方を1つずつ。`fix` は面の中で1か所いじって、**いじれたか**を返す。
     いじれなかった（＝指す先が消えている）ら、それも外れとして数える。 */
  const BREAKS = [
    {
      name: "素のまま（住人）", nochara: false, want: false,
      fix: () => true,
    },
    {
      name: "看板の絵だけ別人", nochara: false, want: true,
      fix: () => { const i = document.querySelector(".ih-me img"); if (!i) return false; i.setAttribute("src", "https://yt3.ggpht.com/dare-ka-hoka-no-hito=s800"); return true; },
    },
    {
      name: "顔が、止まるほう(photo)", nochara: false, want: true,
      fix: () => { const i = document.querySelector("img.mh-face"); if (!i) return false; i.setAttribute("src", "https://lh3.googleusercontent.com/a/tomatta-hou=s96"); return true; },
    },
    {
      /* **「揃っている」だけを立てたまま、止まるほうの絵に揃える。**
         これを入れるまで、`BREAK=nolive` が対照 7/7 で素通りしていた。
         どの壊し方も「看板と顔がちがう」を道連れにしていたので、
         `channelPhoto` かどうかを見る足を抜いても誰も鳴らなかった
         （`docs/island-misses.md` #125 の「片側だけの対照」そのもの）。 */
      name: "看板も顔も、止まるほう(photo)", nochara: false, want: true,
      fix: () => {
        const h = document.querySelector(".ih-me img"), f = document.querySelector("img.mh-face");
        if (!h || !f) return false;
        const u = "https://lh3.googleusercontent.com/a/tomatta-hou=s96";
        h.setAttribute("src", u); f.setAttribute("src", u);
        return true;
      },
    },
    {
      name: "顔の要素ごと無い", nochara: false, want: true,
      fix: () => { const i = document.querySelector("img.mh-face"); if (!i) return false; i.remove(); return true; },
    },
    {
      name: "住人なのに島の絵が無い", nochara: false, want: true,
      fix: () => { const i = document.querySelector(".mh-chara"); if (!i) return false; i.remove(); return true; },
    },
    {
      name: "素のまま（あやと）", nochara: true, want: false,
      fix: () => true,
    },
    {
      name: "あやとに島の絵が出ている", nochara: true, want: true,
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
    if (!got) await bail(`対照の面（/me.html）が開けませんでした。先に書き出して静的に配ってください。`);
    const touched = await got.p.evaluate(t.fix);
    if (!touched) {
      checks.push({ name: t.name, want: t.want, got: !t.want, note: "← 壊すところが見つからない（判定の指す先が消えている）" });
      await got.ctx.close();
      continue;
    }
    const v = verdict(await read(got.p), t.nochara);
    checks.push({ name: t.name, want: t.want, got: v.bad, note: v.why.join(" / ") });
    await got.ctx.close();
  }
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の判定は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物 ─────────────────────────────────────────────────────── */
let bad = 0, seen = 0;
for (const nochara of [false, true]) {
  const got = await openMe(nochara);
  if (!got) { console.log(`${nochara ? "あやと" : "住人"}  /me.html が開けませんでした`); continue; }
  seen++;
  const r = await read(got.p);
  const v = verdict(r, nochara);
  if (v.bad) bad++;
  const who = nochara ? "キャラ無し（あやと）" : "キャラ有り（住人）";
  console.log(
    `${who}\n  看板=${r.head[0]}\n  島の絵=${r.chara}\n  顔=${r.face}\n` +
      `  そろっている=${!v.bad}${v.why.length ? `（${v.why.join(" / ")}）` : ""}`,
  );
  await got.ctx.close();
}
await b.close();

console.log(`\n── 数えたもの`);
console.log(`  見た組み合わせ ${seen} / 2（住人・あやと）`);
console.log(`  だめ           ${bad} / ${seen}`);
console.log(`  見ていないもの: 絵が本当に描けたか（それは iconcheck.mjs）・住人以外の人の顔`);

if (seen < 2) { console.log("\n見るものが足りません。"); process.exit(2); }
if (bad) { console.log(`\nだめ ${bad}`); process.exit(1); }
console.log("\n顔はそろっている");
process.exit(0);
