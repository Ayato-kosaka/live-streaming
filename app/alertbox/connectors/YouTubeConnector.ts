// YouTube Live Chat Connector（リファクタ版 / 日本語コメント付き）

import { IConnector } from "./types";
import { NotificationData, SuperChatNotification } from "../types";
import { sendLog } from "@/lib/log";
import { getDoneruToken } from "../api.utils";

interface VideoListResponse {
  items: {
    liveStreamingDetails: {
      activeLiveChatId?: string;
    };
  }[];
}

interface LiveChatMessage {
  id: string;
  snippet: {
    type: string;
    liveChatId: string;
    authorChannelId: string;
    publishedAt: string;
    hasDisplayContent: boolean;
    displayMessage: string;
    superChatDetails?: {
      amountMicros: string;
      currency: string;
      amountDisplayString: string;
      userComment: string;
    };
  };
  authorDetails: {
    channelId: string;
    channelUrl: string;
    displayName: string;
    profileImageUrl: string;
    isVerified: boolean;
    isChatOwner: boolean;
    isChatSponsor: boolean;
    isChatModerator: boolean;
  };
}

interface LiveChatMessagesListResponse {
  nextPageToken?: string;
  pollingIntervalMillis: number;
  items: LiveChatMessage[];
}

/**
 * YouTube Live Chat connector
 * - active な liveBroadcast から liveChatId を取得
 * - liveChat/messages をポーリングして SuperChat を拾う
 * - access_token の期限切れ/認可エラー時に取り直す
 */
export class YouTubeConnector implements IConnector {
  private channelId?: string;
  private access_token?: string;
  private expiry?: number; // epoch millis を想定（getDoneruToken が秒なら変換が必要）

  // ポーリング関連の状態
  private nextPageToken?: string;
  private liveChatId: string | null = null;

  // 停止制御
  private stopped = false;
  private pollingTimeout: NodeJS.Timeout | null = null;

  // APIが返す推奨間隔。取得できない場合のデフォルト
  private pollingIntervalMs = 5000;

  constructor() { }

  start(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ): () => void {
    this.stopped = false;

    // ポーリング開始
    this.log("Starting YouTube connector");
    this.pollLoop(onEvent, onError);

    // 停止用 cleanup
    return () => {
      this.stopped = true;
      if (this.pollingTimeout) {
        clearTimeout(this.pollingTimeout);
        this.pollingTimeout = null;
      }
      this.log("Stopped");
    };
  }

  /**
   * メインのポーリングループ
   */
  private async pollLoop(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ) {
    if (this.stopped) return;

    try {
      // 1) トークンが無い/期限切れなら更新
      await this.ensureValidToken();

      // 2) liveChatId が未取得なら取得（active broadcast が出るまで待つ）
      if (!this.liveChatId) {
        this.liveChatId = await this.fetchLiveChatId(onError);
        if (!this.liveChatId) {
          // broadcast が無い場合は少し待って再試行
          this.scheduleNext(() => this.pollLoop(onEvent, onError), 30000);
          return;
        }
      }

      // 3) メッセージ取得
      const data = await this.fetchLiveChatMessages(this.liveChatId);

      // 4) API推奨のポーリング間隔を更新
      this.pollingIntervalMs = data.pollingIntervalMillis ?? this.pollingIntervalMs;

      // 5) 次回用 pageToken を更新（重複防止）
      this.nextPageToken = data.nextPageToken;

      // 6) SuperChat のみ抽出して通知
      this.emitSuperChats(data.items, onEvent);

      // 7) 次回ポーリング
      this.scheduleNext(() => this.pollLoop(onEvent, onError), this.pollingIntervalMs);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed to poll messages");
      this.log("Error polling messages:", err);

      // 認可系エラーならトークンを捨てて次回取り直す
      if (this.isAuthError(err)) {
        this.invalidateToken();
      }

      onError(err);

      // 失敗しても一定時間後に再試行（API推奨間隔ベース）
      this.scheduleNext(() => this.pollLoop(onEvent, onError), this.pollingIntervalMs);
    }
  }

  /**
   * Doneru のキーを環境変数から取り出す
   */
  private getDoneruKey(): string {
    const key = process.env.EXPO_PUBLIC_DONERU_WSS_URL?.split("key=")[1];
    if (!key) {
      throw new Error("Doneru key is not set in environment variables");
    }
    return key;
  }

  /**
   * access_token が有効かどうか（期限）を確認
   * - expiry の単位が「秒」か「ミリ秒」かは getDoneruToken 実装に依存します
   * - ここでは「ミリ秒 epoch」を想定
   */
  private isTokenValid(): boolean {
    if (!this.access_token || !this.expiry) return false;

    // 余裕を持って少し早めに更新（例：60秒前）
    const refreshLeewayMs = 60_000;
    return Date.now() + refreshLeewayMs < this.expiry;
  }

  /**
   * トークンを無効化（次回必ず取り直す）
   */
  private invalidateToken() {
    this.access_token = undefined;
    this.expiry = undefined;
  }

  /**
   * トークンが無い/期限切れなら再取得する
   */
  private async ensureValidToken() {
    if (this.isTokenValid()) return;

    const key = this.getDoneruKey();
    const { youtube } = await getDoneruToken(key);

    const { at, channel, exp } = youtube;

    // exp が「秒」ならここで *1000 が必要
    this.channelId = channel;
    this.access_token = at;
    this.expiry = exp;

    this.log("Refreshed access_token");
  }

