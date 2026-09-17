/**
 * 道具の中に**リポジトリの場所が直に書かれていないか**を数える。
 *
 *   node tools/sprites/rootcheck.mjs            数えて出す
 *   node tools/sprites/rootcheck.mjs --selftest 対照を回す
 *
 * 0=1件も無い / 1=直書きが残っている / 2=数えるものが無い（git が引けない）
 *
 * ## なぜ要るか（`docs/island-misses.md` #129 / #131）
 *
 * `route.mjs` にリポジトリの場所が直に書いてあって、**worktree から呼ぶと本体の
 * ファイルを読んでいた。** 枝で絵を差し替えても撮れるのは master の絵。しかも
 * **赤くならない。** 半年ぶん、誰にも見えないまま通っていた。
 * 同じ直書きが、git に在る道具だけで60本あった。
 *
 * 1度ぜんぶ外しても、**次に誰かが1行足せば元に戻る。** だからここで数える。
 *
 * ## 何を見て、何を見ていないか
 *
 * 見るのは `tools/sprites/` の下ぜんぶと、`tools/` の下の `.py`（＝今回ぜんぶ外した範囲）。
 * `tools/` の残り（`tools/rules/` など）は**見ていない側として同じ表に並べる。**
 * 「285本を見ている」ではなく「306本のうち285本を見ていて、13本は見ていない、
 * 8本は中身が字ではないので開いていない」と出す。前者は分母が消える（#129 の決めごと3）。
 *
 * ## 逃がしかた
 *
 * **外した記録として残したい言及**と、**対照の仕掛け**（この見張り自身が持っている、
 * わざと直書きした偽のファイル）には、同じ行に `直書き点検: 記録` と書く。
 * 印は**その行の中**に要るので、文字列の中に入れたくないときは行末のコメントに置く。
 * 逃がした行数も必ず出すので、こっそり黙らせることはできない。
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { extname, resolve } from "path";
import { fileURLToPath } from "url";
import { repoRoot } from "./repo.mjs";

/** 直書きと見なすもの。どちらも「別の誰かの持ち場」を指しうる */
const PATTERNS = [
  // 誰かのホームの下（`/home/user/live-streaming`、消えた `/home/user/atlas-wt` など。直書き点検: 記録）
  /\/home\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g,
  // 他の担当の worktree（`/tmp/wt-…`）
  /\/tmp\/wt-[A-Za-z0-9._-]+/g,
];

/** この行は記録なので数えない、という印 */
const KEEP = "直書き点検: 記録";

/** 中身が字ではないもの。読んでも意味が無い */
const BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf", ".otf", ".mp4",
]);

/** 今回ぜんぶ外した範囲＝見る側 */
function watched(rel) {
  return rel.startsWith("tools/sprites/") || rel.endsWith(".py");
}

/**
 * 1つのリポジトリを数える。
 * @returns {{files:number, seen:number, hits:Array, kept:number, blindFiles:number,
 *   blindHits:number, skipped:number}} `files = seen + blindFiles + skipped` になる
 */
