#!/usr/bin/env node
/**
 * 11月の授賞式（OBS 1枚）を書き出す。
 *
 *   node tools/monthly_review/build_202611.mjs            # 本番 → public/202611_monthly_review.html
 *   node tools/monthly_review/build_202611.mjs --preview  # 無い JSON だけ見本で埋める → .out/202611_preview.html
 *   node tools/monthly_review/build_202611.mjs --sample   # 全部 見本（sample.json）  → .out/202611_sample.html
 *   --out <path>   書き出し先を変える（--preview / --sample のとき public/ には書かない）
 *   --no-net       アバターと絵を取りに行かない（.cache にあるものだけ使う）
 *
 * ## 読むもの
 *
 * - `202611.template.html` … 見た目と仕掛け（手で直すのはこちら。public の HTML は書き出したもの）
 * - `2026-11.content.json` … 中身。形は 10月版の REVIEW_DATA から kinkin と tips を抜いたもの
 *   （month, period, opening, recap, newcomers, quiz, buzzwords, meigen, funny, fusen, guides, omake, letter, ending）
 *   - `recap[i].cards: [{img, caption}]` … 6分割の各コマに出す、あやと島カードの写真（1〜3枚。MR-14）
 *   - `quiz[i].card: {img} | null`        … 問いと一緒に大きく出す写真（MR-15）
 *   - `fusen: {lead, categories:[{label,text,by,hearts,date,after,img}], grandPrix:{同じ形}}` … 付箋大賞（MR-19）
 *   `img` は tools/monthly_review/ からの相対パス。長い辺 960px の JPEG に縮めて data URI で焼き込む。
 *   ファイルが無い写真は出さない（書き出しの終わりに「無い」と数えて出す）
 * - `2026-11.kinkin.json`  … 出席 `{denom, winners:[{name,streak,word}], others:[{name,d}], note}`
 * - `2026-11.tips.json`    … 投げ銭 `{rows:[{handle,display,yen,rank,icon}], total, period}`（貢献額。ここで割り算しない）
 * - アバター … YouTube のチャンネルページの og:image を `=s176-c-rj`（JPEG）で取って data URI。
 *   取れない人はイニシャルの丸（画面の側が出す）
 * - 投げ銭の絵 … 図鑑のキャラクター（`icon` が鍵）。島の口から 256px、だめなら public/review/c の 128px
 * - 城とピポ … public/alert/themes/castle/（11月の投げ銭アラートの絵そのまま）と castle.json
 * - 画面は 1080×1080（docs/spec/monthly-review.md MR-6）。測るのは check.mjs
 * - 字 … 島の丸ゴシック（Zen Maru Gothic）を、この面で使う字だけに切って焼き込む。
 *   Google Fonts を実行時に読まない（オフラインで崩れる）。切る道具（fontTools）が無ければ端末の字に落ちる
 *
 * ## 見本のまま本番の名前で書かない
 *
 * 本番（旗なし）は3つの JSON が全部そろっていないと止まる。見本（sample.json）は
 * `--preview` / `--sample` のときだけ読み、そのときは public/ に書かない。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const MONTH = "2026-11";
const TEMPLATE = join(HERE, "202611.template.html");
const CACHE = join(HERE, ".cache");
const CASTLE = join(ROOT, "public/alert/themes/castle");
const FONT_SRC = "/tmp/zenmaru-src"; // tools/fonts/subset.py と同じ置き場
const FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/ZenMaruGothic-{}.ttf";
const CHAR_API = "https://live-streaming-d3cac.web.app/island-api/characters";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const MODE = flag("--sample") ? "sample" : flag("--preview") ? "preview" : "final";
const NO_NET = flag("--no-net");
const OUT = resolve(
  opt("--out") ||
    (MODE === "final" ? join(ROOT, "public/202611_monthly_review.html") : join(HERE, ".out", `202611_${MODE}.html`))
);
if (MODE !== "final" && relative(join(ROOT, "public"), OUT).split("/")[0] !== "..") {
  die(`--${MODE} のときは public/ に書かない（見本が本番に出る）: ${OUT}`);
}

function die(msg) {
  console.error(`build_202611: ${msg}`);
  process.exit(1);
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/* ---------------------------------------------------------------- 中身 */
function loadData() {
  const files = {
    content: join(HERE, `${MONTH}.content.json`),
    kinkin: join(HERE, `${MONTH}.kinkin.json`),
    tips: join(HERE, `${MONTH}.tips.json`),
  };
  const have = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, existsSync(p)]));
  const used = {};
  let base = {};
  if (MODE === "final") {
    const missing = Object.entries(have).filter(([, v]) => !v).map(([k]) => files[k]);
    if (missing.length) die(`まだ無い: ${missing.map((p) => relative(ROOT, p)).join(", ")}（見本で見るなら --preview）`);
  } else {
    base = readJson(join(HERE, "sample.json"));
    delete base._sample;
  }
  const real = (k) => MODE !== "sample" && have[k];
  let data = { ...base };
  if (real("content")) {
    const c = readJson(files.content);
    for (const [k, v] of Object.entries(c)) if (!k.startsWith("_")) data[k] = v;
    used.content = "本物";
  } else used.content = "見本";
  if (real("kinkin")) {
    data.kinkin = readJson(files.kinkin);
    used.kinkin = "本物";
  } else used.kinkin = "見本";
  if (real("tips")) {
    data.tips = readJson(files.tips);
    used.tips = "本物";
  } else used.tips = "見本";
  return { data, used };
}

