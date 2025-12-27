// YouTube Live Chat Connector

import { IConnector } from "./types";
import { SuperChatNotification } from "../types";

/**
 * YouTube API response types
 */
interface LiveBroadcast {
  id: string;
  snippet: {
    liveChatId: string;
  };
}

interface LiveBroadcastsListResponse {
  items: LiveBroadcast[];
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
  private apiKey: string;
  private channelId?: string;

  constructor(apiKey: string, channelId?: string) {
    this.apiKey = apiKey;
    this.channelId = channelId;
  }

  start(
    onEvent: (notification: SuperChatNotification) => void,
    onError: (error: Error) => void
  ): () => void {
    let stopped = false;
    let pollingTimeout: NodeJS.Timeout | null = null;
    let nextPageToken: string | undefined = undefined;
    let liveChatId: string | null = null;
    let pollingIntervalMs = 5000; // Default 5 seconds

    /**
     * Fetch the liveChatId from active broadcast
     */
    const fetchLiveChatId = async (): Promise<string | null> => {
      try {
        const url = new URL(
          "https://www.googleapis.com/youtube/v3/liveBroadcasts"
        );
        url.searchParams.set("part", "snippet");
        url.searchParams.set("broadcastStatus", "active");
        url.searchParams.set("key", this.apiKey);

        if (this.channelId) {
          url.searchParams.set("channelId", this.channelId);
        } else {
          url.searchParams.set("mine", "true");
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(
            `Failed to fetch live broadcasts: ${response.status} ${response.statusText}`
          );
        }

        const data: LiveBroadcastsListResponse = await response.json();

        if (data.items && data.items.length > 0) {
          const chatId = data.items[0].snippet.liveChatId;
          console.log("[YouTubeConnector] Found liveChatId:", chatId);
          return chatId;
        }

        console.log("[YouTubeConnector] No active broadcasts found");
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

              // Convert to JPY if not already (simple conversion, might need improvement)
              // For now, we'll use the amount as-is since the API returns the display amount
              const jpy = amount; // TODO: Add proper currency conversion if needed

              const notification: SuperChatNotification = {
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
