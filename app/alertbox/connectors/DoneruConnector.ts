// Doneru WebSocket Connector

import { IConnector } from "./types";
import { NotificationData } from "../types";

/**
 * Doneru WebSocket connector
 * - Connects to Doneru WSS endpoint
 * - Handles reconnection and keep-alive pings
 * - Only forwards "donation" type notifications
 * - Ignores "superchat" from Doneru (responsibility separation)
 */
export class DoneruConnector implements IConnector {
  private wssUrl: string;

  constructor(wssUrl: string) {
    this.wssUrl = wssUrl;
  }

  start(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ): () => void {
    let socket: WebSocket;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let keepAliveInterval: NodeJS.Timeout | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      socket = new WebSocket(this.wssUrl);

      socket.onopen = () => {
        console.log("[DoneruConnector] WebSocket connected");

        // Keep-alive ping every 30 seconds
        keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      };

      socket.onmessage = (event) => {
        try {
          const data: NotificationData = JSON.parse(event.data);

          // Only accept "donation" type from Doneru
          if (data.type === "donation") {
            onEvent(data);
          } else if (data.type === "superchat") {
            // Ignore superchat from Doneru (responsibility separation)
            console.log(
              "[DoneruConnector] Ignoring superchat from Doneru:",
              data
            );
          } else {
            console.warn(
              "[DoneruConnector] Unknown notification type:",
              data.type
            );
          }
        } catch (error) {
          onError(
            error instanceof Error
              ? error
              : new Error("Failed to parse WebSocket message")
          );
        }
      };

      socket.onerror = (event) => {
        console.error("[DoneruConnector] WebSocket error:", event);
        onError(new Error("WebSocket error"));
      };

      socket.onclose = () => {
        console.log("[DoneruConnector] WebSocket closed");

        // Clear keep-alive interval
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }

        // Reconnect after 1 second if not stopped
        if (!stopped) {
          reconnectTimeout = setTimeout(connect, 1000);
        }
      };
    };

    // Start connection
    connect();

    // Return cleanup function
    return () => {
      stopped = true;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }

      if (socket) {
        socket.close();
      }
    };
  }
}
