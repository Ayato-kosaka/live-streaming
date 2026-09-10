"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getState, postCurrent, postNordicLog } from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
import { DAYS } from "@/content/nordic";
import { TRIP_PLACES, tripCity } from "@/content/tripPlaces";
import { LOG_SEEDS, putNordicLog, useNordicLogState } from "@/components/nordic/log";
import ReadAgain from "./ReadAgain";
/* ここは全部の印が引ける側（`ui/Icon`）を使う。**同じ束に `PhotoPost` が
   いて、あちらがもう読んでいる**ので、こちらだけ小さいほうに寄せても
   1バイトも減らない。旅の道具はあやとの画面にしか降りてこない。 */
import Icon from "@/components/ui/Icon";

/** 「2026-09-14」→「9/14」。札に出す短いほう。 */
const md = (iso?: string) =>
  iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "";

/** 旅程表の行の呼び名。「出発」「3日目」「ストックホルムで7泊」 */
const dayName = (d: (typeof DAYS)[number]) =>
  d.label ?? (d.n ? `${d.n}日目` : d.id);

/**
 * その日に起きたことを書く。
 *
 * 1日ぶんのページ（`components/nordic/DayLog.tsx`）にも同じ欄がある。
 * **あちらは「その日のページを開いた人」が書く形**で、日が決め打ち。
 * ここは旅の途中の本人が開くので、日を選ぶところから始まる。
 * 書き出しの見本は同じもの（`LOG_SEEDS`）を出す。
 *
 * ## 読めなかったことを言う（#34 #36 #43）
 *
 * ここは `loadNordicLog()` を待っていた。あちらは**読めた日にしか返事を
 * しない**ので、電波が細いと約束が解けないまま止まる。画面には
 * 何も出ないのに、**空の欄と「入れる」だけが出ていた。**
 * `POST /nordic/log` は同じ日に書くと上書きなので、山の中で開いて打つと
 * **前に書いたものが消える**（#43 で `DayLog` の側は塞いだ）。
 *
 * 1日ぶんのページと同じものを見る（`useNordicLogState`）。読めなかったら
 * そう言って、**書ける口は開かない。** 読み直しは向こうが持っている
 * （`online`・画面に戻ってきた・押されたとき）。
 */
