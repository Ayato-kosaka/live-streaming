/**
 * **`site/content/*.ts` を、字のまま読むための1本（`.mjs` 側）。** 判定も計算もしない。
 *
 *     import { readArray, must } from "./tsread.mjs";
 *     const got = readArray(src, "RESIDENTS", { keys: ["icon", "channel"], idKey: "icon" });
 *     const folk = must(got, "residents.ts の RESIDENTS");   // 読み落としが在れば 2 で止まる
 *
 * Python 側の `python/ts_read.py` と**同じ読み方の、同じ置き場**。
 * あちらの歩き（`skip_string` / `close_at` / `code_only` / `fields` …）を
 * そのまま写してある。**片方だけ直さない**——直したらもう片方にも同じ字を入れる。
 *
 * ## なぜ1本に寄せたか
 *
 * Python では `chapters.ts` を読む道具が3つあって、**3つとも別の読み方**を
 * していた。そのうち1つ（`build_chapter_stats.py`）が `slug:` と `name:` の
 * あいだに9行の注釈が挟まったところで切れ、**北欧の章が黙って消えた。**
 * 例外も警告も出ない。`chapterStats.ts` に北欧の行が1つも無い状態が、
 * 気づかれないまま続いていた。
 *
 * **`.mjs` は、その寄せの外にいた**（#694）。数えたら `site/content/*.ts` を
 * 自前の正規表現で読む `.mjs` が**14本・20か所**あって、どれも同じ形の
 * 危うさを持っていた。いちばん分かりやすいのが `charfit.mjs` の
 *
 *     /icon:\s*"([^"]+)"[^}]*channel:\s*"([^"]+)"/
 *
 * で、**`icon` と `channel` が同じ `{}` の中で隣り合っていること**を
 * 当てにしている。`[^}]*` は `}` を1つも跨げないので、あいだに
 *
 *   - `}` を含む注釈（「並びは `{ icon, channel }` の順でなくてよい」と
 *     書くだけで入る）
 *   - 入れ子の欄（`box: { w: 1, h: 1 }` を1つ足すだけで入る）
 *
 * が挟まると、その人が消える。本番の名簿で実測すると **91人 → 0人**
 * （`}` を含まない注釈なら落ちない。落ちる条件は `}` が1つ入ること）。
 *
 * **測る道具だから軽い、ではない。むしろ逆。** 焼く側が壊れたら数字が
 * 変わるので気づけるが、**測る側が壊れると「緑」が出る。**
 * 住人を何人か読み落とせば、その人たちを測らないまま
 * 「全員おさまっています」と言う。
 *
 * ## 読み落としは、数で捕まえる
 *
 * 字で読む以上、書き方が変われば落ちる。落ちること自体は避けられないので、
 * **落ちたことが分かる**ようにする。
 *
 * `declared`（ファイルが名乗っている件数＝いちばん外側の `{…}` が持つ
 * 合言葉の欄の数）と `rows.length`（読めた数）を突き合わせる。
 * 1つでも合わなければ `missed` が立つ。**呼ぶ側は `must()` で止める。**
 *
 * **`declared` が 0 と、`missed` が 0 でないのは、別の顔。** 前者は
 * 「数えるものが無い」（置き場が違う・名前が変わった）、後者は
 * 「数えたのに取りこぼした」。`must()` はどちらも終了コード **2**
 * （数えるものが無い）で止めるが、**出す字を分けてある**
 * （`docs/island-standards.md` §15）。
 *
 * **名乗りは、読めた数とは別の道で出す**（`countKeys` は `objects()` も
 * `fields()` も通らない）。同じ道で数えると「読めたぶんだけ名乗っていた」
 * ことになって、読み落としが永久に 0 になる。
 *
 * ## 自分で確かめる
 *
 *     node tools/sprites/tsread.mjs site/content/residents.ts RESIDENTS icon
 *     # 0=読めた / 2=1件も名乗っていない・読み落とした
 *
 * 見張りは `tools/sprites/tsread_selftest.mjs`（毎 PR で走る）。
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

/** 鍵の形（`slug: "…"` の `slug:`）。語の途中は呼ぶ側で弾く */
const KEY_RE = /([A-Za-z_]\w*)\s*:\s*/y;
/** 素の鍵（`at:` `people:`）。**`:` は食べない**——`entries()` が `:` を見て値の始まりを決める */
const BAREKEY_RE = /([A-Za-z_]\w*)\s*(?=:)/y;
const PAIRS = { "[": "]", "{": "}", "(": ")" };

