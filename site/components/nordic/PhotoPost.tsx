"use client";

import { useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { postNordicPhoto, type NordicPhoto } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
  const file = useRef<HTMLInputElement>(null);

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
          { day, ...small, note: note.trim() || undefined },
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
        disabled={!!doing}
        onClick={() => file.current?.click()}
      >
        <Icon name="upload" size={16} />
        {doing ? `${doing.done + 1}/${doing.all}枚目を送っています…` : "写真を選ぶ"}
      </button>
      {rest.length > 0 && !doing && (
        <button className="nph-post-go" onClick={() => send(rest)}>
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
