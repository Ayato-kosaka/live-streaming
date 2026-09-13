"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import { cityToday, openNow } from "./hours";

/**
 * お店の並び。**1行まるごとが、地図アプリを開く押しどころ。**
 *
 * ## なぜ行の全部を押せるようにするのか
 *
 * あやとは歩きながらこれを見る。名前だけ小さく押せるようにすると、
 * 揺れる手で 14px の字を狙うことになる。**行そのものを押しどころにすれば、
 * 高さぜんぶ（70px 以上）が的になる。**
 *
 * ## いま開いているかは、**画面が出てから**数える
 *
 * 静的書き出しなので、ビルド時に「開いている」を焼くと翌日には嘘になる
 * （`CLAUDE.md`）。だから最初の描画では札を出さず、出てから街の時計で数える。
 *
 * **その日が「今日」でなければ、開閉は言わない。** 9月20日の面を今日開いて
 * 「いま開いてる」と出したら、それは今日の話であってその日の話ではない。
 *
 * ## `"use client"` はここだけ
 *
 * 焼いた JSON（8街 496軒）を読むのは**サーバ側**（`Shops.tsx`）。
 * ここに JSON を読ませると、1街しか出さない面に全街ぶんが乗る
 * （`DailyFood.tsx` と同じ理由）。
 */

export type Row = {
  id: string;
  name: string;
  what: string;
  km: number;
  at: string;
  /** 店が書いている営業時間のもとの字。開閉を数えるのに使う */
  open: string;
  /** 日本語にした営業時間。空なら「時間はわからない」 */
  hours: string;
  href: string;
};

/**
 * 営業時間の字。**時刻の帯（`10:00-17:00`）の途中で折らない。**
 *
 * 折れるところは「-」なので、そのままだと 390px で
 * 「月〜金 10:00-17:00 / 土 10:00-／15:00」のように**時刻がまっぷたつ**になる。
 * 日本語はどこでも折れるので、「日 休／み」も同じように割れる。
 * 行ぜんぶを `nowrap` にすると今度は横へあふれるので、
 * **帯1つずつ**を折れないようにする（帯は11字しかないので、あふれない）。
 */
function Hours({ t }: { t: string }) {
  const parts = t.split(/(\d{1,2}:\d{2}-\d{1,2}:\d{2}|休み|いつでも|毎日)/);
  return (
    <>
      {parts.map((x, i) =>
        /^(\d{1,2}:\d{2}-\d{1,2}:\d{2}|休み|いつでも|毎日)$/.test(x) ? (
          <span key={i} className="nsp-hr">
            {x}
          </span>
        ) : (
          x
        ),
      )}
    </>
  );
}

export default function ShopRows({
  items,
  tz,
  date,
  first = 4,
}: {
  items: Row[];
  /** その街の時計（`Europe/Vilnius` など） */
  tz: string;
  /** この面が指している日。**今日でなければ開閉を言わない** */
  date?: string;
  first?: number;
}) {
  /* 最初の描画では `null`。**サーバとブラウザで同じものを描く**ため。
     時刻を初期値に入れると、書き出したHTMLと食い違って水あわせが崩れる。 */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // 1分ごと。店が閉まる時刻をまたいだら、札もそこで変わってほしい
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const live = now && (!date || cityToday(tz, now) === date);

  return (
    /* はじめに出すのは4軒。**1件が4段ある道具は4件**（`docs/island-standards.md` 7）。
       1行は 名前／何の店か／通り／時間 の4段あるので、6件並べると
       区画が4つで 24軒、それだけで面が3画面ぶん伸びる。 */
    <Longer items={items} first={first} step={4} unit="軒" className="nsps">
      {(s: Row) => {
        const state = live && now ? openNow(s.open, tz, now) : null;
        return (
          <li key={s.id} className="nsp">
            {/* 外の地図アプリへ出る。戻ってこられるように別の窓で開く */}
            <a className="nsp-go" href={s.href} target="_blank" rel="noreferrer">
              <span className="nsp-txt">
                <b className="nsp-name">{s.name}</b>
                <i className="nsp-what">
                  {s.what}
                  <em>中心から {s.km}km</em>
                </i>
                {s.at && <i className="nsp-at">{s.at}</i>}
                {/* 書いていない店に、時間をでっち上げない。
                    嘘の時間は、閉まっている店まで歩かせることになる */}
                <i className={`nsp-open${s.hours ? "" : " is-none"}`}>
                  {s.hours ? <Hours t={s.hours} /> : <span className="nsp-hr">時間はわからない</span>}
                </i>
              </span>
              <span className="nsp-side">
                {state && (
                  <em className={`nsp-live is-${state}`}>
                    {state === "open" ? "いま開いてる" : "いまは閉まってる"}
                  </em>
                )}
                <Icon name="pin" size={22} className="nsp-pin" />
              </span>
            </a>
          </li>
        );
      }}
    </Longer>
  );
}
