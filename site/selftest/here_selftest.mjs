/**
 * 砂浜の「いま居る場所」の印が、**島に建っている軒の面ぜんぶ**に付いているか。
 *
 *   node site/selftest/here_selftest.mjs
 *
 * 0＝通った / 1＝食い違った。
 *
 * ## なぜ要るか
 *
 * 印を出す仕掛けは前からある（`components/ui/PlaceList.tsx` の `is-here`）。
 * **渡す側が抜けていた。** 2026-10-09 に数えたら、島の13軒のうち **7軒**が
 * 自分の面で `current` を渡しておらず、砂浜で「いま自分がどこに居るか」が
 * 読めなかった（`/legends` `/now` `/kitchen` `/friends` `/goods` と、
 * 料理と伝説の中の面）。
 *
 * **軒を1つ建てるたびに、同じ抜けが起きる。** 島に建てるほうは `layout.ts` の
 * 1か所で済むのに、印は面の側が渡すものなので、建てた人が気づかない。
 * だから**軒の一覧のほうから数える**——`DOORS` に在る href の面が、
 * その軒の id を渡しているか。
 *
 * ## 対照
 *
 * 本物を数える前に、**抜けと取り違えを見分けられるか**を見る。
 * 見分けられなければ、本物の数字を1つも出さずに帰る。
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT = join(SITE, "components/island/layout.ts");

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

/** `layout.ts` から軒を読む。**id と href が対になっているところだけ拾う。** */
function doors(src) {
  const out = [];
  const re = /id:\s*"([a-z-]+)"[\s\S]*?href:\s*"(\/[^"]*)"/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], href: m[2] });
  return out;
}

/**
 * その面が渡している `current`。渡していなければ null。
 *
 * **札の中だけを見る。** 「`<PageShell` から何文字ぶん」で切ると、
 * 面の下のほうで別の部品が渡している `current` を拾って、通ってしまう
 * （対照5がそれ）。`{}` の深さを数えて、深さ0の `>` で止める。
 */
function currentOf(src) {
  const i = src.indexOf("<PageShell");
  if (i < 0) return null;
  let depth = 0;
  let end = -1;
  for (let j = i; j < src.length; j += 1) {
    const c = src[j];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) {
      end = j;
      break;
    }
  }
  if (end < 0) return null;
  const m = src.slice(i, end).match(/current=\{?"([a-z-]+)"\}?/);
  return m ? m[1] : null;
}

// ---- 対照。**本物を1つも数える前に** ------------------------------------
{
  const probe = doors(`
    { id: "aaa", label: "あ", href: "/aaa" },
    { id: "bbb", label: "い", href: "/bbb" },
  `);
  check("対照1 軒を読める", probe.length === 2 && probe[0].id === "aaa" && probe[1].href === "/bbb",
    JSON.stringify(probe));
  check("対照2 渡しているものを読める", currentOf(`<PageShell current="zzz" crumbs={[]}>`) === "zzz");
  check("対照3 渡していないものを見分ける", currentOf(`<PageShell crumbs={[]}>`) === null);
  check("対照4 取り違えを見分ける", currentOf(`<PageShell current="yyy">`) !== "zzz");
  /* **ここが抜けると、この見張りは何も見ていない。** 面の中のどこか遠くに
     `current=` が在るだけで通る書き方にしてしまうと、別の部品のものを拾う */
  check("対照5 遠くの current を拾わない",
    currentOf(`<PageShell crumbs={[]}>\n${"\n".repeat(60)}<Foo current="zzz" />`) === null);
  if (BAD) {
    console.log(`\n対照が ${BAD} 件外れた。本物は数えない`);
    process.exit(1);
  }
}

// ---- 本物 ----------------------------------------------------------------
const list = doors(readFileSync(LAYOUT, "utf8"));
check("軒が2つ以上読めた", list.length >= 2, `${list.length}軒`);

for (const d of list) {
  /* 面の置き場は `site/app<href>/page.tsx`。無い軒は島の外（旅など）なので飛ばす */
  const f = join(SITE, "app", d.href, "page.tsx");
  if (!existsSync(f)) continue;
  const got = currentOf(readFileSync(f, "utf8"));
  check(`${d.href} が「いま居る場所」を渡している`, got === d.id,
    got === null ? "渡していない" : `${got} を渡している（${d.id} のはず）`);
}

console.log(`\n軒 ${list.length} / 通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
