/**
 * **「JS が動く前の字」に、言い切りが混ざっていないか**を数える。
 *
 *   tools/build.sh 3950
 *   python3 -m http.server 4950 --directory site/.next-3950 &
 *   DIST=site/.next-3950 SPORT=4950 node tools/sprites/preclaim.mjs
 *
 *   ONLY=/index.html …                # 面を1枚だけ
 *   SHOWDIFF=1 …                      # 拾わなかった差も全部出す（目で確かめるとき）
 *   BREAK=nopat …                     # わざと壊す（対照が落ちて 2 になる）
 *
 * 終了コード 0=言い切りは無い / 1=在った / 2=数えられなかった。
 *
 * **開発サーバーに当てない。** 書き出したものを静的に配ったところへ当てる
 * （`CLAUDE.md`「検証のしかた」）。`DIST` は面の一覧を作るのに読む**盤**で、
 * `SPORT` は中身を読む**配り先**。**この2つがずれていないことを毎回その場で見る**
 * （`servedDiff()`。実際にずれたまま測りかけた）。
 *
 * ## なぜ要るか（`docs/island-misses.md` #143）
 *
 * 出す前のチェックは、**全部「JS が動いたあとの姿」を見ている。**
 * 巡回（`crawl.mjs`）も、撮る道具7本も、26面の掃き出し（`tapink.mjs`）も、
 * ブラウザで開いて JS を走らせてから測る。**焼いた HTML そのものを読む目が
 * 1つも無かった。**
 *
 * そのせいで 2026-09-18 に、本番へ出たまま何日も残っていた嘘が2つ出た。
 *
 * | どこ | JS が動く前に出ていた字 | 本当は |
 * | --- | --- | --- |
 * | `components/live/NextUp.tsx` | **まもなく** | 旅は7日目。もう出発している |
 * | `components/atlas/Days.tsx` | **724 日目** | **737 日目**。日付が直書きで、毎日1ずつ嘘が育っていた |
 *
 * どちらも **JS が入れば正しくなる**ので、いまある道具は全部素通りした。
 * 島の1画面目が、9/12 から7日間、嘘を出したまま緑だった。
 *
 * ## 何を見るか
 *
 * **同じ面を2回開いて、引き算する。**
 *
 * 1. **JS を切って**開く（`javaScriptEnabled: false`）
 * 2. **JS を入れて**開く
 * 3. **1にしか無い字** = 「出るまでのあいだにしか出ていない字」
 *
 * その字は **いつ読まれるか決められない**（焼いてから何日後に開かれるか分からない）。
 * だから出してよいのは **どの日に読んでも本当なもの**だけ——日付か、そのものが
 * もともと持っている値（#143 の決めごと1）。
 *
 * ## 何を「言い切り」とみなすか（考えかた）
 *
 * **「今日がいつかを知らないと決められないことを、決まったものとして書いている字」**
 * を拾う。3つの形で見る。
 *
 * 1. **いまを指す語**（直示）。指す先が**読む日で変わる**——いま・今日・現在・今週。
 *    直示語はどの言語でも**閉じた集合**なので、ここだけは並べてよい（増えない）
 * 2. **段（フェーズ）を言い切るかたち**。ものごとが時間軸のどこに在るかを断定している。
 *    **語ではなく活用のかたちで拾う**——`〜中` `〜ている/ています` `〜てきた`
 *    `〜した/しました` `〜終わった` `〜済み` `〜まで`。
 *    かたちで拾うので、**明日そこへ別の動詞が入っても勝手に捕まる**
 *    （「帰ってきた」「旅立った」を並べておく必要がない）
 * 3. **今日を知らないと出せない数**。数に**相対の単位**が付いているもの——
 *    `◯日目` `あと◯日` `◯日前` `残り◯` `◯年ぶり`。これも組み合わせで拾う
 *
 * 逃がすもの（どの日に読んでも本当）:
 *
 * - **絶対の日付・時刻だけ**でできている行（`9/11` `2026年9月11日(金) 23:30`）
 * - **分からないと言っている**字（`未定` `不明` `—` `…`）。
 *   #143 の直しはどれも、言い切りをこちら側へ替えただけ
 *
 * **丁寧形（〜ます）は「これから」と読まない**（`#136` の決めごと2）。
 * 「湖に浮かぶ城があります」はいつ読んでも本当で、拾うと件数だけ増えて読まれなくなる。
 *
 * ## どれが嘘かは、機械では決められない
 *
 * `negclaim.mjs` と同じで、**候補を並べるところまでが道具の仕事**（#143 の決めごと3）。
 * 終了コード1は「**候補があった**」であって「壊れている」ではない。
 *
 * ## 引き算は「行」ではなく「空白を抜いた字」で当てる
 *
 * #143 で26面を測ったとき、差に出た14面のうち**ほとんどは畳みの開閉と行の割れ方**
 * だった。JS が入ると1つの段が2要素に割れたり、逆に繋がったりする。
 * 行そのままで引くと、そのぶんが全部「JS前にしか無い字」に化ける。
 * だから、**JS後の字を全部つないで空白を抜いたもの**に対して、
 * JS前の行（同じく空白を抜いたもの）が含まれるかで見る。割れても繋がっても残らない。
 *
 * ## JS が切れていることを、毎回その場で確かめる
 *
 * **ここが本体。** JS が切れていなければ差はいつも空になり、**何を仕込んでも「0件」**
 * になる。`prderr.mjs` が `console` だけ見ていて「わざと投げたのに0件」だったのと同じ形。
 *
 * だから、配る HTML に **印だけ付ける小さな script** を差し込んで、
 *
 * - JS を切った読みで、その印が **付いていない**こと
 * - JS を入れた読みで、その印が **付いている**こと（差し込み自体が効いている証拠）
 *
 * の両方を**面ごとに**見る。どちらかが外れたら、**数字を1つも出さずに 2 で落ちる。**
 *
 * ## 数える前に対照を通す（`docs/island-standards.md` §15）
 *
 * 作り物の面を2枚その場で組んで、4つを見てから本物へ行く。
 *
 * | 対照 | 見るもの | 外すと |
 * | --- | --- | --- |
 * | 仕込み | わざと言い切りを置いた面を**拾える** | `BREAK=nopat` |
 * | ふつう | 言い切りの無い面を**拾わずにいられる** | `BREAK=greedy` |
 * | JS切れ | JS を切る仕掛けが**効いていないときに止まる** | `BREAK=nojsguard` |
 * | 空 | **1面も開けなかったら 0 ではなく 2** | `BREAK=zerook` |
 * | 盤ちがい | **配っている先が `DIST` と違うときに止まる**（同じなら通る） | `BREAK=nodist` |
 *
 * **1つでも外れたら、本物の面の数字を1つも出さずに 2 で落ちる。**
 * `BREAK=` は判定の足を1本ずつ抜く（#128 の決めごと1）。
 *
 * ## CI には繋いでいない
 *
 * 書き出したもの（`site/.next-*`）とブラウザが要る。毎 PR で `next build` を
 * 回す値段に見合わないので、`python/selftest_runner.py` には入れていない。
 * 対照は**この道具が回るたびに毎回**通る（別のところに置くと、置いた先が
 * 回らない日に黙る。`island-standards.md` の「繋ぐ先」）。
 */
