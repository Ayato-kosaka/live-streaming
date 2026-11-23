/**
 * 島で受ける投げ銭を、**Stripe のテスト環境で、払ってからテスト用のアラートに出るまで**、
 * 本番の面（`/tip`・`/alertbox`）と口（`/island-api/tip/checkout`・`/stripe/webhook`）で通して確かめる
 * （#1405 段2。決定の記録 0017）。
 *
 *   node tools/tip/tip_e2e.mjs      # 回すのは Actions（`.github/workflows/tip_e2e.yml`）。作業箱では回さない
 *
 * 要るもの: `GOOGLE_APPLICATION_CREDENTIALS`（Firebase の管理の鍵。`google-github-actions/auth` が置く）・
 * `functions/node_modules`（firebase-admin）・`tools/sprites/node_modules`（playwright-core。版は上げない）。
 * 置き場は `TIP_E2E_OUT`（既定 `/tmp/tip-e2e`）。`pub/` の下が枝 `review-media/tip-e2e` に載る。
 *
 * ## 1回の回しでやること
 *
 * 1. 回す前の数を控える: 豚（`island/state.fund.box.island`）・`GET /island-api/fund` の総額・台帳
 *    （`islandTips` の件数と、そのうち `source: island`）・本番の支払い（`islandSiteTips` の `livemode: true`）・
 *    本番のアラートの1枚（`islandAlertFeed/{あやとの合言葉}`）の `seq`・`GET /state` の住人
 * 2. テスト用の合言葉（`islandFundConfig/tip.testAlertboxId`）が無ければ作って書く。**本番の合言葉と同じなら作り直す**
 *    （口はそのとき書かない作り。`functions/src/tip.ts` の `testAlertbox`）
 * 3. 試し専用の人を作る。**admin を持たない**新しい uid に、あやと本人のチャンネル（公開の ID。`site/content/site.ts`）を
 *    持たせる。名前も顔も「出す」にしないので、島の住人には載らない（`listResidents`）。載っていないことを `/state` で見る
 * 4. その uid のカスタムトークンを面の上で ID トークンに替え、Firebase のログインの控え（`firebase:authUser:…`）と、
 *    面の「この端末は一度ログインした」の印（`site/lib/auth.tsx` の `SIGNED_IN`）を置いて開き直す
 * 5. 対照を2つ: 禁止ワードを含むメッセージ → 払う前に 400 `ng word`／額 99 → 400（どちらも Stripe の画面へ行かない）。
 *    禁止ワードは**その場限りの印**（`ngtest…`）を足して当て、すぐ外す。本物の語は録画に写さない
 *    （語の一覧は公開しない決め。`tip.ts` の `tipConfig`）
 * 6. ¥100・¥1,000・¥10,000 の3回、アラート画面（`/alertbox?k=<テストの合言葉>`）を開き直してから `/tip` で払う。
 *    「支払う」を押した時刻 → 口が書いた時刻（`islandSiteTips.createdAt`）→ アラートに名前と額が見えた時刻、を測る
 * 7. 回したあとの数を、1 と突き合わせる。テストの1枚の `seq` は3つ増えているはず
 * 8. **片づけはいつも**（落ちても）: 試しの人の `islandUsers`・`islandHere`・1日の枠（`islandRate`）・Auth、足した印
 *
 * ## ログに出さないもの（`docs/island-verify.md` 2章。Actions のログは公開）
 *
 * 鍵・テストの合言葉・あやとの合言葉・試しの uid・メール・トークン・Stripe の ID。見つけたその場で
 * `::add-mask::` を出し、値そのものは1度も印字しない。豚の額も出さない（同じか違うかだけ）。
 *
 * ## 止まるところ
 *
 * - 支払いの画面が**本番**（`cs_live_`）だったら払わずに止める
 * - CAPTCHA が出たら**解かずに**止める
 *
 * 終了コード: 0=合格 / 1=回せたが、合格の条件に落ちたものがある / 2=回せなかった（準備の失敗・CAPTCHA・本番の鍵だった）
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { chromium } from "../sprites/node_modules/playwright-core/index.mjs";
import { chromePath } from "../sprites/chrome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const admin = createRequire(join(root, "functions/package.json"))("firebase-admin");

const SITE = (process.env.TIP_E2E_SITE || "https://ayato-arigato.com").replace(/\/+$/, "");
const OUT = process.env.TIP_E2E_OUT || "/tmp/tip-e2e";
const PUB = join(OUT, "pub");
const GHA = !!process.env.GITHUB_ACTIONS;

/* 公開の識別子は、**持っているファイルから読む**（ここに書き写さない。片方だけ直した日に黙ってずれる） */
const FIREBASE_TS = readFileSync(join(root, "site/lib/firebase.ts"), "utf8");
const API_KEY = /apiKey:\s*"(AIza[0-9A-Za-z_-]+)"/.exec(FIREBASE_TS)?.[1] ?? "";
const PROJECT = /projectId:\s*"([a-z0-9-]+)"/.exec(FIREBASE_TS)?.[1] ?? "";
/** あやと本人のチャンネル（公開の ID。島の「YouTube チャンネル」の行と同じもの） */
const CHANNEL =
  /youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})/.exec(readFileSync(join(root, "site/content/site.ts"), "utf8"))?.[1] ?? "";

