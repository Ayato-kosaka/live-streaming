/**
 * 公開バケット（`live-streaming-d3cac-public`）を片づけるための、
 * **1回きりの道具**（#289）。**用が済んだら、この1本ごと外す。**
 *
 * ## なぜ要るか
 *
 * `live-streaming-d3cac-public` は **ログイン無しで一覧まで引ける。**
 * 中に入っているのは、エンドロール（`/credits`。#286 で畳んだ）と
 * 授賞式が読んでいた JSON で、**投げ銭してくれた113人の名前と金額**が
 * そのまま並んでいる。読む画面はもう1つも無いのに、誰でも読める。
 *
 * **これは あやとの持ち物ではない。** 投げ銭してくれた人のもの。
 *
 * 消す道は2つあって、片方は塞がっている。
 *
 * | 誰が | この置き場に対してできること |
 * | --- | --- |
 * | Actions のサービスアカウント | `list` と `get` だけ（2026-09-12 実測。#289） |
 * | Functions のサービスアカウント | **誰も測っていない** |
 *
 * だからここは、**まず測る口**として作ってある。既定では1バイトも書かない。
 *
 * ## できること2つだけ
 *
 * | 口 | 何をするか |
 * | --- | --- |
 * | `GET /island-api/public-purge` | いま何ができるか（`testIamPermissions`）と一覧 |
 * | `POST /island-api/public-purge` | 名指ししたものを、写してから消す |
 *
 * **GET は1バイトも書かない。** POST も `{"apply": true}` が無ければ
 * 空回しで、置き場を読むだけ。
 *
 * ## 写してから消す。順番を逆にしない
 *
 * (a) 私用の置き場（`…firebasestorage.app`。`storage.rules` は
 * `allow read, write: if false` なので、合言葉つきの URL を持たない
 * ものは誰からも読めない）へ写して、(b) **写せたことを置き場から
 * 確かめてから**、(c) 公開バケットから消す。
 *
 * **消してから写すと、失敗したときに取り返せない。**
 *
 * ## 消せる名前は、下の表に書いてある2つだけ
 *
 * `viewer-video/` 以下の mp4 は**視聴者さんが自分で作ったもの**で、
 * 何があっても消さない・触らない・写さない。表に入れないだけでなく、
 * `viewer-video` で始まる名前は**明示的に弾いて、弾いたことを残す。**
 *
 * 「なんでも消せる口」にはしない。名前を渡せば何でも消える口が本番に
 * 残っていると、次に事故が起きたときの原因がここになる。
 *
 * ## 返すもの
 *
 * **中の名前と金額は返さない。** 件数・バイト数・ファイル名・できること、
 * まで。このリポジトリは公開で、Actions のログも誰でも読める。
 *
 * ## なぜ islandApi.ts の中に書かないか
 *
 * あの1本はもう3,000行を超えている。ここは丸ごと別の用事で、向こうと
 * 共有するのは「あやとか」を見る関数だけなので、外に出して**取り付けの
 * 数行だけ**を向こうに足す（`donors.ts`・`cards.ts`・`remote.ts` が先例）。
 * 外に出しておくと、**用が済んだときに1本消すだけで外せる。**
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";

/* 置き場を掴むのに既定のアプリが要る。**取り付け元に頼らない**
   （`donors.ts`・`islandCharacter.ts` と同じ書き出し）。 */
if (admin.apps.length === 0) admin.initializeApp();

/** 公開されている置き場。ログイン無しで一覧まで引ける。 */
const PUBLIC_BUCKET = `${
  process.env.GCLOUD_PROJECT || "live-streaming-d3cac"
}-public`;

/** 写す先。旅の写真と同じ置き場（`islandApi.ts` の `BUCKET` と同じ式）。 */
const PRIVATE_BUCKET =
  process.env.NORDIC_BUCKET ||
  `${process.env.GCLOUD_PROJECT || "live-streaming-d3cac"}.firebasestorage.app`;

/**
 * 写す先の入れ物。
 *
 * **合言葉（`firebaseStorageDownloadTokens`）を付けない。**
 * 付けないかぎり `storage.rules` の `allow read: if false` が効いて、
 * 誰からも読めない。写しは「取り返せるように置いておくもの」であって、
 * 誰かに見せるものではない。
 */
const ARCHIVE_DIR = "purged/public-bucket";

/**
 * 消してよい名前。**コードの中の決め打ちの表。**
 *
 * 画面や入力から増やせるようにしない。増やせる形にした時点で、これは
 * 「なんでも消せる口」になる。
 */
