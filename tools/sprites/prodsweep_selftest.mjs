/**
 * `prodsweep.mjs` の**判定と、面の集めかた**だけを、本番もブラウザも無しで確かめる。
 *
 *     node tools/sprites/prodsweep_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るか
 *
 * `prodsweep.mjs` は**配ったあとに本番を一周する**見張りで、腐ったときに出るのは
 * **「違反 0」**（#157 #164）。0件はいちばん合格に見えるので、毎 PR で回す。
 *
 * ## ブラウザを使わない理由と、そのぶん失うもの
 *
 * CI には `tools/sprites/node_modules` が無いので、`playwright-core` を import した
 * 時点で見張りは import の行で死ぬ。`prodsweep.mjs` は curl しか使わず、
 * 借りている `prod.mjs` も `playwright-core` を**回すときに読む**（`prodcurl_selftest.mjs`
 * と同じ形）。**失うのは「本番に届くか」だけ。** そこは本物を1回回して見る。
 *
 * ## 足を1本ずつ抜く（`docs/island-standards.md` §15）
 *
 * 見る足は6本あって、**1本抜くたびに別々の台が、別々の項目で落ちる。**
 *
 * | 抜く足 | 落ちる台［落ちる項目］ |
 * | --- | --- |
 * | `status` | `404`［—］（404 が通ってしまう） |
 * | `h1` | `h1none` `h1two`［—］ |
 * | `title` | `titleempty` `titlenone`［—］ |
 * | `thin` | `thin`［—］ |
 * | `follow` | `moved`［status h1 title thin］（301 の本文21バイトを掴む） |
 * | `tell` | `moved`［tell］（追えてはいるが、追ったと言わない） |
 *
 * **`follow` と `tell` は同じ台を落とすが、落とす項目が違う。**
 * 台の名前だけで見比べると2本が同じ足に見えるので、**項目まで突き合わせる。**
 *
 * ## 3つの一覧の突き合わせ（2026-09-19 から）
 *
 * `prodsweep.mjs` は面を集めるために3つの一覧を持っている（sitemap・`/all`・
 * `site/app` の静的な道）。**3つが食い違っていること自体が不具合**なので、
 * そこも判定にした。足は6本で、こちらも**1本抜くたびに別々の台が落ちる。**
 *
 * | 抜く足 | 落ちる台［落ちる項目］ |
 * | --- | --- |
 * | `smiss` | `added`［—］（sitemap に無い面が通る＝検索から見つからない面ができる） |
 * | `amiss` | `dropped` `alias-wrongname`［—］ |
 * | `alias` | `alias`［amiss］（別名で行けるものまで落ちる） |
 * | `excuse` | `excuse-empty` `excuse-nodate`［—］ |
 * | `unused` | `unused`［—］（効かなくなった宣言が残る） |
 * | `claim` | `claim` `claim-none`［—］ |
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

import {
  ABSENCES, CONTROLS, LIST_CONTROLS, countH1, excuseOk, fetchOne, h1Name, judgePage, normPath,
  parseAll, reconcile, runControls, runListControls, runWireControls, sitemapPaths,
  staticAppPaths, titleOf,
} from "./prodsweep.mjs";
import { THIN_BYTES } from "./prod.mjs";

/* **偽のサーバへは proxy を通さない。** curl は環境変数を見るので、
   通すと自分の中の 127.0.0.1 にすら届かないことがある */
process.env.NO_PROXY = "127.0.0.1,localhost";
process.env.no_proxy = "127.0.0.1,localhost";

let OK = 0;
let BAD = 0;
/** 数えたものの総数。**1つも無ければ 2 で落ちる**（§15） */
let SEEN = 0;

function check(name, ok, got) {
  SEEN++;
  if (ok) { OK++; console.log(`  ok   ${name}`); }
  else { BAD++; console.log(`  NG   ${name}  ← ${got}`); }
}

const sig = (rows) =>
  rows.filter((r) => !r.ok).map((r) => `${r.name}[${r.keys.join(" ")}]`).sort().join(" ");

