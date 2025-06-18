import { ChatMessage, ChatPair } from "./types";
import { generateChatBotMessages } from "../../lib/claude";

// 簡単なボット返信生成関数
export const generateBotReply = async (userMessage: string): Promise<string> => {
  try {
    const res = await generateChatBotMessages(userMessage);
    return res.recieveMessages[0] ?? "";
  } catch (e) {
    console.error("generateBotReply error", e);
    return "申し訳ありません、エラーが発生しました。";
  }
};

export const createChatPair = async (
  userText: string,
  avatarUrl?: string,
  messageTimestamp?: number
): Promise<ChatPair> => {
  const timestamp = messageTimestamp || Date.now();
  const userMessage: ChatMessage = {
    id: `user_${timestamp}`,
    text: userText,
    timestamp,
    type: 'user',
    avatarUrl,
  };

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