"use client";

import { useEffect, useRef, useState } from "react";
import { getState, postCurrent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDraft, useOnline } from "@/lib/draft";
/* ここは全部の印が引ける側（`ui/Icon`）を使う。**同じ束に `PhotoPost` が
   いて、あちらがもう読んでいる**ので、こちらだけ小さいほうに寄せても
   1バイトも減らない。旅の道具はあやとの画面にしか降りてこない。 */
import Icon from "@/components/ui/Icon";

/* その日に起きたことを書く欄（`TripLog`）は、ここにあった。**外した**
   （2026-09-10）。旅の最中は、あやとが秘書に一言送って、そこから整えて
   焼く。書く口を2つ持つと、片方が古くなる。
   入れる道は `python/admin/nordic_log.py`（「管理スクリプトを実行」から）。 */

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