function validate(D) {
  const errs = [];
  const need = (cond, msg) => cond || errs.push(msg);
  const arr = (v) => Array.isArray(v);
  need(typeof D.month === "string" && /月$/.test(D.month), "month は「11月」の形");
  need(typeof D.period === "string" && D.period.includes("〜"), "period は「10/31 〜 11/27」の形");
  need(D.opening && D.opening.title && arr(D.opening.stats), "opening{title,sub,stats[]}");
  need(arr(D.recap) && D.recap.every((r) => r.when && r.title && r.body), "recap[]{when,title,body}");
  const K = D.kinkin || {};
  need(Number(K.denom) > 0 && arr(K.winners) && arr(K.others), "kinkin{denom,winners[],others[]}");
  for (const w of K.winners || []) need(w.name && Number.isInteger(w.streak), `kinkin.winners の streak が整数でない: ${w.name}`);
  need(D.newcomers && arr(D.newcomers.featured) && D.newcomers.count != null, "newcomers{featured[],count,note}");
  need(arr(D.quiz) && D.quiz.length > 0, "quiz[]");
  (D.quiz || []).forEach((q, i) =>
    need(arr(q.choices) && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `quiz[${i}] の answer が choices の外`)
  );
  need(D.buzzwords && arr(D.buzzwords.nominees) && D.buzzwords.grandPrix && D.buzzwords.grandPrix.word, "buzzwords{nominees[],grandPrix{word,note,first}}");
  need(arr(D.meigen), "meigen[]");
  need(D.funny && arr(D.funny.categories) && D.funny.grandPrix && D.funny.grandPrix.winner, "funny{categories[],grandPrix{winner,note}}");
  need((D.funny?.categories || []).length <= 6, "おもしろコメントの部門賞は6まで（SKILL §6-2）");
  need(D.guides && arr(D.guides.rows), "guides{lead,rows[]}");
  need(arr(D.omake), "omake[]");
  const T = D.tips || {};
  need(arr(T.rows) && T.rows.length > 0 && Number.isFinite(T.total), "tips{rows[],total,period}");
  need((T.rows || []).some((r) => r.rank === 1), "tips に 1位が無い");
  need(D.letter && arr(D.letter.paragraphs) && D.letter.sign, "letter{paragraphs[],sign}");
  need(D.ending && D.ending.title, "ending{title,sub,ps,tapGoal}");
  for (const [i, r] of (D.recap || []).entries())
    need(r.cards == null || (arr(r.cards) && r.cards.every((c) => c && typeof c.img === "string")), `recap[${i}].cards は [{img,caption}]`);
  for (const [i, q] of (D.quiz || []).entries()) need(q.card == null || typeof q.card.img === "string", `quiz[${i}].card は {img} か null`);
  need((D.quiz || []).every((q) => q.choices.length === 3), "クイズは A・B・C の3択（MR-15）");
  if (D.fusen != null) {
    const F = D.fusen;
    const okNote = (f) => f && f.label && f.text && (f.hearts == null || Number.isFinite(Number(f.hearts)));
    need(arr(F.categories) && F.categories.every(okNote), "fusen.categories[]{label,text,by,hearts,date,after,img}");
    need((F.categories || []).length <= 5, "付箋大賞の部門賞は5まで（MR-11）");
    need(F.grandPrix == null || okNote(F.grandPrix), "fusen.grandPrix{label,text,by,hearts,date,after,img}");
  }
  // 見せる名前は「あやと島案内鳥」。画面にも署名にも中の名前を書かない
  const blob = JSON.stringify(D);
  need(!/claude/i.test(blob), "中身に「Claude」がある（視聴者さんに見せる名前は「あやと島案内鳥」）");
  need(D.letter?.sign?.includes("あやと島案内鳥"), "手紙の署名は「あやと島案内鳥 より」");
  if (errs.length) die("中身の形が合わない:\n  - " + errs.join("\n  - "));
}

