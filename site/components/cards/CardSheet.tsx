"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import {
  compose,
  loadImage,
  stampFileName,
  toJpeg,
  type Place,
} from "@/components/nordic/stamp";
import { cardIcon, cardWhen, type PhotoGroup, type PlanBrief } from "./cards";

/**
 * 写真を1枚ひらいて、キャラクターを入れて、持って帰るところ。
 *
 * **旅の写真（`/nordic/photos`）とあやと島カード（`/cards`）を1つにした
 * あとの、開いた先。** 2つの面は同じ写真の同じ人を、別々の言い方で出して
 * いた。あやとの言葉（2026-09-10）:
 *
 * > /nordic/photos のUXの方がわかりやすいから統合して欲しい
 * > カードリストがダウンロードできるようにしてほしい（もちろん、キャラ埋めなしでも。）
 *
 * だから開き方も持ち帰り方も、写真の側（もとの `PhotoStudio`）に寄せた。
 *
 * ## はじめは素の写真を出す
 *
 * 前は、開いた瞬間に**1人目のキャラクターが入った絵**が出ていた。
 * あやとの言葉:「代表でキャラクターを埋めるのはやめて欲しい」。
 * 4人ぶんあるカードの1人目が、その写真の代表のように見える。
 * 開いたときに出るのは**写真そのもの**で、入れるかどうかは押した人が決める。
 *
 * ## 出ているこの絵が、そのまま持って帰る1枚
 *
 * 画面に出しているのは合成したあとの canvas なので、**見えているものと
 * 保存されるものが必ず同じ**になる。長押しでも持って帰れる。
 *
 * 保存は3段構え（`docs/nordic-photos.md` 6章）。スマホで押す人のほうが
 * 多く、`<a download>` は iOS Safari で効かないことがある。
 *   1. 端末が共有を持っていれば、そこへ渡す（iOS はここに「画像を保存」が出る）
 *   2. 無ければ `<a download>`
 *   3. どちらも駄目でも、出ている絵が焼き上がりなので長押しで保存できる
 */

/** 選ぶところに出す1人。 */
type Pick = { key: string; icon: string; name: string; place: Place | null };

export default function CardSheet({
  group,
  plans,
  onClose,
}: {
  /** 開いた写真1枚ぶん。新しい順のまま渡ってくるので並べ直さない */
  group: PhotoGroup;
  /** その日の企画。**1日に何本でも立つ** */
  plans?: PlanBrief[];
  onClose: () => void;
}) {
  /* 同じ絵の人を2度出さない。台帳は人ごとに1枚だが、Doneru から手で入った
     人と YouTube の人が同じ絵に当たることがある。 */
  const picks: Pick[] = [];
  for (const c of group.cards) {
    if (picks.some((p) => p.icon === c.icon)) continue;
    picks.push({
      key: c.id,
      icon: c.icon,
      name: c.name || "",
      // 本人が動かしたぶんだけ、その値で置く（既定は右下ひとところ）
      place: c.moved ? { x: c.x, y: c.y, rot: c.rot, scale: c.scale } : null,
    });
  }

  /** いま入れている人。**はじめは誰も入れない。** */
  const [chosen, setChosen] = useState<Pick | null>(null);
  const [out, setOut] = useState<{ url: string; blob: Blob } | null>(null);
  /** 焼けなかった理由。"photo" は写真そのもの、"chr" はキャラクターの絵 */
  const [failed, setFailed] = useState<null | "photo" | "chr">(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // 選ぶたびに焼き直す。前の1枚は URL ごと捨てる（放っておくと溜まる）
  const shot = group.url;
  const icon = chosen?.icon ?? null;
  const place = chosen?.place ?? null;
  useEffect(() => {
    let gone = false;
    let url = "";
    setOut(null);
    setFailed(null);
    (async () => {
      const [photo, chr] = await Promise.all([
        loadImage(shot),
        icon ? loadImage(cardIcon(icon, 512)) : Promise.resolve(null),
      ]);
      if (gone) return;
      if (!photo) {
        setFailed("photo");
        return;
      }
      /* **入れたのに入っていない、を黙って通さない。** キャラクターの絵が
         読めなかったときそのまま焼くと素の写真が出る。見た人は「入れた
         つもり」で持って帰ることになるので、ここで止める。 */
      if (icon && !chr) {
        setFailed("chr");
        return;
      }
      const blob = await toJpeg(compose(photo, chr, place));
      if (gone || !blob) {
        if (!gone) setFailed("photo");
        return;
      }
      url = URL.createObjectURL(blob);
      setOut({ url, blob });
    })();
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot, icon, place]);

  const save = useCallback(async () => {
    if (!out) return;
    const name = stampFileName(group.day);
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
  }, [out, group.day]);

  return (
    <div className="akd-modal" role="dialog" aria-modal="true" aria-label="あやと島カード">
      {/* 外を押しても閉じる。絵の裏なので、押せる合図は持たせない */}
      <button className="akd-back" aria-label="閉じる" onClick={onClose} />
      <div className="akd-sheet">
        <button ref={closeRef} className="akd-close" onClick={onClose} aria-label="閉じる">
          <Icon name="close" size={18} />
        </button>

        <p className="akd-sheet-h">
          <b>{cardWhen(group.day)}</b>
        </p>

        <div className="nstudio-shot">
          {out ? (
            <img src={out.url} alt={group.note || "その日の写真"} />
          ) : failed === "chr" ? (
            /* 焼けていない1枚を出しておくと、長押しで持って帰れてしまう。
               絵は出さずに、次にできることだけ言う。 */
            <p className="nstudio-off">
              このキャラクターの絵がいま読めません。
              <br />
              ほかの人にしてみてください。
            </p>
          ) : failed ? (
            <p className="nstudio-off">いま写真が読めません。あとでもう一度。</p>
          ) : (
            <div className="wait is-card" aria-hidden>
              <span />
            </div>
          )}
        </div>
        {group.note && <p className="nstudio-note">{group.note}</p>}

        {picks.length > 0 && (
          <>
            <p className="nstudio-ask">だれを入れますか</p>
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
                  key={p.key}
                  className={`npick${chosen?.icon === p.icon ? " is-on" : ""}`}
                  aria-pressed={chosen?.icon === p.icon}
                  aria-label={p.name || "この人を入れる"}
                  onClick={() => setChosen(p)}
                >
                  {/* canvas に描くのと同じ URL なので、ここでも crossOrigin を
                      付ける（付けずに先に読むと、CORS ヘッダの無い絵が
                      キャッシュに残って焼けなくなる端末がある） */}
                  <img src={cardIcon(p.icon, 128)} alt="" loading="lazy" crossOrigin="anonymous" />
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
        {/* 焼けていないときは言わない。長押しする絵がそこに無い */}
        {out && <p className="nstudio-tip">写真を長押ししても保存できます。</p>}

        {/* その日の企画への行き先。**いちばん下に置く。** 上に置くと、
            9月11日のように4本立つ日は、写真より先に青い字が4行ならんで
            そちらに目が行く（`docs/island-design.md` 3章の4）。
            ここでやることは「入れて、持って帰る」で、企画は寄り道。
            押せるのは字なので、厚みではなく下線で示す。 */}
        {plans && plans.length > 0 && (
          <div className="akd-sheet-plans">
            {plans.map((p) => (
              <Link key={p.href} className="akd-sheet-plan" href={p.href} prefetch={false}>
                {p.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
