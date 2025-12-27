// Connector interface for notification sources

import { NotificationData } from "../types";

/**
 * Common interface for notification connectors
 */
export interface IConnector {
  /**
   * Start the connector and begin receiving notifications
   * @param onEvent - Callback when a notification is received
   * @param onError - Callback when an error occurs
   * @returns Cleanup function to stop the connector
   */
  start(
    onEvent: (notification: NotificationData) => void,
    onError: (error: Error) => void
  ): () => void;
}
