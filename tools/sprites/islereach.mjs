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
 * ## 届かないものは、**名前で**出す
 *
 * 「入口のべ 11/12」までしか出していなかったので、どの1軒かは受け取った側が
 * 推定することになっていた。2026-09-14 に実際にそうなって、**寄りと引きで
 * 落ちている建物が別だった**（寄りは船着き場・引きは伝説の企画）のに、
 * 同じ1軒だと読んで進みかけた。いまは名前を3つに分けて出す。
 *
 *   一度も届かない … 測れた回はあるのに ok が1回も無い（**直す対象**）
 *   ときどき届かない … 歩く住人に隠されるなど、回によって変わる
 *   測れず … 島の箱の外にいて突きようが無い（**届かないではない**）
 *
 * ## 島の箱の外は「測れない」。画面の外ではない
 *
 * 島（`.isle`）は `overflow: hidden` の箱で、寄りではカメラがあやとを追うので
 * 島の一部が箱の外へ出る。前はここを画面の広さで見ていたため、
 * **島の下ふちより下・画面よりは上**に落ちた船着き場（当たりの箱 y=812〜860、
 * 島の箱 0〜726）が「届かない」として数に出ていた。切り取られて見えていない
 * ものは突きようが無い（#85）。
 *
 * ## 「今日の島」を開いた状態も測る（`FOLD=open`）
 *
 * 開いた板は島より背が高いので、島の上で開くと入口がまとめて隠れる。
 * **開いた状態は別の面**として測る。既定は閉じたまま。
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
import { at, net, ORIGIN } from "./islereachsite.mjs";
import { offline } from "./route.mjs";

const W = Number(process.env.W || 390);
const SEC = Number(process.env.SEC || 12);
/** 突く先の、中心からの距離。既定 23。**24 を渡すと縁ちょうどを突く** —
 *  札の見えない当たりを 49px にしたので、24px でも自分が返るはず。
 *  そこを確かめるための逃がし口（`D=24 node islereach.mjs`）。 */
const DIST = Number(process.env.D || 23);
const PAGES = (process.env.PAGES || "/,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east").split(",");
/** 「今日の島」の板を、測る前に開くか（`FOLD=open`）。既定は閉じたまま。
 *  **開くと隠れる入口がある**、を数えるための逃がし口。板が無い面では何もしない */
const FOLD = process.env.FOLD || "closed";

/* 1回ぶんの見立て。返すのは要素ごとの状態:
     ok    … 届く
     taken … 上に乗ったものに取られている
     off   … 引っ込んでいる（48px を取れなかった。`plates.ts` の `fitHit` が null）
     out   … 画面の外（**測れない。届かないではない**）
     none  … そもそも押しどころが描かれていない（引きの住人など。測れない） */