/** アラートに出る名前。試しだと分かる字にする */
const LABEL = "案内鳥のためし";
/** 段の違う3つ（`app/alertbox/themes.ts` の段） */
const ROUNDS = [100, 1000, 10000];
/** 合格の線: 払ってからアラートに名前と額が見えるまで */
const LIMIT_MS = 5000;
/** アラート画面を開き直してから払うまで、少なくともこれだけ置く（購読の1枚目を控え終えるまで） */
const ALERT_SETTLE_MS = 8000;
const ALERTBOX_ID = /^[0-9a-f]{32}$/;
const ALERT_VIEW = { width: 432, height: 768 };
const PHONE_VIEW = { width: 390, height: 844 };

/* ---------------------------------------------------------------- ログ */

const masked = new Set();
/** 出してはいけない値を、Actions に伏せさせる。**値そのものは印字しない** */
function mask(v) {
  const s = String(v ?? "");
  if (s.length < 4 || masked.has(s)) return;
  masked.add(s);
  if (GHA) process.stdout.write(`::add-mask::${s}\n`);
}
/** 進みぐあいの1行。**素性も ID も入れない** */
const say = (s) => console.log(`[tip-e2e] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 投げられた理由を、伏せた値ごと1行に縮める（Playwright の失敗は URL を含むことがある。伏せてあるが短くする） */
const why = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 160);

/* ---------------------------------------------------------------- 結果 */

const result = {
  site: SITE,
  startedAt: new Date().toISOString(),
  rounds: [],
  controls: {},
  checks: [],
  stopped: null,
  notes: [],
};
/** 合格の条件1つ。`ok` が null は「確かめられなかった」 */
const check = (name, ok, detail = "") => {
  result.checks.push({ name, ok, detail });
  say(`${ok === true ? "OK " : ok === false ? "NG " : "?? "}${name}${detail ? `（${detail}）` : ""}`);
};

/* ---------------------------------------------------------------- Firebase */

let db;
let auth;
function initAdmin() {
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) throw new Error("GOOGLE_APPLICATION_CREDENTIALS が無い");
  const sa = JSON.parse(readFileSync(file, "utf8"));
  if (!PROJECT || sa.project_id !== PROJECT) throw new Error("鍵のプロジェクトが site/lib/firebase.ts と違う");
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT });
  db = admin.firestore();
  auth = admin.auth();
}

/** あやと（`admin`）の合言葉。**数えるだけで、値は出さない** */
async function ownerKeys() {
  const q = await db.collection("islandUsers").where("admin", "==", true).limit(5).get();
  const keys = q.docs.map((d) => String(d.get("alertboxId") ?? "")).filter((k) => ALERTBOX_ID.test(k));
  keys.forEach(mask);
  return keys;
}

const feedSeq = async (k) => Number((await db.collection("islandAlertFeed").doc(k).get()).get("seq")) || 0;

/** 公開の口を叩く。**CDN の控えを避ける**ため、毎回ちがう問いを付ける（Hosting は問いごとに控える） */
async function getJson(path) {
  const u = `${SITE}${path}${path.includes("?") ? "&" : "?"}e2e=${Date.now()}`;
  try {
    const r = await fetch(u, { headers: { "cache-control": "no-cache" } });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

async function postJson(path, body, token) {
  try {
    const r = await fetch(`${SITE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

/** 回す前と後で比べる数。**額は持つが印字しない**（同じか違うかだけを出す） */
async function snapshot(owners) {
  const [state, tips, tipsIsland, liveSite, fund, st, seqs] = await Promise.all([
    db.doc("island/state").get(),
    db.collection("islandTips").count().get(),
    db.collection("islandTips").where("source", "==", "island").count().get(),
    db.collection("islandSiteTips").where("livemode", "==", true).count().get(),
    getJson("/island-api/fund"),
    getJson("/island-api/state"),
    Promise.all(owners.map(feedSeq)),
  ]);
  const box = state.get("fund.box") ?? null;
  return {
    island: box && Object.prototype.hasOwnProperty.call(box, "island") ? box.island : null,
    tips: tips.data().count,
    tipsIsland: tipsIsland.data().count,
    liveSite: liveSite.data().count,
    fundStatus: fund.status,
    fundTotal: typeof fund.body?.total === "number" ? fund.body.total : null,
    residents: Array.isArray(st.body?.residents) ? st.body.residents : null,
    ownerSeqs: seqs,
  };
}

/** テスト用の合言葉。**無い・形が違う・本番と同じなら作り直す**。返すだけで、印字しない */
async function testAlertbox(owners) {
  const ref = db.doc("islandFundConfig/tip");
  const cur = String((await ref.get()).get("testAlertboxId") ?? "");
  if (ALERTBOX_ID.test(cur) && !owners.includes(cur)) {
    mask(cur);
    return { key: cur, made: false };
  }
  const key = randomBytes(16).toString("hex");
  mask(key);
  await ref.set({ testAlertboxId: key }, { merge: true });
  return { key, made: true };
}

/* ---------------------------------------------------------------- 試しの人 */

/** 試しの人の印。**前の回が片づけ損ねた人も、これで拾って消す** */
const MARK = "tipE2e";

async function makeTester(uid) {
  await auth.createUser({ uid, displayName: LABEL });
  const now = Date.now();
  /* **名前も顔も「出す」にしない**（`showName`・`showPhoto` が偽）。島の住人（`listResidents`）・
     いま島にいる人（`Here.tsx`）には、その2つのどちらかが真の人しか載らない。
     `handle` を先に入れておくのは、`POST /me` がチャンネルのハンドルを YouTube から引き直して
     あやと本人のハンドルを名前にするのを止めるため（`islandApi.ts` の `/me`） */
  await db.collection("islandUsers").doc(uid).set({
    channelId: CHANNEL,
    name: LABEL,
    handle: LABEL,
    showName: false,
    showPhoto: false,
    firstSeenAt: now,
    lastSeenAt: now,
    [MARK]: true,
  });
}

/** 1人ぶん消す。**無くても投げない**（2回呼ばれても同じ） */
async function dropTester(uid, days) {
  const refs = [
    db.collection("islandUsers").doc(uid),
    db.collection("islandHere").doc(uid),
    ...days.map((d) => db.collection("islandRate").doc(`tip_${d}_${uid}`)),
  ];
  await Promise.all(refs.map((r) => r.delete().catch(() => null)));
  await auth.deleteUser(uid).catch((e) => {
    if (e?.code !== "auth/user-not-found") throw e;
  });
}

async function testerGone(uid) {
  const doc = await db.collection("islandUsers").doc(uid).get();
  let authGone = false;
  try {
    await auth.getUser(uid);
  } catch (e) {
    authGone = e?.code === "auth/user-not-found";
  }
  return !doc.exists && authGone;
}

/** 前の回が片づけ損ねた試しの人（印つき）。今回のぶんと一緒に消す */
async function leftovers() {
  const q = await db.collection("islandUsers").where(MARK, "==", true).limit(20).get();
  const ids = q.docs.map((d) => d.id).filter((id) => id.startsWith("tip-e2e-"));
  ids.forEach(mask);
  return ids;
}

/** UTC の日付（`islandApi.ts` の `today()` と同じ切り方）。1日の枠の書類IDに入る */
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- 禁止ワードの印 */

/**
 * 禁止ワードの対照に使う、**その場限りの語**。本物の語を打つと録画（公開の枝）に1語写るので使わない。
 * 足す前に欄が在ったかを控え、外すときに元の形へ戻す（欄が無かったなら欄ごと消す）
 */
async function addNgMarker() {
  const ref = db.doc("islandFundConfig/tip");
  const had = Array.isArray((await ref.get()).get("ngWords"));
  const word = `ngtest${randomBytes(4).toString("hex")}`;
  await ref.set({ ngWords: admin.firestore.FieldValue.arrayUnion(word) }, { merge: true });
  return { word, had };
}

async function removeNgMarker(m) {
  if (!m) return;
  const ref = db.doc("islandFundConfig/tip");
  await ref.update({ ngWords: admin.firestore.FieldValue.arrayRemove(m.word) });
  if (!m.had) {
    const left = (await ref.get()).get("ngWords");
    if (Array.isArray(left) && left.length === 0) await ref.update({ ngWords: admin.firestore.FieldValue.delete() });
  }
}

/* ---------------------------------------------------------------- アラート画面 */

/**
 * アラート画面の中で回す見張り。`window.__want`（名前・額・メッセージ）が置かれたら、
 * **見えた**時刻を `Date.now()` で書き込む（Node と同じ時計）。
 *
 * - 札の字は1字ずつ、縁取りの層と塗りの層の2枚で描かれる（`season/plate/RichText.tsx`）。
 *   だから「名前がそのまま続いて入っている」では探せない。**字の順に入っているか**（部分列）で探し、
 *   名前と額の両方を持ついちばん内側の箱を札とみなす
 * - **見えた**は、その箱と、中の字を持つ要素ぜんぶが、画面の中で大きさを持ち、不透明度（祖先ぜんぶの積）が
 *   0.3 を超えたとき。DOM に入っただけ（フェードの頭・動画の段の幕の手前）では数えない
 */
function alertWatch() {
  const norm = (s) => String(s || "").replace(/[\s,，、]/g, "");
  const op = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= parseFloat(cs.opacity || "1");
    }
    return o;
  };
  const boxShown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && op(el) > 0.5;
  };
  const subseq = (hay, needle) => {
    const n = [...needle];
    let i = 0;
    for (const ch of hay) if (ch === n[i] && ++i === n.length) return true;
    return n.length === 0;
  };
  const has = (t, needles) => needles.every((n) => subseq(t, n));
  const deepest = (needles) => {
    const all = [...document.body.querySelectorAll("*")].filter((e) => has(norm(e.textContent), needles));
    return all.filter((e) => !all.some((c) => c !== e && e.contains(c)));
  };
  const leavesShown = (box) => {
    const ls = [box, ...box.querySelectorAll("*")].filter((e) =>
      [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())
    );
    return (
      ls.length > 0 &&
      ls.every((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && op(e) > 0.3;
      })
    );
  };
  const seen = (needles) => deepest(needles).some((e) => boxShown(e) && leavesShown(e));
  setInterval(() => {
    const w = window.__want;
    if (!w || !document.body) return;
    const body = norm(document.body.textContent);
    if (!w.arrive && ((w.text && body.includes(w.text)) || (has(body, [w.name, w.amount]) && deepest([w.name, w.amount]).length)))
      w.arrive = Date.now();
    if (!w.arrive) return;
    if (!w.plate && seen([w.name, w.amount])) w.plate = Date.now();
    if (!w.msg && w.text && body.includes(w.text) && seen([w.text])) w.msg = Date.now();
  }, 50);
  /* 地を暗くし、隅に時計を出す（録画で /tip の録画と突き合わせるため。押しどころには重ならない左下） */
  const put = () => {
    document.documentElement.style.background = "#3a4048";
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;left:4px;bottom:4px;z-index:2147483647;font:11px/1.2 monospace;color:#fff;" +
      "background:rgba(0,0,0,.55);padding:2px 5px;border-radius:4px;pointer-events:none";
    document.body.appendChild(d);
    setInterval(() => {
      d.textContent = `${new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 22)} JST`;
    }, 100);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", put);
  else put();
}

