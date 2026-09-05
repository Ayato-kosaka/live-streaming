"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/IconCore";

/**
 * 地図を、押せる大きさで開く器。
 *
 * ## なぜ要るか
 *
 * 北欧の地図は 390px の画面で 340px にしかならない。タリンとヘルシンキは
 * 中心どうしが 15px しか離れていないので、両方に 48px の口を置くと必ず
 * 重なる。国のかたちを押しどころにしても、ラトビアは 28px 角しか取れない
 * （実測。6つの行き先のうち3つが 48px 角に届いていなかった）。
 *
 * 地図そのものを 1,120px 幅にすれば全部が 48px を超える。ただし**紙の上で
 * 横に流すと、旅の全体が一度に見えなくなる。** 地図の役目は俯瞰なので、
 * そこは削れない。
 *
 * だから**面を2つに分ける**。紙の上に載っているのは俯瞰の絵で、押せるのは
 * 「大きく見る」の1つだけ。押すと全画面が立ち上がり、そちらは 1,120px 幅で
 * 動かせる。俯瞰は俯瞰のまま残り、押す用の面が別に立つ。
 *
 * ## 閉じているあいだ、中の行き先は的にしない
 *
 * `inert` を掛けて、押せもせず、キーボードでも拾わず、読み上げにも出ないように
 * する。`pointer-events: none` だけだと、指では押せないのに Tab では止まる
 * 「見えない的」が 17個残る。地図が何の地図かは、外側のボタンが名乗る。
 *
 * ## `/map` には使っていない
 *
 * 世界地図で同じことをやると、オーストリアとスロバキアを 48px 離すのに
 * **4,636px 幅**が要る。スマホの画面 12枚ぶんで、開いた先で迷子になる。
 * あちらはピンをたたむほうで解いた（`components/atlas/clump.ts`）。
 */
export default function MapZoom({
  children,
  label,
  hint,
  wide = 1120,
}: {
  children: React.ReactNode;
  /** この地図が何の地図か。閉じているときのボタンが、これを名乗る。 */
  label: string;
  /** 開いた面の上に出す一言。何を押せるかを言う。 */
  hint: string;
  /** 開いた面での地図の幅（px）。ここが 48px の口の出どころ。 */
  wide?: number;
}) {
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 開いているあいだは、後ろの紙を動かさない。全画面の地図を指で動かすと、
  // 端まで来たところで後ろのページが動きだして、地図から目が離れる。
  useEffect(() => {
    if (!open) return;
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    // 真ん中から見せる。左上のままだと、北欧の地図はノルウェーの海から始まって、
    // 開いた瞬間に道が1本も見えない。
    const sc = scrollRef.current;
    if (sc) {
      sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
      sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = keep;
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  // 閉じたら、開いたボタンへ戻す。戻さないと、閉じたあとの Tab が
  // ページの頭から始まって、地図まで下りなおすことになる。
  useEffect(() => {
    if (!open) openRef.current?.focus({ preventScroll: true });
    // 最初の描画では動かさない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (open) {
    return (
      <div className="mzoom-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="mzoom-bar">
          <p>{hint}</p>
          <button type="button" className="mzoom-close" onClick={() => setOpen(false)} ref={closeRef}>
            <Icon name="close" size={15} />
            とじる
          </button>
        </div>
        <div className="mzoom-scroll" ref={scrollRef}>
          <div className="mzoom-in" style={{ minWidth: `${wide}px` }}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mzoom">
      {/* 閉じているあいだの地図は、紙に刷った図版。中の行き先は的にしない */}
      <div className="mzoom-still" inert>
        {children}
      </div>
      <button
        type="button"
        className="mzoom-open"
        onClick={() => setOpen(true)}
        ref={openRef}
        aria-label={`${label}を大きく開く`}
      >
        <span>大きく見る</span>
      </button>
    </div>
  );
}
