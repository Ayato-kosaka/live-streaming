/**
 * キャラクターの絵と呼び名の口（#284 の C 群）。
 *
 * ## 何のためか
 *
 * いままで、どの絵が誰のものかは**あやとのスプレッドシート**（alertbox の
 * Viewers 表・141行）だけが決めていて、絵そのものは**あやとの Google
 * ドライブ**にあった。表は合言葉を持っていないので URL を知っていれば
 * 誰でも全件読めたし、絵は外の置き場に22本つなぎに行っていた。
 *
 * ここはその引っ越し先。**原本を Firestore（`islandCharacter`）と
 * Firebase Storage に寄せて、オーナー画面から足せるようにする。**
 *
 * ## 引き方が2つある
 *
 * | いつ | 何から引くか | 使う欄 |
 * | --- | --- | --- |
 * | スパチャ | YouTube のチャンネル名 | `channelKeys` |
 * | Doneru | 他の呼び名（チャンネル名も含む） | `lookupKeys` |
 *
 * **どちらも1つの配列で引く**（`array-contains`）。うちのサービス
 * アカウントには複合索引を作る権限が無いので（#168）、`where` を2つ
 * 重ねた瞬間に本番で 500 になる。配列の `array-contains` は
 * **単一フィールドの索引**で、Firestore が勝手に張るので何も要らない。
 *
 * **2つに分けてあるのは、取り違えを減らすため。** 他の呼び名は
 * 「あお」のような短い字が入る。スパチャの表示名がたまたまそれと同じ
 * だったときに、別の人の絵が配信の画面に出る。スパチャはチャンネル名
 * だけを見る（あやとの言葉「スパチャの場合はチャンネル名から取得」）。
 *
 * ## @ なしは、保存するときに作る
 *
 * `@aoi1685` を入れたら `aoi1685` でも引ける。**その変形は保存のときに
 * 作って、配列に一緒に入れておく。** 引くときに作らない。
 *
 * 1. **引くのは配信中で、投げ銭1件につき1回。保存は年に数回。**
 *    手間は安いほうへ寄せる
 * 2. 引くときに変形すると、変形の数だけ Firestore を往復することになる。
 *    `array-contains` は値1つしか渡せない（`array-contains-any` は
 *    使えるが、あれも配列側が同じ形でないと意味がない）
 * 3. 何で引けるようになったかが**画面から見える。** オーナー画面は
 *    `lookupKeys` をそのまま出せば「この名前で当たります」が言える
 *
 * ## 書類ID は、いまのドライブの画像ID
 *
 * `site/content/residents.ts` の `icon:`、`site/content/characterBox.ts`
 * の鍵、`python/residents_map.json` の鍵——**もう全部これで引いてある。**
 * ここで新しいIDを振ると、3つを同じ日に書き換えないと島の住人が消える。
 *
 * **意味のある値としては使わない。** これから足す人にはドライブの絵が
 * 無いので、そのときは同じ形（`[A-Za-z0-9_-]{33}`）の乱数を振る。
 *
 * ## 名前は、誰にでも見せるものではない
 *
 * 島は視聴者さんの名前を出さない方針（`site/content/residents.ts`）。
 * だから**図鑑の口（`GET /characters`）は、絵と絵文字しか返さない。**
 * 名前と呼び名が付いて返るのは、オーナーの口と、OBS の合言葉を持って
 * いる口だけ。移す前のスプレッドシートは URL を知っていれば誰でも
 * 全件読めたので、ここは**閉じるほうに変える。**
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {randomUUID} from "crypto";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** キャラクター1人 = 1書類。書類IDは絵の識別子（下の CHARACTER_ID）。 */
const CHARACTERS = db.collection("islandCharacter");

/** 置き場。写真（#202）と同じバケット。 */
const BUCKET =
  process.env.NORDIC_BUCKET ||
  `${process.env.GCLOUD_PROJECT || "live-streaming-d3cac"}.firebasestorage.app`;

/** 書類IDの形。ドライブの画像IDと同じ形にそろえてある。 */
const CHARACTER_ID = /^[A-Za-z0-9_-]{10,64}$/;

/** 一度に返す人数。いま97人。増えても指で見る量には限りがある。 */
const MAX_CHARACTERS = 500;

/** 呼び名の数と長さ。表で最も多い人が5つ持っている。 */
const MAX_ALIASES = 20;
const MAX_NAME = 80;

