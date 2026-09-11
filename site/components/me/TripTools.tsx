"use client";

import { useEffect, useRef, useState } from "react";
import { getState, postCurrent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
import { TRIP_PLACES, tripCity } from "@/content/tripPlaces";
/* ここは全部の印が引ける側（`ui/Icon`）を使う。**同じ束に `PhotoPost` が
   いて、あちらがもう読んでいる**ので、こちらだけ小さいほうに寄せても
   1バイトも減らない。旅の道具はあやとの画面にしか降りてこない。 */
import Icon from "@/components/ui/Icon";

/** 島の景色。`docs/island-world.md` 1.3 の3つ。サーバー側の `ISLAND_THEMES` と同じ。 */
const THEME_NAME: [string, string][] = [
  ["georgia", "ジョージア（既定）"],
  ["nordic", "北欧"],
  ["desert", "乾いた国"],
];

/**
 * いま、どこにいるか。
 *
 * ここを書きかえると、島の景色（`data-theme`）・`/now`・北欧の面の
 * 「いまここ」が、いっせいに動く。**旅の途中でいちばん効く1行。**
 *
 * ## 打つのではなく、押して入れる
 *
 * 旅の地図が動くのは、旅程の街の名前と当たったときだけ。
 * 「ヴィリニュス」を「ビリニュス」と打つと、`/now` は平気でそう出すのに
 * 地図だけが黙って出発前の姿に戻る。**走っている車の中でいちばん起きる。**
 * 綴りを覚えていないと当てられないものを、親指で打たせない。
 * 旅程の街は札にして並べて、押すだけで入るようにする
 * （街の表はここで作らない。旅程から導出したものを読む＝`content/place.ts`）。
 *
 * ## 送ったあと、島がどう受け取ったかを返す
 *
 * 前はここが、何を打っても「島じゅうに出ました。」だった。
 * 地図が動いたのかどうかが、打った本人にどこにも出ない。
 *
 * ## 今週やること
 *
 * 全部打ち直せる必要は無いが、**消せないまま日付だけ新しくなるのがいちばん悪い。**
 * 日付印は「今日書いた」と出るので、中身が先週のままだと気づかれない。
 * 1行ずつ消せて、1行ずつ足せるところまで持つ。
 */
export function TripPlace() {
  const { token } = useAuth();
  const online = useOnline();
  const [d, put, settle] = useDraft("ayato-trip-place", {
    place: "",
    word: "",
    theme: "",
  });
  /** いま入っている値。打ちかけを上書きしないために、入れるのは1回だけ */
  const filled = useRef(false);
  const [now, setNow] = useState<{ place?: string; word?: string; theme?: string } | null>(
    null,
  );
  /** 島に入っている「今週やること」。読めるまでは null（**空と読み違えない**） */
  const [week, setWeek] = useState<string[] | null>(null);
  /** 今週やることに手を付けたか。**触っていないなら送らない**（うっかり消さないため） */
  const [weekDirty, setWeekDirty] = useState(false);
  const [weekAdd, setWeekAdd] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  /** 送ったあと、島がその場所をどう受け取ったか */
  const [got, setGot] = useState<string | null>(null);

  useEffect(() => {
    getState()
      .then((s) => {
        setNow(s.current ?? {});
        setWeek(s.current?.week ?? []);
        if (filled.current) return;
        filled.current = true;
        put({
          place: d.place || s.current?.place || "",
          word: d.word || s.current?.word || "",
          theme: d.theme || s.current?.theme || "georgia",
        });
      })
      .catch(() => setNow({}));
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const place = d.place.trim();
    if (!place) return;
    setState("sending");
    setErr(null);
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await postCurrent(
        {
          place,
          word: d.word.trim() || undefined,
          theme: d.theme || undefined,
          /* 触っていないなら送らない。送らなければ島のものがそのまま残る
             （`functions/src/islandApi.ts` の `/current`）。 */
          ...(weekDirty && week ? { week } : {}),
        },
        t,
      );
      setNow(r.current);
      if (r.current.week) setWeek(r.current.week);
      setWeekDirty(false);
      /* 島がこの場所をどう受け取ったか。地図が動くのは旅程の街と当たったときだけ */
      const hit = tripCity(place);
      setGot(
        hit?.onMap
          ? `旅の地図は ${hit.city} に立ちます。`
          : hit
            ? "旅の地図は動きません。"
            : "旅の地図は動きません。「旅程の街」から選ぶと動きます。",
      );
      setState("done");
      settle();
      // 島の景色は `<html data-theme>` が持っている。押した本人の画面にも今すぐ効かせる
      if (r.current.theme) document.documentElement.dataset.theme = r.current.theme;
    } catch (e) {
      setState("error");
      setErr(String(e).slice(0, 90));
    }
  };

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。打っておけば端末に残ります。
        </p>
      )}
      <p className="mp-now">
        いまは <b>{now?.place ?? "…"}</b>
      </p>
      <label className="nph-post-row">
        <span>いる場所</span>
        <input
          type="text"
          value={d.place}
          maxLength={60}
          placeholder="リトアニア・ヴィリニュス"
          onChange={(e) => put({ place: e.target.value })}
        />
      </label>
      {/* 押すだけで入る。旅程に無い街に泊まる日もあるので、上の欄は残す。 */}
      <div className="nlog-seeds trip-cities">
        <span>旅程の街</span>
        {TRIP_PLACES.map((c) => (
          <button
            key={c.city}
            type="button"
            className={`nlog-seed${tripCity(d.place)?.city === c.city ? " is-on" : ""}`}
            onClick={() => {
              put({ place: c.label });
              setState("idle");
            }}
          >
            {c.city}
          </button>
        ))}
      </div>
      <label className="nph-post-row">
        <span>ひとこと</span>
        <textarea
          value={d.word}
          rows={2}
          maxLength={140}
          placeholder="ヴィリニュスまで来ました。今夜も22時から配信します。"
          onChange={(e) => put({ word: e.target.value })}
        />
      </label>
      <label className="nph-post-row">
        <span>島の景色</span>
        <select value={d.theme} onChange={(e) => put({ theme: e.target.value })}>
          {THEME_NAME.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {/* 今週やること。**中身が古いまま日付だけ新しくなるのを止めるための欄。**
          全部打ち直すためのものではないので、消すのを先に置く。 */}
      <div className="trip-week">
        <span className="trip-week-h">今週やること</span>
        {week === null ? (
          <p className="trip-week-none">読んでいます…</p>
        ) : week.length === 0 ? (
          <p className="trip-week-none">いまは1行も出ていません。</p>
        ) : (
          <ul className="trip-week-rows">
            {week.map((w, i) => (
              <li key={`${w}-${i}`} className="trip-week-row">
                <span>{w}</span>
                <button
                  type="button"
                  className="trip-week-x"
                  aria-label={`「${w}」を消す`}
                  onClick={() => {
                    setWeek(week.filter((_, j) => j !== i));
                    setWeekDirty(true);
                    setState("idle");
                  }}
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="trip-week-add">
          <input
            type="text"
            value={weekAdd}
            maxLength={120}
            placeholder="今週やることを1行"
            onChange={(e) => setWeekAdd(e.target.value)}
          />
          <button
            type="button"
            className="trip-week-plus"
            disabled={!weekAdd.trim() || week === null || week.length >= 8}
            onClick={() => {
              setWeek([...(week ?? []), weekAdd.trim()]);
              setWeekAdd("");
              setWeekDirty(true);
              setState("idle");
            }}
          >
            足す
          </button>
        </div>
      </div>
      <button
        className="mp-send"
        disabled={state === "sending" || !d.place.trim()}
        onClick={send}
      >
        {state === "sending" ? "送っています…" : "ここにいる、と出す"}
      </button>
      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 島じゅうに出ました。{got}
        </p>
      )}
      {state === "error" && (
        <>
          <p className="err">
            <Icon name="alert" size={13} /> 送れませんでした。{err}
          </p>
          <button className="mp-send is-retry" onClick={send}>
            <Icon name="refresh" size={16} />
            もう一度おくる
          </button>
        </>
      )}
    </div>
  );
}
