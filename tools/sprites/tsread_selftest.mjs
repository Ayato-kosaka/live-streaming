/**
 * **`.mjs` が焼き込みを自前に読んでいないか。読んだものを黙って1件落としていないか。**
 *
 *     node tools/sprites/tsread_selftest.mjs
 *
 *     BREAK=drop    node tools/sprites/tsread_selftest.mjs  # 1件落とす読み手にする
 *     BREAK=nogap   node tools/sprites/tsread_selftest.mjs  # 注釈を跨げない読み手にする
 *     BREAK=nocount node tools/sprites/tsread_selftest.mjs  # 名乗りの数えを外す
 *     BREAK=grow    node tools/sprites/tsread_selftest.mjs  # 自前の読み手が1本生えた回を作る
 *
 * 終了コード 0=ぜんぶ通った / 1=外したものがある / 2=数えるものが無い・`BREAK` の名前が違う。
 *
 * ## なぜ要るか（#694）
 *
 * Python 側は `python/ts_read.py` の1本に寄せて、**増えたら赤くなる見張り**
 * （`python/ts_readers_selftest.py`）を置いた。**`.mjs` は、その数えの外にいた。**
 *
 * 数えたら `site/content/*.ts` を自前の正規表現で読む `.mjs` が **14本・20か所**
 * （＋`fitmeasure.mjs` が正規表現ではない切り方で1本、
 * `here_selftest.mjs` が `components/island/layout.ts` を同じ形で1本）。
 * いちばん分かりやすかったのが `charfit.mjs`:
 *
 *     /icon:\s*"([^"]+)"[^}]*channel:\s*"([^"]+)"/
 *
 * **`icon` と `channel` が同じ `{}` の中で隣り合っていること**を当てにしている。
 * `[^}]*` は `}` を1つも跨げないので、あいだに
 *
 *   - `}` を含む注釈（`{ icon, channel }` と書いただけで入る）
 *   - 入れ子の `{…}`（欄を1つ増やしただけで入る）
 *
 * が挟まると、**その人が黙って消える。** 消えたぶんは分母からも消えるので、
 * `charfit.mjs` は「全員おさまっています」と**緑**を出す。
 *
 * **測る道具だから軽い、ではない。逆。** 焼く側が壊れたら数字が変わるので
 * 気づけるが、**測る側が壊れると緑が出る。**
 *
 * ## 見るのは4つ
 *
 * | 何を | なぜ |
 * | --- | --- |
 * | 本番の焼き込みを、寄せた読み口で読んで**名乗りと読めた数が合う** | いま落ちていないこと |
 * | **注釈を9行挟んだ写し**でも、同じものが同じ数だけ読める | 次に注釈が増えても落ちないこと |
 * | その写しを**昔の読み方に食わせると落ちる** | この対照が易しくなっていないこと |
 * | **Python（`python/ts_read.py`）と同じ答えが出る** | 片方だけ直した日に気づけること |
 *
 * そのうえで、**自前の読み手が生えたら赤くする**（`ALLOW`）。
 * 文で「増やすな」と書いても、セッションが変わると守られない。
 *
 * ## ここは毎 PR で走る
 *
 * `python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾う。
 * **`playwright-core` を import しないこと**がここに置ける条件
 * （`tools/sprites/node_modules` は CI に入らない）。`tsread.mjs` は
 * `node:fs` しか要らない。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "./tsread.mjs";
import { repoRoot } from "./repo.mjs";

const REPO = repoRoot();
const CONTENT = join(REPO, "site", "content");
const BREAK = process.env.BREAK || "";
const LEGS = ["drop", "nogap", "nocount", "grow"];

/* ---------------------------------------------------------------- 足を抜く
 *
 * **4本を1本にまとめない。** `drop` は「読めない」、`nogap` は「注釈で切れる」、
 * `nocount` は「読めなかったことに気づけない」、`grow` は「自前の読み手が
 * 生えても気づけない」で、別のこと。北欧の章が消えたのは `nogap` と
 * `nocount` が揃ったからで、片方だけ直しても次でまた黙る。
 *
 * `tsread.mjs` は ESM なので、Python のように関数を差し替えられない。
 * 代わりに**ここが呼ぶ入口**を包んで、同じ壊し方を作る。
 */