/** 1枚の上限。背景ありの元が実測で最大 4MB 弱。 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 表示用に持つ幅。
 *
 * **ドライブは `=s96` `=s128` `=s256` `=s512` `=s640` を勝手に作って
 * くれていた。Storage はやってくれない。** 焼いたものを置いておいて、
 * 欲しい大きさ以上でいちばん小さいものを返す（引き伸ばさない）。
 * `=s96` は 128 が、`=s512` は 640 が受ける。
 */
const WIDTHS = [128, 256, 640];

type Json = Record<string, unknown>;

/** 絵の役どころ。`plain` が背景なし、`scene` が背景あり。 */
type Role = "plain" | "scene";
const ROLES: Role[] = ["plain", "scene"];

/** 呼ぶ側から借りるもの。「誰か」を見るところを増やさないため。 */
export type CharacterDeps = {
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
  /** OBS の32桁の合言葉が本物なら、その持ち主の鍵。偽物なら空文字 */
  alertboxKey: (id: string) => Promise<string>;
};

export type CharacterReq = {
  method: string;
  path: string;
  auth?: string;
  query: Record<string, unknown>;
  body: Json;
};

export type CharacterRes = {
  set(k: string, v: string): unknown;
  status(n: number): CharacterRes;
  json(b: unknown): unknown;
};

/**
 * 文字列にして、前後の空白を落として、長さで切る。
 * @param {unknown} v 受け取った値
 * @param {number} max 残す長さ
 * @return {string} 整えた文字列
 */
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** 目に見えない文字。名前に紛れ込むと、同じ字なのに当たらなくなる。 */
/* U+034F(結合書記素接合子)を**わざと**入れている。名前に紛れ込むと
   目には同じ字なのに引けなくなるので、落とす側の並び。
   `app/alertbox/matching.utils.ts` の INVISIBLE_CHARS_RE と同じ中身。 */
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C]/g;
/** 異体字セレクタ。付いたり付かなかったりするので、引く前に落とす。 */
const VARIATION = /[\uFE0E\uFE0F]/g;

/**
 * 引く形にそろえる。
 *
 * **`app/alertbox/matching.utils.ts` の `normalizeName` と同じ決まり。**
 * 片方だけ変えると、配信中のアラートだけが人違いを始める。
 * @param {unknown} v 名前
 * @return {string} そろえた形
 */
