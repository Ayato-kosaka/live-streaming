/**
 * **YouTube でのログインが、押した瞬間にポップアップを開けるか。戻り先が面と同じドメインか。**
 *
 *     node site/selftest/firebase_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い
 *
 * ## なぜ要るか
 *
 * 2026-11-14、あやとのスマホで `ayato-arigato.com` の「YouTubeでログイン」を押すと、
 * ブラウザが「ブロックしたポップアップ: 1」を出し、面には「ログインできませんでした」が出た。
 * もう一度押すと開く。原因は2つあった（#147 #1202）。
 *
 * 1. **押されてから SDK を取りに行き、届いてからポップアップを開いていた。**
 *    押した瞬間から間が空くと、iPhone のブラウザは「人が押して開いた」と見なさない。
 *    2回目は SDK が手元に在るので間に合っていた
 * 2. **戻り先（`authDomain`）が `firebaseapp.com` で、面のドメインと違った。**
 *    Safari などはよそのドメインの保存を塞ぐので、結果が面へ戻らないことがある
 *
 * どちらも**型も巡回も通る。** 手元の Chrome では1回目から開くので、作った人の目にも出ない。
 * 誰かが `signIn` を `async` に戻して頭で `await` を1つ書いた日に、iPhone だけが
 * 黙ってまた塞がれる。だから字の形で見張る。
 *
 * | 静かに壊れる形 | 画面で起きること | ここが拾う |
 * | --- | --- | --- |
 * | `signIn` が押されてから SDK を待つ | iPhone の1回目だけ塞がれる | 3 |
 * | 塞がれたときにリダイレクトへ移らない | 「ログインできませんでした」が出る | 4 |
 * | リダイレクトから戻っても受け取らない | 入ったのに入っていない顔 | 5 |
 * | ボタンが出ても一式を取りに行かない | 3 と同じ（形は守れているのに、いつも待つ道） | 6 |
 * | SDK を静的に取り込む | ログインしない人にも全ページで 23KB 乗る | 7 |
 * | 戻り先がいつも `firebaseapp.com` | Safari で結果が戻らない | 1・2 |
 * | 戻り先をどのドメインでも面に替える | OAuth に戻り先を足していないプレビュー・手元で断られる | 1 |
 *
 * **押してから実際に何 ms で `window.open` が呼ばれるか**は、ここでは測らない
 * （書き出しをブラウザで開く仕事なので重い）。字の形で守り、測るのは直したとき。
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * 足は4本（但し書きを落とす・`signIn` の中身を切り出す・ポップアップの前の待ちを見つける・
 * 戻り先の表）。**本物を1つも数える前に、1本ずつ折って落ちることを見る。**
 * 折れなければ、本物の数字を出さずに 2 で帰る。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(SITE, "node_modules", ".bin", "tsc");
const FIREBASE_TS = process.env.FIREBASE_TS || join(SITE, "lib", "firebase.ts");
const AUTH_TSX = process.env.AUTH_TSX || join(SITE, "lib", "auth.tsx");
const SIGNIN_TSX = process.env.SIGNIN_TSX || join(SITE, "components", "live", "SignIn.tsx");

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
   足（判定の部品）。**対照が1本ずつ折れるように、全部ここで純粋な関数にする**
   =================================================================== */

/**
 * 但し書きを落とす。**字が在るかどうかで見てはいけない**——`auth.tsx` の但し書きには
 * 「`await` を置かない」と書いてあるので、落とさずに数えると但し書きの `await` を拾う。
 * 字の中の `//`（`https://…`）は落とさない。
 */
export const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\}/g, "{}")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** `head` の直後の `(` から、対になる `)` までを返す。見つからなければ "" */
export function callBody(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return "";
  const open = src.indexOf("(", i + head.length - 1);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < src.length; j += 1) {
    const c = src[j];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, j);
    }
  }
  return "";
}

/**
 * ポップアップを開く前に、待ちが挟まっているか。
 * `async` で始まる・`signInWithPopup(` より前に `await` がある、のどちらかなら挟まっている。
 * `signInWithPopup(` が無ければ、それも挟まっている扱い（開いていない）。
 */
export function waitsBeforePopup(body) {
  const at = body.indexOf("signInWithPopup(");
  if (at < 0) return "signInWithPopup( が無い";
  if (/^\s*async\b/.test(body)) return "async で始まる";
  const head = body.slice(0, at);
  if (/\bawait\b/.test(head)) return "signInWithPopup( より前に await";
  return "";
}

