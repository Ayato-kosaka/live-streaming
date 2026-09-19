/**
 * **配ったあとに、本番の面を一周する。**
 *
 *   node tools/sprites/prodsweep.mjs
 *   ORIGIN=https://… node tools/sprites/prodsweep.mjs
 *   BREAK=status|h1|title|thin|follow|tell node tools/sprites/prodsweep.mjs   # 対照を空振りさせる
 *   BREAK=smiss|amiss|alias|excuse|unused|claim node tools/sprites/prodsweep.mjs   # 突き合わせのほう
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・読めない面がある）。
 * `| tail` を挟まない——終了コードが消える。
 *
 * ## なぜ要るか
 *
 * **本番の面を一周する見張りが、1本も無かった。**
 *
 * | 道具 | 見ているもの |
 * | --- | --- |
 * | `crawl.mjs` | **手元の書き出し**（`localhost`）。本番は1バイトも見ない |
 * | `prod.mjs` を直に起こす | `/me` の看板と顔だけ（2面） |
 * | `notfound.mjs`（配ったあと） | **無い道**が 404 で返るか |
 *
 * つまり **Hosting のリダイレクト・配信ヘッダ・実際に配られたバイト列**の層は、
 * 配ったあと誰も見ていなかった。**手元のビルドでは絶対に出ない層**で、
 * 本番だけで壊れる（`firebase.json` を触った・書き出しが1面ぶん欠けた・
 * `redirects` が増えた／消えた）。
 *
 * 2026-09-19 に手の curl で一周したときは 126面ぜんぶ無事だった。
 * **無事なことが問題ではない。壊れたときに鳴るものが無いのが問題。**
 *
 * ## ここで見ないもの（見ないと決めたこと）
 *
 * **ブラウザを使わない。** この箱のブラウザは本番に届かない（`prod.mjs` が
 * curl で横取りしているのはそのため）し、横取りは**何が返っても 200 で
 * fulfill する**ので、状態コードを見たいここでは使えない。そのぶん、
 * 次の4つは**ここでは見ない。見ないと決めた。**
 *
 * | 見ないもの | どこで見ているか |
 * | --- | --- |
 * | JS の例外・横あふれ・島の中のリンク切れ | `tools/sprites/crawl.mjs`（手元の書き出し） |
 * | 絵が本当に描けたか | `tools/sprites/iconcheck.mjs` / `crawl.mjs` |
 * | 画面が出たあとに入る値 | `tools/sprites/preclaim.mjs` |
 * | 無い道が 404 で返るか | `tools/sprites/notfound.mjs`（同じワークフローの1つ前） |
 *
 * ここが見るのは**配られたバイト列の層だけ**。中身の意味ではなく、
 * 「その面が、その面として配られているか」。
 *
 * ## 面の一覧を手で並べない
 *
 * 手で並べた一覧は、面が増えた日に**片方だけ古くなる**
 * （`docs/island-standards.md` §8）。**3か所**から出して足し合わせる。
 *
 * 1. **本番の `sitemap.xml`** — 123面（2026-09-19 の実測。119 だったものに、
 *    `/island/<章>/streams` の4面を足した）
 * 2. **リポジトリの `site/app` の下の `page.tsx` ぜんぶ** — `[` を含む道（動く段）を除いた
 *    静的な道。sitemap に載っていない7面がここで出る:
 *    `/design` `/me` `/me/desk` `/me/remote` `/me/roulette` `/nordic/photos` `/roulette`
 * 3. **本番の `/all`（島のなか ぜんぶ）に並んでいる行き先** — 121面。
 *    **動く段の面は、ここからしか出ない。**
 *
 * **3つめが無かったあいだ、`/island/<章>/streams` の4面が見張りの外に居た**
 * （2026-09-19。いちばん大きい `/island/caucasus/streams` は 949,893B ある）。
 * 1 と 2 は「静的な道」と「sitemap に書いた道」で、**どちらも `[chapter]` の
 * 中身を知らない。** 3 は焼いた HTML に並んでいる行き先そのものなので、
 * 章が1つ増えれば、この道具を1文字も直さずに増える。
 *
 * **`/roulette` は配信に映る。** sitemap に無いので、1 だけ見ていると落ちる。
 * どれかが痩せたら（sitemap が 20面・静的な道が 5本・`/all` が 20行を割る）、
 * 面の数字を1つも出さずに 2 で止まる。
 *
 * ## 3つの一覧が食い違っていたら、そう言う
 *
 * 面を集めるためだけに3つ持つのではない。**3つが食い違っていること自体が不具合。**
 *
 * | 食い違い | 何が起きているか |
 * | --- | --- |
 * | sitemap に無い | 在る面が**検索から見つからない** |
 * | `/all` に無い | `/all` が「ここからどこへでも1回で行ける」と**言い切っているのに行けない** |
 *
 * 揃わなくてよいものは在る（`/me` はログインした本人の面、`/roulette` は配信に映す盤）。
 * **そこは `ABSENCES` に理由を1行書く。** 12文字以上・日付つきでなければ落ちる。
 * 書いていない食い違いは違反、**効かなくなった宣言も違反**（掃除しないと、
 * 次に本当に落ちた日に黙る）。
 *
 * もう1つ、**別名で行ける**という形がある。いまいる島は `/island/<章>` ではなく
 * トップそのもの（`components/chain/route.ts` の `chapterHref`）なので、
 * `/all` の章の行は `/` へ送る。だから `/island/nordic` は sitemap に在って
 * `/all` に無い。**行けないのではなく、別の名前で行ける**ので、
 * `<h1>` の名前が `/all` の `/` の行と一致することを見て通す。
 * **黙って通さない。追ったときと同じで、別名だと字に出す**（#164 の決めごと3）。
 *
 * ## `/all` が名乗る枚数
 *
 * `/all` は「島にある紙、◯枚」と名乗る。**その数が、並んでいる行き先の数と
 * 合っているか**まで見る（2026-09-19 の実測で「122枚」・並んでいたのは 121。
 * いまいる島の行が `/` に化けるぶん、行の数と行き先の数が1つずれていた）。
 * 名乗りが読めなくなったときも落とす——文言が変わった日に「食い違い 0」で
 * 静かに通ると、名乗りを誰も見ていないのと同じ（§15）。
 *
 * ## 見るもの（足は6本。**どれも分母を出す**）
 *
 * | 足 | 見るもの | 抜くと（`BREAK=`） |
 * | --- | --- | --- |
 * | `status` | HTTP が 200 か | 404 の面が通る |
 * | `h1` | `h1` がちょうど1つか | h1 が0個／2個の面が通る |
 * | `title` | `<title>` が空でないか | 空の題名が通る |
 * | `thin` | 本文が痩せていないか | 21B の本文が面として通る |
 * | `follow` | リダイレクトを**追う** | 301 の本文21バイトを掴む（#164） |
 * | `tell` | 追ったことを**表に出す** | 別の面を見ているのに気づけない（#164） |
 *
 * **追うだけにしない。追って、追ったと言う。** `/nordic/photos` を見たつもりで
 * `/cards` の中身を見ている、というのは**見た人が知るべきこと**（#164 の決めごと3）。
 *
 * ## 痩せの境目
 *
 * `prod.mjs` の `THIN_BYTES`（4,096B）を**そのまま借りる。** ここで別の数字を
 * 決めると、同じことを言う数が2つになって片方だけ古くなる。
 * 2026-09-19 に126面を実測して、いちばん小さい面は `/roulette` の **36,076B**。
 * 掴んでしまう側はリダイレクトの本文 **21B** と空の応答 **0B**。**3桁空いている。**
 *
 * ## 対照（`docs/island-standards.md` §15）
 *
 * **本番を1本も叩く前に**、2組を当てる。1本でも外れたら、本番の数字を
 * 1つも出さずに 2 で止まる。
 *
 * | 組 | 台 | 相手 |
 * | --- | --- | --- |
 * | 面の判定 | 8本 | 偽のサーバを 127.0.0.1 に立てる |
 * | 3つの一覧の突き合わせ | 14本 | 偽の一覧を3つ組で11本（`LIST_CONTROLS`）＋ 偽のサーバに
 * |  |  | `sitemap.xml` と `/all` を置いて線ごしに3本（`runWireControls`） |
 *
 * 突き合わせのほうは、**面を1つわざと落とす／わざと増やす／理由を消す**が
 * それぞれ別の項目で落ちること、**別名で行ける形は通ること**、
 * **名前が違えば通らないこと**まで見る。
 * 足を1本ずつ抜いて落ちるところまで見るのは `prodsweep_selftest.mjs`（毎 PR）。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { relative, sep } from "node:path";

import { repoPath } from "./repo.mjs";
/* 痩せの境目は `prod.mjs` のものを借りる。**ここで決め直さない**
   （同じことを言う数が2つになると、片方だけ古くなる） */
