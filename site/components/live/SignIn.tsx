"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

/**
 * 島へのログイン。
 *
 * Google の審査を通していないので、同意画面の前に
 * 「このアプリは確認されていません」という警告が出る。
 * 隠すとかえって怖いので、押す前に何が起きるかを先に書いておく。
 */
export default function SignIn({ compact = false }: { compact?: boolean }) {
  const { user, signIn, signOut, error, busy } = useAuth();
  const [open, setOpen] = useState(false);

  if (user === undefined) return null;

  if (user) {
    return (
      <div className="signed">
        {user.photo && <img src={user.photo} alt="" />}
        <span className="signed-name">{user.name}</span>
        <button className="signed-out" onClick={signOut}>
          ログアウト
        </button>
      </div>
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
        <li>出した企画が自分のものだと分かるようになります</li>
        <li>スマホとパソコンで同じ人として扱われます</li>
        <li>名前を毎回入れなくてよくなります</li>
      </ul>
      <p className="signin-warn">
        押すと Google の画面に移ります。このサイトはまだ Google の審査を受けていないので、
        <b>「このアプリは確認されていません」</b>という警告が出ます。
        あやとが作ったサイトです。進める場合は「詳細」→「あやと島（安全ではないページ）に移動」を押してください。
        受け取るのは<b>チャンネル名とアイコンだけ</b>で、動画の投稿や変更はできません。
      </p>
      <button className="signin-go" onClick={signIn} disabled={busy}>
        {busy ? "つないでいます…" : "YouTubeでログイン"}
      </button>
      {error && <p className="err">{error}</p>}
      {!compact && (
        <p className="signin-skip">ログインしなくても、企画は出せます。</p>
      )}
    </div>
  );
}