  /**
   * active な liveBroadcast から liveChatId を取得する
   * - 見つかるまで数秒おきに再試行する
   */
  private async fetchLiveChatId(onError: (error: Error) => void): Promise<string | null> {
    try {
      type LiveBroadcastResponse = { items: { id: string }[] };

      const broadcastUrl = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts");
      broadcastUrl.searchParams.set("broadcastStatus", "active");
      broadcastUrl.searchParams.set("broadcastType", "all");
      broadcastUrl.searchParams.set("part", "id,status");
      broadcastUrl.searchParams.set("maxResults", "50");
      broadcastUrl.searchParams.set("access_token", this.access_token!);

      while (!this.stopped) {
        // 念のため、ループ中にも期限チェックして更新
        await this.ensureValidToken();
        broadcastUrl.searchParams.set("access_token", this.access_token!);

        const broadcastResponse = await fetch(broadcastUrl.toString());
        if (!broadcastResponse.ok) {
          // 認可系なら上位でリトライするため throw
          throw new Error(
            `Failed to fetch live broadcasts: ${broadcastResponse.status} ${broadcastResponse.statusText}`
          );
        }

        const broadcastData: LiveBroadcastResponse = await broadcastResponse.json();

        if (broadcastData.items?.length > 0) {
          const broadcastId = broadcastData.items[0].id;

          // videos.list で liveChatId を取得
          const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
          videoUrl.searchParams.set("id", broadcastId);
          videoUrl.searchParams.set("part", "liveStreamingDetails");
          videoUrl.searchParams.set("access_token", this.access_token!);

          const videoResponse = await fetch(videoUrl.toString());
          if (!videoResponse.ok) {
            throw new Error(
              `Failed to fetch video details: ${videoResponse.status} ${videoResponse.statusText}`
            );
          }

          const videoData: VideoListResponse = await videoResponse.json();
          const id = videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId;

          if (id) {
            this.log("Fetched liveChatId:", id);
            return id;
          }
        }

        this.log("No active broadcast found, retrying in 5 seconds...");
        await this.sleep(5000);
      }

      return null;
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed to fetch liveChatId");
      this.log("Error fetching liveChatId:", err);

      // 認可系エラーならトークンを捨てて次回取り直す
      if (this.isAuthError(err)) {
        this.invalidateToken();
      }

      onError(err);
      return null;
    }
  }

  /**
   * liveChat/messages を取得する
   */
  private async fetchLiveChatMessages(liveChatId: string): Promise<LiveChatMessagesListResponse> {
    const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("part", "snippet,authorDetails");
    url.searchParams.set("access_token", this.access_token!);

    if (this.nextPageToken) {
      url.searchParams.set("pageToken", this.nextPageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      // broadcast 終了などで liveChatId が無効になった場合はリセットして復旧
      if (response.status === 404 || response.status === 403) {
        this.log("Live chat ended or invalid, resetting");
        this.liveChatId = null;
        this.nextPageToken = undefined;

        // 403 が認可由来の可能性もあるので token も疑う
        if (response.status === 403) {
          this.invalidateToken();
        }

        // 呼び出し元で再試行させたいので throw
        throw new Error(`Live chat ended or invalid: ${response.status} ${response.statusText}`);
      }

      // その他は通常エラー
      throw new Error(
        `Failed to fetch live chat messages: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as LiveChatMessagesListResponse;
  }

  /**
   * SuperChat イベントを抽出して onEvent に流す
   */
  private emitSuperChats(
    items: LiveChatMessage[] | undefined,
    onEvent: (notification: NotificationData) => void
  ) {
    if (!items?.length) return;

    for (const message of items) {
      if (message.snippet.type !== "superChatEvent") continue;
      if (!message.snippet.superChatDetails) continue;

      const details = message.snippet.superChatDetails;

      // amountMicros は 1e6 分の1単位
      const amountMicros = parseInt(details.amountMicros, 10);
      const amount = Number.isFinite(amountMicros) ? amountMicros / 1_000_000 : 0;

      // NOTE: ここでは通貨換算を行わず、そのまま amount を入れる
      const jpy = amount;

      const notification: SuperChatNotification = {
        id: message.id,
        type: "superchat",
        nickname: message.authorDetails.displayName,
        amount,
        currency: details.currency,
        jpy,
        message: details.userComment || "",
        test: false,
      };

      this.log("Super Chat received:", notification);
      onEvent(notification);

      // ログ送信
      sendLog("YouTubeConnector", null, "superchat_received", message);
    }
  }

  /**
   * 認可系のエラーかどうか（簡易判定）
   * - fetch のステータスを直接持ってないので、メッセージ文字列で判定している
   * - より堅牢にするなら fetch の段階で status を含めた独自 Error を投げるのがおすすめ
   */
  private isAuthError(err: Error): boolean {
    const msg = err.message ?? "";
    return msg.includes(" 401 ") || msg.includes(" 403 ");
  }

  /**
   * 次回実行をスケジュール
   */
  private scheduleNext(fn: () => void, ms: number) {
    if (this.stopped) return;
    if (this.pollingTimeout) clearTimeout(this.pollingTimeout);
    this.pollingTimeout = setTimeout(fn, ms);
  }

  /**
   * sleep ユーティリティ
   */
  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * ログ出力（prefix 統一）
   */
  private log(...args: unknown[]) {
    console.log("[YouTubeConnector]", ...args);
  }
}
