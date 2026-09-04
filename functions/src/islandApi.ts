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

const MAX_IDEA_LEN = 200;
const MAX_NOTE_LEN = 120;
const MAX_NAME_LEN = 20;
const IDEAS_PER_DAY = 8;
const NOTES_PER_DAY = 20;

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
      name: clean(saved.name ?? t.name ?? "", MAX_NAME_LEN) || "名無しさん",
      channelId: (saved.channelId as string) || undefined,
    };
  } catch (e) {
    logger.warn("token verify failed", String(e));
    return null;
  }
}

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
        await USERS.doc(t.uid).set(
          {
            name: name || null,
            channelId: channelId || null,
            photo: clean(body.thumbnail, 300) || null,
            lastSeenAt: now,
            firstSeenAt: now,
          },
          {merge: true},
        );
        res.json({uid: t.uid, name, channelId: channelId || undefined});
        return;
      }

      /* ---------------- 読み取り ---------------- */
      if (method === "GET" && path === "/state") {
        const [stateSnap, ideas, notes] = await Promise.all([
          STATE_DOC.get(),
          listIdeas(60),
          listNotes(),
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