/** 語の途中か（`plannedDays` の `l` から鍵を読み始めないため） */
const wordChar = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);

/** 先頭に当てる（Python の `re.match(src, i)` と同じこと） */
function matchAt(re, src, i) {
  re.lastIndex = i;
  return re.exec(src);
}

/** `src[i]` の引用符から、閉じる引用符の位置まで。閉じていなければ末尾。 */
export function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  const n = src.length;
  while (j < n) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === q) return j;
    j += 1;
  }
  return n - 1;
}

/** `src[i]` の開き括弧に対応する閉じ括弧の位置。**文字列の中は数えない。** */
export function closeAt(src, i) {
  const stack = [PAIRS[src[i]]];
  let j = i + 1;
  const n = src.length;
  while (j < n && stack.length) {
    const c = src[j];
    if (c === '"' || c === "'" || c === "`") j = skipString(src, j);
    else if (PAIRS[c]) stack.push(PAIRS[c]);
    else if (c === stack[stack.length - 1]) stack.pop();
    j += 1;
  }
  return stack.length ? n - 1 : j - 1;
}

/**
 * 注釈を空白に置き換えた字。**文字列の中は1字も触らない。**
 *
 * `//` はアイコンの URL の中にも出るので、「いま文字列の中か」を見ながら進む。
 * **改行は残し、長さも変えない**——位置がずれると、どこを読み違えたのかを追えない。
 */
export function codeOnly(src) {
  // **`[...src]` にしない。** あれは絵文字（代理対）を1つにまとめるので、
  // 添字が UTF-16 の位置とずれる。`countries.ts` は旗の絵文字を持っているので、
  // そこから先が丸ごと別の場所を指して、`AHEAD_COUNTRIES` が読めなくなった
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i) + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      for (let k = i; k < j; k++) out[k] = " ";
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      for (let k = i; k < j; k++) if (out[k] !== "\n") out[k] = " ";
      i = j;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/**
 * `… NAME … = <opener>` の `<opener>` の位置。見つからなければ -1。
 *
 * 名前と `=` のあいだには型が入る（`CHAPTERS: Chapter[] =`、
 * `AHEAD_COUNTRIES: { slug: string; name: string }[] =`）。字を数えずに歩く。
 * 括弧の深さが 0 のところに在る `=` だけを代入と見て、**深さ 0 で `;` に
 * 当たったらその名前はあきらめて次を探す。**
 * `=>` `==` `>=` `<=` `!=` は代入ではないので、前後の1字を見て外す。
 */
function assignAt(src, name, opener) {
  const find = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  for (let m = find.exec(src); m; m = find.exec(src)) {
    let i = m.index + m[0].length;
    const n = src.length;
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        i = skipString(src, i) + 1;
        continue;
      }
      if (PAIRS[c]) {
        depth += 1;
        i += 1;
        continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        depth -= 1;
        if (depth < 0) break; // 自分を囲んでいる括弧の外に出た。この名前ではない
        i += 1;
        continue;
      }
      if (depth === 0 && c === ";") break; // 宣言が終わった。この名前ではない
      if (
        depth === 0 &&
        c === "=" &&
        !"=!<>".includes(src[i - 1]) &&
        (i + 1 >= n || !"=>".includes(src[i + 1]))
      ) {
        let j = i + 1;
        while (j < n && /\s/.test(src[j])) j += 1;
        return j < n && src[j] === opener ? j : -1;
      }
      i += 1;
    }
  }
  return -1;
}

/** `… NAME … = [ … ]` の `[` と `]` の位置。無ければ `[-1, -1]`。 */
export function arraySpan(src, name) {
  const i = assignAt(src, name, "[");
  return i < 0 ? [-1, -1] : [i, closeAt(src, i)];
}

/** `… NAME … = [ … ]` の中身。**先に `codeOnly()` を通すこと。** */
export function arrayBody(src, name) {
  const [i, e] = arraySpan(src, name);
  return i < 0 ? "" : src.slice(i + 1, e);
}

