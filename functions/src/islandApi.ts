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
import {randomUUID} from "crypto";

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

/* 北欧旅の、その日の写真(docs/nordic-photos.md)。
   貼れるのはあやとだけ。読むのは誰でも。
   写真そのものは Cloud Storage に置いて、ここには置き場と寸法だけを持つ。 */
const NPHOTOS = db.collection("nordicPhotos");
/* その日の配信でスパチャしてくれた人。BigQuery からは
   python/nordic_supporters.py が置きにくる。Doneru は自動で取れないので
   python/admin/nordic_supporter.py から手で足す。
   **持つのは「その日いた」までで、金額も順位も持たない。** */
const NDAYS = db.collection("nordicDays");

/* 写真の置き場。Functions の Admin SDK はルールを迂回するので、
   ブラウザから Storage を直接触らせない(Firestore と同じ形)。
   バケットはこの Function が動いているプロジェクトの既定のもの。 */
const BUCKET =
  process.env.NORDIC_BUCKET ||
  `${process.env.GCLOUD_PROJECT || "live-streaming-d3cac"}.firebasestorage.app`;

/** 1枚あたりの上限。ブラウザ側で長辺1600pxの webp に焼いてから送る。 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** 写真に添える一言。長い文章の置き場ではない。 */
const MAX_PHOTO_NOTE = 120;
/** 1日に貼れる枚数。「何枚でも」だが、事故で無限には入らないようにする。 */
const PHOTOS_PER_DAY = 120;

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

/* ---- 面ごとの「押すだけの問い」----
   北欧のわかれ道（区間ごとの「どっちにしてほしい？」）で作った入れ物。
   islandPolls / islandPollVotes をそのまま借りて、`at` の札で仕分ける。
   新しいコレクションは作らない。

   **島の外の紙の面からも同じ入れ物を使う。** 台所の「次のスタンプ」も
   丘の「もう一度やるなら」も、聞いていることが違うだけで、
   サーバー側の仕事は「id ごとに札の数を数える」で同じ。
   面ごとに口を増やすと、長さ制限も連投制限も面の数だけ書くことになる。
   仕分けの札（`at`）は id の頭から取る。画面が名乗った文字をそのまま
   書かないのは、知らない札が増えるとあとで数えるものが分からなくなるため。

   **問いの字も選択肢の字も、ここには置かない。** 字は Git
   (`site/content/nordic.ts`・各面のページ)にあって、レビューを通ってから出る。
   サーバーが持つのは id と数だけなので、
   ここに人の書いた字が溜まることがない。 */
const FORK_AT = ["nordic", "kitchen", "legends", "streams"] as const;
const FORK_ID = new RegExp(`^(${FORK_AT.join("|")})-[a-z0-9-]{3,40}$`);
const FORK_OPTION = /^[a-z][a-z0-9-]{0,15}$/;
/**
 * 1つの問いに置ける選択肢の数。知らない札が増えていくのを止める。
 *
 * 北欧のわかれ道は2つだが、丘の「もう一度やるなら」は4つ、
 * 台所は種類のぶんだけ増える見込みがあるので、上限は8にしてある。
 */
const FORK_MAX_OPTIONS = 8;
const FORK_VOTES_PER_DAY = 30;

/**
 * id の頭から仕分けの札を取る。`FORK_ID` を通ったものしか渡さない。
 * @param {string} id 問いの id（"kitchen-next-kind" のような形）
 * @return {string} 仕分けの札（"kitchen"）
 */
const forkAt = (id: string): string => id.slice(0, id.indexOf("-"));

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
 *
 * **キャラクターが誰のものかは、ここでは決めない。** 割り当てはあやとが
 * 表で持っていて、`site/content/residents.ts` に焼いてある。ログインで
 * 分かるのは「この YouTube チャンネルの人が、名前を出してよいと言った」
 * までで、それがどの絵の人かは向こう側で突き合わせる。
 * 本人に絵を選ばせると、他人の絵を自分のものにできてしまう。
 *
 * **uid も返す。** 「いま島にいる人」(docs/island-here.md)は islandHere/{uid} に
 * 居場所だけを書く。名前とアイコンをそちらに書かせると他人を名乗れるので、
 * 誰なのかはここで返したものと uid で突き合わせて、読む側が決める。
 * カスタムクレームにチャンネルIDを入れる手もあるが、そちらは
 * setCustomUserClaims と再ログインが要る。ここに1つ足すほうが軽い。
 * 出るのは「名前かアイコンを出してよい」と本人が言った人だけなので、
 * 何もしていない人の uid はここに出ない。
 * @return {Promise<Json[]>} uid・チャンネルと、出してよい名前・アイコン
 */
