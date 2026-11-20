/**
 * **書体そのものに字形が無い字**を、`fontfall.mjs` の「落ちている字」から外す判定。
 *
 * ## なぜ（2026-11-20）
 *
 * `tools/fonts/subset.py` は、面が描く字のうち Zen Maru Gothic が字形を持たないものを太さごとに
 * `tools/fonts/absent.json` に書く（`glyphs()`。範囲に入れても取りに行って端末の書体に落ちるだけなので、
 * 範囲には入れない）。`fontstale_selftest.mjs` はこれを読んで「焼かれていない字」に数えないが、
 * **`fontfall.mjs` は読んでいなかった。** 新しい国の現地のつづりが出るたびに、字形が無いことを人が確かめて
 * `ALLOW` に1字ずつ書き足していた（北マケドニア語・バルト3国）。ブカレストの面のルーマニア語7字
 * （ș ț ă Ș Ț ş ţ）がそれで赤くなった——焼き直しでは直らない字で、2026-11-20 に fontTools で3つの太さとも
 * 無いことを確かめた。
 *
 * ## 外すのは「字母」だけ
 *
 * 現地のつづり・人の名前の字（Unicode の L と M。字母と、それに付く記号）は、書きかたで避けられない。
 * **記号・絵文字（⚠ € ⇄ ◎ など）は外さない。** 書体に無くても、地の文を言い換えれば避けられる
 * （⚠ は「注意の印」と呼び替えて消した。`fontfall.mjs` の `ALLOW` の頭）。そちらは今までどおり、
 * 避けられないと決めたものだけ `ALLOW` に理由つきで書く。
 *
 * `absent.json` が読めないときは何も外さない（厳しい側に倒す）。
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "./repo.mjs";

export const ABSENT = fromRoot("tools/fonts/absent.json");

/** `absent.json` の字（太さをまたいで1つに）。読めなければ null。 */
export function loadAbsent(path = ABSENT) {
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return new Set(Object.values(j).join(""));
  } catch {
    return null;
  }
}

/** 字母か（現地のつづり・名前の字）。記号・絵文字・数字は false */
export const isLetter = (c) => /^[\p{L}\p{M}]$/u.test(c);

/**
 * 落ちている字を3つに分ける。
 * @returns {{ miss: string[], allowed: string[], absent: string[] }}
 *   miss … 赤くする字 / allowed … `ALLOW` で見送る字 / absent … 書体に字形が無い字母（数えない）
 */
export function sortMiss(fallen, allow, absent) {
  const out = { miss: [], allowed: [], absent: [] };
  for (const c of fallen) {
    if (allow.has(c)) out.allowed.push(c);
    else if (absent && absent.has(c) && isLetter(c)) out.absent.push(c);
    else out.miss.push(c);
  }
  return out;
}
