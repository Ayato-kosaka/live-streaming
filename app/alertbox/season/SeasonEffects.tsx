/**
 * アラートの後ろで、季節の小物をポロポロ出す。締めに群れが横切る。
 *
 * - 置き場所は**キャラの絵（zIndex 1）より後ろ**。名簿の絵文字の花火・雨も後ろ（粒はキャラ絵の
 *   顔の前を通さない）。字（zIndex 3）だけが上
 * - 出す場所は四隅・下端・横の端だけ。**真ん中には枠が無い**（`themes.ts` の `slots`）
 * - 金額で段が変わる（枠の数・出る小物・群れの数）
 * - 時刻は全部先に決めて CSS に渡す（`plan.ts`）。出ているあいだ JS は何もしない
 */
import React, { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { useBoxSize } from "./useBoxSize";
import type { SeasonTheme } from "../themes";
import type { LoadedImage } from "./useSeason";
import { planEffects, type BatSpawn, type FxSpawn } from "./plan";
import { ensureSeasonCss, frameAnimation } from "./seasonCss";

type Props = {
  theme: SeasonTheme;
  fx: ReadonlyMap<string, LoadedImage>;
  /** アラートが出ている秒数（フェードアウトの手前まで） */
  durationSec: number;
  /** 段を決める額（JPY） */
  yen: number;
  /** 通知の id。同じ通知からは同じ段取りが出る */
  seed: string;
};

export const SeasonEffects: React.FC<Props> = ({ theme, fx, durationSec, yen, seed }) => {
  const { width: W, height: H } = useBoxSize();

  useEffect(() => {
    ensureSeasonCss();
  }, []);

  /* 段取りは通知1件に1回だけ決める。読めた絵が途中で増えても組み直さない
     （出ている最中に並びが変わると、小物が途中から消えたり湧いたりする） */
  const plan = useMemo(
    () => planEffects(theme, durationSec, yen, seed, new Set(fx.keys())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, durationSec, yen, seed]
  );

  if (Platform.OS !== "web") return null;
  if (plan.items.length === 0 && plan.bats.length === 0) return null;

  const short = Math.min(W, H);

  /* 群れの横切りとうねりは、1匹ずつ距離が違う。keyframes に変数を入れると
     合成スレッドで回らない（`seasonCss.ts` の頭）ので、このアラートの分だけ
     数字を埋めた keyframes をここで書いて、アラートと一緒に消す */
  const batCss = plan.bats
    .map((bat) => {
      const g = batGeometry(bat, theme, fx, W, short);
      if (!g) return "";
      return (
        `@keyframes ss-bx-${bat.key}{from{transform:translateX(${g.from}px)}to{transform:translateX(${g.to}px)}}` +
        `@keyframes ss-by-${bat.key}{from{transform:translateY(${-g.sway}px) rotate(-6deg)}to{transform:translateY(${g.sway}px) rotate(6deg)}}`
      );
    })
    .join("\n");

  return (
    <div
      aria-hidden
      data-show="fx"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {batCss && <style>{batCss}</style>}
      {plan.items.map((it) => {
        const img = fx.get(it.file);
        return img ? <Item key={it.key} it={it} img={img} W={W} H={H} short={short} /> : null;
      })}
      {plan.bats.map((bat) => (
        <Bat key={bat.key} bat={bat} theme={theme} fx={fx} W={W} H={H} short={short} />
      ))}
    </div>
  );
};

/** 長いほうの辺を `size × 短辺` にした大きさ */
function fit(img: LoadedImage, size: number, short: number) {
  const long = size * short;
  const r = img.width / img.height;
  return r >= 1 ? { w: long, h: long / r } : { w: long * r, h: long };
}

const Item: React.FC<{
  it: FxSpawn;
  img: LoadedImage;
  W: number;
  H: number;
  short: number;
}> = ({ it, img, W, H, short }) => {
  const { w, h } = fit(img, it.size, short);

  let pos: React.CSSProperties;
  let origin: string;
  if (it.place === "corner") {
    pos = it.side === "l" ? { left: 0, top: 0 } : { right: 0, top: 0 };
    origin = it.side === "l" ? "0 0" : "100% 0";
  } else if (it.place === "side") {
    pos = {
      ...(it.side === "l" ? { left: 0 } : { right: 0 }),
      top: it.y * H - h / 2,
    };
    origin = "50% 50%";
  } else {
    // 下端。足元を画面の下の縁に置く
    pos = { left: it.x * W - w / 2, bottom: 0 };
    origin = "50% 100%";
  }

  return (
    <div
      style={{
        position: "absolute",
        width: w,
        height: h,
        ...pos,
        transformOrigin: origin,
        opacity: 0,
        animation: `ss-${it.motion}-${it.side} ${it.life}s ease-in-out ${it.delay}s both`,
        willChange: "transform, opacity",
      }}
    >
      <img
        src={img.url}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          transform: it.flip ? "scaleX(-1)" : undefined,
          userSelect: "none",
        }}
      />
    </div>
  );
};

/** 1匹の大きさと、横切る端から端まで（px） */
function batGeometry(
  bat: BatSpawn,
  theme: SeasonTheme,
  fx: ReadonlyMap<string, LoadedImage>,
  W: number,
  short: number
) {
  const fin = theme.finale;
  const f0 = fin ? fx.get(fin.files[0]) : undefined;
  if (!fin || !f0) return null;
  const { w, h } = fit(f0, bat.size, short);
  const ltr = fin.toward === "right";
  return {
    w,
    h,
    from: ltr ? -w * 1.2 : W + w * 0.2,
    to: ltr ? W + w * 0.2 : -w * 1.2,
    sway: bat.sway * short,
  };
}

const Bat: React.FC<{
  bat: BatSpawn;
  theme: SeasonTheme;
  fx: ReadonlyMap<string, LoadedImage>;
  W: number;
  H: number;
  short: number;
}> = ({ bat, theme, fx, W, H, short }) => {
  const fin = theme.finale!;
  const f0 = fx.get(fin.files[0]);
  if (!f0) return null;
  // 2コマ目が読めなかったら、羽ばたかずに1枚で飛ぶ
  const frames = [f0, fx.get(fin.files[1])].filter((v): v is LoadedImage => !!v);
  const g = batGeometry(bat, theme, fx, W, short)!;
  const { w, h } = g;
  const half = fin.flapMs / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: bat.y * H - h / 2,
        width: w,
        height: h,
        transform: `translateX(${g.from}px)`,
        animation: `ss-bx-${bat.key} ${bat.fly}s linear ${bat.delay}s both`,
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          animation: `ss-by-${bat.key} ${bat.swayS}s ease-in-out ${-bat.swayS * 0.5}s infinite alternate`,
        }}
      >
        {frames.map((img, i) => (
          <img
            key={img.url}
            src={img.url}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              visibility: frames.length > 1 ? "hidden" : "visible",
              animation:
                frames.length > 1 ? frameAnimation(2, i, half) : undefined,
              userSelect: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
};
