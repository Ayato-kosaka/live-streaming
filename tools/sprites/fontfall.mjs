/**
 * **その面に出ている字のうち、焼いた書体で描けていない字**を数える。
 *
 *   DIST=site/.next-3130 SPORT=4130 node tools/sprites/fontfall.mjs /bulgaria
 *
 * ## なぜ `fontbudget_selftest` では足りないのか
 *
 * あちらは**表（`tools/fonts/weights.json`）と焼いた束を突き合わせる。**
 * 表が面の中身より古いと、**表の中では辻褄が合ったまま緑になる。**
 * 2026-11-06 にそれが起きた——`fontbudget_selftest` は「落ちる字 0字」と言い、
 * 本番の画面では 22字が端末の書体に落ちていて、あやとに
 * 「文字化けが混じってる」と言われた。
 *
 * **ここは画面で測る。** 焼いた束を実際に読み込ませてから、字を1つずつ
 * 「その書体で描いたとき」と「無い書体で描いたとき」の幅を比べる。
 * 違えば当たっている。`document.fonts.check()` は嘘をつくので使わない
 * （落ちた書体でも true を返す。`docs/island-standards.md`）。
 *
 * 終了コード 0=全部出ている / 1=落ちている字がある / 2=測れなかった
 */
import { chromium } from "playwright-core";
import { fromRoot } from "./repo.mjs";
import { loadRedirects, redirectOf } from "./routemoves.mjs";

const EXE = process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SPORT = process.env.SPORT || "4130";
const FAM = process.env.FONT_FAMILY || "Maru Island";

/**
 * 焼いた書体に**無くてよい**と決めた字。理由を必ず書く。
 *
 * **下の字は Zen Maru Gothic そのものに無い**（`cmap` を数えて確かめた）。
 * 束を焼き直しても出ない。出どころは3つだけ:
 *
 * - 写真家の名前（`Petar Milošević`・`Јакша`）。**人の名前は直さない**
 * - 北マケドニア語の字（ј Ќ Ѓ њ ǵ）。あちらの面の現地語表記
 * - バルト3国の字（ē ņ ķ ā ī ū Š Į ą ė）。料理と店の現地語表記
 *
 * **ここに足してよいのは、直せない字だけ。** こちらの文の書きかたで
 * 避けられる字は、避けるほうを選ぶ（⚠ は書体に無かったが、地の文を
 * 「注意の印」と呼び替えて消した。印そのものは絵で出している）。
 *
 * 別の書体を2本目に足せば出せるが、@font-face が増えるぶん最初の Layout が
 * 伸びる（`site/app/css/fonts.css` の頭に、367本足して 203ms → 1,543ms に
 * なった実測が書いてある）。**この数の字のために払う値段ではない。**
 */
const ALLOW = new Map([
  ["Ј", "キリルの Је。写真家の名前（Јакша）の中だけ"],
  ["ј", "キリルの је。北マケドニア語の表記"],
  ["Ќ", "キリルの Ќе。北マケドニア語の表記"],
  ["Ѓ", "キリルの Ѓе。北マケドニア語の表記"],
  ["њ", "キリルの ње。北マケドニア語の表記"],
  ["š", "ラテンの s カロン。写真家の名前（Petar Milošević）の中だけ"],
  ["ć", "ラテンの c アキュート。写真家の名前（Petar Milošević）の中だけ"],
  ["č", "ラテンの c カロン。北マケドニア語のラテン表記"],
  ["ǵ", "ラテンの g アキュート。北マケドニア語のラテン表記（ǵomleze）"],
  // スコピエの面（`/travel/north-macedonia/skopje`）と国の面の入口の、見どころの現地のつづり（#1203）。
  // 2026-11-14 に Zen Maru Gothic の cmap を読んで、4字とも無いことを確かめた（ј Ќ č š と同じ）
  ["ќ", "キリルの ќе。北マケドニア語の表記（Спомен-куќа＝マザー・テレサ記念館）"],
  ["џ", "キリルの џе。北マケドニア語の表記（џамија＝モスク）"],
  ["ž", "ラテンの z カロン。北マケドニア語のラテン表記（džamija）"],
  ["Ć", "ラテンの C アキュート。出どころの名前（Wikipedia「Ćevapi」）の中だけ"],
  ["☺", "配信の題の中だけ（題はそのまま出す。island-design 1章の例外）。/travel/north-macedonia/skopje の埋め込み"],
  // バルト3国の字（`/nordic/guide` ほか）。これも書体そのものに無い
  ["ē", "ラトビア語"], ["ņ", "ラトビア語"], ["ķ", "ラトビア語"], ["ā", "ラトビア語"],
  ["ī", "ラトビア語"], ["Š", "ラトビア語"],
  ["ū", "ラトビア語・リトアニア語（sūrelis / Brūklenes）"],
  ["Į", "リトアニア語"], ["ą", "リトアニア語"], ["ė", "リトアニア語"],
]);

