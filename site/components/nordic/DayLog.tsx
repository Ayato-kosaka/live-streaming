"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { deleteNordicLog, postNordicLog, type NordicLogEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LOG_SEEDS, dropNordicLog, loadNordicLog, putNordicLog, useOwner } from "./log";

/**
 * その日に、何が起きたか。**旅の最中に、あやとがその日の宿から書く。**
 *
 * ## なぜここで書くのか
 *
 * `content/nordic.ts` の `NORDIC_LOG` に手で書く作りだった。書き換えるには
 * Git を編集して commit して、Hosting のワークフローを手で起動する。
 * **あやとはヒッチハイクをしている。それは回らない。**
 *
 * だから書く場所を、その日のページの中に置いた。旅の途中に来た人が
 * まず見るのは「今日のところ」で、書く本人が開くのも同じ面。
 * 開いて、打って、押す。それだけで出る。
 *
 * 出るのは、その口があやとだと確かめられたときだけ（`useOwner`）。
 * 実際に書けるかどうかは `POST /island-api/nordic/log` がもう一度見ている。
 *
 * ## 何を書くのか
 *
 * **スマホの親指で打つ。長い文章は書けない。** 配信で3時間しゃべった話を
 * ここに書き写すことはできないし、書けても誰も読まない。
 * 400字までに縛って、押すと書き出しが入る札を並べてある。
 * 続きだけ打てばいいようにしておくと、1行でも書いてもらえる。
 *
 * 日付も一緒に入れる。旅程表の行は、切符のある2日しか日にちを持っていない
 * （乗せてもらえた日でずれるから）。**書いた日が、その行の日付になる。**
 * よていの欄を先に埋めるのではなく、起きたことのほうから埋まる。
 *
 * ## 焼き付けた正本との関係
 *
 * `NORDIC_LOG` は残してある。旅が終わったら Firestore の中身をここへ写して、
 * 以後は静的に配る（`docs/nordic-depart.md`）。読み返されるのは旅のあとの
 * ほうが長いので、そのころには API に頼らないほうがいい。
 * 両方あるときは**届いたほうが勝つ**。写し忘れているあいだも、
 * 新しく書いたものが古い焼き付けに負けない。
 */

/** 「2026-09-14」→「9月14日(月)」。書き出しは UTC で走るので、月日は文字列から取る。 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

export default function DayLog({
  day,
  dayName,
  baked,
}: {
  /** 旅程表の行の id（`day-1` `day-depart`）。**変えない。** */
  day: string;
  /** 「3日目」。書くほうの見出しに出して、どの日に書いているかを間違えないため */
  dayName: string;
  /** Git に焼いてあるぶん。届かなかったときはこちらを出す */
  baked?: { date?: string; body: string; video?: string };
}) {
  const owner = useOwner();
  const { token } = useAuth();
  const [live, setLive] = useState<NordicLogEntry | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadNordicLog().then((l) => {
      if (alive) setLive(l.find((x) => x.day === day) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [day]);

  // 届いたほうが勝つ。写し忘れているあいだ、新しいほうが古い焼き付けに負けない
  const shown = live ?? baked ?? null;

  // 書くものも読むものも無い日は、区画そのものを出さない。
  // 「まだ何も起きていません」と書くと、旅がうまくいっていないように読める。
  if (!shown && !owner) return null;

  return (
    <section className="panel paper" id="was">
      <h2>この日、何が起きたか</h2>
      {shown ? (
        <div className="nday-log">
          {shown.date && <p className="nday-log-when">{when(shown.date)}</p>}
          {/* 改行のまま出す。2〜3行で書くものなので、つなげると読めない */}
          {shown.body.split("\n").map((ln, i) => (
            <p key={i}>{ln}</p>
          ))}
          {shown.video && (
            <a
              className="nday-vid"
              href={`https://www.youtube.com/watch?v=${shown.video}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              その日の配信を見る
              <Icon name="external" size={14} />
            </a>
          )}
        </div>
      ) : (
        <p className="muted">まだ書いていません。</p>
      )}
      {owner && (
        <LogForm
          day={day}
          dayName={dayName}
          now={live ?? undefined}
          token={token}
          onSaved={(e) => {
            putNordicLog(e);
            setLive(e);
          }}
          onDropped={() => {
            dropNordicLog(day);
            setLive(null);
          }}
        />
      )}
    </section>
  );
}

/** 書くところ。**あやとにだけ出る。** */
function LogForm({
  day,
  dayName,
  now,
  token,
  onSaved,
  onDropped,
}: {
  day: string;
  dayName: string;
  now?: NordicLogEntry;
  token: () => Promise<string | null>;
  onSaved: (e: NordicLogEntry) => void;
  onDropped: () => void;
}) {
  /* 日付の既定は今日。**UTC で切る。** 島じゅうの「1日」がそうなっていて
     （`functions/src/islandApi.ts` の today）、22時から始まって0時をまたぐ
     配信が1日の中に収まる。 */
  const [date, setDate] = useState(
    () => now?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [body, setBody] = useState(now?.body ?? "");
  const [video, setVideo] = useState(now?.video ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      const r = await postNordicLog(
        { day, date, body: text, video: video.trim() || undefined },
        t,
      );
      onSaved(r.log);
    } catch (e) {
      setErr(`いま書けませんでした。${String(e).slice(0, 80)}`);
    } finally {
      setBusy(false);
    }
  };

  const drop = async () => {
    setBusy(true);
    setErr(null);
    try {
      const t = await token();
      if (!t) throw new Error("ログインしなおしてください");
      await deleteNordicLog(day, t);
      setBody("");
      setVideo("");
      onDropped();
    } catch (e) {
      setErr(`いま消せませんでした。${String(e).slice(0, 80)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dform nlog-post">
      <b className="nph-post-h">{dayName}に起きたことを書く</b>
      <label className="nph-post-row">
        <span>この日は</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="nph-post-row">
        <span>起きたこと</span>
        <textarea
          value={body}
          rows={4}
          maxLength={400}
          placeholder="2台目で停まってくれた。運転手さんはリガまで行く人だった。"
          onChange={(e) => setBody(e.target.value)}
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
            onClick={() => setBody((b) => (b.startsWith(s) ? b : s + b))}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="nph-post-row">
        <span>その日の配信</span>
        <input
          type="text"
          value={video}
          placeholder="YouTube の URL でも id でも。なくてもいい"
          onChange={(e) => setVideo(e.target.value)}
        />
      </label>
      <div className="nlog-acts">
        <button
          type="button"
          className="nph-post-go"
          disabled={busy || !body.trim()}
          onClick={save}
        >
          {now ? "書き直す" : "入れる"}
        </button>
        {now && (
          <button type="button" className="nlog-drop" disabled={busy} onClick={drop}>
            消す
          </button>
        )}
      </div>
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> {err}
        </p>
      )}
    </div>
  );
}
