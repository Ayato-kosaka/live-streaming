"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
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

  if (user === undefined) return null;

  /* 入っている人には、行き先だけ出す。出したり消したりの操作はここでしない。
     （じぶんのことへ行けば、まとめて1か所にある） */
  if (user) {
    return (
      <Link className="tile" href="/me">
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
        <li>出した企画が、自分のものだと分かる</li>
        <li>スマホとパソコンで、同じ人として扱われる</li>
        <li>名前を毎回入れなくていい</li>
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
