/**
 * あやと島の「動くところ」用 API。
 *
 * ブラウザから Firestore を直接触らせず、この Function を通す。
 *   - Firestore のセキュリティルールを変えずに済む(既存の月末配信ページに影響が出ない)
 *   - 連投制限・文字数制限・非表示などをサーバー側にまとめられる
 *   - 読み取りは CDN にキャッシュさせられるので Firestore の読み取り回数を抑えられる
 *
 * ログインは要求しない。1人1票と連投制限は、ブラウザが持つ端末ID(cid)で行う。
 * 厳密な本人確認ではなく「ボットの連打を止める」ためのもの。
 *
 * YouTube のアカウントでログインしている人は、それに加えて本人が分かる。
 * その場合は端末IDではなく uid を鍵にするので、端末を変えても同じ人として扱える。
 *
 * 管理操作(非表示にする・消す)はここには置かない。
 * GitHub Actions の「管理スクリプトを実行」から、
 * Firebase のサービスアカウントで直接 Firestore を触る。
 */

import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const STATE_DOC = db.collection("island").doc("state");
const IDEAS = db.collection("islandIdeas");
const NOTES = db.collection("islandNotes");
const VOTES = db.collection("islandVotes");
const RATE = db.collection("islandRate");
const USERS = db.collection("islandUsers");
const DRAFTS = db.collection("islandDrafts");
/* 今夜のおたずね。選択肢を押すだけで意思表示できる、参加のいちばん下の段。
   作りは islandIdeas + islandVotes とまったく同じ。
   問いの入稿は Firestore を手で書く(python/admin/firestore_write.py)。 */
const POLLS = db.collection("islandPolls");
const PVOTES = db.collection("islandPollVotes");
/* 今日ここに来た人の数(docs/island-play.md 仕掛け16)。
   「いま何人います」は出さない。作れないうえに、たいていの時間帯は
   「1人」と出て島が寂れて見える。日単位なら数十〜数百になる。
   1日1ドキュメントに数を足すだけ。誰が来たかは持たない。 */
const VISITS = db.collection("islandVisits");

/* 北欧旅の足代(docs/nordic-fund.md 提案5)。
   doneruAmount は cors: true なのでブラウザから直接叩けるが、叩かせない。
   静的書き出しのページに Doneru の goal key を焼き込むことになるので、
   鍵は Functions の中に置いたまま、こちらから叩いて数字だけ返す。 */
const DONERU_GOAL = "https://api.doneru.jp/widget/goal/data";
/** Doneru を叩き直す間隔。1人ずつ叩くと相手先に迷惑なので、しばらく寝かせる。 */
const FUND_TTL_MS = 5 * 60 * 1000;
let fundCache: {at: number; doneru: number} | null = null;

const MAX_IDEA_LEN = 200;
const MAX_NOTE_LEN = 120;
const MAX_NAME_LEN = 20;
const MAX_DRAFT_LEN = 12000;
const DRAFTS_PER_DAY = 12;
const IDEAS_PER_DAY = 8;
const NOTES_PER_DAY = 20;
// 1人1票なので投票そのものは重複しない。ここは連打してくるボットを止めるためだけの数。
const POLL_VOTES_PER_DAY = 30;

type Json = Record<string, unknown>;

/** ログインしている人。していなければ null。 */
type Who = {uid: string; name: string; channelId?: string} | null;

/**
 * Authorization ヘッダの合言葉を確かめて、誰かを返す。
 * 合言葉が無い・古い場合は黙って null を返す(ログインなしでも使えるので)。
 * @param {string | undefined} header Authorization ヘッダ
 * @return {Promise<Who>} ログインしている人
 */