const R = {
  readArray: (...a) => ts.readArray(...a),
  readMap: (...a) => ts.readMap(...a),
  readConst: (...a) => ts.readConst(...a),
};
if (BREAK === "drop") {
  R.readArray = (...a) => {
    const got = ts.readArray(...a);
    const rows = got.rows.length > 1 ? got.rows.slice(0, -1) : got.rows;
    return { rows, declared: got.declared, missed: got.declared - rows.length };
  };
} else if (BREAK === "nogap") {
  // 注釈を落とさない読み手。**注釈の中の `slug:` を1件と読む**
  const keep = (src) => src;
  R.readArray = (src, name, opt) => {
    const body = ts.arrayBody(keep(src), name);
    const rows = [];
    for (const obj of ts.objects(body)) {
      const f = ts.fields(obj);
      const idKey = opt?.idKey ?? "slug";
      if (!f[idKey]) continue;
      const row = {};
      for (const k of opt?.keys ?? []) row[k] = f[k] ?? "";
      rows.push(row);
    }
    const declared = ts.countKeys(body, opt?.idKey ?? "slug");
    return { rows, declared, missed: declared - rows.length };
  };
  R.readMap = (src, name) => ts.entries(ts.objectBody(keep(src), name));
  R.readConst = (src, name) => Object.fromEntries(R.readMap(src, name));
} else if (BREAK === "nocount") {
  // **名乗りを「読めた数」で数える。** こうすると読み落としが永久に 0 になる
  R.readArray = (...a) => {
    const got = ts.readArray(...a);
    return { rows: got.rows, declared: got.rows.length, missed: 0 };
  };
}

/* ---------------------------------------------------------------- 読む本の一覧
 *
 * **`.mjs` が読んでいる本を名指しで並べる。** ここに無い本は、`.mjs` の
 * 誰も読んでいないということ。読む側を足したらここにも足す。
 */

/** 並びの本。`[ファイル, 並びの名前, 1件を名乗る欄, 誰が読むか]` */
const ARRAYS = [
  ["site/content/residents.ts", "RESIDENTS", "icon", "charfit / asme / asme202 / clutter"],
  ["site/content/themes.ts", "THEMES", "id", "asme / boardseed"],
  ["site/content/chapters.ts", "CHAPTERS", "slug", "orphanpage / chapterkey / isleart"],
  ["site/content/countries.ts", "COUNTRIES", "slug", "walkedcount"],
  ["site/content/countries.ts", "AHEAD_COUNTRIES", "slug", "walkedcount"],
  ["site/content/nordic.ts", "ROUTE", "id", "walkedcount"],
  ["site/content/plans.ts", "PLANS", "id", "nextempty"],
  ["site/content/recipes.ts", "RECIPES", "slug", "manifest / heroicon"],
  ["site/content/legends.ts", "LEGENDS", "slug", "manifest / heroicon"],
  ["site/content/streamTypes.ts", "STREAM_TYPES", "slug", "manifest / heroicon"],
  // 焼き込みではないが、**同じ形の危うさ**を持っていたので一緒に寄せた
  ["site/components/island/layout.ts", "PLACES", "id", "here_selftest"],
];

/** 表の本（`Record<string, X>`）。鍵の数だけ見る */
const MAPS = [["site/content/kitchenTalk.ts", "KITCHEN_TALK", "kdfit"]];

/** ただの定数の表。`[ファイル, 名前, 要る欄, 誰が読むか]` */
const CONSTS = [
  ["site/content/nights.ts", "FIXED", "eyebrow", "orphan"],
  ["site/content/nights.ts", "TRIP", "eyebrow", "orphan"],
];

/** 字のまま切り出す塊。`[ファイル, 頭, 誰が読むか]` */
const BLOCKS = [
  ["site/content/characterBox.ts", "export function charFit(", "fitmeasure"],
  ["tools/sprites/charbox.py", "export function charFit(", "fitmeasure"],
];

