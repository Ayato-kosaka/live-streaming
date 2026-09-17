/**
 * 対照（わざと壊した面）を、その道具が自分で配る。
 *
 * `crawl.mjs` は `crawlcheck/` を自前の http サーバで配っている。同じことを
 * 4本（`popcheck` `hitbox` `inkpx` と、あとから足すもの）が要るので、
 * 書き写さずにここへ置く。**写しを作ると、片方だけ直る**
 * （`docs/island-misses.md` #83・#114）。
 *
 * **外のポートに頼らない**のが肝。対照を「ビルドした面を配っているサーバ」に
 * 置くと、ビルドし忘れた回に対照ごと消えて、**対照が無いことに気づかないまま
 * 本物の数字だけが出る。** ここは書き出しと関係なく必ず立つ。
 *
 *   const fx = await serveFixtures("popcheckfix");
 *   ... fx.base + "/fix.html" を開く ...
 *   fx.close();
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};

/**
 * `tools/sprites/<name>/` を、空いているポートで配る。
 *
 * @param {string} name `tools/sprites/` の下のディレクトリ名
 * @returns {Promise<{base: string, close: () => void}>}
 */
export async function serveFixtures(name) {
  return serveDirectory(join(HERE, name));
}

/**
 * 好きなディレクトリを、空いているポートで配る。
 *
 * 撮った2枚を**ブラウザに読み直させる**ときに使う（`inkpx.mjs`）。
 * 20MB の絵を base64 にして `evaluate` の引数で渡すより、URL で取らせるほうが
 * 速いし、箱の空きも食わない。
 *
 * @param {string} dir 絶対パス
 * @returns {Promise<{base: string, close: () => void}>}
 */
export async function serveDirectory(dir) {
  const srv = createServer(async (req, res) => {
    // `..` で外へ出られないようにする。対照は手元の面しか配らない
    const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
    try {
      const body = await readFile(join(dir, rel));
      res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no");
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

/**
 * 対照の結果を並べて、外したものを数える。
 *
 * **片側だけの対照は対照になっていない**（`docs/island-misses.md` #125）。
 * 「拾ってほしい」と「拾ってはいけない」を同じ表に並べて、両方を数える。
 *
 * @param {{name: string, want: boolean, got: boolean, note?: string}[]} checks
 * @returns {{miss: number, total: number}}
 */
export function reportControl(checks) {
  let miss = 0;
  for (const c of checks) {
    const ok = c.want === c.got;
    if (!ok) miss++;
    console.log(
      `  ${ok ? "○" : "×"} ${c.name.padEnd(34)} ` +
        `${c.want ? "拾ってほしい" : "拾ってはいけない"} / ${c.got ? "拾った" : "拾わなかった"}` +
        (c.note ? `  ${c.note}` : ""),
    );
  }
  return { miss, total: checks.length };
}
