/**
 * 島の管理（`/me/desk`）の札を、`site/components/me/tools.ts` の `TOOLS` から字のまま読む。
 * 判定はしない。撮る道具が札を押すときに、札の字をここから引く。
 *
 *     import { DESK_TOOLS, deskTab } from "./desktools.mjs";
 *     { page: "/me/desk.html", tab: deskTab("donor") }   // → "名前をつなぐ"
 *
 * ## なぜ要るか（#1280）
 *
 * 撮る道具の多く（`mesweep` `meink` `mefaces` `inkdis` `hitshot` `hitspan`）が、
 * 札の字を手で書いていた。机から「企画」「いまどこ」が外れ、「投げ銭」「スパチャ」の
 * 名前が変わっても、どれも古いまま残った。**押せない札は `catch` で飲んで
 * 机の1枚目を撮る**ので、撮れていないことが絵からも数からも分からない。
 *
 * 字ではなく `id` で引く。`id` が表に無ければ、その場で止める（終了コード 2）。
 * 読み落とし（表が名乗る数と読めた数が合わない）も `must()` が 2 で止める。
 */
import { readFileSync } from "node:fs";
import { repoPath } from "./repo.mjs";
import { must, readArray } from "./tsread.mjs";

/** 表の上から順。`{ id, label, errand }` */
export const DESK_TOOLS = must(
  readArray(readFileSync(repoPath("site/components/me/tools.ts"), "utf8"), "TOOLS", {
    keys: ["id", "label", "errand"],
    idKey: "id",
  }),
  "tools.ts の TOOLS",
);

/** 道具の `id` から、札の字を引く。無い `id` は止める（古い一覧を黙って飛ばさない） */
export function deskTab(id) {
  const t = DESK_TOOLS.find((r) => r.id === id);
  if (!t) {
    console.log(`\n数えるものが無い: 机に「${id}」の道具が無い（site/components/me/tools.ts の TOOLS）`);
    process.exit(2);
  }
  return t.label;
}

/**
 * 札（`.mp-tab`）を字で押す。机の札も、じぶんのことの札も同じ形。
 *
 * **畳んだ用事（配信の道具）の札は、畳みを開いてから押す。** 閉じた畳みの中の札は
 * 見えないので、押そうとすると時間切れまで待って `catch` に落ち、机の1枚目を
 * 撮ったまま次へ進む（「OBS」の場面はずっとそうだった）。開くのは札を抱えた畳みだけで、
 * ほかの畳みは呼ぶ側が決める。押せなかったら字で言って `false` を返す。
 */
export async function pressTab(p, label, timeout = 5000) {
  await p.evaluate(() => {
    for (const d of document.querySelectorAll("details")) if (d.querySelector(".mp-tab")) d.open = true;
  });
  const ok = await p
    .locator(".mp-tab", { hasText: new RegExp(`^${label}`) })
    .first()
    .click({ timeout })
    .then(() => true)
    .catch(() => false);
  if (!ok) console.log(`  札「${label}」を押せなかった`);
  return ok;
}
