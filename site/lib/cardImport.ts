/**
 * 写真の取り込み（`docs/card-import.md`）の口を、画面から呼ぶところ。
 *
 * 口は全部あやとだけ（`/island-api/cardimport/*`）。ID トークンを
 * `Authorization: Bearer` で送る。**画像も同じ**——候補の置き場には
 * ダウンロードの合言葉を付けていないので、`<img src>` に URL を直に書いても
 * 出ない。ヘッダー付きで取ってきて blob の URL にして渡す（下の `loadImage`）。
 *
 * 返り値の形は docs 2章の `islandCardImport` の欄 + `sha`。
 * **口は別の担当が同時に作っている**ので、欄の名前が少しずれても
 * 落ちないように、ここで1回だけ読み替える（`asItem` / `asRun` / `asStep`）。
 * 画面の部品はこのファイルの型だけを見る。
 */
import { API_BASE } from "./api";

export type ImportStatus =
  | "candidate"
  | "calib"
  | "excluded"
  | "registering"
  | "registered"
  | "failed"
  | "withdrawn";

/** 候補1枚。`islandCardImport/{sha}` の欄 + `sha` */
export type ImportItem = {
  sha: string;
  batch?: string;
  /** 写真の日（撮った土地の日付）。カードの日はここから決まる */
  day: string;
  takenAt?: string;
  w?: number;
  h?: number;
  tw?: number;
  th?: number;
  category?: string;
  score?: number;
  /** 似た写真の束。無ければ1枚で1束 */
  group?: string;
  reasons?: string[];
  status: ImportStatus;
  calibAnswer?: "yes" | "no";
  imageId?: string;
  error?: string;
  updatedAt?: number;
};

/** 取り込み1回（`islandCardImportRuns/{batch}`） */
export type ImportRun = {
  batch: string;
  range?: { from?: string; to?: string };
  createdAt?: number;
  registeredAt?: number;
  registered?: number;
};

export type ImportList = {
  runs: ImportRun[];
  /** いま見ている回。候補が1枚も無ければ null */
  batch: string | null;
  items: ImportItem[];
};

/** `register` の1回ぶん */
export type RegisterStep = {
  /** この呼び出しで登録できた枚数（数えられなければ undefined） */
  registered?: number;
  /** この呼び出しで失敗した写真 */
  failed: { sha: string; error?: string }[];
  /** まだ残っている枚数 */
  remaining?: number;
  /** 1枚ずつの結果（返ってきたときだけ） */
  results: { sha: string; status: ImportStatus; error?: string }[];
};

/** `register` の `dryRun`。どの日に何枚・カードが渡る人の数 */
export type RegisterPlan = {
  total?: number;
  days: { day: string; count: number }[];
  /** カードが渡る人の数。数えられなければ undefined（**0 と言わない**） */
  people?: number;
};

const STATUSES: ImportStatus[] = [
  "candidate", "calib", "excluded", "registering", "registered", "failed", "withdrawn",
];

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const ms = (v: unknown): number | undefined => {
  if (typeof v === "number") return v;
  /* Firestore の時刻がそのまま来たとき（`{_seconds}`） */
  if (v && typeof v === "object" && "_seconds" in v) return Number((v as { _seconds: number })._seconds) * 1000;
  return undefined;
};

function asItem(raw: unknown): ImportItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sha = str(r.sha) ?? str(r.id);
  const day = str(r.day);
  if (!sha || !day) return null;
  const st = str(r.status) as ImportStatus | undefined;
  const ans = str(r.calibAnswer);
  return {
    sha,
    batch: str(r.batch),
    day,
    takenAt: str(r.takenAt),
    w: num(r.w),
    h: num(r.h),
    tw: num(r.tw),
    th: num(r.th),
    category: str(r.category),
    score: num(r.score),
    group: str(r.group),
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === "string") : undefined,
    status: st && STATUSES.includes(st) ? st : "candidate",
    calibAnswer: ans === "yes" || ans === "no" ? ans : undefined,
    imageId: str(r.imageId),
    error: str(r.error),
    updatedAt: ms(r.updatedAt),
  };
}