export function scan(root) {
  let list;
  try {
    list = execFileSync("git", ["ls-files", "-z", "--", "tools"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1 << 26,
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null; // git が引けない。呼び元で 2 にする
  }

  const hits = [];
  let seen = 0,
    kept = 0,
    blindFiles = 0,
    blindHits = 0,
    skipped = 0; // 開かなかったもの（`_` 付き・絵や書体）。**足し算が合うように数える**

  for (const rel of list) {
    const base = rel.split("/").pop();
    // `_` 付きは使い捨てで git に入っていない。念のため弾く
    if (base.startsWith("_") || BINARY.has(extname(rel).toLowerCase())) {
      skipped += 1;
      continue;
    }
    let src;
    try {
      src = readFileSync(`${root}/${rel}`, "utf8");
    } catch {
      skipped += 1;
      continue; // 消えている・読めない
    }
    const mine = watched(rel);
    if (mine) seen += 1;
    let found = 0;
    src.split("\n").forEach((line, i) => {
      if (line.includes(KEEP)) {
        // 印だけ付けて何も書いていない行は数えない（逃がした数を水増ししない）
        for (const p of PATTERNS) {
          p.lastIndex = 0;
          if (p.test(line)) {
            kept += 1;
            break;
          }
        }
        return;
      }
      for (const p of PATTERNS) {
        p.lastIndex = 0;
        for (const m of line.matchAll(p)) {
          found += 1;
          if (mine) hits.push({ rel, line: i + 1, text: m[0] });
        }
      }
    });
    if (!mine) {
      blindFiles += 1;
      blindHits += found;
    }
  }
  return { files: list.length, seen, hits, kept, blindFiles, blindHits, skipped };
}

function main() {
  const root = repoRoot();
  const r = scan(root);
  if (!r) {
    console.log("::error::直書き点検: git ls-files が引けません。数えるものがありません");
    return 2;
  }
  if (r.seen === 0) {
    console.log(`::error::直書き点検: 見る対象が0本でした（root=${root}）。数えるものがありません`);
    return 2;
  }
  console.log(
    `直書き点検 根=${root}\n` +
      `  tools/ の git に在る ${r.files}本 ＝ 見た ${r.seen}本` +
      ` ＋ 見ていない ${r.blindFiles}本（tools/sprites と *.py の外。直書き ${r.blindHits}件あるが、` +
      `今回の持ち場ではないので落とさない）` +
      ` ＋ 開かなかった ${r.skipped}本（絵・書体など字でないもの）\n` +
      `  記録として逃がした行: ${r.kept}行`,
  );
  for (const h of r.hits) console.log(`::error::${h.rel}:${h.line} 直書き ${h.text}`);
  if (r.hits.length) {
    console.log(
      `直書き ${r.hits.length}件（見た ${r.seen}本）。` +
        `tools/sprites/repo.mjs の repoPath() / fromRoot()、Python は repo.py の repo_path() を使う`,
    );
    return 1;
  }
  console.log(`直書き 0件（見た ${r.seen}本）`);
  return 0;
}

/* ------------------------------------------------------------------ 対照 --
 * **見張りが本当に赤くなるか**を、偽のリポジトリで見る。
 * 通るほうだけ確かめると、「何も見ていないから通った」と区別がつかない。
 */
async function selftest() {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const ok = [];
  const ng = [];
  const check = (label, got, want) =>
    (String(got) === String(want) ? ok : ng).push(`${label}: 出た=${got} ほしい=${want}`);

  const base = mkdtempSync(join(tmpdir(), "rootcheck-"));
  /** git に在るファイルしか見ないので、偽のリポジトリも git にする */
  const fake = (name, files) => {
    const root = join(base, name);
    mkdirSync(join(root, "tools", "sprites"), { recursive: true });
    mkdirSync(join(root, "tools", "rules"), { recursive: true });
    for (const [rel, body] of Object.entries(files)) writeFileSync(join(root, rel), body);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    return root;
  };

  const clean = fake("clean", {
    "tools/sprites/a.mjs": 'import { repoPath } from "./repo.mjs";\nconst p = repoPath("site/public/og.png");\n',
  });
  const dirty = fake("dirty", {
    "tools/sprites/a.mjs": 'const p = "/home/user/live-streaming/site/public/og.png";\n', // 直書き点検: 記録（対照の仕掛け）
  });
  const wt = fake("wt", {
    "tools/sprites/a.mjs": 'const d = "/tmp/wt-someone/site/.next-3100";\n', // 直書き点検: 記録（対照の仕掛け）
  });
  const kept = fake("kept", {
    "tools/sprites/a.mjs": "// ここには `/home/user/live-streaming`（直書き点検: 記録）と書いてあった\n",
  });
  const outside = fake("outside", {
    "tools/rules/x.mjs": 'const p = "/home/user/live-streaming/firestore.rules";\n', // 直書き点検: 記録（対照の仕掛け）
    "tools/sprites/a.mjs": "// きれい\n",
  });
  const py = fake("py", { "tools/sprites/a.py": 'SRC = "/home/user/live-streaming/site/content/x.ts"\n' }); // 直書き点検: 記録（対照の仕掛け）

  check("きれいなら0件", scan(clean).hits.length, 0);
  // **直書きを足すと赤くなる**。ここが落ちたら、この見張りは何も止めていない
  check("直書きを足すと見つける", scan(dirty).hits.length, 1);
  check("見つけた場所を名指しする", scan(dirty).hits[0]?.rel, "tools/sprites/a.mjs");
  check("他の担当の worktree も見つける", scan(wt).hits.length, 1);
  check("記録の印がある行は数えない", scan(kept).hits.length, 0);
  check("記録として逃がした行数を出す", scan(kept).kept, 1);
  // 持ち場の外は落とさないが、**黙らせない**（見ていない側として数に出す）
  check("持ち場の外は落とさない", scan(outside).hits.length, 0);
  check("持ち場の外の直書きも数える", scan(outside).blindHits, 1);
  check("見ていない本数を出す", scan(outside).blindFiles, 1);
  // 分母が合わないと、どこかが黙って落ちている
  const o = scan(outside);
  check("見た＋見ていない＋開かなかった＝git に在る数", o.seen + o.blindFiles + o.skipped, o.files);
  check("Python も見る", scan(py).hits.length, 1);
  // 数えるものが無いときは、通ったことにしない
  check("git でないところは null", scan(join(base, "ない")), "null");

  rmSync(base, { recursive: true, force: true });

  console.log(`対照 ${ok.length + ng.length}件中 ${ok.length}件通った`);
  for (const line of ng) console.log(`::error::${line}`);
  if (ok.length === 0) {
    console.log("::error::対照が0件です");
    return 2;
  }
  return ng.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : main());
}
