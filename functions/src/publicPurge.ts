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
 * ## 下見は、置き場を2つ測る（#296）
 *
 * 退避（#291）は Firestore も BigQuery も毎晩取れているのに、
 * **旅の写真の実体（Storage）だけ1本も入っていない。**
 * いちばん取り返しのつかないものが、いちばん守られていない。
 *
 * 止まっていた理由はここと同じで、**Actions のサービスアカウントに
 * Storage の権限が1つも無い**（#296。あやたに役を付けてもらう依頼を
 * 出したまま、旅に出てしまっている）。
 *
 * ところが #289 のこの口で、**Functions のサービスアカウントなら
 * 公開バケットに対して全部できる**ことが本番で分かった。
 * 写真が入っているのは**別のバケット**（`…firebasestorage.app`）で、
 * **そちらで何ができるかは誰も測っていない。**
 * 近い実績は `python/admin/characters_probe.py` の
 * create / get / delete だけで、**退避に要る `list` は未測定。**
 *
 * だから下見は、公開バケットと**既定バケットの両方**に
 * `testIamPermissions` を投げる。既定バケットのほうは
 * **`list` が立ったときに件数と合計バイト数まで**しか見ない。
 * **中身は開かないし、名前も1つも返さない。**
 *
 * ## 内訳が要る（#296 の2026-09-13）
 *
 * 測ったら **544件・340,231,177バイト**あって、**退避で守れているのは
 * 3件だけ**だった（Firestore の書類に入っている合言葉つき URL 経由。
 * IAM を通らない道）。残りが「作り直せるもの」なのか「失ったら終わり」
 * なのかで、#296 の急ぎ具合が変わる。**そこを決めつけずに数える。**
 *
 * 分かっているのは171件ぶんだけ（キャラクターの絵の URL 166本 ＋
 * 写真3件 ＋ 片づけた JSON 2件）。**残り373件は誰も知らない。**
 *
 * ## 内訳をどこで切るか — **フォルダの深さ2**
 *
 * このリポジトリから置き場に書いているのは3か所で、どれも
 * **「何であるか」が頭2段に、「どれであるか」が3段目以降**に入る。
 *
 * | 書いているところ | 置き場の名前 |
 * | --- | --- |
 * | `islandApi.ts` の写真 | `nordic/photos/{日付}/{書類ID}.jpg` |
 * | `islandCharacter.ts` の絵 | `island/characters/{人のID}/{役}-{幅}.webp` |
 * | この口の写し | `purged/public-bucket/{日付}/{名前}` |
 *
 * だから深さ2で切ると **`nordic/photos/` `island/characters/`
 * `purged/public-bucket/`** の3行になって、日付も人のIDも書類IDも出ない。
 * 深さ3まで行くと98人ぶんのIDが並ぶし、深さ1だと `island/` が
 * 何の絵なのか分からないままになる。**深さ2が「種類」の段。**
 *
 * 知らない置き方に当たったときのために、逃げを2つ入れてある。
 *
 * - **日付の段は月までにまとめる**（`2026-09-01/` → `2026-09/`）。
 *   浅いところに日付を置いている中身があっても、行が日数ぶんに増えない
 * - **1段目の下に子が {@link MAX_CHILDREN} を超えて並んだら、1段目で
 *   まとめる。** 深さ2が書類IDだった置き場では、行が中身の数だけ
 *   増える＝**名前を出しているのとほとんど同じ**になる
 *
 * 返すのは**フォルダの名前・件数・合計バイト数だけ。**
 * **ファイル名は1つも返さないし、ログにも出さない**（このリポジトリは
 * 公開で、Actions のログも誰でも読める）。
 *
 * ## 544件を1回で数える — ページ送りは自分で回す
 *
 * `getFiles()` は既定（`autoPaginate` 省略）でも中で最後まで送るが、
 * **`maxResults` を足した瞬間に送りが止まる**（`@google-cloud/paginator`
 * の `parseArguments_`。`maxResults !== -1` だと `autoPaginate` が false）。
 * 1ページぶんだけ数えて「全部です」と言う形が、いつでも作れてしまう。
 *
 * だから**送りはこちらで回す。** `maxResults` で1ページの数を決めて、
 * 返ってきた `nextQuery`（2つめの返り）が無くなるまで引き直す。
 * **`autoPaginate` は渡さない。** `bucket.getFiles` は受け取った入力を
 * そのまま `qs` に載せる作りなので、API に知らない項目が飛ぶ。
 *
 * ## 消せる道は、既定バケットには開けない
 *
 * 片づけ（`POST` の `apply`）が触る置き場は、**公開バケット決め打ち。**
 * 呼び出しからバケットは選べない（`bucket` のような入力は読んでいない）。
 * 既定バケットの名前を `names` に渡しても、**置き場の名前として弾く。**
 * 測る口を広げても、消す口は1ミリも広げない。
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

