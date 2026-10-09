"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMyStampLine,
  saveMyStampLine,
  type MyStampLine,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/ui/IconCore";
import ReadAgain, { sayable } from "./ReadAgain";
import { leadKey, phase, startLines } from "./stampShow";

/**
 * スタンプのことば（#716）。**選ばれた本人にだけ、1枚出る。**
 *
 * あやとの言葉（2026-10-09）:
 *
 * > どのセリフにするか提案して言い直してもらおう。
 * > 追加も可能という仕様で話してるけど漏れてる？
 *
 * やれることは3つ。**提案を見る / 書きなおす / 足す。**
 *
 * ## 選ばれていない人の画面には、1つも出さない
 *
 * 25人は投げ銭の順位そのもの（`docs/island-money.md`「実額は視聴者には
 * 一切見せない」）。「あなたは選ばれていません」を出すと、出した時点で
 * **その人に順位を知らせる**ことになる。やってはいけないほうの親切。
 *
 * **読み込み中も、読めなかったときも出さない。** そこに字を出すと、
 * 選ばれていない人の画面にも同じ字が出る。
 *
 * ## ただし、読めなかったことを黙って0にはしない
 *
 * `docs/island-standards.md` 10 は「読めていないことを、値0と同じ絵に
 * しない」と言っている。素性を漏らさずにそれを満たせるのは1つだけ——
 * **一度でも自分のぶんが見えた端末だけ**が覚えておいて、次に読めなかった
 * ときに「もう一度よみこむ」を出す。
 *
 * 覚えるのは**その人の端末の中だけ**で、覚えているのは「自分が入っている」
 * という、その人がもう知っている事実1つ。他人の端末には1バイトも行かない。
 *
 * ## 画面に仕組みを書かない
 *
 * **どういう条件で選ばれたかは1文字も書かない**（書いた時点で順位表になる）。
 * 提案がどこから来たかも書かない。書いてよいのは
 * 「その人がこれから何をするか／何が起きるか」だけ
 * （`docs/island-standards.md` 6）。
 */

/** 一度でも自分のぶんが見えたか。**その人の端末の中だけ。** */
const KEY = "ayato-island-stampline";

/**
 * この端末で、一度でも自分のぶんが見えたか。
 * @return {boolean} 見えたことがあるなら true
 */
function seenBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    /* 私用の窓・控えを止めている・撮っているあいだは投げる。
       **読めなくても画面は成り立つ**（出ないだけ）。 */
    return false;
  }
}

/**
 * 見えたことを控える。
 * @param {boolean} on 入っているか
 */
function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* 控えられなくても構わない。**次に読めなかった回で札が出ないだけ。** */
  }
}

/** 引いた結果。**待っている・入っている・入っていない・読めなかったの4つ。** */
type Bag =
  | { st: "wait" }
  | { st: "ok"; mine: MyStampLine }
  | { st: "down" };

