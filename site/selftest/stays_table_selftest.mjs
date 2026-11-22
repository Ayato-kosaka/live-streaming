/**
 * **国を移るのは、滞在の表（`content/stays.ts`）に1行足すだけで済むか**（#1275）。
 *
 *     node site/selftest/stays_table_selftest.mjs
 *
 * 終了コード 0=通った / 1=落ちた / 2=数えるものが無い（組み立てられない）。
 *
 * ## なぜ要るか
 *
 * 前は「いつどの国に居たか」を5か所に手で書いていて、国を1つ越えるたびに3〜6か所を
 * 直していた（#664）。表を1つにしても、**どこかの面がまた自分で日付や国を持ちはじめたら**、
 * 1行足しても動かない面が出る。文で「ここだけ直せばいい」と書いても、セッションが変わると
 * 守られないので、**実際に1行足して、動くべきものが動くか**を数える。
 *
 * ## 見ているもの
 *
 * 滞在の表の写しに、**架空の国の行を1行だけ**足す（ほかのファイルは触らない）。
 * 着く日はいまの最後の行の翌日か今日の遅いほう。案内の面も付ける。その写しで:
 *
 *  1. **型が通る**（`tsc`。本物の表で出る文句より増えない・表の写しに文句が出ない）
 *  2. **歩いた国の数**（`countriesWalked`）が、着いた日から1つ増える。前の日は増えない
 *  3. **章の国**（`chapterCountries`）に、その章で入る
 *  4. **案内の出し分け**（`guideOf`）が、着いた日からその国の面になる。前の日は前の国のまま
 *  5. **これから歩く国**（`AHEAD_COUNTRIES`）と、国に入った日（`ENTERED`）に入る
 *  6. **毎晩の焼き直し**（`python/stays.py` の `chapter_stays()`）が、その国の滞在を出す
 *  7. 章で回った国の引きかたが、**TS（`content/stayChapters.ts` の `chapterCountrySlugs`）と Python（`stays.chapter_countries`）で
 *     同じ答え**（本物の表と写しの両方で）
 *
 * ## 対照（落ちることを見る）
 *
 *  - **行を抜いた表**（＝本物の表）で 2〜6 を当てると、どれも落ちる。落ちなければ、
 *    その判定は1行に反応していない（何も見ていない）
 *  - **国の記録のある国の行を抜く**と、国の表（`content/countries.ts`）が読み込んだときに止まる
 *  - **`BREAK=walked`** で、歩いた国の数を表から引かずに数える写し（`content/walked.ts` の
 *    `walkingCountries` を空にする）にすると、2 と 3 が落ちる
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");
const TSC = join(SITE, "node_modules", ".bin", "tsc");
const BREAK = process.env.BREAK || "";

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}
function stop(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

// ------------------------------------------------------------------ 写しの表

const STAYS_SRC = readFileSync(join(SITE, "content", "stays.ts"), "utf8");
const closeAt = STAYS_SRC.lastIndexOf("\n];");
if (closeAt < 0) stop("content/stays.ts の STAYS の終わり（`\\n];`）が見つからない");

/** いまの最後の行の着いた日。**字で拾うのは日付だけ**（行の形は組み立てたものから読む） */
const lastFrom = [...STAYS_SRC.matchAll(/\bfrom: "(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]).sort().at(-1);
if (!lastFrom) stop("content/stays.ts から着いた日が1つも読めない");
const nextDay = (d, n = 1) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const jstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const ON = [nextDay(lastFrom), jstToday].sort().at(-1);

const FAKE = "zz-island";
const FAKE_HREF = "/travel/zz-island";
/** 足す1行。**ほかのファイルは触らない** */
const ROW =
  `  { country: "${FAKE}", name: "架空の国", cities: [], from: "${ON}", to: "",\n` +
  `    guide: { name: "架空の国・みやこ", href: "${FAKE_HREF}", lead: "確かめのための国", icon: "mountain" } },`;
const WITH_ROW = STAYS_SRC.slice(0, closeAt) + "\n" + ROW + STAYS_SRC.slice(closeAt);

/** 記録のある国（ブルガリア）の行を抜いた表。国の表が読み込んだときに止まるはず */
const bg = /\n  \{\n    country: "bulgaria",[\s\S]*?\n  \},/.exec(STAYS_SRC);
if (!bg) stop("content/stays.ts に bulgaria の行が見つからない（対照の仕込みを直す）");
const WITHOUT_BG = STAYS_SRC.replace(bg[0], "");

// ------------------------------------------------------------------ 組み立て

const OUTS = [];
/**
 * `site` の写しを作って、表だけ差し替えて組み立てる。**型の文句の行**と、組み立てた置き場を返す。
 * 写しは `content` `lib` `components` だけ（面は要らない）。`node_modules` は本物へ繋ぐ。
 */
function build(label, staysSrc, { walkedBreak = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), `staystable-${label}-`));
  OUTS.push(work);
  for (const d of ["content", "lib", "components"]) cpSync(join(SITE, d), join(work, d), { recursive: true });
  symlinkSync(join(SITE, "node_modules"), join(work, "node_modules"));
  writeFileSync(join(work, "content", "stays.ts"), staysSrc);
  if (walkedBreak) {
    const p = join(work, "content", "walked.ts");
    const src = readFileSync(p, "utf8");
    const broke = src.replace(/export function walkingCountries\(\): WalkingCountry\[\] \{/, "$&\n  return [];");
    if (broke === src) stop("BREAK=walked の仕込みが content/walked.ts に当たらない");
    writeFileSync(p, broke);
  }
  const out = join(work, "out");
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "ES2022"],
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: true,
        jsx: "react-jsx",
        noEmitOnError: false,
        outDir: out,
        rootDir: work,
        baseUrl: work,
        paths: { "@/*": ["./*"] },
      },
      files: ["content/walked.ts", "components/isle/spec.ts", "lib/stay.ts", "content/place.ts"].map((f) => join(work, f)),
    }),
  );
  let errs = [];
  try {
    execFileSync(TSC, ["-p", join(work, "tsconfig.json")], { stdio: "pipe" });
  } catch (e) {
    errs = String(e.stdout || "")
      .split("\n")
      .filter((l) => /error TS\d+/.test(l))
      .map((l) => l.replace(work + sep, "").replace(work, ""));
  }
  return { work, out, errs };
}

