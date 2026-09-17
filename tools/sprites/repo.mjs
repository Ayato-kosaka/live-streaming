/**
 * 「いま自分が居るリポジトリの根」を1か所で決める。
 *
 * ## なぜ要るか（`docs/island-misses.md` #129 / #131）
 *
 * `route.mjs` に `/home/user/live-streaming`（直書き点検: 記録）が直に書いてあった。**worktree から
 * 呼ぶと、本体のファイルを読む。** 枝で絵を差し替えても撮れるのは master の絵で、
 * しかも**赤くならずに通る**。写真には、それがどちらの枝のものかが写らない。
 *
 * 同じ直書きが、git に在る道具だけで60本あった。60回同じ探しかたを書けば、
 * 60通りの間違え方ができる。だから**ここ1本に寄せて、みんなが import する。**
 *
 * ## 決めかた
 *
 * **このファイルの居場所から上へ登って**、`site/public` と `tools/sprites` を
 * 両方持っている段を根と決める。worktree も clone も、この2つは必ず持っている。
 * 見つからなければ `git rev-parse --show-toplevel` にもう一度きく（`tools/` ごと
 * 別の場所へ写した場合の受け皿）。**どちらも駄目なら投げる。**
 *
 * 黙って `/home/user/live-streaming`（直書き点検: 記録）や `process.cwd()` に落ちない。落ちると、
 * 外したことが「撮れた写真が master のものだった」という**見えない形**でしか出ない。
 *
 * ## 使い方
 *
 *   import { repoPath, fromRoot } from "./repo.mjs";
 *   const ayato = repoPath("site/public/characters/ayato.webp");
 *   const DIST  = fromRoot(process.env.DIST || "site/.next-verify");
 *
 * `fromRoot()` は、絶対パスならそのまま通す。**外から絶対パスを渡す呼び方を
 * 壊さないため**（`DIST=/tmp/... node …` は今までどおり効く）。
 * 相対で渡されたときは **cwd ではなく根から**組む。道具は `tools/sprites/` の中から
 * 回すことも根から回すこともあるので、cwd 基準だと同じ `DIST=site/.next-3450` が
 * 呼ぶ場所で別のところを指す。**どこから回しても同じものを見る**ほうを取った。
 *
 * ## 自分で確かめる
 *
 *   node tools/sprites/repo.mjs --selftest
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";

/** 根の目印。**片方だけでは足りない**（`site/` だけなら site/site でも当たる） */
const MARKS = [
  ["site", "public"],
  ["tools", "sprites"],
];

/**
 * このファイルが入っているリポジトリの根。**決め打ちしない。**
 *
 * @param {string} [from] ここから上へ登る。既定はこのファイル自身。
 *   道具から渡すときは `fileURLToPath(import.meta.url)` を渡す（`tools/` の外に
 *   写した道具でも、その道具の居場所から登れるように）
 */
