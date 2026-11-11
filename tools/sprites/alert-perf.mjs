/**
 * 投げ銭アラート（`app/alertbox`）の**性能の懸念**を、本番と同じ道で測って1枚の表にする。
 *
 *   cd tools/sprites
 *   node alert-perf.mjs --dist <書き出し> --json base.json --md base.md                    # 5項目ぜんぶ
 *   node alert-perf.mjs --dist <書き出し> --parts idle --fault raf --json raf.json         # 対照: 待機中に rAF を1本回す
 *   node alert-perf.mjs --dist <書き出し> --parts mem,tiers,long --fault leak --json leak.json  # 対照: Blob を手放さない
 *   node alert-perf.mjs --combine base.json,raf.json,leak.json --md perf.md                # 表と、対照が赤に変わったか
 *
 * ## なぜ要るか
 *
 * 面はスマホの PRISM（Android の WebView）で、配信アプリと同居して 3〜4 時間開きっぱなし。#1158 から段の動画
 * 33本（約23.7MB）を Blob で手元に持つ。どこが重いかを、ほかの道具（`alert-cpu` `alert-gpu` は1件の描画、
 * `alert-live` は出たかどうか）では**開いてからずっと**の目で見ていなかった。
 *
 * ## 何を測るか（`--parts`。既定は全部）
 *
 * | part | 何を | どう |
 * | --- | --- | --- |
 * | mem | 記憶 | 持ち切ったあと・7段を流したあとに GC してから、JS ヒープ・object URL が握る Blob の合計・生きている `<video>`（DOM の外も。`Runtime.queryObjects`）・object URL の解放漏れ |
 * | net | 回線 | 開いた直後から1秒ごとの下り・上り（CDP の `Network.dataReceived`）。回線は `--net`（既定 mobile5 = 下り 5Mbps・上り 2Mbps・往復 80ms） |
 * | idle | 待機の CPU と描画 | 投げ銭なしの `--idle` 秒（既定 60）。描画プロセスの `ProcessTime`・GPU プロセスの CPU 秒、rAF の呼び出し・setInterval・CSS アニメーション・再生中の video の数 |
 * | tiers | 投げ銭中の CPU と描画 | 7段を1件ずつ。CPU（ms/秒）・50ms を超えたコマの間・頭3秒のいちばん長いコマ（Long Animation Frame）・動画の落ちたコマ（`getVideoPlaybackQuality`） |
 * | req | 待機中の通信 | 時計を進めて（`clock.runFor`）`--long-hours` 時間ぶん。口ごとの回数とバイト/時 |
 * | long | 長時間 | 同じ開き方で、時計を進めながら投げ銭を `--long-alerts` 件。1件ごとに GC してヒープ・video・Blob・タイマー・DOM が増え続けないか |
 *
 * 測りかたの決まり（CLAUDE.md）: CPU は壁の時計ではなく `Performance.ProcessTime`。CPU の絞りは下駄が乗るので掛けない。
 * **この箱と Actions の合成はソフトウェア（SwiftShader）**なので、CPU の数は比べ合いとして読む（段どうし・待機と投げ銭中）。
 *
 * ## 本番と同じ道
 *
 * `?preview=` を付けずに開く（OBS・PRISM に貼る URL と同じ `?k=<合言葉>`。source を付けないので、どねると YouTube の両方に繋ぐ）。
 * 外の口はこの道具が受ける: `/island-api/alertbox/<k>/…`（名簿・額・もう一度出して・ログの写し・YouTube の鍵）・
 * どねるの WebSocket（`routeWebSocket`）・YouTube Data API（空のチャットを `--yt-poll` ms ごとに返す）・キャラ絵の CDN。
 * スプレッドシートへのログ（`EXPO_PUBLIC_GAS_LOG_API_URL`）は書き出しに鍵が無いので手元の 404 に落ちるが、**回数は数える**。
 * 配りは firebase.json の headers と同じ（絵と動画は `max-age=3600`、Range に答える）。PRISM の縮み方（`prism.mjs`）を入れる。
 * 名簿は3人の偽物（名前は「テスト1〜3」・絵は `--char`）。**視聴者さんの名前も本物のキャラ絵も使わない。**
 *
 * ## 対照（`--fault`。見張りが「落ちるときに落ちる」かを見る）
 *
 * - `raf` … 面を開いたら rAF の輪を1本回し続ける → 行 `idle.raf` が懸念ありに変わる
 * - `leak` … 投げ銭を受けるたびに 1MB の Blob の object URL を作って手放さない → 行 `mem.urlleak` と `long.blob` が懸念ありに変わる
 *
 * 終了コード: 0 = 懸念なし / 1 = 懸念あり（`--combine` では、対照が懸念ありに変わらなかった） / 2 = 測れなかった
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

/* ------------------------------------------------------------------ 懸念の線 */

const MB = 1024 * 1024;
/** Android の Chromium は Blob を端末の RAM の 1% まで記憶に持つ（`blob_memory_controller.cc`）。3GB 端末の 1% の 8 割 */
const BLOB_LINE = 0.8 * ((3 * 1024 * MB) / 100);
const LINES = {
  heapMB: 50,
  blob: BLOB_LINE,
  holdSec: 60,
  /** 下りを 9 割以上使った秒が、これより長く続いたら */
  saturatedSec: 30,
  /** 面が上りに出す量の山（上りの何割まで） */
  upShare: 0.05,
  idleCpu: 10,
  idleRaf: 0.5,
  shortInterval: 1000,
  reqPerHour: 360,
  kbPerHour: 1024,
  jank: 3,
  headFrameMs: 200,
  dropped: 0.05,
  longHeapMB: 5,
  longNodes: 200,
  longListeners: 50,
};

/* ------------------------------------------------------------------ 表にする */

const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d));
const mb = (b) => fmt(b / MB, 1);

