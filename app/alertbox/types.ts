
/**
 * スプレッドシートの Viewers 表の1行。
 *
 * **アラートボックスはもう読んでいない**（#284 で Firestore に移した）。
 * 残っているのは `app/ve-comment.tsx` だけ。表を畳むときに、あちらも
 * `AlertboxCharacter` に寄せる。
 */
export interface Viewer {
  Icon?: string;
  Emoji?: string;
  videoUrl?: string | null;
  name: string;
}

/** 置き場に入っている絵1枚。幅ごとに焼いてある。 */
export interface CharacterPicture {
  /** 縮める前のまま。アラートに出すのはこれ */
  full: string | null;
  /** 幅 → URL。鍵は "128" / "256" / "640" */
  sizes: Record<string, string>;
  w: number | null;
  h: number | null;
}

/**
 * `GET /island-api/alertbox/{k}/characters` が返す1人。
 *
 * 表の1行とは形が違う。**1人が名前を何個も持つ**（チャンネル名 +
 * 他の呼び名）ので、当てるときは名前ごとに開いて並べ直す。
 */
export interface AlertboxCharacter {
  id: string;
  emoji: string;
  /** YouTube のチャンネル名。スパチャはこれで当てる */
  channelName: string;
  /** 他の呼び名。Doneru はこちらでも当てる */
  aliases: string[];
  /** 背景なし。アラートに出すのはこちら */
  plain: CharacterPicture | null;
  /** 背景あり。いまアラートでは使っていない */
  scene: CharacterPicture | null;
  /** 投げ銭のときに流す動画。無ければ絵を出す */
  videoUrl?: string | null;
}

/** 名前1つぶん。**当てるのはこの並びに対して。**（`matching.utils.ts`） */
export interface AlertViewer {
  name: string;
  norm: string;
  normNoEmoji: string;
  emoji: string;
  /** 出す絵。無ければ通知タイプごとの既定の絵になる */
  iconUrl: string | null;
  videoUrl: string | null;
}

// {"amount":500,"assetID":null,"message":"こんにちは。これは通知テストです。","messageType":1,"nickname":"Doneru","test":true,"type":"donation"} 
// {"amount":500,"currency":"¥","jpy":500,"message":"こんにちは。これは通知テストです。","nickname":"Doneru","test":true,"type":"superchat"}
// {"nickname":"Doneru","test":true,"type":"youtubeSubscriber"}
// {"level":"test","nickname":"Doneru","test":true,"type":"membership"}

export interface DonationNotification {
  id: string;
  amount: number;
  assetID: string | null;
  message: string;
  messageType: number;
  nickname: string;
  test: boolean;
  type: 'donation';
}

export interface SuperChatNotification {
  id: string;
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

// GAS API Response types
export interface GASApiResponse<T> {
  ok: boolean;
  table: string;
  data: T;
}

// Goals table record (fetched from GAS)
export interface GoalRecord {
  id: string;
  startAmount: number;
  superChatAmount: number;
  doneruGoalKey: string;
  targetAmount: number;
  label: string;
}

// Goal state (UI - includes calculated currentAmount)
export interface GoalState extends GoalRecord {
  currentAmount: number;
}

// SuperChats table record (for POST to GAS)
export interface SuperChatRecord {
  id: string;
  amount?: number;
  currency?: string;
  jpy?: number;
  message?: string;
  nickname?: string;
  test?: boolean;
  type?: 'superchat';
}
