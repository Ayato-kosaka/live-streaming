"use client";

import { useCallback, useEffect, useState } from "react";
import { putDoneruKey, startAlertbox, type DoneruHint } from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import { ReadAgainPanel, WaitingPanel } from "./ReadAgain";

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
  /** URL を読めたか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  const [read, setRead] = useState<Read>("wait");
  /** 鍵をしまう・合言葉を作り直すが失敗したとき。**面は下ろさない** */
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 作り直しは取り返しがつかない（いまの OBS が黙って止まる）ので、二度おす */
  const [sure, setSure] = useState(false);
  /** Doneru の鍵。**打っているあいだだけここにいる。** 送ったら空にする */
  const [keyed, setKeyed] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---- Doneru の鍵をしまう ----
     **入れる欄をここにも置く理由。** 前は `/me/roulette` の畳みの中
     「コメントの読み方」にしか無かった。ところが鍵が無くて止まるのは
     アラートボックスのほうで、実際そうなった（2026-09-09）。
     **止まったと言っている面で直せないと、探すところから始まる。** */
  const saveKey = useCallback(
    async (v: string) => {
      const t = await token();
      if (!t) return;
      setSaving(true);
      setErr(null);
      try {
        const r = await putDoneruKey(v, t);
        setDoneru(r.doneru);
        setKeyed("");
      } catch {
        /* 口が投げてくるのは `TypeError: Failed to fetch` か `500 …` で、
           読む人には何も足さない。**ここで日本語にしてから出す。** */
        setErr("鍵をしまえませんでした。少し待ってから、もう一度。");
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  /**
   * URL を取りに行く。
   *
   * ## 落ちたときは、ほかの7つの道具と同じ1枚にする
   *
   * ここだけが `Failed to fetch` の英語1行だった（`{err}` を素通ししていた）。
   * しかもその1枚で面ごと差し替わるので、**押しどころが全部消えた** ——
   * URL をうつすことも、鍵を入れることもできない。電波の細い日に
   * 読み直す道が1本も無いのが、旅先ではいちばん困る
   * （`docs/island-standards.md` 10 の唯一の穴だった）。
   *
   * `fresh` は合言葉の作り直し。**こちらが落ちても面は残す。**
   * いま貼ってある URL はまだ生きているので、面ごと下ろす理由がない。
   */
  const open = useCallback(
    async (fresh: boolean) => {
      setErr(null);
      if (fresh) setSure(false);
      try {
        /* 返事が来ないのも「読めなかった」。`withRead` が12秒で見切る */
        const t = await withRead(token());
        if (!t) throw new Error("ログインしなおしてください");
        const r = await withRead(startAlertbox(t, fresh));
        setId(r.id);
        setDoneru(r.doneru);
        setRead("ok");
        setSure(false);
      } catch {
        if (fresh) setErr("合言葉を作り直せませんでした。少し待ってから、もう一度。");
        else setRead("down");
      }
    },
    [token],
  );

  useEffect(() => {
    open(false);
  }, [open]);

  /* ほかの7つの道具と同じ札。**言い回しは島じゅうで1つ** */
  if (read === "down")
    return (
      <ReadAgainPanel
        what="アラートボックス"
        onRetry={() => {
          setRead("wait");
          open(false);
        }}
      />
    );
  if (!id) return <WaitingPanel />;

  /* 生い立ちは書き出しに焼かない。**ここは静的書き出しの面**なので、
     ビルドした箱の名前が焼き付く（`CLAUDE.md`）。出てから読む。 */
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/alertbox?k=${id}`;

  return (
    <section className="panel paper">
      <h2>アラートボックス（OBS）</h2>
      {/* **同じことを2回言わない。** 以前は上と下に「ブラウザソースに貼る」が
          並んでいた。貼る先は上で言い切って、下は「ほかには貼らない」だけにする。
          鍵の焼き込みをやめた経緯は中の話なので、画面には出さない。 */}
      <p className="mp-ab-lead">
        <b>前の URL はもう動きません。</b>
        この URL を、OBS のブラウザソースに貼り直してください。
      </p>
      <p className="mp-ab-url">{url}</p>
      {/* しまう・作り直すが失敗したとき。**面は下ろさない。**
          いま貼ってある URL はまだ生きているので、消す理由がない。 */}
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> {err}
        </p>
      )}
      <div className="mp-ab-acts">
        <button
          className="mp-send is-small is-quiet"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
        >
          <Icon name="check" size={16} />
          {copied ? "うつしました" : "URL をうつす"}
        </button>
      </div>
      <p className="mp-ab-lead">
        知っている人は誰でも投げ銭の通知を受け取れるので、ほかには貼らない。
        {doneru?.set && `（Doneru の鍵は入っています。末尾 ${doneru.tail}）`}
      </p>

      {/* **鍵が無いときは、いちばん上に出す。** これが無いと URL を貼っても
          「投げ銭のつなぎ先を取れませんでした」で止まる。実際に止まった
          （2026-09-09）ので、止まる原因をこの面の中で直せるようにする。 */}
      {doneru !== null && !doneru.set && (
        <div className="mp-ab-need">
          <b>Doneru の鍵が、まだ入っていません。</b>
          <p>
            これが無いと、URL を貼っても投げ銭の通知は来ません。
            Doneru のアラートボックスの OBS の URL の、
            <code>?key=</code> のあとの文字列です。

          </p>
          <div className="dform mp-ab-key">
            <input
              type="password"
              value={keyed}
              onChange={(e) => setKeyed(e.target.value)}
              placeholder="Doneru の鍵"
              autoComplete="off"
              maxLength={200}
              aria-label="Doneru の鍵"
            />
            <button
              className="mp-send is-small"
              onClick={() => saveKey(keyed)}
              disabled={!keyed.trim() || saving}
            >
              <Icon name="check" size={16} />
              しまう
            </button>
          </div>
        </div>
      )}

      {doneru?.set && (
        <Fold title="Doneru の鍵を入れ直す" lead={`いまは末尾 ${doneru.tail}`}>
          <p className="mp-ab-lead">
            Doneru 側で作り直したときだけ。入れ直すと、いまの鍵は上書きされます。
          </p>
          <div className="dform mp-ab-key">
            <input
              type="password"
              value={keyed}
              onChange={(e) => setKeyed(e.target.value)}
              placeholder="Doneru の鍵"
              autoComplete="off"
              maxLength={200}
              aria-label="Doneru の鍵"
            />
            <button
              className="mp-send is-small is-quiet"
              onClick={() => saveKey(keyed)}
              disabled={!keyed.trim() || saving}
            >
              <Icon name="check" size={16} />
              入れ直す
            </button>
          </div>
        </Fold>
      )}

      <Fold title="合言葉を作り直す" lead="漏れたと思ったときだけ">
        <p className="mp-ab-lead">
          Doneru の鍵そのものは作り直せません。かわりに、こちらの合言葉を
          替えます。<b>押した瞬間に、いま貼ってある OBS の URL が止まります。</b>
          貼り替えられる場所にいるときだけ押してください。
        </p>
        {sure ? (
          <div className="mp-ab-acts">
            <button className="mp-send is-small is-quiet" onClick={() => open(true)}>
              作り直す（OBS を貼り替えます）
            </button>
            <button className="mp-send is-small is-quiet" onClick={() => setSure(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button className="mp-send is-small is-quiet" onClick={() => setSure(true)}>
            作り直す
          </button>
        )}
      </Fold>
    </section>
  );
}