/** `… NAME … = { … }` の `{` と `}` の位置。無ければ `[-1, -1]`。 */
export function objectSpan(src, name) {
  const i = assignAt(src, name, "{");
  return i < 0 ? [-1, -1] : [i, closeAt(src, i)];
}

/** `… NAME … = { … }` の中身（`Record<string, X>` の表はこちら）。 */
export function objectBody(src, name) {
  const [i, e] = objectSpan(src, name);
  return i < 0 ? "" : src.slice(i + 1, e);
}

/** 配列の中の `{…}` の在りか（`{` と `}` の位置）を、いちばん外側だけ。 */
export function objectSpans(body) {
  const out = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === "{") {
      const e = closeAt(body, i);
      out.push([i, e]);
      i = e + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(body, i) + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** 配列の中の `{…}` を、いちばん外側だけ1つずつ。 */
export function objects(body) {
  return objectSpans(body).map(([a, b]) => body.slice(a + 1, b));
}

/**
 * `{…}` の中の `key: [ … ]` / `key: { … }` の**中身**。無ければ空。
 *
 * `fields()` は入れ子をわざと飛ばす（`note:` の本文に `to: "…"` と書いて
 * あるのを欄と読まないため）。入れ子をまるごと欲しいときはこちら。
 */
export function nestedBody(obj, key) {
  let i = 0;
  const n = obj.length;
  let want = "";
  while (i < n) {
    const c = obj[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(obj, i) + 1;
      want = "";
      continue;
    }
    if (PAIRS[c]) {
      const e = closeAt(obj, i);
      if (want === key) return obj.slice(i + 1, e);
      i = e + 1;
      want = "";
      continue;
    }
    if (c === ",") {
      want = "";
      i += 1;
      continue;
    }
    if (!wordChar(obj[i - 1])) {
      const m = matchAt(KEY_RE, obj, i);
      if (m) {
        want = m[1];
        i = KEY_RE.lastIndex;
        continue;
      }
    }
    i += 1;
  }
  return "";
}

/**
 * `{ "鍵": 値, … }` の中身を「鍵 → 値の字」で、書いてある順に。
 *
 * `Record<string, X>` の表を1行ずつにするところ。鍵は引用符つきでも
 * 素の名前（`at:` `people:`）でもよい。値は**字のまま**返す。
 */
export function entries(body) {
  const out = [];
  let i = 0;
  const n = body.length;
  let key = "";
  while (i < n) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const e = skipString(body, i);
      if (!key) key = body.slice(i + 1, e); // 引用符つきの鍵
      i = e + 1;
      continue;
    }
    if (c === ":" && key) {
      let j = i + 1;
      while (j < n && /\s/.test(body[j])) j += 1;
      if (j >= n) break;
      if (PAIRS[body[j]]) {
        const e = closeAt(body, j);
        out.push([key, body.slice(j + 1, e)]);
        i = e + 1;
      } else if (body[j] === '"' || body[j] === "'" || body[j] === "`") {
        const e = skipString(body, j);
        out.push([key, body.slice(j + 1, e)]);
        i = e + 1;
      } else {
        let e = j;
        while (e < n && body[e] !== "," && body[e] !== "\n") e += 1;
        out.push([key, body.slice(j, e).trim()]);
        i = e;
      }
      key = "";
      continue;
    }
    if (c === ",") {
      key = "";
      i += 1;
      continue;
    }
    if (!wordChar(body[i - 1])) {
      const m = matchAt(BAREKEY_RE, body, i);
      if (m) {
        key = m[1];
        i = BAREKEY_RE.lastIndex;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

/**
 * 配列の中身で、**いちばん外側の `{…}` が持っている** `key:` の数。
 *
 * 読み落としを数で捕まえるための、**欄を読むのとは別の数えかた。**
 * `objects()` も `fields()` も通らない道で数えるので、あちらが1件
 * 取りこぼしても、ここの数は減らない。
 *
 * 深さを見るのは、**入れ子の同じ名前を数えないため**（`nordic.ts` の
 * `ROUTE` は区間ごとに `id:` を持つが、`fork.options` も `id:` を持つ）。
 */
export function countKeys(body, key) {
  const want = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "y");
  let got = 0;
  let i = 0;
  const n = body.length;
  let depth = 0;
  while (i < n) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(body, i) + 1;
      continue;
    }
    if (PAIRS[c]) {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 1 && !wordChar(body[i - 1])) {
      const m = matchAt(want, body, i);
      if (m) {
        got += 1;
        i = want.lastIndex;
        continue;
      }
    }
    i += 1;
  }
  return got;
}

