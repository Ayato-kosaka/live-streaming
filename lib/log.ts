
/* 投げ銭アラートのログの写し（#1160）。

   ログはスプレッドシート（Apps Script）へ1行ずつ送っている。そこは
   あやとが見る先なので**そのまま残す**。ただ、システムの側からは1行も
   読めない。11/8 の配信で演出が出なかったとき、原因を数で追えなかった。

   そこで、決めた出来事だけを**あやと島の口へもう1本送る**
   （`POST /island-api/alertbox/{合言葉}/log` → BigQuery `youtube_chat.alertbox_logs`）。

   - **鍵は持たない。** 送り先は相対の道で、知っているのは OBS の URL に
     もともと載っている合言葉だけ。BigQuery へ書くのはサーバー（Functions）
   - **始めるのは `copyAlertLogs(k)` を呼んだ面だけ**（いまはアラートだけ。
     試し表示では呼ばない）
   - 名前の並びと1行の上限は、口（`functions/src/alertLog.ts`）と同じ。
     2か所が同じかは `functions/selftest/alert_log_selftest.mjs` が見る
   - **送れなくても何も止めない。** 待たない・投げない・429（枠に当たった）が来たら1分送らない */
const ALERT_LOG_EVENTS = new Set([
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
  // キャラクターの動画
  "videoStartTimeout",
  "videoPlayRejected",
  "videoError",
]);
/** 1行の上限（バイト）。超えたら data を `{ tooBig: 長さ }` に替えて送る（口は 413 で断るので） */
const ALERT_LOG_MAX_BYTES = 8 * 1024;

let copyTo: string | null = null;
/** 枠に当たったら、1分は送らない（叩き続けても入らない） */
let copyOffUntil = 0;

/** この面のログの写しを始める。合言葉の形でなければ何もしない */
export const copyAlertLogs = (k: string) => {
    copyTo = /^[0-9a-f]{32}$/.test(k) ? `/island-api/alertbox/${k}/log` : null;
    copyOffUntil = 0;
};

const bytesOf = (s: string): number => {
    try {
        return new TextEncoder().encode(s).length;
    } catch {
        return s.length * 3;
    }
};

const copyLine = (payload: { event: string; data: unknown }) => {
    if (!copyTo || Date.now() < copyOffUntil || !ALERT_LOG_EVENTS.has(payload.event)) return;
    let body = JSON.stringify(payload);
    const n = bytesOf(body);
    if (n > ALERT_LOG_MAX_BYTES) body = JSON.stringify({ ...payload, data: { tooBig: n } });
    fetch(copyTo, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        // 閉じる間際（unmount）の1行も届くように
        keepalive: true,
    })
        .then((r) => {
            if (r?.status === 429) copyOffUntil = Date.now() + 60_000;
        })
        .catch(() => {
            // 写しなので、届かなくても何もしない
        });
};

export const sendLog = async (screen: string, sessionId: React.MutableRefObject<number> | null, event: string, data: any = {}) => {
    try {
        const payload = {
            timestamp: new Date().toISOString(),
            sessionId: sessionId?.current,
            screen,
            event,
            gitCommit: process.env.EXPO_PUBLIC_GIT_COMMIT,
            data,
        };

        console.log(JSON.stringify(payload));
        try {
            copyLine(payload);
        } catch {
            // 写しの組み立てで落ちても、スプレッドシートへの送りは続ける
        }
        await fetch(process.env.EXPO_PUBLIC_GAS_LOG_API_URL!, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error("Failed to send log:", err);
    }
};
