"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import {
  amIOwner,
  getNordicPhotos,
  type NordicPhoto,
  type NordicPhotoDay,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PhotoPost from "./PhotoPost";
import PhotoStudio from "./PhotoStudio";

/**
 * 旅の写真。**日ごとに並べる。**
 *
 * `/nordic` の中に置かなかった理由（`docs/nordic-photos.md` 7章）。
 * あの面はもう 7.13画面ぶんある。写真は1日に何枚でも貼るので、
 * 旅程表の行の中に混ぜると、旅程表が写真置き場に変わってしまう。
 * あちらには、貼られたときだけ出る1行の入口だけを置いた。
 *
 * **写真の無い日は出さない。** 旅は10日あるが、まだ何も起きていない日に
 * 「まだありません」を10個並べても、読む人には何も無い。
 */

/** 「2026-09-12」→「9月12日(土)」 */
function when(iso: string) {
  const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日(${w})`;
}

/**
 * 旅の何日目か。出発の日を0として数える。
 *
 * **旅程表の「4日目」とは別のもの。** あちらは本人が言い切った日にだけ
 * 数字が入っていて、日にちは乗せてもらえた日でずれる。こちらは
 * 出発から何日たったかというだけの、動かない数字。
 */
function nth(iso: string, depart: string): string | null {
  const ms = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const n = Math.round(ms / 86400000);
  if (n === 0) return "出発の日";
  return n > 0 && n < 60 ? `旅の${n}日目` : null;
}

export default function PhotoWall({ depart }: { depart: string }) {
  const [days, setDays] = useState<NordicPhotoDay[] | null>(null);
  const [off, setOff] = useState(false);
  const [open, setOpen] = useState<{ day: NordicPhotoDay; i: number } | null>(
    null,
  );
  const [owner, setOwner] = useState(false);
  const { user, token } = useAuth();

  useEffect(() => {
    getNordicPhotos()
      .then((r) => setDays(r.days))
      .catch(() => {
        setDays([]);
        setOff(true);
      });
  }, []);

  // 貼る道具は、あやとにだけ出す。ログインしていない人には聞きにいかない。
  useEffect(() => {
    if (!user) {
      setOwner(false);
      return;
    }
    let gone = false;
    (async () => {
      const t = await token();
      if (!t || gone) return;
      const yes = await amIOwner(t);
      if (!gone) setOwner(yes);
    })();
    return () => {
      gone = true;
    };
  }, [user, token]);

  /** 貼れたぶんは、取り直さずにその場で並べる。 */
  const added = (p: NordicPhoto) =>
    setDays((cur) => {
      const list = [...(cur ?? [])];
      const at = list.findIndex((d) => d.day === p.day);
      if (at < 0) {
        list.push({ day: p.day, photos: [p], people: [] });
        return list.sort((a, b) => (a.day < b.day ? 1 : -1));
      }
      list[at] = { ...list[at], photos: [...list[at].photos, p] };
      return list;
    });

  return (
    <>
      {owner && <PhotoPost onAdded={added} />}

      {days === null && (
        <div className="wait is-card" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {days !== null && days.length === 0 && (
        <div className={`blank${off ? " is-off" : ""}`}>
          <b>{off ? "いまつながりません" : "まだ1枚もありません"}</b>
          <p>
            {off ?
              "あとでもう一度ひらいてみてください。" :
              "旅に出た日の夜から、その日に撮った写真がここに並びます。"}
          </p>
          <Link className="blank-go" href="/nordic">
            旅のよていを見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      )}

      {(days ?? []).map((d) => (
        <section className="panel paper nph-day" key={d.day} id={`d${d.day}`}>
          <h2>
            {when(d.day)}
            {nth(d.day, depart) && <i>{nth(d.day, depart)}</i>}
          </h2>
          {/* 全部のマスが押せるので、1枚ずつに厚みは付けない
              （`docs/island-world.md` 3.5）。押せないマスを混ぜない。 */}
          <div className="nph-grid">
            {d.photos.map((p, i) => (
              <button
                key={p.id}
                className="nph"
                onClick={() => setOpen({ day: d, i })}
              >
                <img
                  src={p.url}
                  alt={p.note || "北欧旅の写真"}
                  loading="lazy"
                  width={p.w || undefined}
                  height={p.h || undefined}
                />
              </button>
            ))}
          </div>
        </section>
      ))}

      {open && (
        <PhotoStudio
          day={open.day.day}
          photo={open.day.photos[open.i]}
          people={open.day.people}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
