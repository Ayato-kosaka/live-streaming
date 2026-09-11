import Icon from "@/components/ui/Icon";
import type { DayLog as Entry } from "@/content/nordic";

/**
 * その日に、何が起きたか。**焼いてあるものを、そのまま出す。**
 *
 * ## なぜ Firestore をやめたか
 *
 * ここは長いあいだ、画面が出てから `GET /island-api/nordic/log` を読んで、
 * あやとでログインしていれば書く欄まで出していた。**あやと本人が旅先の
 * スマホから自分で打つ**ための作りで、commit と Hosting の手動起動は
 * 道の上では回らない、というのがその理由だった。
 *
 * **書く人が変わった。** いまはあやとが一言送ってきたものを、受け取った側が
 * `content/nordic.ts` の `NORDIC_LOG` に焼いて本番へ出す。打つ本人が
 * ヒッチハイクをしていないので、commit も deploy も回る。
 * 経由する先が1つ減って、読むほうも往復が1本減った。
 *
 * ## 読む人のための面は残す
 *
 * 書く口が消えても、**その日に何があったかを読むところは要る。**
 * よていだけの旅程表は出発前にしか読む理由がなくて、旅が終わったあとも
 * `/nordic` が開かれる理由はここにしかない。
 */

/** 「2026-09-14」→「9月14日(月)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

export default function DayLog({ entry }: { entry?: Entry }) {
  // 書かれていない日は、区画そのものを出さない。
  // 「まだ何も起きていません」と書くと、旅がうまくいっていないように読める。
  if (!entry) return null;

  return (
    <section className="panel paper" id="was">
      <h2>この日、何が起きたか</h2>
      <div className="nday-log">
        {entry.date && <p className="nday-log-when">{when(entry.date)}</p>}
        {/* 改行のまま出す。2〜3行で書くものなので、つなげると読めない */}
        {entry.body.split("\n").map((ln, i) => (
          <p key={i}>{ln}</p>
        ))}
        {entry.video && (
          <a
            className="nday-vid"
            href={`https://www.youtube.com/watch?v=${entry.video}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            その日の配信を見る
            <Icon name="external" size={14} />
          </a>
        )}
      </div>
    </section>
  );
}
