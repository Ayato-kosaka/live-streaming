/**
 * Doneru の どねID を、YouTube のアカウントにつなぐ口(#190)。
 *
 * ## なぜ画面から直せないといけないか
 *
 * Doneru の投げ銭は BigQuery に入るが、**YouTube のチャンネルIDを
 * 持っていない**。だから `islandDonors`(どねID → YouTube のアカウント)の
 * 対応表を通してカードを配っている。表に無い どねID が投げ銭してくると、
 * 毎朝の取り込み(`python/doneru_supporters.py`)が `state: "new"` を置いて
 * ワークフローを赤くする。
 *
 * その直しかたが「Git の JSON を書き換えて、ワークフローを手で流す」しか
 * 無かった。**あやとは9月11日から北欧に出る。スマホしか無い場所で、
 * それはできない。** ここはそのための口。
 *
 * ## 正は Firestore、`python/donors_seed.json` は種
 *
 * ここから書いたものには **`editedAt` を入れる。**
 * 種の取り込み(`python/admin/donors_import.py`)はそれを見て触らない。
 * 入れ忘れると、あやとが紐付けた翌朝の取り込みで元に戻る。
 *
 * 「この人は分からない」(`clear`)にも入れる。**分からないと決めたことも、
 * 種で上書きされてはいけない。**
 *
 * ## 名前は、押したその場で引く
 *
 * 画面から届くのは `@ひめひめ-r9z` のような**表示名**で、チャンネルIDでは
 * ない。引く道は2つ、上から順に見る。
 *
 * 1. **辞書**(`islandChannels`)。毎日のジョブ(`python/island_channels.py`)が
 *    BigQuery の `chat_messages` から作っている「チャンネルID → いま
 *    名乗っている名前」。配信に来たことがある人はここで当たる
 * 2. **YouTube に聞く**(`channels.list({forHandle})`)。来たことのない人と、
 *    名前を変えたばかりの人はここで拾う
 *
 * **その場で決まるので、「あとで引く」状態(`pending`)は作らない。**
 * 一度は置いていたが、置くと「打ったのに、まだつながっていない」行が
 * 画面に残ることになる。あやとが見たいのは打った直後の答えなので、
 * 決まらなかったときは**保存せずに、決まらなかったと返す。**
 *
 * **`UC` で始まる24文字はチャンネルIDとして受ける。** 貼り付けられる人には
 * そのほうが速いし、引かずに済む。
 *
 * ## 名前が2人に使われていたら、決めない
 *
 * 表示名は誰でも同じにできる。**あやとの打ち間違いを疑う話ではない。
 * 打った名前が正しくても行き先が2つある。** どちらか分からないまま
 * 保存すると、別の人にカードが行く。だからそこで止めて、そう返す
 * (`python/donor_channels.py` と同じ決めかた)。
 *
 * ## 3つの状態
 *
 * | state | 意味 | カードを渡せるか |
 * | --- | --- | --- |
 * | `linked`   | チャンネルIDまで分かっている | **渡せる** |
 * | `unlinked` | この人は分からない、と決めた | 渡せない |
 * | `new`      | 表に無い どねID が投げ銭してきた | **紐付け待ち。赤い** |
 *
 * ## なぜ islandApi.ts の中に書かないか
 *
 * あの1本はもう3,000行ある。ここは丸ごと新しい機能で、向こうと共有するのは
 * 「あやとか」を見る関数だけなので、外に出して**取り付けの数行だけ**を
 * 向こうに足す(`remote.ts`・`cards.ts` が先例)。
 *
 * ## 索引を使わない(#168)
 *
 * サービスアカウントに複合索引を作る権限が無いので、`where` と `orderBy` を
 * 組み合わせると本番で 500 になる。対応表は30行ほどしか無いので、
 * **引いてから並べ替える。** 辞書を名前で引くところも
 * **単一フィールドの等価だけ**にしてある(索引が要らない範囲)。
 */

import {logger} from "firebase-functions";
import * as admin from "firebase-admin";
import {youtube} from "./youtubeClient";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** どねID → YouTube のアカウントの対応表。ドキュメントIDが どねID。 */
const DONORS = db.collection("islandDonors");

/** チャンネルID → いま名乗っている名前。毎日のジョブが作る。 */
const CHANNELS = db.collection("islandChannels");

/** 一度に読む行数。いまは30行ほど。増えても指で見る量には限りがある。 */
const MAX_DONORS = 300;