/* ---------------------------------------------------------------- 昔の読み方
 *
 * **2026-10-13 まで、それぞれの本をこう読んでいた。** この対照が易しく
 * なっていないことを見るためだけに置いてある。本物はもう1本も使っていない。
 *
 * 崩し方は2つ。**昔の読み方の弱点が2種類あるので、同じ崩し方では両方出ない。**
 *
 * | 崩し方 | 昔の読み方のどこが弱いか |
 * | --- | --- |
 * | `gap` | 欄が**隣り合っていること**・**行に収まっていること**を当てにしている |
 * | `nest` | **深さを見ていない**。入れ子に同じ名前の欄があると、余分に数える |
 *
 * **`who` に拡張子を書かない**（`charfit:82` であって `charfit.mjs:82` ではない）。
 * `python/watch_census_selftest.py` は、`execFileSync` を持つファイルの中に
 * 出てくる**道具の名前を「子として起こしている」と読む。** ここは git と
 * python3 を起こすので、名前を書いた相手が「走っている」ことになって、
 * **あちらの「どこからも走っていない見張り」の数え**が狂う
 * （実際に `kdfit` を断りの表から外させかけた。2026-10-13）。
 */
const LEGACY = {
  // #694 の中心。`[^}]*` は `}` を1つも跨げない
  "site/content/residents.ts|RESIDENTS": {
    who: "charfit:82",
    re: /icon:\s*"([^"]+)"[^}]*channel:\s*"([^"]+)"/g,
    how: "gap",
  },
  // ここだけ**数ではなく答え**で見る。昔の読み方は「`export const THEMES` から
  // 先で最初に当たった `id:`」なので、件数は変わらないまま**別の宛先**を返す
  "site/content/themes.ts|THEMES": {
    who: "asme:143 / boardseed:47",
    re: /id:\s*"([a-z][a-z0-9-]*)"/g,
    how: "gapwrong",
    pick: (s) =>
      s.slice(s.indexOf("export const THEMES")).match(/id:\s*"([a-z][a-z0-9-]*)"/)?.[1] ?? "",
  },
  "site/content/chapters.ts|CHAPTERS": {
    who: "chapterkey_selftest:168 / isleart_selftest:128",
    re: /^\s{4}slug:\s*"([a-z0-9-]+)",/gm,
    how: "nest",
    nest: '\n    sub: {\n    slug: "ghost",\n    },',
  },
  "site/content/countries.ts|COUNTRIES": {
    who: "walkedcount:78",
    re: /^    slug: "([^"]+)",$/gm,
    how: "nest",
    nest: '\n    sub: {\n    slug: "ghost",\n    },',
  },
  "site/content/countries.ts|AHEAD_COUNTRIES": {
    who: "walkedcount:80",
    re: /\{ slug: "([^"]+)", name: "[^"]+", entered: "(\d{4}-\d{2}-\d{2})" \}/g,
    how: "gap",
  },
  "site/content/nordic.ts|ROUTE": {
    who: "walkedcount:114（行を上から舐めて、直前の `date:` を入国日にしていた）",
    re: /^\s*date: "(\d{4}-\d{2}-\d{2})",/gm,
    how: "nest",
    nest: '\n    sub: {\n    date: "2099-01-01",\n    },',
  },
  "site/content/plans.ts|PLANS": {
    who: "nextempty:72",
    re: /^\s*date:\s*"(20\d\d-\d\d-\d\d)"/gm,
    how: "nest",
    nest: '\n    sub: {\n      date: "2099-01-01",\n    },',
  },
  "site/content/recipes.ts|RECIPES": {
    who: "manifest:961 / heroicon_selftest:52",
    re: /^\s*icon: "([^"]+)"/gm,
    how: "nest",
    nest: '\n    sub: {\n      icon: "ghost",\n    },',
  },
  "site/components/island/layout.ts|PLACES": {
    who: "here_selftest:48（`[\\s\\S]*?` で欄のあいだを跨いでいた）",
    re: /id:\s*"([a-z-]+)"[\s\S]*?href:\s*"(\/[^"]*)"/g,
    how: "nest",
    nest: '\n    sub: {\n      id: "ghost",\n      href: "/ghost",\n    },',
  },
  "site/content/kitchenTalk.ts|KITCHEN_TALK": {
    who: "kdfit:172",
    re: /^\s*"([a-z0-9-]+)":\s*\{\s*people:\s*(\d+),[^\n]*?there:\s*\[([^\]]*)\]/gm,
    how: "gap",
  },
};

/**
 * 挟む注釈。**本番の北欧と同じ9行。**
 *
 * 中に欄のように見える字と、**`}` を1つ**入れてある。
 * `}` が入っているのは意地悪ではない——`{ icon, channel }` のような書き方は
 * 注釈のいちばん普通の形で、**それが1つ入るだけで `[^}]*` の読み手は落ちる。**
 */
