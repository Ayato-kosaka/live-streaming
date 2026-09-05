/**
 * 旅の桟橋・たき火広場・アプリ工房で使う絵。
 *
 * `components/ui/Icon.tsx` は「記号」（閉じる・外部リンク・再生）のための線画で、
 * ここに置くのは「もの」の絵。塗りだけで作り、輪郭線を引かない。
 * 影は暖かい灰緑で右下へずらす（`docs/ac-reference.md` 3章）。
 *
 * 描き方の決まり:
 *   - viewBox は 64。小さく出すときは size で縮める
 *   - 色は3〜4色（下地・影・明るいところ・差し色）まで
 *   - 角は全部丸める。とがった角を作らない
 *   - 影は真下ではなく右下。真下の黒い影はどうぶつの森の絵にならない
 */
import type { CSSProperties } from "react";

/** 接地影。どの絵にも同じものを敷いて、浮かないようにする。 */
function Ground({ cx = 32, cy = 55, rx = 21, ry = 5 }) {
  return <ellipse cx={cx + 1.5} cy={cy + 1} rx={rx} ry={ry} fill="#8a9a72" opacity="0.32" />;
}

type ArtProps = { size?: number; className?: string; style?: CSSProperties };

function Box({ size = 48, className, style, children, label }: ArtProps & { children: React.ReactNode; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={style}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}

/** 方位。地図の隅に置く。針は北が赤。 */
export function Compass({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <circle cx="33.5" cy="33.5" r="26" fill="#8a9a72" opacity="0.3" />
      <circle cx="32" cy="32" r="26" fill="#fffbf0" />
      <circle cx="32" cy="32" r="21" fill="#fdf2d8" />
      {/* 東西南北の小さな爪。とがらせず、丸い三角にする */}
      {[0, 90, 180, 270].map((a) => (
        <rect
          key={a}
          x="30.5"
          y="7"
          width="3"
          height="7"
          rx="1.5"
          fill="#d0914e"
          transform={`rotate(${a} 32 32)`}
        />
      ))}
      <path d="M32 12q3 0 3.4 3L38 30q.6 3-2.4 3h-7.2q-3 0-2.4-3l2.6-15q.4-3 3.4-3z" fill="#ff7092" />
      <path d="M32 52q-3 0-3.4-3L26 34q-.6-3 2.4-3h7.2q3 0 2.4 3l-2.6 15q-.4 3-3.4 3z" fill="#c8b391" />
      <circle cx="32" cy="32" r="4.6" fill="#fffbf0" />
    </Box>
  );
}

/** 飛行機。乗り物の凡例と、空路のしるし。 */
export function PlaneArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <g transform="rotate(-18 32 32)">
        <path
          d="M31 8q4 0 5 6l1.6 12 15 8.6q2.4 1.4 2.4 4v3.2q0 1.8-1.8 1.3L37.8 40l-.7 9.6 5 4.4q1 .9 1 2.2v1q0 1.4-1.4 1L31 55l-10.7 3.2q-1.4.4-1.4-1v-1q0-1.3 1-2.2l5-4.4-.7-9.6-15.4 3.1q-1.8.5-1.8-1.3v-3.2q0-2.6 2.4-4L25 26l1.6-12q1-6 5-6z"
          fill="#8a9a72"
          opacity="0.3"
          transform="translate(2 2)"
        />
        <path
          d="M31 8q4 0 5 6l1.6 12 15 8.6q2.4 1.4 2.4 4v3.2q0 1.8-1.8 1.3L37.8 40l-.7 9.6 5 4.4q1 .9 1 2.2v1q0 1.4-1.4 1L31 55l-10.7 3.2q-1.4.4-1.4-1v-1q0-1.3 1-2.2l5-4.4-.7-9.6-15.4 3.1q-1.8.5-1.8-1.3v-3.2q0-2.6 2.4-4L25 26l1.6-12q1-6 5-6z"
          fill="#fffbf0"
        />
        <path
          d="M31 8q4 0 5 6l1.6 12L31 28V8zM31 40l-6.8-1.4-.7 9.6-5 4.4q-1 .9-1 2.2v1q0 1.4 1.4 1L31 55z"
          fill="#e7d8bd"
        />
        <circle cx="31" cy="20" r="3.4" fill="#32c1e2" />
      </g>
    </Box>
  );
}

