/**
 * **表紙の「これから」を、時計を進めて撮る。**［いまここ］が日付で消えず、着いた日に入れ替わるか。
 *
 *   tools/build.sh 3150
 *   python3 -m http.server 4150 --directory site/.next-3150 &
 *   SPORT=4150 OUT=/tmp/upnext DIST=site/.next-3150 node tools/sprites/upnext.mjs
 *
 * 終了コード 0=通った / 1=見つかった / 2=数えるものが無い。
 *
 * ## なぜ要るか（#1276）
 *
 * 表紙の「これから」は、国を移る日を企画の行として出していた。着いたあとも題が「〜へ移動」、
 * 印が「進行中」で、下に「企画を、ぜんぶ見る」。あやと（2026-11-18）:「ソフィアに**いる**、は欲しい。
 * **へ移動**は変。移動はもうしちゃってる」。いまは滞在の表（`site/content/stays.ts`）から引く。
 *
 * 滞在の［いまここ］は**日付では消えない**（`docs/spec/model.md` M-22）。静的書き出しなので、
 * どの国かは画面が出てから今日で選び直している——**焼いた日の字のままになっていないか**は、
 * 時計を進めて開かないと分からない。
 *
 * ## 何を見るか
 *
 * 2つの表で開く。日は表から出す（**日を焼かない**。焼くと、つぎの国を足した日に対照が片側へ寄る）。
 *
 * - **本物の表**: 今日／いちばん新しい行の着く前日／着いた日／翌日／30日後（つぎの行が無い日）
 * - **つぎの行を足した表**（書き出しの JS に、今日の10日後に着く行を1つ書き足して配る）:
 *   今日（［つぎ］が出る）／着く前日／当日／翌日／30日後
 *
 * どの日も、スマホ 390 と PC 1280 で。
 *
 *  1. **［いまここ］がどの日にも在る**（0件にならない）
 *  2. ［いまここ］の国が、その日に居るはずの国（表の「着いた日が今日以前で、いちばん新しい行」）
 *  3. ［つぎ］は、着く前の日まで在り、着いた日から無い
 *  4. 段の字に「へ移動」「進行中」「企画を、ぜんぶ見る」が無い。**焼いた `index.html` にも無い**
 *  5. 横にあふれていない（段の幅が画面の幅を超えない）
 *
 * 撮った絵は `OUT` に置く（`<日>-<表>-<幅>.png`）。**数が通っても、目で見る。**
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { offline } from "./route.mjs";
import { fromRoot, repoPath } from "./repo.mjs";
import { must, readArray } from "./tsread.mjs";

const SPORT = process.env.SPORT || "4150";
const BASE = `http://127.0.0.1:${SPORT}`;
const OUT = process.env.OUT || "/tmp/upnext";
const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** 言わない字（あやと 2026-11-18。`site/selftest/leadplan_selftest.mjs` の 7 と同じ3つ） */
const BANNED = ["へ移動", "進行中", "企画を、ぜんぶ見る"];

const STAYS = must(
  readArray(readFileSync(repoPath("site/content/stays.ts"), "utf8"), "STAYS", {
    keys: ["country", "from", "to"],
    idKey: "country",
  }),
  "site/content/stays.ts の STAYS",
);
if (STAYS.length < 2) {
  console.error("滞在の表から2行も読めませんでした");
  process.exit(2);
}

const plus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const LAST = [...STAYS].sort((a, b) => a.from.localeCompare(b.from)).at(-1);

/** 足す行。**国の記録を持たない国**の形（`name` を持つ）。案内の面は持たせない（押せない札の形も撮る） */
const ADD = { country: "upnext-tsugi", name: "つぎの国", from: plus(TODAY > LAST.from ? TODAY : LAST.from, 10) };

