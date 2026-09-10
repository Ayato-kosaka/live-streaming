"use client";

import Icon from "@/components/ui/Icon";
import ReadAgain from "@/components/me/ReadAgain";
import { useNordicLogState } from "./log";

/**
 * その日に、何が起きたか。**読むところ。**
 *
 * ## 書く口はここに無い
 *
 * 前はこの下にあやとだけの書き込み欄があった。**外した**（2026-09-10）。
 * あやとの言葉:「この欄、要らないかも。秘書にその日あったこと連絡するので、
 * そこから綺麗にして焼いてもらうのが良いと思う。」
 *
 * ヒッチハイクの17日間は、車の中と国境と山の中にいる。スマホの親指で
 * web のフォームに打つより、その日あったことを一言送るほうが速い。
 * 送られた文を整えて入れる道は先からある
 * （`python/admin/nordic_log.py` を「管理スクリプトを実行」から）。
 * **書く口が2つあると、片方が必ず古くなる。**
 *
 * ## 読めなかったことを、「まだ書いていません」に倒さない
 *
 * 旅の最中は電波の細いところを通る。読めなかった日に「まだ書いていません。」
 * と言い切ると、**書いてあるものを無いことにする**
 * （`docs/island-standards.md` 10、#34 #36）。読めたかどうかまで
 * `./log` から受け取って、読めなかったらそう言って読み直す道を出す。
 *
 * ## 焼き付けた正本との関係
 *
 * `NORDIC_LOG` は残してある。旅が終わったら Firestore の中身をここへ写して、
 * 以後は静的に配る（`docs/nordic-depart.md`）。読み返されるのは旅のあとの
 * ほうが長いので、そのころには API に頼らないほうがいい。
 * 両方あるときは**届いたほうが勝つ**。写し忘れているあいだも、
 * 新しく入ったものが古い焼き付けに負けない。
 */

/** 「2026-09-14」→「9月14日(月)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

export default function DayLog({
  day,
  baked,
}: {
  /** 旅程表の行の id（`day-1` `day-depart`）。**変えない。** */
  day: string;
  /** Git に焼いてあるぶん。届かなかったときはこちらを出す */
  baked?: { date?: string; body: string; video?: string };
}) {
  /* 読めたかどうかまで持つ（`./log`）。**「読めなかった」を「まだ書いて
     いません」に倒さない**（`docs/island-standards.md` 10、#34 #36）。 */
  const { log, read, reload } = useNordicLogState();
  const live = read === "ok" ? log.find((x) => x.day === day) ?? null : null;

  // 届いたほうが勝つ。写し忘れているあいだ、新しいほうが古い焼き付けに負けない
  const shown = live ?? baked ?? null;

  /* 読みに行けなかった。**焼いてあるぶんは出せるが、「まだ書いていません」
     とは言えない。** ここで黙ると、山の中で電波が切れた日に、書いてある
     はずのものが「無かったこと」になる。 */
  if (read === "down")
    return (
      <section className="panel paper" id="was">
        <h2>この日、何が起きたか</h2>
        {shown && <Written entry={shown} />}
        <ReadAgain what="その日の話" onRetry={reload} />
      </section>
    );

  // 読むものが無い日は、区画そのものを出さない。**誰が見ていても同じ。**
  // 「まだ何も起きていません」と書くと、旅がうまくいっていないように読める。
  // まだ返事を待っているあいだ（`wait`）も、焼いてあるぶんが無ければ出さない。
  if (!shown) return null;

  return (
    <section className="panel paper" id="was">
      <h2>この日、何が起きたか</h2>
      <Written entry={shown} />
    </section>
  );
}

/** 書かれたもの。読めたぶんと、焼いてあるぶんを同じ形で出す。 */
function Written({ entry }: { entry: { date?: string; body: string; video?: string } }) {
  return (
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
  );
}
