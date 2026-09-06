"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Wheel from "./Wheel";
import {
  THEMES,
  type WheelTheme,
  flag,
  num,
  parseCandidates,
} from "./wheel";
import { getRoulette, type RouletteSession } from "@/lib/api";
import { RL_UI } from "@/content/roulette";

/** 表示側が読みにいく間隔。回っているあいだは読まない。 */
const POLL_MS = 1000;
/** 一覧に出す上限。これを超えたぶんは「ほか◯件」にまとめる。 */
const LIST_MAX = 8;

/**
 * ルーレットの表示側。**スマホ版 OBS が開く面**（#164）。
 *
 * ## 2通りの開きかたを、両方とも受ける
 *
 * | URL | どう動くか |
 * | --- | --- |
 * | `?s=<セッション>` | コントローラーから回る。当たりはサーバーが決める |
 * | `?candidates=…` | **いままでどおり。** 押すと回る。当たりはこの場で決まる |
 *
 * **古い URL を落とさない。** `candidates` `duration` `turns` `theme`
 * `sound` `auto` `resultDuration` の7つは、写した元とまったく同じに読む。
 * 急に全部が変わると、その日の配信が止まる。
 *
 * ## 回り始めは「時刻」で合わせる
 *
 * コントローラーから来るのは「いつ回り始めたか」で、「いま回れ」ではない。
 * OBS を途中で読み込み直しても、同じところで止まる。サーバーの時計と
 * 端末の時計のずれは、読みにいった返事に入っている `now` で直す。
 */
