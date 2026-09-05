"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getNordicPhotos } from "@/lib/api";

/**
 * 旅の写真への入口。**1行だけ。**
 *
 * 写真そのものは `/nordic/photos` にある（`docs/nordic-photos.md` 7章）。
 * この面はもう 7.13画面ぶんあって、旅程表の行の中に写真を並べると
 * 旅程表が写真置き場になる。ここに置くのは行き先の1枚だけにする。
 *
 * **1枚も貼られていないあいだは、何も出さない。**
 * 旅はまだ始まっていない。「まだありません」を出すと、
 * 出発前のいちばん読まれる面に、空っぽの区画が1つ増えるだけになる。
 * 読み込み中も出さない（形だけ置くと、結局その場所を取る）。
 */
export default function TripPhotos() {
  const [n, setN] = useState<{ photos: number; days: number } | null>(null);

  useEffect(() => {
    getNordicPhotos()
      .then((r) =>
        setN({
          photos: r.days.reduce((a, d) => a + d.photos.length, 0),
          days: r.days.length,
        }),
      )
      .catch(() => setN(null));
  }, []);

  if (!n || n.photos === 0) return null;

  return (
    <Link className="tile nph-go" href="/nordic/photos">
      <span className="tile-mark">
        <Icon name="photo" size={24} />
      </span>
      <span className="tile-text">
        <b>旅の写真</b>
        <i>
          {n.days}日ぶん{n.photos}枚。その日いた人のキャラクターを入れて持って帰れます
        </i>
      </span>
      <Icon name="right" size={16} className="tile-go" />
    </Link>
  );
}
