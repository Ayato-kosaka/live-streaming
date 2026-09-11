"use client";

import type { User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { API_BASE, loadMe, type Me } from "@/lib/api";

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
  /** 毎晩 islandChannels から入れ直る顔。**看板に出すのはこれ。**
      ログインのとき取った `photo` は、押した日のまま止まる。 */
  channelPhoto?: string;
};

/**
 * 読みに行った結果。**「読んでいる最中」と「読めなかった」を混ぜない。**
 *
 * 混ぜると、灰色の骨（＝もうすぐ出る）が、二度と出ないものの上に
 * 何分でも出たままになる（`docs/island-standards.md` 10）。
 */
export type Read = "wait" | "ok" | "down";

/**
 * いま入っているのがあやとか。
 *
 * **読めていないときは `"unknown"`。`"no"` に倒さない。**
 * 倒すと、電波が細いだけの日にあやとが「オーナーではない人」に落ちて、
 * 旅先で島を動かせなくなる。`"unknown"` は「あやとである」でも
 * 「あやとでない」でもないので、道具も出さないし、他人の顔にもしない。
 */
export type Owner = "yes" | "no" | "unknown";

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
  /** 覚えてもらっている自分。**読めていないあいだは null**（0でも空でもない） */
  me: Me | null;
  /** その自分を読めたか */
  meRead: Read;
  /** あやとか */
  owner: Owner;
  /** もう一度読みにいく。**画面を開き直させないための道。** */
  reloadMe: () => void;
};

const Ctx = createContext<AuthState | null>(null);

/**
 * 返事を待つ上限。
 *
 * 細い電波では、断られるより**返事が来ないまま止まる**ほうが多い。
 * `fetch` は自分では諦めないので、待つ上限をこちらで決める。
 * これが無いと、灰色の骨が何分でも出たままになる。
 */
export const READ_MS = 12000;

/** 返事が来ないのも「読めなかった」。上の上限で切る。 */
export function withRead<T>(p: Promise<T>, ms: number = READ_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, no) => {
      t = setTimeout(() => no(new Error("read-timeout")), ms);
    }),
  ]);
}

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

/** 前に口が返した「あやとか」の答え。uid ごとに1つ。 */
const OWNER = "ayato-island-owner";

/*
 * **前に読めた答えを、端末に覚えておく。**
 *
 * 旅のあいだ `POST /me` は落ちる。落ちたときに「読めなかった」を
 * 「あやとではない」に倒すと、山の中で机が開かなくなる——じぶんのことから
 * 入口ごと消えて、画面上に `/me/desk` へ行く道が1本も残らなかった。
 *
 * 覚えているのは **前に口が返した答え**であって、こちらで決めた答えではない。
 * uid ごとに持つので、別のアカウントで入り直せばその人の答えに変わるし、
 * ログアウトすれば消える。
 *
 * ここを手で書き換えても道具が使えるようになるわけではない。**実際に書けるか
 * どうかは、書く先の口（`functions/src/islandApi.ts` の `ownerUid`）が
 * もう一度見ている。** 画面がここで決めているのは「出すか出さないか」だけ。
 */
function rememberOwner(uid: string, admin: boolean) {
  try {
    localStorage.setItem(OWNER, JSON.stringify({ uid, admin }));
  } catch {
    /* 覚えられない端末では、電波が戻るまで待つことになる */
  }
}

function rememberedOwner(uid: string): boolean | null {
  try {
    const v = JSON.parse(localStorage.getItem(OWNER) || "null");
    return v && v.uid === uid ? !!v.admin : null;
  } catch {
    return null;
  }
}

function forgetOwner() {
  try {
    localStorage.removeItem(OWNER);
  } catch {
    /* 消せなくても、次に入った人の uid とは合わないので使われない */
  }
}

/**
 * `customUrl` をハンドル（`@あやとグルメアプリ`）の形にそろえる。
 *
 * ハンドルが付く前からあるチャンネルは `@` の無い名前が返ることがある。
 * `@` の有無で揺れると、同じ人が2通りの名前に見える。
 */