async function whoIs(header?: string): Promise<Who> {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return null;
  try {
    const t = await admin.auth().verifyIdToken(m[1]);
    const snap = await USERS.doc(t.uid).get();
    const saved = snap.exists ? snap.data() ?? {} : {};
    return {
      uid: t.uid,
      name:
        clean(saved.name ?? t.name ?? "", MAX_NAME_LEN) || "名無しさん",
      channelId: (saved.channelId as string) || undefined,
    };
  } catch (e) {
    logger.warn("token verify failed", String(e));
    return null;
  }
}

/**
 * 島に名前を出してよいと決めた人だけを返す。
 *
 * 名前も YouTube のアイコンも、出すか出さないかは本人が決める。
 * 何もしていない人は、キャラクターだけが島にいて名前は出ない。
 * @return {Promise<Json[]>} キャラクターと、出してよい名前・アイコン
 */
async function listResidents(): Promise<Json[]> {
  const snap = await USERS.where("character", "!=", null).limit(200).get();
  const out: Json[] = [];
  snap.forEach((d) => {
    const u = d.data() ?? {};
    if (!u.character) return;
    if (!u.showName && !u.showPhoto) return;
    out.push({
      icon: u.character,
      name: u.showName ?
        (u.nickname as string) || (u.name as string) || null :
        null,
      photo: u.showPhoto ? (u.photo as string) || null : null,
    });
  });
  return out;
}

/**
 * 企画ページの下書きを、保存してよい形に整える。
 *
 * ここに入るのは、あやとが「書いていいよ」と決めた視聴者さんが書いたもの。
 * それでも受け取る側では長さと形だけは必ず切りそろえる。
 * 中身の良し悪しは、あやとが Claude Code で仕上げるときに直す。
 * @param {Json} b 送られてきた中身
 * @return {Json} 保存する形
 */
function shapeDraft(b: Json): Json {
  const arr = (v: unknown, n: number, f: (x: Json) => Json) =>
    Array.isArray(v) ? v.slice(0, n).map((x) => f((x ?? {}) as Json)) : [];
  const place = (b.place ?? {}) as Json;
  return {
    title: clean(b.title, 60),
    when: clean(b.when, 40),
    date: clean(b.date, 10),
    note: clean(b.note, 200),
    tags: Array.isArray(b.tags) ?
      b.tags.slice(0, 6).map((t) => clean(t, 16)) :
      [],
    place: {
      name: clean(place.name, 60),
      area: clean(place.area, 60),
      map: clean(place.map, 300),
    },
    about: Array.isArray(b.about) ?
      b.about.slice(0, 8).map((p) => clean(p, 600)) :
      [],
    links: arr(b.links, 8, (x) => ({
      label: clean(x.label, 60),
      href: clean(x.href, 300),
    })),
    photos: arr(b.photos, 8, (x) => ({
      src: clean(x.src, 400),
      alt: clean(x.alt, 120),
      credit: clean(x.credit, 120),
      creditHref: clean(x.creditHref, 300),
    })),
    embeds: arr(b.embeds, 4, (x) => ({
      kind: x.kind === "youtube" ? "youtube" : "instagram",
      id: clean(x.id, 40),
      note: clean(x.note, 120),
    })),
  };
}

/**
 * 島の「1日」。UTC で切ってある。
 *
 * 日本時間の朝9時で変わるので、**配信の一晩（22時〜25時）が1日の中に収まる**。
 * JST で切ると 0時をまたいだ配信が2日に割れて、連投制限も訪問者数も夜中に半分になる。
 * 画面に出す日付は JST（`site/lib/nightly.ts`）だが、こちらは数える側の都合で決める。
 * @return {string} YYYY-MM-DD
 */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * 制御文字を落として、長さを切る。
 * @param {unknown} v 入力
 * @param {number} max 最大文字数
 * @return {string} 整えた文字列
 */
