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

/**
 * 置き場に入っている拡張子と、返すときの型。
 *
 * **焼いたものが webp とは限らない。** 画面から足すとき、ブラウザに
 * canvas から webp を書き出す力が無いと、背景なしは **png**、背景ありは
 * **jpeg** に落ちる（`site/components/me/Characters.tsx` の `bake`。
 * 背景なしは透明を持っているので jpeg には落とせない）。
 * 実際に1人ぶんが `plain-128.png` / `scene-128.jpg` で入っていた。
 *
 * **短い名前（`plain-128.webp`）は呼ぶ側の合言葉であって、置き場の
 * ファイル名ではない。** 下の口は実物を探して、実物の型で返す。
 */
const IMAGE_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

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
  /** 絵そのものを返す（下の「短い名前で絵を返す」だけが使う） */
  send(body: Buffer): unknown;
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

/* ======================= 表示名を、作るときに引く（#155） =======================

   画面から人を足すとき、`channelName` に入るのは**ハンドル**（`@…`）である
   ことが多い。あやとが打つのも、YouTube のコメント欄から拾えるのもそれ。

   ところが**ドネルは、名乗りの初期値に「チャンネル名（表示名）」を入れて
   くる。** 引き当ては完全一致（`array-contains`）なので、ハンドルしか
   持っていない人はドネルから引けない（#147）。

   #148 でそこを直したが、直したのは**その日いた人のぶんだけ**だった。
   毎晩の繋ぎ（`rebake` にぶら下がる `channel_alias`）が翌朝には追いつく
   ものの、**作った瞬間から今夜までのあいだ、その人はドネルから引けない。**
   あやとの言葉（2026-09-18）:

   > `@えびっち-m7r` で作ったけど、あだ名の初期値ないやん。
   > なぜ既存の対応したら、新規も順応できる仕組みを作らない？？

   だから**入口で入れる。** 書く前に YouTube を引いて、表示名を `aliases`
   の初期値に足す。やり方は `python/admin/channel_alias.py` と同じで、
   **鍵は要らない**（名乗らない側から頁を読むだけ。cookie も鍵も渡さない）。

   ## 穴は2段だった（#441）

   毎晩の繋ぎは、そもそもこの人を見ていなかった。`channel_alias.py` は
   **`channelId` から**表示名を引くが、**画面から作ると `channelId` が
   入らない**（本番で103人中19人が空。#441）。空の人は対象に入らないので、
   入口で表示名だけ入れても、**その人は明日も明後日も繋ぎの外に居る。**

   ハンドルの頁には `channelId` も表示名も入っているので、**1回の取得で
   両方**取る。IDは**空のときだけ**入れて、すでに入っている書類にも、
   すでに誰かに付いているIDにも触らない（`characters_link.py` と同じ決め。
   同じIDが2人に付くと、カードの絵が入れ替わる）。

   **引けなくても、作成は通す。** 人が作れなくなるほうが困る。ただし
   黙って通さない——返事に理由を入れて、画面に出す。 */

/** 引き先。**見張りが偽の相手を当てられるように、ここだけ差し替えられる。** */
const YT_BASE = process.env.YT_BASE || "https://www.youtube.com";

/** 名乗らない側から見る。**cookie も鍵も渡さない**（`channel_alias.py` と同じ）。 */
const YT_UA = "Mozilla/5.0 (compatible; island-name/1.0)";

/** 引くのを待つ上限。**作成そのものを待たせない。** 超えたら「引けなかった」 */
const YT_TIMEOUT_MS = 8000;

/**
 * 頁から読む上限。
 *
 * ハンドルの頁は実測 1.69MB で、`og:title` は **757KB 目**に居る。
 * 見つけた時点で読むのをやめるので、ふつうはここまで来ない。
 * 作りが変わって題が出てこなくなったときに、際限なく読まないための蓋。
 */
const YT_MAX_BYTES = 2 * 1024 * 1024;

/** 締め出されると題が YouTube そのものになる。**名前として受け取らない。** */
const YT_BAD_TITLE = new Set(
  ["youtube", "youtube - 404 not found", "404 not found"]);

