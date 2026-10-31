/**
 * スクショを撮るときの「外に出られない先」の差し替えを、1か所にまとめる。
 *
 * これまでは各スクリプトが自前で page.route を書いていて、住人12人ぶんを
 * まとめて `ayato.png` に差し替えていた。そのせいで**島の上の12人が
 * 全員そっくり同じ**に写り、「住人が生きているか」を見ても何も分からなかった。
 *
 * ブラウザからは lh3.googleusercontent.com / ggpht.com / firebasestorage.googleapis.com に
 * 出られないが、curl では取れる。
 * `python3 tools/sprites/avatars.py` で先に落としておくと、ここが
 * **本番と同じ絵を1人ずつ**返す。落としていなければ ayato.webp に落ちる。
 *
 * 使い方:
 *   import { offline } from "./route.mjs";
 *   const ctx = await b.newContext({ ... });
 *   await offline(ctx);
 *
 * ## リポジトリの場所を決め打ちしない（2026-09-17）
 *
 * ここには `/home/user/live-streaming`（直書き点検: 記録）が直に書いてあった。**worktree から
 * 呼ぶと、本体のファイルを読む。** 枝で絵を差し替えても撮れるのは master の絵で、
 * しかも**赤くならずに通る**。測っているものが違うのに、結果だけが出てくる。
 *
 * 根の求めかたは `repo.mjs` に置いた。同じ直書きが60本あったので、
 * **60通りの間違え方ができないように1か所へ寄せた**（`island-misses.md` #131）。
 * `repoRoot` はここからも出している（前からここを import している本があるため）。
 * 見つからなければ**その場で投げる。** 黙って既定の絵に落ちると、外したことが
 * 「12人が全員おなじ顔」という形でしか出ない。
 *
 * ## 何枚を本物で返したかを、終わりに必ず言う
 *
 * 落としてあるものが1枚も無いと、ここは全部を `ayato.webp` に差し替える。
 * それでもスクリプトは最後まで走り、絵の並んだ写真が撮れる。**嘘はそこで通る。**
 * だから種類ごとに「何回きて、何回を本物で返したか」を数えて、プロセスの終わりに
 * stderr へ1行出す。`ROUTE_STRICT=1` を付けると、**1枚も本物を返せなかった種類が
 * あるときに終了コードを 2 にする**（0=通った / 1=見つけた / 2=数えるものが無い）。
 *
 * ## 差し替えの絵は、本物と同じくらい軽くする（2026-10-23。#944）
 *
 * ここはサムネイルと外の写真に `site/public/og.png`（1200x630・550KB）を返していた。
 * `/island/caucasus/streams` はサムネイルが476枚あり、畳みを開いて下まで送ると
 * **1面で 260MB 余りを差し替えに通す。** それで描画の手が固まり、120秒返ってこない
 * （`reachwatch.mjs` の1面版・幅390で 8回中3回）。**効いているのは通したバイト数**で、
 * 同じ 1200x630 でも 12KB の JPEG なら止まらない。下の絵に替えて 8回中0回。
 * og.png は分かち合いの1枚で、サムネイルの代わりではない。
 *
 * だからサムネイルは `thumb-320x180.jpg` を返す。本物の mqdefault と同じ 320x180、
 * 15KB。**og.png を縮めたもの**にしてあるのは、撮った絵の上で「絵が入っている」と
 * 分かるように。無地にすると、枠が空いているのか絵が来たのか写真で見分けられない
 * （住人を1枚に潰したときと同じ失敗）。上限 20KB・縦横・無地でないことは
 * `--selftest` が**ブラウザに届いたバイト**で当てている。
 * `ROUTE_BREAK=og` で直す前（og.png）に戻る。止まる側に倒れるかを見る対照用。
 *
 * **外の写真（1枚返し）は og.png のまま。** いちばん多い `/nordic/finland` でも
 * 畳みを開いて下まで送って79枚・43MB で、同じ道具で8回中0回止まった（同日）。
 * 止まる重さには届いていないので、絵を替えて写りを変えることはしない。
 *
 * ## 自分で確かめる
 *
 *   node tools/sprites/route.mjs --selftest
 *
 * 偽のリポジトリを2つ作り、`ayato.webp` に**違う中身**を置いて、それぞれの
 * route.mjs が**自分の側の絵を返す**ことをブラウザに届いたバイトで見る。
 * 根の無いところに置いた写しが投げることも、同じところで見ている。
 * 本物のこの route.mjs が返すサムネイルの、バイト数・縦横・無地でないことも見る。
 */
