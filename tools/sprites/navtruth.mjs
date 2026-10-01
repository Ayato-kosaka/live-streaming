/**
 * **札が、行き先の中身について嘘をついていないか。**
 *
 *   node tools/sprites/navtruth.mjs                 # 本番を見る
 *   BASE=http://localhost:4130 node navtruth.mjs    # 手元の書き出しを見る
 *   node tools/sprites/navtruth.mjs --selftest      # 対照だけ（網が要らない）
 *
 * 終了コード 0=嘘なし / 1=嘘あり / 2=数えるものが無い。
 *
 * ## なぜ要るか
 *
 * あやと（2026-10-01、何度目かの指摘）:
 *
 * > ルーティングが下手すぎ。根本的に再発しないように徹底的にみなおして。
 * > すべて。（例、北欧旅は「これから」ではない。）
 *
 * 実測（2026-10-01、本番）: ナビの札が「これから」で、`/next` の h1 も
 * パンくずも「これから」。**中身は 9/6 のフード＆ワイン祭りと 9/11 の
 * ジョージアバイバイで、ぜんぶ過去。これから分は 0 件。**
 * 札だけが、半月前から同じ字で立っていた。
 *
 * ## 直し方ではなく、再発のしかたを見る
 *
 * 1件ずつ直しても戻る。戻る理由はいつも同じで、**札を固定の字で持ち、
 * 中身を日付で動かしている**から。両者は必ずいつか食い違う。
 * 食い違った瞬間に赤くなる場所が無いので、あやとが見つけるまで出たままになる。
 *
 * ここが数えるのは「直っているか」ではなく **「札と中身がいま合っているか」**。
 * 新しい札を足しても、日付が進んでも、この道具は勝手に見に行く。
 *
 * ## 何を嘘と呼ぶか
 *
 * **時制を名乗る札**（下の `TENSED`）だけを見る。「配信」「アプリ」のような
 * 時制の無い札は、古くなりようがないので数えない。
 *
 * | 札の時制 | 行き先に要るもの |
 * | --- | --- |
 * | これから・次・もうすぐ・予定 | **今日より後の日付が1つ以上** |
 * | いま・いまの・現在 | **今日を含む期間、または今日の日付** |
 * | 行ってきた・やった・終わった | 今日より後の日付が**無い**こと |
 *
 * 日付は行き先の面から拾う（`YYYY-MM-DD` と `M/D` と `YYYY年M月D日`）。
 * **拾えなかった面は「嘘」と言わない。** 判定できないものを赤にすると、
 * 道具を信じなくなる（`docs/island-misses.md` #72）。`判定できず` に出す。
 *
 * ## 同じ行き先に、違う札が付いていないか
 *
 * もう1つ数える。**同じ URL を指す札が2種類以上あると、人は別の場所だと思う。**
 * 「これから」と「次の企画」が同じ `/next` を指していたら、島に部屋が
 * 1つ増えたように読める。これも導線の下手さの正体のひとつ。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "https://live-streaming-d3cac.web.app";
const SELFTEST = process.argv.includes("--selftest");
/** 今日（JST）。行き先の日付と見比べる基準。 */
const TODAY = process.env.TODAY ||
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 時制を名乗る札の見分け。**語尾ではなく語で見る。**
 *
 * `want` は行き先に要るもの:
 *   `future` … 今日より後の日付が1つ以上
 *   `now`    … 今日が入っている
 *   `past`   … 今日より後の日付が無い
 */
const TENSED = [
  { re: /これから|こんど|今度|next|つぎ|次の|もうすぐ|予定/i, want: "future" },
  { re: /^いま|いまの|現在|今どこ|いまどこ/, want: "now" },
  { re: /行ってきた|やった|終わった|おわった|過去|これまで/, want: "past" },
];

/**
 * **順番の案内は、時制ではない。**
 *
 * 「つぎの島」「ひとつ前の島」「いまの島にもどる」は、**並びの中での位置**を
 * 言っている。章の島は日付順に並んでいるので、過去の島から見た「つぎの島」も
 * 過去にある。これを時制として読むと、正しい案内を赤くする。
 *
 * 「もどる」も同じで、来た道を指しているだけ。
 */
const SEQ = /つぎの島|次の島|ひとつ前の島|前の島|もどる|戻る/;

/** 札の時制。無ければ null（数えない）。 */
export function tenseOf(label) {
  if (SEQ.test(label)) return null;
  for (const t of TENSED) if (t.re.test(label)) return t.want;
  return null;
}

/**
 * 字の中の日付を全部拾う。**年の無い `M/D` は、今年として読む。**
 *
 * 年を補わないと「9/6」が拾えず、`/next` のような面が丸ごと
 * 「判定できず」に落ちる。年をまたぐ面では外すが、**外したときに
 * 赤くなるのではなく判定が甘くなる側**なので、黙って嘘を通すより軽い。
 */
