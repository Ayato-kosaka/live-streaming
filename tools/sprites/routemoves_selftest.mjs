/**
 * **前の道（作り直す前の本番の sitemap）が、いまも全部どこかへ行くか**を、毎 PR で見る。
 *
 *   node tools/sprites/routemoves_selftest.mjs
 *
 * 終了コード 0=通った / 1=行き先の無い道・転送の連鎖がある / 2=数えるものが無い・対照が外れた。
 *
 * 道具は `tools/sprites/routemoves.mjs`。ここは書き出し無しで回す（置き場から見る）ので、
 * 動く段（`[slug]`）の中身までは見ない。正確に見るのは `--dist` を渡したとき。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 本物を数える前に、偽の置き場で落ちるときに落ちるかを見る:
 *
 * | 台 | 落ちてほしいもの |
 * | --- | --- |
 * | 転送を1行ずつ抜く | 抜いた行が送っていた前の道を「行き先が無い」と名指しする |
 * | 転送の先を、また転送に | 連鎖を1本と数える |
 * | 先の面を消す | 転送は在っても「先が無い」と名指しする |
 * | 当てかた（`:slug` `**` `@()` `{,}`） | 1段だけ・跨ぐ・選ぶ・どちらも、を Hosting と同じに |
 *
 * そのうえで本物の `firebase.json` にも同じことをする——**元帳の道を送っている転送を
 * 1行ずつ抜いて、毎回落ちる**ことを見る。抜いても落ちない行があれば、
 * その行は何も守っていないか、この見張りが見ていない。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  FIREBASE_JSON,
  ROOT,
  SNAPSHOT,
  check,
  compileSource,
  loadRedirects,
  readSnapshot,
  redirectOf,
  report,
  srcTree,
} from "./routemoves.mjs";

let BAD = 0;
let SEEN = 0;
const ok = (name, cond, why = "") => {
  SEEN++;
  if (!cond) BAD++;
  console.log(`  ${cond ? "○" : "✕"} ${name}${!cond && why ? `  — ${why}` : ""}`);
};
const stop = (why) => {
  console.log(`\n✕ ${why}。数えるものが無いので 2 で止めます`);
  process.exit(2);
};

/* ── 1. 当てかた ─────────────────────────────────────────────── */
console.log("[1] 転送の当てかた（Hosting と同じ glob）");
const m = (src, path) => compileSource(src).re.test(path);
ok("`/map/:slug` は1段だけ", m("/map/:slug", "/map/georgia") && !m("/map/:slug", "/map/a/b") && !m("/map/:slug", "/map"));
ok("`/x/**` は下を跨ぐが、自分には当たらない", m("/x/**", "/x/a/b") && !m("/x/**", "/x"));
ok("`/x{,/**}` は自分にも下にも", m("/x{,/**}", "/x") && m("/x{,/**}", "/x/a/b") && !m("/x{,/**}", "/xy"));
ok("`/@(a|b)` は選んだものだけ", m("/@(a|b)", "/a") && m("/@(a|b)", "/b") && !m("/@(a|b)", "/c"));
ok("`.` を字のまま当てる", m("/nordic_review.html", "/nordic_review.html") && !m("/nordic_review.html", "/nordic_reviewxhtml"));
let threw = false;
try {
  compileSource("/x?(y)");
} catch {
  threw = true;
}
ok("読めない書きかたは、当てずに投げる", threw);
const rd = redirectOf("/map/georgia", [{ n: 1, destination: "/travel/:slug#top", ...compileSource("/map/:slug") }]);
ok("取り込んだ段を先へ渡し、`#` は先の面を決めない", rd?.raw === "/travel/georgia#top" && rd?.to === "/travel/georgia", JSON.stringify(rd));