import { chromium } from "playwright-core";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./repo.mjs";
import { openChecked, reportMissing } from "./served.mjs";

const SPORT = process.env.SPORT || "4950";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
/* 既定の書き出し先は**この道具が居るリポジトリの中**から引く（#129 #131）。
   worktree で回した確かめが master を測った結果にならないように。 */
const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
/** JS を入れた側で、字が落ち着くのを待つ上限（ミリ秒） */
const WAIT_MS = parseInt(process.env.WAIT_MS || "20000", 10);
/** 面を絞る（`ONLY=/index.html`）。直す前と後を突き合わせるときに使う */
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
/** 差に出た行を、拾わなかったものまで全部出す（人が目で確かめるとき） */
const SHOWDIFF = !!process.env.SHOWDIFF;
/** わざと壊す。`nopat` / `greedy` / `nojsguard` / `zerook` / `nodist` */
const BREAK = process.env.BREAK || "";

/** 差し込む印。これが付いたかどうかで「JS が動いたか」を見る */
const MARK = "data-preclaim-ran";
/** 対照の作り物を配る、本物のどことも当たらない宛先 */
const FIXTURE = "http://preclaim.fixture";

/* ------------------------------------------------------------ 判定 -- */

/**
 * **いまを指す語**（直示）。指す先が読む日で変わるので、焼いた字に置けない。
 *
 * 直示語は閉じた集合なので、ここだけは並べる。`いま` は
 * 「歩い**てい ます**」の中に出てしまうので、続く仮名で切る。
 */
const DEIXIS =
  "(?:いま(?![すしせ])|今(?:日|週|月|年|季|シーズン|のところ|夜|朝|回|晩)|本日|きょう|現在|ただいま|目下|さっき|先ほど|このごろ|最近|昨日|きのう|明日|あす|あした)";

/**
 * **段（フェーズ）を言い切るかたち。**
 *
 * 語ではなく**活用のかたち**で拾う。ここに別の動詞が入っても勝手に捕まる。
 * `〜ます`（丁寧形の現在）は入れない——いつ読んでも本当な字まで拾ってしまう（#136）。
 */
