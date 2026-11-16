/* 写真の取り込み（Google フォト → あやと島カード）の口。
   仕様は `docs/card-import.md`（2章の置き場と状態の決まり・3章の口）。

   **全部あやとだけ。** 候補には旅先の写真がそのまま並ぶので、読むほうも
   書くほうも `ownerUid` を通らない道を作らない（`fundDesk.ts` と同じ形）。

   登録は手で貼る `POST /nordic/photos` と同じ `saveEventImage` を通す。
   ここはそれを**借りる**だけで、写真の置き方・カードの作り方を持たない。
   2か所に持つと、片方だけ直したときに手で貼った写真と取り込んだ写真で
   カードの渡り方が割れる。 */
import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {IMAGES, isDay} from "./streamEvents";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

type Json = Record<string, unknown>;

/** 候補1枚（`docs/card-import.md` 2章）。書類IDは元の写真の SHA-256。 */
export const IMPORT = db.collection("islandCardImport");
/** 取り込み1回の記録。書類IDは batch。 */
export const RUNS = db.collection("islandCardImportRuns");

/** 元の写真の SHA-256。**この形しか置き場の道に入れない**（`..` も `/` も通さない）。 */
export const SHA = /^[0-9a-f]{64}$/;
/** 取り込みの名前。Actions の `card_import_actions.py` の `BATCH` と同じ形。 */
export const BATCH = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** 状態（2章）。 */
export const STATUSES = [
  "candidate",
  "calib",
  "excluded",
  "registering",
  "registered",
  "failed",
  "withdrawn",
] as const;
type Status = typeof STATUSES[number];

/** 一覧に返す上限。1回の取り込みで数百枚の想定。黙って切らないよう、超えたら札を出す。 */
const MAX_LIST = 3000;
/** 下見で、日ごとの人数を同時に引く日数 */
const DRY_PARALLEL = 16;
/** 外す／戻すを1回に受ける数。Firestore の取引の書き込み上限（500）の内側。 */
const MAX_DECIDE = 400;
/** 1回の登録で拾う既定の数と上限。1枚あたり置き場の読み書きとカードの作成で1秒前後。 */
const REGISTER_DEFAULT = 10;
const REGISTER_MAX = 20;
/** `registering` のまま、これより古いものは途中で落ちたとみなして拾い直す。 */
export const STALE_MS = 10 * 60 * 1000;
/** 置き場の大きさ。本体は `saveEventImage` の上限（4MB）と下限（1KB）に合わせる。 */
const CAND_MIN = 1024;
const CAND_MAX = 4 * 1024 * 1024;
const THUMB_MAX = 600 * 1024;
/** 失敗の理由に残す長さ。人が読む札なので短く。 */
const ERROR_LEN = 120;

/** 呼ぶ側から借りるもの。「誰か」と「写真の置き方」を2か所に増やさない。 */
export type CardImportDeps = {
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
  /** 置き場（Firebase の既定のバケット） */
  bucket: string;
  /**
   * 1枚を、手で貼るのと同じ道で登録する。**1日の枠は使わない・`importSha` を書く。**
   * 返すのは画像のID、断られたら理由。
   */
  saveImage: (
    uid: string,
    buf: Buffer,
    day: string,
    sha: string,
    size: {w: number; h: number},
  ) => Promise<{ok: true; id: string} | {ok: false; error: string}>;
  /** その日の写真を登録したら、何人にカードが渡るか（`tipsForImage` で数える） */
  peopleOnDay: (day: string) => Promise<number>;
};