import { THIN_BYTES } from "./prod.mjs";

const run = promisify(execFile);

export const ORIGIN = process.env.ORIGIN || "https://live-streaming-d3cac.web.app";

/** 一度に何本まで curl を走らせるか。箱の CPU は4つしかない */
const LANES = Number(process.env.LANES || 6);

/* ------------------------------------------------------------ 面の一覧 -- */

/**
 * 本番の `sitemap.xml` から面を引く。
 * @returns {{paths:string[], why:string}}
 */
export async function sitemapPaths(origin = ORIGIN) {
  const r = await fetchOne(`${origin}/sitemap.xml`);
  if (r.err || r.status !== 200) return { paths: [], why: `sitemap.xml が ${r.status ?? r.err}` };
  const paths = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      try {
        return new URL(m[1].trim()).pathname.replace(/\/$/, "") || "/";
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { paths: [...new Set(paths)], why: "" };
}

/**
 * リポジトリの `site/app` の下の `page.tsx` ぜんぶから**静的な道**を出す。
 *
 * - `[slug]` `[...rest]` のような**動く段を含む道は落とす**（面の数が中身で
 *   決まるので、ここからは出せない。そちらは sitemap が持っている）
 * - `(group)` は Firebase から見た道に出ないので**段ごと落とす**
 * - `@slot`（並行 route）も道に出ないので落とす
 *
 * @param dir 既定はこのリポジトリの `site/app`
 */
export function staticAppPaths(dir = repoPath("site", "app")) {
  let files;
  try {
    files = readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (e) {
    return { paths: [], why: `${dir} を読めない（${String(e.message || e).slice(0, 80)}）` };
  }
  const out = [];
  for (const d of files) {
    if (!d.isFile() || d.name !== "page.tsx") continue;
    /* `parentPath` は Node 20.12 から。古い版は `path` */
    const parent = d.parentPath ?? d.path;
    const rel = relative(dir, parent);
    const segs = rel === "" ? [] : rel.split(sep);
    if (segs.some((s) => s.includes("["))) continue;
    const keep = segs.filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"));
    out.push(`/${keep.join("/")}`.replace(/\/$/, "") || "/");
  }
  return { paths: [...new Set(out)].sort(), why: "" };
}

/* --------------------------------------------- 3つめの一覧: 本番の /all -- */

/** 字を1行にする（タグを落として、実体参照を戻して、空白をまとめる） */
function txt(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

/** 道を1つの書き方にそろえる。外の宛先と `#`・`?` は捨てる */
export function normPath(href) {
  const h = String(href || "").trim();
  if (!h || h.startsWith("#") || /^[a-z]+:/i.test(h)) return null;
  const p = h.split("#")[0].split("?")[0];
  if (!p.startsWith("/")) return null;
  return p.replace(/\/$/, "") || "/";
}

/**
 * `<h1>` に出ている名前。`/all` の行の名前（`<b>`）と突き合わせるために使う。
 *
 * 島の看板は `<h1><b>北欧周遊</b><i>会いたい人に…</i></h1>` の形なので、
 * **`<b>` が在ればそちら**を取る。添え書きまで混ぜると、同じ島でも字が揃わない。
 */
export function h1Name(html) {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(String(html || ""));
  if (!m) return "";
  const b = /<b\b[^>]*>([\s\S]*?)<\/b>/i.exec(m[1]);
  return txt(b ? b[1] : m[1]);
}

/**
 * `/all`（島のなか ぜんぶ）に並んでいる行き先と、名乗っている枚数。
 *
 * **JS は動かさない。curl で取った焼いた HTML をそのまま読む。**
 * `/all` は一覧をサーバで刷っているので（`components/ui/DirFilter.tsx`）、
 * 行はここに全部出ている。
 *
 * @returns {{rows:{href:string,name:string}[], claimed:number|null, why:string}}
 */
export function parseAll(html) {
  const rows = [];
  for (const m of String(html || "").matchAll(/<li\b[^>]*\bdata-q="[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const a = /href="([^"]*)"/.exec(li);
    const href = a ? normPath(a[1]) : null;
    if (!href) continue;
    const b = /<b\b[^>]*>([\s\S]*?)<\/b>/.exec(li);
    rows.push({ href, name: b ? txt(b[1]) : "" });
  }
  /* 名乗っている枚数。**読めなかったら null**——0 に畳むと、
     文言が変わった日に「食い違い 0」で静かに通る（§10） */
  const c = /島にある紙、([0-9,]+)枚/.exec(String(html || ""));
  return {
    rows,
    claimed: c ? Number(c[1].replace(/,/g, "")) : null,
    why: rows.length ? "" : "`/all` から行き先が1つも取れない（刷り方が変わった？）",
  };
}

/** 本番の `/all` を引く */
export async function allPaths(origin = ORIGIN) {
  const r = await fetchOne(`${origin}/all`);
  if (r.err || r.status !== 200) {
    return { rows: [], claimed: null, why: `/all が ${r.status ?? r.err}` };
  }
  return parseAll(r.body);
}

/* ------------------------------------------------- 3つの一覧の突き合わせ -- */

/* **「本番の」と名乗らない。** `ORIGIN=` で手元の書き出しにも向けられるので、
   名前が覆っている範囲より広くならないようにする（#169 の決めごと1） */
export const LIST_NAMES = {
  sitemap: "sitemap.xml",
  all: "/all（島のなか ぜんぶ）",
};

/**
 * **どの一覧に載せないと決めたか、と、その理由。**
 *
 * 面が3つの一覧のどれかから抜けていたら、ここに1行無いかぎり違反。
 * `python/watch_excuses.py`（走らせない見張りの言い訳）と同じ形で、
 * **黙って0に畳めないようにする**のが目的。
 *
 * 理由は12文字以上で、**いつ時点の話かの日付**が要る。空にしたり日付を
 * 落としたりすると、面の話を1つも出さずに落ちる。
 *
 * `app`（`site/app` の静的な道）は**面を集める側**であって、ここへ
 * 載せる／載せないを決める一覧ではないので、抜けを宣言する対象にしない。
 */
export const ABSENCES = [
  { path: "/all", lists: ["all"],
    why: "島の索引そのもの。自分を自分の中に並べない（2026-09-19）" },
  { path: "/privacy", lists: ["all"],
    why: "読み物ではない。Google の OAuth 審査に URL を出す都合で持っている面なので、"
      + "検索からは引けるようにして、島の索引には並べない（2026-09-19）" },
  { path: "/design", lists: ["sitemap"],
    why: "島で使う印と部品の見本。作る側が見る棚なので検索から入る面にしない。"
      + "`/all` には並べる——部品を探すときはそこから入る（2026-09-19）" },
  { path: "/me", lists: ["sitemap", "all"],
    why: "ログインした本人にしか中身が無い面。誰でも読める紙ではないので、どちらの索引にも並べない（2026-09-19）" },
  { path: "/me/desk", lists: ["sitemap", "all"],
    why: "ログインした本人の机。誰でも読める紙ではないので、どちらの索引にも並べない（2026-09-19）" },
  { path: "/me/remote", lists: ["sitemap", "all"],
    why: "ログインした本人がルーレットを回す手元。誰でも読める紙ではない（2026-09-19）" },
  { path: "/me/roulette", lists: ["sitemap", "all"],
    why: "ログインした本人のルーレットの盤。誰でも読める紙ではない（2026-09-19）" },
  { path: "/roulette", lists: ["sitemap", "all"],
    why: "配信に映すルーレット（OBS のブラウザソース）。視聴者さんが開いて読む面ではないが、"
      + "**壊れると配信にそのまま映る**ので、見張りの一覧からは外さない（2026-09-19）" },
  { path: "/nordic/photos", lists: ["sitemap", "all"],
    why: "`/cards` へ送るだけの面。行き先そのものは sitemap にも `/all` にも並んでいる（2026-09-19）" },
];

/** 理由として通る形か。**空・短い・日付が無いのどれかなら通さない** */
export function excuseOk(why) {
  const w = String(why || "").trim();
  return w.length >= 12 && /20\d\d-\d\d-\d\d/.test(w);
}

/**
 * **3つの一覧を突き合わせる。純粋な関数**（本番もブラウザも要らない）。
 *
 * ここが腐ったときに出るのは「食い違い 0」。0件はいちばん合格に見えるので、
 * 判定だけを切り出して毎 PR で回す（`prodsweep_selftest.mjs`）。
 *
 * | 足 | 見るもの |
 * | --- | --- |
 * | `smiss` | 在る面が `sitemap.xml` に載っているか |
 * | `amiss` | 在る面が `/all` から1回で行けるか |
 * | `alias` | **別名で行ける**ものを、別名だと言ったうえで通す |
 * | `excuse` | 載せないと決めた理由が、書いてあるか（12文字以上・日付つき） |
 * | `unused` | 載せないと決めた宣言が、まだ効いているか（掃除漏れ） |
 * | `claim` | `/all` が名乗る枚数と、並んでいる行き先の数が合うか |
 *
 * @param nameOf 面 → その面の `<h1>` の名前。`alias` の判定だけに使う
 * @returns {{union:string[], bad:{key:string,path:string,why:string}[], notes:string[], distinct:number}}
 */
export function reconcile({
  sitemap = [], all = [], app = [], nameOf = {}, claimed = null,
  absences = ABSENCES, legs = new Set(),
} = {}) {
  const on = (l) => !legs.has(l);
  const bad = [];
  const notes = [];

  const declared = new Map();
  for (const a of absences) for (const l of a.lists) declared.set(`${a.path}\t${l}`, a);

  const has = { sitemap: new Set(sitemap), all: new Set(all.map((r) => r.href)) };
  const union = [...new Set([...sitemap, ...all.map((r) => r.href), ...app])].sort();

  /* 1. 理由そのもの。**宣言が効くかどうかとは別に見る**——理由を消したときに
        落ちるのはここ1つであってほしい（消したとたん「宣言が無い」でも
        落ちると、どちらで落ちたのか分からない。#169 の決めごと4） */
  for (const a of absences) {
    if (!on("excuse") || excuseOk(a.why)) continue;
    const w = String(a.why || "").trim();
    bad.push({ key: "excuse", path: a.path,
      why: `載せないと決めた理由が足りない（${w.length}文字／日付${/20\d\d-\d\d-\d\d/.test(w) ? "あり" : "なし"}）` });
  }

  /* 2. 一覧から抜けている面 */
  const used = new Set();
  for (const p of union) {
    for (const list of ["sitemap", "all"]) {
      if (has[list].has(p)) continue;
      const k = `${p}\t${list}`;
      if (declared.has(k)) {
        used.add(k);
        notes.push(`— 載せないと決めてある: ${p} は ${LIST_NAMES[list]} に出さない`);
        continue;
      }
      /* **別名で行ける。** いまいる島は `/island/<章>` ではなくトップそのもので
         （`components/chain/route.ts` の `chapterHref`）、`/all` はその行を `/` へ送る。
         同じ島が2か所に在るように見せない、というのがあちらの設計なので、
         **行けないのではなく、別の名前で行ける。** ただし**黙って通さない**
         ——見た人が知るべきことなので字に出す（#164 の決めごと3と同じ） */
      if (list === "all" && on("alias")) {
        const nm = nameOf[p];
        const row = nm ? all.find((r) => r.href === "/" && r.name === nm) : null;
        if (row) {
          notes.push(`⇢ 別名で行ける: ${p} は /all では「${nm}」→ /（いまいる島はトップそのもの）`);
          continue;
        }
      }
      const key = list === "sitemap" ? "smiss" : "amiss";
      if (on(key)) bad.push({ key, path: p, why: `${LIST_NAMES[list]} に無い` });
    }
  }

  /* 3. 効かなくなった宣言。**掃除しないと、次に本当に落ちた日に黙る** */
  for (const a of absences) {
    for (const l of a.lists) {
      if (used.has(`${a.path}\t${l}`) || !on("unused")) continue;
      bad.push({ key: "unused", path: a.path,
        why: `${LIST_NAMES[l]} に出さないと宣言してあるが、いまは外れていない（宣言のほうが古い）` });
    }
  }

  /* 4. `/all` が名乗る枚数。**読めなかったときも落とす**——文言が変わった日に
        「食い違い 0」で静かに通ると、名乗りを誰も見ていないのと同じ（§15） */
  const distinct = new Set(all.map((r) => r.href)).size;
  if (on("claim")) {
    if (claimed === null) {
      bad.push({ key: "claim", path: "/all", why: "何枚と名乗っているかが読めない（文言が変わった？）" });
    } else if (claimed !== distinct) {
      bad.push({ key: "claim", path: "/all",
        why: `「${claimed}枚」と名乗っているが、並んでいる行き先は ${distinct}` });
    }
  }

  return { union, bad, notes, distinct };
}

/* ------------------------------------------------------------- 測りかた -- */

/** 本文の `<head>` の中だけを返す。無ければ本文ぜんぶ */
function headOf(html) {
  const m = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html || "");
  return m ? m[1] : html || "";
}

/**
 * `<title>` の中の字。**`<head>` の中だけを見る。**
 * 本文の側には SVG の `<title>`（絵の説明）が幾つも居るので、
 * ぜんぶから探すと**面の題名ではないもの**を掴む。
 * @returns {string|null} 題名。`<title>` そのものが無ければ null
 */
export function titleOf(html) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headOf(html));
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** `<h1>` が何個あるか。**0個も2個も違反**（1つに絞られていることを見る） */
export function countH1(html) {
  return (String(html || "").match(/<h1[\s>]/gi) || []).length;
}

/**
 * curl で1本取る。**`-f` は付けない**——付けると 4xx で本文が取れず、
 * 「404 が返った」を「読めなかった」と混ぜることになる（#157）。
 *
 * @param follow `false` にすると `-L` を外す（`BREAK=follow`＝#164 を外した状態）
 * @returns {{status:number|null, body:string, bytes:number, hops:number, final:string, err:string|null}}
 */
export async function fetchOne(url, { follow = true } = {}) {
  const SEP = "\n__prodsweep__";
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(url);
  const args = ["-sS", "--retry", "2", "--max-time", "60",
    "-w", `${SEP}%{http_code} %{num_redirects} %{url_effective}`];
  /* 対照の台はこの箱の中。proxy に回すと自分の 127.0.0.1 にも届かない */
  if (local) args.push("--noproxy", "127.0.0.1,localhost,::1");
  if (follow) args.push("-L");
  args.push(url);
  try {
    const { stdout } = await run("curl", args, { maxBuffer: 1 << 28, encoding: "utf8" });
    const i = stdout.lastIndexOf(SEP);
    if (i < 0) return { status: null, body: "", bytes: 0, hops: 0, final: url, err: "書き出しが取れない" };
    const [code, hops, final] = stdout.slice(i + SEP.length).trim().split(" ");
    const body = stdout.slice(0, i);
    const status = Number(code);
    return {
      status: Number.isFinite(status) && status > 0 ? status : null,
      body,
      bytes: Buffer.byteLength(body, "utf8"),
      hops: Number(hops) || 0,
      final: final || url,
      err: null,
    };
  } catch (e) {
    return { status: null, body: "", bytes: 0, hops: 0, final: url,
      err: String(e.message || e).split("\n")[0].slice(0, 120) };
  }
}

/** URL を道だけにして出す（表が横に伸びないように） */
const at = (u) => { try { return new URL(u).pathname || u; } catch { return u; } };

/**
 * 1本ぶんの判定。**ブラウザも本番も要らない純粋な関数。**
 *
 * ここが腐ると出るのは**「違反 0」**（#157 #164）。0件はいちばん合格に見えるので、
 * 判定だけを切り出して毎 PR で回す（`prodsweep_selftest.mjs`）。
 *
 * @param legs 抜く足（`Set`）。`BREAK=` で1本ずつ抜いて、対照が落ちることを見る
 * @returns {{unread:boolean, err:string|null, checks:{key:string,name:string,ok:boolean,why:string}[], hops:number}}
 */
export function judgePage(r, { legs = new Set(), thinLimit = THIN_BYTES } = {}) {
  /* **読めなかったものを、測れた顔で 0 に畳まない**（#157）。
     判定に混ぜず、呼ぶ側が「読めなかった」として数える */
  if (r.err) return { unread: true, err: r.err, checks: [], hops: 0, notes: [] };
  const on = (l) => !legs.has(l);
  const url = r.url || r.final || "";
  const checks = [];
  const notes = [];

  checks.push({ key: "status", name: "HTTP が 200", ok: !on("status") || r.status === 200,
    why: `${r.status} で返った` });

  const n = countH1(r.body);
  checks.push({ key: "h1", name: "h1 がちょうど1つ", ok: !on("h1") || n === 1,
    why: `h1 が ${n}個` });

  const t = titleOf(r.body);
  checks.push({ key: "title", name: "<title> が空でない", ok: !on("title") || !!t,
    why: t === null ? "<title> が無い" : "<title> が空" });

  checks.push({ key: "thin", name: `本文が ${thinLimit}B 以上`, ok: !on("thin") || r.bytes >= thinLimit,
    why: `本文が ${r.bytes}B しかない（本番の最小の面は 36,076B）` });

  /* **追ったことを表に出す。** 溜めるだけにしない（#164 の決めごと3）。
     `tell` を抜くと黙って追うだけになる＝別の面を見ているのに気づけない */
  if (r.hops > 0 && on("tell")) {
    notes.push(`⇢ たどった: ${at(url)} → ${at(r.final)}（見ているのは ${at(r.final)} の中身）`);
  }
  checks.push({ key: "tell", name: "追ったことが表に出る", ok: r.hops === 0 || notes.length > 0,
    why: "リダイレクトを追ったのに、そのことがどこにも出ていない" });

  return { unread: false, err: null, checks, hops: r.hops, notes };
}

/* --------------------------------------------------------------- 対照 -- */

/** 対照の台。**本物と同じ道具で測る**（curl → 状態コード → 本文）。相手だけ小さくする。
 *
 * **落ちてほしい台は、狙った足だけで落ちるように作る。** 1枚で2つも3つも
 * 折れる台を置くと、その足を抜いても台が別の理由で落ち続けて、
 * **抜いたことに気づけない**（`/ctl/thin` を 21B の裸の本文にすると、
 * `h1` と `title` でも落ちるので `BREAK=thin` が空振りする。実際に1度そうなった）。 */
export function controlServer() {
  const fat = "あ".repeat(20000);
  /* 絵の説明の `<title>`。**本文の側に居る**ので、面の題名として拾ってはいけない */
  const svg = `<svg><title>絵の説明</title></svg>`;
  const page = (h1, title) =>
    `<!doctype html><html lang="ja"><head><title>${title}</title></head><body>` +
    `<main>${h1}<p>${fat}</p>${svg}</main></body></html>`;
  const H1 = `<h1 class="t"><img src="/x.png" alt=""><span>ある面の名前</span></h1>`;
  /* Firebase Hosting が 301 で返す本文。**実測21バイト** */
  const STUB = "Redirecting to /cards";
  const srv = createServer((req, res) => {
    const p = (req.url || "").split("?")[0];
    const send = (code, body, extra = {}) => {
      res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...extra });
      res.end(body);
    };
    if (p === "/ctl/ok") return send(200, page(H1, "ある面"));
    if (p === "/ctl/404") return send(404, page(H1, "ある面"));
    if (p === "/ctl/h1none") return send(200, page("", "ある面"));
    if (p === "/ctl/h1two") return send(200, page(H1 + H1, "ある面"));
    if (p === "/ctl/titleempty") return send(200, page(H1, ""));
    /* `<head>` に題名が無く、**本文には SVG の題名が在る**台。
       `<head>` の中だけを見ていなければ「絵の説明」を題名として拾って通る */
    if (p === "/ctl/titlenone") return send(200,
      `<!doctype html><html><head></head><body>${H1}<p>${fat}</p>${svg}</body></html>`);
    /* **痩せだけで落ちる台。** h1 も題名も揃えてある */
    if (p === "/ctl/thin") return send(200,
      `<!doctype html><html><head><title>小さい面</title></head><body><h1>小さい</h1></body></html>`);
    if (p === "/ctl/moved") return send(301, STUB, { location: "/ctl/ok" });
    return send(404, "<h1>台にない道</h1>");
  });
  return srv;
}

/**
 * 8本の対照。`want` は「その面が**通ってほしい**か」、
 * `keys` は落ちてほしいときに**どの足で**落ちてほしいか。
 * **狙った足「だけ」で落ちること**まで見る（多いのも違反）。
 * 足を抜いたときに**別々の項目で**落ちることを、ここで名指ししている。
 */
export const CONTROLS = [
  ["ok", "/ctl/ok", true, []],
  ["404", "/ctl/404", false, ["status"]],
  ["h1none", "/ctl/h1none", false, ["h1"]],
  ["h1two", "/ctl/h1two", false, ["h1"]],
  ["titleempty", "/ctl/titleempty", false, ["title"]],
  ["titlenone", "/ctl/titlenone", false, ["title"]],
  ["thin", "/ctl/thin", false, ["thin"]],
  /* 追えば `/ctl/ok` に着いて通る。**追ったことが表に出る**ところまで見る。
     `BREAK=follow` だと 301 の本文21バイトを掴んで `status h1 title thin` で落ち、
     `BREAK=tell` だと追えてはいるが `tell` だけで落ちる。**別の足**だと分かる */
  ["moved", "/ctl/moved", true, []],
];

/**
 * 対照を8本回す。**本番を1本も叩く前に呼ぶ。**
 *
 * @param controls 台の表。差し替えられるのは**見張りの見張り**のため
 *   （`prodsweep_selftest.mjs` が、わざと足を書き違えた表を渡して
 *   「狙った足だけで落ちる」の守りが生きているかを見る）
 * @returns {{name:string,want:boolean,got:boolean,keys:string[],notes:string[],ok:boolean}[]}
 */
export async function runControls({ legs = new Set(), controls = CONTROLS } = {}) {
  const srv = controlServer();
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const rows = [];
  for (const [name, path, want, wantKeys] of controls) {
    const r = await fetchOne(base + path, { follow: !legs.has("follow") });
    const v = judgePage({ ...r, url: base + path }, { legs });
    const keys = v.checks.filter((c) => !c.ok).map((c) => c.key);
    const got = !v.unread && keys.length === 0;
    /* **狙った足だけで落ちること。** 別の足でも落ちていると、見たかった足を
       抜いても台が落ち続けて、抜いたことに気づけない */
    const rightLeg = want ? true : [...keys].sort().join(" ") === [...wantKeys].sort().join(" ");
    rows.push({ name, want, got, keys, notes: v.notes, unread: v.unread,
      ok: got === want && rightLeg });
  }
  await new Promise((ok) => srv.close(ok));
  return rows;
}

/* ------------------------------------------- 対照（3つの一覧の突き合わせ）-- */

/** 突き合わせの対照の、素の組。**3つとも揃っていて、名乗る数も合っている** */
const LIST_BASE = () => ({
  sitemap: ["/", "/x", "/y"],
  all: [{ href: "/", name: "島" }, { href: "/x", name: "エックス" }, { href: "/y", name: "ワイ" }],
  app: ["/", "/x"],
  nameOf: { "/": "島", "/x": "エックス", "/y": "ワイ" },
  claimed: 3,
  absences: [],
});

const DATED = "いまは載せないと決めている（2026-09-19）";

/**
 * 突き合わせの台。**1枚が狙った足「だけ」で落ちるように作る**（#169 の決めごと4）。
 *
 * 面を1つ落とす／1つ増やす／理由を消す、が**別々の項目で**落ちること。
 * 落とす側は名乗る数も一緒に動かす——動かさないと `claim` でも落ちて、
 * 狙った足を抜いたときに台が落ち続ける（＝抜いたことに気づけない）。
 */
export const LIST_CONTROLS = [
  ["ok", true, [], (b) => b],
  /* `/all` から1面消えた（在るのに1回で行けない） */
  ["dropped", false, ["amiss"], (b) => ({ ...b, all: b.all.filter((r) => r.href !== "/y"), claimed: 2 })],
  /* `/all` にだけ在って、sitemap に無い（検索から見つからない） */
  ["added", false, ["smiss"], (b) => ({
    ...b, all: [...b.all, { href: "/z", name: "ゼット" }], claimed: 4 })],
  /* 抜けているが、理由が書いてある */
  ["excused", true, [], (b) => ({
    ...b, all: b.all.filter((r) => r.href !== "/y"), claimed: 2,
    absences: [{ path: "/y", lists: ["all"], why: `ワイは索引に並べない。${DATED}` }] })],
  /* 理由を消した */
  ["excuse-empty", false, ["excuse"], (b) => ({
    ...b, all: b.all.filter((r) => r.href !== "/y"), claimed: 2,
    absences: [{ path: "/y", lists: ["all"], why: "" }] })],
  /* 理由は在るが、いつ時点の話かが無い */
  ["excuse-nodate", false, ["excuse"], (b) => ({
    ...b, all: b.all.filter((r) => r.href !== "/y"), claimed: 2,
    absences: [{ path: "/y", lists: ["all"], why: "ワイは索引に並べないことにしている" }] })],
  /* 宣言だけ残って、面は両方に並んでいる（掃除漏れ） */
  ["unused", false, ["unused"], (b) => ({
    ...b, absences: [{ path: "/y", lists: ["all"], why: `ワイは索引に並べない。${DATED}` }] })],
  /* 名乗る数が合わない */
  ["claim", false, ["claim"], (b) => ({ ...b, claimed: 99 })],
  /* 名乗りそのものが読めない */
  ["claim-none", false, ["claim"], (b) => ({ ...b, claimed: null })],
  /* **別名で行ける。** `/island/k` は `/all` に無いが、`/` の行が同じ名前 */
  ["alias", true, [], (b) => ({
    ...b, sitemap: [...b.sitemap, "/island/k"],
    all: [{ href: "/", name: "ケー" }, ...b.all.slice(1)],
    nameOf: { ...b.nameOf, "/": "ケー", "/island/k": "ケー" } })],
  /* 別名のつもりだが、`/` の行は別の島。**名前で照合していなければ通ってしまう** */
  ["alias-wrongname", false, ["amiss"], (b) => ({
    ...b, sitemap: [...b.sitemap, "/island/k"],
    nameOf: { ...b.nameOf, "/island/k": "ケー" } })],
];

/**
 * **線を通した対照。** 偽のサーバに `sitemap.xml` と `/all` を置いて、
 * `sitemapPaths()` → `parseAll()` → `reconcile()` を**本番と同じ道**で回す。
 *
 * 上の `LIST_CONTROLS` は判定そのもの（一覧を直に渡す）を見ていて、
 * **読みかたは見ていない。** `/all` の刷り方が変わった日に落ちるのはこちら。
 *
 * 2枚の `/all` を当てる——**揃っている板**（違反 0 であってほしい）と、
 * **1面だけ sitemap に無い板**（`smiss` 1件で落ちてほしい）。
 * 片側だけは対照ではない（§15）。
 *
 * @returns {{name:string,want:boolean,got:boolean,keys:string[],ok:boolean,why:string}[]}
 */
export async function runWireControls({ legs = new Set() } = {}) {
  const row = (href, name) =>
    `<li data-q="${name}"><a class="dx" href="${href}"><span class="dx-body">`
    + `<b>${name}</b><i>そえがき</i></span></a></li>`;
  const page = (rows, claimed) =>
    `<!doctype html><html lang="ja"><head><title>島のなか ぜんぶ</title></head><body>`
    + `<h1>島のなか ぜんぶ</h1><p>島にある紙、${claimed}枚。ここからどこへでも1回で行ける。</p>`
    + `<ul class="dxl">${rows.join("")}</ul></body></html>`;
  const SM = ["/", "/a", "/b"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset>`
    + SM.map((u) => `<url><loc>https://ctl.test${u}</loc></url>`).join("") + `</urlset>`;
  const tidy = page([row("/", "島"), row("/a", "エー"), row("/b", "ビー")], 3);
  const stray = page([row("/", "島"), row("/a", "エー"), row("/b", "ビー"), row("/z", "ゼット")], 4);

  const srv = createServer((req, res) => {
    const u = (req.url || "").split("?")[0];
    if (u === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(xml);
    }
    if (u === "/all" || u === "/all-stray") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(u === "/all" ? tidy : stray);
    }
    res.writeHead(404, { "content-type": "text/html" }); res.end("<h1>ない</h1>");
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const rows = [];
  const sm = await sitemapPaths(base);
  rows.push({ name: "sitemap を線ごしに読む", want: true,
    got: sm.paths.join(" ") === SM.join(" "), keys: [],
    ok: sm.paths.join(" ") === SM.join(" "), why: sm.paths.join(" ") || sm.why });

  for (const [name, path, want, wantKeys] of [
    ["all-tidy", "/all", true, []],
    ["all-stray", "/all-stray", false, ["smiss"]],
  ]) {
    const r = await fetchOne(base + path);
    const al = parseAll(r.body);
    const v = reconcile({ sitemap: sm.paths, all: al.rows, app: SM,
      claimed: al.claimed, absences: [], legs });
    const keys = [...new Set(v.bad.map((b) => b.key))].sort();
    const got = keys.length === 0;
    const rightLeg = want ? true : keys.join(" ") === [...wantKeys].sort().join(" ");
    rows.push({ name, want, got, keys, ok: got === want && rightLeg,
      why: `行 ${al.rows.length}・名乗り ${al.claimed}` });
  }
  await new Promise((ok) => srv.close(ok));
  return rows;
}

/**
 * 突き合わせの対照を回す。**本番を1本も叩く前に呼ぶ。**
 * @returns {{name:string,want:boolean,got:boolean,keys:string[],ok:boolean}[]}
 */
export function runListControls({ legs = new Set(), controls = LIST_CONTROLS } = {}) {
  return controls.map(([name, want, wantKeys, make]) => {
    const r = reconcile({ ...make(LIST_BASE()), legs });
    const keys = [...new Set(r.bad.map((b) => b.key))].sort();
    const got = keys.length === 0;
    /* **狙った足だけで落ちること**（多いのも違反） */
    const rightLeg = want ? true : keys.join(" ") === [...wantKeys].sort().join(" ");
    return { name, want, got, keys, notes: r.notes, ok: got === want && rightLeg };
  });
}

/* --------------------------------------------------------------- 本番 -- */

async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(LANES, items.length) }, async () => {
      for (;;) {
        const n = i++;
        if (n >= items.length) return;
        out[n] = await fn(items[n]);
      }
    }),
  );
  return out;
}