/** その日に居るはずの国（`lib/leadPlan.ts` の `stayHere` と同じ決めを、表から直に読む） */
function hereOn(rows, day) {
  const came = rows.filter((s) => s.from <= day);
  const open = came.filter((s) => !s.to || day <= s.to);
  const pick = (xs) => xs.reduce((a, s) => (!a || s.from >= a.from ? s : a), undefined);
  return (pick(open) ?? pick(came))?.country;
}
const nextOn = (rows, day) =>
  rows.filter((s) => s.from > day).reduce((a, s) => (!a || s.from < a.from ? s : a), undefined)?.country;

const withAdd = STAYS.map((s) => (s === LAST ? { ...s, to: ADD.from } : s)).concat([{ ...ADD, to: "" }]);
const PLANS = [
  { table: "real", rows: STAYS, days: [TODAY, plus(LAST.from, -1), LAST.from, plus(LAST.from, 1), plus(TODAY, 30)] },
  { table: "add", rows: withAdd, days: [TODAY, plus(ADD.from, -1), ADD.from, plus(ADD.from, 1), plus(ADD.from, 30)] },
];
const WIDTHS = [
  { w: 390, h: 844, mobile: true },
  { w: 1280, h: 900, mobile: false },
];

/** 時計を止める。`Date` だけ差し替えれば島の日付はぜんぶこれを見る（`nextempty.mjs` と同じ） */
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

/** 書き足せた回数。0 のまま終わったら、足した表は見ていない */
let addHits = 0;

/**
 * 書き出しの JS の滞在の表に、1行足して配る。**いちばん新しい行の前に差し込み、その行の `to` を入れる**
 * （国を移ると決まった日にあやとが書く形。M-13: 終わりの空いた行は1つ）。
 * 探す字は表から読んだ値そのもの——行の形が変わって見つからなければ、2 で止める。
 */
async function addRow(ctx) {
  const head = `{country:${JSON.stringify(LAST.country)},`;
  const tail = `from:${JSON.stringify(LAST.from)},to:""`;
  const row = `{country:${JSON.stringify(ADD.country)},name:${JSON.stringify(ADD.name)},cities:[],from:${JSON.stringify(ADD.from)},to:""},`;
  await ctx.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    let body = await res.text();
    if (body.includes(head) && body.includes(tail)) {
      body = body.split(tail).join(`from:${JSON.stringify(LAST.from)},to:${JSON.stringify(ADD.from)}`);
      body = body.split(head).join(row + head);
      addHits++;
    }
    await r.fulfill({ response: res, body });
  });
}

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const bad = [];
const seen = [];
let read = 0;
let want = 0;