/** 靴あと。歩いた区間のしるし。 */
export function BootArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={56} rx={19} ry={4.5} />
      <path
        d="M23 10q7 0 8.6 7l2 9q.8 3.6 3.6 6l4 3.4q4 3.4 4 8.6v6.4q0 5.6-5.6 5.6H21q-5.6 0-5.6-5.6V21q0-11 7.6-11z"
        fill="#c8742f"
      />
      <path d="M15.4 40h26.8v6.4q0 5.6-5.6 5.6H21q-5.6 0-5.6-5.6z" fill="#8f4d1c" />
      <path d="M23 10q7 0 8.6 7l1 4.4q-6-2.4-11.2-1.4-2 .4-2 2.6V21q0-11 7.6-11z" fill="#e59a55" />
      <circle cx="22" cy="30" r="2.6" fill="#f6d7a8" />
      <circle cx="30" cy="33" r="2.6" fill="#f6d7a8" />
    </Box>
  );
}

/** バックパック。旅の話に添える。 */
export function PackArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={56} rx={20} ry={4.5} />
      <path d="M22 12h20q3 0 3 3v6H19v-6q0-3 3-3z" fill="#3f8f70" />
      <path d="M32 5q7 0 7 7v4h-6v-4q0-1.6-1-1.6T31 12v4h-6v-4q0-7 7-7z" fill="#2f6f57" />
      <path d="M18 18h28q6 0 6 6v22q0 6-6 6H18q-6 0-6-6V24q0-6 6-6z" fill="#4fb089" />
      <path d="M12 34h40v12q0 6-6 6H18q-6 0-6-6z" fill="#3f8f70" />
      <path d="M20 36h24q3 0 3 3v5q0 3-3 3H20q-3 0-3-3v-5q0-3 3-3z" fill="#f6e3b4" />
      <rect x="28" y="21" width="8" height="10" rx="4" fill="#ffcf4d" />
      <path d="M18 18h28q6 0 6 6v3H12v-3q0-6 6-6z" fill="#6ec6a0" />
    </Box>
  );
}

/** 鍋。ごはんの話に添える。 */
export function PotArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={55} rx={22} ry={5} />
      {/* 湯気。まっすぐではなく、ゆらいだ形にする */}
      <path d="M24 16q-3-4 0-8t0-6" stroke="#dbe7d2" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M32 13q-3-4 0-8t0-5" stroke="#dbe7d2" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M40 16q-3-4 0-8t0-6" stroke="#dbe7d2" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.9" />
      <rect x="6" y="24" width="10" height="7" rx="3.5" fill="#c8763a" />
      <rect x="48" y="24" width="10" height="7" rx="3.5" fill="#c8763a" />
      <path d="M14 22h36q4 0 4 4v18q0 8-8 8H18q-8 0-8-8V26q0-4 4-4z" fill="#ef6f56" />
      <path d="M10 38h44v6q0 8-8 8H18q-8 0-8-8z" fill="#c9503c" />
      <path d="M12 18h40q4 0 4 4t-4 4H12q-4 0-4-4t4-4z" fill="#ff8f74" />
      <rect x="28" y="11" width="8" height="8" rx="4" fill="#ffcf4d" />
    </Box>
  );
}

/** 画面を書いているところ。アプリ作りの話に添える。 */
export function CodeArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={55} rx={23} ry={5} />
      <path d="M12 10h40q5 0 5 5v24q0 5-5 5H12q-5 0-5-5V15q0-5 5-5z" fill="#4a5f78" />
      <path d="M13 16h38v22H13z" fill="#eaf4fb" />
      <path d="M7 39h50q0 5-5 5H12q-5 0-5-5z" fill="#36485b" />
      <path d="M18 46h28q6 0 8 5H10q2-5 8-5z" fill="#8a9a72" opacity="0.35" />
      <rect x="17" y="20" width="13" height="3.4" rx="1.7" fill="#ff7092" />
      <rect x="17" y="26" width="20" height="3.4" rx="1.7" fill="#32c1e2" />
      <rect x="21" y="31.4" width="14" height="3.4" rx="1.7" fill="#a8bccd" />
      <rect x="39" y="26" width="8" height="3.4" rx="1.7" fill="#ffcf4d" />
    </Box>
  );
}

