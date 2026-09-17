"use client";

import type { ChatLine } from "@/lib/api";
import type { Read } from "@/lib/auth";
import { RL_UI } from "@/content/roulette";
import Icon from "@/components/ui/IconCore";
import ReadAgain, { Waiting } from "./ReadAgain";

/**
 * 流れてきたコメント。**押すと、回すものに入る。**
 *
 * ## ここが別の部品になっている理由
 *
 * 出し分けが4通りある（読んでいる最中 / 読めた0件 / 読めなかった / 並んでいる）。
 * この4通りを**ログインの壁の向こうを開かずに確かめられる**ようにしたい。
 * `RouletteBox` は Firebase のログインを通らないと1行も描かないので、
 * そこに埋めたままだと「読めなかったときの絵」を誰も見ないまま出すことになる。
 *
 * ## 言ってよいこと
 *
 * | いま | 出るもの |
 * | --- | --- |
 * | まだ1周も読めていない | 骨（もうすぐ出る、の意味） |
 * | 読めた上で0件 | 「まだ来ていません」 |
 * | 読めていない | 「いま、コメントを読みに行けなかった」 |
 * | 配信していない（読めた上で） | 「いま配信していません」 |
 *
 * **「読めていない」と「0件」を同じ絵にしない**
 * （`docs/island-standards.md` 10、`island-misses.md` #117）。
 * 配信の最中にこれを間違えると、コメントが流れているのに
 * 「今夜は誰も注文していない」と読める。
 */
export default function RouletteComments({
  lines,
  live,
  read,
  picked,
  full,
  onPick,
}: {
  lines: ChatLine[];
  /** いま配信しているか。**`null` は「分からない」** */
  live: boolean | null;
  /** コメントを読めているか */
  read: Read;
  /** すでに回すものに入っているコメントの id */
  picked: Set<string>;
  /** 36件でいっぱい。37件目は押せない */
  full: boolean;
  onPick: (line: ChatLine) => void;
}) {
  return (
    <section className="panel paper">
      <h2>流れてきたコメント</h2>
      {/* **一度に1つしか言わない。** 読めていない札と「配信していません」を
          同時に出すと、どちらが本当か読む側に決めさせることになる。
          読めていないのだから、配信しているかどうかは言えない。 */}
      {live === false && read !== "down" && (
        <p className="rc-note">{RL_UI.noLive}</p>
      )}
      {/* 読めていないあいだも、**前に拾ったぶんは消さない。**
          配信中に押す面なので、選べるものを取り上げるほうが困る。 */}
      {read === "down" && <ReadAgain what="コメント" quiet={lines.length > 0} />}
      {lines.length > 0 ? (
        <ul className="rc-lines">
          {lines.map((l) => {
            const on = picked.has(l.id);
            return (
              <li key={l.id}>
                <button
                  className={`rc-line${on ? " is-on" : ""}`}
                  onClick={() => onPick(l)}
                  disabled={!on && full}
                  aria-pressed={on}
                >
                  <span className="rc-tick" aria-hidden>
                    {on && <Icon name="check" size={16} />}
                  </span>
                  {l.icon ? (
                    <img className="rc-face" src={l.icon} alt="" />
                  ) : (
                    <span className="rc-face" aria-hidden />
                  )}
                  <span className="rc-line-t">
                    <b>{l.text}</b>
                    <i>{l.name}</i>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : read === "wait" ? (
        /* まだ1周も読めていない。**骨は「もうすぐ出る」の意味だけに使う** */
        <Waiting />
      ) : read === "ok" && live !== false ? (
        /* 読めた上での0件。**ここだけが「来ていません」と言ってよい場所** */
        <div className="blank">
          <b>まだ来ていません</b>
          <p>{RL_UI.noComments}</p>
        </div>
      ) : null}
    </section>
  );
}
