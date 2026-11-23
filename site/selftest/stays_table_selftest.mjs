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
 * 滞在の表の写しで、**いまの行（終わりの空いた行）を着く日で閉じて、架空の国の行を1行だけ**足す
 * （ほかのファイルは触らない。国を移った日に人がやることと同じ。`content/stays.ts` の頭）。
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
 *  8. **旅と滞在の不変条件（M-10〜M-12）**が本物の表で通り（`tripProblems` が空）、壊した表では外れたと言う
 *     （本線の旅に隙間・枝の旅が親からはみ出す・滞在が重なる・滞在がどの旅にも入らない）。
 *     **重なった行を足した表は、読み込んだときに書き出しが止まる**（前のイラン国境の行の形）
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
import { arraySpan, codeOnly, fields, objectSpans } from "../../tools/sprites/tsread.mjs";

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
/* 字は `tools/sprites/tsread.mjs` で読む（自前の正規表現を生やさない。`tsread_selftest.mjs` の 4）。
   `codeOnly` は長さを変えないので、そこで測った位置は元の字にそのまま当たる */
const CODE = codeOnly(STAYS_SRC);
const [OPEN_AT, CLOSE_AT] = arraySpan(CODE, "STAYS");
if (OPEN_AT < 0) stop("content/stays.ts に STAYS の並びが見つからない");
/** 行ごとの在りか（元の字の位置）と欄 */
const ROWS = objectSpans(CODE.slice(OPEN_AT + 1, CLOSE_AT)).map(([a, b]) => ({
  at: OPEN_AT + 1 + a,
  end: OPEN_AT + 1 + b + 1,
  f: fields(CODE.slice(OPEN_AT + 2 + a, OPEN_AT + 1 + b)),
}));

/** いまの最後の行の着いた日 */
const lastFrom = ROWS.map((r) => r.f.from).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "")).sort().at(-1);
if (!lastFrom) stop("content/stays.ts から着いた日が1つも読めない");
const nextDay = (d, n = 1) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const jstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const ON = [nextDay(lastFrom), jstToday].sort().at(-1);

/** いまの行（終わりの空いた行）。足す行の着く日で閉じる——開いたまま足すと M-12（重なり）で止まる */
const openRow = ROWS.find((r) => r.f.to === "");
if (!openRow) stop("content/stays.ts に終わりの空いた行が無い（足す前に閉じる行が見つからない）");
const openSrc = STAYS_SRC.slice(openRow.at, openRow.end);
/* 行の場所と「終わりが空」は tsread が読んだもの（`openRow`）。ここは字を1か所差し替えるだけなので、
   正規表現で表を読まない（`tools/sprites/tsread_selftest.mjs` の 4 が数える） */
const closedSrc = openSrc.replace('to: ""', `to: "${ON}"`);
if (closedSrc === openSrc) stop("終わりの空いた行の `to: \"\"` に当たらない（閉じる仕込みを直す）");
const FAKE = "zz-island";
const FAKE_HREF = "/travel/zz-island";
/** 足す1行。**ほかのファイルは触らない** */
const ROW =
  `  { country: "${FAKE}", name: "架空の国", cities: [], from: "${ON}", to: "",\n` +
  `    guide: { name: "架空の国・みやこ", href: "${FAKE_HREF}", lead: "確かめのための国", icon: "mountain" } },`;
/** 表の終わりの `]` の前に行を足す（いまの行を閉じた写しの上で） */
const CLOSED = STAYS_SRC.slice(0, openRow.at) + closedSrc + STAYS_SRC.slice(openRow.end);
const SHIFT = closedSrc.length - openSrc.length;
const WITH_ROW = CLOSED.slice(0, CLOSE_AT + SHIFT) + ROW + "\n" + CLOSED.slice(CLOSE_AT + SHIFT);

/** アルメニアの滞在の中に、別の国の行を重ねた表（前のイラン国境の行と同じ形）。読み込んだときに M-12 で止まるはず */
const OVERLAP_ROW = `  { country: "georgia", cities: [], from: "2026-04-29", to: "2026-05-08" },`;
const WITH_OVERLAP = STAYS_SRC.slice(0, CLOSE_AT) + OVERLAP_ROW + "\n" + STAYS_SRC.slice(CLOSE_AT);

/** 記録のある国（ブルガリア）の行を抜いた表。国の表が読み込んだときに止まるはず */
const bg = ROWS.find((r) => r.f.country === "bulgaria");
if (!bg) stop("content/stays.ts に bulgaria の行が見つからない（対照の仕込みを直す）");
const WITHOUT_BG = STAYS_SRC.slice(0, bg.at) + STAYS_SRC.slice(bg.end).replace(/^,/, "");

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
const lap = build("lap", WITH_OVERLAP);

try {
  const B = load(base);
  const F = load(fake);
  const N = load(nobg);
  const L = load(lap);
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

  // ---- 8. 旅と滞在の不変条件（M-10〜M-12） ----
  {
    const { tripProblems } = B.stayChapters;
    const CH = B.chapters.CHAPTERS;
    const ST = req(join(base.out, "content", "stays.js")).STAYS;
    const today = jstToday;
    const real = tripProblems(CH, ST, today);
    check("8. 本物の表で、旅と滞在の不変条件が通る", real.length === 0, real.join(" / "));
    const fakeSt = req(join(fake.out, "content", "stays.js")).STAYS;
    const fk = tripProblems(CH, fakeSt, today);
    check("8. 国を移った写し（いまの行を閉じて1行足す）でも通る", fk.length === 0, fk.join(" / "));
    /** 壊した表を当てて、その条の名前で外れたと言うか */
    const breaks = [
      ["M-10", "本線の旅のあいだに1日の隙間", CH.map((c) => (c.slug === "middle-east" ? { ...c, from: nextDay(c.from) } : c)), ST],
      ["M-10", "本線の最後の旅が閉じて、今日までが空く", CH.map((c) => (!c.branchOf && !c.to && c.from ? { ...c, to: nextDay(today, -3) } : c)), ST],
      ["M-11", "枝の旅が親の旅からはみ出す", CH.map((c) => (c.branchOf ? { ...c, to: "2026-09-30" } : c)), ST],
      ["M-12", "滞在が重なる（アルメニアの中に別の行）", CH, [...ST, { country: "georgia", cities: [], from: "2026-04-29", to: "2026-05-08" }]],
      ["M-12", "滞在がどの本線の旅にも入らない（最初の旅より前）", CH, [...ST, { country: "france", cities: [], from: "2024-10-01", to: "2024-10-05" }]],
    ];
    for (const [rule, label, ch, st] of breaks) {
      const got = tripProblems(ch, st, today);
      check(`8. 対照: ${label} → ${rule} で外れる`, got.some((x) => x.startsWith(`${rule}:`)), got.join(" / ") || "何も言わない");
    }
    check("8. 対照: 重なった行を足した表は、読み込んだときに止まる（書き出しが止まる）",
      !!L.error && /M-12/.test(L.error), L.error ?? "止まらなかった");
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