const PURGEABLE = new Set([
  "credits_notifications.json",
  "202601_donation_ceremony.json",
]);

/**
 * **何があっても触らない名前の頭。**
 *
 * `viewer-video/` の mp4 4本は視聴者さんが自分で作ったもの。
 * 表（`PURGEABLE`）に入っていないので既に弾かれるが、**二重に弾く。**
 * 表を書き替えた人が、うっかり足せてしまう形にしない。
 */
const KEEP_PREFIXES = ["viewer-video"];

/** いま何ができるかを聞く項目。`bucket_purge.py` と同じ並び。 */
const PERMISSIONS = [
  "storage.objects.list",
  "storage.objects.get",
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.update",
  "storage.buckets.setIamPolicy",
];

/** 一度に受ける名前の数。表には2つしか無いので、これで足りる。 */
const MAX_NAMES = 10;

/** 名前の長さ。置き場の名前の上限（1024）より手前で切る。 */
const MAX_NAME = 400;

type Json = Record<string, unknown>;

/** 置き場の1つ。**ここで使うものだけ**を書く（偽物を差し込めるように）。 */
export type PurgeFile = {
  name: string;
  metadata?: {size?: string | number; updated?: string};
  getMetadata(): Promise<[{size?: string | number; updated?: string}]>;
  copy(dest: PurgeFile): Promise<unknown>;
  delete(): Promise<unknown>;
};

/** バケット。同上。 */
export type PurgeBucket = {
  name: string;
  file(path: string): PurgeFile;
  getFiles(): Promise<[PurgeFile[]]>;
  iam: {testPermissions(p: string[]): Promise<[Record<string, boolean>]>};
};

/** 置き場そのもの。 */
export type PurgeStorage = {bucket(name: string): PurgeBucket};

/** 呼ぶ側から借りるもの。「誰か」を見るところを2か所に増やさないため。 */
export type PurgeDeps = {
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
  /**
   * 置き場。**渡さなければ本物。**
   * 偽物を差し込んで、呼ばれた順番を確かめるために開けてある
   * （`tools/purge/purgecheck.cjs`）。
   */
  storage?: () => PurgeStorage;
};

/** この口が受け取るもの。Express の req から要るものだけ。 */
export type PurgeReq = {
  method: string;
  path: string;
  auth?: string;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type PurgeRes = {
  set(k: string, v: string): unknown;
  status(n: number): PurgeRes;
  json(b: unknown): unknown;
};

/** 一覧の1行。**中身は入れない。** */
type Listed = {
  name: string;
  bytes: number;
  updatedAt: string | null;
  /** 表に載っているか（＝この口で消せるか） */
  purgeable: boolean;
  /** 何があっても触らないものか */
  keep: boolean;
};

/** 片づけの結果1件。 */
type Done = {
  name: string;
  bytes: number;
  /** 写した先。中身ではなく置き場の名前 */
  archived: string;
  deleted: boolean;
};

/** 片づけに失敗した1件。**どこで止まったかを残す。** */
type Failed = {
  name: string;
  /** 止まった場所。`delete` まで来ていなければ、消えていない */
  step: "read" | "copy" | "verify" | "delete";
  /** 例外の種類だけ。本文は出さない（名前と額が混じりうる） */
  why: string;
};

/**
 * 何があっても触らない名前か。
 * @param {string} name 置き場の名前
 * @return {boolean} 触らないものなら true
 */
function isKept(name: string): boolean {
  return KEEP_PREFIXES.some((p) => name === p || name.startsWith(p + "/") ||
    name.startsWith(p));
}

/**
 * 本物の置き場。
 *
 * `admin.storage()` の型は `@google-cloud/storage` のものなので、
 * ここで書いた**使うところだけの型**とは形が合わない。中身は同じなので
 * 1回だけ被せる。**被せるのはここ1か所。**
 * @return {PurgeStorage} 本物の置き場
 */
function liveStorage(): PurgeStorage {
  return admin.storage() as unknown as PurgeStorage;
}

/**
 * いま何ができるかを聞く。**読むだけ。**
 * @param {PurgeBucket} b 聞く相手
 * @return {Promise<Record<string, boolean> | null>} できることの表。聞けなければ null
 */
async function canDo(
  b: PurgeBucket,
): Promise<Record<string, boolean> | null> {
  try {
    const [got] = await b.iam.testPermissions(PERMISSIONS);
    const out: Record<string, boolean> = {};
    for (const p of PERMISSIONS) out[p] = got?.[p] === true;
    return out;
  } catch (e) {
    /* **聞けなくても一覧は返す。** 聞けないこと自体が答え（権限が
       足りていない）なので、ここで落とすと下見にならない。 */
    logger.warn("public-purge: testIamPermissions failed", String(e));
    return null;
  }
}

/**
 * 一覧を取る。**名前と大きさと日付だけ。中身は開かない。**
 * @param {PurgeBucket} b 見る置き場
 * @return {Promise<Listed[]>} 置いてあるもの
 */
async function listing(b: PurgeBucket): Promise<Listed[]> {
  const [files] = await b.getFiles();
  return files.map((f) => ({
    name: f.name,
    bytes: Number(f.metadata?.size ?? 0) || 0,
    updatedAt:
      typeof f.metadata?.updated === "string" ? f.metadata.updated : null,
    purgeable: PURGEABLE.has(f.name),
    keep: isKept(f.name),
  }));
}

/**
 * 文字列にして、前後の空白を落として、長さで切る。
 * @param {unknown} v 受け取った値
 * @return {string} 整えた文字列
 */
function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, MAX_NAME);
}

