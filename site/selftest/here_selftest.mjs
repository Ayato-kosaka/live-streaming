/**
 * 砂浜の「いま居る場所」の印が、**面の側に何も書かせずに付くか。**
 *
 *     node site/selftest/here_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い
 *
 * ## なぜ要るか
 *
 * 印を出す仕掛けは前からあった（`.ifoot-door.is-here`）。**渡す側が無かった。**
 * 2026-10-09 に数えたら、**軒の半分以上**（当時の数えで13軒中7軒）が
 * 自分の面で `current` を渡しておらず、砂浜で「いま自分がどこに居るか」が読めなかった（#718）。
 *
 * 面を1枚ずつ直しても、**次に面を建てた人がまた忘れる。** 島に建てるのは
 * `layout.ts` の1か所で済むのに、印は面の側が渡すものだったから。
 * だから**渡す口そのものを消した**——砂浜（`PlaceList`）と看板の帯
 * （`IslandNav`）が `usePathname()` を自分で読んで、`spotOfPath` に当てる。
 *
 * この見張りが見ているのは、その形が**戻っていないこと**と、
 * **道から軒が引けない面が増えていないこと**の2つ。
 *
 * | 静かに壊れる形 | 画面で起きること | ここが拾う |
 * | --- | --- | --- |
 * | 面がまた `current=` を渡しはじめる | 渡した面だけ合って、忘れた面は無印に戻る | 2 |
 * | `spotOfPath` が軒を引けなくなる | 島の面ぜんぶで印が消える（型も巡回も通る） | 1 |
 * | 軒の道の外に面を建てた | その枝だけ無印。誰も気づかない | 3 |
 * | 砂浜が道を読むのをやめた | 同上 | 4 |
 * | 印の見た目が消えた | `is-here` は付くが、見ために何も変わらない | 5 |
 *
 * **3 がこの見張りのいちばんの仕事。** 新しい枝（`/nordic` のような
 * 「中身は軒のものだが道の名前が違う面」）を建てた日に赤くなる。
 * 直し方は2つしかない——`layout.ts` の `under` にその枝を足して軒に属させるか、
 * 下の `OUTSIDE` に**島のどこの軒でもない理由**を書くか。どちらも1行。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 足は6本（軒を引く式・道の均し・いちばん長いものが勝つ・面を歩く・
 * 渡している面を見つける・但し書きと中身を見分ける）。**本物を1つも数える前に、1本ずつ折って落ちる
 * ことを見る。** 折れなければ、本物の数字を出さずに 2 で帰る。
 */
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(SITE, "app");
const TSC = join(SITE, "node_modules", ".bin", "tsc");

let OK = 0;
let BAD = 0;
const check = (name, ok, why = "") => {
  if (ok) {
    OK += 1;
    console.log(`  ok   ${name}`);
  } else {
    BAD += 1;
    console.log(`  NG   ${name}${why ? `  — ${why}` : ""}`);
  }
};
/** 数えるものが無い。**0 を答えとして出さない**（`docs/island-standards.md` §15）。 */
const nothing = (why) => {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
};

/* ===================================================================
   島のどこの軒でもない枝。**理由を書く。**

   「使っていないから」は理由にならない。書くのは「その面に立っている人は、
   島のどの軒にも入っていない」と言い切れる中身のほう。
   ここに無い枝が出たら赤くなる（それがこの見張りの本体）。
   =================================================================== */
const OUTSIDE = {
  "/": "島そのものと 404。軒の中ではなく、軒の建っている島の上に立っている",
  "/all": "行き先の索引。軒ではなく、軒ぜんぶを並べた道しるべ",
  "/atlas": "島の年表。章ごとの島をまたぐ面なので、どの軒にも属さない",
  "/cards": "あやと島カード。グッズの中から行けるが、島には建てていない（layout.ts の但し書き）",
  "/design": "デザインの見本。作る側が見る面で、島の軒ではない",
  "/island": "章ごとの島（過去のトップ）。軒ではなく、島そのものの写し",
  "/me": "じぶんのこと。島のどこかではなく、その人の手元",
  "/privacy": "プライバシーポリシー。島の外の決めごと",
  "/updates": "島をなおしたところ。軒ではなく、島そのものの移り変わり。島に建てず、帯も立てていない（`/all` の棚と掲示板の棚札からだけ行ける）",
};