/** YouTube のチャンネルID の形。これに当たったら名前ではなくIDとして扱う。 */
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * どねID の形。
 *
 * **打ち間違いを疑うための検査ではない**(あやとの言葉「間違えないので
 * ご安心を」)。これはそのまま Firestore のドキュメントIDになるので、
 * `/` や `.` の入った文字列を弾いておかないと書けない、というだけ。
 */
const VIEWER_PK = /^[A-Za-z0-9_-]{1,64}$/;

/** 表示名の長さ。YouTube の表示名がこれを超えることはない。 */
const MAX_HANDLE = 80;

type Json = Record<string, unknown>;

/** 対応表の状態。 */
type DonorState = "new" | "unlinked" | "linked";

/** 画面に返す1行。 */
type Donor = {
  viewerPk: string;
  /** 呼び名。Doneru に出ていた名前か、あやとが種に書いたもの */
  label: string | null;
  /** 打った YouTube の表示名。何を打って繋いだかが分かるように残す */
  handle: string | null;
  channelId: string | null;
  /** そのチャンネルがいま名乗っている名前。辞書から引く */
  channelName: string | null;
  state: DonorState;
  /** あやと本人。表には載せるが、カードは渡さない */
  isOwner: boolean;
  /** 種に書いてある但し書き(いたずらの行など) */
  note: string | null;
  /** 表に無い どねID として、毎朝の取り込みが見つけた日 */
  firstSeenAt: string | null;
  /** 画面から直した日。**入っている行を、種は触らない** */
  editedAt: string | null;
  /**
   * 消せる行か。**画面から足した行だけ。**
   *
   * 毎朝の取り込みが置いた行と、種から入った行は消しても戻ってくるので、
   * 消せるように見せるほうが嘘になる。画面から足したときだけ `addedAt` が
   * 入る(`editedAt` と一緒に入るが、あちらは直した行にも入る)。
   */
  canDelete: boolean;
};

/** 呼ぶ側から借りるもの。「誰か」を見るところを2か所に増やさないため。 */
export type DonorDeps = {
  /** あやとなら uid、違えば null */
  ownerUid: (header?: string) => Promise<string | null>;
};

/** 対応表の口が受け取るもの。Express の req から要るものだけ。 */
export type DonorsReq = {
  method: string;
  path: string;
  auth?: string;
  body: Json;
};

/** 返す側。Express の res のうち、ここで使うものだけ。 */
export type DonorsRes = {
  set(k: string, v: string): unknown;
  status(n: number): DonorsRes;
  json(b: unknown): unknown;
};

/**
 * 打った名前を引いた結果。
 *
 * `via` は**何で引けたか**。画面はこれを見て「辞書にいました」「YouTube に
 * 聞きました」を出し分ける。押した人が、何に繋がったのかを見て確かめられる
 * ようにするため。
 */
type Found =
  | {ok: true; channelId: string; name: string | null; via: Via}
  | {ok: false; why: "duplicate" | "notfound"};

/** 引けた道。`id` は打たれたのがチャンネルIDそのものだった場合。 */
type Via = "id" | "dict" | "youtube";

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

/**
 * 打たれた文字から、チャンネルIDを決める。
 *
 * **決まらなかったら決めない。** 当てずっぽうで一番それらしいものを返すと、
 * 別の人にカードが渡る。返せないときは、なぜ返せないかを返す。
 * @param {string} typed 打たれた文字(表示名 か チャンネルID)
 * @return {Promise<Found>} 引けたチャンネルID、または引けなかった理由
 */
async function findChannel(typed: string): Promise<Found> {
  // 貼り付けられたIDは、引かずにそのまま使う
  if (CHANNEL_ID.test(typed)) {
    const got = await CHANNELS.doc(typed).get();
    const name = got.exists ? got.data()?.name : null;
    return {
      ok: true,
      channelId: typed,
      name: typeof name === "string" ? name : null,
      via: "id",
    };
  }

  /* 辞書を名前で引く。**等価だけ**なので索引は要らない(#168)。
     2件目が取れるかどうかだけ知りたいので、2件で足りる。 */
  const hit = await CHANNELS.where("name", "==", typed).limit(2).get();
  if (hit.size >= 2) return {ok: false, why: "duplicate"};
  if (hit.size === 1) {
    return {ok: true, channelId: hit.docs[0].id, name: typed, via: "dict"};
  }

  /* 辞書に無い。**配信に来たことがない人**か、**名前を変えたばかりの人**。
     YouTube に聞けば、どちらも拾える。 */
  try {
    const r = await youtube.channels.list({
      part: ["id", "snippet"],
      forHandle: typed,
    });
    const it = r.data.items?.[0];
    if (it?.id) {
      return {
        ok: true,
        channelId: it.id,
        name: it.snippet?.customUrl || it.snippet?.title || null,
        via: "youtube",
      };
    }
  } catch (e) {
    // 聞けなくても「見つからない」と同じ扱い。押した人にできることは同じ
    logger.warn("youtube forHandle failed", typed, String(e));
  }
  return {ok: false, why: "notfound"};
}