/** アラートの見張りに、この回の名前・額・メッセージを置く */
const want = (page, yen, message) =>
  page.evaluate(
    (w) => {
      window.__want = w;
    },
    { name: LABEL.replace(/\s/g, ""), amount: String(yen), text: message.replace(/[\s,，、]/g, "") }
  );

/* ---------------------------------------------------------------- /tip */

/**
 * 面のログインを、**カスタムトークンで**置く（ポップアップは開かない）。
 *
 * 面は「この端末は一度ログインした」の印（`site/lib/auth.tsx` の `SIGNED_IN`）が無いと
 * firebase/auth を読まない。印と、Firebase の SDK が自分で置くログインの控え
 * （`firebase:authUser:<apiKey>:[DEFAULT]`。SDK は IndexedDB と localStorage の両方を見て、
 * 見つけたほうから IndexedDB へ移す）を置いてから開き直す。
 * トークンの引き替えは**面の上で**する（鍵がリファラで縛られていても通るように）
 */
async function signIn(page, uid, token) {
  await page.goto(`${SITE}/tip`, { waitUntil: "domcontentloaded" });
  const got = await page.evaluate(
    async ({ token, key }) => {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, returnSecureToken: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.idToken) return { ok: false, status: r.status, code: String(j?.error?.message ?? "").slice(0, 40) };
      return { ok: true, idToken: j.idToken, refreshToken: j.refreshToken, expiresIn: Number(j.expiresIn) || 3600 };
    },
    { token, key: API_KEY }
  );
  if (!got.ok) throw new Error(`カスタムトークンを引き替えられない（${got.status} ${got.code.replace(/[^A-Z_ ]/g, "")}）`);
  mask(got.idToken);
  mask(got.refreshToken);
  const now = Date.now();
  await page.evaluate(
    ({ key, user }) => {
      localStorage.setItem(`firebase:authUser:${key}:[DEFAULT]`, JSON.stringify(user));
      localStorage.setItem("ayato-island-signedin", "1");
    },
    {
      key: API_KEY,
      user: {
        uid,
        displayName: LABEL,
        emailVerified: false,
        isAnonymous: false,
        providerData: [],
        stsTokenManager: {
          refreshToken: got.refreshToken,
          accessToken: got.idToken,
          expirationTime: now + got.expiresIn * 1000,
        },
        createdAt: String(now),
        lastLoginAt: String(now),
        apiKey: API_KEY,
        appName: "[DEFAULT]",
      },
    }
  );
  return got.idToken;
}