/* ------------------------------------------------ 1. 対照が、素で揃う -- */

console.log("1. 足を1本も抜かなければ、台8本がぜんぶ期待どおり");
{
  const rows = await runControls();
  check(`台は ${CONTROLS.length}本 立つ`, rows.length === CONTROLS.length, `${rows.length}本`);
  check("外れた台は無い", sig(rows) === "", sig(rows));
  /* **「落ちてほしい台が、狙った足だけで落ちた」まで見る。**
     ここを見ないと、台が別の理由で落ちていても素通りする */
  /* **落ちてほしい台が、狙った足「だけ」で落ちること。**
     1枚で2つも3つも折れる台を置くと、その足を抜いても台が別の理由で落ち続けて、
     **抜いたことに気づけない**（`/ctl/thin` を 21B の裸の本文にすると
     `h1` と `title` でも落ちて、`BREAK=thin` が空振りする） */
  for (const [name, , want, wantKeys] of CONTROLS) {
    if (want) continue;
    const row = rows.find((r) => r.name === name);
    check(`${name} は「${wantKeys.join(" ")}」だけで落ちる`,
      row.keys.join(" ") === wantKeys.join(" "), row.keys.join(" ") || "落ちなかった");
  }
  /* **その守りそのものが生きているか。** わざと足を書き違えた表を渡して、
     `runControls` が「狙いと違う足で落ちた」と言うところまで見る */
  const wrong = await runControls({ controls: [["thin", "/ctl/thin", false, ["h1"]]] });
  check("狙いと違う足で落ちた台は、外れたものとして返る",
    wrong.length === 1 && !wrong[0].ok && wrong[0].keys.join(" ") === "thin",
    JSON.stringify(wrong[0]));

  const moved = rows.find((r) => r.name === "moved");
  check("moved は追って通り、追ったことが字に出る",
    moved.got && moved.notes.length === 1 && moved.notes[0].includes("たどった"),
    JSON.stringify(moved.notes));
}

/* ------------------------------------------- 2. 足を1本ずつ抜くと落ちる -- */

console.log("2. 足を1本ずつ抜くと、別々の台が別々の項目で落ちる");
{
  /** 抜く足 → 外れてほしい台［外れてほしい項目］ */
  const WANT = {
    status: "404[]",
    h1: "h1none[] h1two[]",
    title: "titleempty[] titlenone[]",
    thin: "thin[]",
    follow: "moved[status h1 title thin]",
    tell: "moved[tell]",
  };
  const got = {};
  for (const leg of Object.keys(WANT)) {
    got[leg] = sig(await runControls({ legs: new Set([leg]) }));
    check(`BREAK=${leg} で外れる台`, got[leg] === WANT[leg], `${got[leg] || "1本も外れなかった"}`);
  }
  /* **足の数だけ落ちること。** 6本の抜きかたが同じ台を同じ項目で落としているなら、
     それは1本の足を6回折っているだけ（§15「対照は、足の数だけ用意する」） */
  const uniq = new Set(Object.values(got));
  check("6本の抜きかたが、6とおり別々に落ちる", uniq.size === 6, `${uniq.size}とおり`);
}

/* -------------------------------------------------- 3. 判定そのもの -- */

