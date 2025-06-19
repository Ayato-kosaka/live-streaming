import { ChatMessage, ChatPair } from "./types";
import { generateChatBotMessages } from "../../lib/claude";
import { sendLog } from "@/lib/log";
import { MutableRefObject } from "react";

// 簡単なボット返信生成関数
export const generateBotReply = async (userMessage: string): Promise<string> => {
  const res = await generateChatBotMessages(userMessage);
  return res.receiveMessages[0] ?? "";
};

export const createChatPair = async (
  userText: string,
  sessionId: MutableRefObject<number>,
  avatarUrl?: string,
  messageTimestamp?: number,
): Promise<ChatPair> => {
  const timestamp = messageTimestamp || Date.now();
  const userMessage: ChatMessage = {
    id: `user_${timestamp}`,
    text: userText,
    timestamp,
    type: 'user',
    avatarUrl,
  };

  let botText = null;
  try {
    botText = await generateBotReply(userText);
  } catch (err) {
    botText = "コメント、ありがとう！";
    sendLog("createChatPair", sessionId, "generateBotReplyError", {
      error: String(err),
    });
  }
  const botReply: ChatMessage = {
    id: `bot_${timestamp}`,
    text: await generateBotReply(userText),
    timestamp: timestamp + 1000, // 1秒後の返信
    type: 'bot',
  };

  return {
    id: `pair_${timestamp}`,
    userMessage,
    botReply,
    timestamp,
  };
};