/**
 * Firestore に入っている値を、画面に返す形にそろえる。
 *
 * **チャンネルIDが入っていれば `linked`。** 状態の字は書き換わり損ねることが
 * あるが(種・毎朝の取り込み・画面の3か所が書く)、カードが渡せるかどうかは
 * チャンネルIDがあるかどうかで決まっているので、そちらを信じる。
 * @param {string} id ドキュメントID(= どねID)
 * @param {Json} v Firestore に入っている値
 * @param {string | null} channelName 辞書から引いたチャンネルの名前
 * @return {Donor} 画面に返す1行
 */
function shape(id: string, v: Json, channelName?: string | null): Donor {
  const channelId = typeof v.channelId === "string" ? v.channelId : null;
  const state: DonorState = channelId ?
    "linked" :
    v.state === "new" ?
      "new" :
      "unlinked";
  return {
    viewerPk: id,
    label: typeof v.label === "string" ? v.label : null,
    handle: typeof v.handle === "string" ? v.handle : null,
    channelId,
    channelName: channelName ?? null,
    state,
    isOwner: v.isOwner === true,
    note: typeof v.note === "string" ? v.note : null,
    firstSeenAt: typeof v.firstSeenAt === "string" ? v.firstSeenAt : null,
    editedAt: typeof v.editedAt === "string" ? v.editedAt : null,
    canDelete: typeof v.addedAt === "string",
  };
}

/** 並び順。**赤くなっている原因がいちばん上。** */
const ORDER: Record<DonorState, number> = {
  new: 0,
  unlinked: 1,
  linked: 2,
};

/**
 * 並べ替える。`new` → `unlinked` → `linked`。
 *
 * `new` の中は、見つけた日の古い順。**いちばん長く待っている人が上。**
 * ほかは呼び名で並べる(同じ人が複数の どねID を持っているので、
 * 名前で並べると隣り合う)。
 * @param {Donor} a 1つめ
 * @param {Donor} b 2つめ
 * @return {number} 並べ替えに使う値
 */
function byState(a: Donor, b: Donor): number {
  if (ORDER[a.state] !== ORDER[b.state]) return ORDER[a.state] - ORDER[b.state];
  if (a.state === "new") {
    return (a.firstSeenAt ?? "").localeCompare(b.firstSeenAt ?? "");
  }
  const an = a.handle ?? a.label ?? "";
  const bn = b.handle ?? b.label ?? "";
  return an.localeCompare(bn, "ja");
}

/**
 * チャンネルIDから、いま名乗っている名前を引く。
 *
 * **1件ずつ引かない。** 対応表は30行ほどだが、指で開くたびに30往復すると
 * 電波の悪いところで目に見えて待つ。`getAll` は1往復で済む。
 * @param {string[]} ids 引きたいチャンネルID(重複していてよい)
 * @return {Promise<Map<string, string>>} チャンネルID → 名前
 */
async function nameOf(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return out;
  try {
    const got = await db.getAll(...uniq.map((id) => CHANNELS.doc(id)));
    for (const d of got) {
      const n = d.data()?.name;
      if (typeof n === "string") out.set(d.id, n);
    }
  } catch (e) {
    // 名前が出ないだけ。紐付いているかどうかは channelId で分かる
    logger.warn("channel names failed", String(e));
  }
  return out;
}

/**
 * Doneru の対応表の口。**扱った URL なら true を返す。**
 *
 * 呼ぶ側(`islandApi.ts`)は true が返ったらそこで終わる。
 * false のときは何も書いていないので、そのまま次の口へ落ちてよい。
 * @param {DonorsReq} q 受け取ったもの
 * @param {DonorsRes} res 返す先
 * @param {DonorDeps} deps 呼ぶ側から借りるもの
 * @return {Promise<boolean>} ここで扱ったかどうか
 */