/** ハンドル。`@` で始まって、空白も `/` も持たない。 */
const HANDLE = /^@[^\s/?#]+$/;
/** チャンネルID。`UC` + 22字。 */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * 表示名を引いた結果。**「引けなかった」と「引く必要が無かった」を混ぜない。**
 *
 * - `added` … 引けて、呼び名に足した
 * - `already` … 引けたが、もう入っていた（足していない）
 * - `skipped` … 引きに行っていない（打たれた字がもう表示名）
 * - `failed` … 引きに行って、取れなかった
 */
export type NamedState = "added" | "already" | "skipped" | "failed";

/** 画面に返す、表示名まわりの1行。 */
export type Named = {
  state: NamedState;
  /** 引けた表示名。`failed` `skipped` のときは空 */
  name: string;
  /** 取れなかった理由。人が読む1行。**素性は入れない** */
  why: string;
};

/** 1回の取得から読み取るもの。**表示名とチャンネルIDの両方。** */
export type Read = {
  /** 表示名。読めなければ空 */
  name: string;
  /** `UC…`。読めなければ空 */
  channelId: string;
};

/**
 * Atom の、**`<entry>` より前の** `<title>`。
 *
 * 動画の題も `<title>` なので、切ってから拾わないと1本目の動画名を
 * その人の名前として足すことになる（`channel_alias.py` と同じ）。
 * @param {string} body 取ってきた中身
 * @return {Read} 読み取ったもの。IDは feed には要らない（引く前から分かる）
 */
export function feedRead(body: string): Read {
  const head = body.split("<entry>", 1)[0];
  const m = /<title>([\s\S]*?)<\/title>/.exec(head);
  return {name: m ? unescapeXml(m[1]).trim() : "", channelId: ""};
}

/**
 * ハンドルの頁から、**表示名とチャンネルIDを1回で**読む。
 *
 * | 何を | どこから | 本番での位置（実測 2026-09-18） |
 * | --- | --- | --- |
 * | チャンネルID | `<link rel="canonical" href=".../channel/UC…">` | 756KB 目 |
 * | 表示名 | `<meta property="og:title" content="…">` | 757KB 目 |
 *
 * **2つとも同じ頁の同じあたりに居る**ので、1.69MB を2回取りに行く
 * 必要はない。ID が空の人（画面から作った人。#441）は、ここで一緒に
 * 埋まる。
 * @param {string} body 取ってきた中身
 * @return {Read} 読み取ったもの
 */
export function pageRead(body: string): Read {
  const t = /<meta\s+property="og:title"\s+content="([^"]*)"/.exec(body);
  const c = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/.exec(body);
  return {
    name: t ? unescapeXml(t[1]).trim() : "",
    channelId: c ? c[1] : "",
  };
}

/**
 * `&amp;` などを戻す。名前に出るのはこの5つだけ（`channel_alias.py` と同じ）。
 * @param {string} s 元の字
 * @return {string} 戻した字
 */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * 向こうが断った、という落ち方。**「届かなかった」と混ぜない。**
 *
 * 404 は**その名乗りがもう無い**——ハンドルが変わったか消えたので、
 * 人が直せる話。届かないのは**出口**の話で、直すのはこちら側。
 * 同じ字で返すと、押した人がどちらを直せばいいか決められない
 * （2026-09-18 に実際に決められなかった）。
 */
class HttpStatus extends Error {
  /** 返ってきた番号。 */
  status: number;

  /**
   * @param {number} status HTTP の番号
   */
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatus";
    this.status = status;
  }
}

/**
 * 1本取ってきて、表示名とチャンネルIDを読む。**そろった時点でやめる。**
 *
 * ハンドルの頁は 1.69MB あるが、2つとも 757KB 目までに居る。最後まで
 * 受け取ると作成が1秒ぶん遅くなるので、そろったところで切る。
 * @param {string} url 引き先
 * @param {Function} pick 拾い方（受け取った中身から表示名とIDを返す）
 * @param {boolean} needId IDもそろうまで読むか（feed のときは要らない）
 * @return {Promise<Read>} 読めたもの。読めなければ空
 */
