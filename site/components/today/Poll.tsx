"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPoll, pollAnswer, rememberPollAnswer, votePoll, type Poll as PollData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Arrow, Tick } from "./art";

/**
 * 今夜のおたずね。
 *
 * 参加の階段のいちばん下の段（`docs/island-play.md` 仕掛け3）。
 * いまの島は「押す」と「書く」のあいだに段が1つも無い。
 * 「さんせい」は既にあるが、**誰かが書いた企画にしか押せない**ので、
 * 掲示板が空だと押すものが無いし、他人の企画に押すのは意思表示になりにくい。
 *
 * ここは**こちらから問いを出している**ので、掲示板が空でも押せる。
 * 押した瞬間に棒が伸びて、自分の1票が絵として見える。
 * そして次の段（書く）への橋を、押した直後という
 * **いちばん気分が乗っている瞬間**に置く。
 *
 * 置き場所は「今日の島」の板の中。仕掛け1が器で、2・3・5・16 が
 * その上に載るという作りにしてある（`docs/island-play.md` 9章）。
 */

/**
 * 問いを読みに行くのを、島が落ち着くまで待つ。
 *
 * 島に降りる演出は 3.4 秒。そのあいだは毎フレーム絵を描いているので、
 * ここで fetch と再描画を割り込ませると起動が目に見えて重くなる。
 * 手が空いたら読む（`requestIdleCallback`）。空かなければ、この時間で諦めて読む。
 */
const IDLE_WAIT = 5000;
/** `requestIdleCallback` が無い端末（Safari など）で待つ時間。演出の終わりに合わせる。 */
const FALLBACK_WAIT = 3600;

type Sent = "none" | "sending" | "done";

/**
 * 問いが手元に来るまでの3つの姿（`docs/island-design.md` 4章）。
 *   reading … まだ読んでいる。中身の形をした薄い板だけ置く
 *   open    … 問いが出ている
 *   none    … 今夜は問いが無い。読めなかった日もここに静かに落ちる
 */
type Phase = "reading" | "open" | "none";