console.log("3. 判定（題名・h1・痩せ）");
{
  check("<head> の題名を拾う",
    titleOf("<html><head><title> あやと島 </title></head><body></body></html>") === "あやと島",
    JSON.stringify(titleOf("<html><head><title> あやと島 </title></head></html>")));
  /* **本文の SVG の題名を、面の題名として拾わない。**
     拾うと「題名が空」の面が、絵の説明のおかげで通る */
  check("本文の SVG の題名は拾わない",
    titleOf("<html><head></head><body><svg><title>絵の説明</title></svg></body></html>") === null,
    JSON.stringify(titleOf("<html><head></head><body><svg><title>絵の説明</title></svg></body></html>")));
  check("題名が空なら空で返る",
    titleOf("<html><head><title></title></head></html>") === "", "空でない");
  check("h1 を数える（属性つきも）",
    countH1('<h1 class="a">あ</h1><h1>い</h1>') === 2, String(countH1('<h1 class="a">あ</h1><h1>い</h1>')));
  check("h1 が無ければ 0", countH1("<h2>あ</h2>") === 0, String(countH1("<h2>あ</h2>")));

  const good = { status: 200, bytes: 50000, hops: 0, final: "/x", url: "/x",
    body: "<html><head><title>面</title></head><body><h1>面</h1></body></html>", err: null };
  check("まともな面は1つも落ちない", judgePage(good).checks.every((c) => c.ok),
    JSON.stringify(judgePage(good).checks.filter((c) => !c.ok)));
  const keys = (r) => judgePage(r).checks.filter((c) => !c.ok).map((c) => c.key).join(" ");
  check("境目のすぐ下は痩せで落ちる", keys({ ...good, bytes: THIN_BYTES - 1 }) === "thin",
    keys({ ...good, bytes: THIN_BYTES - 1 }));
  check("境目のすぐ上は落ちない", keys({ ...good, bytes: THIN_BYTES }) === "", keys({ ...good, bytes: THIN_BYTES }));
  /* 本番の最小の面（2026-09-19 の実測: `/roulette` 36,076B）は必ず通る */
  check("本番の最小の面（36,076B）は落ちない", keys({ ...good, bytes: 36076 }) === "", keys({ ...good, bytes: 36076 }));

  /* **読めなかったものを、測れた顔で 0 に畳まない**（#157） */
  const un = judgePage({ err: "届かない", status: null, body: "", bytes: 0, hops: 0, final: "/x" });
  check("読めなかった面は「違反0」にならず、読めなかったと返る",
    un.unread === true && un.checks.length === 0, JSON.stringify(un));

  /* 追ったのに黙る＝別の面を見ているのに気づけない（#164） */
  const told = judgePage({ ...good, hops: 1, final: "/cards", url: "/nordic/photos" });
  check("追ったら、どこからどこへ追ったかが字に出る",
    told.notes.length === 1 && told.notes[0].includes("/nordic/photos") && told.notes[0].includes("/cards"),
    JSON.stringify(told.notes));
  check("追っていなければ黙る", judgePage(good).notes.length === 0, JSON.stringify(judgePage(good).notes));
}

/* ------------------------------------- 4. 面の一覧が、手書きでないこと -- */

console.log("4. 面の一覧は、手で並べていない");
{
  /* 偽の `site/app` を作って、そこから出せることを見る。
     **手で並べた表なら、ここで1本も増えない** */
  const box = mkdtempSync(join(tmpdir(), "prodsweep-"));
  const app = join(box, "app");
  for (const d of ["", "about", "kitchen", "kitchen/[slug]", "(grp)/hidden",
    "nordic/day/[n]", "board/@side", "notapage"]) {
    mkdirSync(join(app, d), { recursive: true });
    if (d !== "notapage") writeFileSync(join(app, d, "page.tsx"), "export default function P(){}\n");
  }
  writeFileSync(join(app, "notapage", "layout.tsx"), "export default function L(){}\n");
  const got = staticAppPaths(app).paths;
  check("page.tsx の在る道が出る（表紙も）",
    got.includes("/") && got.includes("/about") && got.includes("/kitchen"), got.join(" "));
  check("動く段（[slug]）を含む道は出さない",
    !got.some((p) => p.includes("[")), got.join(" "));
  check("(group) は道に出さない", got.includes("/hidden") && !got.some((p) => p.includes("(")), got.join(" "));
  check("@slot は道に出さない", got.includes("/board") && !got.some((p) => p.includes("@")), got.join(" "));
  check("page.tsx が無い場所は出さない", !got.includes("/notapage"), got.join(" "));

  /* **1本足したら、道具を直さずに増える**（合格の条件2） */
  const before = staticAppPaths(app).paths.length;
  mkdirSync(join(app, "brandnew"), { recursive: true });
  writeFileSync(join(app, "brandnew", "page.tsx"), "export default function P(){}\n");
  const after = staticAppPaths(app).paths;
  check("面を1つ足すと、道具を直さずに1つ増える",
    after.length === before + 1 && after.includes("/brandnew"), `${before} → ${after.length}`);
  rmSync(box, { recursive: true, force: true });

  /* 読めない場所を渡されたら、0本を「0本でした」と言わずに理由を返す */
  const lost = staticAppPaths(join(box, "no-such-dir"));
  check("読めない場所は、理由つきで 0本を返す",
    lost.paths.length === 0 && lost.why !== "", JSON.stringify(lost));

  /* 本物のリポジトリ。**sitemap に無い面が落ちていないこと**まで見る。
     `/roulette` は配信に映る面で、sitemap には載っていない */
  const real = staticAppPaths().paths;
  check("本物の site/app から 20本以上出る", real.length >= 20, `${real.length}本`);
  for (const p of ["/roulette", "/me", "/me/desk", "/me/remote", "/me/roulette", "/design", "/nordic/photos"]) {
    check(`sitemap に無い ${p} が一覧に居る`, real.includes(p), real.join(" "));
  }
}

