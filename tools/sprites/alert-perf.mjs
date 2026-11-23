/**
 * 投げ銭アラート（`app/alertbox`）の**性能の懸念**を、本番と同じ道で測って1枚の表にする。
 *
 *   cd tools/sprites
 *   node alert-perf.mjs --dist <書き出し> --json base.json --md base.md                    # 5項目ぜんぶ
 *   node alert-perf.mjs --dist <書き出し> --parts idle --fault raf --json raf.json         # 対照: 待機中に rAF を1本回す
 *   node alert-perf.mjs --dist <書き出し> --parts mem,tiers,long --fault leak --json leak.json  # 対照: Blob を手放さない
 *   node alert-perf.mjs --dist <書き出し> --parts mem,tiers,long --fault dom --json dom.json    # 対照: video を含む DOM を手放さない
 *   node alert-perf.mjs --combine base.json,raf.json,leak.json,dom.json --md perf.md       # 表と、対照が赤に変わったか
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
 * | idle | 待機の CPU と描画 | 投げ銭なしの `--idle` 秒（既定 60）。描画プロセスの `ProcessTime`・GPU プロセスの CPU 秒、rAF の呼び出し・setInterval・再生中の video の数、走っている動きのうち合成で済まないもの・見えない要素の上で回るもの。続けて、わざとの動き（貯金箱のマスコット）を止めた `--still` 秒（既定 30）の CPU。CPU の線はこちら |
 * | tiers | 投げ銭中の CPU と描画 | 7段を1件ずつ。CPU（ms/秒）・50ms を超えたコマの間・頭3秒のいちばん長いコマ（Long Animation Frame）・動画の落ちたコマ（`getVideoPlaybackQuality`） |
 * | req | 待機中の通信 | 時計を進めて（`clock.runFor`）`--long-hours` 時間ぶん。口ごとの回数とバイト/時。線は面が決めて叩く分（YouTube の外）。YouTube は API の間隔どおりかを別の行で |
 * | long | 長時間 | 同じ開き方で、時計を進めながら投げ銭を `--long-alerts` 件。1件ごとに GC してヒープ・video・Blob・タイマー・DOM が増え続けないか。最後に段2を1件流して、止まらずに動画で出るか（11/10 の配信で、開いて1時間34分後の段2が約2.45秒止まった） |
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
 * 島の投げ銭の購読（Firestore の WebChannel。#1405）も手元の偽物が受ける（`firestoreFake`）。1枚は「まだ無い」で返すので、
 * 面は控えるだけで何も出さない。数えるのは「つなぎっぱなしが何本か・待機中に新しく開いた要求」（行 `req.firestore`）。
 * 名簿は3人の偽物（名前は「テスト1〜3」・絵は `--char`）。**視聴者さんの名前も本物のキャラ絵も使わない。**
 *
 * ## 対照（`--fault`。見張りが「落ちるときに落ちる」かを見る）
 *
 * - `raf` … 面を開いたら rAF の輪を1本回し続ける → 行 `idle.raf` が懸念ありに変わる。同じ回で、`visibility: hidden` の要素の上に
 *   transform だけの動きを1本、終わりなく回す → 行 `idle.anim` が懸念ありに変わる（#1160 で見つけた形。城のピポが門に入って
 *   隠れているあいだ、隠れた体の上で息が回り続けていた。待機の無駄を見る2本なので、1回にまとめて回す）
 * - `leak` … 投げ銭を受けるたびに 1MB の Blob の object URL を作って手放さない → 行 `mem.urlleak` と `long.blob` が懸念ありに変わる
 * - `dom` … 投げ銭を受けるたびに、`<video>` 1本と 300 節の DOM の枝を作って、外したまま握る → 行 `long.dom`・`long.video`・`mem.video`
 *   が懸念ありに変わる（#1175 で見つけた漏れと同じ形。react-native-web の `Animated` が描いた回の props を握り、段の動画の
 *   `<video>` と再生器の影の DOM が投げ銭1件ごとに残っていた。`docs/island-misses.md`）
 *
 * 終了コード: 0 = 懸念なし / 1 = 懸念あり（`--combine` では、対照が懸念ありに変わらなかった） / 2 = 測れなかった
 */