async function readYt(
  url: string,
  pick: (body: string) => Read,
  needId: boolean,
): Promise<Read> {
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), YT_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: {"User-Agent": YT_UA, "Accept-Language": "ja,en;q=0.8"},
    });
    if (!r.ok) throw new HttpStatus(r.status);
    if (!r.body) return pick(await r.text());
    const dec = new TextDecoder("utf-8");
    let buf = "";
    let got = 0;
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      got += chunk.byteLength;
      buf += dec.decode(chunk, {stream: true});
      const hit = pick(buf);
      /* **そろったら、そこで読むのをやめる。** `return` で抜けると
         受け取りそのものが閉じる（`cancel()` を自分で呼ぶと、読んでいる
         最中の流れを壊して「届かなかった」になる。1度それで踏んだ） */
      if (hit.name && (hit.channelId || !needId)) return hit;
      if (got >= YT_MAX_BYTES) break;
    }
    return pick(buf + dec.decode());
  } finally {
    clearTimeout(stop);
  }
}

/** 引いた結果ぜんぶ。**画面に出すのは `named` だけ。** */
export type Got = {
  named: Named;
  /** 引けたチャンネルID。**書類が空のときだけ使う**（#441） */
  channelId: string;
};

/**
 * 落ちかたを、**押した人が次に何をするかで分けた1行**にする。
 *
 * ここに素性は入らない（入れてはいけない）。出すのは種類だけ。
 * @param {unknown} e 落ちたもの
 * @return {string} 人が読む1行
 */
function whyOf(e: unknown): string {
  if (e instanceof Error && e.name === "AbortError") return "時間切れ";
  if (e instanceof HttpStatus) {
    /* **404 だけは別の字。** その名乗りがもう無い＝人が直せる話 */
    return e.status === 404 ?
      "見つからない（404）" :
      `断られた（HTTP ${e.status}）`;
  }
  return "届かなかった";
}

/**
 * 打たれた字から、YouTube の表示名とチャンネルIDを引く。
 *
 * 引きに行くのは**ハンドル（`@…`）とチャンネルID（`UC…`）のときだけ。**
 * ふつうの表示名が打たれていれば、もう入っているので引かない。
 *
 * **軽いほうから当てる**（`channel_alias.py` の表と同じ）。feed は 668バイト、
 * ハンドルの頁は 1.69MB で、1200倍ちがう。ID が打たれているなら、それが
 * そのまま `channelId` なので頁へは行かない。
 * @param {string} channelName 打たれた字
 * @return {Promise<Got>} 引いた結果。**取れなくても投げない**
 */
export async function lookupChannel(channelName: string): Promise<Got> {
  const v = channelName.trim();
  const handle = HANDLE.test(v);
  const cid = CHANNEL_ID.test(v);
  const no = (state: NamedState, why = "") => ({
    named: {state, name: "", why},
    channelId: "",
  });
  if (!handle && !cid) return no("skipped");

  const url = cid ?
    `${YT_BASE}/feeds/videos.xml?channel_id=${encodeURIComponent(v)}` :
    `${YT_BASE}/@${encodeURIComponent(v.slice(1))}`;
  try {
    const got = await readYt(url, cid ? feedRead : pageRead, !cid);
    /* **打たれたのが `UC…` なら、それがそのままIDである。**
       引けたかどうかとは関わりがないので、題の可否より先に決める */
    const channelId = cid ? v : got.channelId;
    const title = clean(got.name, MAX_NAME);
    if (!title) return {...no("failed", "題が読めなかった"), channelId};
    if (YT_BAD_TITLE.has(title.toLowerCase())) {
      // **締め出されている。** 名前が無いのではない（`channel_alias.py`）
      return {...no("failed", "YouTube に断られた"), channelId};
    }
    return {named: {state: "added", name: title, why: ""}, channelId};
  } catch (e) {
    /* **素性を出さない。** このリポジトリは公開で、ログも誰でも読める。
       出すのは「どう駄目だったか」だけで、誰のことかは出さない。

       **404 を「届かなかった」に畳まない。** 畳むと、押した人には
       「その名乗りがもう無い（人が直す）」と「出口が塞がれている
       （こちらが直す）」が同じ字に見える。2026-09-18 に、それで
       どちらを直すか決められなかった。 */
    const why = whyOf(e);
    logger.warn("channel title lookup failed", why);
    return {...no("failed", why), channelId: cid ? v : ""};
  }
}

/**
 * その `channelId` が、**もう誰かに付いていないか。**
 *
 * 同じIDが2人に付くのは事故で、**カードの絵がもう1人のものになる**
 * （`cards.ts` の `iconsOf` は `channelId` から引く）。
 * `characters_link.py` が「すでに誰かに付いているIDには触らない」と
 * しているのと同じ決め。引けなければ**入れない側に倒す。**
 * @param {string} channelId 入れようとしているID
 * @param {string} self いま書いている書類ID（自分に付いているのは数えない）
 * @return {Promise<boolean>} もう誰かが持っていれば true
 */