/** 測った結果 → 表の行。`concern` は true（懸念あり）/ false / null（線を引かない・測れなかった） */
function rows(r) {
  const out = [];
  const row = (id, item, value, line, concern, note = "") => out.push({ id, item, value, line, concern, note });
  const A = r.open;
  const B = r.long;
  if (r.parts.includes("mem")) {
    if (!A?.held) row("mem.held", "記憶: 持ち切る", "測れなかった", "—", null, A?.err ?? "fxHeld が来なかった");
    const m1 = A?.memHeld;
    const m2 = A?.memAfter;
    if (m1) {
      row("mem.heap", "記憶: JS ヒープ（持ち切ったあと → 7段のあと・GC 後）", `${mb(m1.heap)} → ${m2 ? mb(m2.heap) : "—"} MB`, `${LINES.heapMB}MB 以下`,
        Math.max(m1.heap, m2?.heap ?? 0) > LINES.heapMB * MB);
      const blob = Math.max(m1.urlBytes, m2?.urlBytes ?? 0);
      const ram = [3, 4, 6, 8].map((g) => `${g}GB の ${fmt((blob / ((g * 1024 * MB) / 100)) * 100, 0)}%`).join("・");
      row("mem.blob", "記憶: Blob の合計（object URL が握る）", `${mb(blob)} MB・${m1.urls} 本`, `${mb(LINES.blob)}MB 以下（3GB 端末の 1% の 8 割）`,
        blob > LINES.blob, `Blob の上限（RAM の 1%）に対して ${ram}`);
      if (m2) {
        row("mem.video", "記憶: 生きている video（7段のあと・GC 後、DOM の外）", `${m2.videos.detached} 本（DOM の中 ${m2.videos.connected}・src を持つ ${m2.videos.withSrc}）`, "0 本",
          m2.videos.detached > 0);
        // 持ち切ったあとから増えた本数（持つ本は温めで作り終えている。投げ銭のための取り寄せは流し終えたら手放す決まり）
        const leak = m2.urls - m1.urls;
        row("mem.urlleak", "記憶: object URL の解放漏れ（7段のあと − 持ち切ったとき）", `${leak} 本・${mb(m2.urlBytes - m1.urlBytes)} MB`, "0 本", leak > 0,
          `作った ${m2.made}・手放した ${m2.freed}`);
      }
      if (m1.rss) row("mem.rss", "記憶: プロセスの RSS（開いた直後 → 持ち切ったあと）",
        Object.entries(m1.rss).map(([k, v]) => `${k} ${mb(A.mem0?.rss?.[k] ?? 0)}→${mb(v)}`).join("・") + " MB", "（参考）", null, "Linux の runner の値。Blob はブラウザのプロセスに載る");
    }
  }
  if (r.parts.includes("net") && A) {
    const n = A.net;
    if (!n || !A.held) row("net.hold", "回線: 持ち切るまで", "測れなかった", "—", null, A?.err ?? "fxHeld が来なかった");
    else {
      row("net.hold", `回線: 持ち切るまで（${r.netName}）`, `${fmt(A.held.sinceOpen, 1)} 秒（取り込み ${fmt(A.held.ms / 1000, 1)} 秒・${mb(A.held.bytes)} MB・${A.held.got}/${A.held.of} 本）`,
        `${LINES.holdSec} 秒以内`, A.held.sinceOpen > LINES.holdSec);
      row("net.down", "回線: 下りの山（開いてから持ち切るまで）", `${fmt(n.peakDown / 1024, 0)} KB/秒・9割以上を使った秒 ${n.saturated}`, `9割以上が ${LINES.saturatedSec} 秒以内`,
        n.down ? n.saturated > LINES.saturatedSec : null, n.down ? `下りの上限 ${fmt(n.down / 1024, 0)} KB/秒・合計 ${mb(n.totalDown)} MB` : "回線を絞っていない");
      row("net.up", "回線: 面が上りに出す山（配信の上りと取り合う分）", `${fmt(n.peakUp / 1024, 1)} KB/秒・合計 ${fmt(n.totalUp / 1024, 0)} KB`, `上りの ${LINES.upShare * 100}% 以内`,
        n.up ? n.peakUp > n.up * LINES.upShare : null, n.up ? `上りの上限 ${fmt(n.up / 1024, 0)} KB/秒` : "");
    }
  }
  if (r.parts.includes("idle") && A) {
    const I = A.idle;
    if (!I) row("idle.cpu", "待機: CPU", "測れなかった", "—", null, A?.err ?? "");
    else {
      row("idle.cpu", `待機: CPU（${I.sec} 秒）`, `描画 ${fmt(I.cpu)}・メイン ${fmt(I.main)}・GPU ${fmt(I.gpu)} ms/秒`, `描画 ${LINES.idleCpu} ms/秒 以下`, I.cpu > LINES.idleCpu);
      row("idle.raf", "待機: rAF の呼び出し", `${fmt(I.rafPerSec, 1)} 回/秒`, `${LINES.idleRaf} 回/秒 以下（0 が基準）`, I.rafPerSec > LINES.idleRaf);
      const iv = Object.entries(I.intervals).sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}ms×${c}`).join("・") || "なし";
      const short = Object.entries(I.intervals).filter(([d]) => Number(d) < LINES.shortInterval).reduce((a, [, c]) => a + c, 0);
      row("idle.interval", "待機: 回っている setInterval", iv, `${LINES.shortInterval}ms 未満が 0`, short > 0, `setTimeout ${fmt(I.timeoutsPerSec, 1)} 回/秒`);
      row("idle.anim", "待機: 走っている CSS アニメーション・SMIL・再生中の video", `${I.anims}・${I.smil}・${I.playing}`, "0・0・0", I.anims + I.smil + I.playing > 0,
        I.animNames.length ? `名前: ${I.animNames.join(" ")}` : "");
    }
  }
  if (r.parts.includes("tiers") && A) {
    if (!A.tiers?.length) row("tier", "投げ銭中", "測れなかった", "—", null, A?.err ?? "");
    for (const t of A.tiers ?? []) {
      const bad = t.failed || t.jank > LINES.jank || t.headMax > LINES.headFrameMs || (t.vTotal ? t.vDropped / t.vTotal > LINES.dropped : false);
      row(`tier.${t.tier}`, `投げ銭中: 段${t.tier}（${t.amount}円・${fmt(t.sec, 0)}秒）`,
        `描画 ${fmt(t.cpu, 0)}・GPU ${fmt(t.gpu, 0)} ms/秒・${fmt(t.fps, 0)} コマ/秒・50ms超 ${t.jank}・頭3秒の最長 ${fmt(t.headMax, 0)}ms・動画の落ち ${t.vTotal ? `${fmt((t.vDropped / t.vTotal) * 100, 1)}%` : "—"}`,
        `50ms超 ${LINES.jank} 以下・頭 ${LINES.headFrameMs}ms 以下・落ち ${LINES.dropped * 100}% 以下`, bad,
        t.failed ? `fxVideoFailed ${JSON.stringify(t.failed)}` : t.video ? "" : "動画の段にならなかった");
    }
  }
  if (r.parts.includes("req") && B) {
    const q = B.req;
    if (!q) row("req.hour", "待機中の通信", "測れなかった", "—", null, B?.err ?? "");
    else {
      const parts = Object.entries(q.byCat).sort((a, b) => b[1].n - a[1].n).map(([c, v]) => `${c} ${fmt(v.n / q.hours, 0)}`).join("・");
      const n = q.total.n / q.hours;
      const kb = (q.total.up + q.total.down) / 1024 / q.hours;
      row("req.hour", `待機中の通信（${fmt(q.hours, 1)} 時間ぶん時計を進めて）`, `${fmt(n, 0)} 回/時・${fmt(kb, 0)} KB/時（${parts}）`,
        `${LINES.reqPerHour} 回/時・${LINES.kbPerHour} KB/時 以下`, n > LINES.reqPerHour || kb > LINES.kbPerHour,
        `どねるの ping ${fmt(q.pings / q.hours, 0)} 回/時（WebSocket）。YouTube は返す pollingIntervalMillis（ここでは ${q.ytPoll}ms）しだい`);
    }
  }
  if (r.parts.includes("long") && B) {
    const S = B.snaps ?? [];
    if (S.length < 3) row("long", "長時間", "測れなかった", "—", null, B?.err ?? `${S.length} 件しか流せなかった`);
    else {
      const k = Math.min(5, Math.floor(S.length / 2));
      const a = S[k - 1];
      const z = S.at(-1);
      const tag = `${k}件目 → ${S.length}件目（${fmt(z.hours, 1)} 時間）`;
      row("long.heap", `長時間: JS ヒープ ${tag}`, `${mb(a.heap)} → ${mb(z.heap)} MB`, `+${LINES.longHeapMB}MB 以内`, z.heap - a.heap > LINES.longHeapMB * MB);
      row("long.video", "長時間: 生きている video", `${a.videos.all} → ${z.videos.all} 本`, "増えない", z.videos.all > a.videos.all);
      row("long.blob", "長時間: object URL（Blob）", `${a.urls} → ${z.urls} 本・${mb(a.urlBytes)} → ${mb(z.urlBytes)} MB`, "増えない", z.urls > a.urls);
      row("long.timer", "長時間: setInterval・待っている setTimeout", `${a.intervals} → ${z.intervals}・${a.timeouts} → ${z.timeouts}`, "増えない",
        z.intervals > a.intervals || z.timeouts > a.timeouts + 5);
      row("long.dom", "長時間: DOM の節・イベントの受け手", `${a.nodes} → ${z.nodes}・${a.listeners} → ${z.listeners}`, `+${LINES.longNodes}・+${LINES.longListeners} 以内`,
        z.nodes - a.nodes > LINES.longNodes || z.listeners - a.listeners > LINES.longListeners);
    }
  }
  return out;
}

function table(rs) {
  const mark = (c) => (c === true ? "**あり**" : c === false ? "なし" : "—");
  const lines = ["| 項目 | いまの数 | 懸念の線 | 懸念 |", "| --- | --- | --- | :---: |"];
  for (const x of rs) lines.push(`| ${x.item}${x.note ? `<br><sub>${x.note}</sub>` : ""} | ${x.value} | ${x.line} | ${mark(x.concern)} |`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ --combine */

const CONTROLS = [
  { fault: "raf", what: "待機中に rAF を1本回す", ids: ["idle.raf"] },
  { fault: "leak", what: "投げ銭ごとに 1MB の Blob を作って手放さない", ids: ["mem.urlleak", "long.blob"] },
];

function combine(files) {
  const all = files.map((f) => {
    try {
      return JSON.parse(readFileSync(resolve(f), "utf-8"));
    } catch (e) {
      return { file: f, err: String(e).slice(0, 200) };
    }
  });
  const base = all.find((x) => x.fault === "none");
  const md = ["<!-- alert-perf -->", "## 投げ銭アラートの性能（`tools/sprites/alert-perf.mjs`）", ""];
  if (!base?.rows) {
    md.push("**ふだんの回が測れなかった。**", "", ...all.map((x) => `- ${x.file ?? x.fault}: ${x.err ?? x.errs?.join(" / ") ?? "?"}`));
    return { md: md.join("\n"), code: 2 };
  }
  md.push(
    `版 ${base.commit ?? "—"}・テーマ ${base.theme ?? "—"}・回線 ${base.netName}・箱 ${base.size}・密度 ${base.dpr}・${base.prism}。` +
      "合成はソフトウェア（SwiftShader）なので、CPU の数は段どうし・待機との比べ合いで読む。",
    "",
    table(base.rows),
    ""
  );
  if (base.errs?.length) md.push(`測れなかったところ: ${base.errs.join(" / ")}`, "");
  md.push("### 対照（わざと壊して、その行が懸念ありに変わるか）", "", "| 対照 | 行 | ふだん | 対照 | 変わったか |", "| --- | --- | :---: | :---: | :---: |");
  let ok = true;
  const m = (c) => (c === true ? "あり" : c === false ? "なし" : "—");
  for (const c of CONTROLS) {
    const leg = all.find((x) => x.fault === c.fault);
    for (const id of c.ids) {
      const b = base.rows.find((x) => x.id === id);
      const f = leg?.rows?.find((x) => x.id === id);
      const flipped = b?.concern === false && f?.concern === true;
      if (!flipped) ok = false;
      md.push(`| ${c.what} | \`${id}\` | ${m(b?.concern)} | ${leg ? m(f?.concern) : "（回していない）"} | ${flipped ? "○" : "**×**"} |`);
    }
  }
  md.push("");
  const concerns = base.rows.filter((x) => x.concern === true).map((x) => `\`${x.id}\``);
  md.push(concerns.length ? `懸念あり: ${concerns.join(" ")}` : "懸念なし", "");
  return { md: md.join("\n"), code: base.exit === 2 ? 2 : ok ? 0 : 1 };
}

