"use client";

import { useState } from "react";
import { BG_MYMAPS, BG_SPOTS } from "@/content/bulgaria";

/**
 * ソフィアの地図。**Google マイマップの埋め込み。**
 *
 * ## なぜマイマップか（2026-11-13・あやと）
 *
 * > Googleマップのマイマップを使って、それをブログに埋め込んだりするのはOKらしい。
 * > ちょっと今のやつGoogleマップと違って見慣れてなくて見にくいなって思ってて。
 *
 * 1枚目は OSM の絵に日本語の札を重ねたもので、**字は読めるが見慣れない**という
 * 指摘がそこに当たっていた。マイマップなら**本物の Google マップのまま**、
 * こちらのピンが載る。**鍵も請求先も要らない**——Google 自身が「埋め込む」を
 * 用意しているので、スクショを貼る案で踏みかけたグレーも踏まない。
 *
 * 作りかたと作り直しかたは `docs/mymaps.md`。id は `BG_MYMAPS`（焼き込み）。
 *
 * ## 最初の1タップまで、地図に触らせない
 *
 * **スマホで地図がページのスクロールを飲む。** 指を置いた所がたまたま地図だと、
 * 下へ送るつもりが地図が動く。節が3つあるので、読む人は3回これを踏む。
 *
 * だから**覆いを1枚かけておいて、押されたときだけ外す。** 押すまでは地図は
 * 絵として見えていて（読むぶんには足りる）、動かしたくなった人だけが押す。
 *
 * ## 下まで来てから読む
 *
 * 地図1枚が Google の地図を丸ごと読む。3枚を最初の描画で読むと、スマホで重い。
 * `loading="lazy"` で、画面に入ってから読む。
 *
 * ## 遠いものは、地図の下にも名前で出す
 *
 * マイマップは引けるので**遠いものもピンにしてある**が、引くと中心が潰れる。
 * リラ修道院は62km 先で、同じ縮尺で見ると街のピンが団子になる。
 * **中心から何km かは、字で読めたほうが早い**ので、名前と距離の札を別に置く。
 *
 * ## この箱からは、絵が出ない
 *
 * 撮ると地図の枠が空で写る（`CLAUDE.md`「このサンドボックスから出られない先」）。
 * **壊れていると読み違えない。** 本番では出る。
 */
export default function BgMyMap({ which }: { which: "see" | "eat" | "buy" }) {
  const m = BG_MYMAPS.find((x) => x.which === which);
  const [live, setLive] = useState(false);
  if (!m) return null;

  const far = which === "see" ? BG_SPOTS.filter((s) => s.far > 0) : [];

  return (
    <figure className="bgmm">
      <div className={`bgmm-box${live ? " is-live" : ""}`}>
        <iframe
          /* **`ll` と `z` を必ず渡す。** 渡さないとマイマップは「全部のピンが
             入る縮尺」で開く。リラ修道院が62km 先にあるので、見たいものの地図が
             県ごと写って、中心部のピンが点の塊になる（2026-11-13 に実測） */
          src={`https://www.google.com/maps/d/embed?mid=${m.mid}&hl=ja&ll=${m.ll}&z=${m.z}`}
          title={m.title}
          loading="lazy"
          /* **押されるまで Tab の対象にしない。** 中に入ると Google の地図の
             操作子が何十個も並んでいて、Tab がそこから出てこない——
             その先のリンク（島へ戻る・足元の扉）に一生たどり着かなくなる
             （`reachkeys` が17件で捕まえた）。押したあとは対象に戻す。
             動かすと決めた人には、中の操作子が要る */
          tabIndex={live ? 0 : -1}
          /* 地図が外へ出ていく道を持たないようにする。読むのと動かすのだけ */
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {!live && (
          <button type="button" className="bgmm-tap" onClick={() => setLive(true)}>
            <span>地図を動かす</span>
          </button>
        )}
      </div>
      <figcaption>
        {m.pins}か所。ピンを押すと名前と説明が出ます
      </figcaption>

      {far.length > 0 && (
        /* **中心から離れているもの。** 地図の上にも在るが、引かないと見えない。
           名前と距離の組を1つずつの札にして、押せば本物の Google マップが開く */
        <ul className="bgfar">
          {far.map((f) => (
            <li key={f.name}>
              <b>{f.name}</b>
              <i>中心から {f.far}km</i>
              <a
                href={f.maps}
                target="_blank"
                rel="noreferrer"
                aria-label={`Google マップで開く（${f.name}）`}
              >
                マップ
              </a>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