function handleOf(v: unknown): string {
  const s = String(v ?? "").trim().replace(/^[/@]+/, "");
  return s ? `@${s}` : "";
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
    /* 島に出すのはチャンネル名（「あやとアプリ×海外旅」）ではなく
       **ハンドル**（`@あやとグルメアプリ`）。配信で見えているのが
       そちらなので、名前が違うと本人にも誰のことか分からない。
       `part=snippet` に一緒に入っているので、取りにいく回数は増えない。 */
    handle: handleOf(c.snippet?.customUrl),
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

  /* ---------------- 覚えてもらっている自分（`POST /me`） ----------------
   *
   * **島じゅうで1回だけ引く。** 前は、じぶんのこと・机・日誌・板が
   * それぞれ `loadMe` / `amIOwner` を叩いていた。細い電波では、その何本かが
   * 落ちる。落ちた面だけが「あやとではない人」の顔になっていた。
   *
   * 名前もここで重ねる。Firebase が持っているのは Google アカウントの表示名
   * （`ayato_arigato`）で、**YouTube のハンドルはログインを押した瞬間にしか
   * 取れない。** ここが無いと、すでに入っている人はいつまでも古い名前のまま。
   */
  const [me, setMe] = useState<Me | null>(null);
  const [meRead, setMeRead] = useState<Read>("wait");
  /** 前に口が返した答え。読み直しが通るまでは、これで出し分ける */
  const [knownOwner, setKnownOwner] = useState<boolean | null>(null);
  /** 「もう一度」を押されたら増える。読み直しはこれを見て走る */
  const [again, setAgain] = useState(0);
  const reloadMe = useCallback(() => setAgain((n) => n + 1), []);

  /* 端末が覚えている答えは、画面が出てから読む。
     書き出しに焼いた HTML と食い違わせないため（`output: "export"`）。 */
  useEffect(() => {
    setKnownOwner(fbUser ? rememberedOwner(fbUser.uid) : null);
  }, [fbUser]);

  useEffect(() => {
    // 引き継ぎの途中。まだ誰かも分からないので、何も言わない
    if (fbUser === undefined) return;
    if (!fbUser) {
      setMe(null);
      // 入っていないことは、ちゃんと読めている
      setMeRead("ok");
      return;
    }
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    const read = async () => {
      try {
        const idToken = await withRead(fbUser.getIdToken());
        const now = await withRead(loadMe(idToken));
        if (gone) return;
        ok = true;
        miss = 0;
        setMe(now);
        setKnownOwner(now.admin);
        rememberOwner(fbUser.uid, now.admin);
        setMeRead("ok");
        setProfile((p) => {
          if (!p) return p;
          /* いま押してログインした人は、その場で取ったハンドルがもう入っている。
             こちらの返事のほうが遅く着くことがあるので、**入っていたら消さない。**
             （まだ Google の表示名のままの人だけ、こちらで置き換える） */
          const already = p.name !== (fbUser.displayName ?? "名無しさん");
          return {
            ...p,
            name: already ? p.name : now.name || p.name,
            channelId: now.channelId ?? p.channelId,
            channelPhoto: now.channelPhoto ?? p.channelPhoto,
          };
        });
      } catch {
        if (gone) return;
        setMeRead("down");
        /* **押されるまで待たない。** 車が谷を抜ければ次は通る。
           間隔を倍にしながら、30秒おきまで落として黙って読み直す。
           `setMeRead("wait")` に戻さないのは、灰色の骨と
           「読めなかった」の顔が2秒おきに入れ替わるのを避けるため。 */
        miss += 1;
        wait = setTimeout(read, Math.min(2000 * 2 ** (miss - 1), 30000));
      }
    };

    setMeRead("wait");
    read();

    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。
       読めているうちは何もしない（面を開き直すたびに1本増やさない）。 */
    const wake = () => {
      if (ok || gone) return;
      clearTimeout(wait);
      miss = 0;
      read();
    };
    const onShow = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      gone = true;
      clearTimeout(wait);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [fbUser, again]);

  /* **読めていないことを、「あやとではない」と同じ顔にしない。**
     前に口が返した答えがあればそれを使い、無ければ `"unknown"` のまま。 */
  const owner: Owner =
    fbUser === undefined ? "unknown"
    : !fbUser ? "no"
    : me ? (me.admin ? "yes" : "no")
    : knownOwner === null ? "unknown"
    : knownOwner ? "yes"
    : "no";

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
          p ?
            {
              ...p,
              channelId: channel.channelId,
              name: channel.handle || channel.title || p.name,
            } :
            p,
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
    /* 覚えている答えも一緒に捨てる。次に入る人の答えではない */
    forgetOwner();
    setMe(null);
    setKnownOwner(null);
    setMeRead("ok");
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
    () => ({
      user: fbUser === undefined ? undefined : profile,
      signIn,
      signOut,
      error,
      busy,
      token,
      me,
      meRead,
      owner,
      reloadMe,
    }),
    [fbUser, profile, signIn, signOut, error, busy, token, me, meRead, owner, reloadMe],
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
      me: null,
      meRead: "ok",
      owner: "no",
      reloadMe: () => {},
    };
  }
  return v;
}

/**
 * いま入っているのがあやとか。
 *
 * 出るのは**道具を出すかどうか**だけ。実際に書けるかは書く先の口が
 * もう一度見ているので、ここを騙しても何も書けない
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 *
 * 読めなかったときは `"unknown"` で返ってきて、ここは `false`（＝道具を
 * 出さない）に落ちる。**「読めなかったから出す」にはしない。** 出したら、
 * 読めなかっただけの視聴者さんにあやとの道具が見える。前に読めた答えは
 * 端末が覚えているので、あやとの端末では消えない。
 *
 * もとは `components/nordic/log.ts` にいた。あちらは旅の日誌を Firestore から
 * 読むための束で、**日誌を焼き込みに移した日**に要らなくなった。
 * 島じゅうの4か所（板・付箋・企画・カード）から呼ばれるので、
 * 答えを持っているここに置く。
 */
export function useOwner(): boolean {
  return useAuth().owner === "yes";
}