const AMOUNT = 'input[aria-label="投げる額（円）"]';

/** `/tip` を開いて、額とメッセージの紙が出るまで待つ。出なければ、出た紙の見出しを添えて投げる */
async function openForm(page) {
  await page.goto(`${SITE}/tip`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator(AMOUNT).waitFor({ state: "visible", timeout: 30000 });
  } catch {
    const h = await page.locator("section.tip-paper h2").first().textContent().catch(() => "");
    throw new Error(`入力の紙が出ない（出ていた紙: ${String(h || "なし").slice(0, 30)}）`);
  }
}

async function fillForm(page, yen, message) {
  await openForm(page);
  await page.locator(AMOUNT).fill(String(yen));
  await page.locator("textarea.tip-msg").fill(message);
}

/** 入力 → 最終確認 → 「払う」まで。口の返事（状態と中身）を返す */
async function pressPay(page) {
  await page.locator("button.tip-go").click();
  await page.getByRole("heading", { name: "これで投げる？" }).waitFor({ timeout: 15000 });
  const res = page.waitForResponse(
    (r) => r.url().startsWith(`${SITE}/island-api/tip/checkout`) && r.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.locator("button.tip-go").click();
  const r = await res;
  const body = await r.json().catch(() => null);
  return { status: r.status(), body };
}

/* ---------------------------------------------------------------- Stripe の支払い画面 */

/** 候補のうち、見えている最初のもの。無ければ null */
async function firstVisible(page, sels, ms) {
  const end = Date.now() + ms;
  do {
    for (const s of sels) {
      const l = page.locator(s).first();
      if (await l.isVisible().catch(() => false)) return l;
    }
    await sleep(200);
  } while (Date.now() < end);
  return null;
}

/** CAPTCHA の問いが**画面に出ている**か（見えない hCaptcha の枠は数えない） */
async function captchaShown(page) {
  for (const f of page.frames()) {
    if (!/captcha/i.test(f.url())) continue;
    try {
      const el = await f.frameElement();
      const bb = await el.boundingBox();
      if (bb && bb.width > 100 && bb.height > 100 && (await el.isVisible())) return true;
    } catch {
      /* 枠が消えた */
    }
  }
  return false;
}

/** 欄が見つからなかったときに残す、画面の形（**入力した値は入れない**。欄の id・name・種類だけ） */
async function formShape(page) {
  return page
    .evaluate(() =>
      [...document.querySelectorAll("input,select,button")]
        .filter((e) => e.offsetParent !== null)
        .slice(0, 40)
        .map((e) =>
          [e.tagName.toLowerCase(), e.id && `#${e.id}`, e.name && `name=${e.name}`, e.type, e.getAttribute("autocomplete"), e.dataset?.testid]
            .filter(Boolean)
            .join(" ")
        )
    )
    .catch(() => []);
}

/** 払い終わって `/tip?done=1` に戻ったか */
const backOnTip = (u) => {
  try {
    const x = new URL(u);
    return !x.hostname.endsWith("stripe.com") && x.pathname.replace(/\/+$/, "") === "/tip" && x.searchParams.get("done") === "1";
  } catch {
    return false;
  }
};

const typeIn = async (l, text) => {
  await l.click();
  await l.pressSequentially(text, { delay: 25 });
};

/**
 * テストカードで払う。押した時刻（`t0`）と、どう終わったかを返す。
 * **CAPTCHA が出たら解かずに `captcha` で返す**
 */
async function payOnStripe(page, email, shotBase) {
  const emailBox = await firstVisible(page, ["#email", 'input[name="email"]', 'input[type="email"]'], 30000);
  if (!emailBox) return { outcome: "no-form", shape: await formShape(page) };
  await typeIn(emailBox, email);
  const CARD = ["#cardNumber", 'input[name="cardNumber"]', 'input[autocomplete="cc-number"]'];
  let card = await firstVisible(page, CARD, 4000);
  if (!card) {
    /* 支払い方法が畳まれているとき（カードの行を開く） */
    const opener = await firstVisible(
      page,
      ['[data-testid="card-accordion-item-button"]', "#payment-method-accordion-item-title-card", 'button:has-text("カード")'],
      3000
    );
    if (opener) await opener.click().catch(() => null);
    card = await firstVisible(page, CARD, 8000);
  }
  if (!card) return { outcome: "no-card", shape: await formShape(page) };
  await typeIn(card, "4242424242424242");
  const exp = await firstVisible(page, ["#cardExpiry", 'input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], 5000);
  const cvc = await firstVisible(page, ["#cardCvc", 'input[name="cardCvc"]', 'input[autocomplete="cc-csc"]'], 5000);
  if (!exp || !cvc) return { outcome: "no-card", shape: await formShape(page) };
  /* 期限は先の月（2年後の12月） */
  const yy = String((new Date().getUTCFullYear() + 2) % 100).padStart(2, "0");
  await typeIn(exp, `12${yy}`);
  await typeIn(cvc, "123");
  const holder = await firstVisible(page, ["#billingName", 'input[name="billingName"]', 'input[autocomplete="cc-name"]'], 2000);
  if (holder) await typeIn(holder, "Tip E2E");
  const country = page.locator('select#billingCountry, select[name="billingCountry"]').first();
  if (await country.isVisible().catch(() => false)) await country.selectOption("JP").catch(() => null);
  const postal = await firstVisible(page, ["#billingPostalCode", 'input[name="billingPostalCode"]'], 800);
  if (postal) await typeIn(postal, "1000001");
  /* Link に情報を残す欄が立っていたら倒す（立っていると電話番号を求められる） */
  const keep = page.locator("#enableStripePass").first();
  if (await keep.isChecked().catch(() => false)) await keep.uncheck().catch(() => null);
  const submit = await firstVisible(
    page,
    ['button[data-testid="hosted-payment-submit-button"]', "button.SubmitButton", 'button[type="submit"]'],
    5000
  );
  if (!submit) return { outcome: "no-submit", shape: await formShape(page) };
  if (await captchaShown(page)) return { outcome: "captcha" };
  await page.screenshot({ path: `${shotBase}-stripe.png` }).catch(() => null);
  const t0 = Date.now();
  await submit.click();
  while (Date.now() - t0 < 90000) {
    /* 戻り先のホストは口が決める（`tip.ts` の `originOf`）。面の入口と違うホストに戻っても「戻った」と読む */
    if (backOnTip(page.url())) return { outcome: "done", t0, back: Date.now() };
    if (await captchaShown(page)) {
      await page.screenshot({ path: `${shotBase}-captcha.png` }).catch(() => null);
      return { outcome: "captcha", t0 };
    }
    await sleep(200);
  }
  await page.screenshot({ path: `${shotBase}-stuck.png` }).catch(() => null);
  const alerts = await page
    .locator('[role="alert"]')
    .allTextContents()
    .catch(() => []);
  return { outcome: "stuck", t0, alerts: alerts.map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 3) };
}

/** `islandSiteTips/{cs}` が書かれるまで待つ */
async function waitSiteTip(cs, ms) {
  const ref = db.collection("islandSiteTips").doc(cs);
  const end = Date.now() + ms;
  do {
    const s = await ref.get();
    if (s.exists) return s.data();
    await sleep(300);
  } while (Date.now() < end);
  return null;
}

/** アラートの見張りが、見えた時刻を書くまで待つ */
async function waitAlert(page, until) {
  let w = null;
  do {
    w = await page.evaluate(() => window.__want).catch(() => null);
    if (w?.plate && w?.msg) return w;
    await sleep(200);
  } while (Date.now() < until);
  return w;
}

/* ---------------------------------------------------------------- 本体 */

/** 2枚を閉じて、録画を `pub/` に置く。**2回呼ばれても同じ**（閉じたものは飛ばす） */
async function saveVideos(open) {
  for (const [ctx, page, name] of [
    ["tipCtx", "tip", "tip.webm"],
    ["alertCtx", "alert", "alert.webm"],
  ]) {
    if (!open[ctx]) continue;
    const c = open[ctx];
    open[ctx] = null;
    await c.close().catch(() => null);
    await open[page]
      ?.video()
      ?.saveAs(join(PUB, name))
      .catch((e) => result.notes.push(`録画（${name}）を残せなかった: ${why(e)}`));
  }
}

const sec = (ms) => (typeof ms === "number" && Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : "—");

async function main() {
  mkdirSync(PUB, { recursive: true });
  if (!API_KEY || !CHANNEL) {
    result.stopped = "公開の識別子が読めない（site/lib/firebase.ts・site/content/site.ts）";
    return 2;
  }
  initAdmin();

  const owners = await ownerKeys();
  result.notes.push(`本番の合言葉: ${owners.length}本（値は出さない）`);
  const before = await snapshot(owners);
  say("回す前の数を控えた");

  const tk = await testAlertbox(owners);
  result.notes.push(tk.made ? "テスト用の合言葉を作って書いた" : "テスト用の合言葉はもう在った");
  const testSeq0 = await feedSeq(tk.key);

  const stale = await leftovers();
  if (stale.length) {
    await Promise.all(stale.map((u) => dropTester(u, [utcDay(Date.now()), utcDay(Date.now() - 864e5)])));
    result.notes.push(`前の回の試しの人を ${stale.length}人 片づけた`);
  }

  const startedMs = Date.now();
  const uid = `tip-e2e-${randomBytes(6).toString("hex")}`;
  mask(uid);
  let marker = null;
  let browser = null;
  /** 録画を持つ2枚。**落ちても**閉じて録画を残す（finally） */
  const open = { tipCtx: null, alertCtx: null, tip: null, alert: null };
  let exit = 0;
  try {
    await makeTester(uid);
    say("試しの人を作った（admin なし・名前も顔も出さない）");
    /* 住人に載っていないか（いる間に見る） */
    const during = await getJson("/island-api/state");
    const rs = Array.isArray(during.body?.residents) ? during.body.residents : null;
    const named = rs ? rs.filter((r) => String(r?.name ?? "").includes(LABEL)).length : null;
    check(
      "試しの人が島の住人に出ない",
      rs !== null && before.residents !== null ? rs.length === before.residents.length && named === 0 : null,
      rs ? `住人 ${before.residents?.length ?? "?"}→${rs.length}人・ためしの名前 ${named}件` : `/state ${during.status}`
    );

    const token = await auth.createCustomToken(uid);
    mask(token);
    const exe = chromePath();
    browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), headless: true });
    const ver = browser.version().split(".")[0];
    /* 面は phone の幅で開く（投げる人のほとんどはスマホ）。UA から Headless の字だけ外す */
    const phoneUA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Mobile Safari/537.36`;
    const tipCtx = (open.tipCtx = await browser.newContext({
      viewport: PHONE_VIEW,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      userAgent: phoneUA,
      recordVideo: { dir: join(OUT, "video-tip"), size: PHONE_VIEW },
    }));
    const alertCtx = (open.alertCtx = await browser.newContext({
      viewport: ALERT_VIEW,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      recordVideo: { dir: join(OUT, "video-alert"), size: ALERT_VIEW },
    }));
    await alertCtx.addInitScript(alertWatch);
    const tip = (open.tip = await tipCtx.newPage());
    const alert = (open.alert = await alertCtx.newPage());
    /* Stripe の画面へ移った回数（対照で 0 のはず） */
    let toStripe = 0;
    tip.on("framenavigated", (f) => {
      if (f !== tip.mainFrame()) return;
      try {
        if (new URL(f.url()).hostname.endsWith("stripe.com")) toStripe++;
      } catch {
        /* about:blank */
      }
    });

    const idToken = await signIn(tip, uid, token);
    await openForm(tip);
    say("面にログインした（入力の紙が出た）");

    /* ---- 対照1: 禁止ワード ---- */
    marker = await addNgMarker();
    mask(marker.word);
    {
      const n0 = toStripe;
      await fillForm(tip, 100, `ためし ${marker.word}`);
      const r = await pressPay(tip);
      const shown = await tip
        .locator("#tip-msg-fail")
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      await sleep(1500);
      result.controls.ng = { status: r.status, error: r.body?.error ?? null, url: !!r.body?.url, toStripe: toStripe - n0, shown };
      check(
        "対照: 禁止ワード → 払う前に 400 ng word",
        r.status === 400 && r.body?.error === "ng word" && !r.body?.url && toStripe === n0 && shown,
        `${r.status} ${r.body?.error ?? "-"}・Stripe へ ${toStripe - n0}回・面の1行 ${shown ? "出た" : "出ない"}`
      );
    }
    await removeNgMarker(marker);
    marker = null;

    /* ---- 対照2: 額 99 ---- */
    {
      const n0 = toStripe;
      await fillForm(tip, 99, "");
      const disabled = await tip.locator("button.tip-go").isDisabled();
      await sleep(1000);
      const r = await postJson("/island-api/tip/checkout", { yen: 99, message: "" }, idToken);
      result.controls.yen99 = { status: r.status, error: r.body?.error ?? null, url: !!r.body?.url, toStripe: toStripe - n0, disabled };
      check(
        "対照: 額 99 → 400（面は押せない）",
        r.status === 400 && !r.body?.url && toStripe === n0 && disabled,
        `${r.status} ${r.body?.error ?? "-"}・Stripe へ ${toStripe - n0}回・面のボタン ${disabled ? "押せない" : "押せる"}`
      );
    }

    /* ---- 3回払う ---- */
    let alertOpened = false;
    for (let i = 0; i < ROUNDS.length; i++) {
      const yen = ROUNDS[i];
      const message = `島の投げ銭のためし（${i + 1}/${ROUNDS.length}）`;
      const row = { yen };
      result.rounds.push(row);
      const shot = join(PUB, `round${i + 1}-${yen}`);

      /* アラート画面を開き直す（前の回のアラートが列に残って、次の回を待たせないように） */
      if (!alertOpened) {
        await alert.goto(`${SITE}/alertbox?k=${tk.key}`, { waitUntil: "domcontentloaded" });
        alertOpened = true;
      } else {
        await alert.reload({ waitUntil: "domcontentloaded" });
      }
      const alertAt = Date.now();
      await want(alert, yen, message);

      await fillForm(tip, yen, message);
      const r = await pressPay(tip);
      const url = typeof r.body?.url === "string" ? r.body.url : "";
      const cs = /\/(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(url)?.[1] ?? "";
      mask(cs);
      if (r.status !== 200 || !cs) {
        row.outcome = `checkout ${r.status} ${r.body?.error ?? ""}`.trim();
        exit = 1;
        break;
      }
      if (cs.startsWith("cs_live_")) {
        /* **本番の鍵だった。払わない。** 支払い画面は放っておけば切れる */
        result.stopped = "支払い画面が本番（cs_live_）だったので、払わずに止めた";
        exit = 2;
        break;
      }
      await tip.waitForURL((u) => u.hostname === "checkout.stripe.com", { timeout: 30000 });
      const wait = ALERT_SETTLE_MS - (Date.now() - alertAt);
      if (wait > 0) await sleep(wait);

      const email = `tip-e2e-${randomBytes(4).toString("hex")}@example.com`;
      mask(email);
      const paid = await payOnStripe(tip, email, shot);
      row.outcome = paid.outcome;
      if (paid.shape) row.shape = paid.shape;
      if (paid.alerts) row.alerts = paid.alerts;
      if (paid.outcome === "captcha") {
        result.stopped = "Stripe の支払い画面で CAPTCHA が出た（解かずに止めた）";
        exit = 2;
        break;
      }
      if (paid.outcome !== "done" && paid.outcome !== "stuck") {
        result.stopped = `Stripe の支払い画面を埋められない（${paid.outcome}）`;
        exit = 2;
        break;
      }
      const t0 = paid.t0;
      const [w, doc] = await Promise.all([waitAlert(alert, t0 + 30000), waitSiteTip(cs, 40000)]);
      await alert.screenshot({ path: `${shot}-alert.png` }).catch(() => null);
      const t1 = doc ? Date.parse(String(doc.createdAt ?? "")) : NaN;
      row.stripeToApi = Number.isFinite(t1) ? t1 - t0 : null;
      row.apiToAlert = Number.isFinite(t1) && w?.plate ? w.plate - t1 : null;
      row.total = w?.plate ? w.plate - t0 : null;
      row.arrive = w?.arrive ? w.arrive - t0 : null;
      row.msgAt = w?.msg ? w.msg - t0 : null;
      row.backAt = paid.back ? paid.back - t0 : null;
      row.plate = !!w?.plate;
      row.msgShown = !!w?.msg;
      row.doc = doc
        ? {
            livemode: doc.livemode,
            amount: doc.amount,
            status: doc.status,
            message: doc.message === message,
            own: doc.uid === uid,
          }
        : null;
      say(`¥${yen}: ${paid.outcome}・Stripe→口 ${sec(row.stripeToApi)}・口→アラート ${sec(row.apiToAlert)}・合計 ${sec(row.total)}`);
      /* アラートを出しきるところまで録る（次の回で開き直す） */
      await sleep(i === ROUNDS.length - 1 ? 12000 : 3000);
    }

    await saveVideos(open);

    /* ---- 3回ぶんの合否 ---- */
    const done = result.rounds.filter((r) => r.doc);
    result.rounds.forEach((r) => {
      const y = `¥${r.yen.toLocaleString("ja-JP")}`;
      check(`${y}: アラートに名前・額・メッセージが出た`, !!(r.plate && r.msgShown), r.plate ? `合計 ${sec(r.total)}` : r.outcome ?? "");
      check(`${y}: 払ってから 5 秒以内`, typeof r.total === "number" ? r.total <= LIMIT_MS : false, sec(r.total));
      check(
        `${y}: islandSiteTips が livemode: false・額が合う`,
        !!r.doc && r.doc.livemode === false && r.doc.amount === r.yen && r.doc.status === "paid" && r.doc.message && r.doc.own,
        r.doc ? `livemode ${r.doc.livemode}・額 ${r.doc.amount === r.yen ? "合う" : "違う"}・${r.doc.status}` : "書かれていない"
      );
    });
    if (result.rounds.length < ROUNDS.length && exit === 0) exit = 1;

    const testSeq1 = await feedSeq(tk.key);
    check("テストのアラートの seq が回数ぶん増えた", testSeq1 - testSeq0 === done.length && done.length === ROUNDS.length, `+${testSeq1 - testSeq0}（払えた ${done.length}回）`);
  } catch (e) {
    result.stopped = result.stopped ?? `途中で止まった: ${why(e)}`;
    exit = 2;
  } finally {
    await saveVideos(open);
    if (browser) await browser.close().catch(() => null);
    if (marker) await removeNgMarker(marker).catch((e) => result.notes.push(`禁止ワードの印を外せなかった: ${why(e)}`));
    const days = [...new Set([utcDay(startedMs), utcDay(Date.now())])];
    await dropTester(uid, days).catch((e) => result.notes.push(`試しの人を消せなかった: ${why(e)}`));
  }

  /* ---- 回す前と後 ---- */
  await sleep(3000);
  const after = await snapshot(owners);
  check("本番の豚（fund.box.island）が動かない", before.island === after.island, before.island === after.island ? "同じ" : "違う");
  check(
    "GET /island-api/fund の総額が動かない",
    before.fundStatus === 200 && after.fundStatus === 200 ? before.fundTotal === after.fundTotal : null,
    before.fundStatus === 200 && after.fundStatus === 200
      ? before.fundTotal === after.fundTotal
        ? "同じ"
        : "違う（Doneru の本物の投げ銭が入った回は、ここだけ動く）"
      : `${before.fundStatus}→${after.fundStatus}`
  );
  check("台帳 islandTips に入らない", before.tips === after.tips && before.tipsIsland === after.tipsIsland, `${before.tips}→${after.tips}件（島 ${before.tipsIsland}→${after.tipsIsland}）`);
  check("本番の支払い（livemode: true）が増えない", before.liveSite === after.liveSite, `${before.liveSite}→${after.liveSite}件`);
  check(
    "本番のアラートの1枚が動かない",
    before.ownerSeqs.length > 0 ? before.ownerSeqs.every((s, j) => s === after.ownerSeqs[j]) : null,
    before.ownerSeqs.length ? (before.ownerSeqs.every((s, j) => s === after.ownerSeqs[j]) ? "同じ" : "違う") : "あやとの合言葉が無い"
  );
  check("試しの人が残っていない（islandUsers・Auth）", await testerGone(uid));

  if (result.checks.some((c) => c.ok === false) && exit === 0) exit = 1;
  if (result.checks.some((c) => c.ok === null) && exit === 0) exit = 1;
  return exit;
}

/* ---------------------------------------------------------------- 表 */

function summary(code) {
  const L = [];
  const verdict = code === 0 ? "合格" : code === 1 ? "落ちた条件がある" : "回せなかった";
  L.push(`## 島の投げ銭を通しで確かめた（Stripe のテスト環境）— ${verdict}`);
  L.push("");
  L.push(`面: ${SITE}・始めた時刻 ${result.startedAt}`);
  if (result.stopped) L.push("", `**止まった: ${result.stopped}**`);
  L.push("");
  L.push("| 額 | Stripe → 口 | 口 → アラート | 合計（押してから名前・額が見えるまで） | 5秒以内 | メッセージ | 届いた（DOM） | /tip に戻った |");
  L.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of result.rounds) {
    L.push(
      `| ¥${r.yen.toLocaleString("ja-JP")} | ${sec(r.stripeToApi)} | ${sec(r.apiToAlert)} | ${sec(r.total)} | ${
        typeof r.total === "number" ? (r.total <= LIMIT_MS ? "○" : "×") : "—"
      } | ${r.msgShown ? `出た（${sec(r.msgAt)}）` : "出ない"} | ${sec(r.arrive)} | ${sec(r.backAt)} |`
    );
  }
  if (!result.rounds.length) L.push("| — | — | — | — | — | — | — | — |");
  L.push("");
  L.push("「Stripe → 口」は「支払う」を押してから口が `islandSiteTips` に書いた時刻（`createdAt`）まで。");
  L.push("「口 → アラート」はそこから、アラート画面で名前と額の札が見えた（不透明度 0.3 超・大きさあり）まで。");
  L.push("");
  L.push("| 確かめ | 結果 | 中身 |");
  L.push("| --- | --- | --- |");
  for (const c of result.checks) L.push(`| ${c.name} | ${c.ok === true ? "○" : c.ok === false ? "×" : "?"} | ${c.detail || ""} |`);
  const shapes = result.rounds.filter((r) => r.shape?.length);
  if (shapes.length) {
    L.push("", "<details><summary>支払い画面の欄（見つからなかったとき）</summary>", "", "```");
    for (const r of shapes) L.push(...r.shape);
    L.push("```", "</details>");
  }
  if (result.rounds.some((r) => r.alerts?.length)) {
    L.push("", `支払い画面の知らせ: ${result.rounds.flatMap((r) => r.alerts ?? []).join(" / ")}`);
  }
  if (result.notes.length) L.push("", ...result.notes.map((n) => `- ${n}`));
  L.push("", "録画: 枝 `review-media/tip-e2e`（`alert.webm`・`tip.webm`・回ごとの絵）");
  return L.join("\n");
}

let code = 2;
try {
  code = await main();
} catch (e) {
  result.stopped = result.stopped ?? `準備で止まった: ${why(e)}`;
  code = 2;
}
result.finishedAt = new Date().toISOString();
result.code = code;
mkdirSync(PUB, { recursive: true });
const md = summary(code);
writeFileSync(join(PUB, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(join(OUT, "summary.md"), md + "\n");
writeFileSync(join(PUB, "summary.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
say(`終わり: ${code}`);
process.exit(code);
