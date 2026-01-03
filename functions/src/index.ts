/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {commentOnLive} from "./commentOnLive";
import {doneruAmount} from "./doneruAmount";
import {doneruToken} from "./doneruToken";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

export const commentIfLive = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "Asia/Tokyo",
  },
  async () => {
    logger.info("Running commentIfLive function");
    await commentOnLive();
  }
);

export {doneruAmount};
export {doneruToken};
