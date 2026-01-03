// YouTube Live Chat Connector

import { IConnector } from "./types";
import { NotificationData, SuperChatNotification } from "../types";
import { sendLog } from "@/lib/log";

interface YouTubeSearchListResponse {
  items: {
    id: {
      videoId: string;
    };
  }[];
}

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
  kind: string;
  etag: string;
  nextPageToken?: string;
  pollingIntervalMillis: number;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: LiveChatMessage[];
}

/**
 * YouTube Live Chat connector using liveChatMessages.list polling
 * - Fetches liveChatId from active broadcast
 * - Polls liveChatMessages.list for Super Chat events
 * - Respects pollingIntervalMillis from API
 * - Tracks nextPageToken to avoid duplicates
 */
export class YouTubeConnector implements IConnector {
  private channelId?: string;
  private apiKey: string;

  constructor(apiKey: string, channelId?: string) {
    this.apiKey = apiKey;
    this.channelId = channelId;
  }

  start(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ): () => void {
    let stopped = false;
    let pollingTimeout: NodeJS.Timeout | null = null;
    let nextPageToken: string | undefined = undefined;
    let liveChatId: string | null = null;
    let pollingIntervalMs = 5000; // Default 5 seconds

    /**
     * YouTube API の search.list と videos.list を使って liveChatId を取得
     */
    const fetchLiveChatId = async (): Promise<string | null> => {
      try {
        // ライブ配信中の videoId 取得
        const url = new URL(
          "https://www.googleapis.com/youtube/v3/search"
        );
        url.searchParams.set("part", "id");
        url.searchParams.set("eventType", "live");
        url.searchParams.set("type", "video");
        url.searchParams.set("key", this.apiKey);

        if (this.channelId) {
          url.searchParams.set("channelId", this.channelId);
        } else {
          throw new Error("channelId is required to fetch YouTube search");
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(
            `Failed to fetch live videoId: ${response.status} ${response.statusText}`
          );
        }

        const data: YouTubeSearchListResponse = await response.json();

        if (!data.items || data.items.length === 0) {
          console.log("[YouTubeConnector] No live active broadcasts found");
          return null;
        }

        const videoId = data.items[0].id.videoId;
        console.log("[YouTubeConnector] Found live videoId:", videoId);

        // videoId から liveChatId を取得
        const videoUrl = new URL(
          "https://www.googleapis.com/youtube/v3/videos"
        );
        videoUrl.searchParams.set("part", "liveStreamingDetails");
        videoUrl.searchParams.set("id", videoId);
        videoUrl.searchParams.set("key", this.apiKey);

        const videoResponse = await fetch(videoUrl.toString());
        if (!videoResponse.ok) {
          throw new Error(
            `Failed to fetch liveStreamingDetails: ${videoResponse.status} ${videoResponse.statusText}`
          );
        }

        const videoData: VideoListResponse = await videoResponse.json();

        const liveStreamingDetails =
          videoData.items[0]?.liveStreamingDetails;
        const chatId = liveStreamingDetails?.activeLiveChatId;

        if (chatId) {
          console.log("[YouTubeConnector] Fetched liveChatId:", chatId);
          return chatId;
        }

        console.log("[YouTubeConnector] No active chatId found");
        return null;
      } catch (error) {
        console.error("[YouTubeConnector] Error fetching liveChatId:", error);
        onError(
          error instanceof Error
            ? error
            : new Error("Failed to fetch liveChatId")
        );
        return null;
      }
    };

    /**
     * Poll liveChatMessages.list for Super Chat events
     */
    const pollMessages = async () => {
      if (stopped) return;

      if (!liveChatId) {
        // Try to fetch liveChatId first
        liveChatId = await fetchLiveChatId();
        if (!liveChatId) {
          // Retry after 30 seconds if no active broadcast
          pollingTimeout = setTimeout(pollMessages, 30000);
          return;
        }
      }

      try {
        const url = new URL(
          "https://www.googleapis.com/youtube/v3/liveChat/messages"
        );
        url.searchParams.set("liveChatId", liveChatId);
        url.searchParams.set("part", "snippet,authorDetails");
        url.searchParams.set("key", this.apiKey);

        if (nextPageToken) {
          url.searchParams.set("pageToken", nextPageToken);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          // If liveChatId is invalid (broadcast ended), reset and retry
          if (response.status === 404 || response.status === 403) {
            console.log(
              "[YouTubeConnector] Live chat ended or invalid, resetting"
            );
            liveChatId = null;
            nextPageToken = undefined;
            pollingTimeout = setTimeout(pollMessages, 30000);
            return;
          }

          throw new Error(
            `Failed to fetch live chat messages: ${response.status} ${response.statusText}`
          );
        }

        const data: LiveChatMessagesListResponse = await response.json();

        // Update polling interval from API response
        pollingIntervalMs = data.pollingIntervalMillis;

        // Update nextPageToken for next request
        nextPageToken = data.nextPageToken;

        // Process Super Chat messages
        if (data.items && data.items.length > 0) {
          for (const message of data.items) {
            if (
              message.snippet.type === "superChatEvent" &&
              message.snippet.superChatDetails
            ) {
              const details = message.snippet.superChatDetails;

              // Convert amountMicros to regular amount
              const amountMicros = parseInt(details.amountMicros, 10);
              const amount = amountMicros / 1000000;

              // Note: Currency conversion to JPY is not implemented
              // The API returns the display amount in the original currency
              // For accurate JPY conversion, integrate with a currency exchange API
              const jpy = amount;

              const notification: SuperChatNotification = {
                id: message.id,
                type: "superchat",
                nickname: message.authorDetails.displayName,
                amount: amount,
                currency: details.currency,
                jpy: jpy,
                message: details.userComment || "",
                test: false,
              };

              console.log(
                "[YouTubeConnector] Super Chat received:",
                notification
              );
              onEvent(notification);
              sendLog("YouTubeConnector", null, "superchat_received", message);
            }
          }
        }

        // Schedule next poll
        if (!stopped) {
          pollingTimeout = setTimeout(pollMessages, pollingIntervalMs);
        }
      } catch (error) {
        console.error("[YouTubeConnector] Error polling messages:", error);
        onError(
          error instanceof Error ? error : new Error("Failed to poll messages")
        );

        // Retry after polling interval
        if (!stopped) {
          pollingTimeout = setTimeout(pollMessages, pollingIntervalMs);
        }
      }
    };

    // Start polling
    console.log("[YouTubeConnector] Starting YouTube connector");
    pollMessages();

    // Return cleanup function
    return () => {
      stopped = true;
      if (pollingTimeout) {
        clearTimeout(pollingTimeout);
        pollingTimeout = null;
      }
      console.log("[YouTubeConnector] Stopped");
    };
  }
}
