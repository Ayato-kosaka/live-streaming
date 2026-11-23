"use client";

import { useState } from "react";
import { presetsIn, readYen, yenProblem, yenText, type TipLimits, type YenProblem } from "./yen";

/**
 * ③ 額とメッセージを決める紙。
 *
 * **額の幅とメッセージの字数は、口から受けた `lim` だけを見る**（数字を画面に書かない）。
 * 幅の外では「たしかめる」を押せない。押せなくても、正はサーバー（外れた額は 400 で断られる）。
 */
export default function TipForm({
  lim,
  who,
  face,
  yen,
  message,
  onYen,
  onMessage,
  onNext,
  fail,
  msgFail,
}: {
  lim: TipLimits;
  /** 島での名前（看板の「じぶんのこと」と同じ字） */
  who: string;
  /** 毎晩入れ直る YouTube の顔。無ければ出さない */
  face?: string | null;
  yen: string;
  message: string;
  onYen: (v: string) => void;
  onMessage: (v: string) => void;
  onNext: () => void;
  /** 口に断られて戻ってきたときの1行 */
  fail?: string | null;
  /** メッセージのほうを直してほしいときの1行（メッセージの欄のすぐ下に出す） */
  msgFail?: string | null;
}) {
  const problem = yenProblem(yen, lim);
  const picked = readYen(yen);
  const left = lim.tipMessageMax - message.length;
  /* 顔が落ちたら外す（旅先の電波では顔の置き場が落ちてくるとは限らない。`MeButton` と同じ） */
  const [noFace, setNoFace] = useState(false);
  return (
    <section className="panel paper tip-paper">
      <h2>いくら投げる？</h2>
      <p className="tip-who">
        {face && !noFace && <img src={face} alt="" onError={() => setNoFace(true)} />}
        <span>
          <b>{who}</b> として投げる
        </span>
      </p>

      <label className="tip-yen" data-bad={problem && problem !== "empty" ? "" : undefined}>
        <span aria-hidden>¥</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          aria-label="投げる額（円）"
          aria-invalid={problem !== null}
          aria-describedby="tip-yen-hint"
          value={yen}
          onChange={(e) => onYen(e.target.value)}
        />
      </label>
      <p id="tip-yen-hint" className="tip-hint" data-bad={problem && problem !== "empty" ? "" : undefined}>
        {sayProblem(problem, lim)}
      </p>

      <div className="tip-presets">
        {presetsIn(lim).map((v) => (
          <button
            key={v}
            type="button"
            className="tip-preset"
            aria-pressed={picked === v}
            onClick={() => onYen(String(v))}
          >
            {yenText(v)}
          </button>
        ))}
      </div>

      <h3>なんて伝える？</h3>
      <textarea
        className="bin tip-msg"
        rows={4}
        maxLength={lim.tipMessageMax}
        placeholder="あやとへのメッセージ"
        aria-label="メッセージ"
        aria-invalid={msgFail ? true : undefined}
        aria-describedby={msgFail ? "tip-msg-fail" : undefined}
        value={message}
        onChange={(e) => onMessage(e.target.value)}
      />
      <p className="tip-left" aria-live="polite">
        {msgFail && (
          <b id="tip-msg-fail" className="tip-msg-fail">
            {msgFail}
          </b>
        )}
        <span>あと {Math.max(0, left).toLocaleString("ja-JP")}字</span>
      </p>

      {fail && <p className="err">{fail}</p>}
      <button type="button" className="bbtn tip-go" disabled={problem !== null} onClick={onNext}>
        たしかめる
      </button>
    </section>
  );
}

/**
 * 額の下の1行。**いつも同じ背で出す**（外れたときだけ字が替わる。打つたびに下が跳ねない）。
 *
 * 上限はふだん言わない。あやとが「上限はなくていい」と決めたので（2026-11-23）、口が返す上限は
 * 支払いの側の上限（¥99,999,999）で、ふつうに打って届く額ではない。**超えたときだけ、何の上限かを添えて言う**
 * （`docs/island-standards.md` 33.2）。
 */
function sayProblem(p: YenProblem | null, lim: TipLimits): string {
  if (p === "shape") return "数字だけで入れてね";
  if (p === "high") return `1回 ${yenText(lim.tipYenMax)} までだよ`;
  return `${yenText(lim.tipYenMin)} から投げられるよ`;
}
