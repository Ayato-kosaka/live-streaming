/**
 * 島の案内役「カモメのミナト」。
 *
 * パリからずっとあやとについてきているカモメ、という設定。
 * 島の物はぜんぶ Kenney の3Dモデルを焼いたものだけれど、
 * キットに鳥がいないのでこの子だけ手描き。
 * 線を使わず、色の差だけで形を分けるところは他のスプライトに合わせている。
 */

export const GUIDE_NAME = "ミナト";

/** 羽ばたきの有無。空を飛んでいるときは wing="fly"。 */
export function Gull({
  size = 64,
  wing = "rest",
  shadow = true,
  className,
}: {
  size?: number;
  wing?: "rest" | "fly";
  /** 地面に置くときの接地影。空にいるときは false。 */
  shadow?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 0.94}
      viewBox="0 0 100 94"
      fill="none"
      aria-hidden
    >
      <defs>
        {/* 島のスプライトは左上から光が当たっている。カモメも同じ向きで塗る。 */}
        <linearGradient id="gullBody" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="1" stopColor="#e4dcc9" />
        </linearGradient>
        <linearGradient id="gullWing" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#cdd7de" />
          <stop offset="1" stopColor="#9fadb8" />
        </linearGradient>
        <linearGradient id="gullHead" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ece5d3" />
        </linearGradient>
      </defs>

      {shadow && <ellipse cx="52" cy="86" rx="27" ry="7" fill="#2f6b3a" opacity="0.18" />}

      {/* しっぽ */}
      <path d="M70 44c11 0 20 4 26 11-8 4-17 5-25 3z" fill="url(#gullWing)" />
      {/* 体 */}
      <ellipse cx="45" cy="52" rx="30" ry="26" fill="url(#gullBody)" />
      {/* 背中の灰色(カモメらしさはここで出る) */}
      <path d="M40 27c17-3 32 6 35 21 2 10-2 19-9 25 4-14 1-33-26-46z" fill="url(#gullWing)" />
      {/* 頭 */}
      <circle cx="29" cy="32" r="19" fill="url(#gullHead)" />
      {/* くちばし */}
      <path d="M11 32c-6 1-9 3-11 6 3 3 8 5 12 5z" fill="#f8b043" />
      <path d="M11 38c-4 0-8 1-11 0 3 3 8 5 12 5z" fill="#e08b23" />
      <circle cx="4.6" cy="40.4" r="1.7" fill="#ef6b5e" />
      {/* 目 */}
      <circle cx="21" cy="28" r="3.8" fill="#3a2f24" />
      <circle cx="22.3" cy="26.7" r="1.4" fill="#fffdf6" />
      <ellipse cx="16" cy="37" rx="4.2" ry="2.6" fill="#ffbcc6" opacity="0.65" />
      {/* 翼 */}
      <g className={wing === "fly" ? "gull-wing" : undefined} style={{ transformOrigin: "44px 44px" }}>
        <path d="M43 45c-5-13 3-26 17-29 4 10 2 24-7 33z" fill="url(#gullWing)" />
        <path d="M56 18c3 3 5 8 5 13-3-4-6-8-9-10z" fill="#5d6b76" />
      </g>
      {/* 足 */}
      {wing === "rest" && (
        <g stroke="#f8b043" strokeWidth="3.6" strokeLinecap="round">
          <path d="M38 76v5M38 81l-4 3M38 81l4 3" />
          <path d="M53 76v5M53 81l-4 3M53 81l4 3" />
        </g>
      )}
    </svg>
  );
}

/**
 * 案内役のひとこと。島の上や各ページの頭に出す。
 * 文はぜんぶ「ミナトが話している」つもりで書く。
 */
export function GuideSay({
  children,
  size = 56,
  className = "",
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`gsay ${className}`}>
      <span className="gsay-bird">
        <Gull size={size} />
      </span>
      <p className="gsay-bubble">{children}</p>
    </div>
  );
}
