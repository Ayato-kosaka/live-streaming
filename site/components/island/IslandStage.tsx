"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IslandScene from "./IslandScene";
import { AYATO_HOME, GRASS_INSET, ISLAND, SPOTS, type Spot } from "./layout";
import { inset, insideRadii, rng } from "./geometry";

const GRASS_R = inset(ISLAND.radii, GRASS_INSET - 6);

export type Resident = { icon?: string; emoji?: string; days: number };

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

/** 住人の立ち位置。決定的に散らして、島の中に収める。 */
function residentSpots(n: number) {
  const r = rng(4242);
  const out: { x: number; y: number }[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 80) {
    const x = ISLAND.cx + (r() - 0.5) * 820;
    const y = ISLAND.cy + (r() - 0.5) * 700;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, GRASS_R, x, y, ISLAND.squash, 46)) continue;
    if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < 74)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 62)) continue;
    out.push({ x, y });
  }
  return out;
}

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
  const camRef = useRef({ x: ISLAND.cx, y: ISLAND.cy, span: 1420 });
  const [, tick] = useState(0);

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
    if (mode === "phone") return wide ? 1060 : 480;
    if (mode === "tablet") return Math.max(1160, 1020 * aspect);
    return Math.max(1400, 980 * aspect);
  }, [mode, wide, box.w, box.h]);

  /** カメラの目標地点 */
  const camTarget = useCallback(() => {
    if (follow) return { x: avatarRef.current.x, y: avatarRef.current.y - 110 };
    if (mode === "wide") return { x: ISLAND.cx - 60, y: ISLAND.cy + 6 };
    return { x: ISLAND.cx, y: ISLAND.cy + 6 };
  }, [follow, mode]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - last) / 16.67;
      last = t;

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
        const sp = 4.2 * dt;
        const [nx, ny] = clampToIsland(x + (vx / n) * sp, y + (vy / n) * sp);
        if (vx !== 0) setFacing(vx > 0 ? 1 : -1);
        return { x: nx, y: ny };
      });

      const cam = camRef.current;
      const want = camTarget();
      const ease = 0.09 * dt;
      cam.x += (want.x - cam.x) * ease;
      cam.y += (want.y - cam.y) * ease;
      cam.span += (span - cam.span) * 0.1 * dt;
      tick((v) => (v + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [camTarget, span]);

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
    target.current = {
      x: vbX + ((e.clientX - r.left) / r.width) * vbW,
      y: vbY + ((e.clientY - r.top) / r.height) * vbH,
    };
    setHint(false);
    setSelected(null);
  };

  const places = useMemo(() => residentSpots(residents.length), [residents.length]);

  return (
    <div className="stage" ref={hostRef} onClick={onStageClick}>
      <svg className="stage-svg" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <IslandScene />
        <g>
          <ellipse cx={avatar.x} cy={avatar.y + 2} rx={28} ry={10} fill="#134a2c" opacity={0.24} />
          <g transform={`translate(${avatar.x},${avatar.y}) scale(${facing},1)`} className={walking ? "ayato walking" : "ayato"}>
            <image href="/characters/ayato.png" x={-46} y={-104} width={92} height={106} preserveAspectRatio="xMidYMax meet" />
          </g>
        </g>
      </svg>

      {/* 住人（HTMLで描く。アイコンが読めなければ絵文字にフォールバック） */}
      <div className="labels" aria-hidden>
        {places.map((p, i) => {
          if (mode === "phone" && wide && i % 2 === 1) return null;
          const s = toScreen(p.x, p.y);
          const scale = box.w / vbW;
          if (s.left < -80 || s.left > box.w + 80 || s.top < -80 || s.top > box.h + 80) return null;
          const r = residents[i];
          return (
            <span
              key={i}
              className="resident-chip"
              style={{
                left: s.left,
                top: s.top,
                ["--rs" as string]: Math.max(0.42, Math.min(1.2, scale)),
                animationDelay: `${(i % 11) * 0.19}s`,
              }}
            >
              <span className="resident-emoji">{r.emoji || "🙂"}</span>
              {r.icon && (
                <img
                  src={`https://lh3.googleusercontent.com/d/${r.icon}=s96`}
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
          const p = toScreen(s.x, s.y + (s.labelAt === "above" ? -72 : 14));
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
                <span aria-hidden>{s.emoji}</span>
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
              <span className="spot-emoji" aria-hidden>
                {s.emoji}
              </span>
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
          <span className="sheet-emoji" aria-hidden>{selected.emoji}</span>
          <span className="sheet-text">
            <b>{selected.label}</b>
            <i>{selected.blurb}</i>
          </span>
          <Link className="sheet-go" href={selected.href}>ひらく</Link>
          <button className="sheet-close" onClick={() => setSelected(null)} aria-label="閉じる">×</button>
        </div>
      )}

      {mode === "phone" && (
        <button data-ui className="zoom-toggle" onClick={() => setWide((v) => !v)}>
          {wide ? "🔍 近づく" : "🗺 島ぜんぶ"}
        </button>
      )}

      {hint && (
        <p className="walk-hint">
          <span aria-hidden>👆</span> 島をタップすると歩きます
        </p>
      )}
    </div>
  );
}
