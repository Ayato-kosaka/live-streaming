"use client";

import { useState } from "react";
import Icon from "@/components/ui/IconCore";

/**
 * 聞いてみる一言を、押したら写す。
 *
 * **ここだけがブラウザで動く。** `DailyFood.tsx` から切り出してあるのは、
 * あちらに `"use client"` を付けると `content/nordicFood.ts` が**まるごと**
 * 束に入るため。実測で、1国しか出さない面に**6カ国 40品ぶん**が乗って、
 * route の JS が 72KB（gzip 27KB）だった。旅の面は車の中で、電波の細い
 * ところで開く。**受け取るのは、押す一言ひとつでいい。**
 *
 * 写せなかったときは、黙って変わらない。**「うつしました」と出てから
 * 貼れないのが、いちばん困る。**
 */
export default function AskCopy({ say }: { say: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="nfd-copy"
      onClick={() => {
        const done = navigator.clipboard?.writeText(say);
        if (!done) return;
        done.then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {/* 印は `/me` の「URL をうつす」と同じ。島の中で、写す動きの顔を1つにする。 */}
      <Icon name="check" size={16} />
      {copied ? "うつしました" : "この一言をうつす"}
    </button>
  );
}
