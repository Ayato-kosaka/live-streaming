"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/IconCore";
import { useAuth, withRead } from "@/lib/auth";
import { getImport } from "@/lib/cardImport";
import "./importDoor.css";

/**
 * `/cards/import` への入口。**あやとにだけ出る**（呼ぶ側が `useOwner` で見ている）。
 *
 * 選ぶ写真が待っている回があるときだけ、数を添えて目立たせる。
 * 無いときは貼る道具の下に小さく1行。**数が読めなかったときも小さい1行**
 * ——「0枚」とは言わない（`docs/island-standards.md` 10）。
 */
export default function ImportDoor() {
  const { token } = useAuth();
  /** 選ぶのを待っている枚数（候補と、まだ答えていない認識合わせ）。読めていなければ undefined */
  const [waiting, setWaiting] = useState<number | undefined>(undefined);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const t = await withRead(token());
        if (!t) return;
        const got = await withRead(getImport(t), 30000);
        if (gone) return;
        setWaiting(
          got.items.filter(
            (i) =>
              i.status === "candidate" ||
              i.status === "failed" ||
              (i.status === "calib" && !i.calibAnswer),
          ).length,
        );
      } catch {
        /* 読めなかったら、小さい1行のまま */
      }
    })();
    return () => {
      gone = true;
    };
  }, [token]);

  if (waiting && waiting > 0)
    return (
      <p className="cim-door">
        <Link prefetch={false} className="blank-go" href="/cards/import">
          取り込んだ写真 {waiting.toLocaleString()}枚をえらぶ
          <Icon name="right" size={15} />
        </Link>
      </p>
    );
  return (
    <p className="cim-door">
      <Link prefetch={false} className="cim-door-quiet" href="/cards/import">
        写真をまとめて登録
        <Icon name="right" size={13} />
      </Link>
    </p>
  );
}
