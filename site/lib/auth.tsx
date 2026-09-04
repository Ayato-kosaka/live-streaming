"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { API_BASE } from "@/lib/api";

/**
 * YouTube のアカウントで島にログインする。
 *
 * ふだんは名前もログインも要らないが、ログインしておくと
 *   - 出した企画が自分のものだと分かる
 *   - 端末を変えても同じ人として扱われる
 * ようになる。
 *
 * ログインには YouTube のチャンネル情報を読む許可をもらう。
 * これは Google の審査を通していない「機密スコープ」なので、
 * 同意画面の前に「このアプリは確認されていません」という警告が出る。
 * それを隠さず、押す前に説明する。
 */

/** 島でのその人。YouTube のチャンネルと結びついている。 */
export type IslandUser = {
  uid: string;
  name: string;
  photo?: string;
  /** YouTube のチャンネルID。配信のコメントと同じ人かを見るのに使う */
  channelId?: string;
};

type AuthState = {
  /** 読み込み中は null ではなく undefined */
  user: IslandUser | null | undefined;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 直前のログインで起きたこと。画面に出して伝える */
  error: string | null;
  busy: boolean;
  /** 島のAPIに送るための合言葉 */
  token: () => Promise<string | null>;
};

const Ctx = createContext<AuthState | null>(null);

/** YouTube のチャンネルを1つだけ読む許可。名前とアイコンを取るために使う。 */
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

async function fetchChannel(accessToken: string) {
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!r.ok) return null;
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) return null;
  return {
    channelId: c.id as string,
    title: c.snippet?.title as string | undefined,
    thumbnail: c.snippet?.thumbnails?.default?.url as string | undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [fbUser, setFbUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<IslandUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = () => {};
    // ログインがまだ有効になっていないと、状態が一度も返ってこないことがある。
    // 待ち続けると画面にログインの入口が出ないので、少し待って諦める。
    const giveUp = setTimeout(() => setFbUser((v) => (v === undefined ? null : v)), 2500);
    try {
      off = onAuthStateChanged(firebaseAuth(), (u) => {
        clearTimeout(giveUp);
        setFbUser(u);
      });
    } catch {
      clearTimeout(giveUp);
      setFbUser(null);
    }
    return () => {
      clearTimeout(giveUp);
      off();
    };
  }, []);

  useEffect(() => {
    if (!fbUser) {
      setProfile(fbUser === null ? null : null);
      return;
    }
    setProfile({
      uid: fbUser.uid,
      name: fbUser.displayName ?? "名無しさん",
      photo: fbUser.photoURL ?? undefined,
    });
  }, [fbUser]);

  const token = useCallback(async () => {
    try {
      return (await firebaseAuth().currentUser?.getIdToken()) ?? null;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(YOUTUBE_SCOPE);
      const res = await signInWithPopup(firebaseAuth(), provider);
      const cred = GoogleAuthProvider.credentialFromResult(res);
      const channel = cred?.accessToken ? await fetchChannel(cred.accessToken) : null;
      const idToken = await res.user.getIdToken();
      // サーバー側にも「この人が来た」と伝えておく
      await fetch(`${API_BASE}/me`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify(channel ?? {}),
      }).catch(() => null);
      if (channel) {
        setProfile((p) =>
          p ? { ...p, channelId: channel.channelId, name: channel.title ?? p.name } : p,
        );
      }
    } catch (e) {
      const code = String((e as { code?: string })?.code ?? e);
      if (code.includes("popup-closed") || code.includes("cancelled-popup")) {
        setError(null);
      } else if (code.includes("operation-not-allowed") || code.includes("configuration-not-found")) {
        setError("いまログインを準備している最中です。しばらくしてからまた試してみてください。");
      } else {
        setError("ログインできませんでした。もう一度ためしてみてください。");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fbSignOut(firebaseAuth());
    } catch {
      /* 元からログインしていなければ何もしない */
    }
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user: fbUser === undefined ? undefined : profile, signIn, signOut, error, busy, token }),
    [fbUser, profile, signIn, signOut, error, busy, token],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    // Provider の外で呼ばれたときも、ログインなしとして動く
    return {
      user: null,
      signIn: async () => {},
      signOut: async () => {},
      error: null,
      busy: false,
      token: async () => null,
    };
  }
  return v;
}