/* ---------------------------------------------------------------- 取りに行く */
async function get(url, asText) {
  try {
    const r = await fetch(url, { headers: { "accept-language": "ja", "user-agent": "Mozilla/5.0 (monthly-review build)" } });
    if (!r.ok) return null;
    return asText ? await r.text() : Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}
const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString("base64")}`;
const sniff = (buf) =>
  buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 ? "image/png" : buf.slice(8, 12).toString() === "WEBP" ? "image/webp" : null;

/** その中身で、顔を出す人（@ハンドル）の一覧 */
function handlesOf(D) {
  const names = [
    ...(D.kinkin.winners || []).map((p) => p.name),
    ...(D.kinkin.others || []).map((p) => p.name),
    ...(D.newcomers.featured || []).map((p) => p.name),
    ...(D.meigen || []).map((p) => p.name),
    ...(D.funny.categories || []).map((p) => p.name),
    D.funny.grandPrix?.winner?.name,
    ...(D.guides.rows || []).map((p) => p.name),
  ];
  return [...new Set(names.filter((n) => typeof n === "string" && n.startsWith("@")).map((n) => n.slice(1).trim()))];
}

async function avatars(handles) {
  const dir = join(CACHE, "avatars");
  mkdirSync(dir, { recursive: true });
  const got = {};
  const miss = [];
  await pool(handles, 6, async (h) => {
    const f = join(dir, createHash("sha1").update(h).digest("hex").slice(0, 16) + ".jpg");
    let buf = existsSync(f) ? readFileSync(f) : null;
    if (!buf && !NO_NET) {
      const html = await get(`https://www.youtube.com/@${encodeURIComponent(h)}`, true);
      const m = html && html.match(/<meta property="og:image" content="([^"]+)"/);
      if (m) {
        const url = m[1].replace(/=s\d+[^/]*$/, "=s176-c-rj");
        buf = await get(url);
        if (buf && sniff(buf)) writeFileSync(f, buf);
        else buf = null;
      }
    }
    if (buf && sniff(buf)) got[h] = dataUri(buf, sniff(buf));
    else miss.push(h);
  });
  return { got, miss };
}