async function main() {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("面の道を渡してください（例: /bulgaria）");
    return 2;
  }
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  let bad = 0;
  /* 渡された道は**人が打つ道**として読む。引っ越した道（`/north-macedonia` → `/travel/north-macedonia`。#1201）は、
     本番と同じく `firebase.json` の 301 を通して先の面を測る。書き出しの中を直に開くので、
     転送を通さないと「無い面」を測って 2 で落ちる（`selftest.yml` が前の道を名指ししている） */
  const rules = loadRedirects();
  for (const asked of paths) {
    const moved = redirectOf(asked, rules);
    const path = moved ? moved.to : asked;
    if (moved) console.log(`（${asked} は ${path} へ 301。そちらを測る）`);
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${SPORT}${path}.html`, { waitUntil: "networkidle" });
    /* **畳みを開いてから数える。** 閉じた `<details>` の中の字は
       `innerText` に出てこない（`docs/island-misses.md` の「畳んだ中の絵を数えない」と同じ罠） */
    await p.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 900) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30));
      }
    });
    const out = await p.evaluate(async (fam) => {
      const chars = [...new Set([...document.body.innerText].filter(
        (c) => c.trim() && c.charCodeAt(0) > 0x7f))];
      /* **先に読み込ませる。** 読み込む前に測ると、在る字まで「無い」に見える */
      await Promise.all([400, 700, 900].map((w) =>
        document.fonts.load(`${w} 16px "${fam}"`, chars.join("")).catch(() => {})));
      await document.fonts.ready;
      const s = document.createElement("span");
      s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:96px";
      document.body.appendChild(s);
      const w = (c, f) => { s.style.fontFamily = f; s.textContent = c;
        return s.getBoundingClientRect().width; };
      const miss = [];
      for (const c of chars) {
        /* 2つの**別々の**落ち先と比べる。片方とたまたま同じ幅でも、
           もう片方と違えば「当たっている」と分かる */
        const a = w(c, `"${fam}", serif`), b2 = w(c, `"${fam}", monospace`);
        const x = w(c, "serif"), y = w(c, "monospace");
        if (Math.abs(a - x) < 0.5 && Math.abs(b2 - y) < 0.5 && Math.abs(x - y) > 0.5) miss.push(c);
      }
      s.remove();
      return { total: chars.length, miss };
    }, FAM);
    const miss = out.miss.filter((c) => !ALLOW.has(c));
    const allowed = out.miss.filter((c) => ALLOW.has(c));
    console.log(`${path}  面に出る字 ${out.total} ／ 落ちている字 ${miss.length}`
      + (allowed.length ? `（見送り ${allowed.join("")}）` : ""));
    if (miss.length) {
      bad += miss.length;
      console.log(`::error::${path} で焼いた書体に無い字 ${miss.length}:`
        + ` ${miss.join("")}  → fontweigh.mjs と subset.py を回し直す`);
    }
    await ctx.close();
  }
  await b.close();
  return bad ? 1 : 0;
}

process.exit(await main());
