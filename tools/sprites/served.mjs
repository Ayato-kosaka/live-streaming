/**
 * 「開いたつもりで、404を測っていた」を1か所で止める。
 *
 * 書き出したものを静的に配ると（`CLAUDE.md`「検証のしかた」）、面は
 * `/about.html` という名前で置かれる。道具が `/about` を開くと
 * `python3 -m http.server` は **404** を返し、`/map` のように下に
 * ディレクトリがあるものは **301 して一覧の HTML** を返す。
 *
 * どちらもブラウザから見れば「ページが開けた」ので、`goto` は成功する。
 * そのまま数えると:
 *
 * - `popcheck.mjs` は26面ぜんぶで厚みを0件しか見つけず、
 *   **「押せないのに厚み: 0」と合格を出していた**（`.html` を付けると 54/42/15/47/18 件）
 * - `inkpx.mjs` は `/map` で **Python のディレクトリ一覧の字の濃さ**を測っていた。
 *   黒字に白地なので 4.5 を楽に越える。`/map.html` だと 37か所 → 108か所
 *
 * **0 は「無い」ではなく「見ていない」だった**（`#416` と同じ形。
 * `docs/island-standards.md` 10）。だから、開くところで止める。
 *
 *   import { openChecked, reportMissing } from "./served.mjs";
 *   const miss = [];
 *   const r = await openChecked(p, `http://localhost:${PORT}`, path, { miss });
 *   if (!r.ok) continue;            // 開けなかった面は数えない
 *   ...
 *   reportMissing(miss);            // 1件でもあれば終了コード2で落ちる
 *
 * 開発サーバー（`next dev`）に向けても回せるように、**両方の綴りを試す。**
 * 静的配信なら `.html` が当たり、開発サーバーなら素のパスが当たる。
 */

/**
 * そのパスを、配られている綴りの候補に広げる。
 *
 * @param {string} path `/about` や `/about.html` や `/`
 * @returns {string[]} 試す順の候補
 */
export function servedForms(path) {
  const [bare, hash = ""] = String(path).split("#");
  const h = hash ? "#" + hash : "";
  if (bare === "" || bare === "/") return ["/" + h];
  if (bare.endsWith(".html")) return [bare + h, bare.replace(/\.html$/, "") + h];
  // 静的配信（`.html`）を先に試す。開発サーバーでは素のほうが当たる
  return [bare.replace(/\/$/, "") + ".html" + h, bare + h];
}

/**
 * 開いたものが「本物の面」かを見る。
 *
 * 404 と、`python3 -m http.server` が下のファイルを並べただけの一覧を弾く。
 * 一覧は `<title>Directory listing for /map/</title>` を持ち、島の面には
 * 必ずある `#__next` も `h1` の中身も持っていない。
 *
 * @param {import("playwright-core").Page} p
 * @param {number} status HTTP の番号
 * @returns {Promise<{ok: boolean, why: string}>}
 */
async function looksLikePage(p, status) {
  if (status !== 200) return { ok: false, why: `HTTP ${status}` };
  const seen = await p.evaluate(() => ({
    title: document.title || "",
    h1: document.querySelector("h1")?.textContent?.trim() || "",
    app: !!document.querySelector("main, #__next, [class*='shell'], header"),
  }));
  if (/^Directory listing for /.test(seen.title)) {
    return { ok: false, why: "ディレクトリ一覧（面ではない）" };
  }
  if (!seen.app && !seen.h1) return { ok: false, why: "面の中身が無い" };
  return { ok: true, why: "" };
}

/**
 * 面を1枚開く。**開けなければ数えずに、何が開けなかったかを残す。**
 *
 * @param {import("playwright-core").Page} p
 * @param {string} base `http://localhost:4171`
 * @param {string} path `/about`
 * @param {{miss?: string[], waitUntil?: string, timeout?: number, tries?: number}} [opt]
 *   `miss` を渡すと、開けなかった面をそこに積む（最後に `reportMissing`）
 * @returns {Promise<{ok: boolean, url: string, status: number, why: string, definitive: boolean}>}
 *   `definitive` は「サーバは答えたが、面ではなかった」（404・一覧）。
 *   待って撮り直しても変わらないので、**呼ぶ側は再試行しない。**
 *   これが無いと、配る先を間違えた1回が「6回×8秒待ち×21面」になる
 */
export async function openChecked(p, base, path, opt = {}) {
  const { miss, waitUntil = "domcontentloaded", timeout = 45000, tries = 2 } = opt;
  const tried = [];
  let answered = false;
  for (const form of servedForms(path)) {
    const url = base + form;
    let status = 0;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await p.goto(url, { waitUntil, timeout });
        status = res ? res.status() : 0;
        break;
      } catch (e) {
        status = 0;
        if (i + 1 < tries) await p.waitForTimeout(1500);
        else tried.push(`${form} → ${String(e).slice(0, 60)}`);
      }
    }
    if (!status) continue;
    answered = true;
    const v = await looksLikePage(p, status);
    if (v.ok) return { ok: true, url, status, why: "", definitive: false };
    tried.push(`${form} → ${v.why}`);
  }
  const why = tried.join(" / ") || "開けなかった";
  if (miss) miss.push(`${path}（${why}）`);
  return { ok: false, url: base + path, status: 0, why, definitive: answered };
}

/**
 * 開けなかった面が1つでもあれば、**0という数字を報告して終わらない。**
 *
 * 終了コードは `cardshot.mjs` に合わせる
 * （0=通った / 1=途中で落ちた / 2=数えるものが無い）。
 *
 * @param {string[]} miss 開けなかった面
 * @param {string} [what] 何を数えていたか
 */
export function reportMissing(miss, what = "面") {
  if (!miss.length) return;
  console.error(`\n見ていない${what}が ${miss.length} 件あります。出した数は当てになりません:`);
  for (const m of miss) console.error("  - " + m);
  console.error("静的に配っているなら `.html` 付きのパスを渡してください（`CLAUDE.md`）。");
  process.exitCode = 2;
}