async function chars(ids) {
  const dir = join(CACHE, "chars");
  mkdirSync(dir, { recursive: true });
  const got = {};
  const small = [];
  const miss = [];
  await pool(ids, 6, async (id) => {
    const f = join(dir, `${id}-256.webp`);
    let buf = existsSync(f) ? readFileSync(f) : null;
    if (!buf && !NO_NET) {
      buf = await get(`${CHAR_API}/${encodeURIComponent(id)}/plain-256.webp`);
      if (buf && sniff(buf)) writeFileSync(f, buf);
      else buf = null;
    }
    if (!buf) {
      const local = join(ROOT, "public/review/c", `${id}-128.webp`);
      if (existsSync(local)) {
        buf = readFileSync(local);
        small.push(id);
      }
    }
    if (buf && sniff(buf)) got[id] = dataUri(buf, sniff(buf));
    else miss.push(id);
  });
  return { got, small, miss };
}

/* ---------------------------------------------------------------- 写真（カード・付箋） */
/** 中身の `img`（tools/monthly_review/ からの相対パス）を全部集める */
function imagePaths(D) {
  const out = [];
  for (const r of D.recap || []) for (const c of r.cards || []) out.push(c.img);
  for (const q of D.quiz || []) if (q.card) out.push(q.card.img);
  for (const f of [...(D.fusen?.categories || []), D.fusen?.grandPrix]) if (f && f.img) out.push(f.img);
  return [...new Set(out.filter((p) => typeof p === "string" && p))];
}
/** 長い辺 960px の JPEG に縮めて data URI にする（PIL）。縮めたものは .cache/img に置く */
function images(paths) {
  const dir = join(CACHE, "img");
  mkdirSync(dir, { recursive: true });
  const got = {};
  const miss = [];
  const todo = [];
  for (const p of paths) {
    const src = resolve(HERE, p);
    if (!existsSync(src)) {
      miss.push(p);
      continue;
    }
    const st = readFileSync(src);
    const f = join(dir, createHash("sha1").update(st).digest("hex").slice(0, 16) + ".jpg");
    if (!existsSync(f)) todo.push([src, f]);
    got[p] = f;
  }
  if (todo.length) {
    const py = `
import sys
from PIL import Image, ImageOps
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 250, 228))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    im = im.convert("RGB")
    im.thumbnail((960, 960), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
`;
    try {
      execFileSync("python3", ["-I", "-c", py, ...todo.flat()], { stdio: "pipe" });
    } catch (err) {
      die(`写真を縮められない（PIL）: ${String(err.stderr || err).slice(0, 200)}`);
    }
  }
  for (const [p, f] of Object.entries(got)) got[p] = dataUri(readFileSync(f), "image/jpeg");
  return { got, miss };
}

/* ---------------------------------------------------------------- 城とピポ */
function art() {
  const def = readJson(join(CASTLE, "castle.json"));
  const png = (f) => dataUri(readFileSync(join(CASTLE, f)), "image/png");
  const pipo = {};
  for (const [pose, sp] of Object.entries(def.pipo.poses)) {
    if (["walk1"].includes(pose)) continue; // 静止画では使わない
    pipo[pose] = png(sp.file);
  }
  return {
    def,
    castleBase: png("bank-base-0.png"),
    castleFill: png("bank-fill-0.png"),
    flag: png(def.flag.file),
    coin: png(def.coin.file),
    ribbon: png(def.ribbon.file),
    pipo,
  };
}

