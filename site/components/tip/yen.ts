/**
 * 投げ銭の額と字数。**正はサーバー**（`GET /state` の `limits`。決定の記録 0017・`docs/island-api.md` 13章）。
 *
 * ここが持つのは「打った字を円に読む」と「幅に入っているか」だけで、**幅の数字は1つも持たない。**
 * 幅は口から受ける（`useTipLimits`）。画面が同じ数字を持つと、ずれても赤くならない2か所に戻る
 * （`docs/island-db.md` 3.3b）。画面の検査は押せるかどうかを決める親切で、外れた額はサーバーが 400 で断る。
 */

/** 投げ銭の幅。`GET /state` の `limits` のうち、投げ銭の3つ */
export type TipLimits = {
  /** 1回のいちばん小さい額（円）。入力欄の初期値もこれ */
  tipYenMin: number;
  /** 1回のいちばん大きい額（円） */
  tipYenMax: number;
  /** メッセージの字数 */
  tipMessageMax: number;
};

/**
 * 押すと額が入るボタン（あやと 2026-11-23。決定の記録 0017 の4）。
 * 幅の外に出たものは出さない（`presetsIn`）。
 */
export const PRESETS = [200, 500, 1000, 2000, 5000, 10000] as const;

/** 幅に入っているボタンだけ */
export const presetsIn = (lim: TipLimits): number[] =>
  PRESETS.filter((v) => v >= lim.tipYenMin && v <= lim.tipYenMax);

/**
 * 打った字を円に読む。**1字ずれても当たる**ようにする（`docs/island-standards.md` 33.7）。
 *
 * 全角の数字（`１０００`）・桁の区切り（`1,000`）・`¥`・`円`・空白は許す。
 * 小数（`1.5`）や数字でない字が混ざったら `null`（**丸めて通さない**。打った額と払う額を変えない）。
 */
export function readYen(raw: string): number | null {
  const s = raw.normalize("NFKC").replace(/[,\s¥\\円]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** 額のどこが外れているか。`null` は押せる */
export type YenProblem = "empty" | "shape" | "low" | "high";

export function yenProblem(raw: string, lim: TipLimits): YenProblem | null {
  if (!raw.trim()) return "empty";
  const n = readYen(raw);
  if (n === null) return "shape";
  if (n < lim.tipYenMin) return "low";
  if (n > lim.tipYenMax) return "high";
  return null;
}

/** `1000` → `¥1,000` */
export const yenText = (n: number): string => `¥${n.toLocaleString("ja-JP")}`;

/**
 * 口が返した幅を確かめる。**数で無い・整数で無い・幅が逆さのときは受け取らない**
 * （外から来た値で画面の検査を組まない。`docs/island-standards.md` 29.3）。
 * 3つそろわなければ `null`——投げ銭の口がまだ出ていない本番は、ここで `null` になる。
 */
export function tipLimitsOf(limits: Record<string, unknown> | undefined): TipLimits | null {
  const l = limits ?? {};
  const int = (k: keyof TipLimits) => {
    const v = l[k];
    return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
  };
  const tipYenMin = int("tipYenMin");
  const tipYenMax = int("tipYenMax");
  const tipMessageMax = int("tipMessageMax");
  if (tipYenMin === null || tipYenMax === null || tipMessageMax === null) return null;
  if (tipYenMax < tipYenMin) return null;
  return { tipYenMin, tipYenMax, tipMessageMax };
}
