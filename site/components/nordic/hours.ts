/**
 * OpenStreetMap の `opening_hours` を読む。
 *
 * ## なぜ自分で読むのか
 *
 * **閉まっている店に歩かせないため。** あやとは旅の最中で、店まで歩いて
 * 閉まっていたら、その日はもう戻ってこられない。だから
 *
 *   - 書いてある時間は**日本語にして**出す（`Mo-Fr` のままでは読めない）
 *   - 書いていない店は「**時間はわからない**」と出す。埋めない
 *   - いま開いているかは、**画面が出てから**数える（下の `openNow`）
 *
 * 静的書き出しなので、ビルド時に「開いている」を焼くと翌日には嘘になる
 * （`CLAUDE.md`）。だから焼くのは字だけで、開閉は毎回その場で数える。
 *
 * ## 読めない書き方は、読めないと言う
 *
 * `opening_hours` は月指定・第2日曜・日の出まで、何でも書ける文法を持っている。
 * **全部は読まない。** 読めた書き方だけ `Week` を返し、読めなければ `null` を
 * 返して、呼ぶ側は開閉の札を出さない。**読めていないものを「閉まっている」と
 * 言わない**（`docs/island-misses.md` #79・`docs/island-standards.md` 10）。
 */

/** 1日ぶんの開いている帯。分で持つ。日をまたぐ店は終わりが 1440 を超える。 */
export type Span = [number, number];
/** 日曜(0)から土曜(6)まで。空の日は「休み」。 */
export type Week = Span[][];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const JA = ["日", "月", "火", "水", "木", "金", "土"];

const DAY_RE = "(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)";
const HEAD = new RegExp(`^(${DAY_RE}(?:\\s*-\\s*${DAY_RE})?(?:\\s*,\\s*${DAY_RE}(?:\\s*-\\s*${DAY_RE})?)*)\\s+(.*)$`);
const TIMES = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*$/;

const min = (t: string) => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** 「Mo-Fr,Su」→ [1,2,3,4,5,0]。`PH`（祝日）は落とす。いつが祝日かは知らない。 */
function daysOf(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.trim().split("-").map((x) => x.trim());
    if (a === "PH" || b === "PH") continue;
    const i = DAYS.indexOf(a);
    if (i < 0) continue;
    if (!b) {
      out.push(i);
      continue;
    }
    const j = DAYS.indexOf(b);
    if (j < 0) continue;
    for (let k = i; ; k = (k + 1) % 7) {
      out.push(k);
      if (k === j) break;
    }
  }
  return out;
}

/**
 * 書き方のゆれを直す。**文法を増やすのではなく、打ち間違いを吸収するだけ。**
 *
 * 本番の 312件を通して、読めなかった 26件を1つずつ見て決めた:
 *
 * | 元 | どう直すか |
 * | --- | --- |
 * | `Mo-Fr 10:00-19:00, Sa 10:00-16:00` | 時刻のうしろの読点は、区切りの `;` |
 * | `Tu-Sa 10:00-20:00 Su 10:00-16:00` | 区切りを打ち忘れている |
 * | `Mo-Fr 06.30-18:00` | 時刻の区切りが点 |
 *
 * **`Mo-Th,Sa 10:00-21:00` の読点は触らない。** あちらは曜日の並びで、
 * 読点の前が時刻かどうかで見分けられる。
 * 月の指定（`Sep-Apr:`）や第◯日曜（`Su[-1]`）は**直さない。**
 * 読めないものは読めないままにして、開閉の札を出さないほうが安全。
 */
function tidy(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/(\d{1,2})\.(\d{2})(?=\s*-)/g, "$1:$2")
    .replace(/(\d{1,2}:\d{2})\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g, "$1; ")
    .replace(/(\d{1,2}:\d{2})\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g, "$1; ");
}

/**
 * 書いてある字を1週間の表にする。**読めなければ `null`。**
 */