import { createHash } from "crypto";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { repoRoot } from "./repo.mjs";

// 前からここを import している本があるので、顔ぶれは変えずに出し直す
export { repoRoot };

const AVATARS = "/tmp/avatars";
const CHARS = "/tmp/chars";

/** そこに何枚落ちているか。0 なら「本物を1枚も返せない」ということ。 */
function stock(dir) {
  try {
    return readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()).length;
  } catch {
    return 0;
  }
}

/**
 * 拡張子ちがいも含めて、落としてあるものを探す。
 *
 * 置き場のファイルは png / jpg / webp が混ざっているのに、口はどれも
 * `.webp` で呼ばせる。名前をそのまま引くと、混ざっている人だけが
 * 既定の絵に落ちる。**絵は出るので、写真を見ても分からない。**
 */
function sameName(base) {
  for (const ext of ["webp", "png", "jpg", "jpeg"]) {
    const p = `${base}.${ext}`;
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * 種類ごとの「何回きて、何回を本物で返したか」。
 * **プロセスを通して足す**（1つのスクリプトが context を何度も作るため）。
 */
const TALLY = new Map();
let PRINTER = false;

function tick(kind, real) {
  const t = TALLY.get(kind) ?? { asked: 0, real: 0 };
  t.asked += 1;
  if (real) t.real += 1;
  TALLY.set(kind, t);
}

/** いまの数え。撮り終わったところで自分で出したいとき用。 */
export function offlineTally() {
  return Object.fromEntries([...TALLY].map(([k, v]) => [k, { ...v }]));
}

function printTally() {
  if (TALLY.size === 0) return;
  const parts = [];
  const blind = [];
  for (const [kind, t] of TALLY) {
    parts.push(`${kind} ${t.real}/${t.asked}`);
    if (t.asked > 0 && t.real === 0) blind.push(kind);
  }
  process.stderr.write(`route.mjs 本物で返した枚数: ${parts.join(" / ")}\n`);
  if (blind.length) {
    // **ここが「全員おなじ顔で写る」状態。** 数を出さないと写真からは分からない。
    // 「写真」は元から1枚に潰す約束なので、ここには出さない
    process.stderr.write(
      `route.mjs ⚠ ${blind.join(" と ")} は1枚も本物を返せていません` +
        `（python3 tools/sprites/avatars.py / chars.py で先に落とす）\n`,
    );
    // `process.exit(n)` で終わるスクリプトでは、ここで付けても間に合わない。
    // 自分で見たいときは `offlineTally()` を呼んで、終わる前に判断する
    if (process.env.ROUTE_STRICT && !process.exitCode) process.exitCode = 2;
  }
}

/** サムネイルの差し替えの上限（バイト）。`--selftest` が届いたバイトで当てる */
export const THUMB_MAX = 20 * 1024;

/**
 * 対照用。`ROUTE_BREAK=og` で直す前の姿（サムネイルも og.png）に戻す。
 * **知らない名前は投げる。** 綴りを間違えたまま「戻したのに止まらない」と読むと、
 * 対照が効いていないことに気づけない
 */
function breakMode() {
  const v = process.env.ROUTE_BREAK || "";
  if (v && v !== "og") throw new Error(`route.mjs: ROUTE_BREAK=${v} は知らない名前です（og だけ）`);
  return v;
}

export async function offline(ctx, opts = {}) {
  const root = repoRoot();
  const heavy = breakMode() === "og";
  const og = `${root}/site/public/og.png`;
  const fallback = opts.avatar ?? `${root}/site/public/characters/ayato.webp`;
  const photo = opts.photo ?? og;
  // サムネイルは写真と別に持つ。`photo` を渡してくる道具でも、ここは本物と同じ 320x180 で返す
  const thumb = opts.thumb ?? (heavy ? og : `${root}/tools/sprites/thumb-320x180.jpg`);
  for (const p of [fallback, photo, thumb]) {
    if (!existsSync(p)) throw new Error(`route.mjs: 差し替えに使う絵がありません: ${p}`);
  }

  if (!PRINTER) {
    PRINTER = true;
    process.stderr.write(
      `route.mjs 根=${root} / 手元の絵 住人${stock(AVATARS)} 視聴者${stock(`${AVATARS}/yt`)} ` +
        `ショート${stock(`${AVATARS}/yt-thumb`)} キャラ${stock(CHARS)}\n`,
    );
    process.on("exit", printTally);
  }

  // 住人のキャラクター画像。URL の /d/<id> から1人ずつ引く
  await ctx.route(/lh3\.googleusercontent\.com/, (r) => {
    const m = /\/d\/([^=?/]+)/.exec(r.request().url());
    const local = m && `${AVATARS}/${m[1]}.png`;
    const hit = Boolean(local && existsSync(local));
    tick("住人", hit);
    r.fulfill({ path: hit ? local : fallback });
  });

  // 視聴者さんのアイコン（/about の他己紹介）。yt3 / yt4.ggpht.com にある。
  // 名前は URL の「=」より前の sha1（`tools/sprites/avatars.py` と同じ決め方）。
  // ここも1枚に潰すと11人が全員おなじ顔で写って、並びを見ても何も分からない
  await ctx.route(/ggpht\.com/, (r) => {
    const key = createHash("sha1").update(r.request().url().split("=")[0]).digest("hex");
    const local = `${AVATARS}/yt/${key}.jpg`;
    const hit = existsSync(local);
    tick("視聴者", hit);
    r.fulfill({ path: hit ? local : fallback });
  });

  // 外から借りている写真。中身は問わないので1枚で足りる。
  // **ここは差し替えた宛先なので、本物かどうかを判定しない**（`island-misses.md` #124）。
  // 数だけ出す。1枚返しが約束なので、上の警告には出さない
  await ctx.route(/upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, (r) => {
    tick("写真(1枚返し)", true);
    r.fulfill({ path: photo });
  });

  // ショート動画のサムネイル。**1枚に潰さない。**
  // **上の1枚返しより後に書く。** Playwright は後に登録した route から当てるので、
  // 先に書くと ytimg をまとめて潰しているほうに全部持っていかれる
  // 58本が全部おなじ絵で写ると、格子を見ても「絵が縦に切れているか」しか
  // 分からない（住人を ayato.png に潰していたときと同じ失敗）。
  // 先に `python3 tools/sprites/avatars.py` で落としておくと、ここが1枚ずつ返す
  // 落としていなければ `thumb`（320x180・15KB）。og.png を返すと配信の一覧で止まる（上の #944）
  await ctx.route(/i\.ytimg\.com\/vi\//, (r) => {
    const m = /\/vi\/([^/]+)\//.exec(r.request().url());
    const local = m && `${AVATARS}/yt-thumb/${m[1]}.jpg`;
    const hit = Boolean(local && existsSync(local));
    tick("ショート", hit);
    r.fulfill({ path: hit ? local : thumb });
  });

  // キャラクターの絵。島も図鑑もカードも、口ごしに置き場から取る（#284）。
  // 静的に配って撮るときは口が無いので、落としてあるものを返す。
  //   /island-api/characters/{id}/plain-128.webp
  //
  // **口の名前（.webp）と、置き場に在るファイルの拡張子は一致しない。**
  // 口はどの絵も `.webp` で呼ばせるが、置き場には png のまま上がっている人が
  // いる（実測で1人。島の12人のうち1人が `ayato.webp` に落ちていた）。
  // 名前をそのまま引くと、その人だけ顔が差し替わって写る——**絵は出るので、
  // 撮った人には「落ちた」ではなく「そういう顔」に見える。**
  // だから拡張子を替えて探し直す。
  await ctx.route(/\/island-api\/characters\/[^/]+\/(plain|scene)-\d+\.webp/, (r) => {
    const m = /\/characters\/([^/]+)\/((?:plain|scene)-\d+)\.webp/.exec(r.request().url());
    const local = m && sameName(`${CHARS}/island__characters__${decodeURIComponent(m[1])}__${m[2]}`);
    tick("キャラ", Boolean(local));
    r.fulfill({ path: local ?? fallback });
  });

  // 置き場を直に指した URL（図鑑が名簿から受け取るもの）。
  // **1枚に潰さない。** 図鑑は95人が並ぶ面なので、同じ絵で埋めると
  // 「大きさが揃っているか」すら見られなくなる（上の住人と同じ失敗）。
  // 先に落としておく: python3 tools/sprites/chars.py
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
    const m = /\/o\/([^?]+)/.exec(r.request().url());
    const name = m ? decodeURIComponent(m[1]).replaceAll("/", "__") : "";
    const local = `${CHARS}/${name}`;
    const hit = Boolean(name && existsSync(local));
    tick("キャラ", hit);
    r.fulfill({ path: hit ? local : fallback });
  });

  // 書体は next/font で自分のドメインから配るが、古い書き出しが残っていると叩きにいく
  await ctx.route(/fonts\.googleapis\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );

  return offlineTally;
}