export async function handleDonors(
  q: DonorsReq,
  res: DonorsRes,
  deps: DonorDeps,
): Promise<boolean> {
  if (!q.path.startsWith("/donors")) return false;

  /* ---- 対応表をぜんぶ読む。**あやとだけ。** ----
     30行ほどなので、引いてから並べ替える(索引を作らない・#168)。 */
  if (q.method === "GET" && q.path === "/donors") {
    if (!(await deps.ownerUid(q.auth))) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    res.set("Cache-Control", "no-store");
    try {
      const snap = await DONORS.limit(MAX_DONORS).get();
      const rows: {id: string; v: Json}[] = [];
      snap.forEach((d) => rows.push({id: d.id, v: d.data() ?? {}}));
      const names = await nameOf(
        rows
          .map((r) => r.v.channelId)
          .filter((c): c is string => typeof c === "string"),
      );
      const donors = rows.map((r) =>
        shape(r.id, r.v, names.get(String(r.v.channelId ?? "")) ?? null),
      );
      donors.sort(byState);
      res.json({donors});
    } catch (e) {
      logger.warn("donors read failed", String(e));
      res.status(502).json({error: "unavailable"});
    }
    return true;
  }

  const m = /^\/donors\/([^/]+)$/.exec(q.path);
  if (!m) return false;
  const pk = decodeURIComponent(m[1]);

  /* ---- 1行を書く / 足す。**あやとだけ。** ---- */
  if (q.method === "POST") {
    const uid = await deps.ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    if (!VIEWER_PK.test(pk)) {
      res.status(400).json({error: "bad donor"});
      return true;
    }
    const clear = q.body.clear === true;
    /* 打つ欄は1つ。**名前とIDのどちらが来ても受ける。**
       貼り付けられる人はIDのほうが速い。 */
    const typed = clean(q.body.handle ?? q.body.channelId, MAX_HANDLE);
    if (!clear && !typed) {
      res.status(400).json({error: "empty"});
      return true;
    }
    res.set("Cache-Control", "no-store");

    /* **引けてから書く。** 引けないまま「あとで引く」行を残すと、
       打ったのにつながっていない行が画面に居座る。 */
    let found: Found | null = null;
    if (!clear) {
      found = await findChannel(typed);
      if (!found.ok) {
        // 400 番台。押した人がやり直せる話なので、理由をそのまま返す
        res.status(409).json({error: found.why, typed});
        return true;
      }
    }

    const ref = DONORS.doc(pk);
    const cur = await ref.get();
    const had: Json = cur.exists ? cur.data() ?? {} : {};
    const now = new Date().toISOString();
    const patch: Json = {
      /* **種に触らせないための印。** 「分からない」にも入れる
         (分からないと決めたことも、翌朝の種で戻されてはいけない)。 */
      editedAt: now,
      editedBy: uid,
      updatedAt: now,
    };
    if (!cur.exists) {
      /* 画面から足した行。Doneru の画面を見ながら、まだ来ていない人を
         先に入れておける。**`addedAt` がある行だけ、あとで消せる**
         (毎朝の取り込みが置いた行は、消しても翌朝また出てくる)。 */
      patch.viewerPk = pk;
      patch.label = null;
      patch.addedAt = now;
    }
    if (clear || !found?.ok) {
      // この人は分からない。手がかりも残さない
      patch.channelId = null;
      patch.handle = null;
      patch.state = "unlinked";
    } else {
      patch.channelId = found.channelId;
      // 打った字を残す。何を打って繋いだかが、あとから分かるように
      patch.handle = typed;
      patch.state = "linked";
    }
    await ref.set(patch, {merge: true});
    const name = found?.ok ? found.name : null;
    res.json({
      donor: shape(pk, {...had, ...patch}, name),
      /* 何で引けたか。**画面はこれを出す。** 押した結果が
         「つながりました」だけだと、何に繋がったのかが分からない */
      via: found?.ok ? found.via : null,
    });
    return true;
  }

  /* ---- 手で足した行を消す。**あやとだけ。** ----
     どねID はドキュメントIDなので直せない。打ち間違えたら、消して入れ直す。 */
  if (q.method === "DELETE") {
    const uid = await deps.ownerUid(q.auth);
    if (!uid) {
      res.status(403).json({error: "not allowed"});
      return true;
    }
    if (!VIEWER_PK.test(pk)) {
      res.status(400).json({error: "bad donor"});
      return true;
    }
    const ref = DONORS.doc(pk);
    const cur = await ref.get();
    if (!cur.exists) {
      res.set("Cache-Control", "no-store");
      res.json({deleted: pk});
      return true;
    }
    /* **画面から足した行だけ。** 毎朝の取り込みが `new` として置いた行や、
       種から入った行を消しても、翌朝また出てくる。 */
    if (!shape(pk, cur.data() ?? {}).canDelete) {
      res.status(409).json({error: "not yours"});
      return true;
    }
    await ref.delete();
    res.set("Cache-Control", "no-store");
    res.json({deleted: pk});
    return true;
  }

  return false;
}