const clean = (v: unknown, max: number): string => {
  let out = "";
  for (const ch of String(v ?? "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, max);
};

/**
 * x-forwarded-for から最初のIPだけ取る。
 * @param {unknown} v ヘッダの値
 * @return {string | null} IP か null
 */
const fwd = (v: unknown): string | null =>
  String(v ?? "").split(",")[0]?.trim() || null;

/**
 * 端末IDとして妥当か。
 * @param {unknown} v 入力
 * @return {boolean} 妥当なら true
 */
const isCid = (v: unknown): boolean =>
  typeof v === "string" && v.length >= 8 && v.length <= 64;

/**
 * cid ごとの1日あたり回数を1つ消費する。
 * @param {string} cid ブラウザが持つ端末ID
 * @param {string} kind 種別(idea / note)
 * @param {number} limit 1日あたりの上限
 * @return {Promise<boolean>} 上限内なら true
 */
async function takeQuota(
  cid: string,
  kind: string,
  limit: number,
): Promise<boolean> {
  const ref = RATE.doc(`${kind}_${today()}_${cid}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = (snap.exists ? (snap.data()?.n as number) : 0) ?? 0;
      if (n >= limit) return false;
      const at = Date.now();
      tx.set(ref, {n: n + 1, kind, day: today(), updatedAt: at}, {merge: true});
      return true;
    });
  } catch (e) {
    logger.error("takeQuota failed", e);
    return false;
  }
}

/**
 * 表示できる企画提案を新しい順に取る。
 * @param {number} limit 最大件数
 * @return {Promise<object[]>} 企画提案の配列
 */
async function listIdeas(limit = 120) {
  // where + orderBy の組み合わせは複合インデックスが要るので、
  // 並べ替えだけ Firestore に任せて、非表示の除外はこちらで行う。
  const snap = await IDEAS.orderBy("createdAt", "desc")
    .limit(limit * 2)
    .get();
  return snap.docs
    .filter((d) => d.data().hidden !== true)
    .slice(0, limit)
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        text: v.text as string,
        name: (v.name as string) || undefined,
        byUid: (v.uid as string) || undefined,
        votes: (v.votes as number) ?? 0,
        status: (v.status as string) ?? "open",
        createdAt: new Date(
          (v.createdAt as number) ?? Date.now(),
        ).toISOString(),
      };
    });
}

/**
 * 表示できる付箋を新しい順に取る。
 * @param {number} limit 最大件数
 * @return {Promise<object[]>} 付箋の配列
 */
async function listNotes(limit = 200) {
  const snap = await NOTES.orderBy("createdAt", "desc")
    .limit(limit * 2)
    .get();
  return snap.docs
    .filter((d) => d.data().hidden !== true)
    .slice(0, limit)
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        planId: v.planId as string,
        text: v.text as string,
        createdAt: new Date(
          (v.createdAt as number) ?? Date.now(),
        ).toISOString(),
      };
    });
}

/** 投票の中身。集計そのものはドキュメントの votes に入っている。 */
type PollShape = {
  id: string;
  question: string;
  options: {id: string; label: string; votes: number}[];
  total: number;
  /** 締め切り。過ぎたものは出さない */
  openUntil: string | null;
};

/**
 * 問いを、そのまま画面に出せる形に整える。
 * @param {string} id ドキュメントID
 * @param {Json} v ドキュメントの中身
 * @return {PollShape} 整えた問い
 */
function shapePoll(id: string, v: Json): PollShape {
  const votes = (v.votes ?? {}) as Record<string, number>;
  const raw = Array.isArray(v.options) ? v.options : [];
  const options = raw.slice(0, 4).map((o) => {
    const x = (o ?? {}) as Json;
    const oid = clean(x.id, 24);
    return {id: oid, label: clean(x.label, 40), votes: votes[oid] ?? 0};
  });
  return {
    id,
    question: clean(v.question, 80),
    options,
    total: options.reduce((n, o) => n + o.votes, 0),
    openUntil: (v.openUntil as string) || null,
  };
}

/**
 * いま出ている問い。締め切り前で、隠していないもののうち新しい1つ。
 *
 * where + orderBy を組むと複合インデックスが要るので、
 * 並べ替えだけ Firestore に任せて、締め切りの判定はこちらで行う。
 * @return {Promise<PollShape | null>} 問い、無ければ null
 */
async function openPoll(): Promise<PollShape | null> {
  const snap = await POLLS.orderBy("createdAt", "desc").limit(5).get();
  const now = new Date().toISOString();
  for (const d of snap.docs) {
    const v = d.data() ?? {};
    if (v.hidden === true) continue;
    if (v.openUntil && String(v.openUntil) < now) continue;
    const p = shapePoll(d.id, v);
    if (p.question && p.options.length >= 2) return p;
  }
  return null;
}

/**
 * Doneru に集まっている額。鍵が無い・届かないときは null。
 *
 * 0 を返さない。0円と出すのがいちばん悪くて、誰も出していないように見える
 * (`docs/nordic-fund.md` 提案5)。分からないときは「分からない」で返す。
 * @return {Promise<number | null>} 集まっている額(円)
 */
async function doneruNow(): Promise<number | null> {
  const key = process.env.DONERU_GOAL_KEY ?? "";
  if (!key) return null;
  if (fundCache && Date.now() - fundCache.at < FUND_TTL_MS) {
    return fundCache.doneru;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(
      `${DONERU_GOAL}?key=${encodeURIComponent(key)}`,
      {signal: ctl.signal},
    );
    if (!r.ok) throw new Error(`doneru ${r.status}`);
    const j = (await r.json()) as Json;
    const n = Number(j.amount);
    if (!Number.isFinite(n) || n < 0) throw new Error("bad amount");
    fundCache = {at: Date.now(), doneru: n};
    return n;
  } catch (e) {
    logger.warn("doneru goal read failed", String(e));
    // 前に読めた値があれば、そちらを使う。数字が消えるより古いほうがまし
    return fundCache?.doneru ?? null;
  } finally {
    clearTimeout(t);
  }
}

export const islandApi = onRequest(
  {region: "us-central1", cors: true, maxInstances: 10},
  async (req, res) => {
    // Hosting の rewrite 経由でも直叩きでも動くように、前置きのパスを落とす
    const path = (req.path || "/").replace(/^\/island-api/, "") || "/";
    const method = req.method.toUpperCase();
    const raw = req.body;
    const body: Json =
      typeof raw === "object" && raw ? (raw as Json) : ({} as Json);

    try {
      /* ---------------- ログイン ---------------- */
      // ログインした直後に呼ばれる。誰が来たかを覚えておくだけ。
      if (method === "POST" && path === "/me") {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        if (!m) {
          res.status(401).json({error: "no token"});
          return;
        }
        let t;
        try {
          t = await admin.auth().verifyIdToken(m[1]);
        } catch {
          res.status(401).json({error: "bad token"});
          return;
        }
        const name = clean(body.title ?? t.name ?? "", MAX_NAME_LEN);
        const channelId = clean(body.channelId, 64);
        const now = Date.now();
        const ref = USERS.doc(t.uid);
        const prev = await ref.get();
        const patch: Json = {
          lastSeenAt: now,
          firstSeenAt: prev.exists ? prev.data()?.firstSeenAt ?? now : now,
        };
        // ログインしたときだけ届く、YouTube から取れた本人の情報
        if (name) patch.name = name;
        if (channelId) patch.channelId = channelId;
        if (body.thumbnail !== undefined) {
          patch.photo = clean(body.thumbnail, 300) || null;
        }
        // 島での見え方。出すか出さないかは、本人が決める。
        if (body.nickname !== undefined) {
          patch.nickname = clean(body.nickname, MAX_NAME_LEN) || null;
        }
        if (body.character !== undefined) {
          patch.character = clean(body.character, 64) || null;
        }
        if (body.showName !== undefined) patch.showName = !!body.showName;
        if (body.showPhoto !== undefined) patch.showPhoto = !!body.showPhoto;
        await ref.set(patch, {merge: true});
        const saved = {...(prev.data() ?? {}), ...patch};
        res.json({
          uid: t.uid,
          name,
          channelId: channelId || undefined,
          nickname: (saved.nickname as string) ?? null,
          character: (saved.character as string) ?? null,
          showName: !!saved.showName,
          showPhoto: !!saved.showPhoto,
        });
        return;
      }

      /* ---------------- 企画ページの下書き ---------------- */
      /* あやとが「書いていいよ」と決めた人だけが書ける。
         下書きはそのまま公開せず、あやとが Claude Code で仕上げてから
         content/plans.ts に入る。ここは受け皿までを持つ。 */
      if (path === "/drafts" || path.startsWith("/drafts/")) {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        if (!m) {
          res.status(401).json({error: "no token"});
          return;
        }
        let t;
        try {
          t = await admin.auth().verifyIdToken(m[1]);
        } catch {
          res.status(401).json({error: "bad token"});
          return;
        }
        const meSnap = await USERS.doc(t.uid).get();
        const me = meSnap.data() ?? {};
        if (!me.canDraft && !me.admin) {
          res.status(403).json({error: "not allowed"});
          return;
        }

        if (method === "GET" && path === "/drafts") {
          const q = me.admin ?
            DRAFTS.orderBy("updatedAt", "desc").limit(80) :
            DRAFTS.where("uid", "==", t.uid).limit(40);
          const snap = await q.get();
          res.json({
            drafts: snap.docs.map((d) => ({id: d.id, ...(d.data() ?? {})})),
          });
          return;
        }

        if (method === "POST" && path === "/drafts") {
          const body2 = body;
          if (JSON.stringify(body2).length > MAX_DRAFT_LEN) {
            res.status(400).json({error: "too long"});
            return;
          }
          const draft = shapeDraft(body2);
          if (!(draft.title as string)) {
            res.status(400).json({error: "no title"});
            return;
          }
          if (!(await takeQuota(t.uid, "draft", DRAFTS_PER_DAY))) {
            res.status(429).json({error: "too many"});
            return;
          }
          const id = clean(body2.id, 40);
          const now = Date.now();
          const ref = id ? DRAFTS.doc(id) : DRAFTS.doc();
          if (id) {
            const cur = await ref.get();
            if (cur.exists && cur.data()?.uid !== t.uid && !me.admin) {
              res.status(403).json({error: "not yours"});
              return;
            }
          }
          await ref.set(
            {
              ...draft,
              uid: t.uid,
              by: clean(me.nickname ?? me.name ?? t.name ?? "", MAX_NAME_LEN),
              updatedAt: now,
              createdAt: id ? undefined : now,
            },
            {merge: true},
          );
          res.json({id: ref.id, draft});
          return;
        }

        res.status(404).json({error: "not found"});
        return;
      }

      /* ---------------- 読み取り ---------------- */
      if (method === "GET" && path === "/state") {
        const [stateSnap, ideas, notes, residents] = await Promise.all([
          STATE_DOC.get(),
          listIdeas(60),
          listNotes(),
          listResidents(),
        ]);
        const state = stateSnap.exists ? stateSnap.data() ?? {} : {};
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({
          current: state.current ?? null,
          stats: state.stats ?? null,
          ideas,
          notes,
          residents,
        });
        return;
      }

      /* ---------------- 北欧旅の足代 ----------------
         返すのは合計と人数だけ。**個人の金額も順位も返さない**
         (`docs/nordic-fund.md` の決めごと)。
         スパチャは満額で数える。OBS が半額にしているのは配信の演出上の都合で、
         同じことをサイトでやると、出した人が自分の額を見つけられない。 */
      if (method === "GET" && path === "/fund") {
        const [doneru, snap] = await Promise.all([
          doneruNow(),
          STATE_DOC.get(),
        ]);
        const f = ((snap.exists ? snap.data() ?? {} : {}).fund ?? {}) as Json;
        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        // 毎日の集計(python/island_daily_stats.py)が置いていくぶん
        const superchat = num(f.superchat);
        const start = num(f.start);
        let total = (doneru ?? 0) + superchat + start;
        // どれも読めなかったときだけ、集計が置いていった合計に落ちる
        if (total <= 0) total = num(f.total);
        /* 1円も分からないときは、200 で 0 を返さない。
           0円は「誰も出していない」に見えるし、CDN に5分ぶん焼き付く。
           鍵がまだ無いあいだ(GitHub #110)は毎回ここに来る。画面は 200 以外を
           「読めなかった」として黙って足代の数字を消すので、これでいい。 */
        if (total <= 0) {
          res.set("Cache-Control", "no-store");
          res.status(503).json({error: "no fund data"});
          return;
        }
        res.set(
          "Cache-Control",
          "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
        );
        res.json({
          total,
          people: num(f.people),
          updatedAt: num(f.updatedAt) || null,
        });
        return;
      }

      if (method === "GET" && path === "/ideas") {
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({ideas: await listIdeas()});
        return;
      }

      /* ---------------- 企画提案 ---------------- */
      if (method === "POST" && path === "/ideas") {
        const who = await whoIs(req.headers.authorization);
        const text = clean(body.text, MAX_IDEA_LEN);
        const name = who?.name ?? clean(body.name, MAX_NAME_LEN);
        const cid = String(body.cid ?? "");
        if (text.length < 4) {
          res.status(400).json({error: "text too short"});
          return;
        }
        if (!isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "idea", IDEAS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const ref = await IDEAS.add({
          text,
          name: name || null,
          votes: 0,
          hidden: false,
          status: "open",
          cid,
          uid: who?.uid ?? null,
          channelId: who?.channelId ?? null,
          createdAt: now,
          ip: fwd(req.headers["x-forwarded-for"]),
        });
        res.json({
          idea: {
            id: ref.id,
            text,
            name: name || undefined,
            votes: 0,
            status: "open",
            createdAt: new Date(now).toISOString(),
          },
        });
        return;
      }

      const voteMatch = path.match(
        /^\/ideas\/([A-Za-z0-9_-]{6,})\/vote$/,
      );
      if (method === "POST" && voteMatch) {
        const id = voteMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = VOTES.doc(`${id}_${who?.uid ?? cid}`);
        const ideaRef = IDEAS.doc(id);
        const votes = await db.runTransaction(async (tx) => {
          const [v, i] = await Promise.all([
            tx.get(voteRef),
            tx.get(ideaRef),
          ]);
          if (!i.exists) throw new Error("no idea");
          const cur = (i.data()?.votes as number) ?? 0;
          if (v.exists) return cur;
          tx.set(voteRef, {at: Date.now()});
          tx.update(ideaRef, {votes: cur + 1});
          return cur + 1;
        });
        res.json({votes});
        return;
      }

      /* ---------------- 今夜のおたずね ----------------
         参加の階段のいちばん下の段。文章を書かずに、押すだけで数字が動く。
         「さんせい」は誰かが企画を書かないと押すものが無いが、
         こちらは**こちらから問いを出している**ので、掲示板が空でも押せる。 */
      if (method === "GET" && path === "/poll") {
        // 押した瞬間に数字が動くのが要なので、読みは短めに寝かせる
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({poll: await openPoll()});
        return;
      }

      const pollMatch = path.match(/^\/poll\/([A-Za-z0-9_-]{4,})\/vote$/);
      if (method === "POST" && pollMatch) {
        const id = pollMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        const option = clean(body.option, 24);
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!option) {
          res.status(400).json({error: "no option"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "poll", POLL_VOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = PVOTES.doc(`${id}_${who?.uid ?? cid}`);
        const pollRef = POLLS.doc(id);
        let out: PollShape | null = null;
        let mine = "";
        try {
          [out, mine] = await db.runTransaction(async (tx) => {
            const [v, p] = await Promise.all([
              tx.get(voteRef),
              tx.get(pollRef),
            ]);
            if (!p.exists) throw new Error("no poll");
            const data = p.data() ?? {};
            // 引っ込めた問いは、IDを知っていても押せない。
            // 一覧に出さないだけだと、前に開いた画面から押し続けられる。
            if (data.hidden === true) throw new Error("closed");
            const shaped = shapePoll(id, data);
            if (!shaped.options.some((o) => o.id === option)) {
              throw new Error("bad option");
            }
            const nowIso = new Date().toISOString();
            if (shaped.openUntil && shaped.openUntil < nowIso) {
              throw new Error("closed");
            }
            // もう押している人は数えない。押し直しもさせない(1人1票)
            if (v.exists) {
              return [shaped, clean(v.data()?.option, 24)] as const;
            }
            const votes = {...((data.votes ?? {}) as Record<string, number>)};
            votes[option] = (votes[option] ?? 0) + 1;
            tx.set(voteRef, {
              at: Date.now(),
              option,
              cid: cid || null,
              uid: who?.uid ?? null,
            });
            tx.update(pollRef, {votes});
            return [shapePoll(id, {...data, votes}), option] as const;
          });
        } catch (e) {
          const why = String(e);
          const code = why.includes("no poll") ? 404 : 400;
          res.status(code).json({error: why.replace("Error: ", "")});
          return;
        }
        res.json({poll: out, mine});
        return;
      }

      /* ---------------- 今日、島に来た人 ----------------
         「誰かがそこにいる」を、同時接続ではなく日単位で出す
         (docs/island-play.md 仕掛け16・および「移さないもの」の18)。

         ブラウザは1日1回しか叩かない（数えた日を覚えている）。
         それでも消された端末や新しい端末から何度も来るので、
         takeQuota で1日1回に締める。**誰が来たかは残さない。**
         残るのは islandRate の「visit を1回使った」だけで、これは翌日には意味を失う。 */
      if (method === "POST" && path === "/visit") {
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        const day = today();
        // 数える前に、この人の今日ぶんが残っているかを見る。
        // 残っていなければ足さずに、いまの数だけ返す
        const fresh = await takeQuota(who?.uid ?? cid, "visit", 1);
        const ref = VISITS.doc(day);
        /* 1日1ドキュメントなので、書き込みが集まると詰まる。
           Firestore は同じドキュメントに毎秒1回までなので、
           1日に数千人まではこれで足りる。足りなくなったら分割する。 */
        const n = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const cur = (snap.data()?.n as number) ?? 0;
          if (!fresh) return cur;
          tx.set(ref, {n: cur + 1, day, updatedAt: Date.now()}, {merge: true});
          return cur + 1;
        });
        res.json({day, visits: n});
        return;
      }

      /* ---------------- 付箋 ---------------- */
      if (method === "POST" && path === "/notes") {
        const who = await whoIs(req.headers.authorization);
        const text = clean(body.text, MAX_NOTE_LEN);
        const planId = clean(body.planId, 40);
        const cid = String(body.cid ?? "");
        if (text.length < 2 || !planId) {
          res.status(400).json({error: "bad input"});
          return;
        }
        if (!isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "note", NOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const now = Date.now();
        const ref = await NOTES.add({
          planId,
          text,
          hidden: false,
          cid,
          uid: who?.uid ?? null,
          name: who?.name ?? null,
          createdAt: now,
        });
        res.json({
          note: {
            id: ref.id,
            planId,
            text,
            createdAt: new Date(now).toISOString(),
          },
        });
        return;
      }

      res.status(404).json({error: "not found", path});
    } catch (e) {
      logger.error("islandApi failed", {
        path,
        method,
        error: String(e),
      });
      res.status(500).json({error: "internal"});
    }
  },
);
