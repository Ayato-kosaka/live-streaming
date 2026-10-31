/**
 * **焼き込まれた日付の字**を見つける。
 *
 *   tools/build.sh 3201                                   # きょうの書き出し（A）
 *   FAKE_NOW=2027-11-18T00:00:00Z \
 *     NODE_OPTIONS="--require $PWD/tools/sprites/buildclock.cjs" \
 *     NEXT_PUBLIC_BUILT_AT=2027-11-18T00:00:00Z tools/build.sh 3202   # 先の日の書き出し（B）
 *   python3 -m http.server 4201 --directory site/.next-3201 &
 *   DIST=site/.next-3201 B=site/.next-3202 SPORT=4201 node tools/sprites/datebake.mjs
 *
 * 終了コード 0=通った / 1=焼いたままのものがあった / 2=数えるものが無い。
 *
 * ## 何を見ているか
 *
 * 島は `output: "export"` なので、**ビルドした日の答えが HTML に焼かれて、
 * 次に配り直すまでそのまま配られる。** 字が日で変わるものは、画面が出てから
 * 数え直さないと、その日から毎日1ずつ嘘になっていく
 * （`docs/island-misses.md` #30 #143 #228）。
 *
 * **1回の書き出しからは、「焼いた日付」と「ただの数」を見分けられない。**
 * 「17日目」も「17人」も、焼いた HTML の中では同じ3文字でしかない。
 * だから**日を変えて2回焼いて、字が変わったところ**を日付の字とみなす。
 * 意味を読まないので、言い回しの表も、逃がす表も要らない。
 *
 *   1. A（きょう）と B（先の日）の**焼いた字**を突き合わせる
 *      → 違ったところが「焼き込まれた日付の字」。**0件なら数えずに 2 で落ちる**
 *      （`docs/island-standards.md` §15。2回とも同じ日で焼いていたら、
 *      何を測っても通る）
 *   2. **A を、B の日の時計で開く。** そこが B の字になっていれば数え直して
 *      いる。A の字のままなら**焼いたまま**——それが見つけたいもの
 *
 * ## 対照（この道具が落ちられることを、毎回先に見る）
 *
 * 2 の裏側を必ず通る。**A を、A の日の時計でも開いて**、全部が A の字で
 * 出ることを見る。出なければ測りかたのほうが壊れている（時計が刺さって
 * いない・位置合わせが外れている）ので、**本物の数字を1つも出さずに 2**。
 *
 *   BREAK=noclock  … B の日の時計を刺さない。全部が「焼いたまま」で 1 になる
 *   BREAK=sameday  … B のかわりに A を突き合わせる。候補 0件で 2 になる
 *
 * ## 焼いた日は、書き出したものから読む
 *
 * `NEXT_PUBLIC_BUILT_AT` は `new Date("…")` の形で chunk に焼かれている
 * （`site/lib/builtAt.ts` / `site/next.config.mjs`）。**渡してもらわない。**
 * 渡す形にすると、ビルドした日と見張りに書いた日がずれた回に、
 * 直っているものが「焼いたまま」に見える。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { DIST, PAGES, checkAgainstSitemap } from "./islepages.mjs";
import { offline } from "./route.mjs";
import { fromRoot } from "./repo.mjs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SPORT = process.env.SPORT || "4201";
const BASE = `http://127.0.0.1:${SPORT}`;
const BREAK = process.env.BREAK || "";
/* **A は `DIST=` で渡す。** 置き場の決め方を自分で持つと、面の一覧
   （`islepages.mjs`）が別の書き出しを歩いて、合わない数で落ちる。 */
const DIST_A = DIST;
const DIST_B = BREAK === "sameday" ? DIST_A : fromRoot(process.env.B || "site/.next-b");

/** 2 で落ちる。**本物の数字を1つも出さない。** */
function cannotCount(why) {
  console.error(`× 数えられませんでした: ${why}`);
  process.exit(2);
}

/**
 * その書き出しが「いつの答え」として焼かれたか。
 *
 * `lib/builtAt.ts` の `new Date(process.env.NEXT_PUBLIC_BUILT_AT ?? 0)` が、
 * chunk では `new Date("2026-10-14T00:38:53.040Z"??0)` になる。
 * 1つに決まらなければ読まない（**当て推量で測らない**）。
 */
