/**
 * 「これから」「掲示板」「仲間」「いまのポスト」の4つの面で使う絵。
 *
 * `components/ui/Icon.tsx` は島ぜんぶで共有する印を置くところなので、
 * この4つの面でしか出てこないものは、ここに置く。
 *
 * 描き方は島の絵と同じ（`docs/island-design.md` / `docs/ac-reference.md`）:
 *   - 輪郭線を引かない。形は色の差だけで見せる
 *   - 1つの絵に2〜4色。ベース・影・ハイライト・差し色
 *   - 影は黒くしない。接地影だけ暖かい灰緑で、光の反対（右下）へずらす
 *   - 角は全部丸める
 *   - viewBox は 48 か 64 で描いて、表示だけ小さくする
 */

/** 接地影。どの絵でも同じ色・同じずれ方にして、光の向きを揃える。 */
const SHADE = "#7d9268";

/**
 * しらせのベル。
 *
 * 「これからの予定」への入口に付ける通知の印。
 * 赤い丸は「まだ見ていない予定がある」の合図で、これ1種類しか使わない
 * （光・きらめき・バッジを混ぜない、という決まりのため）。
 */
export function NoticeBell({ size = 26, quiet = false }: { size?: number; quiet?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false" className="nbell">
      <ellipse cx="33" cy="55.5" rx="16" ry="3.6" fill={SHADE} opacity="0.34" />
      {/* 吊り手。丸い棒を1本 */}
      <rect x="28.5" y="4" width="7" height="9" rx="3.5" fill="#a4712f" />
      <rect x="28.5" y="4" width="4.4" height="8" rx="2.2" fill="#c68f45" />
      {/* 本体。下に向かって広がる釣鐘。暗いほうを先に置いて、明るい面を左上に重ねる */}
      <path
        d="M32 9c-9.4 0-15 7-15 16.5V35c0 3.6-1.6 6-4 7.6h38c-2.4-1.6-4-4-4-7.6v-9.5C47 16 41.4 9 32 9z"
        fill="#d99a25"
      />
      <path
        d="M31 9.4c-8.4.6-13.4 7.2-13.4 16.1V35c0 3.4-1.4 5.8-3.6 7.6h24c-2.2-1.8-3.6-4.2-3.6-7.6v-9.5c0-8.7 1-14.1-3.4-16.1z"
        fill="#ffcf4d"
      />
      {/* 左上のつや。面を1枚足すだけで金属に見える */}
      <path d="M25.5 15.5c-2.8 2.6-4.2 6-4.2 10.2V34c0 1.4-.2 2.6-.6 3.7h-3c1.1-1.5 1.6-2.6 1.6-4.2v-8.2c0-4.6 2-8.4 6.2-9.8z" fill="#ffeaa8" />
      {/* 口の帯 */}
      <rect x="11" y="41.4" width="42" height="7.6" rx="3.8" fill="#b87f22" />
      <rect x="11" y="40.6" width="42" height="6.2" rx="3.1" fill="#f5c246" />
      {/* 舌 */}
      <circle cx="32" cy="51.6" r="4.4" fill="#b87f22" />
      <circle cx="31.2" cy="50.8" r="3.4" fill="#e9b03c" />
      {/* 赤い丸。これが「まだ見ていない」の合図 */}
      {!quiet && (
        <g className="nbell-dot">
          <circle cx="50" cy="15" r="12" fill="#fffbf0" />
          <circle cx="50" cy="15" r="9.2" fill="#e04a68" />
          <circle cx="47.4" cy="12.2" r="3.2" fill="#ff8ea3" />
        </g>
      )}
    </svg>
  );
}

/**
 * 道の飛び石。これからの予定を、上から順に踏んでいく石として並べる。
 * 一覧を縦の点線で結ぶより、島を歩いている絵のほうがこの島には合う。
 */
export function Stone({ tone = "stone" }: { tone?: "stone" | "now" | "past" }) {
  const face =
    tone === "now" ? "#ffd766" :
    tone === "past" ? "#d8cdb4" : "#f3e6c6";
  const side =
    tone === "now" ? "#d99a25" :
    tone === "past" ? "#b0a58d" : "#cdb98c";
  return (
    <svg viewBox="0 0 48 48" width={48} height={48} aria-hidden focusable="false">
      <ellipse cx="24.8" cy="38" rx="18" ry="5" fill={SHADE} opacity="0.32" />
      {/* 石の側面 → 上の面。厚みで「乗っている」ことを出す */}
      <ellipse cx="24" cy="28" rx="19" ry="12" fill={side} />
      <ellipse cx="24" cy="24.5" rx="19" ry="12" fill={face} />
      <ellipse cx="19" cy="20.5" rx="8" ry="4" fill="#fffbf0" opacity="0.5" />
      {/* 石のわきの草。地面に生えているものが1つあるだけで、面が更地に見えなくなる */}
      <path d="M6.5 30c-.4-3.4.3-6.2 2-8.4.3 3 .8 5.6 1.6 7.8z" fill="#63b043" />
      <path d="M9.6 30.6c.6-3 2-5.3 4.2-7-.7 2.8-1.1 5.1-1.2 7.2z" fill="#8ed35f" />
      <path d="M40 31c1-2.8 2.6-4.9 5-6.3-1.2 2.5-2 4.7-2.4 6.7z" fill="#63b043" />
    </svg>
  );
}

