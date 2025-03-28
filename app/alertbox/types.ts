
export interface Viewer {
  icon?: string;
  emoji?: string;
  name: string;
}

// {"amount":500,"assetID":null,"message":"こんにちは。これは通知テストです。","messageType":1,"nickname":"Doneru","test":true,"type":"donation"} 
// {"amount":500,"currency":"¥","jpy":500,"message":"こんにちは。これは通知テストです。","nickname":"Doneru","test":true,"type":"superchat"}
// {"nickname":"Doneru","test":true,"type":"youtubeSubscriber"}
// {"level":"test","nickname":"Doneru","test":true,"type":"membership"}

export interface DonationNotification {
  amount: number;
  assetID: string | null;
  message: string;
  messageType: number;
  nickname: string;
  test: boolean;
  type: 'donation';
}

export interface SuperChatNotification {
  amount: number;
  currency: string;
  jpy: number;
  message: string;
  nickname: string;
  test: boolean;
  type: 'superchat';
}

export interface YouTubeSubscriberNotification {
  nickname: string;
  test: boolean;
  type: 'youtubeSubscriber';
}

export interface MembershipNotification {
  level: string;
  nickname: string;
  test: boolean;
  type: 'membership';
}

export type NotificationData =
  | DonationNotification
  | SuperChatNotification
  | YouTubeSubscriberNotification
  | MembershipNotification;

