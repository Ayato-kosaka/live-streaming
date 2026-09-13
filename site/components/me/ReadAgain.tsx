"use client";

import Icon from "@/components/ui/IconCore";

/**
 * 読みに行けなかったときの1枚。
 *
 * **待っている顔とも、空っぽの顔とも、別のものにする**
 * （`docs/island-standards.md` 10）。灰色の骨は「もうすぐ出る」の意味なので、
 * 出ないものの上に置き続けてはいけないし、「まだ1枚もありません」は
 * 読めた上での 0件のことばで、届かなかった日に言ってよい嘘ではない。
 *
 * 言い回しは板（`/board`）と `/next` にそろえる。**同じ意味のことを
 * 3通りに書かない。** ここに仕組みの説明は置かない。読む人に要るのは
 * 「どうすれば見られるか」だけ（`CLAUDE.md`）。
 */
export default function ReadAgain({
  what,
  onRetry,
  quiet = false,
}: {
  /** 何が読めなかったか。「付箋」「机」のように、その人が見に来たものの名前 */
  what: string;
  onRetry?: () => void;
  /**
   * **同じ面に、押しどころつきの1枚がもう出ているとき。**
   *
   * 電波が細いときは、その面が引くものが**そろって**落ちる。1つずつ
   * 同じ札を出すと、「少し待ってから、もう一度。」と同じボタンが縦に並ぶ。
   * 上の1枚を押せばこちらも読み直るので、ここは**何が欠けているか**だけ言う。
   */
  quiet?: boolean;
}) {
  if (quiet)
    return (
      <div className="blank is-off">
        <b>いま、{what}を読みに行けなかった</b>
      </div>
    );
  return (
    <div className="blank is-off">
      <b>いま、{what}を読みに行けなかった</b>
      <p>少し待ってから、もう一度。</p>
      {onRetry && (
        <button className="blank-go" onClick={onRetry}>
          もう一度よみこむ
          <Icon name="refresh" size={14} />
        </button>
      )}
    </div>
  );
}

/** 紙1枚ぶんで置くとき（面がまるごとこれ1枚になる場所）。 */
export function ReadAgainPanel(p: { what: string; onRetry: () => void }) {
  return (
    <section className="panel paper">
      <ReadAgain {...p} />
    </section>
  );
}

/**
 * 例外から、**画面に出してよい字だけ**を取り出す。
 *
 * 口が投げてくるのは `TypeError: Failed to fetch` か `500 {"error":…}` で、
 * どちらも**読む人に何も足さない英語**。旅先でこれが出たところで、
 * 打ち直すのか待つのかが分からない。日本語で言えるもの
 * （`new Error("ログインしなおしてください")` のような、こちらが書いた字）
 * だけ通して、あとは落とす。**言えないなら黙る。**
 */
export function sayable(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return /[ぁ-んァ-ヶ一-龯]/.test(m) ? m.slice(0, 90) : "";
}

/** 取りに行っている最中の灰色。**読めなかったときには使わない。** */
export function Waiting() {
  return (
    <div className="wait is-row" aria-hidden>
      <span />
      <span />
    </div>
  );
}

/** 上と同じものを、紙1枚ぶんで。 */
export function WaitingPanel() {
  return (
    <section className="panel paper">
      <Waiting />
    </section>
  );
}