export function normKey(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFKC")
    .replace(VARIATION, "")
    .replace(INVISIBLE, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ja");
}

/**
 * 引くための鍵を作る。**`@` を落としたものを自動で足す。**
 *
 * 保存のときに作って持つ（引くときに作らない）。理由はこのファイルの
 * 冒頭に書いた。
 * @param {string[]} names 入っている名前（チャンネル名と呼び名）
 * @return {string[]} 重複を落とした鍵の並び
 */
export function keysOf(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    for (const v of [normKey(n), normKey(n.replace(/^@+/, ""))]) {
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** 画面に返す絵1枚ぶん。 */
type Picture = {
  /** 元のまま。**持ち帰るのはこれ**（縮めたものを配らない） */
  full: string | null;
  /** 焼いてある幅 → URL。無い幅は入っていない */
  sizes: Record<string, string>;
  w: number | null;
  h: number | null;
};

/**
 * Firestore に入っている絵を、画面に返す形にそろえる。
 * @param {unknown} raw 入っている値
 * @return {Picture | null} 絵。入っていなければ null
 */
function picture(raw: unknown): Picture | null {
  const v = (typeof raw === "object" && raw ? raw : null) as Json | null;
  if (!v) return null;
  const url = typeof v.url === "string" ? v.url : null;
  const sizes: Record<string, string> = {};
  const s = (typeof v.sizes === "object" && v.sizes ? v.sizes : {}) as Json;
  for (const w of WIDTHS) {
    const u = s[String(w)];
    if (typeof u === "string") sizes[String(w)] = u;
  }
  if (!url && Object.keys(sizes).length === 0) return null;
  return {
    full: url,
    sizes,
    w: typeof v.w === "number" ? v.w : null,
    h: typeof v.h === "number" ? v.h : null,
  };
}

/**
 * 図鑑に出す1人。**名前は入らない。**
 * @param {string} id 書類ID
 * @param {Json} v 入っている値
 * @return {Json} 誰にでも見せてよい形
 */
function shapePublic(id: string, v: Json): Json {
  const im = (typeof v.images === "object" && v.images ? v.images : {}) as Json;
  return {
    id,
    emoji: typeof v.emoji === "string" ? v.emoji : "",
    plain: picture(im.plain),
    scene: picture(im.scene),
  };
}

/**
 * オーナー画面と OBS に返す1人。**名前と呼び名が付く。**
 * @param {string} id 書類ID
 * @param {Json} v 入っている値
 * @return {Json} 名前まで入った形
 */
function shapeFull(id: string, v: Json): Json {
  return {
    ...shapePublic(id, v),
    channelName: typeof v.channelName === "string" ? v.channelName : "",
    aliases: Array.isArray(v.aliases) ? v.aliases.filter(
      (a): a is string => typeof a === "string",
    ) : [],
    /* **何で引けるかを、そのまま見せる。** 「@aoi1685 と入れたら
       aoi1685 でも当たります」を、画面が説明せずに出せるようにする。 */
    channelKeys: Array.isArray(v.channelKeys) ? v.channelKeys : [],
    lookupKeys: Array.isArray(v.lookupKeys) ? v.lookupKeys : [],
    channelId: typeof v.channelId === "string" ? v.channelId : null,
    editedAt: typeof v.editedAt === "string" ? v.editedAt : null,
  };
}

/**
 * 1人を、1つの欄で引く。
 *
 * **`where` は1つだけ。** 複合索引を作れないので（#168）、
 * ここに `orderBy` も2つ目の `where` も足さない。
 * @param {"channelKeys" | "lookupKeys"} field 引く欄
 * @param {string} typed 打たれた名前
 * @return {Promise<Json | null>} 当たった1人。当たらなければ null
 */
async function findBy(
  field: "channelKeys" | "lookupKeys",
  typed: string,
): Promise<Json | null> {
  const k = normKey(typed);
  if (!k) return null;
  /* 2件取るのは、**2人に当たったら決めない**ため。呼び名は誰でも
     同じにできるので、当てずっぽうで1人選ぶと別人の絵が配信に出る
     (`donors.ts` の `findChannel` と同じ決めかた)。 */
  const q = await CHARACTERS.where(field, "array-contains", k).limit(2).get();
  if (q.size !== 1) return null;
  return shapeFull(q.docs[0].id, q.docs[0].data() ?? {});
}

/** 1枚置いた結果。断ったときは理由だけを返す。 */
type PutResult = {url: string; bytes: number} | {error: string};

/**
 * 送られてきた絵を Storage に置く。
 *
 * **何の絵かは、名乗りではなく中身の頭で見る**（`islandApi.ts` の
 * `saveEventImage` と同じ理由。置き場に何でも置けるようにしない）。
 *
 * **縮めるのはブラウザの仕事。** Functions に画像を扱う道具を足すと、
 * 冷えた1回目が目に見えて遅くなる。北欧の写真（#202）も同じで、
 * ブラウザ側で焼いてから送っている。
 * @param {string} id 書類ID
 * @param {Role} role 背景なし(plain)か背景あり(scene)か
 * @param {string} name 置き場の名前の後ろ（"full" か幅の数字）
 * @param {unknown} raw data URL か、base64 の中身
 * @return {Promise<PutResult>} 置けた URL とバイト数、または断った理由
 */
async function putImage(
  id: string,
  role: Role,
  name: string,
  raw: unknown,
): Promise<PutResult> {
  const b64 = String(raw ?? "").replace(/^data:[^,]*,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return {error: "bad image"};
  }
  if (buf.length < 256 || buf.length > MAX_IMAGE_BYTES) {
    return {error: "bad size"};
  }
  const kind =
    buf.subarray(0, 8).toString("latin1") === "\x89PNG\r\n\x1a\n" ?
      "png" :
      buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ?
        "jpeg" :
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
          buf.subarray(8, 12).toString("ascii") === "WEBP" ?
          "webp" :
          null;
  if (!kind) return {error: "not an image"};

  const ext = kind === "jpeg" ? "jpg" : kind;
  const stored = `island/characters/${id}/${role}-${name}.${ext}`;
  const token = randomUUID();
  await admin
    .storage()
    .bucket(BUCKET)
    .file(stored)
    .save(buf, {
      contentType: `image/${kind}`,
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {firebaseStorageDownloadTokens: token},
      },
    });
  return {
    url:
      "https://firebasestorage.googleapis.com/v0/b/" +
      `${BUCKET}/o/${encodeURIComponent(stored)}?alt=media&token=${token}`,
    bytes: buf.length,
  };
}

/**
 * 送られてきた1人ぶんの絵を、幅ごとにまとめて置く。
 * @param {string} id 書類ID
 * @param {Role} role 役どころ
 * @param {Json} b 送られてきたもの（`full` と `sizes`）
 * @return {Promise<Json | {error: string}>} Firestore に入れる形
 */
async function saveRole(
  id: string,
  role: Role,
  b: Json,
): Promise<Json | {error: string}> {
  const out: Json = {sizes: {} as Json};
  if (b.full) {
    const r = await putImage(id, role, "full", b.full);
    if ("error" in r) return r;
    out.url = r.url;
    out.bytes = r.bytes;
  }
  const s = (typeof b.sizes === "object" && b.sizes ? b.sizes : {}) as Json;
  for (const w of WIDTHS) {
    if (!s[String(w)]) continue;
    const r = await putImage(id, role, String(w), s[String(w)]);
    if ("error" in r) return r;
    (out.sizes as Json)[String(w)] = r.url;
  }
  const w = Math.max(0, Math.min(20000, Number(b.w) || 0));
  const h = Math.max(0, Math.min(20000, Number(b.h) || 0));
  if (w) out.w = w;
  if (h) out.h = h;
  if (!out.url && Object.keys(out.sizes as Json).length === 0) {
    return {error: "no image"};
  }
  return out;
}

/**
 * キャラクターの口。**扱った URL なら true を返す。**
 * @param {CharacterReq} q 受け取ったもの
 * @param {CharacterRes} res 返す先
 * @param {CharacterDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleCharacters(
  q: CharacterReq,
  res: CharacterRes,
  deps: CharacterDeps,
): Promise<boolean> {
  /* ---- OBS の名簿。**合言葉を持っている人だけ。** ----
     投げ銭が来るたびに引きに行かせない。アラートは1秒が惜しいので、
     初期化のときに全員ぶん渡して、当てるのは手元でやる
     （いまの alertbox が Viewers 表でやっているのと同じ形）。
     **移す前のスプレッドシートは誰でも全件読めた**（#284 の (i)）。
     ここは合言葉で閉じる。 */
  const ab = /^\/alertbox\/([0-9a-f]{32})\/characters$/.exec(q.path);
  if (ab && q.method === "GET") {
    if (!(await deps.alertboxKey(ab[1]))) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    res.set("Cache-Control", "no-store");
    try {
      const snap = await CHARACTERS.limit(MAX_CHARACTERS).get();
      const characters: Json[] = [];
      snap.forEach((d) => characters.push(shapeFull(d.id, d.data() ?? {})));
      res.json({characters});
    } catch (e) {
      logger.warn("alertbox characters failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  if (!q.path.startsWith("/characters")) return false;

  /* ---- 1人を引く。**単一フィールドの1発。** ----
     `?channel=` はスパチャ（チャンネル名から）、
     `?alias=` は Doneru（他の呼び名からも）。
     **返すのは絵と絵文字だけ。** 打った名前を持っている人しか
     呼べないので、名前が増えて漏れることはない。 */
  if (q.method === "GET" && q.path === "/characters/lookup") {
    const channel = clean(q.query.channel, MAX_NAME);
    const alias = clean(q.query.alias, MAX_NAME);
    if (!channel && !alias) {
      res.status(400).json({error: "empty"});
      return true;
    }
    res.set("Cache-Control", "no-store");
    try {
      /* **スパチャはチャンネル名だけを見る。** 他の呼び名まで見ると、
         「あお」のような短い呼び名と表示名がぶつかったときに
         別人の絵が配信の画面に出る。 */
      const hit = channel ?
        await findBy("channelKeys", channel) :
        await findBy("lookupKeys", alias);
      if (!hit) {
        res.json({character: null});
        return true;
      }
      /* **名前は返さない。** 打った名前は呼んだ側がもう持っている。
         返して増やすと、当てずっぽうに打って名簿を集められる。 */
      res.json({
        character: {
          id: hit.id,
          emoji: hit.emoji,
          plain: hit.plain,
          scene: hit.scene,
        },
      });
    } catch (e) {
      logger.warn("character lookup failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  /* ---- 図鑑。**全員ぶん。名前は返さない。** ----
     いまの `/friends` は22人しか出していないが、それは
     `site/content/residents.ts`（直近90日の常連）を見ているから。
     ここは絵のある人を全員返す（実測で97人）。 */
  if (q.method === "GET" && q.path === "/characters") {
    const owner = await deps.ownerUid(q.auth);
    res.set(
      "Cache-Control",
      owner ? "no-store" : "public, max-age=300, s-maxage=1800",
    );
    try {
      const snap = await CHARACTERS.limit(MAX_CHARACTERS).get();
      const characters: Json[] = [];
      snap.forEach((d) =>
        characters.push(
          owner ?
            shapeFull(d.id, d.data() ?? {}) :
            shapePublic(d.id, d.data() ?? {}),
        ),
      );
      /* 並べ替えは引いてから（索引を作らない・#168）。絵文字の順は
         意味を持たないので、書類IDで固定して、日によって並びが
         変わらないようにする。 */
      characters.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      res.json({characters, total: characters.length});
    } catch (e) {
      logger.warn("characters read failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  const one = /^\/characters\/([^/]+)$/.exec(q.path);

  /* ---- 1人を足す / 直す。**あやとだけ。** ---- */
  if (q.method === "POST" && (q.path === "/characters" || one)) {
    const uid = await deps.ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    /* 新しく足すときは、いまのドライブの画像IDと**同じ形**のIDを振る。
       意味は持たない。並べるのにも使わない。 */
    const id = one ?
      decodeURIComponent(one[1]) :
      randomUUID().replace(/-/g, "") + "0";
    if (!CHARACTER_ID.test(id)) {
      res.status(400).json({error: "bad id"});
      return true;
    }
    res.set("Cache-Control", "no-store");

    const ref = CHARACTERS.doc(id);
    const cur = await ref.get();
    const had = (cur.data() ?? {}) as Json;

    const channelName = clean(q.body.channelName, MAX_NAME);
    const emoji = clean(q.body.emoji, 16);
    const aliases = (Array.isArray(q.body.aliases) ? q.body.aliases : [])
      .map((a) => clean(a, MAX_NAME))
      .filter((a) => a)
      .slice(0, MAX_ALIASES);
    if (!cur.exists && !channelName && aliases.length === 0) {
      res.status(400).json({error: "empty"});
      return true;
    }

    const now = new Date().toISOString();
    const patch: Json = {
      channelName,
      emoji,
      aliases,
      /* **鍵はここで作る。** 画面から作らせない。作り方が2か所に
         あると、片方だけ直したときに引けない行が静かに増える。 */
      channelKeys: keysOf(channelName ? [channelName] : []),
      lookupKeys: keysOf([channelName, ...aliases].filter((s) => s)),
      /* 移行の道具（`python/admin/characters_migrate.py`）は、これが
         入っている行を**触らない。** 画面から直したことが、次の
         移行で元に戻ってはいけない（`donors.ts` と同じ決まり）。 */
      editedAt: now,
      editedBy: uid,
      updatedAt: now,
    };
    if (!cur.exists) patch.createdAt = now;

    /* 絵は送られてきたぶんだけ差し替える。**送られてこなかった
       役どころには触らない。** 呼び名を直しただけで絵が消えると、
       島から人が1人いなくなる。 */
    const images = (typeof had.images === "object" && had.images ?
      {...(had.images as Json)} :
      {}) as Json;
    for (const role of ROLES) {
      const sent = q.body[role];
      if (!sent || typeof sent !== "object") continue;
      const saved = await saveRole(id, role, sent as Json);
      if ("error" in saved) {
        res.status(400).json({error: saved.error, role});
        return true;
      }
      images[role] = saved;
    }
    patch.images = images;

    await ref.set(patch, {merge: true});
    res.json({character: shapeFull(id, {...had, ...patch})});
    return true;
  }

  /* ---- 1人を消す。**あやとだけ。** ----
     Storage の実体も一緒に落とす。書類だけ消すと、URL を知っている
     人には絵が残る。 */
  if (q.method === "DELETE" && one) {
    const uid = await deps.ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    const id = decodeURIComponent(one[1]);
    if (!CHARACTER_ID.test(id)) {
      res.status(400).json({error: "bad id"});
      return true;
    }
    res.set("Cache-Control", "no-store");
    try {
      await admin
        .storage()
        .bucket(BUCKET)
        .deleteFiles({prefix: `island/characters/${id}/`});
    } catch (e) {
      // 書類は消す。置き場の掃除に失敗しても、画面からは消える
      logger.warn("character files delete failed", id, String(e));
    }
    await CHARACTERS.doc(id).delete();
    res.json({deleted: id});
    return true;
  }

  return false;
}
