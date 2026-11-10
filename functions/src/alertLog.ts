/**
 * 投げ銭アラート（OBS / PRISM の面）のログの**写し**を、BigQuery に
 * 1行ずつ入れる口（#1160）。`POST /island-api/alertbox/{合言葉}/log`。
 *
 * ## なぜ要るか
 *
 * 面のログは `lib/log.ts` の `sendLog` が Apps Script 経由でスプレッド
 * シートに書くだけで、**システムの側（セッション・Actions）からは1行も
 * 読めなかった。** 11/8 の配信で演出が出なかったとき、原因を数で追えず、
 * 「直った」を本物の配信のログで確かめることもできなかった（#1160）。
 *
 * スプレッドシートへの送りは**そのまま残す**（あやとが見ている先なので、
 * 見る先ごと決める話。`docs/island-audit.md` 1-4）。ここは写しを足すだけ。
 *
 * ## 誰でも叩ける口なので、受けるものを先に狭める
 *
 * OBS のブラウザソースはログインできないので、**32桁の合言葉を知って
 * いることが鍵**（`/alertbox/{合言葉}/superchat` と同じ）。そのうえで、
 * 安いものから順に断る。**Firestore を引くのは、形が通ったものだけ。**
 *
 * | 順 | 何を見るか | 外れたら |
 * | --- | --- | --- |
 * | 1 | 1行の大きさ（`ALERT_LOG_MAX_BYTES`） | 413 |
 * | 2 | 出来事の名前（`ALERT_LOG_EVENTS` の決め打ち）・欄の形 | 400 |
 * | 3 | この口ぜんぶで1分あたり（`ALERT_LOG_PER_MIN_ALL`。手元の数） | 429 |
 * | 4 | 1つの送り元（合言葉）で1分あたり（`ALERT_LOG_PER_MIN`） | 429 |
 * | 5 | 合言葉が誰かの OBS のものか | 404 |
 * | 6 | 1つの送り元で1日あたり（`ALERT_LOG_PER_DAY`。Firestore で数える） | 429 |
 *
 * **鍵はブラウザに渡さない。** BigQuery へは Functions のサービスアカウント
 * （実行環境の資格）で書く。ブラウザが知っているのは合言葉だけで、それは
 * 前から OBS の URL に載っているもの。
 *
 * ## 表に入れるもの・入れないもの
 *
 * - 入れる: 面が送ってきた1行そのもの（`data` は JSON のまま）。
 *   **視聴者さんの名前やメッセージも入る**（スパチャはすでに
 *   `chat_messages` に入っているのと同じ扱い。表は公開しない）
 * - 入れない: **合言葉そのもの**（`source` は sha256 の頭12桁）・IP
 *
 * **ここのログ（Cloud Logging）には中身を出さない。** 出すのは数と理由だけ。
 * 読む道具（`python/alert_log_report.py`）も、Actions に出すのは数と段と
 * 時刻だけ。
 */

import {createHash} from "crypto";
import {logger} from "firebase-functions";
import {google} from "googleapis";

/**
 * 受ける出来事。**ここに無い名前は 400。**
 *
 * 面（`lib/log.ts` の `ALERT_LOG_EVENTS`）も同じ並びを持っていて、
 * 無い名前は送りもしない。2か所の並びが同じかは
 * `functions/selftest/alert_log_selftest.mjs` が毎回突き合わせる。
 *
 * **1秒おきに鳴りうるものは入れない。** `connectorError` は WebSocket が
 * 切れるたびに出て、つなぎ直しは1秒おきなので、1時間で 3,600行になる。
 * 入れると1日の上限をそれだけで食べて、肝心の `fxPlan` が入らなくなる。
 */
export const ALERT_LOG_EVENTS: readonly string[] = [
  // 開いた・閉じた・初めの読み込み
  "mount",
  "initSuccess",
  "initError",
  "unmount",
  "doneruConnectorStarted",
  "doneruWssError",
  "youtubeConnectorStarted",
  // 投げ銭の道
  "notificationReceived",
  "notificationDisplayed",
  "notificationDisabled",
  "replayPlay",
  "sourceError",
  "superChatInsertError",
  // 演出（#1158 で足した記録）
  "fxPlan",
  "fxPrepLate",
  "fxHeld",
  "fxVideoFailed",
  // キャラクターの動画（演出とは別の、その人の動画）
  "videoStartTimeout",
  "videoPlayRejected",
  "videoError",
];
const EVENTS = new Set(ALERT_LOG_EVENTS);