/* ===================================================================
   足（判定の部品）。**対照が1本ずつ折れるように、全部ここで純粋な関数にする**
   =================================================================== */

/** `<タグ …>` の中身（属性のところ）を全部拾う。`{}` の深さを数えて止める。 */
export function tagProps(src, tag) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf(`<${tag}`, from);
    if (i < 0) return out;
    // `<PageShell` が `<PageShellFoo` の頭でないこと
    if (/[A-Za-z0-9_]/.test(src[i + tag.length + 1] ?? "")) {
      from = i + 1;
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let j = i; j < src.length; j += 1) {
      const c = src[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) return out;
    out.push(src.slice(i + tag.length + 1, end));
    from = end + 1;
  }
}

/**
 * 但し書きを落とす。
 *
 * **字が在るかどうかで見てはいけない。** 砂浜の `PlaceList.tsx` には
 * 「`spotOfPath` に当てる」と**但し書きに書いてある**ので、中身から呼び出しを
 * 消しても字は残る——そのまま数えたら、仕掛けを抜いた写しが緑で通った
 * （この見張りを書いた日に、対照で実際に素通りした）。
 */
export const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * その面が、砂浜（`.ifoot-doors`）を出しているか。
 *
 * **但し書きを落としてから渡すこと。** 古い書き方を注に残している面が
 * あると、字だけで数えて嘘の赤になる。
 */
export const hasBeach = (src) => /<(PageShell|IslandFooter)\b/.test(src);

/**
 * その面が、**いま居る場所を自分で名乗っている**か。名乗っていなければ空。
 *
 * 名乗らせないのがこの直しの本体なので、1つでも在れば落とす。
 */
export function handedHere(src) {
  const out = [];
  for (const tag of ["PageShell", "IslandFooter", "IslandHeader", "PlaceList"]) {
    for (const props of tagProps(src, tag)) {
      const m = props.match(/\b(current|atAll)\b/);
      if (m) out.push(`<${tag} … ${m[1]}`);
    }
  }
  return out;
}

/** `site/app` を歩いて、面の道を出す。`page.tsx` の在る所だけ。 */
export function routesIn(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // `(組)` のような並べ替えだけの段は道に出ない。いまは無いが、出ても通す
      const seg = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
      out.push(...routesIn(p, base + seg));
    } else if (name === "page.tsx") {
      out.push({ route: base || "/", file: p });
    } else if (name === "not-found.tsx" && base === "") {
      out.push({ route: "/", file: p });
    }
  }
  return out;
}

/** 道の、いちばん上の段。`OUTSIDE` の鍵はこの形。 */
export const branchOf = (route) => {
  const seg = route.split("/")[1];
  return seg ? `/${seg}` : "/";
};

/* ===================================================================
   本物の `spotOfPath` を、`layout.ts` から組み立てて読み込む。
   **写しを置かない。** 置くと、本体を直したのに見張りが古いまま通る。
   =================================================================== */
function loadLayout(src) {
  if (!existsSync(TSC)) nothing(`${TSC} が無い（site の npm ci がまだ）`);
  const out = mkdtempSync(join(tmpdir(), "here-"));
  try {
    execFileSync(TSC, [
      src, "--outDir", out, "--module", "commonjs", "--target", "es2022",
      "--skipLibCheck", "--noResolve",
    ], { stdio: "pipe" });
  } catch {
    /* `@/content/nights` を引けないぶんの文句は出る。**書き出せたかで見る** */
  }
  const js = join(out, basename(src).replace(/\.ts$/, ".js"));
  if (!existsSync(js)) nothing(`${src} が組み立てられなかった`);
  const mod = { exports: {} };
  const nodeRequire = createRequire(import.meta.url);
  // 建物の添え書きが1つ、住人の言葉を引いている。印には関わらないので空で返す
  const req = (id) => (id === "@/content/nights" ? { say: () => "" } : nodeRequire(id));
  new Function("require", "exports", "module", readFileSync(js, "utf8"))(req, mod.exports, mod);
  return mod.exports;
}