import { createServer } from "node:http";
import { createServer as createHttps } from "node:https";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { gzipSync } from "node:zlib";

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
  /** 面が自分で決めて叩く分（YouTube の外）。10 秒に1回 */
  reqPerHour: 360,
  kbPerHour: 1024,
  /** YouTube を API の間隔より何倍まで叩いてよいか（読み直しの1回ぶんの揺れ） */
  ytOver: 1.15,
  /** 島の投げ銭の購読（Firestore）が、待機中に新しく開いてよい要求（つなぎっぱなしの1本は数えない） */
  fsReopenPerHour: 1,
  jank: 3,
  headFrameMs: 200,
  dropped: 0.05,
  longHeapMB: 5,
  longNodes: 200,
  longListeners: 50,
  /** 長時間のあとの段で「止まった」とみなすコマの間（11/10 は約 2,450ms） */
  stallMs: 1000,
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
    const J = A.js;
    if (J) {
      /* 書き出しの大きさ（#1405 で Firestore の SDK を `import()` で足した。増えた分を master と並べて読むための行。線は引かない）。
         縮めては gzip（Hosting が配るときの形に近い）。開いて読んだ分は、アラートの面が開いてから持ち切るまでに取りにいった JS */
      const kb = (b) => fmt(b / 1024, 0);
      row("net.js", "回線: JS（書き出しの `_expo/static/js`）",
        `開いて読んだ ${kb(J.read.raw)} KB（縮めて ${kb(J.read.gz)} KB・${J.read.n} 本）／書き出しの全部 ${kb(J.all.raw)} KB（縮めて ${kb(J.all.gz)} KB・${J.all.n} 本）`,
        "（参考。master と比べる）", null, J.read.names.join(" "));
    }
  }
  if (r.parts.includes("idle") && A) {
    const I = A.idle;
    if (!I) row("idle.cpu", "待機: CPU", "測れなかった", "—", null, A?.err ?? "");
    else {
      /* 線は「わざとの動きを止めたとき」に引く。貯金箱のマスコットは待機中ずっと動いているのが仕様で（transform と opacity だけ。
         下の idle.anim が見る）、その分はソフトウェアの合成（SwiftShader）では重く出る。止めて残る分が、止まっている面の無駄 */
      const St = I.still;
      row("idle.cpu", `待機: CPU（${I.sec} 秒）`,
        `描画 ${fmt(I.cpu)}・メイン ${fmt(I.main)}・GPU ${fmt(I.gpu)} ms/秒` + (St ? `（わざとの動き ${St.held} 本を止めた ${St.sec} 秒: 描画 ${fmt(St.cpu)}・メイン ${fmt(St.main)}・GPU ${fmt(St.gpu)}）` : ""),
        `わざとの動きを止めて 描画 ${LINES.idleCpu} ms/秒 以下`, (St ? St.cpu : I.cpu) > LINES.idleCpu);
      row("idle.raf", "待機: rAF の呼び出し", `${fmt(I.rafPerSec, 1)} 回/秒`, `${LINES.idleRaf} 回/秒 以下（0 が基準）`, I.rafPerSec > LINES.idleRaf);
      const iv = Object.entries(I.intervals).sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}ms×${c}`).join("・") || "なし";
      const short = Object.entries(I.intervals).filter(([d]) => Number(d) < LINES.shortInterval).reduce((a, [, c]) => a + c, 0);
      row("idle.interval", "待機: 回っている setInterval", iv, `${LINES.shortInterval}ms 未満が 0`, short > 0, `setTimeout ${fmt(I.timeoutsPerSec, 1)} 回/秒`);
      /* 走っている動きのうち、合成だけで描けないもの（transform・opacity の外を動かす）と、見えない要素の上で回っているもの。
         transform・opacity だけで見える要素を動かすのは、わざとの動き（数は下に添える）。
         合成で済まない・見えないの2つは、待機のあいだ1秒ごとに数えたうちの最大（終わりの1回だけだと、貯金箱のマスコットが
         門に入って隠れている数秒に当たるかがくじになる。#1160 の城のピポがそれで、隠れた体の上で息が回り続けていた） */
      const heavy = Math.max(I.animsHeavy ?? I.anims, I.seen?.heavy ?? 0);
      const hidden = Math.max(I.animsHidden ?? 0, I.seen?.hidden ?? 0);
      const light = Math.max(0, I.anims - (I.animsHeavy ?? I.anims) - (I.animsHidden ?? 0));
      row("idle.anim", "待機: 合成で済まない動き・見えないのに回る動き・SMIL・再生中の video", `${heavy}・${hidden}・${I.smil}・${I.playing}`, "0・0・0・0",
        heavy + hidden + I.smil + I.playing > 0,
        `走っている動き ${I.anims} 本（終わりの時点。transform・opacity だけで見えている ${light} 本はわざとの動き）` +
          (I.seen ? `・待機のあいだ ${I.seen.n} 回数えた最大` : "") +
          (I.seen?.what?.length ? `・見えないのに回る: ${I.seen.what.join(" / ")}` : "") +
          (I.animNames.length ? `・名前: ${I.animNames.join(" ")}` : ""));
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
      /* 線を引くのは**面が自分で決めて叩く分**（もう一度出して・名簿・ログ…）。YouTube は API が返す pollingIntervalMillis に
         従う決まり（`connectors/YouTubeConnector.ts`）で、回数はこちらで決めない。そちらは「API の言うとおりか」を別の行で見る
         （前は合わせて 360 回/時の線を引いていて、API の間隔が 5 秒の日は YouTube だけで 1,440 回/時になり、何を直しても赤だった） */
      /* Firestore（島の投げ銭の購読）も面が決めて叩くものではない（SDK がつなぎっぱなしを持つ）。下の行 `req.firestore` で別に見る */
      const own = Object.entries(q.byCat).filter(([c]) => !c.startsWith("youtube") && !c.startsWith("firestore"));
      const parts = own.sort((a, b) => b[1].n - a[1].n).map(([c, v]) => `${c} ${fmt(v.n / q.hours, 0)}`).join("・") || "なし";
      const n = own.reduce((a, [, v]) => a + v.n, 0) / q.hours;
      const kb = own.reduce((a, [, v]) => a + v.up + v.down, 0) / 1024 / q.hours;
      row("req.hour", `待機中の通信: 面が決めて叩く分（${fmt(q.hours, 1)} 時間ぶん時計を進めて）`, `${fmt(n, 0)} 回/時・${fmt(kb, 0)} KB/時（${parts}）`,
        `${LINES.reqPerHour} 回/時・${LINES.kbPerHour} KB/時 以下`, n > LINES.reqPerHour || kb > LINES.kbPerHour,
        `どねるの ping ${fmt(q.pings / q.hours, 0)} 回/時（WebSocket）`);
      const yt = q.byCat.youtube ?? { n: 0, up: 0, down: 0 };
      const ytPre = q.byCat["youtube:下見"] ?? { n: 0, up: 0, down: 0 };
      const ytN = yt.n / q.hours;
      const ytWant = 3600e3 / q.ytPoll;
      row("req.youtube", "待機中の通信: YouTube の読み（API が返す間隔どおりか）",
        `読み ${fmt(ytN, 0)} 回/時・下見 ${fmt(ytPre.n / q.hours, 0)} 回/時・${fmt((yt.up + yt.down + ytPre.up + ytPre.down) / 1024 / q.hours, 0)} KB/時`,
        `読みが API の間隔（${q.ytPoll}ms → ${fmt(ytWant, 0)} 回/時）の ${LINES.ytOver} 倍以内`, ytN > ytWant * LINES.ytOver,
        "pollingIntervalMillis は YouTube が決める。こちらが縮めて叩いていないかだけを見る。下見（CORS の preflight）は Authorization を付けて読むぶん、読みと同じ数だけ付く");
      /* 島の投げ銭の購読（#1405・決定の記録 0017）。足してよいのは「つなぎっぱなしの1本」だけで、待機中に新しく開く要求は増やさない。
         面が購読を始めた（`islandConnectorStarted`）のに1本もつながっていなければ懸念（書き出しの塊が落ちない・SDK が落ちた） */
      const f = q.fs;
      const fsN = (q.byCat.firestore?.n ?? 0) + (q.byCat["firestore:下見"]?.n ?? 0);
      if (!f?.started) row("req.firestore", "待機中の通信: 島の投げ銭の購読（Firestore）", "購読していない（島の投げ銭を受けない書き出し）", "—", null);
      else
        row("req.firestore", "待機中の通信: 島の投げ銭の購読（Firestore のつなぎっぱなし）",
          `つなぎっぱなし ${f.open} 本・待機中に新しく開いた要求 ${fmt(fsN / q.hours, 1)} 回/時・下り ${fmt(f.idleDown / 1024 / q.hours, 1)} KB/時`,
          `つなぎっぱなし 1 本・新しく開く要求 ${LINES.fsReopenPerHour} 回/時 以下`, f.open !== 1 || fsN / q.hours > LINES.fsReopenPerHour,
          `握手 ${f.handshakes} 回・下りを開いた ${f.backs} 回（開いてから終わりまで）。下りはサーバーの noop（30 秒ごと。本物と同じ間）。` +
            "noop を流さずに偽の時計だけ進めると、SDK は 45 秒ごとに開き直す（約 80 回/時。手元で確かめた）");
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
      const Z = B.late;
      if (Z) {
        const drop = Z.vTotal ? Z.vDropped / Z.vTotal : 0;
        row("long.late", `長時間のあと: 段${Z.tier}（${fmt(Z.hours, 1)} 時間・投げ銭 ${Z.after} 件のあと）`,
          `コマの間の最長 ${fmt(Z.maxGap, 0)}ms・長いコマ（LoAF）最長 ${fmt(Z.loafMax, 0)}ms・50ms超 ${Z.loaf50}・動画の落ち ${Z.vTotal ? `${fmt(drop * 100, 1)}%` : "—"}・動画 ${Z.video ? "○" : "×"}`,
          `止まり（コマの間 ${LINES.stallMs}ms 超）なし・落ち ${LINES.dropped * 100}% 以下・動画で出る`,
          !Z.video || (Z.maxGap ?? 0) > LINES.stallMs || drop > LINES.dropped,
          "11/10 の配信で、開いて1時間34分後の段2の登場で描くことが約2.45秒止まった。時計は偽物（runFor）なので、コマの間は偽の時計の rAF・LoAF は描画の側の数");
      }
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
  { fault: "raf", what: "待機中に、見えない要素の上で動きを1本回す（合成だけで回る transform）", ids: ["idle.anim"] },
  { fault: "leak", what: "投げ銭ごとに 1MB の Blob を作って手放さない", ids: ["mem.urlleak", "long.blob"] },
  { fault: "dom", what: "投げ銭ごとに video を含む DOM の枝（300 節）を外したまま握る", ids: ["long.dom", "long.video", "mem.video"] },
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
if (!["none", "raf", "leak", "dom"].includes(fault)) die(`--fault は none・raf・leak・dom（${fault}）`);
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
/** わざとの動きを止めて測る秒（待機の CPU の線はこちら） */
const stillSec = Number(arg("still", "30"));
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
/** 長時間のあとに流す額（段2。11/10 に止まった段） */
const LATE_YEN = 300;
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

/* ------------------------------------------------------------------ 島の投げ銭の購読（Firestore）の偽物 */

/* 島の投げ銭は、アラートの面が Firestore の SDK で `islandAlertFeed/{合言葉}` をリアルタイムに購読する（#1405・決定の記録 0017）。
   SDK は WebChannel（`/google.firestore.v1.Firestore/Listen/channel`）で、握手の POST を1本と、下りをつなぎっぱなしにする
   GET（backchannel）を1本開く。サーバーは握手の答えで keepalive の間（30 秒）を言い、その間ごとに noop を流す。
   SDK は 1.5 倍（45 秒）何も来なければ、下りを切って開き直す。ここは同じことを手元でやる:

   - ブラウザに `firestore.googleapis.com` を手元の https（その場で作る自己署名）へ向けさせる（`--host-resolver-rules` と
     `ignoreHTTPSErrors`）。route で受けると答えを1回で返すしかなく、つなぎっぱなしにできない
   - 1枚は「まだ無い」で返す（面は控えるだけで何も出さない）。投げ銭の演出は今までどおり どねるの口から流す
   - noop は本物の時計で 30 秒ごと（開き方 A）と、偽の時計を進めた 25 秒ごと（開き方 B。`tick`）。偽の時計だけ進めて noop を
     流さないと、SDK は 45 秒（偽）ごとに開き直し、待機の通信が約 80 回/時に見える（手元で確かめた。本物では起きない形）
   - 数えるのは CDP（要求ごと）。ここは答えるだけ */
const FS_KEEPALIVE_MS = 30000;
async function firestoreFake() {
  const dir = mkdtempSync(join(tmpdir(), "alert-perf-fs-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
    "-days", "2", "-subj", "/CN=firestore.googleapis.com"], { stdio: "ignore" });
  /* WebChannel の1塊は「長さ\n本文」。長さは字の数なので、ASCII の外は \u で書いてバイトと字を揃える */
  const chunk = (arr) => {
    const p = JSON.stringify(arr).replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    return `${p.length}\n${p}`;
  };
  const sessions = new Map();
  const S = { handshakes: 0, backs: 0 };
  let n = 0;
  const srv = createHttps({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const u = new URL(req.url, "https://firestore.googleapis.com");
    const q = u.searchParams;
    const head = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-store",
      "access-control-allow-origin": req.headers.origin || "*", "access-control-allow-credentials": "true" };
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.method === "OPTIONS") return void res.writeHead(204, { ...head, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST" }).end();
      if (!u.pathname.endsWith("/Listen/channel") || q.get("TYPE") === "terminate") return void res.writeHead(200, head).end();
      const sid = q.get("SID");
      if (req.method === "POST" && !sid) {
        /* 握手。最初の1通（addTarget）が本文に乗っている。その targetId で答える */
        let tid = null;
        try {
          tid = JSON.parse(new URLSearchParams(body).get("req0___data__") ?? "{}").addTarget?.targetId ?? null;
        } catch {
          // 読めなければ答えない（下りで何も流さない）
        }
        const id = `perf-${++n}`;
        sessions.set(id, { aid: 0, tid, started: false, back: null });
        S.handshakes++;
        return void res.writeHead(200, head).end(chunk([[0, ["c", id, "", 8, 14, FS_KEEPALIVE_MS]]]));
      }
      const s = sessions.get(sid);
      if (!s) return void res.writeHead(400, head).end();
      if (req.method === "POST") return void res.writeHead(200, head).end(chunk([1, s.aid, 0]));
      /* 下り。つなぎっぱなしにする。開き直されたら、続きから流す（ADD は1回だけ） */
      S.backs++;
      res.writeHead(200, head);
      s.back = res;
      res.on("close", () => {
        if (s.back === res) s.back = null;
      });
      if (s.started || s.tid == null) return;
      s.started = true;
      const tok = Buffer.from(`perf-${Date.now()}`).toString("base64");
      const at = new Date().toISOString();
      res.write(chunk([
        [++s.aid, [{ targetChange: { targetChangeType: "ADD", targetIds: [s.tid] } }]],
        [++s.aid, [{ targetChange: { targetChangeType: "CURRENT", targetIds: [s.tid], resumeToken: tok, readTime: at } }]],
        [++s.aid, [{ targetChange: { resumeToken: tok, readTime: at } }]],
      ]));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const noop = () => {
    for (const s of sessions.values()) if (s.back) s.back.write(chunk([[++s.aid, ["noop"]]]));
  };
  const iv = setInterval(noop, FS_KEEPALIVE_MS);
  let since = 0;
  return {
    port: srv.address().port,
    S,
    /** 偽の時計を `ms` 進めた（開き方 B）。25 秒ごとに noop（本物の 30 秒より早め。届くまでの本物の時間のぶん） */
    tick(ms) {
      since += ms;
      if (since >= FS_KEEPALIVE_MS - 5000) {
        since = 0;
        noop();
      }
    },
    close() {
      clearInterval(iv);
      for (const s of sessions.values()) s.back?.end();
      srv.close();
    },
  };
}
/** main で立てる（開き方 B が偽の時計を進めるたびに `tick` を呼ぶ） */
let FS = null;

/* 面の中の見張り。**数えるだけで、面の動きは変えない**（数える道具が rAF や setInterval を足すと、それ自体が数に入るので、
   こちらの輪は差し替える前の本物で回す）。ログは要る出来事だけ持つ（長時間で、こちらの控えがヒープを太らせないように） */
const PERF = (fault) => `(() => {
  const W = window;
  const P = (W.__perf = { raf: 0, to: 0, ivFires: 0, iv: new Map(), pend: new Set(), urls: new Map(), made: 0, freed: 0, logs: [], nlog: 0, loaf: [], fr: null });
  const KEEP = new Set(["mount", "initSuccess", "fxHeld", "fxPlan", "fxPrepLate", "fxVideoFailed", "notificationReceived", "notificationDisplayed", "islandConnectorStarted", "islandFeedError"]);
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
  /* 待機の CPU のうち、わざとの動きでない分を測るための「止める」。止めているあいだだけ、走っている動きと新しく
     作られた動きを止め、明けたら流し直す（止めていないあいだは何もしない。面の動きは変えない） */
  const EA = Element.prototype.animate;
  P.held = null;
  Element.prototype.animate = function () {
    const x = EA.apply(this, arguments);
    if (P.held) { try { x.pause(); P.held.push(x); } catch (e) {} }
    return x;
  };
  P.still = (on) => {
    if (on) {
      P.held = document.getAnimations().filter((a) => a.playState === "running");
      P.held.forEach((a) => a.pause());
      return P.held.length;
    }
    const h = P.held || [];
    P.held = null;
    h.forEach((a) => { try { a.play(); } catch (e) {} });
    return h.length;
  };
  const L = console.log;
  console.log = function (...a) {
    try {
      const s = a[0];
      if (typeof s === "string" && s.charAt(0) === "{" && s.indexOf('"AlertBox"') > 0) {
        const j = JSON.parse(s);
        P.nlog++;
        if (KEEP.has(j.event)) P.logs.push({ t: performance.now(), event: j.event, data: j.event === "fxPlan" || j.event === "fxHeld" || j.event === "fxVideoFailed" || j.event === "fxPrepLate" ? j.data : null });
        if (${JSON.stringify(fault)} === "leak" && j.event === "notificationReceived") URL.createObjectURL(new Blob([new Uint8Array(1 << 20)]));
        if (${JSON.stringify(fault)} === "dom" && j.event === "notificationReceived") {
          const d = document.createElement("div");
          d.appendChild(document.createElement("video"));
          for (let i = 0; i < 299; i++) d.appendChild(document.createElement("span"));
          (P.domLeak ||= []).push(d);
        }
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
    const hide = () => {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none";
      d.setAttribute("data-perf-fault", "hidden");
      document.body.appendChild(d);
      d.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }], { duration: 2600, iterations: Infinity });
    };
    if (document.body) hide();
    else document.addEventListener("DOMContentLoaded", hide);
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
  /* 走っている動き。合成だけで描けるか（transform・opacity だけを動かす）と、見えない要素の上で回っていないか。
     見えない上で回っているものは、何かが分かるように短く書く（要素・いちばん近い data-* の印・動かす値・長さ×回数） */
  P.animScan = () => {
    let anims = [];
    try { anims = document.getAnimations().filter((a) => a.playState === "running"); } catch (e) {}
    const names = [...new Set(anims.map((a) => a.animationName || a.transitionProperty || a.id || "waapi"))].slice(0, 6);
    const LIGHT = ["transform", "opacity", "translate", "scale", "rotate"];
    /* 見えるか。visibility: hidden の要素でも、中に visible の子がいれば、その子は描かれて動きにつれて動く（城の屋根ごしの
       ピポは、首をかしげる枠の中の絵が自分で visible を持つ。しかも Chrome は動いている枠の visibility を古い hidden の
       まま返すことがある）。要素と、その中の全部が見えないときだけ「見えないのに回る」 */
    const seenBy = (el) => !el.checkVisibility || el.checkVisibility({ visibilityProperty: true });
    const shows = (el) => seenBy(el) || [...el.querySelectorAll("*")].some(seenBy);
    let heavy = 0, hidden = 0;
    const what = [];
    for (const a of anims) {
      let ks = [];
      try { ks = a.effect.getKeyframes(); } catch (e) {}
      const props = new Set();
      for (const k of ks) for (const x of Object.keys(k)) if (!["offset", "computedOffset", "easing", "composite"].includes(x)) props.add(x);
      if ([...props].some((x) => !LIGHT.includes(x))) heavy++;
      const t = a.effect && a.effect.target;
      const gone = t && !t.isConnected;
      if (t && (gone || !shows(t))) {
        hidden++;
        let mark = "";
        for (let up = t; up && !mark; up = up.parentElement) {
          const d = [...up.attributes].find((x) => x.name.startsWith("data-"));
          if (d) mark = up === t ? "[" + d.name + "]" : "[" + d.name + "] の中";
        }
        let tm = {};
        try { tm = a.effect.getTiming(); } catch (e) {}
        what.push(t.tagName.toLowerCase() + (mark ? "（" + mark + "）" : "") + " " + [...props].join("+") + " " + tm.duration + "ms×" + (tm.iterations === Infinity ? "∞" : tm.iterations) + (gone ? "・外れた要素" : ""));
      }
    }
    return { n: anims.length, names, heavy, hidden, what };
  };
  P.snap = () => {
    const ivs = {};
    for (const d of P.iv.values()) ivs[d] = (ivs[d] || 0) + 1;
    let urlBytes = 0;
    for (const b of P.urls.values()) urlBytes += b;
    const A = P.animScan();
    const vids = [...document.querySelectorAll("video")];
    return {
      now: performance.now(), raf: P.raf, to: P.to, ivFires: P.ivFires, intervals: P.iv.size, ivs, timeouts: P.pend.size,
      urls: P.urls.size, urlBytes, made: P.made, freed: P.freed, anims: A.n, animNames: A.names, animsHeavy: A.heavy, animsHidden: A.hidden,
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
  if (u.startsWith("https://firestore.googleapis.com/")) return "firestore";
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
  /* ignoreHTTPSErrors は、手元の偽の Firestore（自己署名）に向けるため。ほかの口は http か route で受けている */
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale, ignoreHTTPSErrors: true });
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
    /* Firestore は route で答えない（つなぎっぱなしにできない）。ブラウザの名前解決で手元の偽物へ行く（firestoreFake） */
    if (u.startsWith("https://firestore.googleapis.com/") && FS) return r.continue();
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
  const N = { t0: null, reqs: [], down: new Map(), up: new Map(), phase: "open", themeName: null, fsIdleDown: 0 };
  cdp.on("Network.requestWillBeSent", (e) => {
    if (N.t0 == null) N.t0 = e.timestamp;
    const u = e.request.url;
    if (u.startsWith("data:") || u.startsWith("blob:")) return;
    const up = u.length + JSON.stringify(e.request.headers || {}).length + (e.request.postData ? Buffer.byteLength(e.request.postData) : 0) + 64;
    const s = Math.floor(e.timestamp - N.t0);
    N.up.set(s, (N.up.get(s) ?? 0) + up);
    /* 下見（CORS の preflight）は口の名前に「:下見」を付けて分ける。YouTube は Authorization を付けて読むので、読みのたびに
       下見が1本付く（本物でも同じ。googleapis.com は max-age 3600 を返すが、控えの鍵は URL ごとで、pageToken が毎回替わる） */
    const pre = e.initiator?.type === "preflight" || e.type === "Preflight";
    const cat = catOf(u);
    N.reqs.push({ id: e.requestId, cat: cat + (pre ? ":下見" : ""), t: e.timestamp, up, down: 0, phase: N.phase, done: false, path: cat === "app" ? new URL(u).pathname : null });
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
    /* 島の投げ銭の購読の下り（つなぎっぱなしの1本に、待機中に流れてくる noop）。要求は開いたときの phase で括るので、ここで足す */
    if (q?.cat === "firestore" && N.phase === "idle") N.fsIdleDown += b;
  });
  const end = (e) => {
    const q = byId(e.requestId);
    if (q) q.done = true;
  };
  cdp.on("Network.loadingFinished", end);
  cdp.on("Network.loadingFailed", end);
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

/** 書き出しの JS の大きさ（素と gzip）。`read` は面が取りにいった分、`all` は `_expo/static/js` の全部 */
function jsSizes(paths) {
  const size = (f) => {
    try {
      const b = readFileSync(f);
      return { raw: b.length, gz: gzipSync(b).length };
    } catch {
      return null;
    }
  };
  const sum = (files) => files.reduce((a, f) => {
    const z = size(f);
    return z ? { raw: a.raw + z.raw, gz: a.gz + z.gz, n: a.n + 1 } : a;
  }, { raw: 0, gz: 0, n: 0 });
  const uniq = [...new Set(paths)].filter((p) => p.endsWith(".js"));
  const read = sum(uniq.map((p) => normalize(join(dist, p))).filter((f) => f.startsWith(dist)));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
  const root = join(dist, "_expo/static/js");
  const all = existsSync(root) ? sum(walk(root)) : { raw: 0, gz: 0, n: 0 };
  return { read: { ...read, names: uniq.map((p) => p.split("/").pop()) }, all };
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
    out.js = jsSizes(N.reqs.filter((q) => q.cat === "app" && q.path).map((q) => q.path));
    if (parts.includes("idle")) {
      N.phase = "idle";
      const a = await page.evaluate(() => window.__perf.snap());
      const m0 = await metrics(cdp);
      const p0 = await procs(bcdp);
      const w0 = Date.now();
      const r0 = N.reqs.length;
      const pings0 = S.pings;
      /* 動きは1秒ごとに数えて最大を取る（終わりの1回だけだと、隠れた要素の上で回るのが数秒だけのときに、当たるかがくじになる） */
      const seen = { n: 0, heavy: 0, hidden: 0, what: new Set() };
      for (const tEnd = w0 + idleSec * 1000; Date.now() < tEnd; ) {
        await sleep(Math.min(1000, Math.max(0, tEnd - Date.now())));
        const s = await page.evaluate(() => window.__perf.animScan()).catch(() => null);
        if (!s) continue;
        seen.n++;
        seen.heavy = Math.max(seen.heavy, s.heavy);
        seen.hidden = Math.max(seen.hidden, s.hidden);
        s.what.forEach((x) => seen.what.add(x));
      }
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
        intervals: z.ivs, anims: z.anims, animNames: z.animNames, animsHeavy: z.animsHeavy, animsHidden: z.animsHidden, smil: z.smil, playing: z.playing,
        seen: { n: seen.n, heavy: seen.heavy, hidden: seen.hidden, what: [...seen.what].slice(0, 4) },
        reqPerHour: (reqs.length / sec) * 3600, byCat, pingsPerHour: ((S.pings - pings0) / sec) * 3600,
      };
      /* わざとの動き（貯金箱のマスコットの息・旗・歩き）を止めて、もう一度。線はこちらに引く（残りは、止まっているはずの面が
         使っている CPU）。明けたら流し直す（次の投げ銭の段に響かせない） */
      const held = await page.evaluate(() => window.__perf.still(true));
      const s0 = await metrics(cdp);
      const q0 = await procs(bcdp);
      const v0 = Date.now();
      await sleep(stillSec * 1000);
      const ssec = (Date.now() - v0) / 1000;
      const s1 = await metrics(cdp);
      const q1 = await procs(bcdp);
      await page.evaluate(() => window.__perf.still(false));
      out.idle.still = {
        sec: Math.round(ssec), held,
        cpu: ((s1.ProcessTime - s0.ProcessTime) * 1000) / ssec,
        main: ((s1.ThreadTime - s0.ThreadTime) * 1000) / ssec,
        gpu: (((q1.cpu.gpu ?? 0) - (q0.cpu.gpu ?? 0)) * 1000) / ssec,
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
        FS?.tick(step);
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
    /* 開きっぱなしのあとの段2。11/10 の配信で、開いて1時間34分後の段2の登場で描くこと自体が約2.45秒止まった。
       長く開いたあと（ここまでの投げ銭のあと）に、段2が止まらずに動画で出るかを見る。
       時計は偽物（runFor で進めた）なので、コマの間は偽の時計の rAF で、長いコマは描画の側の数（Long Animation Frame）で読む。
       LoAF の startTime は本物の時計なので、時刻で切らずに、この1件のあいだに来た分だけを読む */
    if (parts.includes("long") && out.snaps.length) {
      N.phase = "idle";
      const p0 = S.pings;
      for (let t = 0; t < gap; t += step) {
        await page.clock.runFor(step);
        FS?.tick(step);
        await sleep(20);
      }
      await sleep(500);
      idleMs += gap;
      pings += S.pings - p0;
      N.phase = "alert";
      await page.evaluate(() => (window.__perf.loaf = []));
      const r = await oneAlert(env, LATE_YEN, want, { frames: true });
      const lo = await page.evaluate(() => window.__perf.loaf.map((l) => l.d));
      out.late = { ...r, hours: ((want + 1) * gap) / 3600e3, after: want, loafMax: lo.reduce((a, d) => Math.max(a, d), 0), loaf50: lo.filter((d) => d > 50).length };
      console.log(`長時間のあと 段${r.tier}: コマの間の最長 ${fmt(r.maxGap, 0)}ms・LoAF 最長 ${fmt(out.late.loafMax, 0)}ms・動画 ${r.video ? "○" : "×"}`);
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
    const started = await page.evaluate(() => window.__perf.logs.some((l) => l.event === "islandConnectorStarted"));
    out.req = {
      hours: idleMs / 3600e3, byCat, total, pings, ytPoll,
      fs: { started, open: N.reqs.filter((q) => q.cat === "firestore" && !q.done).length, idleDown: N.fsIdleDown, handshakes: FS?.S.handshakes ?? 0, backs: FS?.S.backs ?? 0 },
    };
  } catch (e) {
    out.err = String(e).slice(0, 300);
  } finally {
    await env.ctx.close();
  }
  return out;
}

async function main() {
  const srv = await serve();
  FS = await firestoreFake();
  const browser = await chromium.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required", `--host-resolver-rules=MAP firestore.googleapis.com 127.0.0.1:${FS.port}`],
  });
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
    FS.close();
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