const PHASE = [
  /* 進行・完了のアスペクト。`〜ている / 〜ています / 〜ていた / 〜てきた`。
     **文の切れ目で終わるものだけ。** 「とろりとした発酵乳」のような連体（うしろに
     名詞が続く形）は段の言い切りではない。実際に1回それで拾った */
  "て(?:い|き|しま)(?:る|ます|た|ました|ません)(?=[。、．，！？!?）」』]|$)",
  // `〜中`。進行中・開催中・移動中・募集中。地名や熟語の「中」と当たらないよう仮名/漢語のあとだけ
  "[ぁ-んァ-ン一-龥]中(?![学国心心身間央略略途東西南北核級間立])(?:です|だ|。|$|\\s)",
  // 済み・完了・終了・開始。**名詞のかたちで段を言い切っている**
  "(?:済み?|完了|終了|開始|到着|出発済)(?:です|だ|。|$|\\s|！)",
  // 過去のかたち。こちらも**文の切れ目で終わるものだけ**（連体は拾わない）
  "(?:し|着い|行っ|来|帰っ|発っ|終わっ|始まっ|過ぎ|なっ|だっ)(?:た|ました)(?=[。、．，！？!?）」』]|$)",
  // 近さ・経過を言う副詞。**どこに居るかを断定している**
  "(?:まもなく|間もなく|もうすぐ|そろそろ|いよいよ|ついに|すでに|既に|もはや|直前|目前|真っ最中|さいちゅう)",
  // `まだ` `もう`。**知らない側ではなく、知っている側として置かれている**
  "(?:まだ|もう)(?![ぁ-ん])",
  // 相対の区間。`クタイシ発まで` のような見出しは、いつの話かが読む日で変わる
  "まで\\s*$",
  "ぶり(?:の|に|です|$)",
];

/**
 * **今日を知らないと出せない数。** 数と、**相対の単位**の組み合わせで拾う。
 * 単位だけ・数だけでは拾わない（`No.13` `3人` は、そのものが持っている値）。
 */
const COUNTED = [
  "\\d+\\s*(?:日目|日め|年目|年め|ヶ月目|か月目|カ月目|箇月目|週目|週め|回目?\\s*の\\s*朝)",
  "(?:あと|残り|のこり)\\s*\\d+",
  "\\d+\\s*(?:日|時間|分|秒|週間|ヶ月|か月|年)\\s*(?:前|後|経(?:過|ち)|ぶり)",
  "\\d+\\s*日\\s*(?:目|め)",
];

/**
 * **数と、その見出しが別の行に割れているとき**に使う。
 *
 * 島の名刺は `<b>724</b>` と `<span>旅した日数</span>` が別の段に分かれていて、
 * `innerText` では「724」と「旅した日数」が別の行になる。行だけ見ると
 * **数字だけの行**なので、日付として逃がしてしまう（#115 の
 * 「`<b>0</b>日` がどこにも引っかからない」と同じ形）。
 *
 * だから、**隣の行まで含めた窓**に対して「経った／残っている」を言う見出しを探す。
 * 見出しはどちら側にも来る（「724 旅した日数」「あと 7 日」）ので両方向で当てる。
 */
const ELAPSED = "(?:日数|日目|日め|年目|年め|ヶ月目|か月目|カ月目|週目|週め|連続|経過|以来|ぶり|あと|残り|のこり)";
const COUNTED_CTX = [
  new RegExp(`\\d+[^\\d]{0,8}?${ELAPSED}`),
  new RegExp(`${ELAPSED}[^\\d]{0,8}?\\d+`),
];

/** 上から当てて、最初に当たった名前を付ける。名前は「なぜ拾ったか」そのもの */
const FAMILIES = [
  { name: "いまを指す語", re: new RegExp(DEIXIS) },
  { name: "段を言い切るかたち", re: new RegExp(PHASE.join("|")) },
  { name: "今日を知らないと出せない数", re: new RegExp(COUNTED.join("|")) },
];

/**
 * **逃がすもの。** どの日に読んでも本当な字。
 *
 * - 絶対の日付・時刻・数だけでできている行
 * - 「分からない」と言っている字（#143 の直しは全部こちら側へ替えた）
 */
/* **数を1つも持たない行は、ここで逃がさない。** `a-z` を入れていたので、
   ラテン文字だけの行がぜんぶ「日付だけの行」に化けていた。逃がす側を広く取ると、
   何を仕込んでも通る（`island-standards.md` §15）。日付として逃がすのは
   **数字を持っていて、日付と区切りの字しか無い**行だけ。 */
const DATE_ONLY = /^(?=.*\d)[\d\s年月日時分秒:：\/／.\-–—~〜()（）［\]【】曜月火水木金土]+$/;
const UNKNOWN = /^(?:未定|未詳|不明|わかりません|分かりません|—|――|…|\.\.\.|-|ー|\?|？)+$/;

/**
 * 1行を判定する。
 *
 * @param {string} line 空白を1つに畳んだ字
 * @returns {{hit: boolean, why: string}} `why` は当たった族の名前
 */