export function TripLog() {
  const { token } = useAuth();
  const online = useOnline();
  const [d, put, settle] = useDraft("ayato-trip-log", {
    day: "",
    date: "",
    body: "",
    video: "",
  });
  /** サーバーから持ってきた、その日の中身。打ち始めたかどうかの目印にする */
  const filled = useRef<{ day: string; body: string }>({ day: "", body: "" });
  /* 旅ぜんぶぶんと、**読めたかどうか**。1日ぶんのページ・旅程表の印と
     同じものを見る（`components/nordic/log.ts`）。 */
  const { log, read, reload } = useNordicLogState();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  /* 開いた日を決める。**今日にいちばん近い、過ぎている行。**
     旅の途中に開くので、たいていは「今日の行」で当たる。 */
  useEffect(() => {
    if (d.day) return;
    const today = new Date().toISOString().slice(0, 10);
    const past = DAYS.filter((x) => x.date && x.date <= today);
    const pick = past.length ? past[past.length - 1] : DAYS[0];
    put({ day: pick.id, date: d.date || pick.date || today });
    // 初回だけ。以後は選んだものを尊重する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.day]);

  /* 選んだ日にもう書いてあれば、それを出す。**打ちかけの字は上書きしない。**
     いま出ている字が、前に入れたサーバーの字とそのまま同じときだけ差し替える。

     **読めていないあいだは触らない。** `read !== "ok"` のときの `log` は
     空（＝読めたぶんが無い）なので、そのまま入れると端末に残っている
     打ちかけを空で消すことになる。 */
  useEffect(() => {
    if (read !== "ok" || !d.day) return;
    if (d.body && d.body !== filled.current.body) return;
    const now = log.find((x) => x.day === d.day);
    filled.current = { day: d.day, body: now?.body ?? "" };
    put({ body: now?.body ?? "", video: now?.video ?? "", date: now?.date || d.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, read, d.day]);

  const send = async () => {
    const body = d.body.trim();
    if (!body) return;
    setState("sending");
    setErr(null);
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await postNordicLog(
        { day: d.day, date: d.date || undefined, body, video: d.video.trim() || undefined },
        t,
      );
      // 配っているほうを入れ替える。ここだけで持たない（旅程表の印も同じものを見る）
      putNordicLog(r.log);
      filled.current = { day: d.day, body };
      setState("done");
      // 端末の控えだけ片づける。欄の字は残す（書き直しはよく起きる）
      settle();
    } catch (e) {
      setState("error");
      setErr(String(e).slice(0, 90));
    }
  };

  const has = read === "ok" && !!log.find((x) => x.day === d.day);

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。打っておけば端末に残ります。
        </p>
      )}
      {/* 読みに行けなかった。**いま何が書いてあるかを読めていないので、
          「入れる」は出さない**（上書きになる。#36 #43）。
          打った字は端末に残るので、電波が戻ってから送れる。 */}
      {read === "down" && <ReadAgain what="その日の話" onRetry={reload} />}
      <label className="nph-post-row">
        <span>どの日の</span>
        <select value={d.day} onChange={(e) => put({ day: e.target.value })}>
          {DAYS.map((x) => (
            <option key={x.id} value={x.id}>
              {dayName(x)}
              {x.date ? `（${md(x.date)}）` : ""}
              {/* **読めた日にだけ印を出す。** 読めていないときの空を
                  「まだ書いていない」と読ませない（上の札がそう言っている） */}
              {read === "ok" && log.some((l) => l.day === x.id) ? " ・書いた" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="nph-post-row">
        <span>この日は</span>
        <input type="date" value={d.date} onChange={(e) => put({ date: e.target.value })} />
      </label>
      <label className="nph-post-row">
        <span>起きたこと</span>
        <textarea
          value={d.body}
          rows={5}
          maxLength={400}
          placeholder="2台目で停まってくれた。運転手さんはリガまで行く人だった。"
          onChange={(e) => put({ body: e.target.value })}
        />
      </label>
      <div className="nlog-seeds">
        <span>書き出しを選ぶ</span>
        {LOG_SEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="nlog-seed"
            // すでに書いてあるものを消さない。書き出しは前に足すだけ
            onClick={() => put({ body: d.body.startsWith(s) ? d.body : s + d.body })}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="nph-post-row">
        <span>その日の配信</span>
        <input
          type="text"
          value={d.video}
          placeholder="YouTube の URL でも id でも。なくてもいい"
          onChange={(e) => put({ video: e.target.value })}
        />
      </label>
      <button
        className="mp-send"
        disabled={state === "sending" || !d.body.trim() || read !== "ok"}
        onClick={send}
      >
        {state === "sending" ? "送っています…" : has ? "書き直す" : "入れる"}
      </button>
      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 入りました。旅の面に出ています。
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
  /** 島に入っているものを読めたか。**「読んでいる最中」と混ぜない** */
  const [read, setRead] = useState<Read>("wait");
  /** 落ちた回数。読み直す間隔を倍にしていくのに使う */
  const miss = useRef(0);
  /* いまの読めぐあい。**電波が戻ったとき、落ちているときだけ読み直す**ために持つ */
  const nowRead = useRef<Read>("wait");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  /**
   * 島に入っているものを読む。
   *
   * `showWait` は、押されて読み直すときだけ `true`。骨に戻して「いま行った」と
   * 分かるようにする。ひとりでに読み直すときは顔を入れ替えない（#277）。
   */
  const load = useCallback(
    (showWait: boolean) => {
      if (showWait) {
        nowRead.current = "wait";
        setRead("wait");
      }
      /* **返事が来ないのも「読めなかった」**（`withRead` が12秒で見切る）。
         前はここが `catch(() => setNow({}))` で、今週やることが
         「読んでいます…」のまま何分でも残っていた。 */
      withRead(getState())
        .then((s) => {
          if (!alive.current) return;
          setNow(s.current ?? {});
          setWeek(s.current?.week ?? []);
          nowRead.current = "ok";
          setRead("ok");
          miss.current = 0;
          if (filled.current) return;
          filled.current = true;
          put({
            place: d.place || s.current?.place || "",
            word: d.word || s.current?.word || "",
            theme: d.theme || s.current?.theme || "georgia",
          });
        })
        .catch(() => {
          if (!alive.current) return;
          nowRead.current = "down";
          setRead("down");
          miss.current += 1;
          timers.current.push(
            setTimeout(() => load(false), Math.min(2000 * 2 ** (miss.current - 1), 30000)),
          );
        });
    },
    // 打ちかけを消さないための読み取りしかしていない（入れるのは1回だけ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    alive.current = true;
    load(false);
    /* 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。 */
    const wake = () => {
      if (nowRead.current === "down") load(false);
    };
    const back = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", back);
    const running = timers.current;
    return () => {
      alive.current = false;
      running.forEach(clearTimeout);
      running.length = 0;
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

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
      {/* 読みに行けなかった。**「いまは …」のまま黙らない。**
          いま島に何が出ているかを読めていないので、そう言って読み直す道を出す。 */}
      {read === "down" && <ReadAgain what="島に出ている場所" onRetry={() => load(true)} />}
      {read !== "down" && (
        <p className="mp-now">
          いまは <b>{now?.place ?? "…"}</b>
        </p>
      )}
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
        {/* **読めなかったことを、「1行も出ていません」に倒さない。**
            押しどころは上に1つ出ているので、ここは何が欠けたかだけ言う */}
        {read === "down" ? (
          <ReadAgain what="今週やること" quiet />
        ) : week === null ? (
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