/* ---------------------------------------------------------------- 字 */
async function fontFace(text) {
  const chars = [...new Set(Array.from(text))].filter((c) => c.codePointAt(0) >= 0x20).join("");
  const weights = [
    [700, "Bold"],
    [900, "Black"],
  ];
  const out = [];
  const tmp = mkdtempSync(join(tmpdir(), "mr-font-"));
  try {
    const txt = join(tmp, "chars.txt");
    writeFileSync(txt, chars);
    for (const [w, style] of weights) {
      const src = join(FONT_SRC, `ZenMaruGothic-${style}.ttf`);
      if (!existsSync(src)) {
        if (NO_NET) return { css: "", note: "書体の元が無い（--no-net）" };
        const buf = await get(FONT_URL.replace("{}", style));
        if (!buf) return { css: "", note: "書体の元を落とせなかった" };
        mkdirSync(FONT_SRC, { recursive: true });
        writeFileSync(src, buf);
      }
      const dst = join(tmp, `${w}.woff2`);
      try {
        execFileSync(
          "python3",
          ["-m", "fontTools.subset", src, `--text-file=${txt}`, "--flavor=woff2", `--output-file=${dst}`, "--layout-features=*", "--no-hinting"],
          { stdio: "pipe" }
        );
      } catch (err) {
        return { css: "", note: "fontTools が無い（pip install fonttools brotli）。端末の字に落ちる" };
      }
      const buf = readFileSync(dst);
      out.push(
        `@font-face { font-family: "Maru Review"; font-style: normal; font-weight: ${w}; font-display: block; src: url(${dataUri(buf, "font/woff2")}) format("woff2"); }`
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { css: out.join("\n      "), note: `${Array.from(chars).length}字` };
}

/* ---------------------------------------------------------------- 書き出し */
function put(html, key, value) {
  const mark = `/*@@${key}@@*/`;
  const at = html.indexOf(mark);
  if (at < 0 || html.indexOf(mark, at + 1) >= 0) die(`雛形に ${mark} がちょうど1つ無い`);
  const tail = html.slice(at + mark.length);
  // `/*@@X@@*/ null;` のような既定値は、差し込んだ値で置き換える
  const rest = key === "FONT_FACE" ? tail : tail.replace(/^\s*(null|\{\})/, "");
  return html.slice(0, at) + value + rest;
}
const js = (v) => JSON.stringify(v).replaceAll("</", "<\\/");

const { data, used } = loadData();
validate(data);

const handles = handlesOf(data);
const ids = [...new Set(data.tips.rows.map((r) => r.icon).filter(Boolean))];
const [av, ch] = await Promise.all([avatars(handles), chars(ids)]);
const img = images(imagePaths(data));
const ART = art();

let html = readFileSync(TEMPLATE, "utf8");
html = put(html, "REVIEW_DATA", js(data));
html = put(html, "AVATARS", js(av.got));
html = put(html, "CHARS", js(ch.got));
html = put(html, "IMAGES", js(img.got));
html = put(html, "ART", js(ART));
// 字は、雛形の字（データ URI を除く）と中身の字から数える
const textForFont = html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/g, "") + "0123456789,.:/〜・…（）「」";
const font = await fontFace(textForFont);
html = put(html, "FONT_FACE", font.css);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const kb = (n) => `${Math.round(n / 1024)}KB`;
console.log(
  [
    `書き出した: ${relative(ROOT, OUT)}（${kb(Buffer.byteLength(html))}）`,
    `中身: content=${used.content} kinkin=${used.kinkin} tips=${used.tips}`,
    `顔: ${Object.keys(av.got).length}/${handles.length}人${av.miss.length ? `（取れずイニシャル: ${av.miss.join(", ")}）` : ""}`,
    `投げ銭の絵: ${Object.keys(ch.got).length}/${ids.length}${ch.small.length ? `（128px で代用 ${ch.small.length}）` : ""}${ch.miss.length ? `（無し: ${ch.miss.length}）` : ""}`,
    `写真: ${Object.keys(img.got).length}枚${img.miss.length ? `（ファイルが無く出さない: ${img.miss.join(", ")}）` : ""}`,
    `付箋大賞: ${data.fusen ? `部門賞 ${(data.fusen.categories || []).length}・大賞 ${data.fusen.grandPrix ? 1 : 0}` : "中身に無い（コーナーを作らない）"}`,
    `字: ${font.css ? "丸ゴシックを焼き込み " : "焼き込みなし "}${font.note}`,
  ].join("\n")
);