export function judge(line, prev = "", next = "") {
  const t = line.trim();
  if (!t) return { hit: false, why: "" };
  // 壊しかた `nopat`: 判定を外す。**仕込みを拾えなくなる**
  if (BREAK === "nopat") return { hit: false, why: "" };
  if (!UNKNOWN.test(t) && !DATE_ONLY.test(t)) {
    for (const f of FAMILIES) if (f.re.test(t)) return { hit: true, why: f.name };
  }
  /* 数だけの行は、**隣の行に見出しがある**ことがある。窓で当て直す。
     数字を持っているのは「その行」でなければならない——隣の行の数を
     この行のせいにしない */
  if (/\d/.test(t)) {
    /* 隣の行は**近いところだけ**見る。段まるごと繋ぐと、関係のない読みものの
       中の数と見出しが当たってしまう */
    const win = squash(prev).slice(-24) + squash(t) + squash(next).slice(0, 24);
    for (const re of COUNTED_CTX) {
      if (re.test(win)) return { hit: true, why: `今日を知らないと出せない数（隣の行と合わせて「${win.slice(0, 40)}」）` };
    }
  }
  return { hit: false, why: "" };
}

/** 空白（全角も改行も）を全部抜く。引き算はこの形で当てる */
const squash = (s) => String(s).replace(/[\s　]+/g, "");

/**
 * 1面ぶんの引き算。
 *
 * **引くのは「JS後に見えている字」ではなく「JS後に DOM へ残っている字」。**
 * わざと揃えていない。揃えると、**JS が入ると隠れるだけの字**——島の表紙の
 * 札の説明は、hydration のあと横に流す棚になって、選ばれていない札の説明が
 * 見えなくなる——が丸ごと「JS前にしか無い字」に化ける。実測で1面に11件出た。
 *
 * 見たいのは**入れ替わった字**（「まもなく」→「9/11」、「724 日目」→「737 日目」）
 * なので、**DOM から消えたかどうか**で引くほうが目的に合っている。
 * 隠れただけの字は DOM に残るので、ここで落ちる。
 *
 * @param {string[]} off JS を切って読んだ、**見えている**行
 * @param {string} onDom JS を入れたあと、**DOM に在る字ぜんぶ**（script は除く）
 * @returns {{line: string, hit: boolean, why: string}[]} JS前にしか無い行
 */
export function subtract(off, onDom) {
  // 壊しかた `greedy`: 引き算をやめて JS前の全行を候補にする。
  // **ふつうの面まで拾うようになる**（割れ方だけの差が全部候補に化ける）
  const blob = BREAK === "greedy" ? "" : squash(onDom);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < off.length; i++) {
    const line = off[i];
    const s = squash(line);
    if (!s) continue;
    if (blob.includes(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    const j = judge(line, off[i - 1] || "", off[i + 1] || "");
    out.push({ line, hit: j.hit, why: j.why });
  }
  return out;
}

/* ------------------------------------------------------- 読むしかけ -- */

/**
 * HTML に印を差し込む。**JS が動いたかどうかを、面ごとにその場で見るため。**
 *
 * 字は1文字も足さない（`documentElement` の属性を立てるだけ）ので、
 * 引き算の結果は変わらない。
 */
function inject(body) {
  const tag = `<script>document.documentElement.setAttribute(${JSON.stringify(MARK)},"1")</script>`;
  if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, tag + "</head>");
  if (/<body[^>]*>/i.test(body)) return body.replace(/<body[^>]*>/i, (m) => m + tag);
  return tag + body;
}

/**
 * 読む用の文脈をひとつ。
 *
 * @param {import("playwright-core").Browser} b
 * @param {boolean} js JS を入れるか
 * @param {Record<string,string>} [fixtures] 作り物の面（対照用）
 */
