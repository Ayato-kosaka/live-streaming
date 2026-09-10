"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import type { NordicLogEntry } from "@/lib/api";
import { loadNordicLog } from "./log";

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
  const [live, setLive] = useState<NordicLogEntry | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadNordicLog().then((l) => {
      if (alive) setLive(l.find((x) => x.day === day) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [day]);

  // 届いたほうが勝つ。写し忘れているあいだ、新しいほうが古い焼き付けに負けない
  const shown = live ?? baked ?? null;

  // 読むものが無い日は、区画そのものを出さない。**誰が見ていても同じ。**
  // 「まだ何も起きていません」と書くと、旅がうまくいっていないように読める。
  if (!shown) return null;

  return (
    <section className="panel paper" id="was">
      <h2>この日、何が起きたか</h2>
      <div className="nday-log">
        {shown.date && <p className="nday-log-when">{when(shown.date)}</p>}
        {/* 改行のまま出す。2〜3行で書くものなので、つなげると読めない */}
        {shown.body.split("\n").map((ln, i) => (
          <p key={i}>{ln}</p>
        ))}
        {shown.video && (
          <a
            className="nday-vid"
            href={`https://www.youtube.com/watch?v=${shown.video}`}
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