for (const plan of PLANS) {
  for (const day of plan.days) {
    for (const v of WIDTHS) {
      want++;
      const ctx = await b.newContext({
        viewport: { width: v.w, height: v.h },
        deviceScaleFactor: 2,
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
        isMobile: v.mobile,
        hasTouch: v.mobile,
      });
      await offline(ctx);
      await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await ctx.addInitScript(clock(`${day}T11:00:00+09:00`));
      if (plan.table === "add") await addRow(ctx);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
      const res = await p.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
      if (!res || res.status() >= 400) {
        console.error(`× ${day} /index.html が ${res?.status()}`);
        await ctx.close();
        continue;
      }
      await p.waitForTimeout(1800);
      const got = await p.evaluate(() => {
        const sec = document.querySelector('.hchap[data-chap="next"]');
        const up = document.querySelector(".nextup");
        const of = (role) => document.querySelector(`.nextup-stay[data-role="${role}"]`);
        return {
          text: (sec?.innerText ?? "").replace(/\s+/g, " "),
          here: of("here")?.getAttribute("data-stay") ?? null,
          hereText: (of("here")?.innerText ?? "").replace(/\s+/g, " "),
          next: of("next")?.getAttribute("data-stay") ?? null,
          nextText: (of("next")?.innerText ?? "").replace(/\s+/g, " "),
          overflow: up ? Math.ceil(up.getBoundingClientRect().right) - document.documentElement.clientWidth : null,
        };
      });
      read++;
      const tag = `${day} ${plan.table} ${v.w}`;
      const wantHere = hereOn(plan.rows, day);
      const wantNext = nextOn(plan.rows, day) ?? null;
      const say = BANNED.filter((w) => got.text.includes(w));
      const line = `［いまここ］${got.hereText || "（無し）"}${got.next ? ` ／［つぎ］${got.nextText}` : ""}`;
      const ok = got.here && got.here === wantHere && got.next === wantNext && !say.length && (got.overflow ?? 1) <= 0;
      console.log(`  ${ok ? "○" : "×"} ${tag.padEnd(22)} ${line}`);
      /* 段の字を1字も読めていなければ、4 は何も見ていない（器の名前が変わった日に黙る） */
      if (!got.text) bad.push(`${tag}: 「これから」の章（.hchap[data-chap="next"]）の字を読めない`);
      if (!got.here) bad.push(`${tag}: ［いまここ］が無い`);
      else if (got.here !== wantHere) bad.push(`${tag}: ［いまここ］が ${got.here}（居るはずは ${wantHere}）`);
      if (got.next !== wantNext) bad.push(`${tag}: ［つぎ］が ${got.next ?? "無し"}（あるはずは ${wantNext ?? "無し"}）`);
      for (const w of say) bad.push(`${tag}: 「${w}」が出ている`);
      if (got.overflow === null) bad.push(`${tag}: 「これから」の段（.nextup）が無い`);
      else if (got.overflow > 0) bad.push(`${tag}: 段が ${got.overflow}px 横にあふれている`);
      /* 足した表は、書き出しの最初の描画（焼いた表）と食い違うので、水あわせの文句が出る。そこは数えない */
      if (plan.table === "real" && errs.length) bad.push(`${tag}: JS のエラー ${errs[0]}`);
      seen.push({ day, table: plan.table, width: v.w, ...got });
      const el = await p.$('.hchap[data-chap="next"]');
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await el.screenshot({ path: `${OUT}/${day}-${plan.table}-${v.w}.png` });
      }
      await ctx.close();
    }
  }
}
await b.close();

/* 4 の後ろ半分: 焼いた HTML。**画面が出る前に配られる字**なので、ここに残ると直していないのと同じ */
let html = "";
for (const f of [join(DIST, "server", "app", "index.html"), join(DIST, "index.html")]) {
  try {
    html = readFileSync(f, "utf8");
    break;
  } catch {
    /* つぎの置き場を見る */
  }
}
if (!html) {
  console.error(`焼いた index.html を ${DIST} から読めません（DIST を渡してください）`);
  process.exit(2);
}
const sec = html.match(/<section class="nextup"[\s\S]*?<\/section>/)?.[0] ?? "";
const bakedSay = BANNED.filter((w) => sec.includes(w));
console.log(`\n■ 焼いた index.html の「これから」の段: ${sec.length}字、言わない字 ${bakedSay.length}件`);
if (!sec) bad.push("焼いた index.html に「これから」の段（section.nextup）が無い");
for (const w of bakedSay) bad.push(`焼いた index.html の段に「${w}」が在る`);

console.log(`\n開いた ${read} / ${want}（${PLANS.map((x) => `${x.table} ${x.days.length}日`).join("・")} × 幅${WIDTHS.length}）`);
writeFileSync(`${OUT}/seen.json`, JSON.stringify(seen, null, 2));
if (read < want) {
  console.error("開けなかった日があります。数える前に止めます");
  process.exit(2);
}
if (!addHits) {
  console.error(`書き出しの JS に {country:"${LAST.country}", … from:"${LAST.from}",to:""} が見つからず、行を足せませんでした`);
  process.exit(2);
}
/* 対照: 足した表で［つぎ］が1度も出ていなければ、3 は何も見ていない */
if (!seen.some((x) => x.table === "add" && x.next)) {
  console.error("足した表で［つぎ］が1度も出ていません（3 を見ていない）");
  process.exit(2);
}
console.log(`撮ったもの: ${OUT}`);
console.log(bad.length ? `\n${bad.map((s) => "  × " + s).join("\n")}` : "\n（見つかりませんでした）");
process.exit(bad.length ? 1 : 0);