export default function Display() {
  const sp = useSearchParams();
  const sid = sp.get("s");

  /* ---- URL だけで回すぶん（いままでどおり） ---- */
  const urlLabels = parseCandidates(sp);
  const urlTheme = sp.get("theme");
  const url = {
    labels: urlLabels,
    duration: num(sp.get("duration"), 4.8, 1, 15),
    turns: Math.round(num(sp.get("turns"), 6, 2, 15)),
    theme: (urlTheme && (THEMES as string[]).includes(urlTheme)
      ? urlTheme
      : "classic") as WheelTheme,
    sound: flag(sp.get("sound"), true),
    auto: flag(sp.get("auto"), false),
    resultDuration: num(sp.get("resultDuration"), 0, 0, 30),
  };

  /* ---- コントローラーから回すぶん ---- */
  const [ses, setSes] = useState<RouletteSession | null>(null);
  /** サーバーの時計から、この端末の時計を引いたもの */
  const skew = useRef(0);
  /** 読みにいく輪の中から、いまの状態を見るための控え */
  const now = useRef<RouletteSession | null>(null);
  now.current = ses;

  useEffect(() => {
    if (!sid) return;
    let gone = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      /* 回っているあいだは読みにいかない。読むと、そのたびに
         輪ぜんぶを作り直すことになる（回すのは rAF がやっている）。 */
      const s = now.current;
      const from = s?.spunAt ? s.spunAt - skew.current : null;
      const turning =
        from !== null &&
        Date.now() >= from - 200 &&
        Date.now() < from + (s?.duration ?? 15) * 1000 + 500;
      if (!turning) {
        try {
          const r = await getRoulette(sid);
          if (gone) return;
          skew.current = r.now - Date.now();
          // 中身が変わっていないなら state を触らない。触ると描き直す
          setSes((p) =>
            p && p.updatedAt === r.session.updatedAt ? p : r.session,
          );
        } catch {
          /* 電波が切れただけ。出ているものはそのまま置いておく */
        }
      }
      if (gone) return;
      t = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [sid]);

  const items = ses?.items ?? [];
  const spinAt = ses?.spunAt ? ses.spunAt - skew.current : null;
  const duration = ses?.duration ?? 15;
  /** 回り始めたら、これから回すものの一覧を引っこめる */
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (spinAt === null) {
      setHidden(false);
      return;
    }
    const t = setTimeout(() => setHidden(true), Math.max(0, spinAt - Date.now()));
    return () => clearTimeout(t);
  }, [spinAt]);

  /* ---- URL だけのときの、押して回す ---- */
  const [tapAt, setTapAt] = useState<number | null>(null);
  const [tapIndex, setTapIndex] = useState<number | null>(null);
  const spin = useCallback(() => {
    if (!url.labels.length) return;
    setTapIndex(Math.floor(Math.random() * url.labels.length));
    setTapAt(Date.now());
  }, [url.labels.length]);
  const autoRef = useRef(spin);
  autoRef.current = spin;
  const auto = url.auto && !sid && url.labels.length > 0;
  useEffect(() => {
    if (!auto) return;
    // 写した元と同じ 650ms。開いてすぐ回ると、絵が出る前に回り始める
    const t = setTimeout(() => autoRef.current(), 650);
    return () => clearTimeout(t);
  }, [auto]);
  /* 結果を出す秒数が決まっているときは、消えたら「押して」の字を戻す。
     写した元がそうなっている（出しっぱなしの既定では戻らない）。 */
  useEffect(() => {
    if (tapAt === null || !url.resultDuration) return;
    const t = setTimeout(
      () => setTapAt(null),
      (url.duration + url.resultDuration) * 1000 + 200,
    );
    return () => clearTimeout(t);
  }, [tapAt, url.resultDuration, url.duration]);

  /* ---- どちらの形で出すか ---- */
  if (sid) {
    const won = ses?.result ? items.find((x) => x.id === ses.result) : null;
    return (
      <>
        {items.length === 0 ? (
          <div className="rl-card-flat">
            <span className="rl-standby-name">{RL_UI.standby}</span>
          </div>
        ) : (
          <Wheel
            labels={items.map((x) => x.label)}
            theme={(THEMES as string[]).includes(ses?.theme ?? "")
              ? (ses?.theme as WheelTheme)
              : "classic"}
            duration={duration}
            turns={ses?.turns ?? 10}
            sound={ses?.sound !== false}
            spinAt={spinAt}
            spinIndex={ses?.resultIndex ?? null}
            resultFoot={
              won && !won.byHand && (won.name || won.icon) ? (
                <span className="rl-by">
                  {won.icon ? <img src={won.icon} alt="" /> : null}
                  {won.name}
                </span>
              ) : null
            }
          />
        )}
        {!hidden && items.length > 0 && (
          <ul className="rl-list">
            {items.slice(0, LIST_MAX).map((it) => (
              <li key={it.id}>
                {/* 手で足したものは、名前とアイコンの欄を空にして字だけ出す。
                    あやとが足したものを、誰かが言ったように見せない（#164）。 */}
                {it.byHand ? (
                  <span className="rl-noface" aria-hidden />
                ) : it.icon ? (
                  <img src={it.icon} alt="" />
                ) : (
                  <span className="rl-noface" aria-hidden />
                )}
                <b>{it.label}</b>
                {!it.byHand && it.name ? <i>{it.name}</i> : null}
              </li>
            ))}
            {items.length > LIST_MAX && (
              <li className="rl-more">ほか {items.length - LIST_MAX} 件</li>
            )}
          </ul>
        )}
      </>
    );
  }

  if (!url.labels.length) {
    return (
      <div className="rl-card-flat">
        <span className="rl-mark" aria-hidden>
          !
        </span>
        <p>URLに候補値を指定してください</p>
        <code>?candidates=1,2,3,4,5,6</code>
      </div>
    );
  }

  return (
    <>
      <Wheel
        labels={url.labels}
        theme={url.theme}
        duration={url.duration}
        turns={url.turns}
        sound={url.sound}
        spinAt={tapAt}
        spinIndex={tapIndex}
        resultDuration={url.resultDuration}
        onTap={spin}
      />
      <p className={`rl-hint${tapAt === null ? "" : " is-off"}`} aria-hidden>
        TAP TO SPIN
      </p>
    </>
  );
}
