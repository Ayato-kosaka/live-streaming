import { ChatMessage, ChatPair } from "./types";
import { MutableRefObject } from "react";

/**
 * ボットの返し。**Claude を呼ぶのをやめた（#217）。**
 *
 * あやとの言葉（2026-09-09）「クロード呼び出し系は全部消して良いです。
 * 使ってない」。`lib/claude.ts` ごと落とした。
 *
 * 消した理由は使っていないことだけではない。あれは `x-api-key` に
 * `process.env.EXPO_PUBLIC_CLAUDE_API_KEY` を渡していて、`EXPO_PUBLIC_` は
 * 「隠す」ではなく「公開してよい」の宣言なので、**Anthropic の鍵が本番の
 * JS にそのまま焼かれていた。** 読まれるだけでなく、そのまま課金される鍵。
 *
 * **参照を1つでも残すと、また焼かれる。** ワークフローの `.env` から消す
 * だけでは足りないことは実測してある（目印を入れて焼き直したら出てきた）。
 * だから呼ぶところごと無くす。
 */
const BOT_REPLY = "コメント、ありがとう！";

export const createChatPair = async (
  userText: string,
  _sessionId: MutableRefObject<number>,
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

  const botReply: ChatMessage = {
    id: `bot_${timestamp}`,
    text: BOT_REPLY,
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