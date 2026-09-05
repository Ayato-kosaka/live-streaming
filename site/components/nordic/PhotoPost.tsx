"use client";

import { useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { postNordicPhoto, type NordicPhoto } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shrink } from "./stamp";

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
 * **日付は UTC で切る。** 島じゅうの「1日」がそうなっていて
 * （`functions/src/islandApi.ts` の today）、その日の配信でスパチャして
 * くれた人を数えるときの区切りとも揃う。22時から始まって0時をまたぐ
 * 配信が、1日の中に収まる。
 */
export default function PhotoPost({
  onAdded,
}: {
  onAdded: (p: NordicPhoto) => void;
}) {
  const { token } = useAuth();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [doing, setDoing] = useState<{ done: number; all: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const send = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
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
        const small = await shrink(files[i]);
        if (!small) throw new Error("焼けなかった");
        const { photo } = await postNordicPhoto(
          { day, ...small, note: note.trim() || undefined },
          t,
        );
        onAdded(photo);
      } catch (e) {
        setErr(`${i + 1}枚目でつまずきました。${String(e).slice(0, 80)}`);
        break;
      }
    }
    setDoing(null);
    if (file.current) file.current.value = "";
  };

  return (
    <div className="dform nph-post">
      <b className="nph-post-h">その日の写真を貼る</b>
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
      <input
        ref={file}
        className="nph-post-file"
        type="file"
        accept="image/*"
        multiple
        disabled={!!doing}
        onChange={(e) => send(e.target.files)}
      />
      <button
        className="nph-post-go"
        disabled={!!doing}
        onClick={() => file.current?.click()}
      >
        <Icon name="upload" size={16} />
        {doing ? `${doing.done + 1}/${doing.all}枚目を送っています…` : "写真を選ぶ"}
      </button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
