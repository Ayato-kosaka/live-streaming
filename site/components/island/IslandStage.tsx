"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IslandScene, { LAMPS, PROPS, type Item } from "./IslandScene";
import { Sprite } from "./Sprite";
import { AYATO_HOME, GRASS_INSET, ISLAND, SPOTS, type Spot } from "./layout";
import { inset, insideRadii, rng } from "./geometry";
import { CHATTER, UI } from "@/content/voice";
import { Gull } from "./Guide";
import {
  createVillagers,
  stepVillagers,
  talkTo,
  villagerAt,
  villagerPose,
  type Resident,
} from "./villagers";

export type { Resident };

const GRASS_R = inset(ISLAND.radii, GRASS_INSET - 6);
/** あやとは住人よりひとまわり大きい。主人公なので。
    ただし小屋(78)と同じ背丈になると急に浮くので、そこまでは大きくしない。 */
const AYATO_H = 58;
const VILLAGER_H = 42;

/** 島に着くまでの演出。船ではなく、カモメについて空から降りてくる。 */
const ARRIVE_SPAN = 3400;
/** 同じセッションで2回目からは、演出を飛ばして最初から島にいる */
const VISITED = "ayato-island-arrived";

const clampToIsland = (x: number, y: number): [number, number] => {
  if (insideRadii(ISLAND.cx, ISLAND.cy, GRASS_R, x, y, ISLAND.squash, 10)) return [x, y];
  const dx = x - ISLAND.cx;
  const dy = y - ISLAND.cy;
  for (let t = 0.96; t > 0; t -= 0.04) {
    const nx = ISLAND.cx + dx * t;
    const ny = ISLAND.cy + dy * t;
    if (insideRadii(ISLAND.cx, ISLAND.cy, GRASS_R, nx, ny, ISLAND.squash, 10)) return [nx, ny];
  }
  return [ISLAND.cx, ISLAND.cy];
};