/* ---------------------------------------- 5. sitemap の読みかたと、足し算 -- */

console.log("5. sitemap から引いて、足りないぶんを足す");
{
  const XML = `<?xml version="1.0" encoding="UTF-8"?><urlset>
    <url><loc>https://example.test/</loc></url>
    <url><loc>https://example.test/about</loc></url>
    <url><loc>https://example.test/kitchen/curry</loc></url>
    <url><loc>https://example.test/about</loc></url></urlset>`;
  const srv = createServer((req, res) => {
    if (req.url === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(XML);
    }
    res.writeHead(404); res.end("no");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const sm = await sitemapPaths(base);
  check("<loc> から道だけを取り出す",
    sm.paths.join(" ") === "/ /about /kitchen/curry", sm.paths.join(" "));
  check("同じ道は1本にまとめる", sm.paths.length === 3, String(sm.paths.length));

  /* sitemap が無い（あるいは落ちた）ときに、0本を「0本でした」と言わない */
  const gone = await sitemapPaths(`${base}/nowhere`);
  check("sitemap が無ければ理由つきで 0本", gone.paths.length === 0 && gone.why !== "", JSON.stringify(gone));

  /* 足し算そのもの。**sitemap に在る道は二度数えない** */
  const extra = ["/", "/roulette", "/me"].filter((p) => !sm.paths.includes(p));
  check("sitemap に在る道は足さない（/ は重ねない）", extra.join(" ") === "/roulette /me", extra.join(" "));

  /* 404 を「読めなかった」に畳まない（`-f` を付けていない証拠） */
  const r404 = await fetchOne(`${base}/nowhere`);
  check("404 は読めたものとして返る（err ではない）",
    r404.err === null && r404.status === 404, JSON.stringify({ err: r404.err, status: r404.status }));

  await new Promise((r) => srv.close(r));
}

/* ------------------------------------ 6. 3つの一覧の突き合わせ（対照）-- */

console.log("6. 突き合わせの対照が、素で揃う／足を1本ずつ抜くと落ちる");
{
  const rows = runListControls();
  check(`台は ${LIST_CONTROLS.length}本 立つ`, rows.length === LIST_CONTROLS.length, `${rows.length}本`);
  check("外れた台は無い", sig(rows) === "", sig(rows));
  for (const [name, want, wantKeys] of LIST_CONTROLS) {
    if (want) continue;
    const row = rows.find((r) => r.name === name);
    check(`${name} は「${wantKeys.join(" ")}」だけで落ちる`,
      row.keys.join(" ") === [...wantKeys].sort().join(" "), row.keys.join(" ") || "落ちなかった");
  }
  /* **守りそのものが生きているか。** わざと足を書き違えた表を渡して、
     `runListControls` が「狙いと違う足で落ちた」と言うところまで見る */
  const wrong = runListControls({
    controls: [["claim", false, ["smiss"], (b) => ({ ...b, claimed: 99 })]],
  });
  check("狙いと違う足で落ちた台は、外れたものとして返る",
    wrong.length === 1 && !wrong[0].ok && wrong[0].keys.join(" ") === "claim",
    JSON.stringify(wrong[0]));

  /** 抜く足 → 外れてほしい台［外れてほしい項目］ */
  const WANT = {
    smiss: "added[]",
    amiss: "alias-wrongname[] dropped[]",
    alias: "alias[amiss]",
    excuse: "excuse-empty[] excuse-nodate[]",
    unused: "unused[]",
    claim: "claim-none[] claim[]",
  };
  const got = {};
  for (const leg of Object.keys(WANT)) {
    got[leg] = sig(runListControls({ legs: new Set([leg]) }));
    check(`BREAK=${leg} で外れる台`, got[leg] === WANT[leg], got[leg] || "1本も外れなかった");
  }
  check("6本の抜きかたが、6とおり別々に落ちる",
    new Set(Object.values(got)).size === 6, `${new Set(Object.values(got)).size}とおり`);

  /* **面を1つわざと落とす／わざと増やす／理由を消すが、別々に落ちる**
     （同じ足を3回折っているだけ、になっていないか） */
  const one = (n) => runListControls().length && sig(runListControls({ legs: new Set([n]) }));
  check("「落とす」「増やす」「理由を消す」は別々の足",
    new Set([one("amiss"), one("smiss"), one("excuse")]).size === 3,
    [one("amiss"), one("smiss"), one("excuse")].join(" / "));

  /* **線を通した対照。** 偽のサーバに sitemap.xml と `/all` を置いて、
     読みかたから突き合わせまでを本番と同じ道で回す。
     判定だけを直に叩く上の台は、**`/all` の刷り方が変わった日に何も言わない** */
  const wire = await runWireControls();
  check("線ごしの台が3本とも期待どおり", wire.every((r) => r.ok),
    wire.filter((r) => !r.ok).map((r) => `${r.name}[${r.keys.join(" ")}] ${r.why}`).join(" / "));
  check("線ごしでも、sitemap に無い1面は smiss で落ちる",
    wire.find((r) => r.name === "all-stray").keys.join(" ") === "smiss",
    JSON.stringify(wire.find((r) => r.name === "all-stray")));
  /* **落ちる側だけでは対照にならない。** 揃っている板で違反 0 になることまで見る */
  check("線ごしで、揃っている板は違反 0",
    wire.find((r) => r.name === "all-tidy").got === true,
    JSON.stringify(wire.find((r) => r.name === "all-tidy")));
}

/* --------------------------------- 7. 突き合わせの中身と、本物の宣言の表 -- */

console.log("7. `/all` の読みかたと、載せないと決めた理由の表");
{
  const HTML = `<html><head><title>島のなか ぜんぶ</title></head><body>`
    + `<h1>島のなか ぜんぶ</h1><p>島にある紙、3枚。ここからどこへでも1回で行ける。</p>`
    + `<ul class="dxl">`
    + `<li data-q="しま"><a class="dx" href="/"><span class="dx-body"><b>島</b><i>ここ</i></span></a></li>`
    + `<li data-q="えっくす"><a class="dx" href="/x/"><span class="dx-body"><b>エックス</b><i>あれ</i></span></a></li>`
    + `<li data-q="やま"><a class="dx" href="/y?q=1#top"><span class="dx-body"><b>ワイ</b><i>それ</i></span></a></li>`
    + `<li data-q="そと"><a class="dx" href="https://example.test/z"><b>ゼット</b></a></li>`
    + `</ul>`
    /* 一覧の外のリンク（頭の帯・足）。**`data-q` の無い `li` は行き先ではない** */
    + `<li><a href="/about">あやとのこと</a></li></body></html>`;
  const got = parseAll(HTML);
  check("`/all` の行から行き先と名前が出る",
    got.rows.map((r) => `${r.href}=${r.name}`).join(" ") === "/=島 /x=エックス /y=ワイ",
    JSON.stringify(got.rows));
  check("末尾の / と ? # は落とす", got.rows[1].href === "/x" && got.rows[2].href === "/y",
    JSON.stringify(got.rows.map((r) => r.href)));
  check("外の宛先は行き先に数えない", !got.rows.some((r) => r.href.includes("example")),
    JSON.stringify(got.rows));
  check("`data-q` の無い行は数えない", !got.rows.some((r) => r.href === "/about"),
    JSON.stringify(got.rows));
  check("名乗っている枚数を読む", got.claimed === 3, String(got.claimed));
  /* **読めなかったら null。0 に畳まない**（文言が変わった日に静かに通らないように） */
  check("名乗りが無ければ null", parseAll("<html><body></body></html>").claimed === null,
    String(parseAll("<html><body></body></html>").claimed));
  check("行が1つも無ければ理由つきで返る",
    parseAll("<html></html>").rows.length === 0 && parseAll("<html></html>").why !== "",
    JSON.stringify(parseAll("<html></html>")));
  check("外の宛先と # は道にしない",
    normPath("https://x.test/a") === null && normPath("#top") === null && normPath("mailto:a@b") === null,
    JSON.stringify([normPath("https://x.test/a"), normPath("#top"), normPath("mailto:a@b")]));

  /* 島の看板は `<h1><b>名前</b><i>添え書き</i></h1>`。**`<b>` を取る** */
  check("h1 の名前は `<b>` から取る（添え書きを混ぜない）",
    h1Name(`<h1 class="isle-sign"><b>北欧周遊</b><i>会いたい人に</i></h1>`) === "北欧周遊",
    h1Name(`<h1 class="isle-sign"><b>北欧周遊</b><i>会いたい人に</i></h1>`));
  check("`<b>` が無ければ h1 ぜんぶ", h1Name("<h1>島のなか ぜんぶ</h1>") === "島のなか ぜんぶ",
    h1Name("<h1>島のなか ぜんぶ</h1>"));

  /* 理由の形 */
  check("空の理由は通らない", !excuseOk(""), "通った");
  check("短い理由は通らない", !excuseOk("要らない"), "通った");
  check("日付の無い理由は通らない", !excuseOk("ログインした本人にしか中身が無い面だから"), "通った");
  check("日付つきの長い理由は通る", excuseOk("ログインした本人にしか中身が無い（2026-09-19）"), "落ちた");

  /* **本物の宣言の表。** ここが緩むと、食い違いを黙って畳める */
  check(`ABSENCES は ${ABSENCES.length}行`, ABSENCES.length >= 5, `${ABSENCES.length}行`);
  for (const a of ABSENCES) {
    check(`${a.path} の理由が形になっている`, excuseOk(a.why), JSON.stringify(a.why));
    check(`${a.path} の宛先が sitemap / all のどちらか`,
      a.lists.length > 0 && a.lists.every((l) => l === "sitemap" || l === "all"), a.lists.join(" "));
  }
  check("宣言に同じ（面, 一覧）が2度出てこない",
    new Set(ABSENCES.flatMap((a) => a.lists.map((l) => `${a.path}\t${l}`))).size
      === ABSENCES.reduce((n, a) => n + a.lists.length, 0),
    "重なっている");

  /* **3つとも揃っていれば、違反は 0**（素で落ちる作りになっていないか） */
  const clean = reconcile({
    sitemap: ["/", "/a"], all: [{ href: "/", name: "島" }, { href: "/a", name: "あ" }],
    app: ["/", "/a"], claimed: 2, absences: [],
  });
  check("3つ揃っていれば違反 0", clean.bad.length === 0, JSON.stringify(clean.bad));
  check("見た面の数が出る（分母）", clean.union.length === 2, String(clean.union.length));
}

/* ------------------------------------------------------------ まとめ -- */

console.log("");
if (SEEN === 0) {
  console.log("::error::数えるものが1つも無かった。");
  process.exit(2);
}
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件 / 見たのは ${SEEN} 件）。`);
  process.exit(1);
}
console.log(`${SEEN} 件ぜんぶ通った。`);