/**
 * 既定バケット。用事が2つある。
 *
 * 1. #289 の**写す先**（`islandApi.ts` の `BUCKET` と同じ式）
 * 2. #296 で**測る相手**。旅の写真の実体はここに入っている
 *
 * **消す道はここへ開けない。** 下見で読むのと、`purged/` へ写すだけ。
 */
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

/** 公開バケットに聞く項目。`bucket_purge.py` と同じ並び。 */
const PERMISSIONS = [
  "storage.objects.list",
  "storage.objects.get",
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.update",
  "storage.buckets.setIamPolicy",
];

/**
 * 既定バケットに聞く項目（#296）。
 *
 * 最後の1つだけ公開バケットと違う。あちらで見たかったのは
 * 「**公開を止められるか**」（`setIamPolicy`）で、こちらで見たいのは
 * 「**退避の相手として掴めるか**」（`buckets.get`）。
 * 退避に要るのは先頭の `list` で、そこが立たなければ数えることもできない。
 */
const DEFAULT_PERMISSIONS = [
  "storage.objects.list",
  "storage.objects.get",
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.update",
  "storage.buckets.get",
];

/**
 * **置き場そのものの名前。片づけには決して渡らない。**
 *
 * `names` は置き場の中の名前を受けるところで、バケット名を入れる場所では
 * ない。表（`PURGEABLE`）に無いので既に弾かれるが、**二重に弾いて、
 * 弾いたことを残す。** 測る口が2つの置き場を知った以上、片方の名前が
 * 消す側へ流れる形になっていないことを、口の側で言い切れるようにする。
 */
const BUCKET_NAMES = new Set([PUBLIC_BUCKET, PRIVATE_BUCKET]);

/** 一度に受ける名前の数。表には2つしか無いので、これで足りる。 */
const MAX_NAMES = 10;

/**
 * 一覧を1回に引く数（#296）。
 *
 * **544件あるから1,000で足りる、という書き方をしない。**
 * 写真はこれから毎日増える。足りなくなった日に黙って数え落とすより、
 * いつでも送りを回しているほうがいい。
 */
const PAGE_SIZE = 1000;

/** 引き直しの上限。ここに当たったら、数え切れていないと言う。 */
const MAX_PAGES = 100;

/** まとめるフォルダの深さ。理由は冒頭の「内訳をどこで切るか」。 */
const FOLDER_DEPTH = 2;

/**
 * 1段目の下に並べてよい子の数。
 *
 * 超えたら**1段目でまとめる。** 深さ2が書類IDや日付だった置き場で、
 * 行が中身の数だけ増えるのを止めるため。
 */
const MAX_CHILDREN = 24;

/** 返すフォルダの行数。あふれたぶんは1行にまとめる。 */
const MAX_FOLDERS = 40;

/** フォルダの名前の長さ。長いものは切る。 */
const MAX_FOLDER_NAME = 64;

/** 置き場の直下に置いてあるもの。**名前は出さない。** */
const ROOT_FOLDER = "（置き場の直下）";

/** 行数からあふれたぶん。 */
const REST_FOLDER = "（そのほか）";

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

