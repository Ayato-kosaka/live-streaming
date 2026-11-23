// 島で受けた投げ銭のつなぎ口（決定の記録 0017・#1405）

import { IConnector } from "./types";
import { DonationNotification, NotificationData } from "../types";
import { loadIslandSdk } from "./islandSdk";

/**
 * Firebase の公開の識別子。**秘密ではない**（Firebase Hosting が同じものを `/__/firebase/init.json` で配っている）。
 *
 * 出どころは `site/lib/firebase.ts` の `FIREBASE`（`apiKey`・`projectId`・`appId` の3つだけ写した）。
 * `site/` は別の書き出し（Next.js・自分だけの依存）なので、1つのファイルを分け合えない。**あちらを直したら、ここも直す。**
 * `EXPO_PUBLIC_` には入れない（書き出しに焼かれる値を、鍵のように見せない。CLAUDE.md）。
 * 読めるかどうかを決めるのは Firestore のルール（`islandAlertFeed` は `get` だけ開く。`docs/island-db.md` 4.2）。
 */
export const ISLAND_FIREBASE = {
  apiKey: "AIzaSyDts2gpO2fepPYOdiMyiz5ydTIQHNtY5kM",
  projectId: "live-streaming-d3cac",
  appId: "1:291182823114:web:84e7d7c52c8d3ca7d39633",
} as const;

/** アラートが購読する1枚の置き場（`docs/island-db.md` の `islandAlertFeed`） */
export const ISLAND_FEED = "islandAlertFeed";

/** Firebase のアプリの名前。ほかの面が既定のアプリを作っても混ざらないように分ける */
const APP_NAME = "alertbox-island-tip";

/**
 * 購読が**エラーで終わった**ときに付け直すまでの間（ms）。1回目 5 秒、こけるたびに倍、上限 5 分。
 *
 * ## 付け直すのは、エラーで終わったときだけ
 *
 * 回線が切れた・戻ったは、SDK が自分でつなぎ直す（購読は生きたまま、戻ったら続きの1枚が届く）。
 * こちらで付け直すと二重になるので、何もしない。
 * SDK が購読を**終わらせる**のは、`permission-denied`（ルールがまだ出ていない・出し直しの途中）などで、
 * そのあとは二度と届かない。配信中のあやとに「開き直して」と言わせないために、間をあけて付け直す。
 * 書き出しの分かれ（`import()`）が回線のせいで落ちたときも同じ道で取り直す。
 * 上限が 5 分なので、ルールが出ていない晩でも 1 時間に 20 回足らず（12 秒ごとの「もう一度出して」の 300 回より少ない）
 */
export const ISLAND_RETRY_MS = { first: 5_000, max: 300_000 } as const;

/** 1枚の中の1件（`docs/island-db.md`。配信のアラートに出すものだけ） */
export interface IslandFeedItem {
  seq: number;
  who: string;
  yen: number;
  text: string;
  at: number;
}

/** 届いた1枚。読めないもの・形が違うものは捨てる前提で、全部 unknown として受ける */
type FeedDoc = { seq?: unknown; items?: unknown };

/** 購読が受け取る1枚（SDK の DocumentSnapshot のうち、使うところだけ） */
interface FeedSnapshot {
  exists(): boolean;
  data(): FeedDoc | undefined;
  metadata: { fromCache: boolean };
}

const toItem = (raw: unknown): IslandFeedItem | null => {
  const x = raw as Partial<Record<keyof IslandFeedItem, unknown>> | null;
  if (!x || typeof x !== "object") return null;
  const seq = Number(x.seq);
  const yen = Number(x.yen);
  if (!Number.isSafeInteger(seq) || seq <= 0) return null;
  if (!Number.isFinite(yen) || yen <= 0) return null;
  return {
    seq,
    yen,
    who: typeof x.who === "string" ? x.who : "",
    text: typeof x.text === "string" ? x.text : "",
    at: Number(x.at) || 0,
  };
};

/**
 * 1件 → アラートの通知。**Doneru の donation と同じ形**にする（あやとの決定 Q1 A: 同じ描きかた・同じ7段・豚に全額）。
 * `test` は偽（偽にしないと、本物の投げ銭が試しの扱いになる）。台帳へは書き戻さない（`handleNotification` が
 * 台帳へ送るのはスパチャだけ。島の投げ銭は Stripe の知らせを受けた口が `islandSiteTips` に書いてある）
 */
export const toIslandNotification = (it: IslandFeedItem): DonationNotification => ({
  id: `island-${it.seq}`,
  type: "donation",
  amount: it.yen,
  assetID: null,
  message: it.text,
  messageType: 1,
  nickname: it.who,
  test: false,
});

