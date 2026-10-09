/**
 * スタンプのことばの1枚を、**出すか出さないか**（#716）。
 *
 * ここだけ別のファイルにしてあるのは、**ブラウザを使わずに毎 PR で
 * 確かめるため**（`site/selftest/stampshow_selftest.mjs`）。
 * `/me` はログインしないと1行も描かないので、この箱のブラウザでは
 * 「選ばれていない人の画面」を開けない。判断だけ外に出しておけば、
 * 絵を描かずに数えられる（`site/selftest/chatdown_selftest.mjs` と同じ手）。
 *
 * ## 何を守っているのか
 *
 * 25人は投げ銭の順位そのもの（`docs/island-money.md`「実額は視聴者には
 * 一切見せない」）。だから**選ばれていない人の画面には、1文字も出さない。**
 * 「あなたは選ばれていません」はもちろん、読み込み中の灰色の骨も
 * 「読みに行けなかった」の札も出さない——そこに字が出ると、
 * 選ばれていない人の画面にも同じ字が出る。
 *
 * ## それでも、読めなかったことを0にはしない
 *
 * `docs/island-standards.md` 10 は「読めていないことを、値0と同じ絵に
 * しない」と言っている。素性を漏らさずに両方を満たせるのは1つだけ——
 * **一度でも自分のぶんが見えた端末だけ**が覚えておいて、次に読めなかった
 * ときに「もう一度よみこむ」を出す。
 *
 * 覚えるのはその人の端末の中だけで、覚えているのは「自分が入っている」
 * という、**その人がもう知っている事実1つ**。他人の端末には1バイトも行かない。
 */

/** 引いた結果。画面の `Bag` から、この判断に要るものだけ。 */
export type Read = "wait" | "ok" | "down";

/** 画面に出すもの。 */
export type Phase =
  /** **何も出さない。** 紙も、灰色の骨も、札も */
  | "nothing"
  /** 「もう一度よみこむ」だけ */
  | "readagain"
  /** ことばを決める1枚 */
  | "panel";

/**
 * 1枚を出すか決める。
 *
 * @param st 引けたか（`wait` / `ok` / `down`）
 * @param picked 入れ物に自分のぶんが在ったか（`st === "ok"` のときだけ意味がある）
 * @param seen **この端末で**一度でも自分のぶんが見えたか
 * @return 画面に出すもの
 */
export function phase(st: Read, picked: boolean, seen: boolean): Phase {
  /* 読めなかった。**一度も見えたことのない端末には、何も出さない。**
     選ばれていない人の画面に字が出ないのは、ここで決まっている。 */
  if (st === "down") return seen ? "readagain" : "nothing";
  /* 待っているあいだも出さない。灰色の骨も「何かが来る」と言ってしまう。 */
  if (st === "wait") return "nothing";
  return picked ? "panel" : "nothing";
}

/**
 * 開いたときに欄へ入れておくことば。
 *
 * **まだ決めていない人には、提案の1本目を入れておく。** 空の欄だけ出すと、
 * 提案を見たことにならない（押せば消せるし、書きなおせる）。
 * 提案が1本も無い人には空の欄1つ——**「提案が無い」を字で説明しない。**
 *
 * @param lines 本人が決めたことば
 * @param suggested 提案
 * @return 欄に入れることば（**必ず1つ以上**）
 */
export function startLines(lines: string[], suggested: string[]): string[] {
  if (lines.length) return lines;
  const first = suggested.find((s) => !!s && !!s.trim());
  return [first ?? ""];
}