/**
 * 一覧を引くときの入力。**ページ送りに要るものだけ。**
 *
 * `autoPaginate` は**わざと持っていない。** 渡すと
 * `bucket.getFiles` がそのまま API の `qs` に載せる。
 * 送りを止めたいだけなら `maxResults` を入れれば足りる。
 */
export type PurgeListQuery = {
  maxResults?: number;
  pageToken?: string;
};

/**
 * 一覧の返り。
 *
 * 2つめは**次のページの引きかた**で、最後のページでは `null` になる
 * （`@google-cloud/storage` の `getFiles`）。そのまま次の入力に使える。
 */
export type PurgeListed = [PurgeFile[], (PurgeListQuery | null)?, unknown?];

/** バケット。同上。 */
export type PurgeBucket = {
  name: string;
  file(path: string): PurgeFile;
  getFiles(q?: PurgeListQuery): Promise<PurgeListed>;
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
 * @param {string[]} perms 聞く項目
 * @return {Promise<Record<string, boolean> | null>} できることの表。聞けなければ null
 */
async function canDo(
  b: PurgeBucket,
  perms: string[],
): Promise<Record<string, boolean> | null> {
  try {
    const [got] = await b.iam.testPermissions(perms);
    const out: Record<string, boolean> = {};
    for (const p of perms) out[p] = got?.[p] === true;
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

/** フォルダ1つぶん。**中身の名前は入らない。** */
type Folder = {
  /** フォルダの名前。うしろに `/` を付ける */
  folder: string;
  count: number;
  bytes: number;
  /** 下の段をいくつまとめたか。まとめていなければ null */
  rolledUp: number | null;
};

/** 数えた結果。**ここに名前は入らない。** */
type Tally = {
  count: number;
  bytes: number;
  /** 内訳。**フォルダの名前・件数・合計バイト数だけ** */
  folders: Folder[];
  /** 何回引いたか。ページ送りが効いているかは、これで見る */
  pages: number;
  /** 引き直しの上限に当たって、数え切れていないか */
  truncated: boolean;
};

/**
 * 長い名前を切る。**切ったことが分かるようにする。**
 * @param {string} s フォルダの1段
 * @return {string} 切ったもの
 */
function cut(s: string): string {
  return s.length > MAX_FOLDER_NAME ? s.slice(0, MAX_FOLDER_NAME) + "…" : s;
}

/**
 * 日付の段を、月までにまとめる。
 *
 * `nordic/photos/2026-09-12/` のような段をそのまま出すと、
 * 行が日数ぶんに増える。**溜まっても背が変わらない形にする。**
 * @param {string} seg フォルダの1段
 * @return {string} 日付なら `2026-09`、そうでなければそのまま
 */
function byMonth(seg: string): string {
  const dashed = /^(\d{4})-(\d{2})-\d{2}/.exec(seg);
  if (dashed) return `${dashed[1]}-${dashed[2]}`;
  const flat = /^(\d{4})(\d{2})\d{2}$/.exec(seg);
  if (flat) return `${flat[1]}-${flat[2]}`;
  return seg;
}

/**
 * 置き場の名前から、数える先のフォルダを決める。
 *
 * **名前そのものは持ち帰らない。** 返すのは1段目と、深さ2までの段。
 * @param {string} name 置き場の名前
 * @return {{parent: string, key: string}} 1段目と、まとめる先
 */
function folderOf(name: string): {parent: string; key: string} {
  const dirs = name
    .split("/")
    .slice(0, -1)
    .filter((s) => s !== "")
    .map((s) => cut(byMonth(s)));
  if (dirs.length === 0) return {parent: ROOT_FOLDER, key: ROOT_FOLDER};
  return {
    parent: `${dirs[0]}/`,
    key: `${dirs.slice(0, FOLDER_DEPTH).join("/")}/`,
  };
}

/**
 * 数えるだけ。**名前も中身も持ち帰らない。**
 *
 * 退避（#296）に要るのは「どのフォルダに何件あって、何バイトか」まで。
 * 名前を配列で返すと、このリポジトリは公開なので Actions のログに
 * そのまま出る。**足し算だけして捨てる。**
 *
 * **ページ送りは自分で回す**（冒頭の「544件を1回で数える」）。
 * @param {PurgeBucket} b 数える置き場
 * @return {Promise<Tally>} 件数・合計バイト数・フォルダごとの内訳
 */
async function tally(b: PurgeBucket): Promise<Tally> {
  let count = 0;
  let bytes = 0;
  let pages = 0;
  let truncated = false;
  /* 深さ2のフォルダごとの合計と、1段目の下に並んだ段の顔ぶれ。
     **どちらも持つのは数だけで、ファイル名は1つも残らない。** */
  type Sum = {parent: string; count: number; bytes: number};
  const sums = new Map<string, Sum>();
  const kids = new Map<string, Set<string>>();

  let page: PurgeListQuery | null = {maxResults: PAGE_SIZE};
  while (page) {
    /* 型を書き下すのは、`page` に入れ直す値がこの行から来るため。
       分割代入のままだと、型が自分を指して決まらない（TS7022）。 */
    const got: PurgeListed = await b.getFiles(page);
    const files = got[0];
    const next = got[1];
    pages += 1;
    for (const f of files) {
      const size = Number(f.metadata?.size ?? 0) || 0;
      count += 1;
      bytes += size;
      const {parent, key} = folderOf(f.name);
      const cur = sums.get(key) || {parent, count: 0, bytes: 0};
      cur.count += 1;
      cur.bytes += size;
      sums.set(key, cur);
      const seen = kids.get(parent) || new Set<string>();
      seen.add(key);
      kids.set(parent, seen);
    }
    /* **次が無ければ `null` が返る。** 返ってきたものをそのまま
       次の入力に使う（`pageToken` が入っている）。 */
    if (!next || !next.pageToken) break;
    if (pages >= MAX_PAGES) {
      /* **数え切れていないことを、数え切ったのと同じ絵にしない。** */
      truncated = true;
      break;
    }
    page = next;
  }

  /* **子が多すぎる1段目は、1段目でまとめる。** 深さ2が書類IDだった
     置き場では、行が中身の数だけ増える＝名前を出すのとほぼ同じ。 */
  const rows = new Map<string, Folder>();
  for (const [key, v] of sums) {
    const many = (kids.get(v.parent)?.size ?? 0) > MAX_CHILDREN;
    const at = many ? v.parent : key;
    const cur = rows.get(at) ||
      {folder: at, count: 0, bytes: 0, rolledUp: many ? 0 : null};
    cur.count += v.count;
    cur.bytes += v.bytes;
    if (many) cur.rolledUp = (cur.rolledUp ?? 0) + 1;
    rows.set(at, cur);
  }

  const all = [...rows.values()].sort(
    (a, z) =>
      z.bytes - a.bytes || z.count - a.count || (a.folder < z.folder ? -1 : 1),
  );
  /* **行数でも背が変わらないようにする。** あふれたぶんは1行。 */
  let folders = all;
  if (all.length > MAX_FOLDERS) {
    const head = all.slice(0, MAX_FOLDERS - 1);
    const rest = all.slice(MAX_FOLDERS - 1);
    head.push({
      folder: REST_FOLDER,
      count: rest.reduce((a, r) => a + r.count, 0),
      bytes: rest.reduce((a, r) => a + r.bytes, 0),
      rolledUp: rest.length,
    });
    folders = head;
  }
  return {count, bytes, folders, pages, truncated};
}

/** 測った結果1つぶん。**ファイル名は1つも入らない。** */
type Surveyed = {
  bucket: string;
  /** できることの表。聞けなければ null */
  can: Record<string, boolean> | null;
  /** `list` が立ったときだけ入る */
  count: number | null;
  bytes: number | null;
  /**
   * 内訳（#296）。**フォルダの名前・件数・合計バイト数だけ。**
   * ファイル名は1つも入らない。数えられなければ null
   */
  folders: Folder[] | null;
  /** 一覧を何回引いたか。ページ送りが効いているかは、これで見る */
  pages: number | null;
  /** 引き直しの上限に当たって、数え切れていないか */
  truncated: boolean | null;
  /** 数えられたか。`skipped` は `list` が無いので試してもいない */
  listed: "ok" | "skipped" | "denied";
  /** 数えられなかった理由。**種類だけ** */
  why: string | null;
};

/**
 * 置き場を1つ測る。**1バイトも書かない。**
 *
 * `list` が立っていないときは、数えることすら試さない。
 * 落ちるのが分かっている呼び出しで本番のログを埋めない。
 * @param {PurgeBucket} b 測る置き場
 * @param {string[]} perms 聞く項目
 * @return {Promise<Surveyed>} できることと、数えられたなら件数
 */
async function survey(b: PurgeBucket, perms: string[]): Promise<Surveyed> {
  const can = await canDo(b, perms);
  /** 数えられなかったときの返り。**数の欄は全部 null。** */
  const none = {
    bucket: b.name,
    can,
    count: null,
    bytes: null,
    folders: null,
    pages: null,
    truncated: null,
  };
  /* 聞けなかった（null）ときは、数えるほうを1回試す。
     **聞けないこと**と**できないこと**は別で、前者なら実測が要る。 */
  if (can !== null && can["storage.objects.list"] !== true) {
    return {...none, listed: "skipped", why: null};
  }
  try {
    const t = await tally(b);
    return {bucket: b.name, can, ...t, listed: "ok", why: null};
  } catch (e) {
    /* **中身の名前が混じりうるので、例外の本文は出さない**（種類だけ）。
       このリポジトリは公開で、Actions のログも誰でも読める。 */
    const why = kindOf(e);
    logger.warn("public-purge: tally failed", b.name, why);
    return {...none, listed: "denied", why};
  }
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
      /* 既定バケットは**測るだけ**なので、掴むのもここだけ。
         `apply` の側には渡らない（あちらは `pub` 決め打ち）。 */
      const [can, files, def] = await Promise.all([
        canDo(pub, PERMISSIONS),
        listing(pub),
        survey(storage.bucket(PRIVATE_BUCKET), DEFAULT_PERMISSIONS),
      ]);
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
        /**
         * 旅の写真の入っている置き場（#296）。**測っただけ。**
         * 件数と合計バイト数と、**フォルダごとの内訳**まで。
         * ファイル名は1つも入らないし、この口から消すこともできない。
         */
        defaultBucket: def,
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
  /* **置き場の名前を渡されても、片づけには入れない**（#296）。
     表に無いので既に弾かれるが、ここで名指しして断る。 */
  const buckets = names.filter((n) => BUCKET_NAMES.has(n));
  for (const n of buckets) {
    logger.warn("public-purge: 置き場の名前は受け取りません", n);
  }
  const unknown = names.filter(
    (n) => !isKept(n) && !BUCKET_NAMES.has(n) && !PURGEABLE.has(n),
  );
  if (kept.length > 0 || buckets.length > 0 || unknown.length > 0) {
    /* **1つでも表に無ければ、1件も手を付けない。** 途中まで消して
       残りを断ると、何が消えたのかが渡した側から見えなくなる。 */
    res.status(400).json({
      error: "not allowed to purge",
      refused: [...kept, ...buckets],
      buckets,
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

  /* **写す先と消す先が同じ置き場になっていたら、何もしない。**
     `NORDIC_BUCKET` を取り違えて公開バケットを指した日には、
     自分の上に写して自分を消すことになり、**その1件は戻らない。**
     ふだんは起きないが、起きたら取り返しがつかないので手前で止める。 */
  if (PUBLIC_BUCKET === PRIVATE_BUCKET) {
    logger.error("public-purge: 写す先と消す先が同じ置き場です");
    res.status(500).json({error: "archive target is the same bucket"});
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
