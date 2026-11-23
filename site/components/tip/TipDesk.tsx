"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ReadAgainPanel } from "@/components/me/ReadAgain";
import { keepDraft, postTipCheckout, readDraft, useTipLimits, type CheckoutResult } from "./api";
import { readYen, yenProblem } from "./yen";
import TipForm from "./TipForm";
import TipCheck from "./TipCheck";
import { TipClosed, TipDone, TipNoChannel, TipSignIn, TipWaiting } from "./TipPanels";

type Why = Extract<CheckoutResult, { ok: false }>["why"];

/** 口に断られたとき、紙に出す1行（**次に何をすればいいか**だけ。仕組みの話はしない） */
const FAIL: Record<Why, string> = {
  signin: "入りなおしてから、もう一度。",
  channel: "",
  /* どの語かは言わない（言うと、言い換えて通すための答えになる） */
  ngword: "使えない言葉が入っています",
  range: "額かメッセージを、なおしてもう一度。",
  today: "今日はここまで。また明日、投げてね。",
  closed: "",
  down: "いま、つなげなかった。少し待って、もう一度。",
};

/**
 * 島の投げ銭（`/tip`。決定の記録 0017・#1405）。**どの紙を出すかは、ここだけが決める。**
 *
 * | 順 | いま | 出す紙 |
 * | --- | --- | --- |
 * | 0 | `?done=1` で戻ってきた | ⑤ 届きました |
 * | 1 | 入っているか分からない | 形だけの板 |
 * | 2 | 入っていない | ① YouTube で入る |
 * | 3 | 自分（`POST /me`）が読めない | 読めなかった（もう一度） |
 * | 4 | チャンネルが結ばれていない（口の 403 も） | ② チャンネルで入りなおす |
 * | 5 | 幅（`GET /state` の `limits`）が読めない／入っていない（口の 503 も） | 読めなかった／⑥ お休み |
 * | 6 | それ以外 | ③ 入力 → ④ 最終確認 → 支払いの画面へ |
 *
 * **チャンネルは `/me` の答え（サーバーが結んだもの）で見る。** ログインを押した瞬間に画面が取った
 * チャンネルは使わない——結べたかどうかは、口の側でしか決まらない。
 */
export default function TipDesk() {
  const done = useSearchParams().get("done") === "1";
  const { user, me, meRead, reloadMe, token } = useAuth();
  const [lim, retryLim] = useTipLimits();
  const [step, setStep] = useState<"form" | "check">("form");
  /** 打っている額（字のまま）。幅が届くまでは `null`——初期値は幅のいちばん下（口が決める） */
  const [yen, setYen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [why, setWhy] = useState<Why | null>(null);

  /* 払い終わって戻ってきたら、打ちかけは捨てる（次に開いた人の入力に前の額が残らない） */
  useEffect(() => {
    if (done) keepDraft(null);
  }, [done]);

  /* 幅が届いたら、初期値を置く。**支払いの画面から戻ってきたとき**は、打ちかけを戻す */
  useEffect(() => {
    if (lim.st !== "ok" || yen !== null || done) return;
    const d = readDraft();
    setYen(d?.yen ?? String(lim.lim.tipYenMin));
    if (d) setMessage(d.message.slice(0, lim.lim.tipMessageMax));
  }, [lim, yen, done]);

  /* 入りなおした（自分を読み直した）ら、前に断られた理由は捨てる */
  useEffect(() => {
    setWhy(null);
  }, [me]);

  const pay = useCallback(async () => {
    const n = yen === null ? null : readYen(yen);
    if (n === null || lim.st !== "ok" || yenProblem(yen ?? "", lim.lim) !== null) return;
    setSending(true);
    setWhy(null);
    const t = await token();
    const got: CheckoutResult = t ? await postTipCheckout(n, message, t) : { ok: false, why: "signin" };
    if (got.ok) {
      /* 戻るを押されたときのために、打ちかけを残してから移る。**移るあいだは押せないまま** */
      keepDraft({ yen: yen ?? "", message });
      window.location.assign(got.url);
      return;
    }
    setSending(false);
    setWhy(got.why);
    /* 直すのは入力の紙の上。最終確認の紙では直せない */
    if (got.why === "range" || got.why === "ngword") setStep("form");
  }, [yen, message, lim, token]);

  if (done) return <TipDone />;
  if (user === undefined) return <TipWaiting />;
  if (!user) return <TipSignIn />;
  if (!me) return meRead === "down" ? <ReadAgainPanel what="じぶんのこと" onRetry={reloadMe} /> : <TipWaiting />;
  if (!me.channelId || why === "channel") return <TipNoChannel name={user.name} />;
  if (lim.st === "wait" || (lim.st === "ok" && yen === null)) return <TipWaiting />;
  if (lim.st === "down") return <ReadAgainPanel what="投げ銭" onRetry={retryLim} />;
  if (lim.st === "off" || why === "closed") return <TipClosed />;

  const n = readYen(yen ?? "");
  if (step === "check" && n !== null) {
    return (
      <TipCheck
        yen={n}
        message={message}
        sending={sending}
        fail={why ? FAIL[why] : null}
        canPay={why !== "today"}
        onPay={() => void pay()}
        onBack={() => {
          setWhy(null);
          setStep("form");
        }}
        signInAgain={why === "signin" ? <TipSignInAgain /> : null}
      />
    );
  }
  return (
    <TipForm
      lim={lim.lim}
      who={user.name}
      face={me.channelPhoto}
      yen={yen ?? ""}
      message={message}
      onYen={(v) => {
        setYen(v);
        if (why !== "ngword") setWhy(null);
      }}
      onMessage={(v) => {
        setMessage(v);
        setWhy(null);
      }}
      onNext={() => {
        setWhy(null);
        setStep("check");
      }}
      fail={why && why !== "ngword" ? FAIL[why] : null}
      msgFail={why === "ngword" ? FAIL.ngword : null}
    />
  );
}

/** 合言葉が切れていたとき。最終確認の紙のまま、入りなおせるようにする */
function TipSignInAgain() {
  const { signIn, busy } = useAuth();
  return (
    <button type="button" className="signin-go tip-signin" onClick={() => void signIn()} disabled={busy}>
      {busy ? "つないでいます…" : "YouTubeで入りなおす"}
    </button>
  );
}
