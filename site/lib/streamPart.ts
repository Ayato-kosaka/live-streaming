import { CITY_STREAMS } from "@/content/cityStreams";

/**
 * **同じ日に同じ題の配信が2本以上あるときの「この日の何本目か」。** 街の配信の一覧（`content/cityStreams.ts`）から引く。
 *
 * 配信が途中で切れて立て直すと、同じ題のまま2本に分かれる（ティラナ 2026-10-01 の H5Ox41m1LE0 と C1dzddgQr30）。
 * 題は YouTube に実在するものなので書き換えない（`docs/island-design.md` 1章）。題の外の小さな字にこれを添えないと、
 * 読む人には同じ札が2枚に見え、読み上げでは同じ名前のリンクが別の動画へ行く（reachkeys の「おなじ字」）。
 *
 * - 順番は一覧の並び。`python/build_city_streams.py` が始まった時刻で並べているので、先に始まった回が1本目
 * - **ぶつかっていない配信には何も返さない**（どれにも「1本目」が付くと、うるさいだけで見分けの役に立たない。`components/ui/Bits.tsx` の `nth` と同じ決め）
 * - 面に片方しか出ていなくても付ける（「2本目」だけが見えれば、前の回があると分かる）
 */
const PART: Map<string, number> = (() => {
  const out = new Map<string, number>();
  for (const cities of Object.values(CITY_STREAMS))
    for (const rows of Object.values(cities)) {
      const by = new Map<string, string[]>();
      for (const r of rows) {
        const k = `${r.date}\u0000${r.title}`;
        const ids = by.get(k) ?? [];
        if (!ids.includes(r.videoId)) ids.push(r.videoId);
        by.set(k, ids);
      }
      for (const ids of by.values()) {
        if (ids.length < 2) continue;
        ids.forEach((v, i) => {
          if (!out.has(v)) out.set(v, i + 1);
        });
      }
    }
  return out;
})();

/** 題の外に添える字（「この日の2本目」）。ぶつかっていない配信は undefined */
export function streamPart(videoId: string): string | undefined {
  const n = PART.get(videoId);
  return n ? `この日の${n}本目` : undefined;
}