/**
 * `{…}` の**いちばん外側の欄だけ**を「鍵 → 字」で返す。
 *
 * **正規表現1本で済ませない。** `note:` の本文に `to: "…"` のような字が
 * 入っていると、欄として拾ってしまう。入れ子と文字列の中は、歩きながら飛ばす。
 */
export function fields(obj) {
  const out = {};
  let key = "";
  let i = 0;
  const n = obj.length;
  while (i < n) {
    const c = obj[i];
    if (c === '"' || c === "'" || c === "`") {
      const e = skipString(obj, i);
      if (key) {
        out[key] = obj.slice(i + 1, e);
        key = "";
      }
      i = e + 1;
      continue;
    }
    if (PAIRS[c]) {
      i = closeAt(obj, i) + 1;
      key = "";
      continue;
    }
    if (c === ",") {
      key = "";
      i += 1;
      continue;
    }
    if (!wordChar(obj[i - 1])) {
      const m = matchAt(KEY_RE, obj, i);
      if (m) {
        key = m[1];
        i = KEY_RE.lastIndex;
        continue;
      }
    }
    if (key && !/\s/.test(c)) {
      // 引用符の付かない値（数・真偽）
      let j = i;
      while (j < n && obj[j] !== "," && obj[j] !== "\n") j += 1;
      out[key] = obj.slice(i, j).trim();
      key = "";
      i = j;
      continue;
    }
    i += 1;
  }
  return out;
}

