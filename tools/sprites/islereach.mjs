/** **島の住人と建物に、指が届くかを本番で数える。**
 *
 *   node tools/sprites/islereach.mjs
 *   W=1280 node tools/sprites/islereach.mjs
 *   SEC=20 node tools/sprites/islereach.mjs      # 見る秒数（既定 12）
 *   PAGES=/island/caucasus node tools/sprites/islereach.mjs
 *
 * ## 1回突いて数えない
 *
 * **住人は歩く。** ある瞬間に建物の裏へ回り込んでいれば届かないし、
 * 次の瞬間には出てくる。1回だけ測って「5人届いた」と言っても、
 * それは**その瞬間の数**でしかない（実際、本番の表紙を5回引いて 1〜2 と揺れた）。
 *
 * なので**一定の時間ぶん、何度も突く**。出すのは3つ:
 *
 *   のべ    … 見ているあいだに一度でも届いた数（**これが「押せるものがあるか」**）
 *   いつも  … **測れた回すべてで**届いた数（歩いても隠れない場所にいるもの）
 *   1回ぶん … 1回の測定あたりの数（最小〜最大）
 *
 * ## 測れなかった回・測れなかったものを、0 と混ぜない
 *
 * 2026-09-14 に、この道具が3つの面で説明のつかない数を出した。
 * 原因は**どちらも「測れていない」を「届かなかった」として数えていた**こと
 * （`docs/island-misses.md` #79 #85 #87 と同じ形）。
 *
 * 1. **喋りは、途中から始まる。** 島に降りて9秒すると住人のほうから声をかけてくる
 *    （`components/isle/folk.ts` の `CALL_AFTER = 9000`）。喋っているあいだは
 *    `.isle.is-talking .isle-hit { pointer-events: none }` で**押しどころが全部止まる。**
 *    前は測り始める前に1回閉じるだけだったので、12秒のうち後半は毎回まるごと 0 になり、
 *    **「いつも」が積集合で 0 に落ちていた**（`/island/iran-walk` `/island/middle-east` が
 *    「のべ 6/6 なのに いつも 0」と出ていたのはこれ）。
 *    いまは**毎回見て、出ていたら閉じて、その回は数から外す。**
 *
 * 2. **画面の外にいるものは、届かないのではなく測れない。** 島はあやとに付いて動く
 *    カメラで、390px では島のほうが画面より大きい。`/island/caucasus` は6軒のうち
 *    2軒が画面の外に立っていて、それを「届かない」と数えて 3/6 と出ていた。
 *    いまは**測れずとして別に数える**（#85 の「飛ばした数を 0 と一緒に報告しない」）。
 *
 * 3. **突く先が、当たりの境目そのものだった。** 札の見えない当たりは
 *    ちょうど 48px（`chain.css` の `.isle-mark::before`）で、中心から 24px は
 *    その縁ぴったり。丸めしだいで下の地面が返るので、`/island/middle-east` の
 *    引きでは札4枚のうち2枚が (0,+24) だけで落ちて「入口が無い」と出ていた。
 *    23px にした（`plates.ts` が `TAP_FIT = 49` を取っているのと同じ理由）。
 *
 * ## 建物の入口は、当たりだけではない
 *
 * 引き（島をながめる）では、名前の出ている建物の押しどころは**札1枚に寄せてある**
 * （`chain.css` の `.isle[data-cam="wide"] .isle-spot.is-sign .isle-hit`）。
 * 建物の当たりだけを数えると、**設計どおりに札へ寄せたものが「届かない」と出る。**
 * なので建物は「当たり **または** 札」で数え、内訳を出す。
 *
 * 寄りと引きは入口の置き方が違うので、**両方測って両方出す。**
 *
 * ## 見た目の箱では測らない
 *
 * 中心と上下左右 23px を突いて、**自分が返るか**を見る。
 * `getBoundingClientRect` には、上に乗ったものに取られている場所が出ない。
 * **画面の外へ出た突き先は、外れではなく見送る**（縁に立っているものが
 * 「取られている」と出る。実測では0件だったが、0件だったことを今日はじめて確かめた）。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const SEC = Number(process.env.SEC || 12);
const PAGES = (process.env.PAGES || "/,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east").split(",");

/* 1回ぶんの見立て。返すのは要素ごとの状態:
     ok    … 届く
     taken … 上に乗ったものに取られている
     off   … 引っ込んでいる（48px を取れなかった。`plates.ts` の `fitHit` が null）
     out   … 画面の外（**測れない。届かないではない**）
     none  … そもそも押しどころが描かれていない（引きの住人など。測れない） */