const LAYOUT_TS = process.env.LAYOUT_TS || join(SITE, "components", "island", "layout.ts");
const layout = loadLayout(LAYOUT_TS);
const { PLACES, spotOfPath, tidyPath } = layout;
if (!Array.isArray(PLACES) || typeof spotOfPath !== "function" || typeof tidyPath !== "function") {
  nothing("layout.ts から PLACES / spotOfPath / tidyPath が取れない（名前が変わった？）");
}

/* ===================================================================
   対照。**本物を1つも数える前に。** 足を1本ずつ折る
   =================================================================== */
{
  /* 足1 軒を引く式そのもの */
  check("対照1 軒の道が、その軒になる", spotOfPath("/kitchen") === "kitchen");
  check("対照1b 軒の下の面も、その軒になる", spotOfPath("/kitchen/gulyas") === "kitchen");
  check("対照1c 軒の外は undefined", spotOfPath("/privacy") === undefined,
    String(spotOfPath("/privacy")));
  /* **よそ見で当たらない。** `/kitchenette` は `/kitchen` の下ではない */
  check("対照1d 字の頭が同じだけの道は拾わない", spotOfPath("/kitchenette") === undefined,
    String(spotOfPath("/kitchenette")));

  /* 足2 道の均し。手元で配ると `.html` が付く */
  check("対照2 `.html` を落として比べる", spotOfPath("/kitchen.html") === "kitchen");
  check("対照2b 終わりのスラッシュを落とす", spotOfPath("/kitchen/") === "kitchen");
  check("対照2c 空の道は島そのもの", tidyPath("") === "/" && spotOfPath("") === undefined);

  /* 足3 いちばん長く一致したものが勝つ（`under` の要） */
  check("対照3 長いほうが勝つ", spotOfPath("/next/new") === "board" && spotOfPath("/next") === "next",
    `${spotOfPath("/next/new")} / ${spotOfPath("/next")}`);

  /* 足4 面を歩く */
  {
    const t = mkdtempSync(join(tmpdir(), "heretree-"));
    mkdirSync(join(t, "aaa"), { recursive: true });
    mkdirSync(join(t, "bbb", "ccc"), { recursive: true });
    mkdirSync(join(t, "ddd"), { recursive: true });
    writeFileSync(join(t, "aaa", "page.tsx"), "");
    writeFileSync(join(t, "bbb", "ccc", "page.tsx"), "");
    writeFileSync(join(t, "ddd", "layout.tsx"), "");
    const got = routesIn(t).map((r) => r.route).sort();
    check("対照4 面を歩ける", JSON.stringify(got) === JSON.stringify(["/aaa", "/bbb/ccc"]),
      JSON.stringify(got));
    check("対照4b いちばん上の段を取れる",
      branchOf("/bbb/ccc") === "/bbb" && branchOf("/") === "/");
  }

  /* 足5 「面が名乗っている」を見つける */
  check("対照5 渡している面を見つける",
    handedHere(`<PageShell current="zzz" crumbs={[]}>`).length === 1);
  check("対照5b `atAll` も見つける", handedHere(`<PageShell atAll crumbs={[]}>`).length === 1);
  check("対照5c 渡していない面は素通し", handedHere(`<PageShell crumbs={[]}>`).length === 0);
  /* **遠くの `current=` を拾わない。** 別の部品のものまで拾うと、
     どの面も赤くなって見張りごと外される */
  check("対照5d 札の外の current は拾わない",
    handedHere(`<PageShell crumbs={[]}>\n${"\n".repeat(60)}<Foo current="zzz" />`).length === 0);
  check("対照5e 砂浜も看板も見る",
    handedHere(`<IslandFooter current="x" />`).length === 1 &&
    handedHere(`<PlaceList current="x" />`).length === 1);

  /* 足6 但し書きと中身を見分ける。**ここが抜けると、仕掛けを抜いた写しが通る** */
  check("対照6 但し書きの中の名前は、呼び出しに数えない",
    !stripComments("/** spotOfPath( に当てる */\nconst x = 1;").includes("spotOfPath("));
  check("対照6b 行の但し書きも落とす",
    !stripComments("  // usePathname( を読む\nconst y = 2;").includes("usePathname("));
  check("対照6c 中身は残る",
    stripComments("/** 注 */\nconst z = spotOfPath(path);").includes("spotOfPath("));

  if (BAD) {
    console.log(`\n対照が ${BAD} 件外れた。本物は数えない`);
    process.exit(2);
  }
}

