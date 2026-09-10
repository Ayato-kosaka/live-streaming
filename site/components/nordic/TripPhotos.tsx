"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getNordicPhotos } from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";

/**
 * 旅の写真への入口。**1行だけ。**
 *
 * 写真そのものはあやと島カード（`/cards`）にある。この面はもう
 * 7.13画面ぶんあって、旅程表の行の中に写真を並べると旅程表が写真置き場に
 * なる。ここに置くのは行き先の1枚だけにする。
 *
 * **行き先は `/cards`。** 旅の写真の面は 2026-09-10 にカードへ寄せた
 * （`components/cards/CardWall.tsx`）。ここを直し忘れると、島の中で
 * いちばん人の通る道だけが、送られるだけの古い URL を指したままになる。
 *
 * **1枚も貼られていないあいだは、何も出さない。**
 * 旅はまだ始まっていない。「まだありません」を出すと、
 * 出発前のいちばん読まれる面に、空っぽの区画が1つ増えるだけになる。
 * 読み込み中も出さない（形だけ置くと、結局その場所を取る）。
 *
 * ## 読めなかったときは、**入口を消さない**（#34 #36）
 *
 * ここは `catch(() => setN(null))` で、読めなかった日を「0枚」と同じ
 * 「何も出さない」に倒していた。旅がはじまって写真が貯まるほど重くなる嘘で、
 * **貼った本人が「入らなかった」と思う**し、見に来た人は入口ごと見失う。
 *
 * 数は読めなかったのだから**数は言わない。行き先は変わらないので札は出す。**
 * ここに「読みに行けなかった」の箱は置かない。押して着く先（`/cards`）が
 * 自分の口で同じことを言うので、いちばん読まれる面で2度言うことになる。
 * 押されなくても電波が戻れば黙って読み直して、数のあるほうに戻る。
 */
export default function TripPhotos() {
  const [read, setRead] = useState<Read>("wait");
  const [photos, setPhotos] = useState(0);

  useEffect(() => {
    let alive = true;
    let miss = 0;
    let down = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      /* **返事が来ないのも「読めなかった」**（`withRead` が12秒で見切る）。
         細い電波では、断られるより固まるほうが多い。 */
      withRead(getNordicPhotos())
        .then((r) => {
          if (!alive) return;
          setPhotos((r?.days ?? []).reduce((a, d) => a + (d.photos?.length ?? 0), 0));
          setRead("ok");
          down = false;
          miss = 0;
        })
        .catch(() => {
          if (!alive) return;
          setRead("down");
          down = true;
          /* 押されるまで待たない。間隔を倍にしながら30秒おきまで落とす */
          miss += 1;
          timer = setTimeout(run, Math.min(2000 * 2 ** (miss - 1), 30000));
        });
    };
    run();

    /* 電波が戻った合図。**画面を開き直させない。** 読めているときは
       行かない——画面に戻るたびに往復が増える。 */
    const wake = () => {
      if (!down) return;
      if (timer) clearTimeout(timer);
      miss = 0;
      run();
    };
    const back = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", back);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  // 読めた上での0枚だけが「まだ何も無い」。読めていないあいだは何も言わない
  if (read === "wait" || (read === "ok" && photos === 0)) return null;

  return (
    <Link className="tile nph-go" href="/cards">
      <span className="tile-mark">
        <Icon name="photo" size={24} />
      </span>
      {/* **札の名前は、着く先の名前と同じにする**（`docs/island-ux.md` 4.3）。
          「旅の写真」で送って「あやと島カード」に着くと、着いた人は
          違う面に飛ばされたと思う。 */}
      <span className="tile-text">
        <b>あやと島カード</b>
        {/* 枚数は**読めたときだけ**言う。読めていない数を書くと、
            0枚と同じ絵になる（`docs/island-standards.md` 10）。 */}
        <i>
          その日の写真{read === "ok" ? `${photos}枚` : ""}。キャラクターを入れて持って帰れます
        </i>
      </span>
      <Icon name="right" size={16} className="tile-go" />
    </Link>
  );
}