/** SDK を取りにいくのを1回だけにする（付け直すたびに取りにいかない）。落ちたら捨てて、次に呼ばれたら取り直す */
let loading: Promise<
  (k: string, next: (s: FeedSnapshot) => void, fail: (e: { code?: string; message?: string }) => void) => () => void
> | null = null;

/** SDK を取りにいき（`islandSdk.ts` の `import()`）、合言葉の1枚を購読する関数を返す */
function listener() {
  if (!loading) {
    loading = (async () => {
      const { initializeApp, getApps, getFirestore, doc, onSnapshot } = await loadIslandSdk();
      const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(ISLAND_FIREBASE, APP_NAME);
      const db = getFirestore(app);
      return (k: string, next: (s: FeedSnapshot) => void, fail: (e: { code?: string; message?: string }) => void) =>
        /* 同期の状態だけが変わった回も受ける（`includeMetadataChanges`）。下の「手元の写しの1枚は読まない」と組で要る:
           手元の写しの1枚（fromCache）で中身が届き、そのあと同期だけが済んだとき、既定ではその回が来ない */
        onSnapshot(doc(db, ISLAND_FEED, k), { includeMetadataChanges: true }, next, fail);
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/**
 * 島で受けた投げ銭を、`islandAlertFeed/{合言葉}` のリアルタイム購読で受ける（約1秒。決定の記録 0017）。
 *
 * 「もう一度出す」（`index.tsx` の `replayTick`）と同じ3つの守り:
 *
 * 1. **起き上がって最初に受け取った1枚は、控えるだけで出さない。** OBS を開き直した瞬間に、前に出した投げ銭が
 *    もう一度流れるのを止める
 * 2. **前に見た `seq` より大きいものだけを、古い順に出す。** 同じ1枚が2回届いても、出すのは1回
 * 3. **手元の写しの1枚（`metadata.fromCache`）は読まない。** 回線がまだ無いうちに開くと、SDK は「無い」という
 *    手元の1枚を先に出す。それで控えると、つながった瞬間に直近20件が全部「新しい」に見えて流れる。
 *    この面は書かないので、手元の写しにはサーバーから受け取ったものしか無い（読まなくても落とさない）
 *
 * 合言葉が `islandUsers` に無くても（テスト用の合言葉）、1枚さえあれば出る。ほかの口（`/alertbox/{k}/*`）には頼らない
 */
export class IslandTipConnector implements IConnector {
  constructor(private alertboxId: string) {}

  start(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ): () => void {
    const k = this.alertboxId;
    /* 手放すときに切る参照（止めたあとに SDK から遅れて届いても、面の関数を握り続けない） */
    let emit: ((n: NotificationData) => void) | null = onEvent;
    let fail: ((e: Error) => void) | null = onError;
    let unsub: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    /** 見た `seq`。null はまだ1枚も控えていない */
    let last: number | null = null;
    let fails = 0;

    const report = (why: string) => {
      fail?.(new Error(`[IslandTipConnector] ${why}`));
    };

    const onSnap = (s: FeedSnapshot) => {
      if (stopped || s.metadata.fromCache) return;
      fails = 0;
      const d = s.exists() ? s.data() : undefined;
      const raw = d?.items;
      const items = (Array.isArray(raw) ? raw : [])
        .map(toItem)
        .filter((x): x is IslandFeedItem => x != null)
        .sort((a, b) => a.seq - b.seq);
      const top = Math.max(Number(d?.seq) || 0, items.length ? items[items.length - 1].seq : 0);
      /* 1枚目は控えるだけ。**作り直された1枚**（前に見たより `seq` が小さい）も同じ扱いにする:
         どれが新しいか分からないので、出すより出さないほうに倒す */
      if (last === null || top < last) {
        last = top;
        return;
      }
      for (const it of items) {
        if (it.seq <= last) continue;
        last = it.seq;
        emit?.(toIslandNotification(it));
      }
      if (top > last) last = top;
    };

    const subscribe = () => {
      retry = null;
      listener().then(
        (listen) => {
          if (stopped) return;
          unsub = listen(k, onSnap, (e) => {
            /* SDK はこの購読を終わらせた。もう届かないので、間をあけて付け直す */
            unsub = null;
            report(`${e?.code ?? "error"}: ${e?.message ?? ""}`);
            later();
          });
        },
        (e) => {
          if (stopped) return;
          report(`load: ${String(e)}`);
          later();
        }
      );
    };

    const later = () => {
      if (stopped || retry) return;
      const ms = Math.min(ISLAND_RETRY_MS.first * 2 ** fails, ISLAND_RETRY_MS.max);
      fails++;
      retry = setTimeout(subscribe, ms);
    };

    subscribe();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      unsub?.();
      unsub = null;
      emit = null;
      fail = null;
    };
  }
}
