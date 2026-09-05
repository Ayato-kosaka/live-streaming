/**
 * 配信・料理・伝説の面で使う絵。
 *
 * `components/ui/Icon.tsx` は「記号」だけを持つ場所なので、
 * ここには記号ではなく **小さなイラスト** を置く（`docs/island-design.md`）。
 * 島のスプライトと並べても浮かないように、焼いてある絵と同じ作りにそろえてある。
 *
 *   - 輪郭線を引かない。形は面と面の色の差だけで見せる
 *   - 環境光を強くして、明るい面と暗い面の2枚で立体にする
 *   - 接地影は暖かい灰緑。真下ではなく右下へずらす（`docs/ac-reference.md`）
 *   - 角は全部丸める。とがった頂点を作らない
 *   - viewBox は 64 で描いて、表示だけ小さくする
 */

type P = { size?: number; className?: string };

/** 接地影。どの絵も同じ色・同じずれ方にして、並べたときに光源をそろえる。 */
const Ground = ({ cx = 33.5, cy = 55, rx = 19, ry = 4.6 }: { cx?: number; cy?: number; rx?: number; ry?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#7f9478" opacity="0.3" />
);

const svg = (className?: string, size = 44): React.SVGProps<SVGSVGElement> => ({
  className: `art${className ? " " + className : ""}`,
  width: size,
  height: size,
  viewBox: "0 0 64 64",
  "aria-hidden": true,
  focusable: "false",
});

/** 企画会議。黒板と、そこに飛んでくる声。 */
export function ArtMeeting({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={54.5} rx={20} />
      {/* 脚 */}
      <rect x="18" y="42" width="5" height="13" rx="2.5" fill="#a9743f" transform="rotate(-9 20.5 48)" />
      <rect x="41" y="42" width="5" height="13" rx="2.5" fill="#a9743f" transform="rotate(9 43.5 48)" />
      {/* 板の枠 */}
      <rect x="8" y="12" width="48" height="34" rx="9" fill="#d79a55" />
      <rect x="8" y="12" width="48" height="30" rx="9" fill="#e8b271" />
      {/* 板 */}
      <rect x="13" y="17" width="38" height="21" rx="6" fill="#3f7358" />
      <rect x="13" y="17" width="38" height="10" rx="6" fill="#4a8465" />
      {/* 書いてある字 */}
      <rect x="18" y="22" width="20" height="3" rx="1.5" fill="#eaf6e6" opacity="0.85" />
      <rect x="18" y="29" width="27" height="3" rx="1.5" fill="#eaf6e6" opacity="0.6" />
      {/* 声 */}
      <path d="M38 4h16a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6h-8l-6 5 1-5h-3a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z" fill="#fffbf0" />
      <circle cx="43" cy="13" r="2" fill="#e8b271" />
      <circle cx="49" cy="13" r="2" fill="#e8b271" />
    </svg>
  );
}

/** 買い出し。市場のかご。 */
export function ArtBasket({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={53} rx={20} />
      {/* 持ち手 */}
      <path d="M20 28a12 12 0 0 1 24 0h-6a6 6 0 0 0-12 0z" fill="#b47a3e" />
      {/* 中身。かごの縁より上に出す */}
      <circle cx="24" cy="28" r="6.5" fill="#ef6f5c" />
      <circle cx="22" cy="26" r="2.4" fill="#ff9887" opacity="0.75" />
      <path d="M40 22c5 0 8 3.4 8 7.5 0 2.6-2 3.5-4.5 3.5-4 0-7.5-2.6-7.5-6.4 0-2.6 1.7-4.6 4-4.6z" fill="#7cc24a" />
      <path d="M40 22c-1.4 2.6-1.8 5.6-1 8.6" fill="none" stroke="#66aa3a" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="32" cy="30" rx="6" ry="4.6" fill="#f3c469" />
      {/* かご */}
      <path d="M14 30h36l-3.4 16.6a5 5 0 0 1-4.9 4H22.3a5 5 0 0 1-4.9-4z" fill="#d79a55" />
      <path d="M14 30h36l-1 5H15z" fill="#eebb7c" />
      <rect x="20" y="36" width="24" height="3" rx="1.5" fill="#c1863f" opacity="0.7" />
      <rect x="22" y="42" width="20" height="3" rx="1.5" fill="#c1863f" opacity="0.55" />
    </svg>
  );
}

/** 調理。ふたを開けた鍋と湯気。 */
export function ArtPot({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={53.5} rx={20} />
      {/* 湯気 */}
      <path d="M25 16c0-4 3.5-4 3.5-8S25 3 25 3" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" opacity="0.75" />
      <path d="M34 14c0-4.5 4-4.5 4-9s-4-4.5-4-4.5" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" opacity="0.6" />
      <path d="M43 17c0-3.4 3-3.4 3-6.8" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" opacity="0.45" />
      {/* 取っ手 */}
      <rect x="4" y="30" width="12" height="6.5" rx="3.2" fill="#b1493d" />
      <rect x="48" y="30" width="12" height="6.5" rx="3.2" fill="#b1493d" />
      {/* 本体 */}
      <path d="M11 26h42v13.5a11 11 0 0 1-11 11H22a11 11 0 0 1-11-11z" fill="#e8604f" />
      <path d="M11 26h42v6.5H11z" fill="#f4836f" />
      <path d="M15 34c0 8 2 12 5 14.6-4.4-1.6-7-5.4-7-10.6z" fill="#ff9d86" opacity="0.55" />
      {/* 縁 */}
      <ellipse cx="32" cy="26" rx="22" ry="5.4" fill="#f9a08c" />
      <ellipse cx="32" cy="25.4" rx="17.5" ry="3.6" fill="#c9503f" />
    </svg>
  );
}

/** リベンジ。もう一度やる日の火。 */
export function ArtFlame({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={54} rx={16} ry={4} />
      <path d="M32 4c9 8 16 13.5 16 24 0 10-7.4 17-16 17s-16-7-16-17c0-6.4 3.4-9.6 6.6-13 .9 3.2 2.6 5 4.7 5 3.2 0 4.6-3.6 4.6-8.4 0-3.2-.3-5.6-.9-7.6z" fill="#ff8a3c" />
      <path d="M32 21c5 5 9 8.4 9 14.6 0 5.8-4.2 9.6-9 9.6s-9-3.8-9-9.6c0-4 2-6.4 4.2-8.6.6 2 1.6 3 2.8 3 1.8 0 2.6-2 2.6-4.8 0-1.8-.2-3.2-.6-4.2z" fill="#ffcb45" />
      <path d="M32 33c2.8 2.6 4.4 4.4 4.4 7.4 0 2.8-2 4.6-4.4 4.6s-4.4-1.8-4.4-4.6c0-2 1-3.4 2.2-4.6.3 1 .8 1.5 1.4 1.5.9 0 1.3-1 1.3-2.4z" fill="#fff2c2" />
    </svg>
  );
}

/** 配信そのもの。三脚に載ったカメラ。 */
export function ArtCam({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={55} rx={18} ry={4.2} />
      {/* 三脚 */}
      <rect x="30" y="36" width="5" height="18" rx="2.5" fill="#8a7052" />
      <rect x="18" y="40" width="5" height="16" rx="2.5" fill="#a08668" transform="rotate(-20 20.5 48)" />
      <rect x="41" y="40" width="5" height="16" rx="2.5" fill="#a08668" transform="rotate(20 43.5 48)" />
      {/* 本体 */}
      <rect x="8" y="14" width="40" height="26" rx="9" fill="#5c7f9a" />
      <rect x="8" y="14" width="40" height="11" rx="9" fill="#6f95b1" />
      <path d="M48 22l10-6v20l-10-6z" fill="#4d6d86" />
      {/* レンズ */}
      <circle cx="27" cy="28" r="9.5" fill="#3f5d75" />
      <circle cx="27" cy="28" r="6.5" fill="#a8dcf0" />
      <circle cx="24.5" cy="25.5" r="2.4" fill="#eafaff" opacity="0.9" />
      {/* 録画中の赤 */}
      <circle cx="42" cy="20" r="3.2" fill="#ff6b6b" />
    </svg>
  );
}

/** 伝説の台。リボンの付いたメダル。 */
export function ArtMedal({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <path d="M17 4h11l6 20-11 5z" fill="#e2596d" />
      <path d="M47 4H36l-6 20 11 5z" fill="#c73f55" />
      <Ground cx={34} cy={57} rx={16} ry={3.6} />
      <circle cx="32" cy="40" r="19" fill="#dfa32c" />
      <circle cx="32" cy="40" r="15.5" fill="#ffd24a" />
      <circle cx="32" cy="40" r="11.5" fill="#ffe89a" />
      <path d="M32 31.5l3 6.4 7 1-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-1z" fill="#e8a92c" />
      <ellipse cx="25" cy="33" rx="5" ry="3.2" fill="#fff6d4" opacity="0.65" transform="rotate(-32 25 33)" />
    </svg>
  );
}

/** スタンプ帳の印。押すとインクが残る。 */
export function ArtStamp({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <ellipse cx="34" cy="54" rx="18" ry="4.4" fill="#7f9478" opacity="0.28" />
      {/* 押した跡 */}
      <circle cx="32" cy="49" r="12" fill="#e2596d" opacity="0.28" />
      {/* 台 */}
      <rect x="16" y="36" width="32" height="11" rx="5.5" fill="#8a5a30" />
      <rect x="16" y="36" width="32" height="5" rx="2.5" fill="#a5713f" />
      {/* 軸 */}
      <rect x="27" y="21" width="10" height="17" rx="5" fill="#c1863f" />
      {/* 握り */}
      <ellipse cx="32" cy="17" rx="13" ry="8" fill="#d79a55" />
      <ellipse cx="32" cy="15" rx="13" ry="8" fill="#eebb7c" />
      <ellipse cx="26" cy="12" rx="5" ry="2.8" fill="#fff1d6" opacity="0.7" />
    </svg>
  );
}

/** 天気のいい日。おさんぽの合図。 */
export function ArtSun({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <g fill="#ffd98a">
        <rect x="29" y="2" width="6" height="10" rx="3" />
        <rect x="29" y="47" width="6" height="10" rx="3" />
        <rect x="2" y="26" width="10" height="6" rx="3" />
        <rect x="52" y="26" width="10" height="6" rx="3" />
        <rect x="9" y="9" width="6" height="10" rx="3" transform="rotate(-45 12 14)" />
        <rect x="49" y="9" width="6" height="10" rx="3" transform="rotate(45 52 14)" />
        <rect x="9" y="40" width="6" height="10" rx="3" transform="rotate(45 12 45)" />
        <rect x="49" y="40" width="6" height="10" rx="3" transform="rotate(-45 52 45)" />
      </g>
      <circle cx="32" cy="29" r="16" fill="#f7b731" />
      <circle cx="32" cy="29" r="13" fill="#ffd24a" />
      <ellipse cx="26" cy="23" rx="5.5" ry="3.6" fill="#fff3c4" opacity="0.8" transform="rotate(-30 26 23)" />
    </svg>
  );
}

/** 月末。1ヶ月ぶんを読み返して選ぶ日。 */
export function ArtTrophy({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={55} rx={17} ry={4} />
      <rect x="19" y="47" width="26" height="8" rx="4" fill="#c1863f" />
      <rect x="19" y="47" width="26" height="4" rx="2" fill="#d79a55" />
      <rect x="28" y="38" width="8" height="11" rx="3" fill="#dfa32c" />
      <path d="M14 12h36v11c0 10-8 17-18 17s-18-7-18-17z" fill="#ffd24a" />
      <path d="M14 12h36v6H14z" fill="#ffe89a" />
      <path d="M20 18c0 10 1.6 15 5 19-6-2.6-9.6-8.6-9.6-16.4V18z" fill="#fff3c4" opacity="0.6" />
      <path d="M50 15h4a7 7 0 0 1 0 14h-3v-5h3a2 2 0 0 0 0-4h-4z" fill="#dfa32c" />
      <path d="M14 15h-4a7 7 0 0 0 0 14h3v-5h-3a2 2 0 0 1 0-4h4z" fill="#dfa32c" />
    </svg>
  );
}

/** 作ったアプリ。工房のノートパソコン。 */
export function ArtLaptop({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={52} rx={22} ry={4.4} />
      <path d="M12 14a5 5 0 0 1 5-5h30a5 5 0 0 1 5 5v24H12z" fill="#6f95b1" />
      <rect x="16" y="13" width="32" height="21" rx="3.5" fill="#cbeaf7" />
      <rect x="20" y="17" width="16" height="3" rx="1.5" fill="#5c9fc2" />
      <rect x="20" y="23" width="22" height="3" rx="1.5" fill="#8fc8de" />
      <rect x="20" y="28" width="12" height="3" rx="1.5" fill="#8fc8de" />
      <path d="M6 38h52a4 4 0 0 1-4 6H10a4 4 0 0 1-4-6z" fill="#88a9c1" />
      <rect x="26" y="39.5" width="12" height="2.6" rx="1.3" fill="#5c7f9a" />
    </svg>
  );
}

/** 歩く。おさんぽの足あと。 */
export function ArtBoots({ size, className }: P) {
  return (
    <svg {...svg(className, size)}>
      <Ground cx={34} cy={54} rx={20} ry={4.4} />
      <path d="M13 14a5 5 0 0 1 10 0v14c0 3 2 4 5 6 3.4 2.2 5 3.6 5 6.5V44a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill="#6b8f5f" />
      <path d="M13 40h20v4a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill="#4d6b45" />
      <path d="M13 18h10v5H13z" fill="#8bb07c" />
      <path d="M36 20a4.5 4.5 0 0 1 9 0v11c0 2.6 1.7 3.4 4.2 5 2.9 1.9 4.3 3 4.3 5.5v2.8a3.6 3.6 0 0 1-3.6 3.7H39.6A3.6 3.6 0 0 1 36 44.3z" fill="#8bb07c" />
      <path d="M36 41h17.5v3.3a3.6 3.6 0 0 1-3.6 3.7H39.6A3.6 3.6 0 0 1 36 44.3z" fill="#5d8250" />
    </svg>
  );
}