async function makeCtx(b, js, fixtures) {
  const ctx = await b.newContext({
    javaScriptEnabled: js,
    viewport: { width: WIDTH, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.route("**/*", async (r) => {
    const url = r.request().url();
    if (fixtures && url.startsWith(FIXTURE)) {
      const key = new URL(url).pathname;
      if (!(key in fixtures)) return r.fulfill({ status: 404, body: "no" });
      return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: inject(fixtures[key]) });
    }
    if (r.request().resourceType() !== "document") return r.continue();
    let res;
    try {
      res = await r.fetch();
    } catch {
      return r.abort().catch(() => {});
    }
    if (res.status() !== 200) return r.fulfill({ response: res });
    const headers = { ...res.headers() };
    delete headers["content-length"];
    delete headers["content-encoding"];
    await r.fulfill({ status: 200, headers, body: inject(await res.text()) });
  });
  return ctx;
}

/**
 * 1面を読む。**印が期待どおりかを一緒に返す。**
 *
 * `javaScriptEnabled: false` でも Playwright 側の `evaluate` は動く
 * （面の script だけが止まる）ので、字は `innerText` から取る。
 */
async function readPage(p, path, miss) {
  const o = await openChecked(p, ORIGIN, path, { miss });
  if (!o.ok) return null;
  return await grab(p);
}

/**
 * **`content-visibility: auto` の段を、読む前に開く。**
 *
 * 画面の外にある段は描かれないので `innerText` に出ない（`CLAUDE.md`）。
 * JS の有る無しでレイアウトが変わると、**描かれる段も変わる。**
 * そのずれが丸ごと「JS前にしか無い字」に化ける——実際に、島の表紙の札の説明と
 * `/nordic/day/*` の食べものの一行が、それで候補に並んだ。
 *
 * 送って回るのではなく、**描かないという指定のほうを外す。** 送りは止まる位置が
 * 毎回ぶれるので、同じ面を2回読んで別の字が出る。
 */
async function openAllText(p) {
  /* `page.addStyleTag()` は使えない。**JS を切った文脈では返ってこない**
     （5秒待っても解決しない。実測）。Playwright 側の `evaluate` は
     面の script と別の世界で動くので、そちらから足す。 */
  await p
    .evaluate(() => {
      const st = document.createElement("style");
      st.textContent =
        "*{content-visibility:visible !important;contain-intrinsic-size:auto !important;}";
      (document.head || document.documentElement).appendChild(st);
    })
    .catch(() => {});
}

async function grab(p, js) {
  /* **落ち着くまで待つ。** 固定の待ち時間だと、箱が混んでいる晩に hydration が
     間に合わず、**割れ方の違いがそのまま「JS前にしか無い字」に化ける。**
     実際に1回それで「いまどこいまいる国と、今週やることみる」を拾った
     （JS前は札の字が1行に繋がっていて、hydration で割れる）。
     だから時間ではなく、**同じ字が続けて3回取れたこと**で決める。 */
  await openAllText(p);
  const snap = () =>
    p.evaluate((mark) => {
      const t = document.body ? document.body.innerText || "" : "";
      /* **JS前は「見えている字」、JS後は「DOM に在る字ぜんぶ」。**
         わざと揃えていない。理由は `subtract()` のところに書いた。
         `<script>` は外す——Next は焼いた字を `self.__next_f.push(...)` に
         まるごと積むので、そこを読むと**どの字も「JS後にも在る」ことになって、
         何ひとつ拾えなくなる。** */
      const el = document.body ? document.body.cloneNode(true) : null;
      if (el) for (const x of el.querySelectorAll("script,style,template,noscript")) x.remove();
      return {
        ran: document.documentElement.hasAttribute(mark),
        at: location.pathname,
        lines: t.split("\n").map((s) => s.replace(/[\t ]+/g, " ").trim()).filter(Boolean),
        dom: el ? el.textContent || "" : "",
      };
    }, MARK);
  let last = await snap();
  let same = 0;
  const until = Date.now() + (js ? WAIT_MS : Math.min(WAIT_MS, 8000));
  while (Date.now() < until) {
    await p.waitForTimeout(250);
    const now = await snap();
      same =
      now.lines.join("\n") === last.lines.join("\n") &&
      now.dom === last.dom &&
      now.ran === last.ran &&
      now.at === last.at
        ? same + 1
        : 0;
    last = now;
    if (same >= 3) break;
  }
  return { ...last, settled: same >= 3 };
}

/**
 * 印の見張り。**JS を切る仕掛けが効いていないとき、ここで止める。**
 *
 * 返すのは2種類。
 *
 * - `kind: "broken"` … **道具のほうが壊れている。** 数字を出してはいけない（2）
 * - `kind: "moved"`  … **その面の性質。** 引き算では測れないので、名前を出して外す。
 *   毎回かならず出るものを 2 にすると「いつもの赤」に化けて、
 *   本当に壊れた日と見分けがつかなくなる（`island-standards.md` の毎晩の赤）
 *
 * @returns {{kind: string, why: string}|null}
 */
function jsGuard(where, off, on) {
  // 壊しかた `nojsguard`: 見張りを外す。**JS が切れていなくても素通りする**
  if (BREAK === "nojsguard") return null;
  if (off.ran)
    return { kind: "broken", why: `${where}: **JS を切ったつもりの読みで、面の script が動いていた**（切る仕掛けが効いていない）` };
  if (!on.ran)
    return { kind: "broken", why: `${where}: JS を入れた読みで印が付かなかった（差し込みが効いていない／面が開けていない）` };
  /* **別の面へ送られたら、引き算は別ものどうしの引き算になる。**
     `components/ui/GoTo.tsx` を置いた面（`/nordic/photos` → `/cards`）がこれで、
     元の面の字がまるごと「JS前にしか無い字」に化ける。数えずに、送られたことを出す。 */
  if (off.at !== on.at)
    return { kind: "moved", why: `${where}: JS が入ると ${on.at} へ送られる（引き算は別の面どうしになる）` };
  return null;
}

/**
 * **配られているものが、DIST と同じ中身か。**
 *
 * この道具は、面の一覧を `DIST`（ディスク）から作り、中身は `SPORT` の
 * サーバから読む。**この2つがずれていても、何も赤くならない。**
 *
 * 実際にずらした（2026-09-18。この道具を最初に回した回）。前の担当が
 * 4950 に別の書き出しを配ったまま落ちていて、こちらが同じポートで
 * 配り直したつもりが `Address already in use` で立ち上がらず、
 * **直したはずの master を測っていたつもりで、直す前の写しを測っていた。**
 * そのときは「まもなく」が出たので気づけたが、**逆向き——直す前を測りたいのに
 * 直した後が配られている——なら、0件が出て「通った」と読む。**
 *
 * 見分けかたは字ではなくバイト列。`last-modified` でも件数でもなく、
 * **ディスクのファイルと、配られてきたものが1バイトも違わないこと**を見る。
 *
 * @param {string[]} pages 面（`/index.html`）
 * @param {string} dist ディスク側の置き場
 * @param {string} origin 配っている先
 * @returns {Promise<string[]>} 食い違った面（空なら一致）
 */
export async function servedDiff(pages, dist, origin) {
  // 壊しかた `nodist`: 突き合わせをやめる。**別の書き出しを測っても素通りする**
  if (BREAK === "nodist") return [];
  const bad = [];
  for (const page of pages) {
    let want;
    try {
      want = readFileSync(join(dist, page.replace(/^\//, "")));
    } catch (e) {
      bad.push(`${page}: ディスク側が読めない（${String(e).slice(0, 60)}）`);
      continue;
    }
    let got;
    try {
      const r = await fetch(origin + page);
      if (!r.ok) {
        bad.push(`${page}: 配っている先が HTTP ${r.status}`);
        continue;
      }
      got = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      bad.push(`${page}: 配っている先に届かない（${String(e).slice(0, 60)}）`);
      continue;
    }
    if (!got.equals(want))
      bad.push(`${page}: 配られている中身が ${dist} と違う（配 ${got.length}B / 盤 ${want.length}B）`);
  }
  return bad;
}

/* ---------------------------------------------------------- 対照 -- */

/** わざと言い切りを仕込んだ面。**JS が入ると、どれも本当の字に変わる** */
const PLANT = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>仕込み</title></head>
<body><main><h1>仕込みの面</h1>
<p id="a"><b>まもなく</b></p>
<p id="b">724 日目</p>
<p id="c">クタイシ発まで</p>
<p id="d">進行中</p>
<p id="e">いま、島にいます</p>
<p id="f">あと 7 日</p>
<p id="g">もう出発しました</p>
<div><b id="h" style="display:block">614</b><span style="display:block">毎日配信の日数</span></div>
<p>2026年9月11日(金) 23:30 出発</p>
<p>ヒッチハイクで北欧へ</p>
<script>
  var v = {a:"9/11", b:"737 日目", c:"ストックホルム", d:"未定", e:"ノルウェーの道ばた", f:"9/20", g:"9/11", h:"621"};
  for (var k in v) document.getElementById(k).textContent = v[k];
</script>
</main></body></html>`;

/** 仕込みのうち、**拾えなければいけない**字 */
const PLANT_WANT = [
  "まもなく",
  "724 日目",
  "クタイシ発まで",
  "進行中",
  "いま、島にいます",
  "あと 7 日",
  "もう出発しました",
  // **数と見出しが別の行に割れている**形（島の名刺がこれ。#115 と同じ落とし穴）
  "614",
];

/**
 * ふつうの面。**1件も拾ってはいけない。**
 *
 * 囮は過去に踏んだ形を置いてある——JS前にしか無いが**いつ読んでも本当**な字
 * （日付・未定・固有名）、**JS後にしか無い**言い切り（見る先が違う）、
 * **行の割れ方だけの差**（#143 で14面のうちほとんどがこれだった）。
 */
const PLAIN = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ふつう</title></head>
<body><main><h1>ふつうの面</h1>
<p id="a">2026年9月11日</p>
<p id="b">未定</p>
<p id="c">—</p>
<p id="d">ノルウェー</p>
<p id="e"></p>
<p id="f">いま、ヒッチハイクで北欧へ</p>
<p>湖に浮かぶ城があります。停まってくれる車を待つ時間も、そのまま配信になります。</p>
<script>
  document.getElementById("a").textContent = "9月11日(金)";
  document.getElementById("b").textContent = "9/20";
  document.getElementById("c").textContent = "3";
  document.getElementById("d").textContent = "スウェーデン";
  document.getElementById("e").textContent = "進行中";
  document.getElementById("f").innerHTML = "<span>いま、</span><span>ヒッチハイクで北欧へ</span>";
</script>
</main></body></html>`;

/**
 * 対照を4つ通す。**1つでも外れたら本物の面を1枚も測らない。**
 *
 * @returns {Promise<{ok: boolean, rows: {name: string, want: string, got: string, ok: boolean}[]}>}
 */
async function controls(b) {
  const rows = [];
  const add = (name, want, got) => rows.push({ name, want, got, ok: want === got });
  const fixtures = { "/plant.html": PLANT, "/plain.html": PLAIN };

  /** 作り物を、本物とまったく同じ道（差し込み・印の見張り・引き算）で読む */
  const readFixture = async (path, breakJsOff) => {
    const out = {};
    for (const js of [false, true]) {
      // `breakJsOff` は「JS を切ったつもりが切れていない」の再現。
      // 切る側の文脈を **JS 入りで作る**（仕掛けが効いていない状態そのもの）
      const ctx = await makeCtx(b, js || (breakJsOff && !js), fixtures);
      const p = await ctx.newPage();
      await p.goto(FIXTURE + path, { waitUntil: "domcontentloaded" }).catch(() => {});
      out[js ? "on" : "off"] = await grab(p, js);
      await ctx.close();
    }
    return out;
  };

  // 1. 仕込み → 拾えること
  {
    const r = await readFixture("/plant.html", false);
    const guard = jsGuard("仕込み", r.off, r.on);
    const got = guard ? [] : subtract(r.off.lines, r.on.dom).filter((x) => x.hit).map((x) => x.line);
    const missed = PLANT_WANT.filter((w) => !got.some((g) => squash(g) === squash(w)));
    add(
      "仕込み（わざと言い切りを置いた面）",
      `${PLANT_WANT.length}件とも拾う`,
      guard ? `見張りで止まった: ${guard.why}` : missed.length ? `拾えなかった: ${missed.join("・")}` : `${PLANT_WANT.length}件とも拾う`,
    );
  }

  // 2. ふつう → 拾わずにいられること
  {
    const r = await readFixture("/plain.html", false);
    const guard = jsGuard("ふつう", r.off, r.on);
    const got = guard ? ["（見張りで止まった）"] : subtract(r.off.lines, r.on.dom).filter((x) => x.hit).map((x) => `「${x.line}」`);
    add("ふつう（言い切りの無い面）", "0件", got.length ? `${got.length}件 拾った: ${got.join(" ")}` : "0件");
  }

  // 3. JS を切る仕掛けが効いていない → 2 で止まること
  {
    const r = await readFixture("/plant.html", true);
    const guard = jsGuard("JS切れの見張り", r.off, r.on);
    const diff = subtract(r.off.lines, r.on.dom).filter((x) => x.hit).length;
    add(
      "JS を切る仕掛けが効いていない",
      "止まる",
      guard && guard.kind === "broken" ? "止まる" : `止まらなかった（そのまま数えると 言い切り ${diff}件＝仕込んだのに 0件 になる）`,
    );
  }

  // 4. 1面も開けなかった → 0 ではなく 2
  {
    const miss = [];
    const ctx = await makeCtx(b, false, fixtures);
    const p = await ctx.newPage();
    await p.goto(FIXTURE + "/nowhere.html", { waitUntil: "domcontentloaded" }).catch(() => {});
    // `openChecked` と同じ数え方で「開けなかった」を積む
    miss.push("（作り物）開けない面");
    await ctx.close();
    add("1面も開けなかったとき", "2", verdict({ seen: 0, miss: miss.length, hits: 0 }) === 2 ? "2" : String(verdict({ seen: 0, miss: miss.length, hits: 0 })));
  }

  /* 5. **配っている先が DIST と違ったら止まる。両側から当てる。**
        小さなサーバをその場で1つ立てて、片方は盤と同じ中身・片方は別の中身を返す。
        「違えば落ちる」だけでは対照にならない（出してよいもので落ちないことも要る）。 */
  {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const http = await import("node:http");
    const dir = mkdtempSync(join(tmpdir(), "preclaim-"));
    const disk = "<!doctype html><p>盤の中身</p>";
    writeFileSync(join(dir, "same.html"), disk);
    writeFileSync(join(dir, "other.html"), disk);
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(req.url === "/same.html" ? disk : "<!doctype html><p>べつの書き出し</p>");
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${srv.address().port}`;
    const same = (await servedDiff(["/same.html"], dir, origin)).length;
    const other = (await servedDiff(["/other.html"], dir, origin)).length;
    await new Promise((r) => srv.close(r));
    rmSync(dir, { recursive: true, force: true });
    add("配っている先が DIST と違う", "同じ=0件 / 違う=1件", `同じ=${same}件 / 違う=${other}件`);
  }

  return { ok: rows.every((r) => r.ok), rows };
}

/**
 * 終了コードを決める1か所。**0件と「見ていない」を混ぜない**（§15）。
 *
 * @param {{seen: number, miss: number, hits: number}} n
 */
export function verdict(n) {
  // 壊しかた `zerook`: 1面も読めなくても 0 を返す。**「見ていないから0件」が合格に化ける**
  if (BREAK === "zerook") return n.hits ? 1 : 0;
  if (n.seen === 0) return 2;
  if (n.miss) return 2;
  return n.hits ? 1 : 0;
}

/* ---------------------------------------------------------- 本体 -- */

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.log(`${DIST} が無い。先に \`tools/build.sh ${SPORT}\` で書き出してください。`);
  process.exit(2);
}
const pages = walk(DIST).sort().filter((x) => !ONLY.length || ONLY.includes(x));
if (!pages.length) {
  console.log(`${DIST} に面が無い。先に書き出してください。`);
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/* 対照が先。落ちたら本物の面の数字は1つも出さない */
{
  const { ok, rows } = await controls(b);
  console.log(`── 対照（${rows.length}つ）${BREAK ? `  BREAK=${BREAK}` : ""}`);
  for (const r of rows) {
    console.log(`  ${r.ok ? "○" : "×"} ${r.name}`);
    console.log(`      ほしい: ${r.want}`);
    console.log(`      出た  : ${r.got}`);
  }
  if (!ok) {
    console.log(`\n対照が ${rows.filter((r) => !r.ok).length}件 外れた。**面の数字は出さない。**`);
    await b.close();
    process.exit(2);
  }
  console.log(`  対照 ${rows.length}件とも一致\n`);
}

/* 配っている先が、いま数えようとしている書き出しかを見る。**対照のすぐあと、
   面を1枚も開く前に。** ここがずれていると、測った結果は別の書き出しのもの */
{
  const bad = await servedDiff(pages, DIST, ORIGIN);
  if (bad.length) {
    console.log(`── 配っている先（${ORIGIN}）が ${DIST} と食い違う: ${bad.length} / ${pages.length}面`);
    for (const x of bad.slice(0, 10)) console.log("    " + x);
    if (bad.length > 10) console.log(`    …ほか ${bad.length - 10}件`);
    console.log("\n**別の書き出しを測るところだった。数字は出さない。**");
    await b.close();
    process.exit(2);
  }
  console.log(`  配っている先と ${DIST} は ${pages.length}面とも同じ中身\n`);
}

const miss = [];
/** 道具のほうが壊れている面。**1件でもあれば数字を出さない** */
const broken = [];
/** JS が入ると別の面へ送られる面。引き算では測れないので、名前を出して外す */
const moved = [];
let seen = 0;
let offLines = 0;
let diffLines = 0;
const found = [];

const ctxOff = await makeCtx(b, false);
const ctxOn = await makeCtx(b, true);
const pOff = await ctxOff.newPage();
const pOn = await ctxOn.newPage();

for (const page of pages) {
  const a = await readPage(pOff, page, miss);
  if (!a) continue;
  const o = await openChecked(pOn, ORIGIN, page, { miss, waitUntil: "load" });
  if (!o.ok) continue;
  const z = await grab(pOn, true);
  let g = jsGuard(page, a, z);
  /* **落ち着かないまま測らない。** 途中の姿と引き算すると、割れ方の差が
     そのまま候補に化ける。0件に化けるのと同じくらい危ない（§15） */
  if (!g && !z.settled)
    g = { kind: "broken", why: `${page}: JS を入れた側の字が ${WAIT_MS}ms では落ち着かなかった` };
  if (g) {
    (g.kind === "broken" ? broken : moved).push(g.why);
    continue;
  }
  seen++;
  offLines += a.lines.length;
  const d = subtract(a.lines, z.dom);
  diffLines += d.length;
  if (SHOWDIFF) for (const x of d) console.log(`  差  ${page}  「${x.line}」  ${x.hit ? "［" + x.why + "］" : "—"}`);
  for (const x of d) if (x.hit) found.push({ page, ...x });
}

await ctxOff.close();
await ctxOn.close();
await b.close();

reportMissing(miss);

console.log(`── JS が動く前の字（${pages.length}面・幅 ${WIDTH}px）`);
console.log(`  読めた面                ${seen} / ${pages.length}`);
console.log(`  開けなかった面          ${miss.length}`);
console.log(`  送られて測れない面      ${moved.length}`);
console.log(`  見張りで止めた面        ${broken.length}`);
console.log(`  JS前に出ていた行        ${offLines}`);
console.log(`  うち JS前にしか無い行   ${diffLines}`);
console.log(`  そのうち言い切り        ${found.length}`);

if (moved.length) {
  console.log(`\n── 送られて測れない面（${moved.length}件）**引き算の外。ここは数えていない**`);
  for (const g of moved) console.log("    " + g);
}
if (broken.length) {
  console.log(`\n── 見張りで止めた面（${broken.length}件）**ここが1件でもあると、差は当てにならない**`);
  for (const g of broken) console.log("    " + g);
}

console.log(`\n── 言い切り（${found.length}件）**どれが嘘かは人が読んで決める**`);
for (const f of found) console.log(`    ${f.page}  「${f.line}」  ［${f.why}］`);
if (!found.length) console.log("    なし");

const code = verdict({ seen, miss: miss.length + broken.length, hits: found.length });
if (code === 2) {
  console.log(
    `\n**数えられなかった。** 読めた面 ${seen} / 開けなかった ${miss.length} / 見張りで止めた ${broken.length}。` +
      `出した数は当てになりません`,
  );
}
process.exit(code);