/** たき火。「あやと島について」の顔。キャラクター紹介とは別の絵にする。 */
export function CampArt({ size = 64, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style} label="たき火">
      <Ground cy={54} rx={25} ry={6} />
      {/* まわりの石 */}
      <ellipse cx="12" cy="49" rx="7" ry="5" fill="#b9b1a0" />
      <ellipse cx="12" cy="47.6" rx="7" ry="4.4" fill="#d6cfc0" />
      <ellipse cx="52" cy="49" rx="7" ry="5" fill="#b9b1a0" />
      <ellipse cx="52" cy="47.6" rx="7" ry="4.4" fill="#d6cfc0" />
      <ellipse cx="32" cy="52" rx="9" ry="5.6" fill="#b9b1a0" />
      <ellipse cx="32" cy="50.6" rx="9" ry="5" fill="#e2dbcc" />
      {/* 薪。2本を交差させる */}
      <rect x="9" y="40" width="46" height="8" rx="4" fill="#a2683a" transform="rotate(-13 32 44)" />
      <rect x="9" y="40" width="46" height="8" rx="4" fill="#8a5730" transform="rotate(13 32 44)" />
      <rect x="12" y="40.5" width="18" height="3" rx="1.5" fill="#c6884f" transform="rotate(-13 32 44)" />
      {/* 炎。外・中・芯の3枚 */}
      <path d="M32 6q4 8 9 13t5 12q0 13-14 13T18 31q0-7 5-12t9-13z" fill="#ff8a1f" />
      <path d="M32 16q3 5 6 9t3 8q0 8-9 8t-9-8q0-4 3-8t6-9z" fill="#ffcf4d" />
      <path d="M32 28q2 3 3 5t1 4q0 4-4 4t-4-4q0-2 1-4t3-5z" fill="#fff3bd" />
    </Box>
  );
}

/** 桟橋の杭とロープ。旅の桟橋の顔。 */
export function PierArt({ size = 64, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style} label="旅の桟橋">
      {/* 浅瀬 → 泡 → 砂の帯。島の岸と同じ重ね方 */}
      <path d="M0 44h64v20H0z" fill="#4fc8d2" />
      <path d="M0 48q8-3 16 0t16 0 16 0 16 0v16H0z" fill="#7fe0d8" />
      <path d="M0 52q8-3 16 0t16 0 16 0 16 0v12H0z" fill="#ffffff" />
      <path d="M0 55q8-3 16 0t16 0 16 0 16 0v9H0z" fill="#f5e0a8" />
      {/* 杭 */}
      <rect x="10" y="18" width="11" height="34" rx="5.5" fill="#9a6532" />
      <rect x="10" y="18" width="5" height="34" rx="2.5" fill="#c98d55" />
      <ellipse cx="15.5" cy="19" rx="5.5" ry="3" fill="#d9a56a" />
      <rect x="43" y="24" width="11" height="28" rx="5.5" fill="#9a6532" />
      <rect x="43" y="24" width="5" height="28" rx="2.5" fill="#c98d55" />
      <ellipse cx="48.5" cy="25" rx="5.5" ry="3" fill="#d9a56a" />
      {/* ロープ */}
      <path d="M15.5 24q16 16 33 6" stroke="#e0c489" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M15.5 24q16 14 33 4" stroke="#f6e3b4" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* かもめの気配ではなく、旗を1枚 */}
      <rect x="27" y="6" width="4" height="22" rx="2" fill="#b5793f" />
      <path d="M31 8h17q2 0 1 1.8l-3 5q-.6 1 0 2l3 5q1 1.8-1 1.8H31z" fill="#ff7092" />
    </Box>
  );
}

/** 工房のかなづち。アプリ工房の顔。 */
export function AnvilArt({ size = 64, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style} label="アプリ工房">
      <Ground cy={55} rx={24} ry={6} />
      {/* 作業台 */}
      <rect x="6" y="42" width="52" height="10" rx="5" fill="#a2683a" />
      <rect x="6" y="42" width="52" height="4.5" rx="2.2" fill="#c98d55" />
      {/* スマホ */}
      <rect x="18" y="12" width="28" height="34" rx="8" fill="#4a5f78" />
      <rect x="21.5" y="16" width="21" height="24" rx="4" fill="#eaf4fb" />
      <rect x="25" y="20" width="14" height="3.4" rx="1.7" fill="#ff7092" />
      <rect x="25" y="25.6" width="10" height="3.4" rx="1.7" fill="#32c1e2" />
      <rect x="25" y="31.2" width="13" height="3.4" rx="1.7" fill="#ffcf4d" />
      {/* かなづち */}
      <g transform="rotate(24 44 24)">
        <rect x="41" y="20" width="6" height="26" rx="3" fill="#b5793f" />
        <rect x="33" y="12" width="22" height="10" rx="4" fill="#8fa0ae" />
        <rect x="33" y="12" width="22" height="4.4" rx="2.2" fill="#c2cfd8" />
      </g>
    </Box>
  );
}

