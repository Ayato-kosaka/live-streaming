import { ChatMessage, ChatPair } from './types';

// 簡単なボット返信生成関数
export const generateBotReply = (userMessage: string): string => {
  const replies = [
    'それは興味深いですね！',
    'なるほど、よく分かります。',
    'そうですね、私もそう思います。',
    'もう少し詳しく教えてください。',
    'とても良い質問ですね。',
    'その通りです！',
    '面白い視点ですね。',
    '確かにそうですね。',
    'それについてもっと知りたいです。',
    '素晴らしい考えです！',
  ];

  // メッセージの長さや内容に基づいて返信を選択
  if (userMessage.includes('？') || userMessage.includes('?')) {
    return 'それは良い質問ですね。考えてみましょう。';
  }
  
  if (userMessage.length > 20) {
    return '詳しく説明していただき、ありがとうございます。';
  }

  return replies[Math.floor(Math.random() * replies.length)];
};

export const createChatPair = (
  userText: string,
  avatarUrl?: string,
  messageTimestamp?: number
): ChatPair => {
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
    text: generateBotReply(userText),
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