if (arg("combine", "")) {
  const { md, code } = combine(arg("combine", "").split(",").filter(Boolean));
  if (arg("md", "")) writeFileSync(resolve(arg("md", "")), md + "\n");
  console.log(md);
  process.exit(code);
}

/* ------------------------------------------------------------------ 測る */

const { chromium } = await import("playwright-core");
const { chromePath } = await import("./chrome.mjs");
const { prism, prismNote } = await import("./prism.mjs");

const dist = resolve(arg("dist", ""));
if (!existsSync(join(dist, "alertbox"))) die(`書き出しが無い（alertbox が見当たらない）: ${dist}`);
const PARTS = ["mem", "net", "idle", "tiers", "req", "long"];
const parts = arg("parts", PARTS.join(",")).split(",").filter(Boolean);
for (const p of parts) if (!PARTS.includes(p)) die(`--parts は ${PARTS.join(",")} から（${p}）`);
const fault = arg("fault", "none");
if (!["none", "raf", "leak"].includes(fault)) die(`--fault は none・raf・leak（${fault}）`);
const theme = arg("theme", "");
const NET = {
  off: null,
  mobile5: { offline: false, latency: 80, downloadThroughput: 625_000, uploadThroughput: 250_000 },
  mountain: { offline: false, latency: 300, downloadThroughput: 187_500, uploadThroughput: 93_750 },
};
const netName = arg("net", "mobile5");
if (!(netName in NET)) die(`--net は ${Object.keys(NET).join("・")}（${netName}）`);
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const idleSec = Number(arg("idle", "60"));
const holdMax = Number(arg("hold-max", "300"));
const longAlerts = Math.max(3, Number(arg("long-alerts", "20")));
const longHours = Number(arg("long-hours", "4"));
const ytPoll = Number(arg("yt-poll", "5000"));
const dpr = Number(arg("dpr", "3"));
const [W, H] = arg("size", "436x776").split("x").map(Number);
const charFile = arg("char", "../../site/public/goods/ayato-walk.png");
if (!existsSync(resolve(charFile))) die(`キャラ絵が無い: ${charFile}`);
const charBody = readFileSync(resolve(charFile));
const CUTS = [0, 200, 500, 1000, 2000, 5000, 10000];
const tierOf = (a) => CUTS.filter((c) => a >= c).length;
const alertSec = (a) => 30 + (a >= 10000 ? 30 : a >= 1000 ? 15 : 0);