/** `[…]` の中の文字列リテラルを、並んでいる順に。 */
export function stringsIn(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const e = skipString(src, i);
      out.push(src.slice(i + 1, e));
      i = e + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * `{…}` の中の `key: ["a", "b"]` を、**中の字の並び**として返す。
 *
 * `fields()` は入れ子を欄にしない作りなので、1つだけ名指しで取りに来る口。
 * 取れるのは文字列の並びだけ。欄が無い／並びでなければ空。
 */
export function listField(obj, key) {
  let want = "";
  let i = 0;
  const n = obj.length;
  while (i < n) {
    const c = obj[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(obj, i) + 1;
      want = "";
      continue;
    }
    if (PAIRS[c]) {
      if (want === key && c === "[") return stringsIn(obj.slice(i + 1, closeAt(obj, i)));
      i = closeAt(obj, i) + 1;
      want = "";
      continue;
    }
    if (c === ",") {
      want = "";
      i += 1;
      continue;
    }
    if (!wordChar(obj[i - 1])) {
      const m = matchAt(KEY_RE, obj, i);
      if (m) {
        want = m[1];
        i = KEY_RE.lastIndex;
        continue;
      }
    }
    i += 1;
  }
  return [];
}

/**
 * `export const NAME = [ {…}, … ]` を「鍵 → 字」の並びにする。
 *
 * 呼ぶ側は**欄の名前を並べるだけ**で、字の読み方には触らない。
 *
 * @param {string} src ファイルの中身そのもの（注釈はここで落とす）
 * @param {string} name 並びの名前（`"RESIDENTS"`）
 * @param {object} [opt]
 * @param {string[]} [opt.keys] 取りたい欄。**無い欄は空の字**で埋める
 *   （呼ぶ側に `?.` を書かせない——書かせると綴り違いが「欄が無い」に化ける）
 * @param {string[]} [opt.lists] `["a","b"]` の形で取りたい欄
 * @param {Object<string,string[]>} [opt.nested] 入れ子の `[{…}]` から取りたい欄
 * @param {string} [opt.idKey] 「1件を名乗っている」欄。これが空の `{…}` は数えない
 * @returns {{rows: object[], declared: number, missed: number}}
 *   **`missed` を見ずに `rows` だけ使わないこと**（`must()` を通す）
 */
export function readArray(src, name, { keys = [], lists = [], nested = {}, idKey = "slug" } = {}) {
  const body = arrayBody(codeOnly(src), name);
  const rows = [];
  for (const obj of objects(body)) {
    const f = fields(obj);
    if (!f[idKey]) continue;
    const row = {};
    for (const k of keys) row[k] = f[k] ?? "";
    for (const k of lists) row[k] = listField(obj, k);
    for (const [k, sub] of Object.entries(nested)) {
      row[k] = objects(nestedBody(obj, k)).map((o) => {
        const g = fields(o);
        return Object.fromEntries(sub.map((c) => [c, g[c] ?? ""]));
      });
    }
    rows.push(row);
  }
  const declared = countKeys(body, idKey);
  return { rows, declared, missed: declared - rows.length };
}

/**
 * `const NAME: Record<string, X> = { "鍵": 値, … }` を、書いてある順に。
 *
 * 返すのは `entries()` そのまま（値は字のまま）。鍵だけ欲しいときは
 * `readMap(src, name).map(([k]) => k)`。
 */
export function readMap(src, name) {
  return entries(objectBody(codeOnly(src), name));
}

/**
 * `const NAME = { … }` の、いちばん外側の欄だけ（`nights.ts` の `FIXED`）。
 *
 * 配列ではない、ただの定数の表を読むところ。並びは書いてある順。
 */
export function readConst(src, name) {
  return Object.fromEntries(readMap(src, name));
}

/**
 * `head` で始まる塊（`export function charFit(` … `\n}`）を、字のまま切り出す。
 *
 * **これは「欄を読む」側ではない。** 同じ関数が2つのファイルに写してあるとき、
 * 1文字まで同じかを見るための口（`fitmeasure.mjs` が `characterBox.ts` と
 * `charbox.py` を突き合わせている）。切り方を呼ぶ側ごとに書くと、
 * **片方だけ違う切り方**になって、突き合わせが黙って易しくなる。
 *
 * @returns {string|null} 塊の字。見つからなければ null
 */
export function cutBlock(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const j = src.indexOf("\n}", i);
  return j < 0 ? null : src.slice(i, j + 2);
}

/**
 * 読めたか見て、駄目なら**終了コード 2 で止める。**
 *
 * **0件と読み落としは、別の顔で出す**（`docs/island-standards.md` §15）。
 * どちらも 2（数えるものが無い）で止めるが、直すところが違う——
 * 前者は置き場か名前、後者は書き方。
 *
 * @param {{rows: object[], declared: number, missed: number}} got `readArray()` の答え
 * @param {string} what 何を読んでいたか（`"residents.ts の RESIDENTS"`）
 * @returns {object[]} 読めた行
 */
export function must(got, what) {
  if (got.declared === 0) {
    console.log(`::error::${what} が1件も名乗っていません（置き場が違う・名前が変わった）`);
    process.exit(2);
  }
  if (got.missed !== 0) {
    console.log(
      `::error::${what} を ${got.missed}件 読み落としました` +
        `（名乗り ${got.declared} / 読めた ${got.rows.length}）`,
    );
    process.exit(2);
  }
  return got.rows;
}

/**
 * 並び（鍵の一覧・字の一覧）が空なら、**終了コード 2 で止める。**
 *
 * `readMap()` のように名乗りを別に数えられないものは、せめて
 * 「0件で黙って終わらない」ところまで。
 */
export function mustSome(list, what) {
  if (!list.length) {
    console.log(`::error::${what} を1件も読めませんでした（置き場が違う・名前が変わった）`);
    process.exit(2);
  }
  return list;
}

/* ------------------------------------------------------------------ 手で回す --
 * node tools/sprites/tsread.mjs site/content/residents.ts RESIDENTS icon
 *
 * **0件なら 2 で止まる**ことを、その場で見るための口。
 */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [file, name, idKey = "slug"] = process.argv.slice(2);
  if (!file || !name) {
    console.log("使い方: node tools/sprites/tsread.mjs <ファイル> <並びの名前> [合言葉の欄]");
    process.exit(2);
  }
  const src = readFileSync(file, "utf8");
  const got = readArray(src, name, { keys: [idKey], idKey });
  console.log(`${file} の ${name}: 名乗り ${got.declared} / 読めた ${got.rows.length}`);
  must(got, `${file} の ${name}`);
  process.exit(0);
}