function asRun(raw: unknown): ImportRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const batch = str(r.batch) ?? str(r.id);
  if (!batch) return null;
  const range = r.range && typeof r.range === "object" ? (r.range as ImportRun["range"]) : undefined;
  return {
    batch,
    range,
    createdAt: ms(r.createdAt),
    registeredAt: ms(r.registeredAt),
    registered: num(r.registered),
  };
}

/** 口が返した字を投げる。**状態の番号は先頭に残す**（断られたのか届かなかったのかを分けるため） */
async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

/** 取り込みの一覧と、いちばん新しい（`batch` を渡せばその）回の候補 */
export async function getImport(token: string, batch?: string): Promise<ImportList> {
  const q = batch ? `?batch=${encodeURIComponent(batch)}` : "";
  const raw = await call<Record<string, unknown>>(`/cardimport${q}`, token);
  const runs = (Array.isArray(raw.runs) ? raw.runs : Array.isArray(raw.batches) ? raw.batches : [])
    .map(asRun)
    .filter((x): x is ImportRun => !!x);
  const list = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.candidates) ? raw.candidates : [];
  const items = list.map(asItem).filter((x): x is ImportItem => !!x);
  const b =
    str(raw.batch) ??
    (raw.run && typeof raw.run === "object" ? str((raw.run as Record<string, unknown>).batch) : undefined) ??
    items.find((i) => i.batch)?.batch ??
    runs[0]?.batch ??
    null;
  return { runs, batch: b, items };
}

/** 外す（`exclude: true`）／戻す（`false`） */
export function decideImport(token: string, shas: string[], exclude: boolean): Promise<unknown> {
  return call("/cardimport/decide", token, { method: "POST", body: JSON.stringify({ shas, exclude }) });
}

/** 認識合わせの答え */
export function answerCalib(
  token: string,
  answers: { sha: string; answer: "yes" | "no" }[],
): Promise<unknown> {
  return call("/cardimport/calib", token, { method: "POST", body: JSON.stringify({ answers }) });
}

/** 登録の下見。どの日に何枚・カードが渡る人の数 */
export async function planRegister(token: string, batch: string): Promise<RegisterPlan> {
  const raw = await call<Record<string, unknown>>("/cardimport/register", token, {
    method: "POST",
    body: JSON.stringify({ batch, dryRun: true }),
  });
  /* 日ごとの数は `[{day, count}]` でも `{day: count}` でも読む */
  const src = raw.days ?? raw.byDay ?? raw.perDay;
  let days: RegisterPlan["days"] = [];
  if (Array.isArray(src)) {
    days = src
      .map((d) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const day = str(o.day);
        const count = num(o.count) ?? num(o.n) ?? num(o.photos);
        return day && count !== undefined ? { day, count } : null;
      })
      .filter((x): x is { day: string; count: number } => !!x);
  } else if (src && typeof src === "object") {
    days = Object.entries(src as Record<string, unknown>)
      .map(([day, c]) => ({ day, count: num(c) ?? NaN }))
      .filter((d) => Number.isFinite(d.count));
  }
  days.sort((a, b) => (a.day < b.day ? -1 : 1));
  const people =
    num(raw.people) ?? num(raw.recipients) ?? num(raw.cardPeople) ??
    (Array.isArray(raw.people) ? raw.people.length : undefined);
  return {
    total: num(raw.total) ?? num(raw.count) ?? num(raw.remaining),
    days,
    people,
  };
}