export default function IslandStage({ residents = [] }: { residents?: Resident[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1440, h: 900 });
  const [avatar, setAvatar] = useState({ ...AYATO_HOME });
  const [facing, setFacing] = useState(1);
  const [walking, setWalking] = useState(false);
  const [hint, setHint] = useState(true);
  const [wide, setWide] = useState(false); // スマホで「島ぜんぶ」
  const [selected, setSelected] = useState<Spot | null>(null);
  const target = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // 最初の1フレーム目から遠景で描き始めるので、演出は読み込みと同時に始まる。
  // JS の判定を待たないぶん、島が一瞬見えてから引く、というちらつきが起きない。
  const camRef = useRef({ x: ISLAND.cx, y: ISLAND.cy - 30, span: ARRIVE_SPAN });
  const [arriving, setArriving] = useState(true);
  const [, tick] = useState(0);

  const villagers = useMemo(() => createVillagers(residents), [residents]);
  const dice = useRef(rng(777));
  const clock = useRef(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(VISITED);
      sessionStorage.setItem(VISITED, "1");
    } catch {
      /* プライベートモードなどで読めなくても、演出を出すだけなので気にしない */
    }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (seen || still) {
      camRef.current.span = 0; // 下の ease が最初の1フレームで追いつく
      setArriving(false);
      return;
    }
    const t = setTimeout(() => setArriving(false), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  const mode = box.w < 640 ? "phone" : box.w < 1024 ? "tablet" : "wide";
  /** スマホは島に降り立った視点。「島ぜんぶ」を押すと引いて全体を見る。 */
  const follow = mode === "phone" && !wide;

  /** 表示する横幅(ワールド単位)。縦長では「縦に何単位見せるか」から逆算する。 */
  const span = useMemo(() => {
    const aspect = box.w / Math.max(1, box.h);
    if (mode === "phone") return wide ? 1060 : 520;
    if (mode === "tablet") return Math.max(1120, 980 * aspect);
    return Math.max(1220, 880 * aspect);
  }, [mode, wide, box.w, box.h]);

  /** カメラの目標地点 */
  const camTarget = useCallback(() => {
    if (follow) return { x: avatarRef.current.x, y: avatarRef.current.y - 100 };
    // 上に見出しが乗るので、島は画面のやや下に置く
    if (mode === "wide") return { x: ISLAND.cx - 40, y: ISLAND.cy - 62 };
    return { x: ISLAND.cx, y: ISLAND.cy - 40 };
  }, [follow, mode]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      clock.current = t;
      stepVillagers(villagers, dt, dice.current);

      setAvatar((prev) => {
        let { x, y } = prev;
        let vx = 0;
        let vy = 0;
        const k = keys.current;
        if (k.ArrowLeft || k.a) vx -= 1;
        if (k.ArrowRight || k.d) vx += 1;
        if (k.ArrowUp || k.w) vy -= 1;
        if (k.ArrowDown || k.s) vy += 1;
        if (vx || vy) target.current = null;
        else if (target.current) {
          const dx = target.current.x - x;
          const dy = target.current.y - y;
          const d = Math.hypot(dx, dy);
          if (d < 7) target.current = null;
          else {
            vx = dx / d;
            vy = dy / d;
          }
        }
        const moving = !!(vx || vy);
        setWalking(moving);
        if (!moving) return prev;
        const n = Math.hypot(vx, vy) || 1;
        const sp = 4.2 * (dt / 16.67);
        const [nx, ny] = clampToIsland(x + (vx / n) * sp, y + (vy / n) * sp);
        if (vx !== 0) setFacing(vx > 0 ? 1 : -1);
        return { x: nx, y: ny };
      });

      const cam = camRef.current;
      const want = camTarget();
      const ease = 0.09 * (dt / 16.67);
      cam.x += (want.x - cam.x) * ease;
      cam.y += (want.y - cam.y) * ease;
      // 遠景から寄るときは、着地するように後半をゆっくりにする
      const far = cam.span > span * 1.25;
      cam.span += (span - cam.span) * (far ? 0.019 : 0.09) * (dt / 16.67);
      tick((v) => (v + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [camTarget, span, villagers]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) {
        keys.current[k] = true;
        setHint(false);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current[k] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const cam = camRef.current;
  const vbW = cam.span;
  const vbH = (cam.span * box.h) / Math.max(1, box.w);
  const vbX = cam.x - vbW / 2;
  const vbY = cam.y - vbH / 2;

  const toScreen = (wx: number, wy: number) => ({
    left: ((wx - vbX) / vbW) * box.w,
    top: ((wy - vbY) / vbH) * box.h,
  });

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    const r = hostRef.current!.getBoundingClientRect();
    const wx = vbX + ((e.clientX - r.left) / r.width) * vbW;
    const wy = vbY + ((e.clientY - r.top) / r.height) * vbH;
    setHint(false);
    setSelected(null);
    // 住人を押したときは歩かずに、話しかける
    const who = villagerAt(villagers, wx, wy, VILLAGER_H * 0.8);
    if (who) {
      talkTo(who, CHATTER[who.post] ?? [], dice.current);
      return;
    }
    target.current = { x: wx, y: wy };
  };

  /* 景色・住人・あやとを、足元の y で並べ替えてから描く。
     こうしないと木の手前に立つべき住人が木の裏に隠れてしまう。 */
  const layers = (() => {
    const t = clock.current;
    const cast = villagers.map((v, i) => ({
      kind: "villager" as const,
      y: v.y,
      key: `v${i}`,
      v,
      pose: villagerPose(v, t),
    }));
    const me = { kind: "ayato" as const, y: avatar.y, key: "me" };
    const scene = PROPS.map((p, i) => ({ kind: "prop" as const, y: p.y, key: `o${i}`, p }));
    return [...scene, ...cast, me].sort((a, b) => a.y - b.y);
  })();

  return (
    <div className={`stage${arriving ? " is-arriving" : ""}`} ref={hostRef} onClick={onStageClick}>
      <svg className="stage-svg" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <IslandScene />
        {layers.map((l) => {
          if (l.kind === "prop") {
            const p: Item = l.p;
            return <Sprite key={l.key} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />;
          }
          if (l.kind === "villager") {
            const { v, pose } = l;
            return (
              <g key={l.key} transform={`translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)})`}>
                <ellipse cx={0} cy={-pose.dy} rx={13} ry={4.6} fill="#134a2c" opacity={0.18} />
                <g transform={`rotate(${pose.rot.toFixed(1)})`}>
                  <Sprite name={v.look} x={0} y={0} size={VILLAGER_H} flip={v.facing < 0} />
                </g>
              </g>
            );
          }
          return (
            <g key={l.key}>
              <ellipse cx={avatar.x} cy={avatar.y + 1} rx={22} ry={8} fill="#134a2c" opacity={0.22} />
              <g transform={`translate(${avatar.x},${avatar.y}) scale(${facing},1)`} className={walking ? "ayato walking" : "ayato"}>
                <image
                  href="/characters/ayato.png"
                  x={-AYATO_H * 0.43}
                  y={-AYATO_H}
                  width={AYATO_H * 0.86}
                  height={AYATO_H}
                  preserveAspectRatio="xMidYMax meet"
                />
              </g>
            </g>
          );
        })}
      </svg>

      {/* 夜の灯り。時間帯の色かぶせより上に重ねる */}
      <svg className="stage-lamps" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <radialGradient id="lampG">
            <stop offset="0" stopColor="#fff6d4" stopOpacity="1" />
            <stop offset="0.28" stopColor="#ffdc8a" stopOpacity="0.72" />
            <stop offset="0.62" stopColor="#ffc860" stopOpacity="0.3" />
            <stop offset="1" stopColor="#ffbe4d" stopOpacity="0" />
          </radialGradient>
        </defs>
        {LAMPS.map(([lx, ly, r], i) => (
          <circle key={i} cx={lx} cy={ly} r={r} fill="url(#lampG)" />
        ))}
      </svg>

      {/* 住人の吹き出し */}
      <div className="labels" aria-hidden>
        {villagers.map((v, i) => {
          if (!v.says) return null;
          const s = toScreen(v.x, v.y - VILLAGER_H - 20);
          if (s.left < -160 || s.left > box.w + 160 || s.top < -80 || s.top > box.h + 80) return null;
          return (
            <span key={`t${i}`} className="chatter" style={{ left: s.left, top: s.top }}>
              {v.says}
            </span>
          );
        })}
      </div>

      {/* 住人の頭の上に、見に来てくれている人のアイコンを小さく出す */}
      <div className="labels" aria-hidden>
        {villagers.map((v, i) => {
          if (!v.icon && !v.emoji) return null;
          if (v.says) return null;
          const s = toScreen(v.x, v.y - VILLAGER_H - 12);
          if (s.left < -60 || s.left > box.w + 60 || s.top < -60 || s.top > box.h + 60) return null;
          const scale = Math.max(0.5, Math.min(1.05, box.w / vbW));
          return (
            <span key={i} className="resident-chip" style={{ left: s.left, top: s.top, ["--rs" as string]: scale }}>
              <span className="resident-emoji">{v.emoji || "🙂"}</span>
              {v.icon && (
                <img
                  src={`https://lh3.googleusercontent.com/d/${v.icon}=s96`}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </span>
          );
        })}
      </div>

      {/* 建物ラベル: PCは名前つき、スマホはピン */}
      <div className="labels">
        {SPOTS.map((s) => {
          // 建物を隠さないよう、足元より下（または頭より上）に置く
          const p = toScreen(s.x, s.y + (s.labelAt === "above" ? -104 : 40));
          const pad = 70;
          if (p.left < -pad || p.left > box.w + pad || p.top < -pad || p.top > box.h + pad) return null;
          if (mode === "phone") {
            return (
              <button
                key={s.id}
                data-ui
                className={`spot-pin${selected?.id === s.id ? " is-on" : ""}`}
                style={{ left: p.left, top: p.top, ["--ps" as string]: Math.max(0.66, Math.min(1.1, box.w / vbW)) }}
                onClick={() => {
                  setSelected(s);
                  target.current = { x: s.x, y: s.y + 30 };
                  setHint(false);
                }}
                aria-label={s.label}
              >
                <img src={`/sprites/${s.icon}.webp`} alt="" />
              </button>
            );
          }
          return (
            <Link
              key={s.id}
              href={s.href}
              data-ui
              className="spot-label"
              style={{ left: p.left, top: p.top }}
              onMouseEnter={() => {
                target.current = { x: s.x, y: s.y + 30 };
              }}
            >
              <img className="spot-icon" src={`/sprites/${s.icon}.webp`} alt="" />
              <span className="spot-text">
                <b>{s.label}</b>
                <i>{s.blurb}</i>
              </span>
            </Link>
          );
        })}
      </div>

      {/* スマホ: 選んだ場所のカード */}
      {mode === "phone" && selected && (
        <div className="sheet" data-ui>
          <img className="sheet-icon" src={`/sprites/${selected.icon}.webp`} alt="" />
          <span className="sheet-text">
            <b>{selected.label}</b>
            <i>{selected.blurb}</i>
          </span>
          <Link className="sheet-go" href={selected.href}>{UI.enter}</Link>
          <button className="sheet-close" onClick={() => setSelected(null)} aria-label={UI.close}>×</button>
        </div>
      )}

      {mode === "phone" && (
        <button data-ui className="zoom-toggle" onClick={() => setWide((v) => !v)}>
          {wide ? UI.comeDown : UI.lookAround}
        </button>
      )}

      {/* 到着の演出。空が白く飛んで、カモメが先に島へ降りていく */}
      {arriving && (
        <div className="arrive" aria-hidden>
          <span className="arrive-flash" />
          <span className="arrive-gull">
            <Gull size={92} wing="fly" shadow={false} />
          </span>
        </div>
      )}

      {hint && (
        <p className="walk-hint">{UI.walkHint}</p>
      )}
    </div>
  );
}