/** ヘッドホン。オーディオガイドの顔。 */
export function HeadphoneArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={55} rx={21} ry={5} />
      <path d="M32 8q20 0 20 20v10h-8V28q0-12-12-12T20 28v10h-8V28Q12 8 32 8z" fill="#5b7f9e" />
      <path d="M32 8q20 0 20 20v4h-8v-4q0-12-12-12T20 28v4h-8v-4Q12 8 32 8z" fill="#7ba0bd" />
      <rect x="6" y="30" width="14" height="22" rx="7" fill="#ff8a5c" />
      <rect x="6" y="30" width="14" height="10" rx="7" fill="#ffab86" />
      <rect x="44" y="30" width="14" height="22" rx="7" fill="#ff8a5c" />
      <rect x="44" y="30" width="14" height="10" rx="7" fill="#ffab86" />
      <path d="M26 44q6-4 12 0" stroke="#ffcf4d" strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </Box>
  );
}

/** 皿とフォーク。なに食べよの顔。 */
export function DishArt({ size = 48, className, style }: ArtProps) {
  return (
    <Box size={size} className={className} style={style}>
      <Ground cy={52} rx={24} ry={6} />
      <circle cx="32" cy="32" r="24" fill="#e7d8bd" />
      <circle cx="32" cy="30" r="24" fill="#fffbf0" />
      <circle cx="32" cy="30" r="16" fill="#fdf2d8" />
      <path d="M24 26q8-5 16 0t-2 12q-6 4-12 0t-2-12z" fill="#ff8a5c" />
      <ellipse cx="27" cy="27" rx="4" ry="3" fill="#ffcf4d" />
      <ellipse cx="37" cy="32" rx="3.4" ry="2.6" fill="#7be0b1" />
    </Box>
  );
}

/** スマホの画面まるごと。アプリのページで大きく見せる絵。
 *
 * 本物のスクリーンショットが手元にないので、アプリの作りを絵で描く。
 * 写真のふりはさせない（枠も中身も、絵として描いてあると分かる形にする）。
 *
 * 色は島の屋根の5色（--roof-*）と紙の色だけで塗る。
 * 前は純度の高い橙・水色・桃の直値で塗っていて、この端末だけ
 * 別のデザインシステムから持ってきたものに見えていた
 * （docs/island-world.md 6.2-4）。 */