async function listResidents(): Promise<Json[]> {
  const snap = await USERS.where("channelId", "!=", null).limit(500).get();
  const out: Json[] = [];
  snap.forEach((d) => {
    const u = d.data() ?? {};
    if (!u.channelId) return;
    if (!u.showName && !u.showPhoto) return;
    out.push({
      uid: d.id,
      channelId: u.channelId,
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
 * 1ページぶんの読み取りの返り。
 *
 * `more` が true なら、**まだ古いものが残っている**。
 * ここを持たせるためだけにこの型がある。前は上限を超えたぶんを黙って
 * 捨てていたので、人が書いた1行が、書いた本人にも分からないまま
 * 読めなくなっていた。「まだ在る」と言えれば、画面はそう言える。
 */
type Page<T> = {items: T[]; more: boolean; next: string | null};

/**
 * 続きの位置。`createdAt` だけだと、同じミリ秒に2件入ったときに
 * ページの境目で1件飛ぶ。書き出すときは書類の id も添える。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 最後に返した書類
 * @return {string} 続きの位置を表す文字列
 */
function cursorOf(d: FirebaseFirestore.QueryDocumentSnapshot): string {
  return `${(d.get("createdAt") as number) ?? 0}_${d.id}`;
}

/**
 * `before=...` で受け取った続きの位置を、Firestore の並びに戻す。
 * 読めない値は「頭から」として扱う。外から来る文字列なので落とさない。
 * @param {unknown} v クエリで受け取った値
 * @return {[number, string] | null} createdAt と書類 id の組
 */
function parseCursor(v: unknown): [number, string] | null {
  const m = /^(\d{1,15})_(.+)$/.exec(String(v ?? ""));
  if (!m) return null;
  return [Number(m[1]), m[2]];
}

/**
 * 新しい順に1ページぶん取る。非表示のぶんは飛ばして数を揃える。
 *
 * **`limit * 2` を1回引くだけ、という取り方はしない。** 非表示が半分を
 * 超えると、まだ在るのに「これで全部」と言ってしまう。足りなければ
 * 続きを引き直して、上限に当たったことだけを `more` で返す。
 * @param {FirebaseFirestore.CollectionReference} col 読む場所
 * @param {number} limit 1ページの件数
 * @param {unknown} before 続きの位置(`cursorOf` が書いたもの)
 * @param {Function} shape 書類を返す形に直す関数
 * @return {Promise<Page<T>>} 1ページぶん
 */
async function pageOf<T>(
  col: FirebaseFirestore.CollectionReference,
  limit: number,
  before: unknown,
  shape: (d: FirebaseFirestore.QueryDocumentSnapshot) => T,
): Promise<Page<T>> {
  // where + orderBy の組み合わせは複合インデックスが要るので、
  // 並べ替えだけ Firestore に任せて、非表示の除外はこちらで行う。
  // 同じ時刻の書類が並んだときのために、id を第2の並び順に足しておく
  // (単一フィールドの索引で足りる。複合索引は増えない)。
  const base = col
    .orderBy("createdAt", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc");
  const from = parseCursor(before);
  let scan: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const items: T[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let more = false;
  // 非表示だらけでも止まるように、引き直す回数に蓋をする。
  for (let round = 0; round < 8 && !more; round++) {
    let q = base;
    if (scan) q = q.startAfter(scan);
    else if (from) q = q.startAfter(from[0], from[1]);
    const snap = await q.limit(limit + 1).get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      scan = d;
      if (d.get("hidden") === true) continue;
      if (items.length >= limit) {
        more = true;
        break;
      }
      items.push(shape(d));
      last = d;
    }
    if (snap.size <= limit) break;
  }
  return {items, more, next: more && last ? cursorOf(last) : null};
}

/**
 * 企画提案1件を、画面に返す形に直す。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {object} 企画提案
 */
function ideaShape(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const v = d.data();
  return {
    id: d.id,
    text: v.text as string,
    name: (v.name as string) || undefined,
    byUid: (v.uid as string) || undefined,
    votes: (v.votes as number) ?? 0,
    status: (v.status as string) ?? "open",
    createdAt: new Date((v.createdAt as number) ?? Date.now()).toISOString(),
  };
}

/**
 * 付箋1件を、画面に返す形に直す。
 * @param {FirebaseFirestore.QueryDocumentSnapshot} d 書類
 * @return {object} 付箋
 */
function noteShape(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const v = d.data();
  return {
    id: d.id,
    planId: v.planId as string,
    text: v.text as string,
    createdAt: new Date((v.createdAt as number) ?? Date.now()).toISOString(),
  };
}

/**
 * 表示できる企画提案を新しい順に1ページぶん取る。
 * @param {unknown} limit 1ページの件数
 * @param {unknown} before 続きの位置
 * @return {Promise<Page<object>>} 企画提案の1ページ
 */
function listIdeas(limit: unknown = 120, before?: unknown) {
  return pageOf(IDEAS, clampPage(limit), before, ideaShape);
}

/**
 * 表示できる付箋を新しい順に1ページぶん取る。
 * @param {unknown} limit 1ページの件数
 * @param {unknown} before 続きの位置
 * @return {Promise<Page<object>>} 付箋の1ページ
 */
function listNotes(limit: unknown = 200, before?: unknown) {
  return pageOf(NOTES, clampPage(limit), before, noteShape);
}

/**
 * 1ページの件数を、外から来た値でも安全な範囲に収める。
 * @param {unknown} v 件数
 * @return {number} 1〜300 の整数
 */
function clampPage(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(300, n);
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
  const snap = await POLLS.orderBy("createdAt", "desc").limit(12).get();
  const now = new Date().toISOString();
  for (const d of snap.docs) {
    const v = d.data() ?? {};
    // at の付いたものは、どこか別の面のわかれ道（いまは北欧のみ）。
    // 島の「今夜のおたずね」はこれを拾わない。同じ入れ物を使っているだけで、
    // 問いの文も選択肢の字も持っていないので、出しても空の問いになる。
    if (v.at) continue;
    if (v.hidden === true) continue;
    if (v.openUntil && String(v.openUntil) < now) continue;
    const p = shapePoll(d.id, v);
    if (p.question && p.options.length >= 2) return p;
  }
  return null;
}

/**
 * わかれ道の票を、数だけの表に直す。
 *
 * ドキュメントの中身は誰でも増やせる形なので、そのまま返さない。
 * 札の形が合っているものの、0より大きい整数だけを通す。
 * @param {unknown} v ドキュメントの votes
 * @return {Record<string, number>} 札ごとの数
 */
function forkCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = (v ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(raw).slice(0, FORK_MAX_OPTIONS)) {
    if (!FORK_OPTION.test(k)) continue;
    const n = Math.floor(Number(raw[k]));
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
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

/* ---- 北欧旅の、その日の写真(docs/nordic-photos.md) ---- */

/**
 * 「2026-09-12」の形か。日付がそのまま置き場の名前になるので厳しく見る。
 * @param {unknown} v 入力
 * @return {boolean} 日付の形なら true
 */
const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * あやとか。写真を貼れるのはこの人だけ。
 *
 * `islandUsers/{uid}.admin` を見る。下書き(`/drafts`)がすでにこの形なので、
 * 判定を増やさずそこに寄せる。`admin` はコンソールからしか立たない。
 * @param {string | undefined} header Authorization ヘッダ
 * @return {Promise<string | null>} あやとなら uid、違えば null
 */
async function ownerUid(header?: string): Promise<string | null> {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return null;
  try {
    const t = await admin.auth().verifyIdToken(m[1]);
    const snap = await USERS.doc(t.uid).get();
    return snap.data()?.admin ? t.uid : null;
  } catch (e) {
    logger.warn("owner token verify failed", String(e));
    return null;
  }
}

/**
 * Storage に置いた写真の、誰でも読める URL。
 *
 * バケットは公開にしない。Firebase の「ダウンロードの合言葉」を
 * ファイルの metadata に付けて、それを知っている人だけが読める形にする。
 * この URL は `access-control-allow-origin: *` を返すので、
 * `<img crossOrigin="anonymous">` で canvas に描いても canvas が汚れない。
 * @param {string} path バケットの中の置き場
 * @param {string} token ダウンロードの合言葉
 * @return {string} 画像の URL
 */
const photoUrl = (path: string, token: string): string =>
  "https://firebasestorage.googleapis.com/v0/b/" +
  `${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

/** 画面に出す1枚ぶん。 */
type PhotoShape = {
  id: string;
  day: string;
  url: string;
  w: number;
  h: number;
  note: string;
  at: number;
};

/**
 * 貼ってある写真を、日ごとにまとめて返す。
 *
 * **写真のある日しか返さない。** 旅は10日あるが、まだ何も起きていない日に
 * 「まだありません」を並べても読む人には何も無い(docs/nordic-photos.md 7章)。
 * @return {Promise<Json[]>} 新しい日が先の、日ごとの写真と、その日いた人
 */
async function listPhotoDays(): Promise<Json[]> {
  const snap = await NPHOTOS.orderBy("at", "desc").limit(400).get();
  const byDay = new Map<string, PhotoShape[]>();
  snap.forEach((d) => {
    const v = d.data() ?? {};
    if (!isDay(v.day) || typeof v.url !== "string") return;
    const list = byDay.get(v.day) ?? [];
    list.push({
      id: d.id,
      day: v.day,
      url: v.url,
      w: Number(v.w) || 0,
      h: Number(v.h) || 0,
      note: (v.note as string) || "",
      at: Number(v.at) || 0,
    });
    byDay.set(v.day, list);
  });
  if (byDay.size === 0) return [];
  // その日いた人。写真のある日のぶんだけ引く
  const days = [...byDay.keys()].sort().reverse();
  const [people, residents] = await Promise.all([
    db.getAll(...days.map((d) => NDAYS.doc(d))),
    listResidents(),
  ]);
  /* **名前は、出してよいと言った人のぶんだけ返す。**
     BigQuery から来る author_name は、本人が島に名前を出すと決めたかどうかと
     関係なく取れてしまう。ここでそのまま返すと、「その日スパチャした人」の
     一覧が、本人の断りなく名前つきで並ぶことになる。
     出すと決めた人(islandUsers の showName)だけを通す。
     名前が出ない人も、キャラクターの絵は出る。自分の絵は自分で分かる。 */
  const named = new Map<string, string>();
  residents.forEach((r) => {
    const id = r.channelId as string;
    if (id && r.name) named.set(id, r.name as string);
  });
  const peopleOf = new Map<string, Json[]>();
  people.forEach((p) => {
    const arr = (p.data()?.people ?? []) as Json[];
    peopleOf.set(
      p.id,
      arr.slice(0, 60).map((x) => {
        const channelId = clean(x.channelId, 64) || null;
        return {
          channelId,
          icon: clean(x.icon, 80) || null,
          name: (channelId && named.get(channelId)) || null,
        };
      }),
    );
  });
  return days.map((day) => ({
    day,
    // 撮った順に見たいので、その日の中は古いほうから
    photos: (byDay.get(day) ?? []).sort((a, b) => a.at - b.at),
    people: peopleOf.get(day) ?? [],
  }));
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
        if (body.showName !== undefined) patch.showName = !!body.showName;
        if (body.showPhoto !== undefined) patch.showPhoto = !!body.showPhoto;
        await ref.set(patch, {merge: true});
        const saved = {...(prev.data() ?? {}), ...patch};
        res.json({
          uid: t.uid,
          name,
          channelId: channelId || undefined,
          nickname: (saved.nickname as string) ?? null,
          showName: !!saved.showName,
          showPhoto: !!saved.showPhoto,
          /* あやとか。**画面に道具を出すかどうかだけに使う。**
             実際に書けるかは、書く先のルート側でもう一度見ている。
             ここを信じて権限を決めているわけではない。 */
          admin: !!saved.admin,
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

      /* ---------------- 北欧旅の、その日の写真 ----------------
         貼れるのはあやとだけ。読むのは誰でも(docs/nordic-photos.md 3章)。

         写真は Storage に置く。ブラウザから Storage を直接触らせないのは
         Firestore と同じ理由で、ルールを増やさずにここ1か所で締められるから。
         縮めて webp に焼くのはブラウザ側でやる。元のままの写真が
         回線に乗ることも、置き場に残ることも無い。 */
      if (method === "GET" && path === "/nordic/photos") {
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({days: await listPhotoDays()});
        return;
      }

      if (method === "POST" && path === "/nordic/photos") {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const day = body.day;
        if (!isDay(day)) {
          res.status(400).json({error: "bad day"});
          return;
        }
        // data URL で来ても、中身だけで来ても受ける
        const b64 = String(body.image ?? "").replace(/^data:[^,]*,/, "");
        let buf: Buffer;
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          res.status(400).json({error: "bad image"});
          return;
        }
        if (buf.length < 1024 || buf.length > MAX_PHOTO_BYTES) {
          res.status(400).json({error: "bad size"});
          return;
        }
        /* webp かどうかを、送られてきた名前ではなく中身の頭で見る。
           RIFF....WEBP の12バイト。ここを名乗りで済ませると、
           置き場に何でも置けるようになる。 */
        const riff = buf.subarray(0, 4).toString("ascii");
        const webp = buf.subarray(8, 12).toString("ascii");
        if (riff !== "RIFF" || webp !== "WEBP") {
          res.status(400).json({error: "not webp"});
          return;
        }
        if (!(await takeQuota(uid, "nphoto", PHOTOS_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        const ref = NPHOTOS.doc();
        const path2 = `nordic/photos/${day}/${ref.id}.webp`;
        const token = randomUUID();
        await admin
          .storage()
          .bucket(BUCKET)
          .file(path2)
          .save(buf, {
            contentType: "image/webp",
            metadata: {
              // 置き場の名前に id が入っていて中身は変わらないので、
              // ブラウザにも CDN にも長く持たせてよい
              cacheControl: "public, max-age=31536000, immutable",
              metadata: {firebaseStorageDownloadTokens: token},
            },
          });
        const photo = {
          day,
          path: path2,
          url: photoUrl(path2, token),
          w: Math.max(0, Math.min(20000, Number(body.w) || 0)),
          h: Math.max(0, Math.min(20000, Number(body.h) || 0)),
          note: clean(body.note, MAX_PHOTO_NOTE),
          at: Date.now(),
          uid,
        };
        await ref.set(photo);
        res.set("Cache-Control", "no-store");
        res.json({photo: {id: ref.id, ...photo}});
        return;
      }

      const photoMatch = path.match(/^\/nordic\/photos\/([A-Za-z0-9_-]{6,})$/);
      if (method === "DELETE" && photoMatch) {
        const uid = await ownerUid(req.headers.authorization);
        if (!uid) {
          res.status(403).json({error: "not allowed"});
          return;
        }
        const ref = NPHOTOS.doc(photoMatch[1]);
        const snap = await ref.get();
        const p = snap.data();
        if (!snap.exists || typeof p?.path !== "string") {
          res.status(404).json({error: "not found"});
          return;
        }
        /* 先に置き場から消す。Firestore だけ消えて実体が残ると、
           もう誰からも見えないのに URL を知っている人には見え続ける。 */
        await admin
          .storage()
          .bucket(BUCKET)
          .file(p.path)
          .delete({ignoreNotFound: true});
        await ref.delete();
        res.set("Cache-Control", "no-store");
        res.json({id: ref.id});
        return;
      }

      /* ---------------- 読み取り ---------------- */
      if (method === "GET" && path === "/state") {
        const [stateSnap, ideas, notes, residents] = await Promise.all([
          STATE_DOC.get(),
          listIdeas(60),
          listNotes(200),
          listResidents(),
        ]);
        const state = stateSnap.exists ? stateSnap.data() ?? {} : {};
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        /* `ideas` と `notes` は今までどおり配列で返す。そこに
           「まだ古いものが残っている」を添える。画面はこれを見て
           `/ideas?before=` `/notes?before=` の続きを読める。
           **黙って切らない**ことがこの2つの役目。 */
        res.json({
          current: state.current ?? null,
          stats: state.stats ?? null,
          ideas: ideas.items,
          notes: notes.items,
          residents,
          more: {
            ideas: ideas.more ? ideas.next : null,
            notes: notes.more ? notes.next : null,
          },
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
        const page = await listIdeas(
          req.query.limit ?? 120,
          req.query.before,
        );
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        res.json({ideas: page.items, more: page.more, next: page.next});
        return;
      }

      /* 付箋の続き。`/state` が返すのは新しい 200件までで、
         それより古いぶんはここから `?before=` で順に読む。
         上限を上げるだけにしなかったのは、上げてもいつか同じ日が来て、
         そのときはまた黙って消えるから。 */
      if (method === "GET" && path === "/notes") {
        const page = await listNotes(
          req.query.limit ?? 200,
          req.query.before,
        );
        res.set(
          "Cache-Control",
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        );
        res.json({notes: page.items, more: page.more, next: page.next});
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

      /* ---------------- 押すだけの問い ----------------
         「十字架の丘に寄る／先を急ぐ」のような、まだ決まっていない分かれ目を
         押すだけで答えられるようにする(`docs/nordic-fund.md` 提案8)。
         北欧の区間だけでなく、紙の面の問い(台所の「次のスタンプ」、
         丘の「もう一度やるなら」)も同じ口を通る。

         **返すのは、聞かれた id のぶんだけ。** 一覧で返すと、
         端末IDを作り直しながら投げれば知らない id の札を並べられる。
         画面が知っている id しか読まないので、ゴミは表に出ない。 */
      if (method === "GET" && path === "/fork") {
        const ids = String(req.query.ids ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => FORK_ID.test(s))
          .slice(0, 12);
        // 押した瞬間に数字が動くのが要なので、読みは短めに寝かせる
        res.set(
          "Cache-Control",
          "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
        );
        if (ids.length === 0) {
          res.json({forks: {}});
          return;
        }
        const snaps = await db.getAll(...ids.map((id) => POLLS.doc(id)));
        const forks: Record<string, Record<string, number>> = {};
        for (const s of snaps) {
          const v = s.exists ? s.data() ?? {} : {};
          // 島の「今夜のおたずね」には `at` が無い。あちらは問いの字を
          // 持っているので、数だけを返すこの口からは出さない
          if (!v.at || v.hidden === true) continue;
          forks[s.id] = forkCounts(v.votes);
        }
        res.json({forks});
        return;
      }

      const forkMatch = path.match(/^\/fork\/([A-Za-z0-9_-]{4,})\/vote$/);
      if (method === "POST" && forkMatch) {
        const id = forkMatch[1];
        const who = await whoIs(req.headers.authorization);
        const cid = String(body.cid ?? "");
        const option = clean(body.option, 24);
        if (!FORK_ID.test(id) || !FORK_OPTION.test(option)) {
          res.status(400).json({error: "bad fork"});
          return;
        }
        if (!who && !isCid(cid)) {
          res.status(400).json({error: "bad cid"});
          return;
        }
        if (!(await takeQuota(who?.uid ?? cid, "fork", FORK_VOTES_PER_DAY))) {
          res.status(429).json({error: "too many today"});
          return;
        }
        // ログインしている人は端末が変わっても1票。していない人は端末ごと。
        const voteRef = PVOTES.doc(`${id}_${who?.uid ?? cid}`);
        const ref = POLLS.doc(id);
        let out: {votes: Record<string, number>; mine: string};
        try {
          out = await db.runTransaction(async (tx) => {
            const [v, p] = await Promise.all([tx.get(voteRef), tx.get(ref)]);
            const data = p.exists ? p.data() ?? {} : {};
            // 引っ込めたわかれ道は、id を知っていても押せない
            if (data.hidden === true) throw new Error("closed");
            const votes = forkCounts(data.votes);
            // もう押している人は数えない。押し直しもさせない(1人1票)
            if (v.exists) {
              return {votes, mine: clean(v.data()?.option, 24)};
            }
            const known = option in votes;
            if (!known && Object.keys(votes).length >= FORK_MAX_OPTIONS) {
              throw new Error("bad option");
            }
            votes[option] = (votes[option] ?? 0) + 1;
            tx.set(voteRef, {
              at: Date.now(),
              option,
              cid: cid || null,
              uid: who?.uid ?? null,
            });
            /* はじめの1票で入れ物ができる。問いの字はここに書かない。
               createdAt を持たせておくのは、島の「今夜のおたずね」が
               同じコレクションを新しい順に見ているため。 */
            tx.set(
              ref,
              {
                at: forkAt(id),
                votes,
                createdAt: (data.createdAt as number) ?? Date.now(),
              },
              {merge: true},
            );
            return {votes, mine: option};
          });
        } catch (e) {
          res.status(400).json({error: String(e).replace("Error: ", "")});
          return;
        }
        res.set("Cache-Control", "no-store");
        res.json({id, votes: out.votes, mine: out.mine});
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
