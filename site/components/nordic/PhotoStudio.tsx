"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { RESIDENTS } from "@/content/residents";
import type { NordicPhoto, NordicSupporter } from "@/lib/api";
import { compose, loadImage, stampFileName, toJpeg } from "./stamp";

/**
 * 写真を1枚ひらいて、持って帰るところ。
 *
 * ここが `docs/nordic-photos.md` の芯。**その日そこにいた人のキャラクターを
 * 1人だけ入れて、持って帰れる。** 順位でも点数でもなく、いたという事実だけが
 * 写真になって手元に残る。
 *
 * 選べるのは、その日の配信でスパチャしてくれた人。**入れなくてもよい**ので、
 * 「入れない」も同じ並びの中に、同じ大きさの1マスとして置く。
 * 「入れる/入れない」を先に選ばせてから人を選ばせる、という2段にすると、
 * 押す回数が増えるだけで分かりやすくはならなかった。
 *
 * ## 保存
 *
 * **スマホで押す人のほうが多い。** `<a download>` は iOS Safari で
 * 効かないことがあるので、そこに寄りかからない（`docs/nordic-photos.md` 6章）。
 *   1. 端末が共有を持っていれば、そこへ渡す（iOS はここに「画像を保存」が出る）
 *   2. 無ければ `<a download>`
 *   3. どちらも駄目でも、**出ている絵そのものが焼き上がりの1枚**なので、
 *      長押しで保存できる。別のタブで開く口も出しておく
 */

/** チャンネルから、その人のキャラクターの絵を引く。 */
const iconOf = (s: NordicSupporter): string | null => {
  if (s.icon) return s.icon;
  if (!s.channelId) return null;
  return RESIDENTS.find((r) => r.channel === s.channelId)?.icon ?? null;
};

const drive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s512`;

/** 選ぶところに出す1人。絵の無い人はここまで来ない。 */
type Pick = { icon: string; name: string };

export default function PhotoStudio({
  day,
  photo,
  people,
  onClose,
}: {
  day: string;
  photo: NordicPhoto;
  people: NordicSupporter[];
  onClose: () => void;
}) {
  /* 絵に結びつかない人は出さない。
     「あなたのキャラクターがありません」とは言わない（本人のせいではない）。 */
  const picks: Pick[] = [];
  for (const p of people) {
    const icon = iconOf(p);
    if (!icon || picks.some((x) => x.icon === icon)) continue;
    picks.push({ icon, name: p.name || "" });
  }

  const [chosen, setChosen] = useState<string | null>(null);
  const [out, setOut] = useState<{ url: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // 選ぶたびに焼き直す。前の1枚は URL ごと捨てる（放っておくと溜まる）。
  useEffect(() => {
    let gone = false;
    let url = "";
    setOut(null);
    setFailed(false);
    (async () => {
      const [shot, chr] = await Promise.all([
        loadImage(photo.url),
        chosen ? loadImage(drive(chosen)) : Promise.resolve(null),
      ]);
      if (gone) return;
      if (!shot) {
        setFailed(true);
        return;
      }
      const blob = await toJpeg(compose(shot, chr));
      if (gone || !blob) {
        if (!gone) setFailed(true);
        return;
      }
      url = URL.createObjectURL(blob);
      setOut({ url, blob });
    })();
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.url, chosen]);

  const save = useCallback(async () => {
    if (!out) return;
    const name = stampFileName(day);
    const file = new File([out.blob], name, { type: "image/jpeg" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
    };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        /* 共有をやめただけ。下に落ちてダウンロードにする */
      }
    }
    const a = document.createElement("a");
    a.href = out.url;
    a.download = name;
    a.click();
  }, [out, day]);

  return (
    <div className="nstudio" role="dialog" aria-modal="true" aria-label="写真">
      {/* 外を押しても閉じる。ここは絵の裏なので、押せる合図は要らない */}
      <button className="nstudio-back" aria-label="閉じる" onClick={onClose} />
      <div className="nstudio-sheet">
        <button
          ref={closeRef}
          className="nstudio-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="nstudio-shot">
          {out ? (
            /* 出ているこの絵が、そのまま焼き上がりの1枚。
               長押しで保存できるのは、ここが合成後の絵だから。 */
            <img src={out.url} alt={photo.note || "北欧旅の写真"} />
          ) : failed ? (
            <p className="nstudio-off">いま写真が読めません。あとでもう一度。</p>
          ) : (
            <div className="wait is-card" aria-hidden>
              <span />
            </div>
          )}
        </div>
        {photo.note && <p className="nstudio-note">{photo.note}</p>}

        {picks.length > 0 && (
          <>
            <p className="nstudio-ask">この日いた人を、1人だけ入れられます</p>
            <div className="nstudio-pick">
              {/* 全部のマスが押せるので、1枚ずつに厚みは付けない
                  （`docs/island-world.md` 3.5）。押せないマスを混ぜない。 */}
              <button
                className={`npick${chosen === null ? " is-on" : ""}`}
                aria-pressed={chosen === null}
                onClick={() => setChosen(null)}
              >
                {/* 「入れない」は禁止ではなく、対等な選択肢の1つ。
                    赤い禁止の印を置くと、選んではいけないものに見える。
                    空けておく、を島の言葉（`.blank` の破線）で言う。 */}
                <span className="npick-none" aria-hidden />
                <i>入れない</i>
              </button>
              {picks.map((p) => (
                <button
                  key={p.icon}
                  className={`npick${chosen === p.icon ? " is-on" : ""}`}
                  aria-pressed={chosen === p.icon}
                  onClick={() => setChosen(p.icon)}
                >
                  <img src={drive(p.icon)} alt="" loading="lazy" />
                  {p.name && <i>{p.name}</i>}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="nstudio-save">
          <button className="nstudio-go" onClick={save} disabled={!out}>
            <Icon name="download" size={16} />
            ほぞんする
          </button>
          {out && (
            <a
              className="nstudio-tab"
              href={out.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              べつのタブでひらく
              <Icon name="external" size={13} />
            </a>
          )}
        </div>
        <p className="nstudio-tip">写真を長押ししても保存できます。</p>
      </div>
    </div>
  );
}