export function datesIn(text, today = TODAY) {
  const year = today.slice(0, 4);
  const out = new Set();
  for (const m of text.matchAll(/(20\d\d)-(\d{2})-(\d{2})/g)) {
    out.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of text.matchAll(/(20\d\d)年\s*(\d{1,2})月\s*(\d{1,2})日/g)) {
    out.add(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
  }
  for (const m of text.matchAll(/(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) {
    const mo = Number(m[1]); const d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.add(`${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return [...out].sort();
}

/** その札が、拾った日付たちに対して正しいか。判定できなければ null。 */
export function judge(want, dates, today = TODAY) {
  if (!dates.length) return null;
  const future = dates.filter((d) => d > today);
  const past = dates.filter((d) => d < today);
  const istoday = dates.includes(today);
  if (want === "future") return future.length > 0;
  if (want === "past") return future.length === 0;
  if (want === "now") return istoday || (past.length > 0 && future.length > 0);
  return null;
}

// --------------------------------------------------------------- 取ってくる

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ");

/** 面の中の `<a href="/…">札</a>` を全部。札は字だけにする。 */
function links(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = strip(m[2]).trim();
    if (!label) continue;
    out.push({ href: m[1].replace(/\/$/, "") || "/", label });
  }
  return out;
}

/**
 * 1面とってくる。
 *
 * **手元の書き出しを配っているときは `.html` を足す。**
 * `python3 -m http.server` は `/board` では返さない（`/board.html` で返す）。
 * ここを足さずに回したら、**129面のうち大半が「取れなかった」のまま
 * 終了コード 0 になった。** 嘘が無いのではなく、見ていなかっただけ。
 * 判定が出ないときに緑を返す道具は、**無いより悪い**
 * （`docs/island-standards.md` 13章「当座の判定は、まずその判定を疑う」）。
 */
async function get(path) {
  const tries = process.env.DIST ?
    [path === "/" ? "/index.html" : `${path}.html`, path] :
    [path];
  for (const t of tries) {
    const r = await fetch(`${BASE}${t}`, { redirect: "follow" });
    if (r.ok) return await r.text();
  }
  return null;
}

// ------------------------------------------------------------------- 対照
/**
 * **判定が効くことを、本物に当てる前に見る。**
 * 落ちない対照は、通っても何も言っていない。
 */
function selftest() {
  const T = "2026-10-01";
  const ok = []; const ng = [];
  const ck = (name, got, want) =>
    (JSON.stringify(got) === JSON.stringify(want) ? ok : ng)
      .push(`${name}: 出た=${JSON.stringify(got)} ほしい=${JSON.stringify(want)}`);

  ck("「これから」は future", tenseOf("これから"), "future");
  ck("「行ってきた企画」は past", tenseOf("行ってきた企画"), "past");
  ck("「いまどこ」は now", tenseOf("いまどこ"), "now");
  ck("「配信」は時制なし", tenseOf("配信"), null);
  ck("「作った料理」を past と読まない", tenseOf("作った料理"), null);
  ck("「つぎの島 アルバニア」は順番なので時制なし", tenseOf("つぎの島 アルバニア"), null);
  ck("「ひとつ前の島 北欧周遊」も時制なし", tenseOf("ひとつ前の島 北欧周遊"), null);
  ck("「いまの島にもどる」も時制なし", tenseOf("いまの島にもどる"), null);
  ck("「これから」は、もどるが無ければ future のまま", tenseOf("これから"), "future");

  ck("YYYY-MM-DD を拾う", datesIn("…2026-09-06…", T), ["2026-09-06"]);
  ck("M/D を今年として拾う", datesIn("9/6 のお祭り", T), ["2026-09-06"]);
  ck("YYYY年M月D日 を拾う", datesIn("2026年9月6日(日)", T), ["2026-09-06"]);
  ck("13月は拾わない", datesIn("13/40", T), []);
  ck("1/2/3 のような区切りは拾わない", datesIn("1/2/3", T), []);

  ck("これから＋過去だけ → 嘘", judge("future", ["2026-09-06"], T), false);
  ck("これから＋未来あり → 正", judge("future", ["2026-09-06", "2026-12-01"], T), true);
  ck("行ってきた＋未来あり → 嘘", judge("past", ["2026-12-01"], T), false);
  ck("行ってきた＋過去だけ → 正", judge("past", ["2026-09-06"], T), true);
  ck("日付が無ければ判定しない", judge("future", [], T), null);

  for (const l of ok) console.log("  ○", l);
  for (const l of ng) console.log("  ×", l);
  console.log(`対照 ${ok.length + ng.length}件中 ${ok.length}件通った`);
  return ng.length === 0 ? 0 : 1;
}

/**
 * 見る面の一覧。**手で並べない**（`docs/island-standards.md` 8章）。
 *
 *   DIST=site/.next-ci … 書き出したものから拾う（CI はこちら）
 *   URLS=<file>        … 1行1パスの表
 *   どちらも無ければ   … 本番の sitemap
 *
 * 名簿を手で持つと、**新しく置いた面がそこに載るまで永久に見えない**
 * （`walkedcount.mjs` が #165 でそれを踏んでいる）。
 */
function pathList() {
  const dist = process.env.DIST;
  if (dist) {
    const out = [];
    const walk = (dir, base) => {
      for (const f of readdirSync(dir)) {
        if (f === "_next" || f === "cache" || f.startsWith(".")) continue;
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p, base + "/" + f);
        else if (f.endsWith(".html")) {
          const n = f === "index.html" ? base || "/" : base + "/" + f.slice(0, -5);
          out.push(n || "/");
        }
      }
    };
    walk(dist, "");
    return [...new Set(out)].sort();
  }
  const file = process.env.URLS;
  if (file) {
    return readFileSync(file, "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
  }
  return null; // sitemap から取る（下で await する）
}

// ------------------------------------------------------------------- 本番

async function main() {
  if (SELFTEST) process.exit(selftest());
  if (selftest() !== 0) {
    console.error("対照が通らないので、本物は見ません");
    process.exit(2);
  }
  console.log(`\n基準の日: ${TODAY}  見る先: ${BASE}\n`);

  let paths = pathList();
  if (paths == null) {
    const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].replace(BASE, "")).filter(Boolean);
  }
  if (!paths.length) { console.error("見る面がありません"); process.exit(2); }

  /** href → その面の字（1回だけ取る） */
  const page = new Map();
  /** href → その先を指していた札（重複を数える） */
  const labels = new Map();

  for (const p of paths) {
    const html = await get(p);
    if (html == null) { console.log(`  × 取れなかった ${p}`); continue; }
    page.set(p, strip(html));
    for (const { href, label } of links(html)) {
      if (!labels.has(href)) labels.set(href, new Map());
      const m = labels.get(href);
      m.set(label, (m.get(label) || 0) + 1);
    }
  }
  console.log(`見た面 ${page.size} / ${paths.length}`);
  /* **取れなかった面があったら、そこで止める。** 見ていない面のぶんだけ
     嘘を見落としているので、「嘘なし」と言う資格が無い。 */
  if (page.size < paths.length) {
    console.error(`取れなかった面が ${paths.length - page.size} 件あります。数える前に止めます`);
    process.exit(2);
  }

  // ---- 1. 時制の札が、行き先の中身と合っているか
  const lies = []; const unknown = []; let checked = 0;
  for (const [href, m] of labels) {
    const text = page.get(href);
    for (const label of m.keys()) {
      const want = tenseOf(label);
      if (!want) continue;
      checked++;
      if (text == null) { unknown.push(`${label} → ${href}（面を見ていない）`); continue; }
      const dates = datesIn(text);
      const v = judge(want, dates);
      if (v === null) { unknown.push(`${label} → ${href}（日付が拾えない）`); continue; }
      if (!v) {
        const fut = dates.filter((d) => d > TODAY);
        lies.push(
          `「${label}」→ ${href}  要る: ${want} / 拾った日付 ${dates.length}件` +
          `（いちばん新しい ${dates[dates.length - 1]} / 今日より後 ${fut.length}件）`,
        );
      }
    }
  }

  /* ---- 2. 同じ行き先に、違う札
     **短い札だけを数える。** 長い字は札ではなく、カードの説明文ぜんぶが
     `<a>` の中に入っているもの。あれを混ぜると 128件出て、**どれが
     本当の食い違いか読めなくなる**（最初に測ったとき実際にそうなった）。
     人が「別の部屋だ」と思うのは、短い名前が2つ付いているときだけ。 */
  const SHORT = 16;
  const multi = [];
  for (const [href, m] of labels) {
    const short = [...m.entries()].filter(([l]) => [...l].length <= SHORT);
    if (short.length < 2) continue;
    multi.push(`${href} ← ${short.map(([l, n]) => `「${l}」×${n}`).join(" / ")}`);
  }

  console.log(`\n■ 時制を名乗る札 ${checked}件`);
  console.log(lies.length ? lies.map((s) => "  × " + s).join("\n") : "  （嘘なし）");
  console.log(`\n■ 判定できなかったもの（赤にしない）${unknown.length}件`);
  console.log(unknown.length ? unknown.slice(0, 20).map((s) => "  ? " + s).join("\n") : "  （なし）");
  console.log(`\n■ 同じ行き先に、違う札 ${multi.length}件`);
  console.log(multi.length ? multi.map((s) => "  ! " + s).join("\n") : "  （なし）");

  process.exit(lies.length ? 1 : 0);
}

main();