const GAP = `
    /* ここに注釈が9行入る、というのが本番の北欧の形。
       なぜこの日から始まるのか、なぜこの日で閉じるのか、
       という経緯を書くので、どうしても長くなる。
       並びは { icon, channel } の順でなくてよい、のような
       書き方をすると、ここに } が1つ入る。
       to: "2026-12-31" と書いてあっても欄ではない。
       slug: "ghost" と書いてあっても1件ではない。
       https://example.com/a//b.png のような URL も入る。
       id: "ghost" と書いてあっても1件目ではない。 */
`;

/**
 * 合言葉の欄を名乗っているのに、中身が空な1件。**名乗りは2つ、読めるのは1つ。**
 *
 * ここで `missed` が立たないと、**名乗りを「読めた数」で数えている**ということ
 * ——読み落としが永久に 0 になって、次に落ちたとき黙る。
 */
const NO_ID = `
export const CHAPTERS: Chapter[] = [
  { slug: "alpha", name: "ひとつめ" },
  { slug: "", name: "ふたつめ" },
];
`;

/* ---------------------------------------------------------------- 仕込み */

/** `{…}` の中の `,` の位置を、**深さを問わず**全部。文字列の中は数えない。 */
function commas(inner) {
  const out = [];
  let i = 0;
  const n = inner.length;
  while (i < n) {
    const c = inner[i];
    if (c === '"' || c === "'" || c === "`") {
      i = ts.skipString(inner, i) + 1;
      continue;
    }
    if (c === ",") out.push(i);
    i += 1;
  }
  return out;
}

function spanOf(src, name) {
  const code = ts.codeOnly(src);
  let [at, end] = ts.arraySpan(code, name);
  if (at < 0) [at, end] = ts.objectSpan(code, name);
  return [at, end];
}

/**
 * **1件ごとに、欄と欄のあいだぜんぶへ注釈を挟んだ写し。**
 *
 * 挟むのは「`{` のすぐうしろ」と「`,` のうしろ」ぜんぶ（入れ子の中も）。
 * 本番の北欧は `slug:` と `name:` のあいだだけだったが、**次に注釈が
 * 付く場所はそこだとは限らない。** 付きうるところ全部に付けて確かめる。
 *
 * **うしろから挟む**——前から挟むと、2件目以降の在りかがずれる。
 */
function injectGap(src, name) {
  const [at, end] = spanOf(src, name);
  if (at < 0) return src;
  const body = ts.codeOnly(src).slice(at + 1, end);
  const cuts = [];
  for (const [i, e] of ts.objectSpans(body)) {
    const base = at + 1 + i + 1; // `{` の直後
    cuts.push(base);
    for (const j of commas(body.slice(i + 1, e))) cuts.push(base + j + 1);
  }
  let out = src;
  for (const c of cuts.sort((a, b) => b - a)) out = out.slice(0, c) + GAP + out.slice(c);
  return out;
}

/** **1件めの中に、入れ子で同じ名前の欄を足した写し。** */
function injectNest(src, name, snippet) {
  const [at, end] = spanOf(src, name);
  if (at < 0) return src;
  const body = ts.codeOnly(src).slice(at + 1, end);
  const spans = ts.objectSpans(body);
  if (!spans.length) return src;
  const cut = at + 1 + spans[0][0] + 1;
  return src.slice(0, cut) + snippet + src.slice(cut);
}

/* ---------------------------------------------------------------- 読み手の数え
 *
 * 「TS の欄を字で読んでいそうな正規表現」の見つけかた。
 * **JS は `/…/` が割り算とまぎれる**ので、字の種類（文字列・注釈・正規表現）を
 * 歩いて分けてから数える。`new RegExp("…")` の中の字も見る。
 */
const FRAGS = [
  ': "', ':\\s*"', '": ', '":\\s', '":\\{', '": \\{',
  ": {", ":\\s*{", ": \\{", ":\\s*\\{",
  ": [", ":\\s*[", ": \\[", ":\\s*\\[",
  ": (\\d", ":\\s*(\\d", ": ([0-9", ":\\s*([0-9", ': (?:"', ": \\d", ":\\s*\\d",
];
/** `/` の前がこれなら、そこから始まるのは正規表現（割り算ではない） */
const RE_AFTER = "(,=:[!&|?{};+-*%~^<>";
const RE_KW = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else",
  "yield", "await",
]);

function jsSkipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") {
      j += 2;
      continue;
    }
    if (s[j] === q) return j;
    if (s[j] === "\n") return j - 1; // 閉じていない引用符。行で切る
    j += 1;
  }
  return s.length - 1;
}

function jsSkipTemplate(s, i) {
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") {
      j += 2;
      continue;
    }
    if (s[j] === "`") return j;
    if (s[j] === "$" && s[j + 1] === "{") {
      let d = 1;
      j += 2;
      while (j < s.length && d) {
        if (s[j] === '"' || s[j] === "'") {
          j = jsSkipString(s, j) + 1;
          continue;
        }
        if (s[j] === "`") {
          j = jsSkipTemplate(s, j) + 1;
          continue;
        }
        if (s[j] === "{") d += 1;
        if (s[j] === "}") d -= 1;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  return s.length - 1;
}

function jsSkipRegex(s, i) {
  let j = i + 1;
  let cls = false;
  while (j < s.length) {
    const c = s[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "\n") return -1; // 1行に収まらない＝正規表現ではなかった
    if (cls) {
      if (c === "]") cls = false;
    } else if (c === "[") cls = true;
    else if (c === "/") return j;
    j += 1;
  }
  return -1;
}

/**
 * その `.mjs` の中の「正規表現の本文」を全部。
 *
 * `new RegExp("…")` / `new RegExp(\`…\`)` の中の字も、正規表現として返す。
 * **文字列や注釈の中の `/…/` は返さない**——そこは字であって読み手ではない。
 */
export function regexBodies(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let prev = "";
  let prevWord = "";
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const j = src.indexOf("\n", i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const e = c === "`" ? jsSkipTemplate(src, i) : jsSkipString(src, i);
      // `new RegExp("…")` に渡している字は、正規表現として数える
      if (/RegExp\s*\(\s*$/.test(src.slice(Math.max(0, i - 40), i))) {
        out.push({ body: src.slice(i + 1, e), at: i });
      }
      i = e + 1;
      prev = c;
      prevWord = "";
      continue;
    }
    if (c === "/") {
      const isRe = !prev || RE_AFTER.includes(prev) || RE_KW.has(prevWord);
      if (isRe) {
        const e = jsSkipRegex(src, i);
        if (e > 0) {
          out.push({ body: src.slice(i + 1, e), at: i });
          i = e + 1;
          prev = "/";
          prevWord = "";
          continue;
        }
      }
      i += 1;
      prev = "/";
      prevWord = "";
      continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
        prevWord = src.slice(i, j);
        prev = src[j - 1];
        i = j;
        continue;
      }
      prev = c;
      prevWord = "";
    }
    i += 1;
  }
  return out;
}

/**
 * 数える `.mjs` の一覧。**版の見張り（git）に聞く。**
 *
 * 置き場の名前で避けると（`dist` `lib` `out` …）、**その名前の中に
 * 本物が1本入った日に黙って数が減る。** 版の見張りなら `.gitignore` が
 * 焼いたものを外してくれるし、**まだ控えていない新しい1本も入る**
 * （`--others --exclude-standard`）。読み手を生やした当人の手元で赤くなる。
 *
 * 聞けなければ投げる。**「数えられなかった」を「0本だった」にしない。**
 */