async function channelIdTaken(
  channelId: string,
  self: string,
): Promise<boolean> {
  try {
    const q = await CHARACTERS
      .where("channelId", "==", channelId)
      .limit(2)
      .get();
    return q.docs.some((d) => d.id !== self);
  } catch (e) {
    logger.warn("channelId check failed", String(e));
    return true;
  }
}

/**
 * 引けた表示名を、**呼び名の末尾に足す。**
 *
 * - **手で入れた呼び名は消さない。** 足すだけ
 * - すでに同じ字が入っていれば足さない（`already`）
 * - 打たれた字そのものと同じなら足さない（ハンドルと表示名が同じ人）
 * - 呼び名が上限まで埋まっていたら、**手で入れたほうを残す**
 * @param {string} channelName 打たれた字
 * @param {string[]} aliases 画面から送られてきた呼び名
 * @param {Named} got 引いた結果
 * @return {{aliases: string[], named: Named}} 足したあとの呼び名と、何が起きたか
 */
export function withChannelTitle(
  channelName: string,
  aliases: string[],
  got: Named,
): {aliases: string[]; named: Named} {
  if (got.state !== "added" || !got.name) return {aliases, named: got};
  /* **「もう引けるか」で見る。** 字が同じかではない。
     `keysOf` は `@` を落とした形も作るので、ハンドルと表示名が同じ人
     （`@onajiji` と `onajiji`）は、足さなくてもドネルから引ける */
  const key = normKey(got.name);
  if (keysOf([channelName, ...aliases]).includes(key)) {
    return {aliases, named: {...got, state: "already"}};
  }
  if (aliases.length >= MAX_ALIASES) {
    return {
      aliases,
      named: {state: "failed", name: got.name, why: "呼び名がいっぱい"},
    };
  }
  return {aliases: [...aliases, got.name], named: got};
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
    /* 作った順（`python/admin/characters_order.py` が入れる）。
       **名前ではないので、誰にでも返してよい。** 図鑑はこの順に並べる。
       入っていない人は末尾（画面から足したばかりで、まだ番号が無い）。 */
    order: typeof v.order === "number" ? v.order : null,
    /* 画面から足した時刻。**番号が無い人どうしを並べるのに使う。**
       番号は表から作るので、表に無い新しい人には付かない。 */
    createdAt: typeof v.createdAt === "string" ? v.createdAt : null,
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
    /* 投げ銭のアラートで、絵のかわりに流す短い動画。
       **入っていないのがふつう。** 入っている人だけ、OBS が動画にする
       (`app/alertbox/index.tsx` の `calculateAdjustedSource`)。

       **画面からは書けない。** ここを誰でも打てるようにすると、
       配信に映るものを外から差し替える口になる。入れるのは
       `python/admin/character_video.py`（あやとだけが回せる）。

       前はここが返っていなかったので、OBS 側に動画を出す道はあるのに
       **どの人にも一度も届いていなかった**（2026-09-15 に気づいた）。 */
    videoUrl: typeof v.videoUrl === "string" && v.videoUrl ? v.videoUrl : null,
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
 * @param {Json} had 前に入っていた同じ役どころ。送られてこなかった欄はここから残す
 * @return {Promise<Json | {error: string}>} Firestore に入れる形
 */
async function saveRole(
  id: string,
  role: Role,
  b: Json,
  had: Json,
): Promise<Json | {error: string}> {
  const out: Json = {sizes: {} as Json};
  if (b.full) {
    const r = await putImage(id, role, "full", b.full);
    if ("error" in r) return r;
    out.url = r.url;
    out.bytes = r.bytes;
  } else if (typeof had.url === "string") {
    /* **元の1枚は、送られてこなければ触らない。** 役どころごと差し替える
       決まり（下の「送られてこなかった役どころには触らない」）と同じ考えで、
       役どころの中も、送られてきたものだけを入れ替える。
       焼き直し（`python/admin/characters_rebake.py`）は小さいほうだけを
       送るので、ここで落とすと**持ち帰り用の元の絵が消える。** */
    out.url = had.url;
    if (typeof had.bytes === "number") out.bytes = had.bytes;
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
  /* 大きさも同じ。送られてこなければ、前に入っていたものを残す。 */
  if (w) out.w = w;
  else if (typeof had.w === "number") out.w = had.w;
  if (h) out.h = h;
  else if (typeof had.h === "number") out.h = had.h;
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

  /* ---- 短い名前で絵を返す。**焼き込みから呼べるように。** ----

     絵は Google ドライブから置き場（Firebase Storage）へ移した（#284）。
     置き場の URL は1本 200字あって、しかも**1枚ずつ違う合言葉が付いている。**
     焼き込めない（95人ぶんで 150KB）し、島の絵は画面が出た瞬間に要るので、
     口から名簿を取ってから描くのも遅い。

     短い名前をここで受けて、**絵そのものを返す。**

       /island-api/characters/{id}/plain-128.webp

     ドライブの `lh3.googleusercontent.com/d/{id}=s128` の置き換えで、
     形をそろえてある。呼ぶ側は絵の id さえ知っていればよい。

     **この名前は合言葉で、置き場のファイル名ではない。** 拡張子は
     いつも `.webp` で呼んでよく、実物が png でも jpeg でも、こちらが
     探して実物の型で返す（上の IMAGE_TYPES）。

     ## 送らずに、こちらから返す理由

     置き場へ 302 で送るほうが安いが、**カードの絵を canvas に描いている**
     （`components/cards/CardSheet.tsx`）。canvas は、途中で別のドメインへ
     渡った絵を描くと汚れて、書き出せなくなることがある。ここから同じ
     生い立ちのまま返せば、その筋の心配が丸ごと消える。往復も1本で済む。

     ## Firestore を読まない

     どこに置いてあるかは id だけで決まる（`island/characters/{id}/`）ので、
     書類を引く必要がない。島は22枚まとめて呼ぶ。
     **1枚ごとに書類を1回読んでいたら 22回**になる。

     ## 1年キャッシュしない

     あやとが画面から絵を入れ替えると、同じ名前のまま中身が変わる。
     長く焼き付けると、入れ替えたのに古い絵が出続ける。
     手前（CDN）は1時間、ブラウザは10分。 */
  const img =
    /^\/characters\/([^/]+)\/(plain|scene)-(128|256|640)\.(?:webp|png|jpe?g)$/
      .exec(q.path);
  if (img && q.method === "GET") {
    const [, rawId, role, size] = img;
    const id = decodeURIComponent(rawId);
    if (!CHARACTER_ID.test(id)) {
      res.status(400).json({error: "bad id"});
      return true;
    }
    try {
      const bucket = admin.storage().bucket(BUCKET);
      /* **置き場の名前を決め打ちしない。一覧を1回引いて、そこから選ぶ。**

         前は `${role}-${w}.webp` を直に開いていた。**焼いたものが webp
         とは限らない**（上の IMAGE_TYPES）ので、png で入っていた1人だけ
         図鑑が 404 になり、枠に代替テキストがはみ出していた。

         1枚ずつ `exists()` を叩く形のまま拡張子を足すと、幅3×拡張子4で
         12往復になる。1人ぶんの置き場は多くても8ファイルなので、
         **一覧1回のほうが安い。** */
      const [files] = await bucket.getFiles({
        prefix: `island/characters/${id}/`,
      });
      type Stored = (typeof files)[number];
      /* 幅（と、最後の逃げ場の "full"）→ 実物。同じ幅が2つあれば webp を
         採る。焼き直しても**古い png は消さない**ので、両方残っている。 */
      const have = new Map<string, Stored>();
      for (const f of files) {
        const m = /\/(plain|scene)-(\d+|full)\.([A-Za-z0-9]+)$/.exec(f.name);
        if (!m || m[1] !== role || !IMAGE_TYPES[m[3].toLowerCase()]) continue;
        const now = have.get(m[2]);
        if (!now || (m[3] === "webp" && !now.name.endsWith(".webp"))) {
          have.set(m[2], f);
        }
      }
      /* 頼まれた幅が無ければ**大きいほうへ上げる。引き伸ばさない。**
         元が 640px より小さい人は 640 を焼いていない
         （`characters_migrate.py`「大きさは、こちらで焼く」）。
         それも無ければ、焼いてあるいちばん大きいものへ落とす。

         **焼いた幅が1つも無ければ、元の1枚（`-full`）へ落ちる。**
         焼くのは元より小さい幅だけなので、幅が1枚も無い人は元そのものが
         128px 以下。重い絵を掴まされる形にはならない。 */
      const want = Number(size);
      const order = [
        ...WIDTHS.filter((w) => w >= want),
        ...WIDTHS.filter((w) => w < want).reverse(),
      ].map(String);
      order.push("full");
      const hit = order.map((k) => have.get(k)).find((f) => f);
      if (hit) {
        /* **返す型は、置いてある実物から決める。** 呼ばれた名前の拡張子
           （いつも .webp）で名乗ると、png を webp として渡すことになる。 */
        const ext = (/\.([A-Za-z0-9]+)$/.exec(hit.name) || ["", ""])[1];
        const [buf] = await hit.download();
        res.set("Content-Type", IMAGE_TYPES[ext.toLowerCase()] || "image/webp");
        res.set("Cache-Control", "public, max-age=600, s-maxage=3600");
        res.send(buf);
        return true;
      }
      /* 絵がまだ無い人。**長く覚えさせない**（あとから入る） */
      res.set("Cache-Control", "public, max-age=60");
      res.status(404).json({error: "no image"});
    } catch (e) {
      logger.warn("character image failed", String(e));
      res.set("Cache-Control", "no-store");
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
    /* 画面から打たれた呼び名。**下の絵の `sent` と混ぜない**（別物） */
    const typed = (Array.isArray(q.body.aliases) ? q.body.aliases : [])
      .map((a) => clean(a, MAX_NAME))
      .filter((a) => a)
      .slice(0, MAX_ALIASES);
    if (!cur.exists && !channelName && typed.length === 0) {
      res.status(400).json({error: "empty"});
      return true;
    }

    /* **書く前に、YouTube の表示名を呼び名へ入れる（#155）。**
       ドネルが名乗りの初期値に入れてくるのは表示名で、ハンドルではない。
       今夜の繋ぎを待つと、作った日のぶんだけ引けない人ができる。
       **引けなくても作成は通す。** 理由は返事に入れて、画面に出す。

       **同じ字で一度引けていて、IDも入っていたら、もう引かない。**
       画面は絵を1枚ずつ送ってくる（`Characters.tsx`）ので、1回の保存で
       2回も3回も口を叩く。ハンドルの頁は本番で 1.69MB ある。
       引けなかったときは印を付けないので、次の保存で引き直す。
       あやとが手で呼び名を消したときも、印がある限り足し直さない
       ——消したのは、消したかったからである。 */
    const done = had.channelTitleFor === channelName && !!had.channelId;
    const got = done ?
      {named: {state: "already" as NamedState, name: "", why: ""},
        channelId: ""} :
      await lookupChannel(channelName);
    const {aliases, named} = withChannelTitle(channelName, typed, got.named);

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
    /* **引けた字を、どの `channelName` で引いたか。** 次の保存で
       同じ字なら引きに行かない（上の `done`）。引けなかったときは
       付けない——付けると、その人は二度と引き直されない */
    if (named.state === "added" || named.state === "already") {
      patch.channelTitleFor = channelName;
    }

    /* **チャンネルIDは、空のときだけ入れる（#441）。**
       画面から作った人はIDを持たないので、毎晩の繋ぎ
       （`channel_alias.py` は ID から引く）の対象にすら入らなかった。
       ここで一緒に埋める。
       **すでに入っている書類には触らない。** IDは名前と違って変わらない
       ものなので、上書きは「別人に付け替える」のと同じ。
       **すでに誰かが持っているIDも入れない**（`characters_link.py` と
       同じ決め。2人に同じIDが付くと、カードの絵が入れ替わる）。 */
    const hadId = typeof had.channelId === "string" && had.channelId;
    if (!hadId && got.channelId && !(await channelIdTaken(got.channelId, id))) {
      patch.channelId = got.channelId;
    }
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
      const was = images[role];
      const saved = await saveRole(
        id,
        role,
        sent as Json,
        (typeof was === "object" && was ? was : {}) as Json,
      );
      if ("error" in saved) {
        res.status(400).json({error: saved.error, role});
        return true;
      }
      images[role] = saved;
    }
    patch.images = images;

    await ref.set(patch, {merge: true});
    res.json({character: shapeFull(id, {...had, ...patch}), named});
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
