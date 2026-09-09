"use client";

import { useCallback, useEffect, useState } from "react";
import { startAlertbox, type DoneruHint } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";

/**
 * アラートボックスの、OBS に貼る URL（#180）。**あやとだけ。**
 *
 * ## なぜこの面が要るのか
 *
 * Doneru の鍵が、本番の JavaScript にそのまま入っていた。`/alertbox` を
 * 開いた人なら誰でも読めた。原因は `EXPO_PUBLIC_DONERU_WSS_URL` で、
 * `EXPO_PUBLIC_` は「隠す」ではなく「**公開してよいと宣言する**」接頭辞
 * なので、Expo が書き出しへ焼く。GitHub Secret に入れてあっても、
 * 焼いた先が公開されていれば意味がない。
 *
 * **そして、この鍵は作り直せない。** あやとの言葉（2026-09-08）
 * 「Doneru の鍵を新しく作る仕組みはありません」。ふつうなら「漏れたら
 * 作り直す」で済むところが、ここでは済まない。だから二度と外へ出さない
 * 形にするしかなかった。
 *
 * ## 出しているのは鍵ではない
 *
 * ここに出る URL の `?k=…` は、**こちらが発行した 32 桁の合言葉**。
 * これを見せた相手にサーバーが鍵を使ってくれる、という引換券でしかない。
 * 漏れたら「作り直す」で替えられる。**替えられるものを外に出す**のが
 * この作りの要点で、替えられない鍵のほうはサーバーから出さない。
 *
 * ## 畳まない
 *
 * ルーレット（#164）の URL は畳みの中に置いた。あちらは「いちど貼れば
 * 変わらない」ものだから。ここは**いま貼り替えてもらう必要がある**ので、
 * 開いた状態で置く。貼り替えが終わったら畳みへ移してよい。
 */
export default function AlertBoxBox() {
  const { token } = useAuth();
  const [id, setId] = useState<string | null>(null);
  const [doneru, setDoneru] = useState<DoneruHint | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 作り直しは取り返しがつかない（いまの OBS が黙って止まる）ので、二度おす */
  const [sure, setSure] = useState(false);

  const open = useCallback(
    async (fresh: boolean) => {
      const t = await token();
      if (!t) return;
      setErr(null);
      try {
        const r = await startAlertbox(t, fresh);
        setId(r.id);
        setDoneru(r.doneru);
        setSure(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "うまくいきませんでした");
      }
    },
    [token],
  );

  useEffect(() => {
    open(false);
  }, [open]);

  if (err) {
    return (
      <section className="panel paper">
        <h2>アラートボックス</h2>
        <p className="rc-note">{err}</p>
      </section>
    );
  }
  if (!id) {
    return (
      <section className="panel paper">
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      </section>
    );
  }

  /* 生い立ちは書き出しに焼かない。**ここは静的書き出しの面**なので、
     ビルドした箱の名前が焼き付く（`CLAUDE.md`）。出てから読む。 */
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/alertbox?k=${id}`;

  return (
    <section className="panel paper">
      <h2>アラートボックス（OBS）</h2>
      <p className="rc-note">
        この URL を、OBS のブラウザソースに貼ってください。
        <b>前の URL はもう動きません。</b>
        鍵を書き出しに焼くのをやめたので、
        <code>?k=</code> の付いていない URL は投げ銭の通知を受け取れません。
      </p>
      <p className="rc-url">{url}</p>
      <div className="rc-acts">
        <button
          className="rc-quiet"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
        >
          <Icon name="check" size={16} />
          {copied ? "うつしました" : "URL をうつす"}
        </button>
      </div>
      <p className="rc-note">
        ここに出ているのは<b>鍵ではありません。</b>
        こちらが出した合言葉で、鍵はサーバーに置いたままです。
        それでも、この URL を知っている人は投げ銭の通知を受け取れるので、
        配信の画面にそのまま映すもの以外には貼らないでください。
        {doneru?.set ?
          `（Doneru の鍵は入っています。末尾 ${doneru.tail}）` :
          "（Doneru の鍵がまだ入っていません。/me/roulette の「コメントの読み方」から入れてください）"}
      </p>

      <Fold title="合言葉を作り直す" lead="漏れたと思ったときだけ">
        <p className="rc-note">
          Doneru の鍵そのものは作り直せません。かわりに、こちらの合言葉を
          替えます。<b>押した瞬間に、いま貼ってある OBS の URL が止まります。</b>
          貼り替えられる場所にいるときだけ押してください。
        </p>
        {sure ? (
          <div className="rc-acts">
            <button className="rc-quiet" onClick={() => open(true)}>
              作り直す（OBS を貼り替えます）
            </button>
            <button className="rc-quiet" onClick={() => setSure(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button className="rc-quiet" onClick={() => setSure(true)}>
            作り直す
          </button>
        )}
      </Fold>
    </section>
  );
}