function mjsFiles() {
  const out = execFileSync(
    "git",
    ["-C", REPO, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.mjs"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\0").filter(Boolean).sort();
}

/**
 * **ここに在るものは、寄せずに残したもの。** 数と理由を書く。
 * 数が変わったら赤になるので、**足すときは理由を書かざるを得ない。**
 *
 * **鍵は本物の道筋**（`census` が突き合わせるので、上の `who` のように
 * 拡張子を落とせない）。だから `python/watch_census_selftest.py` は、
 * ここに並んだ道具を「このファイルが子として起こしている」と読む。
 * **断りの表（`python/watch_excuses.py`）に在るものをここへ足すときは、
 * あちらが落ちないかを一緒に見る。**
 */
const ALLOW = {
  "functions/selftest/fund_superchat_selftest.mjs": [
    1,
    "`functions/src` の TS を**1行だけ当てて書き替える**仕込み（字面の手術）。焼き込みは読まない",
  ],
  "site/selftest/popdepth_selftest.mjs": [1, "CSS の変数を読む（TS ではない）"],
  "tools/sprites/fontbudget_selftest.mjs": [
    1,
    "`app/css/fonts.css` の `@font-face` を読む（`font-weight` / `url` / `unicode-range`）。**焼き込みの TS ではない。** `font-weight:\\s*(\\d+)` が欄読みの形に見えるだけ",
  ],
  "tools/sprites/fontfaces.mjs": [
    1,
    "`app/css/fonts.css` の `@font-face` を読む口。書体の空振りを数える側は、自前に読まずにここを読む。**焼き込みの TS ではない。** `fontbudget_selftest.mjs` と同じ形",
  ],
  "tools/sprites/deckctrl.mjs": [
    1,
    "`public/nordic/review.html` の中のクイズを読む（焼き込みではなく、焼いた HTML）",
  ],
  "tools/sprites/pagebytes.mjs": [1, "HTTP の `content-length` を読む（TS ではない）"],
};

/**
 * `.mjs` の中の「TS の欄を字で読んでいそうな正規表現」を数える。
 *
 * @param {Object<string,string>} [extra] 読み手が1本生えた回を作るための差し込み
 *   （`{相対パス: 中身}`）。`BREAK=grow` が使う
 * @returns {[Object<string,number>, string[], number]}
 *   `[{相対パス: 本数}, 表に無かった相対パス, 見たファイルの数]`
 */
export function census(extra = {}) {
  const counted = {};
  const files = mjsFiles();
  const seen = files.length + Object.keys(extra).length;
  for (const rel of files) {
    if (rel === "tools/sprites/tsread_selftest.mjs") continue; // ここ（`FRAGS` と `LEGACY` を持っている）は数えない
    const src = readFileSync(join(REPO, rel), "utf8");
    const n = regexBodies(src).filter((r) => FRAGS.some((f) => r.body.includes(f))).length;
    if (n) counted[rel] = n;
  }
  for (const [rel, body] of Object.entries(extra)) {
    const n = regexBodies(body).filter((r) => FRAGS.some((f) => r.body.includes(f))).length;
    if (n) counted[rel] = n;
  }
  return [counted, Object.keys(counted).filter((k) => !(k in ALLOW)), seen];
}

/* ---------------------------------------------------------------- 回す */

const ok = [];
const ng = [];
const J = (v) => JSON.stringify(v);
const check = (label, got, want) =>
  (J(got) === J(want) ? ok : ng).push(`${label}: 出た=${J(got)} ほしい=${J(want)}`);

function main() {
  if (BREAK && !LEGS.includes(BREAK)) {
    console.log(`::error::BREAK=${BREAK} は足の名前ではありません。使えるのは ${LEGS.join(", ")}`);
    return 2;
  }
  if (BREAK) console.log(`** BREAK=${BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **`);

  const src = {};
  for (const [f] of [...ARRAYS, ...MAPS, ...CONSTS, ...BLOCKS]) {
    if (src[f] === undefined) {
      const p = join(REPO, f);
      src[f] = existsSync(p) ? readFileSync(p, "utf8") : "";
    }
  }

  // --- 1. 本番の字で、名乗りと読めた数が合うか -----------------------------
  for (const [f, name, idk, who] of ARRAYS) {
    const got = R.readArray(src[f], name, { keys: [idk], idKey: idk });
    console.log(`  ${f} の ${name}: 名乗り ${got.declared} / 読めた ${got.rows.length}  （${who}）`);
    check(`${f} の ${name} が1件も名乗っていない、ということは無い`, got.declared > 0, true);
    check(`${f} の ${name} を1件も読み落としていない`, got.missed, 0);
    check(`${f} の ${name} の鍵に空が無い`, got.rows.every((r) => r[idk]), true);
  }
  for (const [f, name, who] of MAPS) {
    const keys = R.readMap(src[f], name).map(([k]) => k);
    console.log(`  ${f} の ${name}: 鍵 ${keys.length}件  （${who}）`);
    check(`${f} の ${name} の鍵が1件も取れない、ということは無い`, keys.length > 0, true);
    check(`${f} の ${name} の鍵に空が無い`, keys.every(Boolean), true);
    check(`${f} の ${name} の鍵が重なっていない`, new Set(keys).size, keys.length);
  }
  for (const [f, name, key, who] of CONSTS) {
    const v = R.readConst(src[f], name)[key];
    console.log(`  ${f} の ${name}.${key}: ${v ? `${v.length}字` : "読めず"}  （${who}）`);
    check(`${f} の ${name}.${key} が読める`, Boolean(v), true);
  }
  for (const [f, head, who] of BLOCKS) {
    const got = ts.cutBlock(src[f], head);
    console.log(`  ${f} の ${head.trim()}…: ${got ? `${got.length}字` : "読めず"}  （${who}）`);
    check(`${f} から ${head} の塊が切り出せる`, Boolean(got), true);
  }

  // 名乗りの数えが、読めた数とは**別の道**で出ているか
  const half = R.readArray(NO_ID, "CHAPTERS", { keys: ["slug"], idKey: "slug" });
  console.log(
    `  合言葉が空な1件を混ぜた字: 名乗り ${half.declared} / 読めた ${half.rows.length}` +
      ` / 読み落とし ${half.missed}`,
  );
  check("読めなかった1件は、読み落としとして立つ", half.missed, 1);
  check("読めたぶんはそのまま返る", half.rows.map((r) => r.slug), ["alpha"]);

  // --- 2. 注釈を9行挟んだ写しでも、同じものが同じ数だけ読めるか -------------
  //
  // **本番の字をそのまま使う。** 作り物の2行で試すと、本番の書き方が変わった
  // 日に対照のほうが先に易しくなる。
  const keysOf = (s, f, name, idk) =>
    idk === null
      ? R.readMap(s, name).map(([k]) => k)
      : R.readArray(s, name, { keys: [idk], idKey: idk }).rows.map((r) => r[idk]);

  const books = [
    ...ARRAYS.map(([f, n, i]) => [f, n, i]),
    ...MAPS.map(([f, n]) => [f, n, null]),
  ];
  const noGap = [];
  for (const [f, name, idk] of books) {
    const base = keysOf(src[f], f, name, idk);
    const gapped = injectGap(src[f], name);
    if (gapped === src[f]) noGap.push(`${f}|${name}`);
    check(`${f}/${name} に注釈を挟んでも、同じ鍵が同じ順で出る`, keysOf(gapped, f, name, idk), base);
    if (idk !== null) {
      check(
        `${f}/${name} に注釈を挟んでも読み落とし0`,
        R.readArray(gapped, name, { keys: [idk], idKey: idk }).missed,
        0,
      );
    }

    // **昔の読み方なら落ちる（または余分に数える）、を見る。**
    // そうでないなら、この対照は「壊れないところ」を触っているだけ
    const leg = LEGACY[`${f}|${name}`];
    if (!leg) continue;
    const count = (s) => [...s.matchAll(leg.re)].length;
    const before = count(src[f]);
    check(`${f}/${name} は昔の読み方でも、いまは読めている（対照の土台）`, before > 0, true);
    if (leg.how === "gap") {
      const after = count(gapped);
      console.log(
        `  ${f}/${name}: 昔の読み方（${leg.who}）${before}件 → 注釈を9行挟むと ${after}件`,
      );
      check(`${f}/${name} は、注釈を挟むと昔の読み方で落ちる`, after < before, true);
    } else if (leg.how === "gapwrong") {
      const was = leg.pick(src[f]);
      const now = leg.pick(gapped);
      console.log(
        `  ${f}/${name}: 昔の読み方（${leg.who}）"${was}" → 注釈を9行挟むと "${now}"`,
      );
      check(`${f}/${name} は、注釈を挟むと昔の読み方が別のものを返す`, now !== was, true);
      check(
        `${f}/${name} は、注釈を挟んでも tsread は同じものを返す`,
        keysOf(gapped, f, name, idk)[0],
        was,
      );
    } else {
      const nested = injectNest(src[f], name, leg.nest);
      const after = count(nested);
      console.log(
        `  ${f}/${name}: 昔の読み方（${leg.who}）${before}件 → 入れ子を足すと ${after}件`,
      );
      check(`${f}/${name} は、入れ子を足すと昔の読み方が余分に数える`, after > before, true);
      check(
        `${f}/${name} は、入れ子を足しても tsread は増えない`,
        keysOf(nested, f, name, idk),
        base,
      );
    }
  }
  // 挟めなかった本があったら、それは挟み方のほうが壊れている
  check("注釈を挟めなかった本は無い", noGap, []);

  // --- 2b. nights.ts の表も、注釈を挟んで読めるか ---------------------------
  for (const [f, name, key] of CONSTS) {
    const gapped = injectGap(src[f], name);
    check(`${f}/${name} に注釈を挟んでも ${key} が同じ`, R.readConst(gapped, name)[key],
      R.readConst(src[f], name)[key]);
  }

  // --- 3. Python（`python/ts_read.py`）と同じ答えが出るか --------------------
  //
  // **読み方を2つ持っていること自体は悪ではない。** Python と JS で言語が
  // 違うので、どのみち2つ要る。悪いのは**食い違っても気づけない**ことなので、
  // ここで突き合わせる。片方だけ直した日に赤くなる。
  const parity = pythonKeys();
  if (parity === null) {
    console.log("::error::python3 を回せませんでした（Python 側と突き合わせられない）");
    return 2;
  }
  for (const [f, name, idk] of ARRAYS) {
    const want = parity[`${f}|${name}`];
    if (want === undefined) continue;
    check(
      `${f}/${name} は Python（ts_read.py）と同じ鍵が同じ順で出る`,
      keysOf(src[f], f, name, idk),
      want,
    );
  }
  console.log(`  Python と突き合わせた本: ${Object.keys(parity).length}冊`);

  // --- 4. 自前の読み手が生えていないか -------------------------------------
  //
  // `BREAK=grow` は、**生えた回を作って赤くなるか**を見る足。
  const grown =
    BREAK === "grow"
      ? {
          "tools/sprites/_grown_fake.mjs":
            'const folk = [...src.matchAll(/icon:\\s*"([^"]+)"/g)].map((m) => m[1]);\n',
        }
      : {};
  const [counted, extra, seen] = census(grown);
  console.log(`  見た .mjs: ${seen}本`);
  if (seen < 100) {
    console.log(`::error::.mjs が ${seen}本しか見つかりませんでした（数えられていません）`);
    return 2;
  }
  for (const [rel, n] of Object.entries(counted).sort()) {
    const want = ALLOW[rel];
    if (!want) continue;
    check(`${rel} の自前の読み方が ${want[0]} 本のまま`, n, want[0]);
  }
  check("表に無いところで、TS を字で読む正規表現が生えていない", extra.sort(), []);
  for (const rel of Object.keys(ALLOW)) {
    if (!(rel in counted)) {
      check(`${rel} の自前の読み方が消えたら表からも外す`, `${rel} は 0 本`, "表に在る");
    }
  }
  const total = Object.values(counted).reduce((a, b) => a + b, 0);
  const want = Object.values(ALLOW).reduce((a, b) => a + b[0], 0);
  console.log(`  .mjs の自前の読み方: ${total}本 / 表に書いた ${want}本`);

  // --- 出す ----------------------------------------------------------------
  console.log(`対照 ${ok.length + ng.length}件中 ${ok.length}件通った`);
  for (const line of ng) console.log(`::error::${line}`);
  if (!ok.length) {
    console.log("::error::対照が0件です（site/content が読めていません）");
    return 2;
  }
  return ng.length ? 1 : 0;
}

/**
 * Python の `python/ts_read.py` に、同じ本を同じ順で読ませる。
 *
 * **別々に実装したものが同じ答えを出すこと**が、いちばん強い対照。
 * 回せなければ `null`（呼ぶ側が 2 で落ちる。「回せなかった」を
 * 「通った」と同じ顔にしない）。
 */
function pythonKeys() {
  const books = ARRAYS.map(([f, n, i]) => [f, n, i]);
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(REPO, "python"))})
import ts_read
out = {}
for f, name, idk in json.loads(sys.argv[1]):
    src = open(${JSON.stringify(REPO)} + "/" + f, encoding="utf-8").read()
    got = ts_read.read_array(src, name, keys=(idk,), id_key=idk)
    out[f + "|" + name] = [r[idk] for r in got.rows]
print(json.dumps(out, ensure_ascii=False))
`;
  try {
    const r = execFileSync("python3", ["-c", code, JSON.stringify(books)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(r);
  } catch (e) {
    console.log(`  python3 が回せなかった: ${String(e.message).slice(0, 200)}`);
    return null;
  }
}

process.exit(main());