export function parseHours(raw: string): Week | null {
  const s = tidy(raw);
  if (!s) return null;
  const week: Week = [[], [], [], [], [], [], []];
  let touched = false;
  for (const rule of s.split(";")) {
    const r = rule.trim();
    if (!r) continue;
    if (r === "24/7") {
      for (let i = 0; i < 7; i += 1) week[i] = [[0, 1440]];
      touched = true;
      continue;
    }
    const m = HEAD.exec(r);
    const spec = m ? m[1] : "";
    const rest = (m ? m[2] : r).trim();
    // 曜日だけ書いて時間の無い行（`PH off` など）と、読めない書き方を分ける
    const days = spec ? daysOf(spec) : [0, 1, 2, 3, 4, 5, 6];
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) week[d] = [];
      // 祝日だけの `PH off` は曜日を1つも指さない。**触っていない扱いにする**
      if (days.length > 0) touched = true;
      continue;
    }
    if (!TIMES.test(rest)) return null;
    const spans: Span[] = rest.split(",").map((t) => {
      const [a, b] = t.split("-").map((x) => min(x.trim()));
      return [a, b <= a ? b + 1440 : b] as Span;
    });
    for (const d of days) week[d] = spans;
    if (days.length > 0) touched = true;
  }
  return touched ? week : null;
}

/** 「9:00」を「09:00」に。表の中で桁が揃っていないと、目が縦に走れない。 */
const hhmm = (v: number) => {
  const t = v % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const spansJa = (spans: Span[]) =>
  spans.length === 0 ? "休み" : spans.map(([a, b]) => `${hhmm(a)}-${hhmm(b)}`).join("、");

/**
 * 日本語の営業時間。**読めなければ、書いてある字をそのまま返す。**
 *
 * 勝手に直さない。読めない書き方でも、店が書いた字は店の言い分なので、
 * こちらの都合で消すと「時間はわからない」になってしまう。
 */
export function hoursJa(raw: string): string {
  const w = parseHours(raw);
  if (!w) return (raw || "").trim();
  if (w.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] === 1440)) return "いつでも";
  // 月曜から並べる。日曜始まりの表は、旅の面では読みにくい
  const order = [1, 2, 3, 4, 5, 6, 0];
  const out: string[] = [];
  let i = 0;
  while (i < order.length) {
    const key = spansJa(w[order[i]]);
    let j = i;
    while (j + 1 < order.length && spansJa(w[order[j + 1]]) === key) j += 1;
    const label =
      i === j ? JA[order[i]] : `${JA[order[i]]}〜${JA[order[j]]}`;
    out.push(`${label} ${key}`);
    i = j + 1;
  }
  // 7日ぜんぶ同じなら、曜日の代わりに「毎日」
  if (out.length === 1) return `毎日 ${spansJa(w[1])}`;
  return out.join(" / ");
}

/**
 * いま開いているか。**その街の時計で数える。**
 *
 * 返すのは `"open" | "shut" | null`。`null` は「読めていない」で、
 * 閉まっているという意味ではない。
 *
 * 時差は `Intl` に持たせる。夏時間の切り替わりを自前で持つと、旅の途中の
 * 10月末に黙って1時間ずれる。
 */
export function openNow(raw: string, tz: string, at: Date = new Date()): "open" | "shut" | null {
  const w = parseHours(raw);
  if (!w) return null;
  const now = cityNow(tz, at);
  if (!now) return null;
  const { day, minutes } = now;
  const today = w[day].some(([a, b]) => minutes >= a && minutes < b);
  // 日をまたいで開いている店は、前の日の帯がまだ続いている
  const last = w[(day + 6) % 7].some(([a, b]) => minutes + 1440 >= a && minutes + 1440 < b);
  return today || last ? "open" : "shut";
}

/** その街の、いまの曜日と時刻。 */
export function cityNow(tz: string, at: Date = new Date()) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const part: Record<string, string> = {};
    for (const p of f.formatToParts(at)) part[p.type] = p.value;
    const day = DAYS.indexOf(part.weekday?.slice(0, 2) ?? "");
    if (day < 0) return null;
    // 深夜0時を `24` と書く実装があるので、そこだけ丸める
    const h = Number(part.hour) % 24;
    return { day, minutes: h * 60 + Number(part.minute) };
  } catch {
    return null;
  }
}

/** その街の「今日」。日ごとの面で、その日が今日かどうかを見るのに使う。 */
export function cityToday(tz: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return "";
  }
}
