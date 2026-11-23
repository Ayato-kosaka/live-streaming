"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { readySignIn, useAuth } from "@/lib/auth";
import { SignInWarn } from "@/components/live/SignIn";
import { Gull } from "@/components/island/Guide";
import Phrase from "@/components/ui/Phrase";

/**
 * 投げ銭の面の、入力のほかの1枚ずつ。どれも紙1枚（`.panel.paper`）で、見出しは紙に貼った札。
 *
 * 画面に書くのは**その人がこれから何をするか／何が起きるか**だけ（`docs/island-standards.md` §6）。
 * 決済の仕組み・口・置き場の名前は出さない。
 */

/** 取りに行っている最中。入力の紙と同じ背を先に取る（出たときに下が跳ねない） */
export function TipWaiting() {
  return (
    <section className="panel paper tip-paper" aria-busy="true">
      <div className="wait tip-wait" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

/**
 * ログインのボタン。**押されたらその場でポップアップを開く**ために、画面に出た時点で一式を取っておく
 * （`components/live/SignIn.tsx` と同じ。押してから取りに行くと iPhone が塞ぐ）。
 */
function GoSignIn({ label }: { label: string }) {
  const { signIn, busy, error } = useAuth();
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (go.current) void readySignIn().catch(() => {});
  }, []);
  return (
    <>
      <SignInWarn />
      <button ref={go} className="signin-go tip-signin" onClick={() => void signIn()} disabled={busy}>
        {busy ? "つないでいます…" : label}
      </button>
      {error && <p className="err">{error}</p>}
    </>
  );
}

/** ① 入っていない */
export function TipSignIn() {
  return (
    <section className="panel paper tip-paper">
      <h2>YouTube で入ろう</h2>
      <p className="tip-lead">
        <Phrase parts={["アラートには、", "YouTube のチャンネルの", "名前で出るよ。"]} />
      </p>
      <GoSignIn label="YouTubeでログイン" />
    </section>
  );
}

/** ② 入っているが、チャンネルが結ばれていない（口の 403 もここ） */
export function TipNoChannel({ name }: { name: string }) {
  return (
    <section className="panel paper tip-paper">
      <h2>チャンネルで入りなおそう</h2>
      <p className="tip-lead">
        いまの <b>{name}</b> には、
        <Phrase parts={["YouTube のチャンネルが", "見つからなかった。", "アラートに名前を出す", "チャンネルを選んで、", "入りなおしてね。"]} />
      </p>
      <GoSignIn label="チャンネルを選んで入りなおす" />
    </section>
  );
}

/** ⑤ 払い終わって戻ってきた */
export function TipDone() {
  return (
    <section className="panel paper tip-paper tip-done">
      <h2>届きました</h2>
      <div className="gsay tip-say">
        <span className="gsay-bird">
          <Gull size={56} />
        </span>
        <p className="gsay-bubble">
          <Phrase parts={["ありがとう！", "メッセージは、", "配信のアラートに", "出るよ。"]} />
        </p>
      </div>
      <div className="tip-done-go">
        {/* 同じ面の `?done=1` を外すだけ。打ちかけは、この紙を出したときに捨ててある（`TipDesk`） */}
        <Link prefetch={false} href="/tip" className="blank-go">
          もう一回なげる
        </Link>
        <Link prefetch={false} href="/" className="tip-back">
          島へもどる
        </Link>
      </div>
    </section>
  );
}

/** ⑥ 受け取れない（口が 503・投げ銭の幅がまだ口から出ていない） */
export function TipClosed() {
  return (
    <section className="panel paper tip-paper">
      <div className="blank is-off">
        <b>いまは、投げ銭をお休みしています</b>
        <p>少しあとで、もう一度。</p>
      </div>
    </section>
  );
}