export function PhoneShot({
  width = 190,
  screen = "food",
  className,
}: {
  width?: number;
  /** food … なに食べよ / audio … なにこれオーディオガイド */
  screen?: "food" | "audio";
  className?: string;
}) {
  // 額のぶんだけ絵の外へ出るので、viewBox は 230×430。
  // 画面（12,12〜188,388）の座標は変えない。中の絵をぜんぶ描き直さずに済む。
  const h = Math.round((width * 430) / 230);
  // 屋根の5色。ここで新しい色を作らない。
  const coral = "var(--roof-coral)";
  const sky = "var(--roof-sky)";
  const gold = "var(--roof-gold)";
  const mint = "var(--roof-mint)";
  const wood = "var(--roof-wood)";
  const paper = "var(--paper)";
  const paper2 = "var(--paper-2)";
  const ink = "var(--ink)";
  const ink3 = "var(--ink-3)";
  return (
    <svg viewBox="-12 -12 230 430" width={width} height={h} className={className} aria-hidden>
      <defs>
        <clipPath id={`ps-${screen}`}>
          <rect x="12" y="12" width="176" height="376" rx="38" />
        </clipPath>
        {/* 上からの光。塗りが平らだと、焼いたスプライトの隣で浮く */}
        <linearGradient id={`ps-lit-${screen}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#2a2415" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {/* 額は太く、角はうんと丸く（docs/ac-reference.md 6章
          「窓枠はもっと太くて、角がもっと丸い。半径が高さの 1/3 くらい」）。
          本物の端末の絵は、色の付いた分厚いふちの中に画面がはまっている。
          前は額が 10px（幅の5%）しかなくて、板の型に見えていなかった。 */}
      {/* 影は暖かい灰緑で右下へ */}
      <rect x="-2" y="-2" width="216" height="416" rx="72" fill="#8a9a72" opacity="0.3" />
      {/* 端末そのものも島の色。黒い板を置くと、ここだけ現実の物になる */}
      <rect x="-8" y="-8" width="216" height="416" rx="72" fill="var(--frame-deep)" />
      <rect x="-3" y="-3" width="206" height="406" rx="66" fill="var(--frame-dark)" />
      <rect x="12" y="12" width="176" height="376" rx="38" fill={paper} />
      <g clipPath={`url(#ps-${screen})`}>
        {screen === "food" ? (
          <>
            <rect x="12" y="12" width="176" height="66" fill={coral} />
            <rect x="26" y="30" width="70" height="9" rx="4.5" fill={paper} opacity="0.62" />
            <rect x="26" y="46" width="112" height="14" rx="7" fill={paper} />
            <rect x="152" y="34" width="22" height="22" rx="11" fill={paper} opacity="0.62" />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(0 ${92 + i * 84})`}>
                <rect x="24" y="6" width="152" height="72" rx="18" fill="#8a9a72" opacity="0.22" />
                <rect x="22" y="2" width="152" height="72" rx="18" fill={paper2} />
                <rect x="32" y="12" width="52" height="52" rx="14" fill={[gold, mint, sky][i]} />
                <circle cx="58" cy="34" r="15" fill={paper} opacity="0.75" />
                <ellipse cx="58" cy="34" rx="9" ry="7" fill={[wood, mint, sky][i]} />
                <rect x="94" y="16" width="66" height="9" rx="4.5" fill={ink} />
                <rect x="94" y="31" width="46" height="7" rx="3.5" fill={ink3} opacity="0.6" />
                <rect x="94" y="46" width="30" height="14" rx="7" fill={coral} />
                <rect x="130" y="46" width="30" height="14" rx="7" fill={mint} opacity="0.5" />
              </g>
            ))}
            <rect x="12" y="344" width="176" height="44" fill={paper2} />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={30 + i * 38} y="358" width="22" height="16" rx="8" fill={i === 0 ? coral : ink3} opacity={i === 0 ? 1 : 0.34} />
            ))}
          </>
        ) : (
          <>
            <rect x="12" y="12" width="176" height="376" fill={sky} />
            <rect x="12" y="12" width="176" height="200" fill={sky} opacity="0.55" />
            {/* 目の前のもの、という画 */}
            <ellipse cx="100" cy="196" rx="86" ry="26" fill={paper} opacity="0.3" />
            <path d="M62 196V96q0-16 16-16h44q16 0 16 16v100z" fill={wood} />
            <path d="M62 196V96q0-16 16-16h22v116z" fill={paper} opacity="0.85" />
            <rect x="78" y="112" width="44" height="46" rx="22" fill={sky} opacity="0.7" />
            <rect x="30" y="234" width="140" height="12" rx="6" fill={paper} />
            <rect x="30" y="256" width="104" height="10" rx="5" fill={paper} opacity="0.6" />
            <rect x="30" y="274" width="120" height="10" rx="5" fill={paper} opacity="0.6" />
            {/* 音の波 */}
            <g fill={gold}>
              {[10, 26, 40, 30, 18, 34, 46, 24, 12].map((v, i) => (
                <rect key={i} x={34 + i * 15} y={330 - v / 2} width="8" height={v} rx="4" />
              ))}
            </g>
            <circle cx="100" cy="364" r="17" fill={coral} />
            <path d="M95 356l14 8-14 8z" fill={paper} />
          </>
        )}
      </g>
      {/* 上からの光を画面ぜんぶにかける */}
      <rect x="12" y="12" width="176" height="376" rx="38" fill={`url(#ps-lit-${screen})`} />
      {/* 上の切りかき */}
      <rect x="76" y="12" width="48" height="13" rx="6.5" fill="var(--frame-deep)" />
    </svg>
  );
}
