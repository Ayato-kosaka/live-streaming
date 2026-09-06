/**
 * 配信のコメントを、ブラウザから YouTube に直接読みにいく。
 *
 * ## なぜ Functions を通さないか
 *
 * `liveChatMessages.list` は**1回5単位**。既定の枠は1日10,000単位しかない。
 * Functions（`functions/src/liveChat.ts`）から読むと、それはこちらの
 * プロジェクトの枠で、30分ごとの定期コメントや月末の集計と食い合う。
 * 長い配信でコントローラーを開けっぱなしにすると、そこで効いてくる。
 *
 * あやとの言葉（2026-09-06）:
 * 「YouTubeコメント取るのはアラートボックスの仕様を真似すれば、割り当て食わない」
 *
 * **割り当ては、トークンを発行したプロジェクトに付く。** Doneru が出した
 * アクセストークンで読めば、減るのは Doneru 側の枠になる。
 * 配信の OBS に出しているアラートボックス（`app/alertbox`）は前からこの形。
 *
 * ## `app/alertbox/connectors/YouTubeConnector.ts` から写している
 *
 * **共有していない。写している。** `app/`（Expo/Metro）と `site/`（Next.js）は
 * 別のビルドで、`site` は `npm --prefix site ci` で自分だけの依存を入れて
 * `outputFileTracingRoot` も `site/` に固定してある。site の外の `.ts` を
 * 取り込む道を作ると、本番の Hosting のビルドがそこに乗ることになる。
 * **配信中に動いているアラートボックスを巻き込む形の付け替えは、ここではしない。**
 *
 * 写したのは次のところ。**片方を直したら、もう片方も見ること。**
 *
 * - `pollingIntervalMillis` を返事から読んで、それに従う
 * - `nextPageToken` を持って、続きから読む
 * - `liveBroadcasts.list` → `videos.list` の順で `liveChatId` を引く
 * - 401 が出たら Doneru に取り直させて、1回だけやり直す
 *
 * 違うところは2つ。
 *
 * - **鍵をここに持たない。** アラートボックスは OBS の URL に `?key=` で
 *   Doneru の鍵を載せているが、こちらは静的書き出しなので焼くと誰でも読める。
 *   鍵はサーバー（`islandUsers/{uid}.doneruKey`）に置いたままにして、
 *   ここは `/roulette/yt-token` から寿命の短いトークンだけをもらう
 * - **拾うのがスパチャではなく、ふつうのコメント全部。** ルーレットの
 *   選択肢はコメントから選ぶので、金額の有無は関係ない
 */

import { getRouletteYtToken, type ChatLine } from "@/lib/api";

/** YouTube が返してくるチャットの1行。使うところだけ書いている。 */
type LiveChatMessage = {
  id?: string;
  snippet?: {
    displayMessage?: string;
    publishedAt?: string;
  };
  authorDetails?: {
    channelId?: string;
    displayName?: string;
    profileImageUrl?: string;
  };
};

type MessagesResponse = {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: LiveChatMessage[];
};

export type LiveChatReader = {
  /** 読むのをやめる。**必ず呼ぶ**（呼ばないとタブを閉じるまで叩き続ける） */
  stop: () => void;
};

export type LiveChatHooks = {
  /** 島の API に送る合言葉。`useAuth().token` をそのまま渡す */
  token: () => Promise<string | null>;
  /** 新しく来たぶん。古い順に並んでいる */
  onLines: (lines: ChatLine[]) => void;
  /** いま配信しているか。配信していなければ false */
  onLive: (live: boolean) => void;
  /**
   * この読み方が使えない、と分かったとき。
   *
   * 鍵がまだ入っていない（404）ときにも来る。**これは異常ではない。**
   * 呼んだ側は、今までどおり Functions ごしの読み方に落ちればよい。
   */
  onGiveUp: (why: "no-key" | "no-token") => void;
};

/** 同じコメントを2度流さないための控え。上限を超えたら古いものから捨てる。 */
const MAX_SEEN = 20_000;
/** 配信が見つからないときに、次に探すまで。配信は1日に何度も始まらない。 */
const LOOK_AGAIN_MS = 30_000;
/** YouTube が間隔を言ってこなかったときの既定。 */
const DEFAULT_POLL_MS = 5_000;
/**
 * これより速くは読まない。
 *
 * Doneru 側の枠を借りているので、**こちらの都合で速く叩かない。**
 * YouTube が「1秒で来い」と言ってきても、ルーレットの選択肢を選ぶのに
 * 1秒の鮮度は要らない。
 */
const MIN_POLL_MS = 3_000;

/** 期限のどれだけ手前で取り直すか。時計のずれと往復のぶん。 */
const TOKEN_LEEWAY_MS = 60_000;

class ApiError extends Error {
  constructor(readonly status: number, text: string) {
    super(`youtube ${status} ${text}`);
  }
}

/**
 * 配信のコメントを読み続ける。返ってきた `stop()` で止まる。
 */
