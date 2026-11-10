/**
 * `POST /island-api/alertbox/{合言葉}/log`（アラートのログの写し。#1160）の確かめ。
 * **偽の値だけで回す。** BigQuery にも Firestore にも1バイトも触らない。
 *
 * ## 何を守っているか
 *
 * 誰でも叩ける口（OBS はログインできないので、合言葉を知っていることが鍵）。
 * 狙われるのは3つで、**どれも「書き込み0」と「Firestore を引かない」まで見る。**
 *
 * | 悪用 | 断り | 見るもの |
 * | --- | --- | --- |
 * | 知らない出来事の名前 | 400 | 書き込み0・合言葉を引かない |
 * | 大きい1行 | 413 | 同じ |
 * | 大量に送る（1つの送り元・口ぜんぶ・1日） | 429 | 上限ちょうどで止まる |
 * | 知らない合言葉 | 404 | 書き込み0 |
 *
 * あわせて、**面（`lib/log.ts`）と口が同じ名前の並び・同じ大きさの上限を
 * 持っているか**を見る（2か所に別の数を置かない）。
 *
 * ## 先に「通る」ことを見る（`docs/island-standards.md` §15）
 *
 * 偽物が壊れていると全部が断られて「守れている」に見える。最初に、正しい1行が
 * 204 で通り、表の形になって入ることを見る。通らなければ 2 で落ちる。
 *
 * ## 対照
 *
 * 書き出した `lib/alertLog.js` の守りを1本ずつ外した写しで回して、
 * **狙った行だけが赤くなる**ことを見る（`BREAKS`）。当たらない細工は 2。
 *
 * 回しかた:
 *
 * ```bash
 * node functions/selftest/alert_log_selftest.mjs
 * ```
 *
 * 0=通った / 1=落ちた / 2=確かめられなかった
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import Module from "node:module";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const ROOT = join(FUNCTIONS, "..");

/**
 * 確かめられないまま終わる。**数字を1つも出さずに落ちる。**
 * @param {string} why 何が無かったか
 */
function nothing(why) {
  console.error(`確かめられない: ${why}`);
  process.exit(2);
}

console.log("# tsc を回して、いまの src から書き出す");
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});
const SRC = readFileSync(join(FUNCTIONS, "lib/alertLog.js"), "utf8");

/* ログは手元で拾う。**本物の logger を通さない**（字を見るため） */
const LOGS = [];
globalThis.__alertLogFakeFF = {
  logger: {
    info: (...a) => LOGS.push(a.map(String).join(" ")),
    warn: (...a) => LOGS.push(a.map(String).join(" ")),
    error: (...a) => LOGS.push(a.map(String).join(" ")),
  },
};
const FF = 'require("firebase-functions")';
if (!SRC.includes(FF)) nothing("lib/alertLog.js が firebase-functions を読んでいない");

/**
 * 書き出した字から、モジュールを1つ組み立てる（ファイルは書かない）。
 * @param {string} src 字
 * @param {string} tag 名前（写しごとに変える）
 * @return {object} exports
 */
function load(src, tag) {
  const filename = join(FUNCTIONS, "lib", `alertLog.${tag}.js`);
  const m = new Module(filename);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(dirname(filename));
  m._compile(src.replace(FF, "globalThis.__alertLogFakeFF"), filename);
  return m.exports;
}

/* ---------------- 守りを外す（対照） ---------------- */