async function main() {
  const legs = new Set(process.env.BREAK ? process.env.BREAK.split(",").filter(Boolean) : []);
  const known = new Set(["status", "h1", "title", "thin", "follow", "tell",
    "smiss", "amiss", "alias", "excuse", "unused", "claim"]);
  for (const l of legs) {
    if (!known.has(l)) {
      console.log(`::error::BREAK=${l} は知らない足です（${[...known].join(" ")}）`);
      return 2;
    }
  }

  // 1. 対照。**ここが揃うまで本番の面は1本も測らない**
  const ctl = await runControls({ legs });
  const ctlNg = ctl.filter((c) => !c.ok);
  console.log(`対照 ${ctl.length}本${legs.size ? `（BREAK=${[...legs].join(",")}）` : ""}`);
  for (const c of ctl) {
    const got = c.got ? "通った" : `落ちた（${c.keys.join(" ") || "—"}）`;
    console.log(`  ${c.ok ? "ok" : "NG"} ${c.name}: ${c.want ? "通ってほしい" : "落ちてほしい"} → ${got}`);
  }
  if (ctlNg.length) {
    console.log(`::error::対照が ${ctlNg.length}本 外れました（${ctlNg.map((c) => c.name).join(" ")}）。` +
      "測りかたが壊れているので、本番の数字は1つも出しません");
    return 2;
  }

  // 1b. 突き合わせの対照。**ここも揃うまで本番の面は1本も測らない**
  const lctl = [...runListControls({ legs }), ...(await runWireControls({ legs }))];
  const lctlNg = lctl.filter((c) => !c.ok);
  console.log(`\n突き合わせの対照 ${lctl.length}本（うち3本は偽のサーバを立てて線ごしに）`);
  for (const c of lctl) {
    const got = c.got ? "通った" : `落ちた（${c.keys.join(" ") || "—"}）`;
    console.log(`  ${c.ok ? "ok" : "NG"} ${c.name}: ${c.want ? "通ってほしい" : "落ちてほしい"} → ${got}`);
  }
  if (lctlNg.length) {
    console.log(`::error::突き合わせの対照が ${lctlNg.length}本 外れました（${lctlNg.map((c) => c.name).join(" ")}）。` +
      "本番の数字は1つも出しません");
    return 2;
  }

  // 2. 数えるものを集める。**手で並べない**（§8）
  const sm = await sitemapPaths();
  if (sm.paths.length < 20) {
    console.log(`::error::sitemap から面が引けません（${sm.paths.length}本・${sm.why}）。数えるものが無いので止めます`);
    return 2;
  }
  const app = staticAppPaths();
  if (app.paths.length < 5) {
    console.log(`::error::site/app から静的な道が引けません（${app.paths.length}本・${app.why}）。数えるものが無いので止めます`);
    return 2;
  }
  /* 3つめ。**動く段（`[chapter]`）の面はここからしか出ない。**
     `/island/<章>/streams` の4面は sitemap にも静的な道にも居ないので、
     2つの一覧だけを足していたあいだ、いちばん大きい面（949,893B）が
     見張りの外に居た（2026-09-19） */
  const al = await allPaths();
  if (al.rows.length < 20) {
    console.log(`::error::/all から行き先が引けません（${al.rows.length}本・${al.why}）。数えるものが無いので止めます`);
    return 2;
  }
  const allHrefs = [...new Set(al.rows.map((r) => r.href))];

  const seen0 = new Set(sm.paths);
  const fromApp = app.paths.filter((p) => !seen0.has(p));
  for (const p of fromApp) seen0.add(p);
  const fromAll = allHrefs.filter((p) => !seen0.has(p));
  const pages = [...sm.paths, ...fromApp, ...fromAll];

  console.log(`\n${ORIGIN} を一周する`);
  console.log(`  面の一覧: sitemap ${sm.paths.length}面 ＋ 静的な道から ${fromApp.length}面`
    + ` ＋ /all から ${fromAll.length}面 = ${pages.length}面`);
  console.log(`  サイトマップに無い静的な道（site/app/**/page.tsx から）: ${fromApp.join(" ") || "—"}`);
  console.log(`  どちらにも無く、/all にだけ在る面（動く段はここからしか出ない）: ${fromAll.join(" ") || "—"}`);

  // 3. 測る
  const res = await pool(pages, async (p) => {
    const r = await fetchOne(ORIGIN + p, { follow: !legs.has("follow") });
    return { p, r, v: judgePage({ ...r, url: ORIGIN + p }, { legs }) };
  });

  // 4. 出す。**分母から**（§15）
  const unread = res.filter((x) => x.v.unread);
  const seen = res.filter((x) => !x.v.unread);
  console.log(`\n見た ${seen.length}面 / 読めなかった ${unread.length}面（一覧は ${pages.length}面）`);

  let ng = 0;
  for (const [key, name] of [["status", "HTTP が 200"], ["h1", "h1 がちょうど1つ"],
    ["title", "<title> が空でない"], ["thin", `本文が ${THIN_BYTES}B 以上`],
    ["tell", "追ったことが表に出る"]]) {
    const rows = seen.filter((x) => x.v.checks.some((c) => c.key === key));
    const bad = rows.filter((x) => x.v.checks.some((c) => c.key === key && !c.ok));
    ng += bad.length;
    console.log(`  ${name}: ${rows.length}面中 ${rows.length - bad.length}面 通った / 違反 ${bad.length}`);
    for (const x of bad) {
      const c = x.v.checks.find((y) => y.key === key && !y.ok);
      console.log(`     NG ${x.p} ${c.why}`);
    }
  }

  /* リダイレクトは**違反ではない**（設計どおりのものが在る）。数えて表に出す */
  const hopped = seen.filter((x) => x.v.hops > 0);
  console.log(`  リダイレクト: ${seen.length}面中 追った ${hopped.length}面`);
  for (const x of hopped) for (const n of x.v.notes) console.log(`     ${n}`);

  /* 5. 3つの一覧の突き合わせ。**面を測ったあと**——`alias` は、
        抜けている面の `<h1>` の名前が要る（読めた面からしか取れない） */
  const nameOf = Object.fromEntries(seen.map((x) => [x.p, h1Name(x.r.body)]));
  const rec = reconcile({
    sitemap: sm.paths, all: al.rows, app: app.paths, nameOf, claimed: al.claimed, legs,
  });
  console.log(`\n3つの一覧を突き合わせる（面は ${rec.union.length}／`
    + `sitemap ${sm.paths.length}・/all ${allHrefs.length}（行は ${al.rows.length}）・静的な道 ${app.paths.length}）`);
  console.log(`  /all の名乗り: 「島にある紙、${al.claimed ?? "?"}枚」／並んでいる行き先 ${rec.distinct}`);
  for (const [key, name] of [["smiss", "sitemap.xml に載っている"], ["amiss", "/all から1回で行ける"],
    ["excuse", "載せないと決めた理由が書いてある"], ["unused", "その宣言がまだ効いている"],
    ["claim", "/all の名乗りが、並んでいる数と合う"]]) {
    const b = rec.bad.filter((x) => x.key === key);
    console.log(`  ${name}: 違反 ${b.length}`);
    for (const x of b) console.log(`     NG ${x.path} ${x.why}`);
  }
  /* 揃っていないが、そう決めてあるもの。**黙って畳まない**——数も中身も表に出す */
  console.log(`  揃えないと決めてあるもの: ${rec.notes.length}件`);
  for (const n of rec.notes) console.log(`     ${n}`);
  ng += rec.bad.length;

  if (unread.length) {
    console.log(`\n読めなかった ${unread.length}面`);
    for (const x of unread) console.log(`  ?? ${x.p} ${x.v.err}`);
    console.log("::error::読めなかった面があります。違反の数を「0」と読めないので 2 で止めます");
    return 2;
  }
  if (ng) {
    console.log(`\n::error::${ng}件 見つかりました`);
    return 1;
  }
  console.log(`\n${seen.length}面ぜんぶ通りました`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