export function readLiveChatDirect(hooks: LiveChatHooks): LiveChatReader {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Doneru のトークン。期限はミリ秒の epoch にそろえて返ってくる */
  let at = "";
  let expiresAt = 0;

  let liveChatId: string | null = null;
  let pageToken: string | undefined;
  /* 最初の1回は中身を捨てて栞だけ取る。あやとの決め（#164）で、流すのは
     「コントローラーを起動してから」のぶんだけ。配信の途中で開くと、
     さかのぼって数百件が一気に流れてしまう。 */
  let synced = false;
  let pollMs = DEFAULT_POLL_MS;
  const seen = new Set<string>();

  const later = (fn: () => void, ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  /** トークンを取り直す。`force` は 401 が出たとき（Doneru 側から取り直させる） */
  async function fetchToken(force: boolean) {
    const idToken = await hooks.token();
    if (!idToken) throw new Error("no-token");
    const t = await getRouletteYtToken(idToken, force);
    at = t.at;
    expiresAt = t.expiresAt;
  }

  async function ensureToken() {
    if (at && Date.now() + TOKEN_LEEWAY_MS < expiresAt) return;
    await fetchToken(false);
  }

  /**
   * Authorization を付けて叩く。401 のときだけ、取り直して1回やり直す。
   * 403 はやり直さない（割り当て切れ・権限違いなど、叩き直しても直らない）。
   */
  async function call<T>(url: URL): Promise<T> {
    const once = async () => {
      await ensureToken();
      return fetch(url.toString(), {
        headers: { Authorization: `Bearer ${at}` },
      });
    };
    let res = await once();
    if (res.status === 401) {
      at = "";
      expiresAt = 0;
      await fetchToken(true);
      res = await once();
    }
    if (!res.ok) {
      throw new ApiError(res.status, await res.text().catch(() => ""));
    }
    return (await res.json()) as T;
  }

  /** いま配信中のチャットの id。配信していなければ null。 */
  async function findLiveChatId(): Promise<string | null> {
    const b = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts");
    b.searchParams.set("broadcastStatus", "active");
    b.searchParams.set("broadcastType", "all");
    b.searchParams.set("part", "id,status");
    b.searchParams.set("maxResults", "50");
    const list = await call<{ items?: { id?: string }[] }>(b);
    const id = list.items?.[0]?.id;
    if (!id) return null;

    /* `liveBroadcasts` は `liveChatId` を持っていない版があるので、
       アラートボックスと同じく `videos.list` でもう一度引く。 */
    const v = new URL("https://www.googleapis.com/youtube/v3/videos");
    v.searchParams.set("id", id);
    v.searchParams.set("part", "liveStreamingDetails");
    const vid = await call<{
      items?: { liveStreamingDetails?: { activeLiveChatId?: string } }[];
    }>(v);
    return vid.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
  }

  async function tick() {
    if (stopped) return;
    try {
      if (!liveChatId) {
        liveChatId = await findLiveChatId();
        if (!liveChatId) {
          hooks.onLive(false);
          later(tick, LOOK_AGAIN_MS);
          return;
        }
      }

      const u = new URL(
        "https://www.googleapis.com/youtube/v3/liveChat/messages",
      );
      u.searchParams.set("liveChatId", liveChatId);
      u.searchParams.set("part", "snippet,authorDetails");
      u.searchParams.set("maxResults", "200");
      if (pageToken) u.searchParams.set("pageToken", pageToken);

      const data = await call<MessagesResponse>(u);
      hooks.onLive(true);

      /* **YouTube が言ってきた間隔に従う。** 決め打ちで速く叩かない。 */
      pollMs = Math.max(data.pollingIntervalMillis || DEFAULT_POLL_MS, MIN_POLL_MS);
      pageToken = data.nextPageToken;

      if (!synced) {
        synced = true;
      } else {
        const lines: ChatLine[] = [];
        for (const m of data.items ?? []) {
          const text = m.snippet?.displayMessage ?? "";
          const id = m.id ?? "";
          if (!text || !id || seen.has(id)) continue;
          if (seen.size >= MAX_SEEN) {
            const oldest = seen.values().next().value;
            if (oldest) seen.delete(oldest);
          }
          seen.add(id);
          lines.push({
            id,
            name: m.authorDetails?.displayName ?? "",
            text,
            icon: m.authorDetails?.profileImageUrl ?? "",
            channelId: m.authorDetails?.channelId ?? "",
            at: m.snippet?.publishedAt ?
              Date.parse(m.snippet.publishedAt) :
              0,
          });
        }
        if (lines.length) hooks.onLines(lines);
      }
      later(tick, pollMs);
    } catch (e) {
      if (stopped) return;
      const msg = String(e);
      /* 鍵がまだ入っていない・ログインが切れた。**叩き続けても直らない。**
         呼んだ側に、今までどおりの読み方へ落ちてもらう。
         ここは島の API から来た例外なので、YouTube のもの（ApiError）とは別。 */
      if (!(e instanceof ApiError)) {
        if (msg.includes("no-token")) {
          hooks.onGiveUp("no-token");
          return;
        }
        /* 島の API が 4xx を返した（鍵が無い・あやとではない）。
           **叩き直しても直らないので、ここで諦める。** 諦めないと、
           開いているあいだ数秒おきに Functions を呼び続けることになる。 */
        if (/^Error: 4\d\d /.test(msg)) {
          hooks.onGiveUp("no-key");
          return;
        }
      }
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
        /* 配信が終わった・チャットが閉じた。**探し直しからやる。**
           栞も控えも捨てる（次の配信のものが混ざる）。 */
        liveChatId = null;
        pageToken = undefined;
        synced = false;
        seen.clear();
        hooks.onLive(false);
        later(tick, LOOK_AGAIN_MS);
        return;
      }
      /* それ以外（電波が切れた等）は、少し待ってまた聞く。 */
      later(tick, Math.max(pollMs, DEFAULT_POLL_MS));
    }
  }

  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
