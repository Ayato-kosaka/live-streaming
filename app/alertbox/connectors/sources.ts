/**
 * 投げ銭の出どころ（OBS の URL の `?source=`）。どねる・YouTube（スパチャ）・島（島で受けた投げ銭。決定の記録 0017）。
 *
 * **既定は3つとも。** OBS・PRISM に貼ってある URL は `source` を付けていないので、貼り替えずに島の投げ銭も受ける。
 * `source=doneru,youtube` のように書いた URL は、書いたものだけ（島の投げ銭は受けない）。
 * 知らない名前は捨て、1つも残らなければ既定に戻す（前と同じ）
 */
export const ALERT_SOURCES = ["doneru", "youtube", "island"] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

export function parseSourceParam(sourceParam?: string | string[]): AlertSource[] {
  const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;
  const sources = String(source ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AlertSource => (ALERT_SOURCES as readonly string[]).includes(s));
  return sources.length > 0 ? [...new Set(sources)] : [...ALERT_SOURCES];
}
