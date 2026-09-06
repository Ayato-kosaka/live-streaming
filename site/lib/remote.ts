/**
 * 島の遠隔操作（#165）。コントローラーと表示側で分け合うところ。
 *
 * 配信中、あやとが手元で押したものが、スマホ版 OBS に映っている島に届く。
 * 繋いでいるのは Firestore（`islandRemote/{sessionId}`）だが、ブラウザから
 * 直接は触らない。読み書きはどちらも Functions（`/island-api/remote`）を通す。
 *
 * **`lib/api.ts` に足さずに別にしてある。** 表示側（`components/live/IslandRemote.tsx`）は
 * 器（`app/layout.tsx`）に載って**全部の面に降りる**ので、ここが太ると
 * 遠隔操作を使わない人の1回目の読み込みまで太る。ここには型と、
 * 押しどころの表と、口を叩く3本しか置かない。
 */

import { API_BASE } from "@/lib/api";

/** URL に付ける合言葉。`https://…/?remote=<sessionId>` で表示側が起きる。 */
export const REMOTE_PARAM = "remote";

/** 島の寄り引き。表示側の `IslandStage` が持っている2つの状態そのまま。 */
export type RemoteView = "wide" | "near";

/** いま表示側に届いているもの。 */
export type RemoteState = {
  sessionId: string;
  /** 行き先。押されていなければ null */
  at: string | null;
  view: RemoteView | null;
  /** `top` / `down` / `far` / `bottom` / `#<id>` / 割合（"0.42"） */
  scrollTo: string | null;
  /** 表示側に出す一言 */
  say: string;
  /** その一言を出すかどうか。コントローラーから切れる */
  showSay: boolean;
  /** 押した順の通し番号。**同じボタンを2回押しても効く**のはこれのおかげ */
  seq: number;
  updatedAt: number;
  /** 表示側が次に聞きにくるまで（ミリ秒）。サーバーが決める */
  pollMs: number;
};

/** コントローラーが1回に送るもの。空の欄は「今回は触らない」。 */
export type RemotePush = {
  sessionId: string;
  at?: string;
  view?: RemoteView;
  scrollTo?: string;
  say?: string;
  showSay?: boolean;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * セッションを出す。**あやとだけ。**
 *
 * id は作り直さない。毎回変わると、配信のたびに OBS の URL を貼り替える
 * ことになって、この道具が無くしたかった手間がそのまま戻る。
 */
export const openRemote = (token: string, fresh = false) =>
  call<{ session: RemoteState }>("/remote/session", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ fresh }),
  });

/** 押す。`seq` はサーバーが +1 する（ブラウザに数えさせない）。 */
export const pushRemote = (p: RemotePush, token: string) =>
  call<{ session: RemoteState }>("/remote", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(p),
  });

/** 表示側が読むところ。**ログインが要らない唯一の口。** */
export const readRemote = (sessionId: string) =>
  call<{ session: RemoteState; open: boolean }>(
    `/remote?sessionId=${encodeURIComponent(sessionId)}`,
  );

/* ---------------- 押しどころの表 ----------------
   **コントローラーと表示側で同じものを見る。** サーバー（`functions/src/remote.ts`
   の `PLACES`）にも同じ並びがあるので、ここを増やしたらあちらも足す。
   片方だけ足すと、押しても 400 が返るボタンができる。 */

/** ボタン1つ。`at` が行き先、`say` が表示側の左下に出る一言。 */
export type RemoteButton = { at: string; label: string };

/** 看板を出す6つ（`docs/island-design.md` 6章の表）。 */
export const REMOTE_DOORS: RemoteButton[] = [
  { at: "/about", label: "あやとのこと" },
  { at: "/streams", label: "配信" },
  { at: "/apps", label: "アプリ" },
  { at: "/next", label: "これから" },
  { at: "/board", label: "企画をだす" },
  { at: "/map", label: "歩いた国" },
];

/** 面。**入口の6つと重なるものがある**（これから・掲示板）が、それでよい。
    配信中に探すのは「入口の並びの4番目」ではなく「これから」なので、
    どちらの並びからも押せるほうが速い。 */
export const REMOTE_PAGES: RemoteButton[] = [
  { at: "/next", label: "これから" },
  { at: "/now", label: "いまどこ" },
  { at: "/board", label: "掲示板" },
];

/** スクロールのつまみ。**割合ではなく相対で送る。**
    コントローラーは表示側がいまどこを見ているかを知らないので、
    「少し下へ」は割合では書けない。 */
export const REMOTE_SCROLLS: { to: string; label: string }[] = [
  { to: "down", label: "少し下へ" },
  { to: "far", label: "だいぶ下へ" },
  { to: "top", label: "いちばん上へ" },
];

/* ---------------- 表示側の、寄り引き ----------------
   島（`IslandStage`）は自分の中に「引き（島ぜんぶ）」を持っている。
   遠隔から触るために props を1つ増やすと、島を置いている全部の面が
   それを渡すことになるので、**窓ごしの合図**で渡す。

   面をまたいだときのために、最後に言われた値をここに残しておく。
   `/board` で「ひき」を押してから「島」を押すと、島は新しく生まれる。
   そのとき合図はもう飛んだあとなので、生まれた側がここを見る。 */

export const REMOTE_VIEW_EVENT = "island:remote-view";

let wanted: RemoteView | null = null;

/** 寄り引きを言う。島が建っていれば、その場で効く。 */
export function sayRemoteView(v: RemoteView) {
  wanted = v;
  window.dispatchEvent(new CustomEvent(REMOTE_VIEW_EVENT, { detail: v }));
}

/** 最後に言われた寄り引き。島が生まれたときに1回見る。 */
export const remoteView = () => wanted;