function builtAt(dist) {
  let dir;
  try {
    dir = readdirSync(join(dist, "_next/static/chunks"));
  } catch {
    return { why: `${dist}/_next/static/chunks が読めない（書き出していない・置き場が違う）` };
  }
  const found = new Set();
  for (const n of dir) {
    if (!n.endsWith(".js")) continue;
    const s = readFileSync(join(dist, "_next/static/chunks", n), "utf8");
    for (const m of s.matchAll(/Date\("(20\d\d-\d\d-\d\dT[\d:.]+Z)"/g)) found.add(m[1]);
  }
  if (found.size !== 1) return { why: `${dist} の焼いた日が ${found.size} 個みつかった（1つに決まらない）` };
  return { at: [...found][0] };
}

/**
 * 焼いた HTML の、目に出る字。**タグも script も読まない。**
 *
 * ブラウザで JS を切って開いても同じものが取れるが、136面を2つの書き出しで
 * 開くと 272回ぶん待つことになる。**字を比べるだけなので、ファイルで足りる。**
 */
function baked(dist, page) {
  const f = page === "/" ? "index.html" : `${page.slice(1)}.html`;
  let h;
  try {
    h = readFileSync(join(dist, f), "utf8");
  } catch {
    return null;
  }
  h = h.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
  return h
    .split(/<[^>]*>/)
    .map((s) => s.replace(/&nbsp;/g, " ").replace(/ /g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 時計を止める。`Date` だけ差し替えれば島の日付はぜんぶこれを見る（`nextempty.mjs` と同じ）。 */
const clock = (iso) => `(() => {
  const FAKE = ${Date.parse(iso)};
  const Real = Date;
  const t0 = Real.now();
  const shift = () => FAKE + (Real.now() - t0);
  class D extends Real {
    constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
    static now() { return shift(); }
  }
  Object.defineProperty(D, "name", { value: "Date" });
  globalThis.Date = D;
})();`;

/**
 * 焼いた字の並びと、画面に出た字の並びを**位置で**対応づける。
 *
 * 字そのもので探すと外れる。「17」は島の住人の出席日数にも出るので、
 * 「17 が画面のどこかに在る」では、札が数え直したかどうかを言えない
 * （実測で `/island/balkans` に6か所あった）。
 *
 * 画面のほうは、画面が出てから足される字（`Say` の差し込み・付箋）で
 * 並びが伸びる。前後の合うところを足がかりに、ずれを詰めながら対応づける。
 *
 * @returns {Map<number, number>} 焼いた並びの番号 → 画面の並びの番号
 */
function align(a, r) {
  const map = new Map();
  let k = 0;
  let m = 0;
  const WIN = 40;
  while (k < a.length && m < r.length) {
    if (a[k] === r[m]) { map.set(k, m); k++; m++; continue; }
    // 1つだけ入れ替わった（＝数え直した字）。前後が合うなら、そこは対応する
    if (k + 1 < a.length && m + 1 < r.length && a[k + 1] === r[m + 1]) {
      map.set(k, m); k++; m++; continue;
    }
    let hit = -1;
    for (let d = 1; d <= WIN && m + d < r.length; d++) if (r[m + d] === a[k]) { hit = m + d; break; }
    if (hit >= 0) { m = hit; continue; }
    hit = -1;
    for (let d = 1; d <= WIN && k + d < a.length; d++) if (a[k + d] === r[m]) { hit = k + d; break; }
    if (hit >= 0) { k = hit; continue; }
    k++; m++;
  }
  return map;
}

// ---------------------------------------------------------------- 1. 焼いた字を突き合わせる

const atA = builtAt(DIST_A);
const atB = builtAt(DIST_B);
if (atA.why) cannotCount(atA.why);
if (atB.why) cannotCount(atB.why);
console.log(`焼いた日 A=${atA.at} / B=${atB.at}`);
if (BREAK) console.log(`※対照 BREAK=${BREAK}`);
if (atA.at === atB.at && BREAK !== "sameday")
  cannotCount("A と B が同じ日で焼かれている（日を変えて2回焼くこと）");

const sm = checkAgainstSitemap();
if (!sm.ok) cannotCount(`sitemap.xml と一覧が合わない: ${sm.why || sm.missing.join(" ")}`);
if (!PAGES.length) cannotCount(`${DIST_A} に面が1つも無い`);

/**
 * 面 → [{i, j, a, b}]。焼いた字が A と B で違ったところ。
 *
 * **B の側の番号（`j`）も持つ。** 画面が B の姿に組み替わる面があるので
 * （`/next` は企画が「これから」から「もう行ってきた」へ移って、札が1枚
 * 増え、主役の札がまるごと消える）、A の並びだけを足がかりにすると
 * 位置が取れずに 2 で落ちる。そのときは B の並びで引き直す。
 */
const cand = new Map();
let read = 0;
let nCand = 0;
for (const p of PAGES) {
  const a = baked(DIST_A, p);
  const b = baked(DIST_B, p);
  if (!a || !b) continue;
  read++;
  if (a.length !== b.length) {
    // 字の数が変わる面もある（「いまここ」が出たり消えたり）。位置を合わせて拾う
    const m = align(a, b);
    const hits = [];
    for (const [i, j] of m) if (a[i] !== b[j]) hits.push({ i, j, a: a[i], b: b[j] });
    if (hits.length) { cand.set(p, hits); nCand += hits.length; }
    continue;
  }
  const hits = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) hits.push({ i, j: i, a: a[i], b: b[i] });
  if (hits.length) { cand.set(p, hits); nCand += hits.length; }
}
console.log(`\n見た面 ${read} / ${PAGES.length}（sitemap ${sm.locs}件・検索に出さない面 ${sm.noindex.length}）`);
/* **片方にしか無い面は、黙って飛ばさない。** 飛ばしたぶんは「日で変わる字が
   無かった」に化ける（`docs/island-standards.md` §15）。 */
if (read < PAGES.length)
  cannotCount(`${PAGES.length - read}面が片方の書き出しに無い（2つの書き出しが別のものを焼いている）`);
console.log(`焼き込まれた日付の字 ${nCand}か所 / ${cand.size}面`);
if (!nCand)
  cannotCount("日で変わる字が1つも見つからなかった（同じ書き出しを2つ渡している・歩き方が壊れている）");
for (const [p, hits] of cand)
  for (const h of hits) console.log(`  ${p}  「${h.a}」→「${h.b}」`);

// ---------------------------------------------------------------- 2. A を、2つの時計で開く

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

/** その面に出ている字の並び。**script と style は読まない。** */
const readTokens = (pg) => pg.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const o = [];
  let n;
  while ((n = w.nextNode())) {
    if (n.parentElement && /SCRIPT|STYLE/.test(n.parentElement.tagName)) continue;
    const s = n.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (s) o.push(s);
  }
  return o;
});

/** 落ち着くまで見る回数と、1回ぶんの間（ミリ秒） */
const TRIES = 30;
const STEP = 400;

/**
 * **決まった秒数を待たない。** 候補のところの字が落ち着くまで待つ。
 *
 * ここを `waitForTimeout(2000)` にしていたら、混んでいるこの箱で
 * **6か所が「焼いたまま」**と出た（実測。3000 にすると 0か所）。
 * **待ち時間で合否が変わる見張りは、CI で毎回ちがう色を出す。**
 * 数え直しが走ったかどうかを字そのもので見て、2回続けて同じ答えが
 * 出たら落ち着いたとみなす。
 *
 * 落ち着かないまま上限に当たった面は、**合格にも不合格にもしない**
 * （`docs/island-standards.md` §15。測れていないものを 0件に混ぜない）。
 */
async function settle(pg, page) {
  const want = (cand.get(page) || []).map((h) => h.i);
  const a = baked(DIST_A, page);
  let prev = null;
  for (let t = 0; t < TRIES; t++) {
    const r = await readTokens(pg);
    const m = align(a, r);
    const now = want.map((i) => (m.has(i) ? r[m.get(i)] : "\u0000")).join("\u0001");
    if (prev !== null && prev === now && t >= 3) return r;
    prev = now;
    await pg.waitForTimeout(STEP);
  }
  return null;
}

/** @returns {Map<string, string[]>} 面 → 画面に出た字の並び */
async function renderAll(iso) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  await offline(ctx);
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  if (iso) await ctx.addInitScript(clock(iso));
  const p = await ctx.newPage();
  const out = new Map();
  for (const page of cand.keys()) {
    const f = page === "/" ? "index.html" : `${page.slice(1)}.html`;
    const res = await p.goto(`${BASE}/${f}`, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) {
      await ctx.close();
      cannotCount(`${BASE}/${f} が ${res?.status()} で返った（配っている置き場が違う）`);
    }
    /* **束ねた JS が届いてから**数える。配る口が1本ずつしか返さないと、
       `domcontentloaded` の時点では島の JS がまだ降りてきていない。 */
    await p.waitForLoadState("load").catch(() => {});
    const r = await settle(p, page);
    if (!r) {
      await ctx.close();
      cannotCount(`${page} の字が ${(TRIES * STEP) / 1000}秒たっても落ち着かなかった（数え直しの途中で測っている）`);
    }
    out.set(page, r);
  }
  await ctx.close();
  return out;
}

