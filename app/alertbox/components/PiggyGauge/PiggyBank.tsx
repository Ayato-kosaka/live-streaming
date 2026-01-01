import React from "react";
import Svg, {
  Defs,
  ClipPath,
  Path,
  Rect,
  G,
  Ellipse,
  Circle,
} from "react-native-svg";

interface PiggyBankProps {
  width: number;
  height: number;
  progress: number; // 0-1
}

export const PiggyBank: React.FC<PiggyBankProps> = ({
  width,
  height,
  progress,
}) => {
  const viewBoxWidth = 600;
  const viewBoxHeight = 260;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
    >
      <Defs>
        {/* クリップパス：進捗に応じて左から右に塗りを表示 */}
        <ClipPath id="progressClip">
          <Rect
            x="0"
            y="0"
            width={viewBoxWidth * progress}
            height={viewBoxHeight}
          />
        </ClipPath>
      </Defs>

      {/* 影 */}
      <G id="Shadow">
        <Ellipse
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight - 10}
          rx="240"
          ry="15"
          fill="rgba(0, 0, 0, 0.1)"
        />
      </G>

      {/* 豚のベース（薄いグレー） */}
      <G id="PigBody">
        <Ellipse
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2}
          rx="250"
          ry="100"
          fill="#f0f0f0"
        />
        {/* 鼻 */}
        <Ellipse cx="450" cy="125" rx="35" ry="30" fill="#e8e8e8" />
        {/* 鼻の穴 */}
        <Ellipse cx="440" cy="120" rx="6" ry="8" fill="#d0d0d0" />
        <Ellipse cx="460" cy="120" rx="6" ry="8" fill="#d0d0d0" />
        {/* 耳（左） */}
        <Ellipse cx="220" cy="60" rx="25" ry="40" fill="#e8e8e8" />
        {/* 耳（右） */}
        <Ellipse cx="380" cy="60" rx="25" ry="40" fill="#e8e8e8" />
        {/* 足（4本） */}
        <Ellipse cx="200" cy="180" rx="20" ry="35" fill="#e8e8e8" />
        <Ellipse cx="270" cy="185" rx="20" ry="35" fill="#e8e8e8" />
        <Ellipse cx="330" cy="185" rx="20" ry="35" fill="#e8e8e8" />
        <Ellipse cx="400" cy="180" rx="20" ry="35" fill="#e8e8e8" />
        {/* しっぽ */}
        <Path
          d="M 120 120 Q 90 100, 85 85 Q 80 70, 90 60"
          stroke="#e8e8e8"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />
      </G>

      {/* 進捗塗りエリア（クリップされる） */}
      <G id="PigFillArea" clipPath="url(#progressClip)">
        <Ellipse
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2}
          rx="250"
          ry="100"
          fill="#ffc0cb"
        />
        {/* 鼻 */}
        <Ellipse cx="450" cy="125" rx="35" ry="30" fill="#ffb0bb" />
        {/* 鼻の穴 */}
        <Ellipse cx="440" cy="120" rx="6" ry="8" fill="#ff90a0" />
        <Ellipse cx="460" cy="120" rx="6" ry="8" fill="#ff90a0" />
        {/* 耳（左） */}
        <Ellipse cx="220" cy="60" rx="25" ry="40" fill="#ffb0bb" />
        {/* 耳（右） */}
        <Ellipse cx="380" cy="60" rx="25" ry="40" fill="#ffb0bb" />
        {/* 足（4本） */}
        <Ellipse cx="200" cy="180" rx="20" ry="35" fill="#ffb0bb" />
        <Ellipse cx="270" cy="185" rx="20" ry="35" fill="#ffb0bb" />
        <Ellipse cx="330" cy="185" rx="20" ry="35" fill="#ffb0bb" />
        <Ellipse cx="400" cy="180" rx="20" ry="35" fill="#ffb0bb" />
        {/* しっぽ */}
        <Path
          d="M 120 120 Q 90 100, 85 85 Q 80 70, 90 60"
          stroke="#ffb0bb"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />
      </G>

      {/* 豚のディテール（輪郭、目、コインスロット） */}
      <G id="PigDetails">
        {/* 輪郭 */}
        <Ellipse
          cx={viewBoxWidth / 2}
          cy={viewBoxHeight / 2}
          rx="250"
          ry="100"
          fill="none"
          stroke="#333"
          strokeWidth="3"
        />
        {/* 鼻の輪郭 */}
        <Ellipse
          cx="450"
          cy="125"
          rx="35"
          ry="30"
          fill="none"
          stroke="#333"
          strokeWidth="2"
        />
        {/* 目（左） */}
        <Circle cx="250" cy="110" r="8" fill="#333" />
        {/* 目（右） */}
        <Circle cx="350" cy="110" r="8" fill="#333" />
        {/* コインスロット */}
        <Rect
          x={viewBoxWidth / 2 - 30}
          y="60"
          width="60"
          height="8"
          rx="4"
          fill="#333"
        />
      </G>
    </Svg>
  );
};