/** OBS の URL の合言葉（32 桁）。口はこの道具が受けるので、何でもよい */
const K = "0123456789abcdef0123456789abcdef";
const WSS = "wss://doneru.invalid/alertbox";
const MSG = "ありがとう！これは確かめの投げ銭です";
/** 偽の名簿（3人）。名前も絵も本物ではない */
const ROSTER = [1, 2, 3].map((i) => {
  const u = `https://perf.cloudfront.net/c${i}.png`;
  return { id: `c${i}`, emoji: "", channelName: `テスト${i}`, aliases: [`テスト${i}`], plain: { full: u, sizes: { 128: u, 256: u, 640: u }, w: 640, h: 640 }, scene: null };
});

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".webm": "video/webm", ".mp4": "video/mp4",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ico": "image/x-icon",
};
/* firebase.json の headers と同じ */
const cacheOf = (p) =>
  /\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|otf|mp4|webm|mp3)$/i.test(p)
    ? "public, max-age=3600"
    : p.startsWith("/_expo/static/") ? "public, max-age=31536000, immutable" : "no-cache";

function island(path, res) {
  const m = path.match(/^\/island-api\/alertbox\/([0-9a-f]{32})\/([a-z-]+)$/);
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(body == null ? "" : JSON.stringify(body));
  };
  if (!m || m[1] !== K) return send(404);
  if (m[2] === "fund") return send(200, { currentAmount: 30000, targetAmount: 50000, label: "確かめ" });
  if (m[2] === "characters") return send(200, { characters: ROSTER });
  if (m[2] === "replay") return send(200, { seq: 0 });
  if (m[2] === "wss") return send(200, { wss: WSS });
  // 時計を何時間進めても切れない鍵（本番は1時間ごとに取り直す。1回/時）
  if (m[2] === "yt-token") return send(200, { at: "perf", channel: "perf", expiresAt: Date.now() + 30 * 24 * 3600e3 });
  if (m[2] === "log" || m[2] === "superchat") return send(200, {});
  return send(404);
}