/**
 * 画びょう。付箋と、掲示板に貼った紙の上に置く。
 * 紙が「貼ってある」ことを、傾きだけでなく物でも見せる。
 */
export function Pin({ tone = "#e8879a", size = 20 }: { tone?: string; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false">
      <ellipse cx="25" cy="40" rx="9" ry="2.6" fill={SHADE} opacity="0.3" />
      <rect x="21.5" y="22" width="5" height="17" rx="2.5" fill="#b58a55" />
      <circle cx="24" cy="19" r="14" fill={tone} />
      <circle cx="24" cy="17.6" r="11.6" fill="#fff" opacity="0.16" />
      <circle cx="19" cy="13.5" r="4.4" fill="#fff" opacity="0.55" />
    </svg>
  );
}

/**
 * 愉快な仲間達の見出しの絵。3人が並んで立っているところ。
 *
 * たき火（あやと島について）と同じ絵を使うと、別の場所に来た気がしない。
 * ここは「人が集まっている」ことだけを描く。光は左上から。
 */
export function FriendsMark({ size = 60 }: { size?: number }) {
  const skin = "#ffdfba";
  const skinLo = "#f0c496";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      {/* 立っている地面。島と同じ草の色。丸く切って、板の上に乗っている感じにする */}
      <ellipse cx="32" cy="52" rx="27" ry="9" fill="#63b043" />
      <ellipse cx="32" cy="50.5" rx="27" ry="8.4" fill="#8ed35f" />
      <ellipse cx="31" cy="49" rx="24" ry="6.6" fill="#a5e074" />
      {/* 足元の影。暖かい灰緑を、光の反対（右下）へずらす */}
      <ellipse cx="17.5" cy="49.5" rx="7.5" ry="2.4" fill="#5c9440" opacity="0.4" />
      <ellipse cx="47" cy="49.5" rx="7.5" ry="2.4" fill="#5c9440" opacity="0.4" />
      <ellipse cx="33" cy="52.6" rx="10.5" ry="3" fill="#5c9440" opacity="0.45" />

      {/* 左の子。おだんご頭。手を上げている */}
      <g>
        <ellipse cx="10.6" cy="38.5" rx="2.7" ry="4.4" fill="#4f9e77" transform="rotate(-24 10.6 38.5)" />
        <rect x="9.5" y="34" width="16" height="15" rx="7" fill="#4f9e77" />
        <rect x="9.5" y="33.4" width="14.6" height="14.4" rx="6.8" fill="#6fc79a" />
        <circle cx="17.5" cy="24.6" r="9" fill={skinLo} />
        <circle cx="16.8" cy="23.9" r="8.3" fill={skin} />
        <circle cx="17.5" cy="12.6" r="3.4" fill="#7a5136" />
        <path d="M8.6 24.2a8.9 8.9 0 0 1 17.8 0c-2.3-3.4-5.4-5.1-8.9-5.1s-6.6 1.7-8.9 5.1z" fill="#7a5136" />
        <circle cx="14.4" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="20.6" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="11.9" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
        <circle cx="23" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
      </g>

      {/* 右の子。短い髪 */}
      <g>
        <ellipse cx="55.6" cy="42" rx="2.6" ry="4.2" fill="#3f9ac6" transform="rotate(16 55.6 42)" />
        <rect x="39" y="34" width="16" height="15" rx="7" fill="#3f9ac6" />
        <rect x="39" y="33.4" width="14.6" height="14.4" rx="6.8" fill="#63bfe8" />
        <circle cx="47" cy="24.6" r="9" fill={skinLo} />
        <circle cx="46.3" cy="23.9" r="8.3" fill={skin} />
        <path d="M38.1 24.6a8.9 8.9 0 0 1 17.8 0c-1.2-2.2-2.5-3.4-4-3.7-1.5 1.3-3.1 2-4.9 2-2.9 0-5.2-1.1-6.9-3.2a8.9 8.9 0 0 0-2 4.9z" fill="#5c4030" />
        <circle cx="43.9" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="50.1" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="41.4" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
        <circle cx="52.5" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
      </g>

      {/* 手前のひとり。いちばん大きく、いちばん明るい */}
      <g>
        <ellipse cx="21.4" cy="44" rx="2.9" ry="4.6" fill="#d95e75" transform="rotate(18 21.4 44)" />
        <ellipse cx="42.6" cy="44" rx="2.9" ry="4.6" fill="#d95e75" transform="rotate(-18 42.6 44)" />
        <rect x="22" y="36" width="20" height="17" rx="8.5" fill="#d95e75" />
        <rect x="22" y="35.2" width="18.4" height="16.4" rx="8.2" fill="#f0798d" />
        <circle cx="32" cy="24.4" r="11" fill={skinLo} />
        <circle cx="31.2" cy="23.6" r="10.2" fill={skin} />
        {/* 前髪。輪郭線は引かず、面のかたちだけで髪型を出す */}
        <path d="M21.1 24.4a10.9 10.9 0 0 1 21.8 0c-1-4-2.9-6.4-5.7-7.4-1.5 2-3.2 3-5.2 3s-3.7-1-5.2-3c-2.8 1-4.7 3.4-5.7 7.4z" fill="#6b4a35" />
        <path d="M24.3 19.6a10.9 10.9 0 0 1 5.6-4.2c-2 1.3-3.7 2.8-4.7 4.6z" fill="#8a6247" />
        <circle cx="27.9" cy="25.4" r="1.45" fill="#4a3527" />
        <circle cx="36.1" cy="25.4" r="1.45" fill="#4a3527" />
        <circle cx="24.6" cy="28.4" r="2" fill="#ffb3ba" opacity="0.85" />
        <circle cx="39.4" cy="28.4" r="2" fill="#ffb3ba" opacity="0.85" />
      </g>
    </svg>
  );
}

