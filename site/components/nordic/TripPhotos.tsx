"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getNordicPhotos } from "@/lib/api";

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
 */
export default function TripPhotos() {
  const [n, setN] = useState<{ photos: number } | null>(null);

  useEffect(() => {
    getNordicPhotos()
      .then((r) =>
        setN({ photos: r.days.reduce((a, d) => a + d.photos.length, 0) }),
      )
      .catch(() => setN(null));
  }, []);

  if (!n || n.photos === 0) return null;

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
        <i>
          その日の写真{n.photos}枚。キャラクターを入れて持って帰れます
        </i>
      </span>
      <Icon name="right" size={16} className="tile-go" />
    </Link>
  );
}