/* ── 2. 偽の置き場 ───────────────────────────────────────────── */
console.log("[2] 偽の置き場で、落ちるときに落ちるか");
const dir = mkdtempSync(join(tmpdir(), "routemoves-"));
const put = (rel, body = "") => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
};
for (const p of ["app/page.tsx", "app/a/page.tsx", "app/travel/page.tsx", "app/travel/[slug]/page.tsx", "app/(g)/b/page.tsx"]) put(p);
put("pub/old.html");
const fakeTree = (extra = []) => srcTree({ app: join(dir, "app"), pub: [join(dir, "pub"), ...extra] });
const rule = (n, source, destination) => ({ n, source, destination, type: 301, ...compileSource(source) });
const RULES = [rule(1, "/map", "/travel"), rule(2, "/map/:slug", "/travel/:slug"), rule(3, "/x", "/a")];
const PATHS = ["/", "/a", "/b", "/old", "/map", "/map/georgia", "/x"];
const quiet = () => {};
const run = (rules, tree = fakeTree(), paths = PATHS) => check({ paths, rules, tree });
const base = run(RULES);
ok("揃っている台は通る（行き先の無い道 0・連鎖 0）", base.lost.length === 0 && base.chains.length === 0 && base.deadFixed.length === 0,
  JSON.stringify(base.lost));
ok("`(まとめ)` は道に出ない段として読む", fakeTree().has("/b") && !fakeTree().has("/g/b"));
ok("`public/` の .html も実ファイル", fakeTree().has("/old"));
for (const r of RULES) {
  const got = run(RULES.filter((x) => x !== r));
  const want = PATHS.filter((p) => redirectOf(p, [r]));
  ok(`転送 ${r.source} を抜くと、送っていた ${want.join(" ")} を名指しする`,
    want.length > 0 && want.every((p) => got.lost.some((x) => x.path === p)), JSON.stringify(got.lost));
}
const chained = run([...RULES, rule(4, "/a", "/b")]);
ok("転送の先がまた転送なら、連鎖を1本と数える", chained.chains.length === 1, JSON.stringify(chained.chains));
const noDest = check({ paths: PATHS, rules: RULES, tree: srcTree({ app: join(dir, "app-without-travel"), pub: [join(dir, "pub")] }) });
ok("転送は在っても、先の面が無ければ名指しする", noDest.lost.some((x) => x.path === "/map/georgia"));
ok("印字の終了コードは、落ちた台で 1", report(chained, { tree: fakeTree(), rules: RULES, snapshot: "台", out: quiet }) === 1);
rmSync(dir, { recursive: true, force: true });

/* ── 3. 本物 ─────────────────────────────────────────────────── */
console.log("[3] 本物（作り直す前の本番の sitemap の写し × いまの firebase.json × 置き場）");
const paths = readSnapshot(SNAPSHOT);
const rules = loadRedirects(FIREBASE_JSON);
const tree = srcTree();
if (paths.length < 100) stop(`元帳が ${paths.length}本しか読めない`);
if (tree.routes.length < 20 || !tree.has("/")) stop(`置き場の面が ${tree.routes.length}枚しか見つからない`);
const res = check({ paths, rules, tree });
const code = report(res, { tree, rules, snapshot: SNAPSHOT.replace(`${ROOT}/`, "") });
ok("前の道が、全部どこかへ行く（連鎖も無い）", code === 0);

/* 元帳の道を送っている転送を、1行ずつ抜く。**抜いても落ちない行は、何も守っていない** */
const used = rules.filter((r) => paths.some((p) => redirectOf(p, rules)?.rule === r));
if (!used.length) stop("元帳の道を送っている転送が1行も無い");
const loose = used.filter((r) => check({ paths, rules: rules.filter((x) => x !== r), tree }).lost.length <= res.lost.length);
ok(`元帳の道を送っている転送 ${used.length}行は、どれを抜いても落ちる`, loose.length === 0,
  loose.map((r) => `${r.n}行目 ${r.source}`).join(" "));

/* 道具として起こしても同じ答えか（手で `--dist` を渡して回す口が、ここと別の数を言わないこと） */
let cli = "";
let cliCode = 0;
try {
  cli = execFileSync("node", [join(ROOT, "tools", "sprites", "routemoves.mjs")], { encoding: "utf8" });
} catch (e) {
  cli = String(e.stdout ?? "");
  cliCode = e.status ?? -1;
}
ok("道具として起こしても、同じ答え（終了コード 0・同じ数）",
  cliCode === 0 && cli.includes(`301 で新しい道へ（先が在る） ${res.moved.length}本`), `終了コード ${cliCode}`);

console.log("");
console.log(BAD ? `✕ ${BAD}/${SEEN}件 落ちた` : `○ ${SEEN}件ぜんぶ通った（前の道 ${paths.length}本・転送 ${rules.length}行）`);
process.exit(BAD ? 1 : 0);