export default function Poll({ onCount }: { onCount?: (unanswered: boolean) => void }) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [phase, setPhase] = useState<Phase>("reading");
  const [mine, setMine] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>("none");
  const [failed, setFailed] = useState<string | null>(null);
  const { token } = useAuth();
  /** 棒を伸ばすのは押したあとの1回だけ。読み込み直後から伸びていると、押した手応えが消える */
  const grown = useRef(false);
  /* 親から渡る関数は毎回作り直されるので、依存に入れると問いを何度も読みに行く。
     中身は「赤い丸を出すかどうか」の伝言だけなので、最新のものを持つだけでよい。 */
  const tell = useRef(onCount);
  tell.current = onCount;

  useEffect(() => {
    let alive = true;
    const read = () => {
      getPoll()
        .then(({ poll: p }) => {
          if (!alive) return;
          if (!p || p.options.length < 2) {
            setPhase("none");
            return;
          }
          const had = pollAnswer(p.id);
          // 前に押していた人には、開いた時点で棒を出しておく。
          // 自分の1票がまだそこにあることが分かるほうが、次も押す気になる。
          if (had) grown.current = true;
          setPoll(p);
          setMine(had);
          setPhase("open");
          tell.current?.(!had);
        })
        .catch(() => {
          // 読めなかった日は、問いが無い日と同じ顔にする。
          // 島の中でサーバーの失敗を見せない（`docs/island-design.md` 4章）
          if (alive) setPhase("none");
        });
    };
    const ric = (window as unknown as { requestIdleCallback?: typeof requestIdleCallback })
      .requestIdleCallback;
    if (ric) {
      const id = ric(read, { timeout: IDLE_WAIT });
      return () => {
        alive = false;
        (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id);
      };
    }
    const t = setTimeout(read, FALLBACK_WAIT);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const press = useCallback(
    async (option: string) => {
      if (!poll || mine || sent === "sending") return;
      // 押した瞬間に棒が伸びる。サーバーの返事を待つと、押した手応えが遅れて届く。
      grown.current = true;
      setMine(option);
      setSent("sending");
      setFailed(null);
      tell.current?.(false);
      // 自分の1票を先に足しておく。返事を待ってから足すと、
      // 「押したのに数字が動かない」がまず見えてしまう
      setPoll((p) =>
        p
          ? {
              ...p,
              total: p.total + 1,
              options: p.options.map((o) => (o.id === option ? { ...o, votes: o.votes + 1 } : o)),
            }
          : p,
      );
      try {
        const t = await token();
        const { poll: fresh, mine: saved } = await votePoll(poll.id, option, t);
        setPoll(fresh);
        setMine(saved || option);
        rememberPollAnswer(poll.id, saved || option);
        setSent("done");
      } catch (e) {
        // 数えられなかったのに棒だけ伸びていると嘘になる。押す前まで戻す。
        grown.current = false;
        setPoll(poll);
        setMine(null);
        setSent("none");
        tell.current?.(true);
        setFailed(
          String(e).includes("429")
            ? "今日はたくさん押してくれた。また明日おねがい。"
            : "いま数えられなかった。少し待ってから、もう一度おしてみて。",
        );
      }
    },
    [poll, mine, sent, token],
  );

  // 読んでいるあいだ。場所だけ先に取って、中身の形をした薄い板を置く。
  // 回るものは島に1つも無いので、待ちにも回るものを使わない
  if (phase === "reading") {
    return (
      <div className="poll is-waiting" aria-hidden>
        <b className="poll-ask">今夜のおたずね</b>
        <span className="poll-skel poll-skel-q" />
        <span className="poll-skel poll-skel-o" />
        <span className="poll-skel poll-skel-o" />
      </div>
    );
  }

  // 今夜は問いが無い日。「まだ何も無い」で終わらせず、次にすることを1つ置く。
  // 読めなかった日もここに来る。島の中でエラーを出さない
  if (phase === "none" || !poll) {
    return (
      <p className="poll-none">
        今夜のおたずねは、まだ出ていない。
        <Link className="poll-why" href="/board">
          掲示板に企画を貼る
          <Arrow size={11} />
        </Link>
      </p>
    );
  }

  const open = grown.current && !!mine;
  // 押す前は人数を出さない。先に数字を見せると、多いほうに引っぱられる
  const total = open ? poll.total : 0;

  return (
    <div className={`poll${open ? " is-open" : ""}`}>
      <b className="poll-ask">今夜のおたずね</b>
      <p className="poll-q">{poll.question}</p>

      <ul className="poll-list">
        {poll.options.map((o) => {
          const isMine = mine === o.id;
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          return (
            <li key={o.id} className={`poll-item${isMine ? " is-mine" : ""}`}>
              <button
                className="poll-pick"
                onClick={() => press(o.id)}
                disabled={!!mine}
                aria-pressed={isMine}
              >
                {/* 棒は幅ではなく scaleX で伸ばす。幅を変えると1票ごとに版が組み直される */}
                <span className="poll-bar" style={{ transform: `scaleX(${open ? pct / 100 : 0})` }} />
                <span className="poll-label">{o.label}</span>
                {isMine && <Tick />}
                {open && <span className="poll-n">{o.votes.toLocaleString()}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {failed && <p className="poll-failed">{failed}</p>}

      {open && (
        <>
          <p className="poll-said">{`いま${(poll.options.find((o) => o.id === mine)?.votes ?? 0).toLocaleString()}人がこっちを押した`}</p>
          {/* 次の段への橋。押した直後がいちばん気分が乗っているので、ここに置く */}
          <Link className="poll-why" href="/board">
            理由も書ける？
            <Arrow size={11} />
          </Link>
        </>
      )}
    </div>
  );
}