/** 1行の大きさの上限（バイト）。通知1件まるごと＋演出の記録で 1KB 前後 */
export const ALERT_LOG_MAX_BYTES = 8 * 1024;
/** 1つの送り元（合言葉）で1日に受ける行数。配信1本でおよそ 300〜500行 */
export const ALERT_LOG_PER_DAY = 3000;
/** 1つの送り元で1分に受ける行数（この Functions の手元で数える） */
export const ALERT_LOG_PER_MIN = 120;
/** この口ぜんぶで1分に受ける行数（同じく手元）。知らない合言葉の総当たりの栓 */
export const ALERT_LOG_PER_MIN_ALL = 600;

/** 置き場。`python/alert_log_report.py` が読む */
export const ALERT_LOG_DATASET = "youtube_chat";
export const ALERT_LOG_TABLE = "alertbox_logs";

/** 合言葉の形（`islandApi.ts` の `ALERTBOX_ID` と同じ） */
const PATH = /^\/alertbox\/([0-9a-f]{32})\/log$/;

/** 表の1行 */
export type AlertLogRow = {
  received_at: string;
  logged_at: string | null;
  session_id: number;
  source: string;
  screen: string;
  event: string;
  git_commit: string | null;
  notification_id: string | null;
  data: string;
  ua: string | null;
};

/** 表の形。**ここ1か所。** 表が無ければこの形で作る */
export const ALERT_LOG_SCHEMA = [
  {name: "received_at", type: "TIMESTAMP", mode: "REQUIRED",
    description: "口が受けた時刻（区切りの軸）"},
  {name: "logged_at", type: "TIMESTAMP", mode: "NULLABLE",
    description: "面が書いた時刻（面の時計）"},
  {name: "session_id", type: "INTEGER", mode: "REQUIRED",
    description: "面を開いた時刻（ms）。配信ごとの見分け"},
  {name: "source", type: "STRING", mode: "REQUIRED",
    description: "合言葉の sha256 の頭12桁（合言葉そのものは入れない）"},
  {name: "screen", type: "STRING", mode: "NULLABLE"},
  {name: "event", type: "STRING", mode: "REQUIRED"},
  {name: "git_commit", type: "STRING", mode: "NULLABLE"},
  {name: "notification_id", type: "STRING", mode: "NULLABLE",
    description: "data.id（通知のID）。無ければ NULL"},
  {name: "data", type: "JSON", mode: "NULLABLE",
    description: "面が送った data。視聴者さんの名前・メッセージを含む"},
  {name: "ua", type: "STRING", mode: "NULLABLE",
    description: "User-Agent（端末の見分け）"},
];

/** 口が受け取るもの。Express の req から要るものだけ */
export type AlertLogReq = {
  method: string;
  path: string;
  body: unknown;
  /** 届いた本文の長さ（バイト）。測れなければ null */
  bytes: number | null;
  ua: string;
};

/** 返す側。Express の res のうち、ここで使うものだけ */
export type AlertLogRes = {
  set(k: string, v: string): unknown;
  status(n: number): AlertLogRes;
  json(b: unknown): unknown;
  end(): unknown;
};

/** 外から渡すもの。試験では偽物を渡す */
export type AlertLogDeps = {
  /** 合言葉が誰かの OBS のものか（`islandApi.ts` の `alertboxExists`） */
  exists: (k: string) => Promise<boolean>;
  /** 1日の枠を1つ取る（`islandApi.ts` の `takeQuota`） */
  takeQuota: (key: string, kind: string, limit: number) => Promise<boolean>;
  /** 表へ1行入れる。省くと BigQuery */
  insert?: (row: AlertLogRow, insertId: string) => Promise<void>;
  now?: () => number;
};

/* ---- 手元で数える1分の枠 ----
   **1分ごとに丸ごと捨てる。** 知らない合言葉を大量に送られても、
   覚えるのは1分ぶん（それも全体の枠で 600 件まで）だけで、手元が膨らまない。
   Functions の実例ごとの数なので、本当の上限は「実例の数 × これ」。
   全体を正しく数えるのは Firestore の1日の枠のほう */