/**
 * キャラクターの台座。住人の絵の後ろに敷く、島の切り株。
 * 丸くくり抜いた絵をそのまま並べると宙に浮くので、必ず地面ごと置く。
 */
export function Pedestal({ w = 96 }: { w?: number }) {
  return (
    <svg viewBox="0 0 96 30" width={w} height={(w * 30) / 96} aria-hidden focusable="false" className="rz-pad">
      <ellipse cx="49" cy="22" rx="34" ry="7" fill={SHADE} opacity="0.3" />
      <ellipse cx="48" cy="17" rx="34" ry="9" fill="#5c9440" />
      <ellipse cx="48" cy="14" rx="34" ry="9" fill="#8ed35f" />
      <ellipse cx="42" cy="11.5" rx="16" ry="4" fill="#a5e074" />
      {/* 草の房。左右にひとつずつ */}
      <path d="M13 15c-.4-3.2.4-5.8 2.4-7.8.2 2.9.6 5.4 1.3 7.5z" fill="#63b043" />
      <path d="M79 15.6c.8-2.8 2.3-4.9 4.6-6.3-1.2 2.4-2 4.5-2.3 6.4z" fill="#63b043" />
    </svg>
  );
}

/**
 * 空っぽの掲示板。まだ1件も貼られていないときに出す。
 * 「まだありません」と字で書くより、空いている板を見せたほうが早い。
 */
export function EmptyBoard({ w = 150 }: { w?: number }) {
  return (
    <svg viewBox="0 0 120 88" width={w} height={(w * 88) / 120} aria-hidden focusable="false" style={{ display: "block", margin: "4px auto 0" }}>
      <ellipse cx="62" cy="82" rx="42" ry="5" fill={SHADE} opacity="0.3" />
      {/* 脚 */}
      <rect x="28" y="58" width="9" height="22" rx="4.5" fill="#a4712f" />
      <rect x="83" y="58" width="9" height="22" rx="4.5" fill="#a4712f" />
      {/* 板の厚み → 板 */}
      <rect x="10" y="10" width="100" height="56" rx="12" fill="#a4712f" />
      <rect x="10" y="7" width="100" height="55" rx="12" fill="#d69a52" />
      <rect x="15" y="12" width="90" height="45" rx="8" fill="#f6ead0" />
      {/* 貼るところが空いている、という絵。紙は淡い面で置く。点線は使わない */}
      <rect x="23" y="19" width="28" height="21" rx="5" fill="#fff6b8" transform="rotate(-3.5 37 29)" />
      <rect x="63" y="22" width="28" height="21" rx="5" fill="#d6f0ff" transform="rotate(2.5 77 32)" />
      <circle cx="37" cy="20" r="3" fill="#e8879a" />
      <circle cx="77" cy="23.5" r="3" fill="#7fd3a2" />
      {/* 空いている場所。ここに自分の紙が入る */}
      <rect x="40" y="44" width="34" height="11" rx="5" fill="#eaddc0" />
    </svg>
  );
}