/**
 * 今日（日本時間）。写しの置き場所を日ごとに分けるためだけに使う。
 *
 * 同じ日に2回流したら上書きになるが、**1回目で公開バケットからは
 * 消えている**ので、2回目に写すものはもう無い。
 * @param {number} at いまの時刻
 * @return {string} `2026-09-12` の形
 */
function jstDay(at: number): string {
  return new Date(at + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 1件を、写してから消す。
 *
 * **順番を逆にしない。** そして「写した」を自分の言葉で信じない。
 * 写した先を置き場から読み直して、**バイト数が合ってから**消す。
 * @param {PurgeBucket} pub 公開バケット
 * @param {PurgeBucket} priv 写す先
 * @param {string} name 置き場の名前
 * @param {string} day 写す先を分ける日付
 * @return {Promise<Done | Failed>} 片づいたもの、または止まった場所
 */
async function moveOne(
  pub: PurgeBucket,
  priv: PurgeBucket,
  name: string,
  day: string,
): Promise<Done | Failed> {
  const to = `${ARCHIVE_DIR}/${day}/${name}`;
  const src = pub.file(name);
  const dst = priv.file(to);

  let bytes = 0;
  try {
    const [meta] = await src.getMetadata();
    bytes = Number(meta?.size ?? 0) || 0;
  } catch (e) {
    logger.warn("public-purge: read failed", name, String(e));
    return {name, step: "read", why: kindOf(e)};
  }

  try {
    await src.copy(dst);
  } catch (e) {
    logger.warn("public-purge: copy failed", name, String(e));
    return {name, step: "copy", why: kindOf(e)};
  }

  /* **写せたことを、写した本人の言葉ではなく置き場から確かめる**
     （`bucket_purge.py` と同じ決めかた）。ここが通らないうちは
     消さない。 */
  try {
    const [after] = await dst.getMetadata();
    const copied = Number(after?.size ?? 0) || 0;
    if (copied <= 0 || copied !== bytes) {
      logger.warn("public-purge: size mismatch", name, bytes, copied);
      return {name, step: "verify", why: "size-mismatch"};
    }
  } catch (e) {
    logger.warn("public-purge: verify failed", name, String(e));
    return {name, step: "verify", why: kindOf(e)};
  }

  try {
    await src.delete();
  } catch (e) {
    logger.warn("public-purge: delete failed", name, String(e));
    return {name, step: "delete", why: kindOf(e)};
  }
  return {name, bytes, archived: `${priv.name}/${to}`, deleted: true};
}

/**
 * 例外の種類だけを short に出す。**本文は出さない。**
 * @param {unknown} e 捕まえたもの
 * @return {string} 種類の名前と、あれば HTTP の番号
 */
function kindOf(e: unknown): string {
  const code = (e as {code?: unknown})?.code;
  const name = e instanceof Error ? e.name : typeof e;
  return typeof code === "number" || typeof code === "string" ?
    `${name}:${code}` :
    name;
}

/**
 * 公開バケットの片づけの口。**扱った URL なら true を返す。**
 *
 * 呼ぶ側（`islandApi.ts`）は true が返ったらそこで終わる。
 * false のときは何も書いていないので、そのまま次の口へ落ちてよい。
 * @param {PurgeReq} q 受け取ったもの
 * @param {PurgeRes} res 返す先
 * @param {PurgeDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handlePublicPurge(
  q: PurgeReq,
  res: PurgeRes,
  deps: PurgeDeps,
): Promise<boolean> {
  if (q.path !== "/public-purge") return false;
  if (q.method !== "GET" && q.method !== "POST") return false;

  res.set("Cache-Control", "no-store");

  /* **あやとだけ。そして、ここを抜けるまで置き場に触らない。**
     置き場を掴むのも読むのも、403 の道では1回も起きない。 */
  if (!(await deps.ownerUid(q.auth))) {
    res.status(403).json({error: "not allowed"});
    return true;
  }

  const storage = deps.storage ? deps.storage() : liveStorage();
  const pub = storage.bucket(PUBLIC_BUCKET);

  /* ---- 下見。**1バイトも書かない。** ---- */
  if (q.method === "GET") {
    try {
      const [can, files] = await Promise.all([canDo(pub), listing(pub)]);
      res.json({
        bucket: PUBLIC_BUCKET,
        archiveTo: `${PRIVATE_BUCKET}/${ARCHIVE_DIR}`,
        can,
        count: files.length,
        bytes: files.reduce((a, f) => a + f.bytes, 0),
        files,
        /** この口が消せる名前。**表そのもの。** */
        allowed: [...PURGEABLE],
        keepPrefixes: KEEP_PREFIXES,
      });
    } catch (e) {
      logger.warn("public-purge: list failed", String(e));
      res.status(502).json({error: "unavailable", why: kindOf(e)});
    }
    return true;
  }

  /* ---- 片づけ。**名前で明示されたものだけ。** ---- */
  const raw = Array.isArray(q.body.names) ? q.body.names : [];
  const names = [...new Set(raw.map(clean).filter((n) => n))].slice(
    0,
    MAX_NAMES + 1,
  );
  if (names.length === 0) {
    res.status(400).json({error: "no names", allowed: [...PURGEABLE]});
    return true;
  }
  if (names.length > MAX_NAMES) {
    res.status(400).json({error: "too many names", max: MAX_NAMES});
    return true;
  }

  /* **弾いたことを残す。** 何も言わずに落とすと、渡した側は
     「消えた」と読む。 */
  const kept = names.filter(isKept);
  for (const n of kept) {
    logger.warn(
      "public-purge: 視聴者さんのものなので触りません",
      n,
    );
  }
  const unknown = names.filter((n) => !isKept(n) && !PURGEABLE.has(n));
  if (kept.length > 0 || unknown.length > 0) {
    /* **1つでも表に無ければ、1件も手を付けない。** 途中まで消して
       残りを断ると、何が消えたのかが渡した側から見えなくなる。 */
    res.status(400).json({
      error: "not allowed to purge",
      refused: kept,
      unknown,
      allowed: [...PURGEABLE],
    });
    return true;
  }

  const apply = q.body.apply === true;
  if (!apply) {
    /* 空回し。**読むだけ。** 置いてあるかと、何バイトかを見る。 */
    const plan: {name: string; bytes: number; exists: boolean}[] = [];
    for (const name of names) {
      try {
        const [meta] = await pub.file(name).getMetadata();
        plan.push({
          name,
          bytes: Number(meta?.size ?? 0) || 0,
          exists: true,
        });
      } catch (e) {
        logger.warn("public-purge: plan read failed", name, String(e));
        plan.push({name, bytes: 0, exists: false});
      }
    }
    res.json({
      apply: false,
      bucket: PUBLIC_BUCKET,
      archiveTo: `${PRIVATE_BUCKET}/${ARCHIVE_DIR}`,
      plan,
      note: "1バイトも触っていません",
    });
    return true;
  }

  const priv = storage.bucket(PRIVATE_BUCKET);
  const day = jstDay(Date.now());
  const done: Done[] = [];
  const failed: Failed[] = [];
  for (const name of names) {
    const r = await moveOne(pub, priv, name, day);
    if ("deleted" in r) done.push(r);
    else failed.push(r);
  }

  /* **消えたことを、消した本人の言葉ではなく置き場から確かめる。**
     一覧を引き直して、まだ居るものを出す。 */
  let left: Listed[] | null = null;
  try {
    left = await listing(pub);
  } catch (e) {
    logger.warn("public-purge: relist failed", String(e));
  }
  const still = left ? done.filter((d) =>
    left?.some((f) => f.name === d.name)).map((d) => d.name) : null;

  res.json({
    apply: true,
    bucket: PUBLIC_BUCKET,
    archiveTo: `${PRIVATE_BUCKET}/${ARCHIVE_DIR}/${day}`,
    done,
    failed,
    /** 消したあとに残っていたもの。**null は数え直せなかった** */
    still,
    left: left ? left.length : null,
  });
  return true;
}