/** `max` 枚まで登録して、残りの数を返す。画面が0になるまで呼ぶ */
export async function stepRegister(
  token: string,
  batch: string,
  max: number,
  retryFailed = false,
): Promise<RegisterStep> {
  const raw = await call<Record<string, unknown>>("/cardimport/register", token, {
    method: "POST",
    /* 失敗したものは、頼んだときだけ拾い直させる（毎回拾うと残りが0にならない） */
    body: JSON.stringify({ batch, max, dryRun: false, retryFailed }),
  });
  const results = (Array.isArray(raw.results) ? raw.results : Array.isArray(raw.items) ? raw.items : [])
    .map((x): RegisterStep["results"][number] | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      const sha = str(o.sha);
      if (!sha) return null;
      const st = str(o.status) as ImportStatus | undefined;
      return {
        sha,
        status: st && STATUSES.includes(st) ? st : "registered",
        error: str(o.error),
      };
    })
    .filter((x): x is RegisterStep["results"][number] => !!x);
  const failed = Array.isArray(raw.failed)
    ? raw.failed
        .map((x) => {
          if (typeof x === "string") return { sha: x };
          const o = (x ?? {}) as Record<string, unknown>;
          const sha = str(o.sha);
          return sha ? { sha, error: str(o.error) } : null;
        })
        .filter((x): x is { sha: string; error?: string } => !!x)
    : results.filter((r) => r.status === "failed").map((r) => ({ sha: r.sha, error: r.error }));
  const registered =
    num(raw.registered) ??
    (Array.isArray(raw.registered) ? raw.registered.length : undefined) ??
    (results.length ? results.filter((r) => r.status === "registered").length : undefined);
  return { registered, failed, remaining: num(raw.remaining) ?? num(raw.left), results };
}

/* ---------------- 画像 ----------------
 *
 * 数百枚ある。**見えたものから順に、同時に6本まで**取る。
 * 取りに行く前に「まだ要るか」を聞いて、画面の外へ流れていったものは飛ばす。
 * 速く送ったときに、通り過ぎた数十枚を律儀に全部取ってから
 * いま見ている所に来る、を避けるため。
 *
 * 一覧の絵（`s=t`）は持ち続ける（400px の webp で1枚 20KB ほど。数百枚でも
 * 十数MB）。本体（1600px）は大きいので、最後に見た8枚だけ持つ。
 */
const LIMIT = 6;
let running = 0;
const line: { want: () => boolean; go: () => void; skip: () => void }[] = [];

function pump() {
  while (running < LIMIT && line.length) {
    const job = line.shift()!;
    if (!job.want()) {
      job.skip();
      continue;
    }
    running += 1;
    job.go();
  }
}

class Skipped extends Error {}
/** 要らなくなって取りに行かなかった。失敗ではない */
export const isSkipped = (e: unknown) => e instanceof Skipped;

const thumbs = new Map<string, Promise<string>>();
const bodies = new Map<string, Promise<string>>();
const BODY_KEEP = 8;

/**
 * 1枚を blob の URL で返す。
 * @param want 取りに行く直前に呼ぶ。false なら取らずに `Skipped` で落ちる
 */
export function loadImage(
  sha: string,
  thumb: boolean,
  token: () => Promise<string | null>,
  want: () => boolean = () => true,
): Promise<string> {
  const cache = thumb ? thumbs : bodies;
  const have = cache.get(sha);
  if (have) {
    if (!thumb) {
      /* 本体は「最後に見た順」に並べ直す */
      cache.delete(sha);
      cache.set(sha, have);
    }
    return have;
  }
  const p = new Promise<string>((ok, no) => {
    line.push({
      want,
      skip: () => no(new Skipped()),
      go: async () => {
        try {
          const t = await token();
          if (!t) throw new Error("no-token");
          const res = await fetch(
            `${API_BASE}/cardimport/img/${encodeURIComponent(sha)}${thumb ? "?s=t" : ""}`,
            { headers: { authorization: `Bearer ${t}` } },
          );
          if (!res.ok) throw new Error(String(res.status));
          ok(URL.createObjectURL(await res.blob()));
        } catch (e) {
          no(e);
        } finally {
          running -= 1;
          pump();
        }
      },
    });
    pump();
  });
  cache.set(sha, p);
  /* 落ちたら覚えない。次に見えたときにもう一度取りに行く */
  p.catch(() => {
    if (cache.get(sha) === p) cache.delete(sha);
  });
  if (!thumb) {
    while (bodies.size > BODY_KEEP) {
      const [old, op] = bodies.entries().next().value as [string, Promise<string>];
      bodies.delete(old);
      op.then((u) => URL.revokeObjectURL(u), () => {});
    }
  }
  return p;
}

/** 一覧の絵がもう手元にあるか（拡大の下敷きに使う） */
export function thumbIfHave(sha: string): Promise<string> | undefined {
  return thumbs.get(sha);
}