async function serve() {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    if (path.startsWith("/island-api/")) {
      req.resume();
      return island(path, res);
    }
    for (const c of [path, `${path}.html`, join(path, "index.html")]) {
      const f = normalize(join(dist, c));
      if (!f.startsWith(dist)) break;
      try {
        const st = await stat(f);
        if (!st.isFile()) continue;
        const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
        const head = { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": cacheOf(path), "accept-ranges": "bytes", etag, "last-modified": st.mtime.toUTCString() };
        if (req.headers["if-none-match"] === etag) return void res.writeHead(304, head).end();
        const body = await readFile(f);
        const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        if (r && (r[1] || r[2])) {
          const start = r[1] ? Number(r[1]) : Math.max(0, body.length - Number(r[2]));
          const end = r[1] && r[2] ? Math.min(Number(r[2]), body.length - 1) : body.length - 1;
          if (start >= body.length) return void res.writeHead(416, { "content-range": `bytes */${body.length}` }).end();
          res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${body.length}`, "content-length": end - start + 1 });
          return void res.end(body.subarray(start, end + 1));
        }
        res.writeHead(200, { ...head, "content-length": body.length });
        return void res.end(body);
      } catch {
        // 次の候補
      }
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

/* 面の中の見張り。**数えるだけで、面の動きは変えない**（数える道具が rAF や setInterval を足すと、それ自体が数に入るので、
   こちらの輪は差し替える前の本物で回す）。ログは要る出来事だけ持つ（長時間で、こちらの控えがヒープを太らせないように） */
const PERF = (fault) => `(() => {
  const W = window;
  const P = (W.__perf = { raf: 0, to: 0, ivFires: 0, iv: new Map(), pend: new Set(), urls: new Map(), made: 0, freed: 0, logs: [], nlog: 0, loaf: [], fr: null });
  const KEEP = new Set(["mount", "initSuccess", "fxHeld", "fxPlan", "fxPrepLate", "fxVideoFailed", "notificationReceived", "notificationDisplayed"]);
  const rAF = W.requestAnimationFrame.bind(W), sT = W.setTimeout.bind(W), cT = W.clearTimeout.bind(W), sI = W.setInterval.bind(W), cI = W.clearInterval.bind(W);
  P.realRaf = rAF; P.realInterval = sI; P.realClearInterval = cI;
  W.requestAnimationFrame = function (cb) { P.raf++; return rAF(cb); };
  W.setTimeout = function (f, d, ...a) {
    if (typeof f !== "function") return sT(f, d, ...a);
    let id;
    id = sT(function () { P.pend.delete(id); P.to++; return f.apply(this, arguments); }, d, ...a);
    P.pend.add(id);
    return id;
  };
  W.clearTimeout = function (id) { P.pend.delete(id); return cT(id); };
  W.setInterval = function (f, d, ...a) {
    if (typeof f !== "function") return sI(f, d, ...a);
    const id = sI(function () { P.ivFires++; return f.apply(this, arguments); }, d, ...a);
    P.iv.set(id, Number(d) || 0);
    return id;
  };
  W.clearInterval = function (id) { P.iv.delete(id); return cI(id); };
  const cOU = URL.createObjectURL.bind(URL), rOU = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (o) { const u = cOU(o); P.urls.set(u, (o && o.size) || 0); P.made++; return u; };
  URL.revokeObjectURL = function (u) { if (P.urls.delete(u)) P.freed++; return rOU(u); };
  const L = console.log;
  console.log = function (...a) {
    try {
      const s = a[0];
      if (typeof s === "string" && s.charAt(0) === "{" && s.indexOf('"AlertBox"') > 0) {
        const j = JSON.parse(s);
        P.nlog++;
        if (KEEP.has(j.event)) P.logs.push({ t: performance.now(), event: j.event, data: j.event === "fxPlan" || j.event === "fxHeld" || j.event === "fxVideoFailed" || j.event === "fxPrepLate" ? j.data : null });
        if (${JSON.stringify(fault)} === "leak" && j.event === "notificationReceived") URL.createObjectURL(new Blob([new Uint8Array(1 << 20)]));
      }
    } catch (e) {}
    return L.apply(this, a);
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (P.loaf.length < 5000) P.loaf.push({ t: e.startTime, d: e.duration }); }).observe({ type: "long-animation-frame", buffered: true });
  } catch (e) {}
  if (${JSON.stringify(fault)} === "raf") {
    const spin = () => W.requestAnimationFrame(spin);
    W.requestAnimationFrame(spin);
  }
  /* 投げ銭中だけ、本物の rAF でコマを数え、動画の落ちたコマを 250ms ごとに読む（要素は WeakMap で持つ。生きている数を変えない） */
  P.frameStart = () => {
    const F = (P.fr = { t: [], dropped: 0, total: 0, q: new WeakMap(), on: true });
    const loop = (t) => { if (!F.on) return; F.t.push(t); rAF(loop); };
    rAF(loop);
    const read = () => {
      for (const v of document.querySelectorAll("video")) {
        let q;
        try { q = v.getVideoPlaybackQuality(); } catch (e) { continue; }
        const p = F.q.get(v) || { d: 0, n: 0 };
        F.dropped += Math.max(0, q.droppedVideoFrames - p.d);
        F.total += Math.max(0, q.totalVideoFrames - p.n);
        F.q.set(v, { d: q.droppedVideoFrames, n: q.totalVideoFrames });
      }
    };
    F.iv = sI(read, 250);
    F.read = read;
  };
  P.frameStop = () => {
    const F = P.fr;
    if (!F) return null;
    F.read();
    F.on = false;
    cI(F.iv);
    P.fr = null;
    let jank = 0, maxGap = 0;
    for (let i = 1; i < F.t.length; i++) { const g = F.t[i] - F.t[i - 1]; if (g > 50) jank++; if (g > maxGap) maxGap = g; }
    return { frames: F.t.length, first: F.t[0] ?? null, last: F.t.at(-1) ?? null, jank, maxGap, dropped: F.dropped, total: F.total };
  };
  P.snap = () => {
    const ivs = {};
    for (const d of P.iv.values()) ivs[d] = (ivs[d] || 0) + 1;
    let urlBytes = 0;
    for (const b of P.urls.values()) urlBytes += b;
    let anims = [];
    try { anims = document.getAnimations().filter((a) => a.playState === "running"); } catch (e) {}
    const names = [...new Set(anims.map((a) => a.animationName || a.transitionProperty || a.id || "waapi"))].slice(0, 6);
    const vids = [...document.querySelectorAll("video")];
    return {
      now: performance.now(), raf: P.raf, to: P.to, ivFires: P.ivFires, intervals: P.iv.size, ivs, timeouts: P.pend.size,
      urls: P.urls.size, urlBytes, made: P.made, freed: P.freed, anims: anims.length, animNames: names,
      smil: document.querySelectorAll("animate,animateTransform,animateMotion,set").length,
      playing: vids.filter((v) => !v.paused).length, plate: !!document.querySelector('[data-plate="box"]'), nlog: P.nlog,
    };
  };
})();`;

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 口の名前（数えるときの括り） */
function catOf(u) {
  if (u.includes("/island-api/alertbox/")) return u.match(/\/island-api\/alertbox\/[0-9a-f]+\/([a-z-]+)/)?.[1] ?? "island";
  if (u.includes("googleapis.com/youtube")) return "youtube";
  if (u.includes("script.google") || /\/undefined(\?|$)/.test(u)) return "sheet";
  if (/\/fx\/[^/?]+\.webm/.test(u)) return "fx-webm";
  if (u.includes("/alert/themes/")) return "theme";
  if (u.includes("cloudfront.net")) return "char";
  if (u.includes("/_expo/static/")) return "app";
  return "other";
}

async function setup(browser, { clock = false, net = null, scale = dpr }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  if (clock) await ctx.clock.install();
  await prism(ctx);
  const yt = (u) => {
    if (u.includes("/liveBroadcasts")) return { items: [{ id: "perf-video" }] };
    if (u.includes("/videos")) return { items: [{ liveStreamingDetails: { activeLiveChatId: "perf-chat" } }] };
    if (u.includes("/liveChat/messages")) return { items: [], pollingIntervalMillis: ytPoll, nextPageToken: "perf-next" };
    return {};
  };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body: charBody, headers: { ...cors, "cache-control": "public, max-age=3600" } });
    if (u.startsWith("https://www.googleapis.com/youtube/v3/")) {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      return r.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify(yt(u)) });
    }
    return u.startsWith("http://127.0.0.1") || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
  });
  const S = { sock: null, pings: 0 };
  await ctx.routeWebSocket(/doneru\.invalid/, (ws) => {
    S.sock = ws;
    ws.onMessage(() => S.pings++);
  });
  await ctx.addInitScript(PERF(fault));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  if (net) await cdp.send("Network.emulateNetworkConditions", net);
  /* 要求ごとの上り（URL・見出し・本文の概算）と、1秒ごとの下り */
  const N = { t0: null, reqs: [], down: new Map(), up: new Map(), phase: "open", themeName: null };
  cdp.on("Network.requestWillBeSent", (e) => {
    if (N.t0 == null) N.t0 = e.timestamp;
    const u = e.request.url;
    if (u.startsWith("data:") || u.startsWith("blob:")) return;
    const up = u.length + JSON.stringify(e.request.headers || {}).length + (e.request.postData ? Buffer.byteLength(e.request.postData) : 0) + 64;
    const s = Math.floor(e.timestamp - N.t0);
    N.up.set(s, (N.up.get(s) ?? 0) + up);
    N.reqs.push({ id: e.requestId, cat: catOf(u), t: e.timestamp, up, down: 0, phase: N.phase });
    const th = u.match(/\/alert\/themes\/([^/]+)\/fx\//)?.[1];
    if (th) N.themeName = th;
  });
  const byId = (id) => {
    for (let i = N.reqs.length - 1; i >= 0; i--) if (N.reqs[i].id === id) return N.reqs[i];
    return null;
  };
  cdp.on("Network.dataReceived", (e) => {
    if (N.t0 == null) return;
    const b = Math.max(e.encodedDataLength || 0, e.dataLength || 0);
    const s = Math.floor(e.timestamp - N.t0);
    N.down.set(s, (N.down.get(s) ?? 0) + b);
    const q = byId(e.requestId);
    if (q) q.down += b;
  });
  const bcdp = await browser.newBrowserCDPSession();
  return { ctx, page, cdp, bcdp, S, N };
}

/** プロセスの種類ごとの CPU 秒と RSS（Linux の /proc から） */
async function procs(bcdp) {
  const { processInfo } = await bcdp.send("SystemInfo.getProcessInfo");
  const cpu = {};
  const rss = {};
  for (const p of processInfo) {
    const k = p.type === "GPU" ? "gpu" : p.type === "browser" ? "browser" : p.type === "renderer" ? "renderer" : "other";
    cpu[k] = (cpu[k] ?? 0) + p.cpuTime;
    try {
      const kb = Number(readFileSync(`/proc/${p.id}/status`, "utf8").match(/VmRSS:\s+(\d+)/)?.[1] ?? 0);
      rss[k] = (rss[k] ?? 0) + kb * 1024;
    } catch {
      // /proc が無い OS では RSS を出さない
    }
  }
  return { cpu, rss: Object.keys(rss).length ? rss : null };
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

/** GC してから、ヒープ・DOM・生きている video・object URL を数える */
async function mem(env) {
  const { cdp, page, bcdp } = env;
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const h = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const proto = await cdp.send("Runtime.evaluate", { expression: "HTMLVideoElement.prototype", objectGroup: "perf-q" });
  const q = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId, objectGroup: "perf-q" });
  const v = await cdp.send("Runtime.callFunctionOn", {
    objectId: q.objects.objectId,
    functionDeclaration: "function(){const c=this.filter((v)=>v.isConnected).length;return {all:this.length,connected:c,detached:this.length-c,withSrc:this.filter((v)=>!!v.getAttribute('src')).length}}",
    returnByValue: true,
  });
  await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "perf-q" });
  const s = await page.evaluate(() => window.__perf.snap());
  const p = await procs(bcdp);
  return { heap: h.usedSize, nodes: dom.nodes, listeners: dom.jsEventListeners, videos: v.result.value, ...s, rss: p.rss };
}

const logsSince = (page, t) => page.evaluate((x) => window.__perf.logs.filter((l) => l.t >= x), t);

/** 投げ銭を1件流して、札が出て消えるまで待つ。描画の CPU・コマ・動画の落ち・頭のいちばん長いコマを返す */
async function oneAlert(env, amount, i, { frames = true } = {}) {
  const { page, cdp, bcdp, S } = env;
  const id = `perf-${i}-${amount}`;
  const t0 = await page.evaluate(() => performance.now());
  const m0 = await metrics(cdp);
  const p0 = await procs(bcdp);
  const w0 = Date.now();
  if (frames) await page.evaluate(() => window.__perf.frameStart());
  S.sock.send(JSON.stringify({ id, type: "donation", amount, assetID: null, message: MSG, messageType: 1, nickname: ROSTER[i % ROSTER.length].channelName, test: false }));
  const limit = Date.now() + (alertSec(amount) + 30) * 1000;
  let seen = false;
  for (;;) {
    const plate = await page.evaluate(() => !!document.querySelector('[data-plate="box"]'));
    if (plate) seen = true;
    if ((seen && !plate) || Date.now() > limit) break;
    await sleep(250);
  }
  const fr = frames ? await page.evaluate(() => window.__perf.frameStop()) : null;
  const m1 = await metrics(cdp);
  const p1 = await procs(bcdp);
  const sec = (Date.now() - w0) / 1000;
  await sleep(1500);
  const logs = await logsSince(page, t0);
  const recv = logs.find((l) => l.event === "notificationReceived");
  const plan = logs.find((l) => l.event === "fxPlan");
  const failed = logs.find((l) => l.event === "fxVideoFailed");
  const loaf = await page.evaluate((x) => window.__perf.loaf.filter((l) => l.t >= x), t0);
  const head = recv ? loaf.filter((l) => l.t >= recv.t && l.t <= recv.t + 3000) : [];
  return {
    amount, tier: tierOf(amount), sec, ended: seen,
    cpu: ((m1.ProcessTime - m0.ProcessTime) * 1000) / sec,
    main: ((m1.ThreadTime - m0.ThreadTime) * 1000) / sec,
    gpu: (((p1.cpu.gpu ?? 0) - (p0.cpu.gpu ?? 0)) * 1000) / sec,
    fps: fr && fr.frames > 1 ? (fr.frames - 1) / ((fr.last - fr.first) / 1000) : null,
    jank: fr?.jank ?? null, maxGap: fr?.maxGap ?? null, vDropped: fr?.dropped ?? 0, vTotal: fr?.total ?? 0,
    loafs: loaf.filter((l) => l.d > 50).length, headMax: head.reduce((a, l) => Math.max(a, l.d), 0),
    video: !!plan?.data?.video && !failed, plan: plan?.data ?? null, failed: failed?.data ?? null,
  };
}

async function waitSock(env) {
  for (const t = Date.now(); !env.S.sock && Date.now() - t < 120000; ) await sleep(200);
  if (!env.S.sock) throw new Error("どねるの WebSocket に繋がらなかった");
}

async function waitHeld(env, t0) {
  for (;;) {
    const h = await env.page.evaluate(() => window.__perf.logs.find((l) => l.event === "fxHeld"));
    if (h) return { ...h.data, sinceOpen: (Date.now() - t0) / 1000 };
    if ((Date.now() - t0) / 1000 > holdMax) return null;
    await sleep(500);
  }
}

const url = (base) => {
  const q = new URLSearchParams({ k: K });
  if (theme) q.set("theme", theme);
  return `${base}/alertbox/?${q}`;
};

/** 開き方 A: 回線を絞って開き、持ち切るまで → 待機 → 7段 */
async function openRun(browser, base) {
  const out = { err: null };
  const env = await setup(browser, { net: NET[netName] });
  try {
    const { page, cdp, bcdp, N, S } = env;
    const t0 = Date.now();
    await page.goto(url(base), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitSock(env);
    out.mem0 = await mem(env);
    out.held = await waitHeld(env, t0);
    const sOpen = Math.ceil((Date.now() - t0) / 1000);
    await sleep(5000);
    out.memHeld = await mem(env);
    const net = NET[netName];
    const secs = [...Array(sOpen + 1).keys()];
    const down = secs.map((s) => N.down.get(s) ?? 0);
    const up = secs.map((s) => N.up.get(s) ?? 0);
    out.net = {
      down: net?.downloadThroughput ?? null, up: net?.uploadThroughput ?? null,
      peakDown: Math.max(0, ...down), peakUp: Math.max(0, ...up),
      totalDown: down.reduce((a, b) => a + b, 0), totalUp: up.reduce((a, b) => a + b, 0),
      saturated: net ? down.filter((b) => b >= net.downloadThroughput * 0.9).length : 0,
      series: down,
    };
    out.theme = N.themeName;
    if (parts.includes("idle")) {
      N.phase = "idle";
      const a = await page.evaluate(() => window.__perf.snap());
      const m0 = await metrics(cdp);
      const p0 = await procs(bcdp);
      const w0 = Date.now();
      const r0 = N.reqs.length;
      const pings0 = S.pings;
      await sleep(idleSec * 1000);
      const sec = (Date.now() - w0) / 1000;
      const z = await page.evaluate(() => window.__perf.snap());
      const m1 = await metrics(cdp);
      const p1 = await procs(bcdp);
      const reqs = N.reqs.slice(r0);
      const byCat = {};
      for (const q of reqs) byCat[q.cat] = (byCat[q.cat] ?? 0) + 1;
      out.idle = {
        sec: Math.round(sec),
        cpu: ((m1.ProcessTime - m0.ProcessTime) * 1000) / sec,
        main: ((m1.ThreadTime - m0.ThreadTime) * 1000) / sec,
        gpu: (((p1.cpu.gpu ?? 0) - (p0.cpu.gpu ?? 0)) * 1000) / sec,
        rafPerSec: (z.raf - a.raf) / sec, timeoutsPerSec: (z.to - a.to) / sec, ivFiresPerSec: (z.ivFires - a.ivFires) / sec,
        intervals: z.ivs, anims: z.anims, animNames: z.animNames, smil: z.smil, playing: z.playing,
        reqPerHour: (reqs.length / sec) * 3600, byCat, pingsPerHour: ((S.pings - pings0) / sec) * 3600,
      };
    }
    if (parts.includes("tiers") || parts.includes("mem")) {
      N.phase = "alert";
      out.tiers = [];
      for (const [i, a] of amounts.entries()) {
        const r = await oneAlert(env, a, i);
        out.tiers.push(r);
        console.log(`段${r.tier} ${a}円: 描画 ${fmt(r.cpu, 0)} ms/秒・${fmt(r.fps, 0)} コマ/秒・50ms超 ${r.jank}・頭 ${fmt(r.headMax, 0)}ms・動画 ${r.video ? "○" : "×"}${r.failed ? ` ${JSON.stringify(r.failed)}` : ""}`);
      }
      await sleep(8000);
      out.memAfter = await mem(env);
    }
  } catch (e) {
    out.err = String(e).slice(0, 300);
  } finally {
    await env.ctx.close();
  }
  return out;
}

/** 開き方 B: 時計を入れて開き、時計を進めながら投げ銭を流す（待機中の通信と、長時間で増え続けないか） */
async function longRun(browser, base) {
  const out = { err: null, snaps: [] };
  const env = await setup(browser, { clock: true, net: null, scale: 1 });
  try {
    const { page, N, S } = env;
    const t0 = Date.now();
    await page.goto(url(base), { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitSock(env);
    out.held = await waitHeld(env, t0);
    await sleep(3000);
    const hooked = await page.evaluate(() => typeof window.__perf?.snap === "function");
    if (!hooked) throw new Error("面の中の見張りが入っていない");
    const step = 5000;
    const gap = (longHours * 3600e3) / longAlerts;
    let idleMs = 0;
    let pings = 0;
    const r0 = N.reqs.length;
    const want = parts.includes("long") ? longAlerts : 1;
    for (let i = 0; i < want; i++) {
      N.phase = "idle";
      const p0 = S.pings;
      for (let t = 0; t < gap; t += step) {
        await page.clock.runFor(step);
        await sleep(20);
      }
      await sleep(500);
      idleMs += gap;
      pings += S.pings - p0;
      if (!parts.includes("long")) break;
      N.phase = "alert";
      const a = amounts[i % amounts.length];
      const r = await oneAlert(env, a, i, { frames: false });
      const m = await mem(env);
      out.snaps.push({ ...m, hours: ((i + 1) * gap) / 3600e3, amount: a, video: r.video });
      console.log(`長時間 ${i + 1}/${want}（${fmt(((i + 1) * gap) / 3600e3, 1)} 時間）: ヒープ ${mb(m.heap)}MB・video ${m.videos.all}・URL ${m.urls}・setInterval ${m.intervals}・setTimeout ${m.timeouts}・節 ${m.nodes}`);
    }
    const idle = N.reqs.slice(r0).filter((q) => q.phase === "idle");
    const byCat = {};
    const total = { n: 0, up: 0, down: 0 };
    for (const q of idle) {
      const c = (byCat[q.cat] ??= { n: 0, up: 0, down: 0 });
      c.n++;
      c.up += q.up;
      c.down += q.down;
      total.n++;
      total.up += q.up;
      total.down += q.down;
    }
    out.req = { hours: idleMs / 3600e3, byCat, total, pings, ytPoll };
  } catch (e) {
    out.err = String(e).slice(0, 300);
  } finally {
    await env.ctx.close();
  }
  return out;
}

async function main() {
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
  console.log(`${prismNote()}・回線 ${netName}・対照 ${fault}・測る ${parts.join(",")}`);
  const r = { tool: "alert-perf", fault, parts, netName, size: `${W}×${H}`, dpr, prism: prismNote(), commit: process.env.GIT_SHA || null, errs: [] };
  try {
    if (parts.some((p) => ["mem", "net", "idle", "tiers"].includes(p))) {
      r.open = await openRun(browser, srv.base);
      r.theme = r.open.theme;
      if (r.open.err) r.errs.push(`開き方A: ${r.open.err}`);
    }
    if (parts.some((p) => ["req", "long"].includes(p))) {
      r.long = await longRun(browser, srv.base);
      r.theme ??= r.long.theme;
      if (r.long.err) r.errs.push(`開き方B: ${r.long.err}`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  r.rows = rows(r);
  const unknown = r.rows.some((x) => x.concern == null && x.value === "測れなかった");
  r.exit = unknown || r.errs.length ? 2 : r.rows.some((x) => x.concern === true) ? 1 : 0;
  const md = table(r.rows);
  console.log(`\n${md}`);
  if (r.errs.length) console.log("測れなかった:", r.errs);
  if (arg("json", "")) writeFileSync(resolve(arg("json", "")), JSON.stringify(r, null, 1));
  if (arg("md", "")) writeFileSync(resolve(arg("md", "")), md + "\n");
  process.exit(r.exit);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