const SNAP = `() => {
  /* **突く先は中心から 23px。24px ではない。**
     札の見えない当たり（chain.css の .isle-mark::before）は max(100%, 48px) で
     **ちょうど 48px**。中心から 24px はその境目そのものなので、丸めしだいで
     下の地面が返る。実測で /island/middle-east の引きは、札4枚のうち2枚が
     (0,+24) だけで落ちて「入口が無い」と出ていた（23px にすると4枚とも通る）。
     plates.ts が TAP_FIT = 49（48ではなく49）を取っているのと同じ理由。 */
  const D = 23;
  const reach = (el) => {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return "out";
    for (const [dx, dy] of [[0,0],[-D,0],[D,0],[0,-D],[0,D]]) {
      const px = cx + dx, py = cy + dy;
      // 突き先が画面の外なら見送る。外れとして数えると、縁のものが落ちる
      if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) continue;
      const h = document.elementFromPoint(px, py);
      if (!h || (!el.contains(h) && h !== el)) return "taken";
    }
    return "ok";
  };
  const state = (el, host) => {
    if (!el) return "none";
    if (host && host.getAttribute("data-hit") === "off") {
      // 引っ込んでいる。画面の外かどうかだけ先に分ける
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      return (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) ? "out" : "off";
    }
    if (getComputedStyle(el).pointerEvents === "none" || Number(getComputedStyle(el).opacity) === 0) return "off";
    return reach(el);
  };
  const isle = document.querySelector(".isle");
  const out = {
    talking: !!isle?.classList.contains("is-talking"),
    cam: isle?.getAttribute("data-cam") || "",
    who: [], hit: [], mark: [],
  };
  // 住人は **.isle-who（いつも描かれている入れ物）を鍵にする。**
  // 中の .isle-who-hit は描かれないことがあるので、それを並べて番号を振ると、
  // 1人欠けた瞬間に以降の全員の番号がずれる（aria-label は全員おなじなので
  // 名前では見分けられない。#87 で「のべ 1人」と出たのがこれ）。
  document.querySelectorAll(".isle-who").forEach((host) => {
    out.who.push(state(host.querySelector(".isle-who-hit"), host));
  });
  document.querySelectorAll(".isle-spot").forEach((host) => {
    out.hit.push(state(host.querySelector(".isle-hit"), host));
    out.mark.push(state(host.querySelector(".isle-mark"), null));
  });
  return out;
}`;

/** 数え上げ。要素ごとに「測れた回」だけを見る */
function tally(rounds, n) {
  const ever = new Set(), miss = new Set(), seenRounds = new Array(n).fill(0);
  const per = [];
  for (const r of rounds) {
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (r[i] === "ok") { ever.add(i); seenRounds[i]++; c++; }
      else if (r[i] === "taken" || r[i] === "off") { miss.add(i); seenRounds[i]++; }
    }
    per.push(c);
  }
  const measured = [];
  for (let i = 0; i < n; i++) if (seenRounds[i] > 0) measured.push(i);
  // 「いつも」＝測れた回すべてで ok だったもの
  let always = 0;
  for (const i of measured) {
    let all = true;
    for (const r of rounds) if (r[i] !== "out" && r[i] !== "none" && r[i] !== "ok") { all = false; break; }
    if (all) always++;
  }
  return { ever: ever.size, always, per, measured: measured.length, unmeasured: n - measured.length };
}

/** 建物は「当たり または 札」で数える。
 *  **札は救うだけ。落とさない。** 建物が画面の外にいるとき（＝測れない）、
 *  その札は縁へ寄せられて画面の中にいるが、寄りでは隠してある（`opacity:0`）。
 *  そこを「札も駄目」と読んで `taken`（届かない）に落とすと、
 *  **画面の外にいるだけの建物が「入口が無い」として数に出る**（#79 #85 と同じ形）。
 *  なので建物の状態は当たりのものを引き継ぎ、札が届くときだけ `ok` へ上げる。 */
const merge = (hit, mark) => hit.map((h, i) => (h === "ok" || mark[i] === "ok" ? "ok" : h));

const rng = (a) => (a.length ? `${Math.min(...a)}〜${Math.max(...a)}` : "-");

/** **出した数どうしの検算**（`docs/island-misses.md` #87）。
 *  外と突き合わせる前に、自分の中だけで矛盾していないかを見る。
 *  合わないときは、対象ではなく**この道具**が壊れている。 */
