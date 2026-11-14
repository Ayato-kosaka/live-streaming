"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Waiting, sayable } from "@/components/me/ReadAgain";
import Icon from "@/components/ui/IconCore";
import { useAuth, withRead, type Read } from "@/lib/auth";
import {
  planRegister,
  stepRegister,
  type ImportItem,
  type RegisterPlan,
} from "@/lib/cardImport";
import { cardWhen } from "./cards";
import ImportImg from "./ImportImg";

/** 1回に登録する枚数。口の `max` */
const STEP = 10;

type Phase =
  | { k: "plan"; read: Read; plan?: RegisterPlan }
  | { k: "run"; done: number; total: number; stopping: boolean; hold?: string }
  | { k: "end"; done: number; hold?: string };

/** 断られたのか、届かなかったのかで、次にやることが変わる。そこだけ分ける */
const sayErr = (e: unknown) =>
  /\b40[13]\b/.test(String(e)) ?
    "ログインしなおして、もう一度おしてください。" :
    "電波が届いたら、もう一度おしてください。";

/**
 * 「残り N 枚をあやと島カードに登録」の確認 → 実行 → 結果。
 *
 * **確認では、写真の数だけでなく、カードが渡る人の数を出す。** 登録した写真は
 * その日に投げ銭してくれた人へカードとして渡る（過去の日でも、さかのぼって）。
 * 押す前に知らないと決められないのはそちら（`DropPhoto` の確認と同じ考え）。
 * 数は口の下見（`dryRun`）が出す。**読めなかったら登録を押させない**
 * （`docs/island-misses.md` 決めごと9の6。読めていない相手に、書ける口を開かない）。
 *
 * 登録は 10 枚ずつ、残りが0になるまで呼ぶ。1回ごとに進みを出す。
 * 途中で落ちたら3回までは黙って呼び直し、それでも駄目なら止めて「つづきから」。
 * 口の側で二重登録を止めている（`importSha`）ので、つづきから呼んでも増えない。
 */
