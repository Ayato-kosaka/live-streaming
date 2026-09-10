/**
 * どの街の地図が、どの面に出るかを書き出す（`cmshot.mjs` が読む）。
 *
 *   DIST=/home/user/live-streaming/site/.next-3170 node tools/sprites/cmdays.mjs
 *
 * **面の名簿を手で書かない。** 書き出した HTML から拾う。
 * 日ページに出ない街（出発の街カトヴィツェ）は、国の面のほうに出ている。
 */
import { readFileSync, readdirSync, writeFileSync } from "fs";

const DIST = process.env.DIST || "/home/user/live-streaming/site/.next-3170";
// **地図の元は、書き出しと同じ木から読む。** ここだけ絶対パスで別の木を
// 見ていたので、worktree で焼き直した地図を確かめようとすると、
// 書き出しは新しいのに名簿だけ古い、という食い違いが出た（`DIST` は
// `<木>/site/.next-*` なので、2つ上が `<木>/site`）
const maps = JSON.parse(readFileSync(`${DIST}/../content/nordic/citymaps.json`, "utf8"));
const where = new Map();
const add = (path, id, rank) => {
  const prev = where.get(id);
  if (!prev || rank < prev.rank) where.set(id, { path, rank });
};
for (const f of readdirSync(`${DIST}/nordic/day`)) {
  if (!/^\d+\.html$/.test(f)) continue;
  const n = Number(f.slice(0, -5));
  const h = readFileSync(`${DIST}/nordic/day/${f}`, "utf8");
  for (const m of h.matchAll(/id="want-([^"]+)"/g)) add(`/nordic/day/${f}`, m[1], n);
}
for (const f of readdirSync(`${DIST}/nordic`)) {
  if (!f.endsWith(".html")) continue;
  const h = readFileSync(`${DIST}/nordic/${f}`, "utf8");
  if (!h.includes("cmap-frame")) continue;
  for (const m of h.matchAll(/id="city-([^"]+)"/g)) add(`/nordic/${f}`, decodeURIComponent(m[1]), 900);
}
const rows = [];
for (const [city, v] of Object.entries(maps)) {
  const w = where.get(city) || where.get(encodeURIComponent(city));
  if (w) rows.push([v.slug, w.path, city]);
  else console.log(`どこにも出ていない: ${city}`);
}
writeFileSync(new URL("./cmdays.json", import.meta.url), JSON.stringify(rows));
console.log(rows.map((r) => r.join(" ")).join("\n"));