/* **対照が先。** A の日の時計で開いて、候補が全部 A の字で出ることを見る。
   出なければ時計が刺さっていないか位置合わせが外れているので、
   本物の数字を1つも出さずに 2 で落ちる（`docs/island-standards.md` §15）。 */
const ctrl = await renderAll(atA.at);
const ctrlBad = [];
let ctrlSeen = 0;
for (const [p, hits] of cand) {
  const a = baked(DIST_A, p);
  const m = align(a, ctrl.get(p) || []);
  for (const h of hits) {
    const j = m.get(h.i);
    const got = j == null ? null : ctrl.get(p)[j];
    ctrlSeen++;
    if (got !== h.a) ctrlBad.push(`${p} [${h.i}] A の時計なのに「${got}」（焼いた字は「${h.a}」）`);
  }
}
console.log(`\n■ 対照（A を A の日の時計で開く）: ${ctrlSeen}か所中 ${ctrlSeen - ctrlBad.length}か所が焼いた字どおり`);
for (const s of ctrlBad) console.log(`  × ${s}`);
if (ctrlBad.length)
  cannotCount(`対照が ${ctrlBad.length}か所で外れた（時計が刺さっていない・位置合わせが外れている）`);

/* 本番。**B の日の時計で開く。** */
const live = await renderAll(BREAK === "noclock" ? null : atB.at);
const frozen = [];
const lost = [];
let ok = 0;
console.log(`\n■ B の日（${atB.at.slice(0, 10)}）の時計で開く`);
for (const [p, hits] of cand) {
  const a = baked(DIST_A, p);
  const r = live.get(p) || [];
  const m = align(a, r);
  /* **A の並びで取れなければ、B の並びで引き直す。** 画面が B の姿に
     組み替わった面（`cand` の注の `/next`）では、A を足がかりにすると
     主役の札ぶんだけずれて位置が取れない。ここで諦めると、
     **数え直していたものが「測れなかった」になって 2 で落ちる。**
     対照（`BREAK=noclock`）は A の姿のまま出るので A の並びで取れて、
     焼いたままとして 1 で落ちる——**この逃がし口は対照を甘くしない。** */
  const mb = align(baked(DIST_B, p) || [], r);
  for (const h of hits) {
    const j = m.get(h.i);
    const jb = mb.get(h.j);
    const got = j != null ? r[j] : jb != null ? r[jb] : null;
    if (got === h.b) { ok++; console.log(`  ○ ${p}  「${h.a}」→「${got}」`); }
    else if (got === h.a) { frozen.push(`${p}  「${h.a}」のまま（この日は「${h.b}」）`); console.log(`  × ${p}  「${h.a}」のまま（この日は「${h.b}」）`); }
    else { lost.push(`${p} [${h.i}] 位置が取れなかった（画面は「${got}」）`); console.log(`  ? ${p} [${h.i}] 位置が取れなかった（画面は「${got}」）`); }
  }
}

await b.close();

console.log(`\n焼き込まれた日付の字 ${nCand}か所 — 数え直していた ${ok} / 焼いたまま ${frozen.length} / 位置が取れず ${lost.length}`);
if (lost.length) cannotCount(`${lost.length}か所で位置が取れなかった（測れていないものを「焼いたまま 0件」に混ぜない）`);
if (frozen.length) {
  console.error(`\n× 焼いたままの字が ${frozen.length}か所`);
  for (const s of frozen) console.error(`  ${s}`);
  console.error("  直しかた: 字ではなく「何から数えるか」を渡して、画面が出てから数え直す");
  console.error("  （`site/components/atlas/Days.tsx` / `site/components/isle/ChapDays.tsx`）");
  process.exit(1);
}
console.log("○ 焼いた日付の字は、ぜんぶ画面が出てから数え直していました");
