"use client";

import type { User } from "firebase/auth";
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
 *
 * ## firebase/auth は押されてから読む
 *
 * この島は名前もログインも要らずに遊べる。ほとんどの人はログインを押さない。
 * それなのに firebase/auth（85KB・縮めて 23KB）が全ページに乗っていて、実測で
 * 20% しか走っていなかった。
 *
 * かわりに「この端末は一度ログインした」という印だけを localStorage に置く。
 *   - 印が無い人 … 何も取りにいかない。ログインしていない人として即座に始まる
 *   - 印がある人 … その場で読み込んで、前のログインを引き継ぐ
 *   - 押した人   … そこで読み込む
 *
 * 印だけ消えて Firebase 側のログインが残っている端末では、いったんログアウトに
 * 見える。押せば同じアカウントで戻るので、入れなくなることはない。
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

/** この端末は一度ログインしたか。firebase/auth を読むかどうかの唯一の手がかり。 */
const SIGNED_IN = "ayato-island-signedin";

function everSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN) === "1";
  } catch {
    return false;
  }
}

function rememberSignedIn(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN, "1");
    else localStorage.removeItem(SIGNED_IN);
  } catch {
    /* localStorage が使えない端末では、毎回押してもらうことになる */
  }
}

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
    // 一度も押していない端末では、ここで何も取りにいかない。
    if (!everSignedIn()) {
      setFbUser(null);
      return;
    }
    let off = () => {};
    let gone = false;
    // ログインがまだ有効になっていないと、状態が一度も返ってこないことがある。
    // 待ち続けると画面にログインの入口が出ないので、少し待って諦める。
    const giveUp = setTimeout(() => setFbUser((v) => (v === undefined ? null : v)), 2500);
    (async () => {
      try {
        const [auth, { onAuthStateChanged }] = await Promise.all([
          firebaseAuth(),
          import("firebase/auth"),
        ]);
        if (gone) return;
        off = onAuthStateChanged(auth, (u) => {
          clearTimeout(giveUp);
          setFbUser(u);
        });
      } catch {
        clearTimeout(giveUp);
        setFbUser(null);
      }
    })();
    return () => {
      gone = true;
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
    // 押していない端末のために、ここで firebase/auth を読み込みはしない。
    if (!everSignedIn()) return null;
    try {
      return (await (await firebaseAuth()).currentUser?.getIdToken()) ?? null;
    } catch {
      return null;
    }
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [auth, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([
        firebaseAuth(),
        import("firebase/auth"),
      ]);
      const provider = new GoogleAuthProvider();
      provider.addScope(YOUTUBE_SCOPE);
      const res = await signInWithPopup(auth, provider);
      // ここまで来たら次からは黙って引き継ぐ
      rememberSignedIn(true);
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
    rememberSignedIn(false);
    try {
      const [auth, { signOut: fbSignOut }] = await Promise.all([
        firebaseAuth(),
        import("firebase/auth"),
      ]);
      await fbSignOut(auth);
    } catch {
      /* 元からログインしていなければ何もしない */
    }
    setProfile(null);
    setFbUser(null);
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