/* 名前 → [当てる字, 置き換え, 赤くなるはずの行] */
const BREAKS = {
  nosize: [/if \(bytes > exports\.ALERT_LOG_MAX_BYTES\)/, "if (false)", "big"],
  noevent: [/if \(!EVENTS\.has\(event\)\)\s*return "unknown event";/, "", "event"],
  nominute: [/if \(n >= exports\.ALERT_LOG_PER_MIN\)\s*return "source";/, "", "minute"],
  noall: [/if \(allThisMinute >= exports\.ALERT_LOG_PER_MIN_ALL\)\s*return "busy";/, "", "all"],
  noexists: [/if \(!\(await deps\.exists\(k\)\)\)/, "if (false)", "exists"],
  noquota: [/if \(!\(await deps\.takeQuota\(/, "if (false && !(await deps.takeQuota(", "daily"],
  nosid: [/sid < Date\.UTC\(2020, 0, 1\)/, "false", "sid"],
};

/* ---------------- 偽物 ---------------- */

const K = "a".repeat(32);
const OTHER = "b".repeat(32);
const T0 = Date.UTC(2026, 10, 10, 13, 0, 5);

/**
 * 面が送るのと同じ形の1行（`lib/log.ts` の payload）。
 * @param {string} event 出来事
 * @param {object} data 中身
 * @return {object} 1行
 */
const line = (event, data = {}) => ({
  timestamp: new Date(T0).toISOString(),
  sessionId: T0 - 3600_000,
  screen: "AlertBox",
  event,
  gitCommit: "0123456789abcdef0123456789abcdef01234567",
  data,
});

/**
 * 1本ぶんの偽の口を組む。
 * @param {object} mod 組み立てたモジュール
 * @param {{quota?: number}} o 1日の枠をいくつにするか
 * @return {object} 叩く関数と数え
 */
function rig(mod, o = {}) {
  mod.resetAlertLogForTest();
  const st = {inserted: [], exists: 0, quota: 0, now: T0};
  const deps = {
    exists: async (k) => {
      st.exists += 1;
      return k === K;
    },
    takeQuota: async (_key, _kind, limit) => {
      st.quota += 1;
      return st.quota <= Math.min(limit, o.quota ?? limit);
    },
    insert: async (row, insertId) => {
      st.inserted.push({row, insertId});
    },
    now: () => st.now,
  };
  /**
   * 1回叩く。
   * @param {object} q method/path/body/bytes
   * @return {Promise<{handled: boolean, status: number}>} 結果
   */
  const hit = async (q) => {
    const r = {status: 200};
    const res = {
      set: () => res,
      status: (n) => {
        r.status = n;
        return res;
      },
      json: () => res,
      end: () => res,
    };
    const body = q.body;
    const bytes = q.bytes ?? Buffer.byteLength(JSON.stringify(body ?? {}));
    const handled = await mod.handleAlertLog(
      {method: q.method ?? "POST", path: q.path ?? `/alertbox/${K}/log`,
        body, bytes, ua: "Mozilla/5.0 (Linux; Android 14) wv"},
      res, deps);
    return {handled, status: r.status};
  };
  return {st, hit, deps};
}

/**
 * 守りの行をぜんぶ回す。名前 → 通ったか。
 * @param {object} mod 組み立てたモジュール
 * @return {Promise<Map<string, {ok: boolean, why: string}>>} 結果
 */
async function suite(mod) {
  const out = new Map();
  const put = (name, ok, why = "") => out.set(name, {ok: !!ok, why});

  // 通る（§15。ここが落ちたら他を数えない）
  {
    const {st, hit} = rig(mod);
    const data = {id: "LCC.x", type: "superchat", jpy: 2000,
      nickname: "にせものの名前", message: "にせもののひとこと", test: false};
    const r = await hit({body: line("notificationReceived", data)});
    const row = st.inserted[0]?.row;
    put("pass", r.handled && r.status === 204 && st.inserted.length === 1 &&
      row.event === "notificationReceived" && row.session_id === T0 - 3600_000 &&
      row.notification_id === "LCC.x" && /^[0-9a-f]{12}$/.test(row.source) &&
      !JSON.stringify(row).includes(K) && JSON.parse(row.data).jpy === 2000 &&
      row.logged_at === new Date(T0).toISOString() &&
      /^[0-9a-f]{32}$/.test(st.inserted[0].insertId),
    `status ${r.status} / 入った ${st.inserted.length}`);
    // 送り直しで2行にしない印は、同じ1行なら同じ
    await hit({body: line("notificationReceived", data)});
    put("insertId", st.inserted.length === 2 &&
      st.inserted[0].insertId === st.inserted[1].insertId);
    // 合言葉は10分覚える（1行ごとに Firestore を引かない）
    put("cache", st.exists === 1, `引いた ${st.exists} 回`);
    // ログに中身を出さない（入れ損ねた回）
    LOGS.length = 0;
    const {hit: hit2, deps} = rig(mod);
    deps.insert = async () => {
      throw new Error("Permission bigquery.tables.updateData denied");
    };
    const r2 = await hit2({body: line("notificationReceived", data)});
    const text = LOGS.join("\n");
    put("fail503", r2.status === 503, `status ${r2.status}`);
    put("nolog", LOGS.length > 0 && !text.includes("にせもの") &&
      !text.includes(K), text.slice(0, 120));
  }

  // 知らない出来事の名前
  {
    const {st, hit} = rig(mod);
    const r = await hit({body: line("dropTable", {})});
    const r2 = await hit({body: {...line("mount"), event: undefined}});
    put("event", r.status === 400 && r2.status === 400 &&
      st.inserted.length === 0 && st.exists === 0,
    `status ${r.status}/${r2.status} / 入った ${st.inserted.length} / 引いた ${st.exists}`);
  }

  // 形の違う sessionId（でたらめな数で表が割れないように）
  {
    const {st, hit} = rig(mod);
    const bad = [0, -1, 12.5, "1700000000000", T0 + 3 * 86400000];
    const got = [];
    for (const sid of bad) {
      got.push((await hit({body: {...line("mount"), sessionId: sid}})).status);
    }
    put("sid", got.every((s) => s === 400) && st.inserted.length === 0,
      `status ${got.join(",")}`);
  }

  // 大きい1行
  {
    const {st, hit} = rig(mod);
    const big = line("notificationReceived", {message: "あ".repeat(4000)});
    const r = await hit({body: big});
    // 測れなかったとき（bytes が無い）も、本文から測って断る
    const r2 = await hit({body: big, bytes: null});
    put("big", r.status === 413 && st.inserted.length === 0 && st.exists === 0,
      `status ${r.status} / 入った ${st.inserted.length}`);
    put("big-nobytes", r2.status === 413, `status ${r2.status}`);
    // 上限ちょうど手前は通る（線の位置）
    const {st: st2, hit: hit3} = rig(mod);
    const max = mod.ALERT_LOG_MAX_BYTES;
    const r3 = await hit3({body: line("mount"), bytes: max});
    put("big-edge", r3.status === 204 && st2.inserted.length === 1);
  }

  // 1つの送り元から大量に（1分）
  {
    const {st, hit} = rig(mod);
    const n = mod.ALERT_LOG_PER_MIN;
    const got = {204: 0, 429: 0};
    for (let i = 0; i < n + 30; i++) {
      const s = (await hit({body: line("fxHeld", {i})})).status;
      got[s] = (got[s] ?? 0) + 1;
    }
    put("minute", got[204] === n && got[429] === 30 && st.inserted.length === n,
      `通った ${got[204]} / 断った ${got[429]} / 上限 ${n}`);
    // 次の1分には戻る
    st.now += 60_000;
    const r = await hit({body: line("fxHeld", {i: -1})});
    put("minute-reset", r.status === 204);
  }

  // 口ぜんぶで大量に（知らない合言葉の総当たり）
  {
    const {st, hit} = rig(mod);
    const all = mod.ALERT_LOG_PER_MIN_ALL;
    const got = {404: 0, 429: 0};
    for (let i = 0; i < all + 50; i++) {
      const k = i.toString(16).padStart(32, "0");
      const s = (await hit({path: `/alertbox/${k}/log`, body: line("mount")})).status;
      got[s] = (got[s] ?? 0) + 1;
    }
    put("all", got[404] === all && got[429] === 50 && st.exists === all &&
      st.inserted.length === 0,
    `404 ${got[404]} / 429 ${got[429]} / 引いた ${st.exists} / 上限 ${all}`);
  }

  // 知らない合言葉
  {
    const {st, hit} = rig(mod);
    const r = await hit({path: `/alertbox/${OTHER}/log`, body: line("mount")});
    put("exists", r.status === 404 && st.inserted.length === 0,
      `status ${r.status} / 入った ${st.inserted.length}`);
  }

  // 1日の枠（Firestore で数える側）
  {
    const {st, hit} = rig(mod, {quota: 5});
    const got = [];
    for (let i = 0; i < 8; i++) {
      // 1分の枠に当たらないよう、1分ずつずらす
      st.now += 60_000;
      got.push((await hit({body: line("fxPlan", {i})})).status);
    }
    put("daily", got.filter((s) => s === 204).length === 5 &&
      got.slice(5).every((s) => s === 429) && st.inserted.length === 5,
    `status ${got.join(",")}`);
  }

  // 道と method
  {
    const {st, hit} = rig(mod);
    const g = await hit({method: "GET", body: undefined});
    const other = await hit({path: "/alertbox/" + K + "/fund", body: line("mount")});
    const short = await hit({path: "/alertbox/abc/log", body: line("mount")});
    put("method", g.status === 405 && st.inserted.length === 0);
    put("path", other.handled === false && short.handled === false);
  }
  return out;
}

/* ---------------- 本体 ---------------- */

let bad = 0;
/**
 * 1行出す。
 * @param {string} name 名前
 * @param {boolean} ok 通ったか
 * @param {string} why 落ちたときの添え書き
 */
function check(name, ok, why = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `（${why}）`}`);
  if (!ok) bad += 1;
}

const NAMES = {
  pass: "正しい1行は 204 で、表の形になって入る（合言葉は入らない）",
  insertId: "同じ1行を2回送ると、同じ印が付く（BigQuery が1行に潰す）",
  cache: "当たった合言葉は覚える（2行目から Firestore を引かない）",
  fail503: "入れ損ねたら 503",
  nolog: "入れ損ねたログに、名前・ひとこと・合言葉が出ない",
  event: "知らない出来事の名前 → 400・書き込み0・合言葉を引かない",
  sid: "でたらめな sessionId → 400・書き込み0",
  "big": "大きい1行 → 413・書き込み0・合言葉を引かない",
  "big-nobytes": "長さが測れなくても、本文から測って 413",
  "big-edge": "上限ちょうどは通る",
  minute: "1つの送り元から1分に上限より多く → 上限ちょうどで 429",
  "minute-reset": "次の1分には戻る",
  all: "知らない合言葉の総当たり → 口ぜんぶの枠で 429（引くのは枠のぶんだけ）",
  exists: "知らない合言葉 → 404・書き込み0",
  daily: "1日の枠を超えたら 429・書き込みが止まる",
  method: "GET → 405",
  path: "ほかの道は扱わない",
};

console.log("# 1. 口の守り（いまの書き出しで）");
const base = await suite(load(SRC, "base"));
if (!base.get("pass")?.ok) {
  nothing(`正しい1行が通らない（${base.get("pass")?.why}）。偽物か本体が壊れている`);
}
for (const [name, r] of base) check(NAMES[name] ?? name, r.ok, r.why);

console.log("\n# 2. 面（lib/log.ts）と口が、同じ並び・同じ上限を持っている");
{
  const mod = load(SRC, "lists");
  const client = readFileSync(join(ROOT, "lib/log.ts"), "utf8");
  const m = /ALERT_LOG_EVENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(client);
  if (!m) nothing("lib/log.ts に ALERT_LOG_EVENTS が見つからない");
  const names = [...m[1].replace(/\/\/[^\n]*/g, "").matchAll(/"([A-Za-z]+)"/g)]
    .map((x) => x[1]);
  if (!names.length) nothing("lib/log.ts の ALERT_LOG_EVENTS が空");
  const server = [...mod.ALERT_LOG_EVENTS];
  const onlyC = names.filter((x) => !server.includes(x));
  const onlyS = server.filter((x) => !names.includes(x));
  check(`出来事の名前が同じ（面 ${names.length} / 口 ${server.length}）`,
    onlyC.length === 0 && onlyS.length === 0,
    `面だけ [${onlyC.join(",")}] / 口だけ [${onlyS.join(",")}]`);
  const b = /ALERT_LOG_MAX_BYTES\s*=\s*([\d\s*]+);/.exec(client);
  if (!b) nothing("lib/log.ts に ALERT_LOG_MAX_BYTES が見つからない");
  // eslint-disable-next-line no-eval
  const cb = Function(`return (${b[1]});`)();
  check(`1行の上限が同じ（面 ${cb} / 口 ${mod.ALERT_LOG_MAX_BYTES}）`,
    cb === mod.ALERT_LOG_MAX_BYTES, "");
  /* 面の写しは試し表示（`?preview=`）では始まらない。始める呼び出しが
     `preview` の枝を抜けた後ろにあることを、字で見る */
  const box = readFileSync(join(ROOT, "app/alertbox/index.tsx"), "utf8");
  const at = box.indexOf("copyAlertLogs(alertboxId)");
  const pv = box.indexOf("if (preview) {");
  const mount = box.indexOf('"mount"');
  check("面の写しは、試し表示の枝を抜けたあと・mount の前で始まる",
    at > 0 && pv > 0 && at > pv && at < mount, `copy ${at} / preview ${pv} / mount ${mount}`);
}

console.log("\n# 3. 対照（守りを1本ずつ外して、狙った行だけが赤くなるか）");
for (const [name, [re, to, target]] of Object.entries(BREAKS)) {
  const src = SRC.replace(re, to);
  if (src === SRC) nothing(`BREAK=${name} が当たらなかった`);
  const got = await suite(load(src, name));
  const red = [...got].filter(([, r]) => !r.ok).map(([n]) => n);
  check(`${name} を外すと「${NAMES[target]}」が赤くなる`,
    red.includes(target), `赤くなったもの [${red.join(",")}]`);
}

console.log(`\n${bad ? `落ちた ${bad}件` : "ぜんぶ通った"}`);
process.exit(bad ? 1 : 0);