/** 組み立てたものを読む。`@/…` は**その写しの中**へ向ける（写しが2つあっても混ざらない） */
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const home = OUTS.map((w) => join(w, "out")).find((o) => parent?.filename?.startsWith(o + sep));
    if (home) return orig.call(this, join(home, request.slice(2)), parent, ...rest);
  }
  return orig.call(this, request, parent, ...rest);
};
const req = createRequire(import.meta.url);
function load(b) {
  try {
    return {
      countries: req(join(b.out, "content", "countries.js")),
      chapters: req(join(b.out, "content", "chapters.js")),
      stayChapters: req(join(b.out, "content", "stayChapters.js")),
      walked: req(join(b.out, "content", "walked.js")),
      spec: req(join(b.out, "components", "isle", "spec.js")),
    };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

/** Python の側（`python/stays.py`）。写しの表を読ませて、焼き直しの滞在と章の国を返す */
function python(work) {
  const code = `
import json, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(join(REPO, "python"))})
import stays, ts_read
w = Path(${JSON.stringify(work)}) / "content"
stays.STAYS_TS = w / "stays.ts"
stays.COUNTRIES_TS = w / "countries.ts"
stays.CHAPTERS_TS = w / "chapters.ts"
done = stays.read_countries()
last = max((s["to"] for c in done for s in c["stays"] if s["to"]), default="")
ahead = stays.chapter_stays(stays.read_chapters_ts(), stays.read_ahead(), after=last, today=${JSON.stringify(ON)})
print(json.dumps({
  "ahead": ahead,
  "chapters": stays.chapter_countries(stays.read_chapters_ts(), stays.read_stays_ts()),
}, ensure_ascii=False))
`;
  try {
    return JSON.parse(execFileSync("python3", ["-c", code], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }));
  } catch (e) {
    return { error: String(e?.stderr || e?.message || e).slice(-400) };
  }
}

const base = build("base", STAYS_SRC, { walkedBreak: BREAK === "walked" });
const fake = build("fake", WITH_ROW, { walkedBreak: BREAK === "walked" });
const nobg = build("nobg", WITHOUT_BG);

try {
  const B = load(base);
  const F = load(fake);
  const N = load(nobg);
  if (B.error) stop(`本物の表で組み立てたものが読めない: ${B.error}`);
  if (F.error) stop(`1行足した表で組み立てたものが読めない: ${F.error}`);
  console.log(`# 足した行: ${FAKE}（${ON} 着、いまの最後の行は ${lastFrom} 着）`);

  // ---- 1. 型 ----
  const newErrs = fake.errs.filter((l) => !base.errs.includes(l));
  check(
    `1行足しても型が通る（本物の表の文句 ${base.errs.length}件 → 写し ${fake.errs.length}件）`,
    newErrs.length === 0 && !fake.errs.some((l) => l.includes("content/stays.ts")),
    newErrs.slice(0, 3).join(" / "),
  );

  /** その日の旅の土地の昼（`tripDate` が中央ヨーロッパの暦なので、日を跨がない時刻で引く） */
  const at = (d) => new Date(`${d}T12:00:00+02:00`);
  const before = nextDay(ON, -1);
  const balkans = (m) => m.chapters.CHAPTERS.find((c) => c.slug === m.chapters.chapterNow(at(ON)).slug);

  /** 2〜6 を、ある組み立てに当てる。**本物の表に当てると全部落ちる**のが対照 */
  const legs = (m) => {
    const ch = balkans(m);
    return {
      walked: m.walked.countriesWalked(at(ON)) === B.walked.countriesWalked(at(ON)) + 1,
      walkedBefore: m.walked.countriesWalked(at(before)) === B.walked.countriesWalked(at(before)),
      chapter: m.walked.chapterCountries(ch, at(ON)).some((k) => k.slug === FAKE),
      guide: m.spec.guideOf(ch.slug, at(ON))?.href === FAKE_HREF,
      guideBefore: m.spec.guideOf(ch.slug, at(before))?.href === B.spec.guideOf(ch.slug, at(before))?.href,
      ahead: m.countries.AHEAD_COUNTRIES.some((a) => a.slug === FAKE && a.entered === ON),
      entered: m.spec.ENTERED.some((e) => e.slug === FAKE && e.on === ON),
    };
  };
  const got = legs(F);
  check(`2. 歩いた国の数が、着いた日（${ON}）から1つ増える`, got.walked,
    `${B.walked.countriesWalked(at(ON))} → ${F.walked.countriesWalked(at(ON))}`);
  check("2. 着く前の日は増えない", got.walkedBefore);
  check("3. 章の国（chapterCountries）に入る", got.chapter);
  check("4. 案内の出し分けが、着いた日からその国の面になる", got.guide, F.spec.guideOf(balkans(F).slug, at(ON))?.href ?? "案内なし");
  check("4. 着く前の日は、前の国の案内のまま", got.guideBefore);
  check("5. これから歩く国（AHEAD_COUNTRIES）に入る", got.ahead);
  check("5. 国に入った日（ENTERED）に入る", got.entered);

  // ---- 6. 毎晩の焼き直し ----
  const pf = python(fake.work);
  const pb = python(base.work);
  if (pf.error || pb.error) stop(`python/stays.py を回せない: ${pf.error || pb.error}`);
  const fakeStay = pf.ahead.find((c) => c.slug === FAKE);
  check("6. 焼き直し（stays.py の chapter_stays）が、その国の滞在を出す",
    !!fakeStay && fakeStay.stays[0].from === ON, JSON.stringify(fakeStay ?? null));

  // ---- 7. TS と Python の章の国 ----
  for (const [label, m, p] of [["本物の表", B, pb], ["1行足した表", F, pf]]) {
    const ts = Object.fromEntries(m.chapters.CHAPTERS.map((c) => [c.slug, m.stayChapters.chapterCountrySlugs(c)]));
    check(`7. ${label}で、章の国が TS と Python で同じ`, JSON.stringify(ts) === JSON.stringify(p.chapters),
      `TS ${JSON.stringify(ts)} / Python ${JSON.stringify(p.chapters)}`);
  }

  // ---- 対照 ----
  const ctl = legs(B);
  const dead = Object.entries({ walked: ctl.walked, chapter: ctl.chapter, guide: ctl.guide, ahead: ctl.ahead, entered: ctl.entered })
    .filter(([, v]) => v)
    .map(([k]) => k);
  check("対照: 行を抜いた表（本物）では、2〜5 の「増える・入る」がどれも落ちる", dead.length === 0,
    `落ちなかった判定: ${dead.join(" ")}`);
  check("対照: 行を抜いた表（本物）では、焼き直しにその国が出ない", !pb.ahead.some((c) => c.slug === FAKE));
  check("対照: 記録のある国（bulgaria）の行を抜くと、国の表が読み込んだときに止まる",
    !!N.error && /bulgaria/.test(N.error), N.error ?? "止まらなかった");
} finally {
  for (const w of OUTS) rmSync(w, { recursive: true, force: true });
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