/* ------------------------------------------------------------------ 対照 --
 * `node tools/sprites/route.mjs --selftest`
 *
 * **偽のリポジトリを2つ作って、撮り分ける。** どちらにも route.mjs の写しと
 * `site/public/characters/ayato.webp` を置き、中身だけ違うものにする。
 * それぞれの写しで `offline()` を回し、**ブラウザに届いたバイト**を見る。
 * 決め打ちが残っていれば、2つとも同じ（＝本体の）バイトが返る。
 *
 * 描かれた絵ではなくバイトで見るのは、差し替えたものが**画像として読めなくても
 * 「どちらのファイルが返ったか」だけは決まる**から。ここで見たいのはそれだけ。
 */
async function selftest() {
  const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { dirname } = await import("path");
  const { chromium } = await import("playwright-core");

  const me = fileURLToPath(import.meta.url);
  const base = mkdtempSync(join(tmpdir(), "routecheck-"));
  const ok = [];
  const ng = [];
  // 外したときに出るのが**絵のバイトそのもの**なので、短く切って出す
  // （切らないと、決め打ちが残っている回の出力が 123KB の文字化けになる。実際になった）
  const brief = (v) => {
    const s = String(v).replace(/[^\x20-\x7e\p{L}\p{N}]/gu, ".");
    return s.length > 40 ? `${s.slice(0, 40)}…(${String(v).length}字)` : s;
  };
  const check = (label, got, want) =>
    (String(got) === String(want) ? ok : ng).push(`${label}: 出た=${brief(got)} ほしい=${brief(want)}`);

  /** 偽のリポジトリ。`mark` が `ayato.webp` の中身になる */
  const real = repoRoot();
  const fake = (name, mark) => {
    const root = join(base, name);
    mkdirSync(join(root, "site", "public", "characters"), { recursive: true });
    mkdirSync(join(root, "tools", "sprites"), { recursive: true });
    writeFileSync(join(root, "site", "public", "characters", "ayato.webp"), mark);
    writeFileSync(join(root, "site", "public", "og.png"), `og-${mark}`);
    // サムネイルの差し替えも、根からの相対で探しに行く。写しにも置く
    copyFileSync(join(real, "tools", "sprites", "thumb-320x180.jpg"), join(root, "tools", "sprites", "thumb-320x180.jpg"));
    copyFileSync(me, join(root, "tools", "sprites", "route.mjs"));
    // route.mjs は根の求めかたを repo.mjs から借りているので、写しには両方要る
    copyFileSync(join(dirname(me), "repo.mjs"), join(root, "tools", "sprites", "repo.mjs"));
    return root;
  };

  const a = fake("repo-a", "AAAA-これは a の絵");
  const b = fake("repo-b", "BBBB-これは b の絵");

  // 根が見つかることを、まず字で見る（撮る前に）
  const modA = await import(`file://${join(a, "tools", "sprites", "route.mjs")}`);
  const modB = await import(`file://${join(b, "tools", "sprites", "route.mjs")}`);
  check("a の写しが見つけた根", modA.repoRoot(), a);
  check("b の写しが見つけた根", modB.repoRoot(), b);
  check("2つの根が違う", modA.repoRoot() !== modB.repoRoot(), "true");

  // 根の無いところに置いた写しは、黙って落ちずに投げる
  const lost = join(base, "lost");
  mkdirSync(lost, { recursive: true });
  copyFileSync(me, join(lost, "route.mjs"));
  copyFileSync(join(dirname(me), "repo.mjs"), join(lost, "repo.mjs"));
  const modL = await import(`file://${join(lost, "route.mjs")}`);
  let threw = "投げなかった";
  try {
    modL.repoRoot(join(lost, "route.mjs"));
  } catch {
    threw = "投げた";
  }
  check("根の無いところの写し", threw, "投げた");

  // 差し替えに使う絵が無ければ、撮り始める前に投げる（写真の og.png と、サムネイルと）
  const bare = fake("repo-bare", "x");
  rmSync(join(bare, "site", "public", "og.png"));
  const modBare = await import(`file://${join(bare, "tools", "sprites", "route.mjs")}`);
  const nothumb = fake("repo-nothumb", "y");
  rmSync(join(nothumb, "tools", "sprites", "thumb-320x180.jpg"));
  const modNothumb = await import(`file://${join(nothumb, "tools", "sprites", "route.mjs")}`);

  // ここからブラウザ。**届いたバイトで見る**（描かれた絵に頼らない）
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const got = async (mod) => {
    const ctx = await browser.newContext();
    await mod.offline(ctx);
    const page = await ctx.newPage();
    // **手元に無い id を使う。** 落としてあるものに当たると差し替えの既定が出ない。
    //
    // **`<img>` で読ませたものは、バイトが取れない。** Chromium は絵のバイトを
    // 持っておかないので `response.body()` が空で返る（実測。それで
    // 「2つとも同じ」に見えて1回はまった）。**そのまま開く**（`goto`）と本文が取れる。
    // 絵として読めなくても `goto` は失敗するだけで、返ってきたものは受け取れる
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("lh3.googleusercontent.com")),
      page.goto("https://lh3.googleusercontent.com/d/ROUTECHECK-NOPE=s128").catch(() => {}),
    ]);
    const body = (await res.body()).toString();
    await ctx.close();
    return body;
  };

  const bodyA = await got(modA);
  const bodyB = await got(modB);
  check("a の写しが返したバイト", bodyA, "AAAA-これは a の絵");
  check("b の写しが返したバイト", bodyB, "BBBB-これは b の絵");
  check("2つが違うバイトを返した", bodyA !== bodyB, "true");

  const throws = async (mod) => {
    const c = await browser.newContext();
    let threw = "投げなかった";
    try {
      await mod.offline(c);
    } catch {
      threw = "投げた";
    }
    await c.close();
    return threw;
  };
  check("差し替えの絵が欠けている写し", await throws(modBare), "投げた");
  check("サムネイルの差し替えが欠けている写し", await throws(modNothumb), "投げた");

  /* **本物のこの route.mjs が返すサムネイル。** 偽のリポジトリではなく、
     いま在る根の絵を、ブラウザに届いたバイトで見る。og.png（550KB）に戻ると
     配信の一覧が止まる（#944）ので、上限と縦横をここで落とす。
     **無地でないことも見る。** 1色の絵なら軽くはできるが、撮った写真で
     「絵が入っているか」を見分けられなくなる。 */
  const look = async (url) => {
    const ctx = await browser.newContext();
    await offline(ctx);
    const page = await ctx.newPage();
    const res = await page.goto(url);
    const buf = await res.body();
    // 届いたバイトを、同じ出どころの Blob にしてから描く（よその絵を canvas に描くと読めない）
    const seen = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin]));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const g = cv.getContext("2d");
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const colors = new Set();
      for (let i = 0; i < d.length; i += 4) colors.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
      return { w: bmp.width, h: bmp.height, colors: colors.size };
    }, buf.toString("base64"));
    await ctx.close();
    return { bytes: buf.length, ...seen };
  };
  const th = await look("https://i.ytimg.com/vi/ROUTECHECK-NOPE/mqdefault.jpg");
  check("サムネイルの縦横", `${th.w}x${th.h}`, "320x180");
  check(`サムネイルのバイト数（${th.bytes}）が ${THUMB_MAX} 以下`, th.bytes <= THUMB_MAX, "true");
  check(`サムネイルが無地でない（${th.colors}色）`, th.colors >= 16, "true");

  // 対照の口の綴り違いは、黙って直す前の姿にも直した姿にも落ちずに投げる
  const saved = process.env.ROUTE_BREAK;
  process.env.ROUTE_BREAK = "ogg";
  const typo = await throws({ offline });
  if (saved === undefined) delete process.env.ROUTE_BREAK;
  else process.env.ROUTE_BREAK = saved;
  check("ROUTE_BREAK の綴り違い", typo, "投げた");

  // 手元に無いものしか頼まなければ、本物は0枚。そこを黙らせない
  const t = modA.offlineTally();
  check("住人を1枚も本物で返せなかったことが数に出る", t["住人"]?.real, 0);
  check("住人に頼みが来たことも数に出る", t["住人"]?.asked > 0, "true");

  await browser.close();
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
    console.log(`route.mjs の根: ${repoRoot()}`);
    console.log("対照を回す: node tools/sprites/route.mjs --selftest");
  }
}