function 検算(名, t, n) {
  const 訴え = [];
  if (t.ever > t.measured) 訴え.push(`のべ${t.ever} > 測れた${t.measured}`);
  if (t.always > t.ever) 訴え.push(`いつも${t.always} > のべ${t.ever}`);
  if (t.per.length && Math.max(...t.per) > t.ever) 訴え.push(`1回ぶんの最大${Math.max(...t.per)} > のべ${t.ever}`);
  if (t.measured + t.unmeasured !== n) 訴え.push(`測れた${t.measured}＋測れず${t.unmeasured} ≠ 全体${n}`);
  if (訴え.length) console.log(`  ！ ${名} の数が合っていない（道具のほうが壊れている）: ${訴え.join(" / ")}`);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log(`${ORIGIN}  幅${W}px  ${SEC}秒ぶん`);
for (const path of PAGES) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
  await viaCurl(ctx);
  await offline(ctx);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
  await pg.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  const rounds = { who: [], hit: [], mark: [] };
  let talkRounds = 0, rounds総 = 0;
  const end = Date.now() + SEC * 1000;
  while (Date.now() < end) {
    const r = await pg.evaluate((src) => eval(src)(), SNAP);
    rounds総++;
    if (r.talking) {
      /* **喋りは途中から始まる。** 出ていたら閉じて、その回は数えない。
         喋っている最中はどこを押しても閉じるだけなので（`IsleStage` の
         `onStageClick`）、この click であやとは歩き出さない。 */
      talkRounds++;
      await pg.mouse.click(4, 4).catch(() => {});
      await pg.waitForTimeout(300);
      continue;
    }
    rounds.who.push(r.who); rounds.hit.push(r.hit); rounds.mark.push(r.mark);
    await pg.waitForTimeout(300);
  }
  const nWho = rounds.who[0]?.length ?? 0;
  const nHit = rounds.hit[0]?.length ?? 0;
  const who = tally(rounds.who, nWho);
  const door = tally(rounds.hit.map((h, i) => merge(h, rounds.mark[i])), nHit);
  const hitOnly = tally(rounds.hit, nHit);
  const markOnly = tally(rounds.mark, nHit);
  検算("住人", who, nWho); 検算("建物", door, nHit);
  console.log(
    `  ${path.padEnd(20)} 寄り 住人 のべ${String(who.ever).padStart(2)}/${who.measured}` +
    ` いつも${String(who.always).padStart(2)} 1回ぶん${rng(who.per).padStart(6)}` +
    (who.unmeasured ? ` 測れず${who.unmeasured}` : "") +
    ` ／ 建物 入口のべ${String(door.ever).padStart(2)}/${door.measured}` +
    ` いつも${String(door.always).padStart(2)} 1回ぶん${rng(door.per).padStart(6)}` +
    (door.unmeasured ? ` 測れず${door.unmeasured}` : "") +
    `（当たり${hitOnly.ever}・札${markOnly.ever}）` +
    `  ${rounds.hit.length}回` + (talkRounds ? ` ＋喋り${talkRounds}回は除外` : "") +
    `  JSエラー${errs.length}`,
  );

  /* 引き（島をながめる）。**入口の置き方が寄りと違う**ので、別に測る。
     引きの住人には押しどころが無い（設計どおり）ので、建物だけ見る。 */
  const view = await pg.$(".isle-view");
  if (view) {
    await view.click().catch(() => {});
    await pg.waitForTimeout(2500);
    const wr = { hit: [], mark: [] };
    const wend = Date.now() + Math.min(SEC, 6) * 1000;
    let wtalk = 0;
    while (Date.now() < wend) {
      const r = await pg.evaluate((src) => eval(src)(), SNAP);
      if (r.talking) { wtalk++; await pg.mouse.click(4, 4).catch(() => {}); await pg.waitForTimeout(300); continue; }
      if (r.cam !== "wide") break;
      wr.hit.push(r.hit); wr.mark.push(r.mark);
      await pg.waitForTimeout(300);
    }
    if (wr.hit.length) {
      const wd = tally(wr.hit.map((h, i) => merge(h, wr.mark[i])), nHit);
      const wh = tally(wr.hit, nHit); const wm = tally(wr.mark, nHit);
      検算("引きの建物", wd, nHit);
      console.log(
        `  ${"".padEnd(20)} 引き 建物 入口のべ${String(wd.ever).padStart(2)}/${wd.measured}` +
        ` いつも${String(wd.always).padStart(2)}` + (wd.unmeasured ? ` 測れず${wd.unmeasured}` : "") +
        `（当たり${wh.ever}・札${wm.ever}）  ${wr.hit.length}回`,
      );
    }
  }
  await ctx.close();
}
await b.close();
