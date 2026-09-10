"use client";

import { useEffect, useRef, useState } from "react";
import ReadAgain, { Waiting } from "@/components/me/ReadAgain";
import Icon from "@/components/ui/Icon";
import {
  getStreamEvents,
  postNordicPhoto,
  type NordicPhoto,
  type StreamEventBrief,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import { useOnline } from "@/lib/draft";
import { UPLOAD_THIN, shrink } from "./stamp";

/**
 * その日の写真を貼る。**あやとだけに出る。**
 *
 * 出るかどうかは `/me` の `admin`（`amIOwner`）で決めているが、
 * それは道具を出すかどうかの話でしかない。実際に貼れるかは
 * `POST /island-api/nordic/photos` がもう一度見ている。
 *
 * **縮めるのはここ。** 長辺1600pxの webp に焼いてから送る
 * （`docs/nordic-photos.md` 6章）。元のままだと、旅10日ぶんで置き場も
 * 回線も持たない。焼くのに時間がかかるので、1枚ずつ順に送って、
 * 何枚目まで終わったかを出す。
 *
 * ## 日付を入れたら、企画を選ぶ（#202）
 *
 * 写真は企画に付く。**日付ではなく企画に付く**ので、その日に企画が
 * 何本も立っていると、どれに付くかを決めないといけない。
 *
 * | その日の企画 | 画面 |
 * | --- | --- |
 * | 1本 | **選ばせない。** 「この企画に付きます」と出すだけ |
 * | 2本以上 | 選ぶ。選ぶまで送らない |
 * | 0本 | そう出す。**貼れなくはしない**（企画の無い日の写真もある） |
 *
 * **2本以上のときに既定を置かない**のは、黙って別の企画に付くのが
 * いちばん困るから。付いた先は画面に出ないので、間違っても気づけない
 * （送る先を決めずに送ると、サーバーはその日のいちばん古い企画に付ける）。
 * 9月11日は4本立つ。1タップ増えるだけで、行き先が確かになる。
 *
 * **企画が読めなかったときは止めない。** 電波が細いところで開くので、
 * 企画の一覧が引けないだけで写真が貼れなくなるほうが害が大きい。
 * そのときは日付だけで送って、サーバー側の既定に任せる。
 *
 * **ただし、灰色に上限を置く**（#34）。`fetch` は自分では諦めないので、
 * 45秒返さない回では骨がいつまでも残っていた。12秒で見切って
 * （`withRead`）、読み直す道を出す。言い回しは板や `/me` と同じものを使う
 * （`components/me/ReadAgain.tsx`）。**同じ意味を何通りにも書かない。**
 *
 * ## 電波の悪いところで押す（#163）
 *
 * 貼るのはヒッチハイクの途中で、片手で、電波の細いところ。
 * 途中で切れるのは事故ではなく前提なので、そのつもりで作る。
 *
 * - **送れなかったぶんを捨てない。** 5枚選んで3枚で切れたら、残り2枚を
 *   持ったまま「のこりをおくる」を出す。選び直しからやらせない
 * - **細い電波のときは、粗くしてでも入れる。** 長辺900pxに落とすと
 *   およそ 1/3 の重さになる。旅の1枚は、粗くても在るほうがいい
 * - **届いていないことは、押す前に言う**（`useOnline`）
 *
 * **日付は UTC で切る。** 島じゅうの「1日」がそうなっていて
 * （`functions/src/islandApi.ts` の today）、その日の配信でスパチャして
 * くれた人を数えるときの区切りとも揃う。22時から始まって0時をまたぐ
 * 配信が、1日の中に収まる。
 */
export default function PhotoPost({
  onAdded,
}: {
  /** 貼れた1枚。写真の壁は受け取って並べ、旅の道具は受け取らない */
  onAdded?: (p: NordicPhoto) => void;
}) {
  const { token } = useAuth();
  const online = useOnline();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  /** 細い電波のとき、粗くしてでも入れる */
  const [thin, setThin] = useState(false);
  const [doing, setDoing] = useState<{ done: number; all: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 送れた枚数。押したことが残らないと、入ったのかどうか分からない */
  const [done, setDone] = useState(0);
  /** まだ送れていないぶん。選び直しをさせないために持っておく */
  const [rest, setRest] = useState<File[]>([]);
  /** その日に立っている企画。**読めたぶんだけ入る** */
  const [events, setEvents] = useState<StreamEventBrief[]>([]);
  /** 読めたかどうか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  const [evRead, setEvRead] = useState<Read>("wait");
  /** 「もう一度よみこむ」を押されたら増える */
  const [again, setAgain] = useState(0);
  /** どの企画に付けるか。1本の日は勝手に決まる */
  const [pick, setPick] = useState("");
  const file = useRef<HTMLInputElement>(null);

  /* 日を打ち替えるたびに引き直す。**遅れて届いた古い返事で上書きしない。**
     日付の欄はキーを押すたびに変わるので、電波が細いと返事の順が入れ替わる。 */
  useEffect(() => {
    let alive = true;
    setEvents([]);
    setEvRead("wait");
    setPick("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      setEvRead("ok");
      return;
    }
    withRead(getStreamEvents(day))
      .then((r) => {
        if (!alive) return;
        const list = r?.events ?? [];
        setEvents(list);
        setEvRead("ok");
        // 1本しかない日は選ばせない。そのまま決める
        if (list.length === 1) setPick(list[0].id);
      })
      .catch(() => {
        if (!alive) return;
        // 空の配列は「読めた上での0本」のことば。届かなかった日に言わない
        setEvRead("down");
      });
    return () => {
      alive = false;
    };
  }, [day, again]);

  /* 電波が戻ったら、押されるのを待たずに引き直す。**落ちている最中に
     引き直しを掛けると止まらない**ので、切れてから戻ったときだけ。 */
  const wasOff = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOff.current = true;
      return;
    }
    if (!wasOff.current) return;
    wasOff.current = false;
    setAgain((n) => n + 1);
  }, [online]);

  /** 選ぶ番になっているのに、まだ選んでいない。ここだけ送らせない */
  const waiting = evRead === "ok" && events.length > 1 && !pick;

  const send = async (files: File[]) => {
    if (files.length === 0) return;
    const t = await token();
    if (!t) {
      setErr("ログインしなおしてください。");
      return;
    }
    setErr(null);
    const all = files.length;
    for (let i = 0; i < all; i++) {
      setDoing({ done: i, all });
      try {
        const small = await shrink(files[i], thin ? UPLOAD_THIN : undefined);
        if (!small) throw new Error("焼けなかった");
        const { photo } = await postNordicPhoto(
          {
            day,
            ...small,
            note: note.trim() || undefined,
            streamEventId: pick || undefined,
          },
          t,
        );
        onAdded?.(photo);
        setDone((n) => n + 1);
      } catch (e) {
        // 送れていないぶんを、選び直させない。ここから「のこりをおくる」
        setRest(files.slice(i));
        setErr(`${i + 1}枚目でつまずきました。${String(e).slice(0, 80)}`);
        setDoing(null);
        return;
      }
    }
    setRest([]);
    setDoing(null);
    if (file.current) file.current.value = "";
  };

  return (
    <div className="dform nph-post">
      <b className="nph-post-h">その日の写真を貼る</b>
      {!online && (
        <p className="nph-off">
          <Icon name="alert" size={13} /> いま電波が届いていません。届いたら押してください。
        </p>
      )}
      <label className="nph-post-row">
        <span>どの日の</span>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>

      {/* どの企画に付くか。**日付の真下に置く。** 打った日の答えなので、
          写真を選ぶ押しどころより上でなければ、押したあとに気づくことになる */}
      <div className="nph-ev">
        {evRead === "wait" && <Waiting />}

        {/* 読めなかったとき。**「この日は企画が無い」と言わない。**
            貼るのは止めないので、そのことだけ1行で足す。 */}
        {evRead === "down" && (
          <>
            <ReadAgain what="この日の企画" onRetry={() => setAgain((n) => n + 1)} />
            <p className="nph-ev-note">選ばなくても、写真はこのまま貼れます。</p>
          </>
        )}

        {evRead === "ok" && events.length === 0 && (
          <p className="nph-ev-note">
            この日に立っている企画はありません。写真はこのまま貼れます。
          </p>
        )}

        {evRead === "ok" && events.length === 1 && (
          <p className="nph-ev-one">
            <Icon name="check" size={13} />
            <span>
              <i>この企画に付きます</i>
              <b>{events[0].title}</b>
            </span>
          </p>
        )}

        {evRead === "ok" && events.length > 1 && (
          <>
            <p className="nph-ev-ask">
              この日は{events.length}本あります。どれに付けますか。
            </p>
            <div className="nph-ev-list" role="radiogroup" aria-label="どの企画に付けるか">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  role="radio"
                  aria-checked={pick === ev.id}
                  className={`nph-ev-pick${pick === ev.id ? " is-on" : ""}`}
                  onClick={() => setPick(ev.id)}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <label className="nph-post-row">
        <span>ひとこと</span>
        <input
          type="text"
          value={note}
          maxLength={120}
          placeholder="なくてもいい"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="nph-thin">
        <input
          type="checkbox"
          checked={thin}
          onChange={(e) => setThin(e.target.checked)}
        />
        <span>電波が細いので、粗くしてでも入れる</span>
      </label>
      <input
        ref={file}
        className="nph-post-file"
        type="file"
        accept="image/*"
        multiple
        disabled={!!doing}
        onChange={(e) => send([...(e.target.files ?? [])])}
      />
      <button
        className="nph-post-go"
        disabled={!!doing || waiting}
        onClick={() => file.current?.click()}
      >
        <Icon name="upload" size={16} />
        {doing
          ? `${doing.done + 1}/${doing.all}枚目を送っています…`
          : waiting
            ? "どの企画に付けるかを選ぶ"
            : "写真を選ぶ"}
      </button>
      {rest.length > 0 && !doing && (
        <button className="nph-post-go" disabled={waiting} onClick={() => send(rest)}>
          <Icon name="refresh" size={16} />
          のこり{rest.length}枚をもう一度おくる
        </button>
      )}
      {done > 0 && !doing && (
        <p className="nph-ok">
          <Icon name="check" size={13} /> {done}枚 入りました。
        </p>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
