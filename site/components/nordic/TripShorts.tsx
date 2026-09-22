import { NORDIC_SHORTS, shortHref, shortThumb } from "./shorts";

/**
 * この旅のショート動画を、**旅の表紙（`/nordic`）から一覧で出す。**
 *
 * ## なぜ日ページだけでは足りないか
 *
 * ショートは日ごとの面（`/nordic/day/N`）が1本ずつ持っている。だが
 * 旅の表紙から日の面までは1つ押す必要があって、**どの日に出ているかは
 * 開くまで分からない。** 12日ぶんの行を1つずつ開いて確かめるのは、
 * 導線が無いのと同じ（`docs/island-design.md` 6章）。
 *
 * **`/nordic` は毎晩の配信で「見てね」と言われる面。** 短いほうから入る人の
 * 入口は、そこに無いと誰も見つけられない。
 *
 * ## 一覧は、日が読めなかった本も出す
 *
 * `NORDIC_SHORTS` をそのまま並べる。日の面に出るのは題名から日が読めた本だけ
 * だが（`./shorts.ts`）、ここは**この旅のショート全部**。
 * そうしておけば、題名の付け方が変わった日でも**どこからも行けない本**にならない。
 *
 * ## マスに厚みを付けない
 *
 * 一面ぜんぶが押せるマスの並びなので、並びそのものが「押せる」の合図になる
 * （`docs/island-design.md` 3-3 の例外）。押せないマスを1枚も混ぜないこと。
 * 絵の格子は島のショート（`app/css/chain.css` の `.isle-shots`）と同じ1枚を使う。
 * **同じものを2通りに書かない。** 足すのは幅の上限だけ（`.nsh-grid`）。
 *
 * ## 畳まない
 *
 * 溜まる並びは畳む決まりだが（`docs/island-standards.md` 7）、**この並びは
 * 溜まりきる。** 旅は17日で終わるので、増えても17本まで。3列で6段、
 * 6,000px ある面の中の 800px にしかならない。押して開く一手を足すほうが高くつく。
 */
export default function TripShorts() {
  if (NORDIC_SHORTS.length === 0) return null;

  return (
    <section className="panel paper" id="shorts">
      <h2>この旅のショート動画</h2>
      {/* 説明をしない（`docs/island-misses.md` #7）。書くのは「何が見られるか」だけ。 */}
      <p className="nsh-lead">その日の配信を、短くまとめたもの。</p>
      <ul className="isle-shots nsh-grid">
        {NORDIC_SHORTS.map((s) => (
          <li key={s.id}>
            <a href={shortHref(s.id)} target="_blank" rel="noopener noreferrer">
              {/* 絵の `alt` は空にする。**すぐ下に何日目かが字で出ている**ので、
                  題名を入れると読み上げが二重になる。題名そのものは日の面で出す
                  （`components/nordic/DayLog.tsx`）。 */}
              <img src={shortThumb(s.id)} alt="" loading="lazy" width={480} height={360} />
              {/* 日が読めなかった本は、題名をそのまま出す。
                  YouTube に実在する題名なので、絵文字が入っていても直さない
                  （`docs/island-design.md` 1章の唯一の例外）。 */}
              {s.dayN ? (
                <b>{s.dayN}日目</b>
              ) : (
                /* 題名に落ちたときだけ引用になる。「1日目」はこちらが書いた字なので
                   印を付けない（付けると、そこに絵文字を置いても通ってしまう） */
                <b data-quote="title">{s.title}</b>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