const SNAP = `() => {
  /* **突く先は中心から 23px。24px ではない。**
     札の見えない当たり（chain.css の .isle-mark::before）が **ちょうど 48px**
     だったころ、中心から 24px はその境目そのもので、丸めしだいで下の地面が
     返っていた（/island/middle-east の引きは札4枚のうち2枚が (0,+24) だけで
     落ちて「入口が無い」と出た）。**あちらを 49px にしたので 24px でも通る**が、
     ここは 23px のままにしておく。縁ちょうどを突きたいときは D=24 を渡す
     （islereach.mjs）。plates.ts の TAP_FIT = 49 と同じ考え。 */
  const D = DIST;
  /* **島は画面ではない。** 島（.isle）は overflow: hidden の箱で、
     カメラがあやとを追うぶん、島の一部は箱の外へ出る。箱の外に出た建物は
     切り取られて**見えていない**ので、突きようが無い。
     前はここを画面（innerWidth/Height）で見ていたので、島の下ふちより下・
     画面よりは上に落ちた船着き場が「届かない」として数に出ていた
     （幅390 の寄りで、当たりの箱が y=812〜860・島の箱は 0〜726）。
     **測れないものを、届かないものと混ぜない**（docs/island-misses.md #85）。 */
  const isleBox = (() => {
    const el = document.querySelector(".isle");
    const b = el ? el.getBoundingClientRect() : null;
    return {
      x0: Math.max(0, b ? b.left : 0),
      y0: Math.max(0, b ? b.top : 0),
      x1: Math.min(innerWidth, b ? b.right : innerWidth),
      y1: Math.min(innerHeight, b ? b.bottom : innerHeight),
    };
  })();
  const inside = (x, y) => x >= isleBox.x0 && y >= isleBox.y0 && x <= isleBox.x1 && y <= isleBox.y1;
  const reach = (el) => {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (!inside(cx, cy)) return "out";
    for (const [dx, dy] of [[0,0],[-D,0],[D,0],[0,-D],[0,D]]) {
      const px = cx + dx, py = cy + dy;
      // 突き先が島の外なら見送る。外れとして数えると、縁のものが落ちる
      if (!inside(px, py)) continue;
      const h = document.elementFromPoint(px, py);
      if (!h || (!el.contains(h) && h !== el)) return "taken";
    }
    return "ok";
  };
  /* **札の属性を信じない。ブラウザに聞く。**
     前は data-hit="off" が付いていたら、そこで「引っ込んでいる」と決めていた。
     ところが CSS には引っ込めたものを戻す規則があって（is-sign[data-far]）、
     属性は off なのに指は取る、という状態が実際にあった。**属性は書いた側の
     つもりで、いま押せるかどうかではない。** computed の pointer-events と
     opacity を見る（docs/island-misses.md #13「まずその判定を疑う」）。 */
  const state = (el) => {
    if (!el) return "none";
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none" || Number(cs.opacity) === 0) {
      // 指を受けない。島の外かどうかだけ先に分ける（外は「測れない」）
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      return inside(cx, cy) ? "off" : "out";
    }
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
    out.who.push(state(host.querySelector(".isle-who-hit")));
  });
  /* **名前も持って帰る。** 「12軒のうち1軒が届かない」まで出しても、
     どの1軒かが出ないと、直す側は推定で当たりを付けることになる。
     建物の aria-label は「◯◯をみる」で1軒ずつ違う（住人は全員おなじなので、
     あちらは並び順で見分ける。#87）。 */
  out.name = [];
  document.querySelectorAll(".isle-spot").forEach((host) => {
    const hit = host.querySelector(".isle-hit");
    out.name.push((hit?.getAttribute("aria-label") || "?").replace(/をみる$/, ""));
    out.hit.push(state(hit));
    out.mark.push(state(host.querySelector(".isle-mark")));
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
  /** 「いつも」に入れなかったもの。**番号で持つ**（名前は呼ぶ側が付ける） */
  const notAlways = [];
  /** 一度も届かなかったもの（測れた回はあるのに ok が1回も無い） */
  const never = [];
  for (const i of measured) {
    let all = true;
    for (const r of rounds) if (r[i] !== "out" && r[i] !== "none" && r[i] !== "ok") { all = false; break; }
    if (all) always++;
    else notAlways.push(i);
    if (!ever.has(i)) never.push(i);
  }
  /** 測れなかったもの（島の箱の外にいて、突きようが無かった） */
  const unseen = [];
  for (let i = 0; i < n; i++) if (seenRounds[i] === 0) unseen.push(i);
  return {
    ever: ever.size, always, per,
    measured: measured.length, unmeasured: n - measured.length,
    notAlways, never, unseen,
  };
}

/** 名前を並べる。**数だけ出して名前を出さないと、直す側が推定で当たりを付ける**
 *  （2026-09-14。「11/12」から「どれか」を当てにいって、寄りと引きで
 *  落ちている建物が別だったことに、名前を出すまで気づかなかった）。 */
const らん = (idx, names) => (idx.length ? idx.map((i) => names[i] ?? `#${i}`).join("・") : "");

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
console.log(`${ORIGIN}  幅${W}px  ${SEC}秒ぶん  今日の板=${FOLD === "open" ? "開" : "閉"}`);
for (const path of PAGES) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
  await net(ctx);
  await offline(ctx);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
  await pg.goto(at(path), { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  /* 「今日の島」を開いてから測る（`FOLD=open`）。
     **開いた状態は、閉じた状態と別の面**なので、両方測らないと
     「開くと入口が隠れる」が数に出ない。板の無い面では何もしない。 */
  let foldNote = "";
  if (FOLD === "open") {
    const tab = await pg.$(".today-tab");
    if (!tab) foldNote = "（今日の板は無い）";
    else {
      await tab.click().catch(() => {});
      await pg.waitForTimeout(900);
      /* **開いたあと、いちばん上へ戻す。** 中身は島の下に開くので、押すと
         そこまで送られる（`components/today/Today.tsx`）。送られたままだと
         島の上半分が画面の外に出て、**覆われたのではなく画面の外**の建物が
         「測れず」に回る。開く前と後を同じ位置で比べる（#87）。 */
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.waitForTimeout(400);
      const open = await pg.evaluate(() => !!document.querySelector(".today.is-open"));
      // 開かなかったのに測ると、閉じたままの数を「開いたときの数」として読む
      if (!open) foldNote = "（！ 開かなかった）";
    }
  }

  const rounds = { who: [], hit: [], mark: [] };
  let talkRounds = 0, rounds総 = 0;
  let lastNames = [];
  const end = Date.now() + SEC * 1000;
  while (Date.now() < end) {
    const r = await pg.evaluate(([src, d]) => eval(src.replace("const D = DIST;", "const D = " + d + ";"))(), [SNAP, DIST]);
    rounds総++;
    lastNames = r.name ?? lastNames;
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
  /** 建物の名前。**測るあいだ変わらない**（島は建て替わらない） */
  const names = lastNames;
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
    `  JSエラー${errs.length}${foldNote}`,
  );
  /** 届いていない建物を、**名前で**出す。数だけでは直せない */
  const 名残り = (t) =>
    [
      t.never.length ? `一度も届かない: ${らん(t.never, names)}` : "",
      t.notAlways.filter((i) => !t.never.includes(i)).length
        ? `ときどき届かない: ${らん(t.notAlways.filter((i) => !t.never.includes(i)), names)}`
        : "",
      t.unseen.length ? `測れず（島の箱の外）: ${らん(t.unseen, names)}` : "",
    ].filter(Boolean);
  for (const s of 名残り(door)) console.log(`  ${"".padEnd(20)} 寄り ${s}`);

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
      const r = await pg.evaluate(([src, d]) => eval(src.replace("const D = DIST;", "const D = " + d + ";"))(), [SNAP, DIST]);
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
      for (const s of 名残り(wd)) console.log(`  ${"".padEnd(20)} 引き ${s}`);
    }
  }
  await ctx.close();
}
await b.close();