export default function StampLine() {
  const { user, token } = useAuth();
  const [bag, setBag] = useState<Bag>({ st: "wait" });
  /** 打ちかけのことば。**届いた1回だけ入れて、あとは手元の字が勝つ。** */
  const [lines, setLines] = useState<string[]>([]);
  const filled = useRef(false);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [why, setWhy] = useState("");

  const load = useCallback(async () => {
    const t = await token();
    if (!t) return setBag({ st: "down" });
    try {
      const mine = await getMyStampLine(t);
      setBag({ st: "ok", mine });
      remember(mine.picked);
      if (mine.picked && !filled.current) {
        filled.current = true;
        /* **まだ決めていない人には、提案の1本目を入れておく。**
           空の欄だけ出すと、提案を見たことにならない。
           押せば消せるし、書きなおせる。 */
        setLines(startLines(mine.lines, mine.suggested));
      }
    } catch {
      setBag({ st: "down" });
    }
  }, [token]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) return null;

  /* **出すか出さないかは `stampShow.ts` が決める**（判断を2か所に置かない。
     毎 PR で回る見張りは `site/selftest/stampshow_selftest.mjs`）。 */
  const show = phase(
    bag.st,
    bag.st === "ok" && bag.mine.picked,
    seenBefore(),
  );
  if (show === "nothing") return null;
  if (show === "readagain")
    return <ReadAgain what="スタンプのことば" onRetry={load} />;
  /* ここから先は `panel`。上の判断がそう言ったので、必ず入っている */
  if (bag.st !== "ok" || !bag.mine.picked) return null;

  const { suggested, max, maxLen } = bag.mine;
  /** 置ける残り。**上限そのものは画面に書かない**（仕組みの説明になる） */
  const room = max - lines.length;
  /** 提案のうち、まだ入れていないもの */
  const rest = suggested.filter((s) => !lines.includes(s));

  const put = (i: number, v: string) =>
    setLines((was) => was.map((t, n) => (n === i ? v.slice(0, maxLen) : t)));

  const add = (v: string) =>
    setLines((was) => (was.length >= max ? was : [...was, v]));

  const drop = (i: number) => setLines((was) => was.filter((_, n) => n !== i));

  const save = async () => {
    const t = await token();
    if (!t) {
      setState("error");
      setWhy("");
      return;
    }
    setState("saving");
    setWhy("");
    try {
      /* **空の欄は送らない。** 落とすのは口の側でもやっているが、
         押した人に「送ったものが返ってこない」を見せないため先に落とす。 */
      const sent = lines.map((t2) => t2.trim()).filter((t2) => !!t2);
      const got = await saveMyStampLine(t, sent);
      setBag({ st: "ok", mine: got });
      if (got.picked) setLines(got.lines);
      setState("done");
    } catch (e) {
      setState("error");
      setWhy(sayable(e));
    }
  };

  const nothing = lines.every((t) => !t.trim());

  return (
    <section className="panel paper slp">
      <h2>スタンプのことば</h2>
      {/* 何が起きるかだけ。どうやって選んだかは書かない。
          **提案が1本も出なかった人には、書きなおす話をしない**——
          何も無いところを指すことになる（`stampShow.ts` の `leadKey`）。 */}
      <p className="slp-lead">
        {leadKey(suggested, lines) === "rewrite" ?
          "あなたのスタンプに、このことばが入ります。ちがうと思ったら、書きなおしてください。" :
          "あなたのスタンプに入れることばを、書いてください。"}
      </p>

      <ul className="slp-list">
        {lines.map((t, i) => (
          <li key={i}>
            <label className="slp-row">
              {/* 番号は2本以上あるときだけ。**1本しかない欄に「1」は
                  要らない**し、付けると「1本目が何か特別なもの」に読める */}
              {lines.length > 1 && <span className="slp-no">{i + 1}</span>}
              <input
                value={t}
                onChange={(e) => put(i, e.target.value)}
                maxLength={maxLen}
                placeholder="ことばを書く"
                /* 1本目だけ、開いた直後に書きなおせるようにしておく。
                   **勝手に字は消さない**（`select` もしない）。 */
                autoComplete="off"
              />
              <i className="slp-len">
                {t.length}/{maxLen}
              </i>
            </label>
            {/* 1本しかないときは消せない。**空の紙にしない**
                （消したあとに何をするかが無くなる） */}
            {lines.length > 1 && (
              <button className="slp-drop" onClick={() => drop(i)}>
                けす
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* 提案のうち、まだ入れていないもの。**押すと足される。**
          ここが「言い直してもらう」の入口で、字そのものが押しどころ */}
      {rest.length > 0 && room > 0 && (
        <div className="slp-more">
          <span className="slp-more-t">ほかの言いかたを入れる</span>
          <div className="slp-chips">
            {rest.slice(0, room).map((s) => (
              <button key={s} className="slp-chip" onClick={() => add(s)}>
                <Icon name="plus" size={12} />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="slp-foot">
        {room > 0 && (
          <button className="slp-add" onClick={() => add("")}>
            <Icon name="plus" size={13} />
            じぶんで書く
          </button>
        )}
        <button
          className="me-save"
          onClick={save}
          disabled={state === "saving" || nothing}
        >
          {state === "saving" ? "おくっています…" : "これでいく"}
        </button>
      </div>

      {state === "done" && <p className="me-ok">うけとりました。</p>}
      {state === "error" && (
        <p className="err">{why || "おくれませんでした。もう一度ためしてみてください。"}</p>
      )}
    </section>
  );
}
