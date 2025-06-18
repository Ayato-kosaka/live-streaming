export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  type: 'user' | 'bot';
}

export interface ChatPair {
  id: string;
  userMessage: ChatMessage;
  botReply: ChatMessage;
  timestamp: number;
}

export interface ChatDisplayProps {
  displayDuration?: number; // 表示時間（秒）
}