/** 受け取るもの。Express の req から要るものだけ。 */
export type CardImportReq = {
  method: string;
  path: string;
  auth?: string;
  query: Json;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type CardImportRes = {
  set(k: string, v: string): unknown;
  status(n: number): CardImportRes;
  json(b: unknown): unknown;
  send(b: unknown): unknown;
};

/* 置き場の道。**sha は必ず `SHA` を通してから渡す。** */
export const candPath = (sha: string): string =>
  `cardImport/cand/${sha}.webp`;
export const thumbPath = (sha: string): string =>
  `cardImport/thumb/${sha}.webp`;

/**
 * 中身の頭が webp か。名乗り（拡張子・Content-Type）では見ない。
 * @param {Buffer} b 中身
 * @return {boolean} webp なら true
 */
export function isWebp(b: Buffer): boolean {
  return (
    b.length >= 12 &&
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/**
 * 短い字にする。制御文字を落として切る。
 * @param {unknown} v 何か
 * @param {number} max 長さの上限
 * @return {string} 字
 */
function short(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

/**
 * 数にする。範囲の外は端に寄せる。
 * @param {unknown} v 何か
 * @param {number} lo 下限
 * @param {number} hi 上限
 * @return {number} 数
 */
function num(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 候補1枚を画面に出す形にする。**置き場の道も、元のファイル名も返さない**
 * （そもそも持っていない。2章）。
 * @param {string} sha 書類ID
 * @param {Json} v 中身
 * @return {Json} 画面に出す1枚
 */
function itemShape(sha: string, v: Json): Json {
  return {
    sha,
    batch: short(v.batch, 64),
    status: short(v.status, 16),
    day: isDay(v.day) ? v.day : "",
    takenAt: short(v.takenAt, 40),
    w: num(v.w, 0, 20000),
    h: num(v.h, 0, 20000),
    tw: num(v.tw, 0, 20000),
    th: num(v.th, 0, 20000),
    category: short(v.category, 32),
    score: num(v.score, -1e6, 1e6),
    group: short(v.group, 40),
    ambiguous: v.ambiguous === true,
    reasons: Array.isArray(v.reasons) ?
      v.reasons.slice(0, 12).map((r) => short(r, 80)) :
      [],
    calibAnswer:
      v.calibAnswer === "yes" || v.calibAnswer === "no" ? v.calibAnswer : null,
    imageId: v.imageId ? short(v.imageId, 64) : null,
    error: v.error ? short(v.error, ERROR_LEN) : null,
    updatedAt: num(v.updatedAt, 0, 1e15),
  };
}

/**
 * 登録が拾ってよいか（2章「登録は candidate（と failed の再試行）だけを拾う」）。
 *
 * `registering` は**10分たったものだけ**拾い直す。途中で落ちた回の続き。
 * 10分より新しいものは、いま別の呼び出しが登録している最中かもしれない。
 * @param {Json} v 候補の中身
 * @param {number} now いまの ms
 * @param {boolean} retry `failed` も拾うか
 * @return {boolean} 拾ってよいなら true
 */
export function eligible(v: Json, now: number, retry: boolean): boolean {
  const st = v.status;
  if (st === "candidate") return true;
  if (st === "registering") {
    return now - (Number(v.updatedAt) || 0) >= STALE_MS;
  }
  return retry && st === "failed";
}

/**
 * 外す／戻すの行き先。**candidate ⇄ excluded のほかは動かさない**
 * （登録済み・登録中・認識合わせ・取り下げは、画面から触らせない）。
 * @param {unknown} now いまの状態
 * @param {boolean} exclude 外すなら true
 * @return {Status | null} 行き先。動かさないなら null
 */
export function decideTo(now: unknown, exclude: boolean): Status | null {
  if (exclude && now === "candidate") return "excluded";
  if (!exclude && now === "excluded") return "candidate";
  return null;
}

/**
 * sha の並びを受け取る。形の違うものが1つでもあれば null（黙って落とさない）。
 * @param {unknown} v 来たもの
 * @param {number} max 上限
 * @return {string[] | null} 重なりを除いた並び
 */
function shaList(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return null;
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== "string" || !SHA.test(s)) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * 置き場から1つ読む。無ければ null。
 * @param {string} bucket バケット
 * @param {string} path 道
 * @return {Promise<Buffer | null>} 中身
 */
async function readObject(
  bucket: string,
  path: string,
): Promise<Buffer | null> {
  try {
    const [buf] = await admin.storage().bucket(bucket).file(path).download();
    return buf;
  } catch (e) {
    const code = (e as {code?: unknown}).code;
    if (code === 404 || code === "404") return null;
    throw e;
  }
}

/**
 * 置き場に1つ置く。**ダウンロードの合言葉を付けない**（2章）。
 * 付けると URL を知っている人に見える。画面へは `GET /cardimport/img/<sha>` が返す。
 * @param {string} bucket バケット
 * @param {string} path 道
 * @param {Buffer} buf 中身
 */
async function putObject(bucket: string, path: string, buf: Buffer) {
  await admin
    .storage()
    .bucket(bucket)
    .file(path)
    .save(buf, {
      contentType: "image/webp",
      resumable: false,
      metadata: {cacheControl: "private, max-age=0, no-store"},
    });
}

/**
 * base64 を中身に戻して、webp で大きさの範囲に収まっているかを見る。
 * @param {unknown} v base64（data URL でもよい）
 * @param {number} min 下限
 * @param {number} max 上限
 * @return {Buffer | null} 中身。だめなら null
 */
function webpOf(v: unknown, min: number, max: number): Buffer | null {
  if (typeof v !== "string") return null;
  const b64 = v.replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length < min || buf.length > max || !isWebp(buf)) return null;
  return buf;
}

/** 登録1枚の結果。 */
type OneResult = {
  r: "registered" | "already" | "failed" | "moved";
  imageId?: string;
  error?: string;
};

/**
 * 1枚を登録する。
 *
 * 1. 取引で `registering` に札を立てる（拾ったときから状態が動いていたら触らない）
 * 2. **同じ `importSha` の写真がもう在れば、作らずに `registered` に直す。**
 *    写真を置いたあと・札を `registered` に書く前に落ちた回の続きで、
 *    ここを見ないと同じ写真が2枚になり、同じ人にカードが2枚渡る
 * 3. 私有の置き場から本体を読んで、手で貼るのと同じ道で置く
 * @param {CardImportDeps} deps 借りるもの
 * @param {string} uid あやと
 * @param {string} sha 候補
 * @param {boolean} retry `failed` も拾う回か
 * @return {Promise<OneResult>} 結果
 */
async function registerOne(
  deps: CardImportDeps,
  uid: string,
  sha: string,
  retry: boolean,
): Promise<OneResult> {
  const ref = IMPORT.doc(sha);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const v = (snap.data() ?? {}) as Json;
    if (!snap.exists || !eligible(v, Date.now(), retry)) return null;
    tx.update(ref, {status: "registering", updatedAt: Date.now()});
    return v;
  });
  if (!claimed) return {r: "moved"};
  const done = async (fields: Json) =>
    ref.update({...fields, updatedAt: Date.now()});
  const fail = async (why: string): Promise<OneResult> => {
    const error = short(why, ERROR_LEN);
    await done({status: "failed", error}).catch(() => undefined);
    return {r: "failed", error};
  };
  try {
    const had = await IMAGES.where("importSha", "==", sha).limit(1).get();
    if (!had.empty) {
      const imageId = had.docs[0].id;
      await done({status: "registered", imageId, error: null});
      return {r: "already", imageId};
    }
    const day = claimed.day;
    if (!isDay(day)) return await fail("bad day");
    const buf = await readObject(deps.bucket, candPath(sha));
    if (!buf) return await fail("no file");
    const out = await deps.saveImage(uid, buf, day, sha, {
      w: num(claimed.w, 0, 20000),
      h: num(claimed.h, 0, 20000),
    });
    if (!out.ok) return await fail(out.error);
    await done({status: "registered", imageId: out.id, error: null});
    return {r: "registered", imageId: out.id};
  } catch (e) {
    logger.warn("card import register failed", sha.slice(0, 12), String(e));
    return await fail(String(e));
  }
}

/**
 * `/cardimport` と `/cardimport/*` を扱う。扱ったら true。
 * @param {CardImportReq} q 来たもの
 * @param {CardImportRes} res 返す側
 * @param {CardImportDeps} deps 借りるもの
 * @return {Promise<boolean>} 扱ったら true
 */
export async function handleCardImport(
  q: CardImportReq,
  res: CardImportRes,
  deps: CardImportDeps,
): Promise<boolean> {
  if (q.path !== "/cardimport" && !q.path.startsWith("/cardimport/")) {
    return false;
  }

  /* **どの枝より先に、あやとかを見る。** 形の検めより前に置く。
     後ろに置くと、あやとでない人に「その sha の形なら通る」が分かる。 */
  const uid = await deps.ownerUid(q.auth);
  if (!uid) {
    res.status(403).json({error: "not allowed"});
    return true;
  }
  res.set("Cache-Control", "no-store");

  const img = /^\/cardimport\/img\/([^/]*)$/.exec(q.path);

  try {
    /* ---- 一覧 ---- */
    if (q.method === "GET" && q.path === "/cardimport") {
      const runsSnap = await RUNS.orderBy("createdAt", "desc").limit(30).get();
      const runs = runsSnap.docs.map((d) => {
        const v = (d.data() ?? {}) as Json;
        return {
          batch: d.id,
          range: v.range ?? null,
          missing: Array.isArray(v.missing) ? v.missing : [],
          counts: v.counts ?? {},
          items: num(v.items, 0, 1e6),
          createdAt: num(v.createdAt, 0, 1e15),
          registeredAt: v.registeredAt ? num(v.registeredAt, 0, 1e15) : null,
          registered: num(v.registered, 0, 1e6),
        };
      });
      const want = short(q.query.batch, 64);
      const batch = BATCH.test(want) ? want : runs[0]?.batch ?? "";
      const status: Record<string, number> = {};
      const items: Json[] = [];
      let more = false;
      if (batch) {
        const snap = await IMPORT.where("batch", "==", batch)
          .limit(MAX_LIST + 1)
          .get();
        more = snap.size > MAX_LIST;
        snap.docs.slice(0, MAX_LIST).forEach((d) => {
          const v = itemShape(d.id, (d.data() ?? {}) as Json);
          const st = String(v.status);
          status[st] = (status[st] ?? 0) + 1;
          // 取り下げたもの（新しい manifest から消えた）は数だけ。並べない
          if (st !== "withdrawn") items.push(v);
        });
      }
      res.json({runs, batch, status, items, more});
      return true;
    }

    /* ---- 中身。`<img>` には付かないので、画面は合言葉を付けて取りに来る ---- */
    if (q.method === "GET" && img) {
      const sha = img[1];
      if (!SHA.test(sha)) {
        res.status(400).json({error: "bad sha"});
        return true;
      }
      const path = q.query.s === "t" ? thumbPath(sha) : candPath(sha);
      const buf = await readObject(deps.bucket, path);
      if (!buf) {
        res.status(404).json({error: "not found"});
        return true;
      }
      /* **private。** 手前の CDN に置かせない。中身は sha で決まって変わらない
         ので、あやとのブラウザの中でだけは長く持ってよい。 */
      res.set("Cache-Control", "private, max-age=86400");
      res.set("Content-Type", "image/webp");
      res.send(buf);
      return true;
    }

    /* ---- 外す／戻す ---- */
    if (q.method === "POST" && q.path === "/cardimport/decide") {
      const shas = shaList(q.body.shas, MAX_DECIDE);
      if (!shas || typeof q.body.exclude !== "boolean") {
        res.status(400).json({error: "bad request"});
        return true;
      }
      const exclude = q.body.exclude;
      const now = Date.now();
      const changed = await db.runTransaction(async (tx) => {
        const snaps = await tx.getAll(...shas.map((s) => IMPORT.doc(s)));
        let n = 0;
        for (const s of snaps) {
          if (!s.exists) continue;
          const to = decideTo(s.get("status"), exclude);
          if (!to) continue;
          tx.update(s.ref, {status: to, updatedAt: now});
          n++;
        }
        return n;
      });
      res.json({changed, skipped: shas.length - changed});
      return true;
    }

    /* ---- 認識合わせの答え ---- */
    if (q.method === "POST" && q.path === "/cardimport/calib") {
      const raw = q.body.answers;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DECIDE) {
        res.status(400).json({error: "bad request"});
        return true;
      }
      const answers = new Map<string, "yes" | "no" | null>();
      for (const a of raw as Json[]) {
        const sha = a?.sha;
        const ans = a?.answer;
        if (typeof sha !== "string" || !SHA.test(sha)) {
          res.status(400).json({error: "bad sha"});
          return true;
        }
        if (ans !== "yes" && ans !== "no" && ans !== null) {
          res.status(400).json({error: "bad answer"});
          return true;
        }
        answers.set(sha, ans);
      }
      const now = Date.now();
      const saved = await db.runTransaction(async (tx) => {
        const snaps = await tx.getAll(
          ...[...answers.keys()].map((s) => IMPORT.doc(s)),
        );
        let n = 0;
        for (const s of snaps) {
          // 書くのは認識合わせの1枚にだけ。候補に答えを生やさない
          if (!s.exists || s.get("status") !== "calib") continue;
          tx.update(s.ref, {calibAnswer: answers.get(s.id), updatedAt: now});
          n++;
        }
        return n;
      });
      res.json({saved, skipped: answers.size - saved});
      return true;
    }

    /* ---- 登録 ---- */
    if (q.method === "POST" && q.path === "/cardimport/register") {
      const batch = q.body.batch;
      if (typeof batch !== "string" || !BATCH.test(batch)) {
        res.status(400).json({error: "bad batch"});
        return true;
      }
      /* failed は `retryFailed: true` のときだけ拾う。毎回拾うと、直らない
         1枚で `remaining` が0にならず、画面が回り続ける。 */
      const retry = q.body.retryFailed === true;
      const max = Math.floor(
        num(q.body.max ?? REGISTER_DEFAULT, 1, REGISTER_MAX),
      );
      const now = Date.now();
      const snap = await IMPORT.where("batch", "==", batch)
        .limit(MAX_LIST + 1)
        .get();
      if (snap.size > MAX_LIST) {
        logger.warn("card import list cap hit", batch, snap.size);
      }
      const all = snap.docs.map((d) => ({
        sha: d.id,
        v: (d.data() ?? {}) as Json,
      }));
      const want = all
        .filter((x) => SHA.test(x.sha) && eligible(x.v, now, retry))
        .sort(
          (a, b) =>
            String(a.v.day).localeCompare(String(b.v.day)) ||
            String(a.v.takenAt).localeCompare(String(b.v.takenAt)) ||
            a.sha.localeCompare(b.sha),
        );

      /* **下見は1バイトも書かない。** 何枚・どの日に・その日に何人へ渡るか
         だけを返す。人の名前も ID も返さない（数だけ）。 */
      if (q.body.dryRun === true) {
        const byDay = new Map<string, number>();
        for (const x of want) {
          const d = isDay(x.v.day) ? x.v.day : "";
          byDay.set(d, (byDay.get(d) ?? 0) + 1);
        }
        const order = [...byDay].sort((a, b) => a[0].localeCompare(b[0]));
        /* **日ごとの人数は、16日ずつまとめて引く。** 1日ずつ待つと、2年ぶんの
           取り込み（255日）で 60秒を超え、Hosting が 502 を返した（2026-11-16、
           確認の窓が出ないまま止まった）。1日あたり台帳を2本引くので、束ねても
           同時に32本まで。 */
        const days: {day: string; count: number; people: number}[] = [];
        for (let i = 0; i < order.length; i += DRY_PARALLEL) {
          const part = order.slice(i, i + DRY_PARALLEL);
          const ppl = await Promise.all(
            part.map(([day]) => (day ? deps.peopleOnDay(day) : 0)),
          );
          part.forEach(([day, count], k) =>
            days.push({day, count, people: ppl[k]}),
          );
        }
        /* `people` は日ごとの人数の和（延べ）。同じ人が2日にいれば2と数える。
           カードは写真1枚 × 人で渡るので、渡る枚数ではない。 */
        res.json({
          dryRun: true,
          batch,
          total: want.length,
          days,
          people: days.reduce((n, d) => n + d.people, 0),
        });
        return true;
      }

      const tally = {registered: 0, already: 0, failed: 0, moved: 0};
      const picks = want.slice(0, max);
      const results: {sha: string; status: string; error?: string}[] = [];
      const failed: {sha: string; error: string}[] = [];
      for (const x of picks) {
        const out = await registerOne(deps, uid, x.sha, retry);
        tally[out.r]++;
        if (out.r === "failed") {
          failed.push({sha: x.sha, error: out.error ?? ""});
          results.push({sha: x.sha, status: "failed", error: out.error});
        } else if (out.r !== "moved") {
          results.push({sha: x.sha, status: "registered"});
        }
      }
      /* 残り。**拾ったけれど登録できなかった（failed）ものは数えない。**
         数えると、画面が「0になるまで呼ぶ」ので、直らない1枚で回り続ける。
         failed は別に返す。直したら `retryFailed: true` で拾い直す。 */
      const remaining = want.length - picks.length;
      const picked = new Set(picks.map((x) => x.sha));
      const failedTotal =
        all.filter((x) => x.v.status === "failed" && !picked.has(x.sha))
          .length + tally.failed;
      const doneNow = tally.registered + tally.already;
      if (doneNow > 0) {
        const registered =
          all.filter((x) => x.v.status === "registered").length + doneNow;
        await RUNS.doc(batch).set(
          {registered, registeredAt: Date.now()},
          {merge: true},
        );
      }
      logger.info("card import register", batch, JSON.stringify(tally));
      /* `registered` はこの呼び出しで registered になった数（作らずに直した
         `already` も含む。画面から見ればどちらも「登録できた」）。 */
      res.json({
        batch,
        registered: doneNow,
        already: tally.already,
        moved: tally.moved,
        failed,
        failedTotal,
        remaining,
        results,
      });
      return true;
    }

    /* ---- 取り込み（Actions）から、候補を私有の置き場へ置く ----
       Actions のサービスアカウントは Firebase の置き場に書けない（#283・
       `python/admin/_owner.py`）。書けるのは Functions なので、ここに頼む。 */
    if (q.method === "POST" && q.path === "/cardimport/put") {
      const sha = q.body.sha;
      if (typeof sha !== "string" || !SHA.test(sha)) {
        res.status(400).json({error: "bad sha"});
        return true;
      }
      const cand = webpOf(q.body.cand, CAND_MIN, CAND_MAX);
      const thumb = webpOf(q.body.thumb, 64, THUMB_MAX);
      if (!cand || !thumb) {
        res.status(400).json({error: "not webp"});
        return true;
      }
      await putObject(deps.bucket, candPath(sha), cand);
      await putObject(deps.bucket, thumbPath(sha), thumb);
      res.json({ok: true, bytes: cand.length + thumb.length});
      return true;
    }

    res.status(404).json({error: "not found"});
    return true;
  } catch (e) {
    logger.error("card import failed", q.method, q.path.slice(0, 40), e);
    res.status(500).json({error: "failed"});
    return true;
  }
}
