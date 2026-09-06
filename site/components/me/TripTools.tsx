"use client";

import { useEffect, useRef, useState } from "react";
import {
  getState,
  postCurrent,
  postNordicLog,
  type NordicLogEntry,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
import { DAYS } from "@/content/nordic";
import { LOG_SEEDS, loadNordicLog, putNordicLog } from "@/components/nordic/log";
import PhotoPost from "@/components/nordic/PhotoPost";
/* ここは全部の印が引ける側（`ui/Icon`）を使う。**同じ束に `PhotoPost` が
   いて、あちらがもう読んでいる**ので、こちらだけ小さいほうに寄せても
   1バイトも減らない。旅の道具はあやとの画面にしか降りてこない。 */
import Icon from "@/components/ui/Icon";

/**
 * 旅の道具。**あやとが、ヒッチハイクの途中に片手で開くところ（#163）。**
 *
 * その日の写真・その日に起きたこと・いまどこ。この3つはもともと
 * 島の別々の面にあって（`/nordic/photos`・`/nordic/day/3`・
 * `python/admin/firestore_write.py`）、旅に出たら回らない置き方だった。
 * 1か所に集めて、じぶんのことの**いちばん上**に置く。
 *
 * ## 片手で使える形にする
 *
 * - **3つを縦に積まない。** 積むと下の2つが畳みの向こうへ行く。
 *   札を1列だけ出して、押した1つだけを開く。どれも1タップで出る
 * - 押しどころは**画面の幅いっぱい・52px**。走っている車の中でも押せる
 * - いちばん使うものを最初に開いておく（写真）
 *
 * ## 電波の悪いところで使える形にする
 *
 * 送信が失敗するのは事故ではなく前提。
 *
 * - **打った字は、打つそばから端末に残す**（`useDraft`）。
 *   トンネルに入っても、アプリが後ろで捨てられても、開き直せば続きから
 * - **送れたら消す。残っている＝まだ送れていない**の印になる
 * - 失敗しても字を消さない。「もう一度おくる」だけを出す
 * - 届いていないことは、押す前に言う（`useOnline`）
 */
export default function TripTools() {
  const [tab, setTab] = useState<"photo" | "log" | "place">("photo");
  return (
    <section className="panel paper mp-trip">
      <h2>旅の道具</h2>
      <p className="muted mp-small">
        その日のうちに、ここから入れる。打ったものは送れるまで端末に残ります。
      </p>
      <div className="mp-tabs" role="tablist" aria-label="旅の道具">
        {(
          [
            ["photo", "写真", "photo"],
            ["log", "その日のこと", "log"],
            ["place", "いまどこ", "pin"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`mp-tab${tab === id ? " is-on" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>
      {/* 開いていないものは、そもそも作らない。写真の欄と日誌の欄が
          同時に生きていると、下書きの復元が2つ同時に走る。 */}
      {tab === "photo" && <PhotoPost />}
      {tab === "log" && <TripLog />}
      {tab === "place" && <TripPlace />}

      {/* ルーレット（#164）と遠隔操作（#165）の道具は、まだ無い。
          **押せない札を並びに混ぜない**（`docs/island-world.md` 3.5）ので、
          行き先の札ではなく、平らな1行で言っておく。 */}
      <p className="mp-todo">
        ルーレットと、島の遠隔操作の道具は、ここに入る予定。まだ作っていない。
      </p>
    </section>
  );
}

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
 */
function TripLog() {
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
  const [log, setLog] = useState<NordicLogEntry[] | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadNordicLog().then(setLog);
  }, []);

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
     いま出ている字が、前に入れたサーバーの字とそのまま同じときだけ差し替える。 */
  useEffect(() => {
    if (!log || !d.day) return;
    if (d.body && d.body !== filled.current.body) return;
    const now = log.find((x) => x.day === d.day);
    filled.current = { day: d.day, body: now?.body ?? "" };
    put({ body: now?.body ?? "", video: now?.video ?? "", date: now?.date || d.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, d.day]);

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
      putNordicLog(r.log);
      setLog((cur) => [...(cur ?? []).filter((x) => x.day !== r.log.day), r.log]);
      filled.current = { day: d.day, body };
      setState("done");
      // 端末の控えだけ片づける。欄の字は残す（書き直しはよく起きる）
      settle();
    } catch (e) {
      setState("error");
      setErr(String(e).slice(0, 90));
    }
  };

  const has = !!log?.find((x) => x.day === d.day);

  return (
    <div className="dform mp-tool">
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。打っておけば端末に残ります。
        </p>
      )}
      <label className="nph-post-row">
        <span>どの日の</span>
        <select value={d.day} onChange={(e) => put({ day: e.target.value })}>
          {DAYS.map((x) => (
            <option key={x.id} value={x.id}>
              {dayName(x)}
              {x.date ? `（${md(x.date)}）` : ""}
              {log?.some((l) => l.day === x.id) ? " ・書いた" : ""}
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
        disabled={state === "sending" || !d.body.trim()}
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
 * 今週の予定（`week`）はここから触らない。何行もある字なので、
 * 走っている車の中で打つものではない。
 */
function TripPlace() {
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
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getState()
      .then((s) => {
        setNow(s.current ?? {});
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
        { place, word: d.word.trim() || undefined, theme: d.theme || undefined },
        t,
      );
      setNow(r.current);
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
      <button
        className="mp-send"
        disabled={state === "sending" || !d.place.trim()}
        onClick={send}
      >
        {state === "sending" ? "送っています…" : "ここにいる、と出す"}
      </button>
      {state === "done" && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> 島じゅうに出ました。
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