let minute = -1;
let allThisMinute = 0;
const perSource = new Map<string, number>();

/* ---- 誰かの OBS のものだと分かった合言葉 ----
   **当たった合言葉だけを10分覚える。** 1行ごとに Firestore を引かないため。
   外れた合言葉は覚えない（総当たりで手元が膨らむ）。 */
const KNOWN_TTL_MS = 10 * 60 * 1000;
const known = new Map<string, number>();

/** 試験のために手元の数を空にする */
export function resetAlertLogForTest(): void {
  minute = -1;
  allThisMinute = 0;
  perSource.clear();
  known.clear();
}

/**
 * 手元の1分の枠を1つ取る。
 * @param {string} source 送り元（合言葉のハッシュ）
 * @param {number} now いまの時刻（ms）
 * @return {string | null} 断る理由。通れば null
 */
function takeMinute(source: string, now: number): string | null {
  const m = Math.floor(now / 60000);
  if (m !== minute) {
    minute = m;
    allThisMinute = 0;
    perSource.clear();
  }
  if (allThisMinute >= ALERT_LOG_PER_MIN_ALL) return "busy";
  const n = perSource.get(source) ?? 0;
  if (n >= ALERT_LOG_PER_MIN) return "source";
  allThisMinute += 1;
  perSource.set(source, n + 1);
  return null;
}

/**
 * 合言葉を、表に入れてよい形（頭12桁のハッシュ）にする。
 * @param {string} k 32桁の合言葉
 * @return {string} 12桁
 */
export function sourceOf(k: string): string {
  return createHash("sha256").update(k).digest("hex").slice(0, 12);
}

/**
 * 字を長さで切る。字でなければ null。
 * @param {unknown} v 送られてきた値
 * @param {number} max いちばん長くて何字か
 * @return {string | null} 切った字
 */
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.slice(0, max);
}

/**
 * 送られてきた1行を、表の1行にする。**形が違えば理由を返す。**
 * @param {unknown} body 送られてきた本文
 * @param {string} source 送り元
 * @param {string} ua User-Agent
 * @param {number} now いまの時刻（ms）
 * @return {AlertLogRow | string} 1行か、断る理由
 */
export function rowOf(
  body: unknown,
  source: string,
  ua: string,
  now: number,
): AlertLogRow | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "not an object";
  }
  const b = body as Record<string, unknown>;
  const event = typeof b.event === "string" ? b.event : "";
  if (!EVENTS.has(event)) return "unknown event";
  /* `sessionId` は面を開いた時刻（ms）。**2020年より前・1日より先は断る**
     （配信ごとの見分けに使うので、でたらめな数を入れると表が割れる） */
  const sid = b.sessionId;
  if (typeof sid !== "number" || !Number.isSafeInteger(sid) ||
    sid < Date.UTC(2020, 0, 1) || sid > now + 86400000) {
    return "bad sessionId";
  }
  const data = b.data ?? {};
  if (typeof data !== "object" || Array.isArray(data)) return "bad data";
  /* 面の時計は信じすぎない。読めないものは NULL（受けた時刻は別に持つ） */
  const at = typeof b.timestamp === "string" ? Date.parse(b.timestamp) : NaN;
  const loggedAt = Number.isFinite(at) ?
    new Date(at).toISOString() : null;
  const id = (data as Record<string, unknown>).id;
  return {
    received_at: new Date(now).toISOString(),
    logged_at: loggedAt,
    session_id: sid,
    source,
    screen: str(b.screen, 40) ?? "",
    event,
    git_commit: str(b.gitCommit, 64),
    notification_id: typeof id === "string" || typeof id === "number" ?
      String(id).slice(0, 120) : null,
    data: JSON.stringify(data),
    ua: str(ua, 300),
  };
}

/**
 * BigQuery へ1行入れる。**表が無ければ作る**（その1行は入らない）。
 * @param {AlertLogRow} row 入れる1行
 * @param {string} insertId 送り直しで2行にしないための印
 */
