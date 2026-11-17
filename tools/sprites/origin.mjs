/**
 * **本番の宛先は2つ。島の面は正の URL、OBS と口は古いドメイン。**（#1202 の段 B）
 *
 *   import { SITE_ORIGIN, LEGACY_ORIGIN, OUR_HOSTS } from "./origin.mjs";
 *
 * - `SITE_ORIGIN` … 島の面を開く道具の既定。`site/content/site.ts` の `SITE.url` を読む
 *   （canonical と同じ1行。字で書かない）。段 B（`python/data/hosting_stage.json`）で
 *   古いドメインの島の面が 301 になると、古いドメインで面を開く道具は全部 301 を読むことになる
 * - `LEGACY_ORIGIN` … **段 B のあとも古いドメインで動き続けるもの**の宛先。OBS のブラウザソース
 *   （`/alertbox` ほか）と口（`/island-api/**`）は 301 の規則に当たらない（sitemap に無い）ので、
 *   ここから 200 のまま返る。口だけを引く道具をここに残すのは、ドメインの付け替えのあいだ
 *   新しいドメインが証明書待ちで止まる時間があっても、口は古いドメインから読めるため
 * - `OUR_HOSTS` … 道具がブラウザに通す先（`PASS`）に入れる、両方のホスト名の正規表現の字
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "./repo.mjs";
import { codeOnly, fields, objectBody } from "./tsread.mjs";

/**
 * 正の URL（`site/content/site.ts` の `SITE.url`）。読めなければ投げる
 * ——黙って古い宛先に落ちると、測る先が黙って入れ替わる。
 *
 * @param {string} [root] リポジトリの根（対照で偽の根を渡す）
 */
export function siteUrl(root) {
  const src = readFileSync(root ? join(root, "site/content/site.ts") : repoPath("site/content/site.ts"), "utf8");
  const url = fields(objectBody(codeOnly(src), "SITE")).url || "";
  if (!/^https?:\/\/[^/]+$/.test(url))
    throw new Error(`site/content/site.ts の SITE.url が原点だけの URL として読めない（${url || "無い"}）`);
  return url;
}

export const SITE_ORIGIN = siteUrl();
export const LEGACY_ORIGIN = "https://live-streaming-d3cac.web.app";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const OUR_HOSTS = [SITE_ORIGIN, LEGACY_ORIGIN].map((o) => esc(new URL(o).host)).join("|");