export default function ImportRegister({
  batch,
  keep,
  items,
  flush,
  mark,
  reload,
  onClose,
}: {
  batch: string;
  /** いまの登録予定の枚数 */
  keep: number;
  /** この回の候補ぜんぶ（失敗の一覧に使う） */
  items: ImportItem[];
  /** 送っていない「外す」を送り切る */
  flush: () => Promise<boolean>;
  mark: (res: { sha: string; status: ImportItem["status"]; error?: string }[]) => void;
  reload: () => void;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [phase, setPhase] = useState<Phase>({ k: "plan", read: "wait" });
  const [askAgain, setAskAgain] = useState(0);
  const stop = useRef(false);
  const live = useRef(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    live.current = false;
  }, []);

  /* ---------- 下見 ---------- */
  useEffect(() => {
    let gone = false;
    setPhase({ k: "plan", read: "wait" });
    (async () => {
      try {
        /* 外したのを送り切ってから数える。送れていないと、外したものまで数に入る */
        if (!(await flush())) throw new Error("flush");
        const t = await withRead(token());
        if (!t) throw new Error("no-token");
        const plan = await withRead(planRegister(t, batch), 30000);
        if (!gone) setPhase({ k: "plan", read: "ok", plan });
      } catch {
        if (!gone) setPhase({ k: "plan", read: "down" });
      }
    })();
    return () => {
      gone = true;
    };
  }, [batch, token, flush, askAgain]);

  const running = phase.k === "run";
  useEffect(() => {
    closeRef.current?.focus();
  }, [phase.k]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, running]);

  /* ---------- 実行 ---------- */
  const run = useCallback(
    async (total: number, already = 0) => {
      stop.current = false;
      let done = already;
      let tries = 0;
      /** 前の回に口が言った残り */
      let left: number | undefined = total - already;
      setPhase({ k: "run", done, total, stopping: false });
      for (;;) {
        if (stop.current) break;
        let step;
        try {
          if (!(await flush())) throw new Error("flush");
          const t = await withRead(token());
          if (!t) throw new Error("no-token");
          /* 10枚ぶん写真を焼いてカードを作るので、読みものの12秒では足りない */
          step = await withRead(stepRegister(t, batch, STEP), 120000);
        } catch (e) {
          tries += 1;
          if (tries >= 3) {
            if (live.current) setPhase({ k: "run", done, total, stopping: false, hold: sayErr(e) });
            return;
          }
          await new Promise((ok) => setTimeout(ok, 1500 * 2 ** (tries - 1)));
          continue;
        }
        tries = 0;
        const res = [
          ...step.results,
          ...step.failed
            .filter((f) => !step.results.some((r) => r.sha === f.sha))
            .map((f) => ({ sha: f.sha, status: "failed" as const, error: f.error })),
        ];
        mark(res);
        /* 進んだ枚数。口が数を返さなければ、残りの減りで数える */
        const got =
          step.registered ??
          (step.remaining !== undefined && left !== undefined ? Math.max(0, left - step.remaining) : 0);
        left = step.remaining;
        done += got;
        if (step.remaining !== undefined) total = Math.max(total, done + step.remaining);
        if (live.current) setPhase({ k: "run", done, total, stopping: stop.current });
        /* 0になったら終わり。**1枚も進まなかった回でも止める**——失敗した写真だけが
           残っていると、残りの数がいつまでも0にならない */
        if (step.remaining === 0 || got === 0) break;
      }
      if (!live.current) return;
      setPhase({ k: "end", done });
      /* 口の答えを正にする。手元に写した状態は、読み直しで置き換わる */
      reload();
    },
    [batch, flush, mark, reload, token],
  );

  const failed = items.filter((i) => i.status === "failed");

  return (
    <div className="cim-modal" role="dialog" aria-modal="true" aria-label="あやと島カードに登録">
      <button
        className="cim-back"
        aria-label="閉じる"
        tabIndex={-1}
        onClick={() => {
          if (!running) onClose();
        }}
      />
      <div className="cim-look is-reg">
        <div className="cim-look-head">
          <p>
            <b>あやと島カードに登録</b>
          </p>
          {!running && (
            <button ref={closeRef} className="cim-close" onClick={onClose} aria-label="閉じる">
              <Icon name="close" size={18} />
            </button>
          )}
        </div>

        <div className="cim-reg">
          {phase.k === "plan" && (
            <>
              <p className="cim-reg-big">
                <b>{(phase.plan?.total ?? keep).toLocaleString()}</b>枚を登録します
              </p>
              {phase.read === "wait" && <Waiting />}
              {phase.read === "down" && (
                <div className="blank is-off">
                  <b>いま、登録する写真の数を読みに行けなかった</b>
                  <p>少し待ってから、もう一度。</p>
                  <button className="blank-go" onClick={() => setAskAgain((n) => n + 1)}>
                    もう一度よみこむ
                    <Icon name="refresh" size={14} />
                  </button>
                </div>
              )}
              {phase.read === "ok" && phase.plan && (
                <>
                  {phase.plan.people !== undefined && (
                    <p className="cim-reg-who">
                      カードが渡る人 <b>{phase.plan.people.toLocaleString()}</b>人
                    </p>
                  )}
                  {phase.plan.days.length > 0 && (
                    <ul className="cim-reg-days" aria-label="日ごとの枚数">
                      {phase.plan.days.map((d) => (
                        <li key={d.day}>
                          <span>{cardWhen(d.day)}</span>
                          <b>{d.count}枚</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <div className="cim-reg-row">
                <button className="cim-btn is-sub" onClick={onClose}>
                  やめる
                </button>
                {phase.read === "ok" && (
                  <button
                    className="cim-btn is-go"
                    onClick={() => run(phase.plan?.total ?? keep)}
                    disabled={(phase.plan?.total ?? keep) === 0}
                  >
                    登録する
                  </button>
                )}
              </div>
            </>
          )}

          {phase.k === "run" && (
            <>
              <p className="cim-reg-big" aria-live="polite">
                <b>{phase.done.toLocaleString()}</b> / {phase.total.toLocaleString()}枚
              </p>
              <div className="cim-reg-bar" aria-hidden>
                <span style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
              </div>
              {phase.hold ? (
                <>
                  <p className="err">止まりました。{phase.hold}</p>
                  <div className="cim-reg-row">
                    <button className="cim-btn is-sub" onClick={() => setPhase({ k: "end", done: phase.done, hold: phase.hold })}>
                      あとにする
                    </button>
                    <button className="cim-btn is-go" onClick={() => run(phase.total, phase.done)}>
                      つづきから
                    </button>
                  </div>
                </>
              ) : (
                <div className="cim-reg-row">
                  <button
                    className="cim-btn is-sub"
                    disabled={phase.stopping}
                    onClick={() => {
                      stop.current = true;
                      setPhase({ ...phase, stopping: true });
                    }}
                  >
                    {phase.stopping ? "止めています…" : "止める"}
                  </button>
                </div>
              )}
            </>
          )}

          {phase.k === "end" && (
            <>
              <p className="cim-reg-big">
                <b>{phase.done.toLocaleString()}</b>枚を登録しました
              </p>
              {failed.length > 0 && (
                <>
                  <p className="cim-reg-fail">登録できなかった写真 {failed.length}枚</p>
                  <ul className="cim-fails">
                    {failed.map((f) => (
                      <li key={f.sha}>
                        <ImportImg sha={f.sha} thumb w={f.tw ?? f.w} h={f.th ?? f.h} eager />
                        <span>
                          <b>{cardWhen(f.day)}</b>
                          {/* 口の字は日本語のときだけ出す（英語の例外は読む人に何も足さない） */}
                          {sayable(f.error) && <i>{sayable(f.error)}</i>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="cim-reg-row">
                {failed.length > 0 ? (
                  <button className="cim-btn is-go" onClick={() => run(failed.length)}>
                    失敗したものだけもう一度
                  </button>
                ) : (
                  <Link prefetch={false} className="cim-btn is-go" href="/cards">
                    あやと島カードを見る
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
