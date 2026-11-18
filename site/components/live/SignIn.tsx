"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readySignIn, useAuth } from "@/lib/auth";
import Icon from "@/components/ui/IconCore";

/**
 * 島へのログイン。
 *
 * Google の審査を通していないので、同意画面の前に
 * 「このアプリは確認されていません」という警告が出る。
 * 隠すとかえって怖いので、押す前に何が起きるかを先に書いておく。
 *
 * **ログアウトと「島での見え方」は、ここから出ていった（#163）。**
 * 掲示板の折りたたみの中にあって、あやとにもレビューでも
 * 「見つからない」と言われ続けた（#152）。行き先は
 * じぶんのこと（`/me`）で、そこへは看板の自分のアイコンから1タップで着く。
 * ここが持つのは**入る道だけ**にする。
 */
export default function SignIn({ compact = false }: { compact?: boolean }) {
  const { user, signIn, error, busy } = useAuth();
  const [open, setOpen] = useState(false);
  const go = useRef<HTMLButtonElement>(null);

  /* **ボタンが画面に出たら、ログインの一式を先に取っておく。**
     押されてから取りに行くと、押した瞬間からポップアップまでに通信が挟まって
     iPhone が塞ぐ（`lib/auth.tsx` の `readySignIn`）。
     出たとき、にするのは**畳みの中や画面の外では取らない**ため。掲示板では
     この部品が閉じた畳みの中に置いてあり、開かない人には何も乗らない。 */
  useEffect(() => {
    const b = go.current;
    if (!b) return;
    const take = () => void readySignIn().catch(() => {});
    if (typeof IntersectionObserver === "undefined") {
      take();
      return;
    }
    const seen = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      take();
    });
    seen.observe(b);
    return () => seen.disconnect();
  }, [user, compact, open]);

  if (user === undefined) return null;

  /* 入っている人には、行き先だけ出す。出したり消したりの操作はここでしない。
     （じぶんのことへ行けば、まとめて1か所にある） */
  if (user) {
    return (
      <Link prefetch={false} className="tile" href="/me">
        {/* 顔は**毎晩入れ直る `channelPhoto`**。ログインした日のまま止まる
            `photo` を出すと、ここだけ古い顔になる（`docs/island-misses.md` #1）。 */}
        {user.channelPhoto ? (
          <img className="tile-icon is-round" src={user.channelPhoto} alt="" />
        ) : (
          <img className="tile-icon" src="/sprites/hut-home.webp" alt="" />
        )}
        <span className="tile-text">
          <b>{user.name} として島にいます</b>
          <i>じぶんのことへ。島での見え方・貼った付箋・ログアウト</i>
        </span>
        <Icon name="right" size={15} className="tile-go" />
      </Link>
    );
  }

  if (compact && !open) {
    return (
      <button className="signin-link" onClick={() => setOpen(true)}>
        YouTubeでログインする
      </button>
    );
  }

  return (
    <div className="signin">
      <b>YouTubeのアカウントでログインすると</b>
      <ul>
        <li>出した企画が、自分のものになる</li>
        <li>名前を毎回書かなくていい</li>
        {/* 2026-10-08 から。**ログインでできることが1つ増えた**ので、
            ここに足す（入る理由は、この一覧にしか書いていない） */}
        <li>付箋に絵を貼れる</li>
      </ul>
      <p className="signin-warn">
        Google の画面に移ります。<b>「このアプリは確認されていません」</b>と出たら、
        「詳細」→「あやと島（安全ではないページ）に移動」。
      </p>
      <button ref={go} className="signin-go" onClick={() => void signIn()} disabled={busy}>
        {busy ? "つないでいます…" : "YouTubeでログイン"}
      </button>
      {error && <p className="err">{error}</p>}
      {!compact && (
        <p className="signin-skip">ログインしなくても、企画は出せます。</p>
      )}
    </div>
  );
}