/* ===================================================================
   本物
   =================================================================== */

// 1. 軒ぜんぶが、自分の道から引ける
{
  const miss = PLACES.filter((p) => spotOfPath(p.href) !== p.id).map((p) => p.href);
  check(`軒 ${PLACES.length} 枚が、自分の道から引ける`, miss.length === 0, miss.join(" "));
}

// 2. 面は、いま居る場所を名乗らない（渡す口が戻っていない）
const pages = routesIn(APP);
if (pages.length < 20) nothing(`site/app で面が ${pages.length} 枚しか見つからない`);
{
  const bad = [];
  for (const { route, file } of pages) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const hit of handedHere(src)) bad.push(`${route}（${hit}）`);
  }
  check(`面 ${pages.length} 枚が「いま居る場所」を名乗っていない`, bad.length === 0,
    bad.join(" / "));
}

// 3. 砂浜を出す面が、軒に属しているか／属さない理由が書いてあるか
let beaches = 0;
let marked = 0;
{
  const unknown = [];
  for (const { route, file } of pages) {
    if (!hasBeach(stripComments(readFileSync(file, "utf8")))) continue;
    beaches += 1;
    if (spotOfPath(route)) {
      marked += 1;
      continue;
    }
    const b = branchOf(route);
    if (!OUTSIDE[b]) unknown.push(`${route}（枝 ${b}）`);
  }
  check("砂浜を出す面が、軒に属しているか／属さない理由が書いてあるか", unknown.length === 0,
    `${unknown.join(" / ")} ← layout.ts の under に足すか、OUTSIDE に理由を書く`);
  check("砂浜を出す面が数えられた", beaches >= 20, `${beaches}枚`);
}

// 3b. `OUTSIDE` の腐り。**消えた枝の言い訳を残さない**
{
  const live = new Set(pages.map((p) => branchOf(p.route)));
  const dead = Object.keys(OUTSIDE).filter((b) => !live.has(b));
  check("OUTSIDE に、もう無い枝が残っていない", dead.length === 0, dead.join(" "));
  const thin = Object.entries(OUTSIDE).filter(([, why]) => why.length < 12).map(([b]) => b);
  check("OUTSIDE の理由が、理由の形をしている", thin.length === 0, thin.join(" "));
}

// 4. 砂浜と看板の帯が、自分で道を読んでいる
for (const [name, rel] of [
  ["砂浜", join("components", "ui", "PlaceList.tsx")],
  ["看板の帯", join("components", "ui", "IslandNav.tsx")],
]) {
  const raw = existsSync(join(SITE, rel)) ? readFileSync(join(SITE, rel), "utf8") : "";
  // **但し書きではなく、呼び出しを見る**（`stripComments` の上の注）
  const src = stripComments(raw);
  check(`${name}が、いまの道を自分で読む`,
    src.includes("usePathname(") && src.includes("spotOfPath("), rel);
}

// 5. 印に、見ための裏付けがある
{
  const way = join(SITE, "app", "css", "way.css");
  const pagesCss = join(SITE, "app", "css", "pages.css");
  check("砂浜の印に、見ためが在る（.ifoot-door.is-here）",
    existsSync(way) && readFileSync(way, "utf8").includes(".ifoot-door.is-here"));
  check("看板の札の印に、見ためが在る（.ih-link.is-on）",
    existsSync(pagesCss) && readFileSync(pagesCss, "utf8").includes(".ih-link.is-on"));
}

console.log(
  `\n砂浜のある面 ${beaches} 枚（`
  + `うち印が出る ${marked} / 軒の外 ${beaches - marked}）`
  + ` ／ 通った ${OK} / 落ちた ${BAD}`,
);
console.log("※ ここで数えているのは `site/app` の面の**ひな型**の数。"
  + "動く段（`[slug]`）が何枚に焼けるかは `python3 python/counts.py`");
process.exit(BAD ? 1 : 0);
