/**
 * 看板の右はしと、じぶんのことの顔が、**同じ人の同じ絵**になっているか。
 *
 *   SPORT=4501 node tools/sprites/facecheck.mjs
 *
 * 出すのは `channelPhoto`（毎晩 islandChannels から入れ直る）。
 * ログインした日のまま止まる `photo` は出さない（`docs/island-misses.md` #1・#2）。
 * **判定は「何が出ているか」で見る。** 前に「yt3 を取りに行ったら失敗」で
 * 測っていたが、あれは顔を消していた頃の向きで、いまは逆
 * （出すのが正しい）。向きの合っていない道具をそのまま使わない。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4501;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
let bad = 0;
for (const nochara of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { admin: true, nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    head: [...document.querySelectorAll(".ih-me img")].map((i) => i.getAttribute("src")),
    chara: document.querySelector(".mh-chara")?.getAttribute("src") ?? null,
    face: document.querySelector("img.mh-face")?.getAttribute("src") ?? null,
  }));
  /** ドライブの絵は、大きさ（=s96 / =s256）だけ違って同じ人。**id で見る。** */
  const fid = (u) => (/\/d\/([^=?]+)/.exec(u || "") || [])[1] || u;
  const who = nochara ? "キャラ無し（あやと）" : "キャラ有り（住人）";
  // 住人はキャラクターで揃える。キャラの無い人は channelPhoto で揃える
  const same = nochara ? r.head[0] === r.face : fid(r.head[0]) === fid(r.chara);
  /* 顔は毎晩入れ直るほう（`channelPhoto`）が出ているか。
     **「yt3 を取りに行ったら失敗」で測らない。** あれは顔を消していた頃の
     向きで、いまは逆（出すのが正しい）。 */
  const live = /yt3\.ggpht\.com/.test(r.face || "");
  if (!same || !live) bad++;
  console.log(
    `${who}\n  看板=${r.head[0]}\n  島の絵=${r.chara}\n  顔=${r.face}\n` +
      `  そろっている=${same} 毎晩の顔=${live}`,
  );
  await ctx.close();
}
await b.close();
console.log(bad ? `だめ ${bad}` : "顔はそろっている");