export function repoRoot(from = fileURLToPath(import.meta.url)) {
  let d = dirname(resolve(from));
  for (;;) {
    if (MARKS.every((m) => existsSync(join(d, ...m)))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(resolve(from)),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (top && existsSync(join(top, "site", "public"))) return top;
  } catch {
    /* git が無い・リポジトリの外。下で投げる */
  }
  throw new Error(
    `repo.mjs: リポジトリの根が見つかりません（${from} から上に site/public と tools/sprites を` +
      `両方持つ段がない）。どこのファイルを読めばいいか決まらないので、ここで止めます`,
  );
}

/**
 * 既定の根は1回だけ探す。`existsSync` を道具1本で何十回も叩かないため。
 * **引数付きで呼ばれたときは覚えない**（対照が別々の根を見に来るので）。
 */
let CACHE = null;
function defaultRoot() {
  if (CACHE === null) CACHE = repoRoot();
  return CACHE;
}

/** 根からの相対で組み立てる。`repoPath("site/public/og.png")` */
export function repoPath(...parts) {
  return join(defaultRoot(), ...parts);
}

/**
 * 絶対パスならそのまま、相対なら根から。
 * 環境変数で受けた置き場（`DIST` など）を通すのに使う。
 */
export function fromRoot(p) {
  return isAbsolute(p) ? p : join(defaultRoot(), p);
}

/* ------------------------------------------------------------------ 対照 --
 * `node tools/sprites/repo.mjs --selftest`
 *
 * **偽のリポジトリを2つ作って、別々の写しが別々のファイルを読むことを見る。**
 * 読んだ「中身」で見るのは、パスの文字を突き合わせるだけだと
 * **直書きに戻しても気づけない**から（文字は違っても同じ実体を指せる）。
 *
 * 併せて、**直書きに戻した写しを植えて、この対照が落ちること**も見る。
 * 落ちない対照は、通っても何も言っていない（`island-misses.md` #125 の片側）。
 */
async function selftest() {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } =
    await import("fs");
  const { tmpdir } = await import("os");

  const me = fileURLToPath(import.meta.url);
  const base = mkdtempSync(join(tmpdir(), "repocheck-"));
  const ok = [];
  const ng = [];
  // 外したときに出るのが**読んだファイルの中身そのもの**なので、短く切って出す。
  // 切らないと、直書きが残っている回の出力が 1.6MB の文字化けになる（実際になった）
  const brief = (v) => {
    const t = String(v).replace(/[^\x20-\x7e\p{L}\p{N}]/gu, ".");
    return t.length > 40 ? `${t.slice(0, 40)}…(${String(v).length}字)` : t;
  };
  const check = (label, got, want) =>
    (String(got) === String(want) ? ok : ng).push(`${label}: 出た=${brief(got)} ほしい=${brief(want)}`);

  /**
   * 偽のリポジトリ。`mark` が `site/public/og.png` の中身になる。
   * `hard` を渡すと、道具の側が**直書き**でそこを読む（外した状態の再現）。
   */
  const fake = (name, mark, hard) => {
    const root = join(base, name);
    mkdirSync(join(root, "site", "public"), { recursive: true });
    mkdirSync(join(root, "tools", "sprites"), { recursive: true });
    writeFileSync(join(root, "site", "public", "og.png"), mark);
    copyFileSync(me, join(root, "tools", "sprites", "repo.mjs"));
    // 道具の写し。根を自分で見つける版と、直書き版を作り分ける
    const body = hard
      ? `export const p = ${JSON.stringify(join(hard, "site", "public", "og.png"))};\n`
      : `import { repoPath } from "./repo.mjs";\nexport const p = repoPath("site", "public", "og.png");\n`;
    writeFileSync(join(root, "tools", "sprites", "tool.mjs"), body);
    return root;
  };

  const load = async (root) =>
    await import(`file://${join(root, "tools", "sprites", "tool.mjs")}`);
  const readVia = async (root) => readFileSync((await load(root)).p, "utf8");

  const a = fake("repo-a", "AAAA-これは a のファイル");
  const b = fake("repo-b", "BBBB-これは b のファイル");

  // 1. それぞれの写しが、自分の側の根を見つける
  const modA = await import(`file://${join(a, "tools", "sprites", "repo.mjs")}`);
  const modB = await import(`file://${join(b, "tools", "sprites", "repo.mjs")}`);
  check("a の写しが見つけた根", modA.repoRoot(), a);
  check("b の写しが見つけた根", modB.repoRoot(), b);
  check("2つの根が違う", modA.repoRoot() !== modB.repoRoot(), "true");

  // 2. **読んだ中身が別々**（ここが本丸。パスの文字ではなく実体で見る）
  check("a の道具が読んだ中身", await readVia(a), "AAAA-これは a のファイル");
  check("b の道具が読んだ中身", await readVia(b), "BBBB-これは b のファイル");
  check("2つが違う中身を読んだ", (await readVia(a)) !== (await readVia(b)), "true");

  // 3. **直書きに戻すと落ちること。** a を直に指す写しを b の場所に置くと、
  //    b の道具が a の中身を読む＝#129 そのもの。ここで落ちなければ対照が嘘
  const h = fake("repo-hard", "HHHH-これは hard のファイル", a);
  const hardRead = await readVia(h);
  check("直書きの写しは自分の中身を読めない（外した状態）", hardRead, "AAAA-これは a のファイル");
  check("直書きだと対照が落ちる", hardRead !== "HHHH-これは hard のファイル", "true");

  // 4. 根の無いところに置いた写しは、黙って落ちずに投げる
  const lost = join(base, "lost");
  mkdirSync(lost, { recursive: true });
  copyFileSync(me, join(lost, "repo.mjs"));
  const modL = await import(`file://${join(lost, "repo.mjs")}`);
  let threw = "投げなかった";
  try {
    modL.repoRoot(join(lost, "repo.mjs"));
  } catch {
    threw = "投げた";
  }
  check("根の無いところの写し", threw, "投げた");

  // 5. `site/` だけ・`tools/` だけの段を根と間違えない
  const half = join(base, "half");
  mkdirSync(join(half, "site", "public"), { recursive: true });
  mkdirSync(join(half, "sub", "tools", "sprites"), { recursive: true });
  let halfThrew = "投げなかった";
  try {
    modL.repoRoot(join(half, "sub", "tools", "sprites", "x.mjs"));
  } catch {
    halfThrew = "投げた";
  }
  check("片方しか無い段は根にしない", halfThrew, "投げた");

  // 6. `fromRoot` は絶対パスをそのまま通す（外から渡す呼び方を壊さない）
  check("fromRoot は絶対パスを触らない", modA.fromRoot("/tmp/どこか"), "/tmp/どこか");
  check("fromRoot は相対を根から組む", modA.fromRoot("site/public"), join(a, "site", "public"));

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
  if (process.argv.includes("--selftest")) process.exit(await selftest());
  else {
    console.log(`repo.mjs の根: ${repoRoot()}`);
    console.log("対照を回す: node tools/sprites/repo.mjs --selftest");
  }
}