/** 戻り先の表。**3通り**（本番2つ・それ以外）と、取り違えやすい隣を並べる */
const DEFAULT = "live-streaming-d3cac.firebaseapp.com";
export const CASES = [
  ["ayato-arigato.com", "ayato-arigato.com"],
  ["live-streaming-d3cac.web.app", "live-streaming-d3cac.web.app"],
  ["localhost", DEFAULT],
  ["127.0.0.1", DEFAULT],
  // プレビューの面。OAuth に戻り先を足していないので、既定のまま
  ["live-streaming-d3cac--pr-1216-abcd1234.web.app", DEFAULT],
  // 字の尻が同じだけのよそ
  ["evil-ayato-arigato.com", DEFAULT],
  // 面を配らず 301 で apex へ送るドメイン
  ["www.ayato-arigato.com", DEFAULT],
  ["live-streaming-d3cac.firebaseapp.com", DEFAULT],
  ["AYATO-ARIGATO.COM", "ayato-arigato.com"],
];
export const misses = (fn) =>
  CASES.filter(([h, want]) => fn(h) !== want).map(([h, want]) => `${h}→${fn(h)}（${want}）`);

/** `firebase.ts` を組み立てて読む。型を取りに行かないので、文句は出ても書き出せたかで見る */
function loadFirebase(src) {
  if (!existsSync(TSC)) nothing(`${TSC} が無い（site の npm ci がまだ）`);
  if (!existsSync(src)) nothing(`${src} が無い`);
  const out = mkdtempSync(join(tmpdir(), "firebase-"));
  try {
    try {
      execFileSync(TSC, [
        src, "--outDir", out, "--module", "commonjs", "--target", "es2022",
        "--skipLibCheck", "--noResolve",
      ], { stdio: "pipe" });
    } catch {
      /* `firebase/auth` の型を引けないぶんの文句は出る。**書き出せたかで見る** */
    }
    const js = join(out, "firebase.js");
    if (!existsSync(js)) nothing(`${src} が組み立てられなかった`);
    const mod = { exports: {} };
    const req = createRequire(import.meta.url);
    new Function("require", "exports", "module", readFileSync(js, "utf8"))(req, mod.exports, mod);
    return mod.exports;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/* ===================================================================
   対照。**本物を1つも数える前に。** 足を1本ずつ折る
   =================================================================== */
{
  /* 足1 但し書きを落とす */
  check("対照1 但し書きの await は数えない",
    !stripComments("/** await を置かない */\nconst x = 1;").includes("await"));
  check("対照1b 行の但し書きも落とす", !stripComments("  // await する\nconst y = 2;").includes("await"));
  check("対照1c 字の中の // は残す",
    stripComments('const u = "https://a.b/c"; await f();').includes("await f()"));

  /* 足2 `signIn` の中身を切り出す。入れ子の括弧で止まらない */
  check("対照2 入れ子の括弧を越えて切り出す",
    callBody("const signIn = useCallback(() => { a(b(c)); }, [d]);", "const signIn = useCallback(")
      === "() => { a(b(c)); }, [d]");
  check("対照2b 無ければ空", callBody("const x = 1;", "const signIn = useCallback(") === "");

  /* 足3 ポップアップの前の待ち。**前の形（押されてから SDK を待つ）を落とす** */
  const before = `async () => {
    setBusy(true);
    const [auth, { signInWithPopup }] = await Promise.all([firebaseAuth(), import("firebase/auth")]);
    const res = await signInWithPopup(auth, provider);
  }, []`;
  check("対照3 前の形（async で SDK を待ってから開く）を拾う", waitsBeforePopup(before) !== "");
  check("対照3b async でなくても、前に await があれば拾う",
    waitsBeforePopup("() => { const k = await get(); k.fb.signInWithPopup(a, p); }") !== "");
  check("対照3c 開いていなければ拾う", waitsBeforePopup("() => { go(); }") !== "");
  check("対照3d 前に待ちの無い形は通す",
    waitsBeforePopup("(): Promise<void> => { setBusy(true); return k.fb.signInWithPopup(a, p).then(async () => { await x(); }); }") === "");

  /* 足4 戻り先の表。**どちらへ倒れても落ちる** */
  check("対照4 いつも既定のままを落とす", misses(() => DEFAULT).length > 0);
  check("対照4b いつも面のドメインを落とす", misses((h) => h.toLowerCase()).length > 0);
  check("対照4c 字の尻で当てる形を落とす",
    misses((h) => (/ayato-arigato\.com$|\.web\.app$/i.test(h) ? h.toLowerCase() : DEFAULT)).length > 0);

  if (BAD) {
    console.log(`\n対照が ${BAD} 件外れた。本物は数えない`);
    process.exit(2);
  }
}

/* ===================================================================
   本物
   =================================================================== */

const fb = loadFirebase(FIREBASE_TS);
if (typeof fb.authDomainFor !== "function" || !fb.FIREBASE) {
  nothing("firebase.ts から authDomainFor / FIREBASE が取れない（名前が変わった？）");
}
for (const p of [AUTH_TSX, SIGNIN_TSX]) if (!existsSync(p)) nothing(`${p} が無い`);
const fbSrc = stripComments(readFileSync(FIREBASE_TS, "utf8"));
const authSrc = stripComments(readFileSync(AUTH_TSX, "utf8"));
const signInSrc = stripComments(readFileSync(SIGNIN_TSX, "utf8"));

// 1. 戻り先が、開いたドメインで決まる（本番2つ・それ以外）
{
  const bad = misses(fb.authDomainFor);
  check(`戻り先 ${CASES.length} 通りが、開いたドメインで決まる`, bad.length === 0, bad.join(" / "));
  for (const [h, want] of CASES.slice(0, 3)) console.log(`       ${h} → ${fb.authDomainFor(h)}`);
  /* 「いまいる人」（`lib/hereRest.ts`）も同じ値を読んでいる。替えるのは authDomain だけ */
  check("既定の戻り先・projectId・apiKey は今までのまま",
    fb.FIREBASE.authDomain === DEFAULT && fb.FIREBASE.projectId === "live-streaming-d3cac"
      && /^AIza/.test(fb.FIREBASE.apiKey ?? ""));
}

// 2. 初期化が、開いている面のドメインを渡している
check("初期化が authDomainFor(location.hostname) を渡す",
  /initializeApp\(\s*\{[^}]*authDomain:\s*authDomainFor\(\s*location\.hostname\s*\)/.test(fbSrc));

// 3. 押してから開くまでに、待ちが挟まっていない
const signInBody = callBody(authSrc, "const signIn = useCallback(");
if (!signInBody) nothing("auth.tsx に `const signIn = useCallback(` が無い（名前が変わった？）");
{
  const why = waitsBeforePopup(signInBody);
  check("signIn がポップアップを開くまでに await を挟まない", why === "", why);
  check("signIn が、届いている一式（kit）を先に見る", /\bkit\s*\?/.test(signInBody));
}

// 4. 塞がれたら、リダイレクトでやり直す
{
  const refused = callBody(authSrc, "function popupRefused(");
  const judge = authSrc.slice(authSrc.indexOf("function popupRefused("), authSrc.indexOf("function popupRefused(") + 400);
  check("塞がれた（popup-blocked）ときに signInWithRedirect へ移る",
    signInBody.includes("popupRefused(") && signInBody.includes("signInWithRedirect(")
      && refused !== "" && judge.includes("popup-blocked"));
}

// 5. 戻ってきた面で受け取り、ポップアップと同じ後の処理を通す
{
  const welcomes = (authSrc.match(/\bwelcome\(res,\s*k\)/g) ?? []).length;
  check("戻ってきた面で getRedirectResult を受け取る", authSrc.includes("getRedirectResult("));
  check("ポップアップとリダイレクトが同じ後の処理（welcome）を通る", welcomes >= 2, `${welcomes} か所`);
  check("後の処理が POST /me に ytToken を送る",
    /fetch\(`\$\{API_BASE\}\/me`/.test(authSrc) && authSrc.includes("ytToken"));
}

// 6. ボタンが画面に出たら、一式を先に取りに行く
check("ログインのボタンが出たら readySignIn を呼ぶ",
  signInSrc.includes("readySignIn(") && signInSrc.includes("IntersectionObserver")
    && /ref=\{go\}[^>]*className="signin-go"|className="signin-go"[^>]*ref=\{go\}/.test(signInSrc));

// 7. SDK を静的に取り込まない（ログインしない人に乗せない）
{
  const statics = [];
  for (const [name, src] of [["firebase.ts", fbSrc], ["auth.tsx", authSrc], ["SignIn.tsx", signInSrc]]) {
    for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+"(firebase\/[^"]+)"/gm)) {
      statics.push(`${name}: ${m[1]}`);
    }
  }
  check("firebase の SDK を静的に取り込んでいない", statics.length === 0, statics.join(" / "));
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