async function insertToBigQuery(
  row: AlertLogRow,
  insertId: string,
): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || "live-streaming-d3cac";
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/bigquery"],
  });
  const bq = google.bigquery({version: "v2", auth});
  const where = {
    projectId,
    datasetId: ALERT_LOG_DATASET,
    tableId: ALERT_LOG_TABLE,
  };
  try {
    const r = await bq.tabledata.insertAll({
      ...where,
      requestBody: {rows: [{insertId, json: row}]},
    });
    /* **200 でも入っていないことがある。** 行ごとの誤りは本文で返る */
    const errs = r.data.insertErrors ?? [];
    if (errs.length) {
      const why = errs[0]?.errors?.[0]?.reason ?? "unknown";
      throw new Error(`insertErrors: ${why}`);
    }
  } catch (e) {
    const code = (e as {code?: number}).code;
    if (code !== 404) throw e;
    /* 表がまだ無い。**この形で作る。** 作った直後の表へは、しばらく
       流し込めないことがある（BigQuery の決まり）ので、この1行は諦める */
    try {
      await bq.tables.insert({
        projectId,
        datasetId: ALERT_LOG_DATASET,
        requestBody: {
          tableReference: where,
          description:
            "投げ銭アラートの面のログの写し（#1160）。" +
            "書くのは functions/src/alertLog.ts、" +
            "読むのは python/alert_log_report.py",
          schema: {fields: ALERT_LOG_SCHEMA},
          timePartitioning: {type: "DAY", field: "received_at"},
        },
      });
      logger.info("alert log: 表を作りました");
    } catch (e2) {
      // 同時に2本が作りに行った（409）なら、もう在る
      if ((e2 as {code?: number}).code !== 409) throw e2;
    }
    throw new Error("table created");
  }
}

/**
 * アラートのログの写しを受ける口。**扱った URL なら true を返す。**
 * @param {AlertLogReq} q 受け取ったもの
 * @param {AlertLogRes} res 返す先
 * @param {AlertLogDeps} deps 外から渡すもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleAlertLog(
  q: AlertLogReq,
  res: AlertLogRes,
  deps: AlertLogDeps,
): Promise<boolean> {
  const m = q.path.match(PATH);
  if (!m) return false;
  res.set("Cache-Control", "no-store");
  if (q.method === "POST" && m) {
    const now = (deps.now ?? Date.now)();
    const k = m[1];
    /* 1. 大きさ。**本文の長さを先に見る**（読んでから断っても遅いが、
       Firestore も BigQuery も引かずに返せる） */
    const bytes = q.bytes ?? Buffer.byteLength(JSON.stringify(q.body ?? {}));
    if (bytes > ALERT_LOG_MAX_BYTES) {
      res.status(413).json({error: "too large"});
      return true;
    }
    const source = sourceOf(k);
    // 2. 名前と形
    const row = rowOf(q.body, source, q.ua, now);
    if (typeof row === "string") {
      res.status(400).json({error: row});
      return true;
    }
    // 3・4. 手元の1分の枠
    const busy = takeMinute(source, now);
    if (busy) {
      res.status(429).json({error: "slow down"});
      return true;
    }
    // 5. 合言葉。**当たったかどうかを書き分けない**（ほかの alertbox の口と同じ 404）
    const seen = known.get(k);
    if (!seen || seen < now) {
      if (!(await deps.exists(k))) {
        res.status(404).json({error: "no alertbox"});
        return true;
      }
      known.set(k, now + KNOWN_TTL_MS);
    }
    // 6. 1日の枠（Firestore。実例をまたいで数える）
    if (!(await deps.takeQuota(source, "alertlog", ALERT_LOG_PER_DAY))) {
      logger.warn("alert log: 1日の枠に当たりました");
      res.status(429).json({error: "daily limit"});
      return true;
    }
    /* 送り直しで2行にしない印。面が同じ1行を2回送っても、
       BigQuery が（ベストエフォートで）1行に潰す */
    const insertId = createHash("sha256")
      .update(`${source}|${row.session_id}|${row.event}|` +
        `${row.logged_at}|${row.data}`)
      .digest("hex").slice(0, 32);
    try {
      await (deps.insert ?? insertToBigQuery)(row, insertId);
    } catch (e) {
      /* **中身は出さない。** 出すのは出来事の名前と理由だけ */
      logger.warn(`alert log: 入れられませんでした（${row.event}）`,
        String((e as Error)?.message ?? e).slice(0, 200));
      res.status(503).json({error: "not stored"});
      return true;
    }
    res.status(204).end();
    return true;
  }
  res.status(405).json({error: "method not allowed"});
  return true;
}
