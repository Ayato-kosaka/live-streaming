"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IslandScene, { LAMPS, PROPS, type Item } from "./IslandScene";
import { Sprite, spriteWidth } from "./Sprite";
import { AYATO_HOME, GRASS_INSET, ISLAND, SPOTS, type Spot, type SpotId } from "./layout";
import { inset, insideRadii, rng } from "./geometry";
import { UI } from "@/content/voice";
import { hasVoice, linesOf } from "@/content/chatter";
import { Gull } from "./Guide";
import { useResidentShow } from "@/lib/liveStats";
import {
  createVillagers,
  stepVillagers,
  talkTo,
  hush,
  rotateInvites,
  villagerAt,
  villagerPose,
  type Resident,
} from "./villagers";

export type { Resident };

const GRASS_R = inset(ISLAND.radii, GRASS_INSET - 6);
/** あやとは住人よりひとまわり大きい。主人公なので。
    ただし小屋(78)と同じ背丈になると急に浮くので、そこまでは大きくしない。 */
const AYATO_H = 58;
/** 島に住んでいる人の背丈。正方形の絵で余白があるので、少し大きめに置く */
const RESIDENT_H = 62;

/** 島に住んでいる人の絵(視聴者さんが作ったキャラクター)の置き場 */
const residentIconUrl = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s160`;

/* ---- 入口の見せ方 --------------------------------------------------------
   ゲームで「押せる物」を分からせる作法をそのまま使う。
   1. 押せる物にはいつも小さな灯りを置く（近づく前から「ここは何かある」と分かる）
   2. 近づくと灯りが強くなる（誘目）
   3. さらに近づくといちばん近い1つだけ名前が出る（一度に1つだけ注目させる）
   4. 押す場所は絵そのもの。ズレたヒットエリアは「壊れている」と感じさせる
   5. 指で押す以上、どんなに小さい絵でも最低 48px は確保する（フィッツの法則）
   ------------------------------------------------------------------------ */
/** ここから灯りが強くなる距離(ワールド単位) */
const NEAR = 215;
/** ここまで来たら名前が出て、入れるようになる距離 */
const HERE = 120;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく。 */
const TALK_REACH = 74;

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
  /** マウスを乗せている入口。PCではこれだけで名前が出る。 */
  const [hover, setHover] = useState<SpotId | null>(null);
  const target = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // 最初の1フレーム目から遠景で描き始めるので、演出は読み込みと同時に始まる。
  // JS の判定を待たないぶん、島が一瞬見えてから引く、というちらつきが起きない。
  const camRef = useRef({ x: ISLAND.cx, y: ISLAND.cy - 30, span: ARRIVE_SPAN });
  const [arriving, setArriving] = useState(true);
  /** 読み込めたキャラ画像。読めるまでは島の住人の姿で立たせておく */
  const [readyIcons, setReadyIcons] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);

  // 名前と YouTube アイコンは、本人が「出す」と決めた人だけ後から乗せる
  const show = useResidentShow();
  const villagers = useMemo(() => createVillagers(residents), [residents]);
  for (const v of villagers) {
    const s = v.icon ? show.get(v.icon) : undefined;
    v.name = s?.name ?? undefined;
    v.photo = s?.photo ?? undefined;
  }
  /** いま吹き出しを開いている住人。閉じるまでここに居座る。 */
  const [talking, setTalking] = useState<number | null>(null);
  /** 話しかけようとして、まだ着いていない相手 */
  const walkingTo = useRef<number | null>(null);
  const dice = useRef(rng(777));
  const clock = useRef(0);
  const inviteSlot = useRef(-1);

  // キャラ画像は外から取ってくるので、先に読んでおく。
  // SVG の image に直接URLを入れると、失敗したとき壊れた画像の枠が出てしまう。
  useEffect(() => {
    let alive = true;
    for (const v of villagers) {
      if (!v.icon) continue;
      const img = new Image();
      img.src = residentIconUrl(v.icon);
      img.onload = () => {
        if (alive) setReadyIcons((prev) => (prev.has(v.icon!) ? prev : new Set(prev).add(v.icon!)));
      };
    }
    return () => {
      alive = false;
    };
  }, [villagers]);

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
    // 寄りはしっかり寄せる。どうぶつの森の「その場にいる」感は画面に映る範囲の狭さから来る。
    if (mode === "phone") return wide ? 850 : 340;
    if (mode === "tablet") return Math.max(1120, 980 * aspect);
    return Math.max(1220, 880 * aspect);
  }, [mode, wide, box.w, box.h]);

  /** カメラの目標地点 */
  const camTarget = useCallback(() => {
    // 下にバーとカードが出るぶん、島は画面の上寄りに置く
    if (follow) return { x: avatarRef.current.x, y: avatarRef.current.y - 92 };
    if (mode === "phone") return { x: ISLAND.cx, y: ISLAND.cy - 150 };
    // 上に見出しが乗るので、島は画面のやや下に置く
    if (mode === "wide") return { x: ISLAND.cx - 40, y: ISLAND.cy + 6 };
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
      // 「話しかけて」の合図は数人ずつ、9秒おきに入れ替える
      const slot = Math.floor(t / 9000);
      if (slot !== inviteSlot.current) {
        inviteSlot.current = slot;
        rotateInvites(villagers, slot, (v) => hasVoice(v.icon));
      }

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
        // ayato.png は左を向いている絵。右へ歩くときに左右を反転する
        if (vx !== 0) setFacing(vx > 0 ? -1 : 1);
        return { x: nx, y: ny };
      });

      // 話しかけに行った相手のそばまで来たら、吹き出しを開く。
      // setAvatar の中でやると更新中に更新することになるので、外で見る。
      if (walkingTo.current !== null) {
        const i = walkingTo.current;
        const who = villagers[i];
        const me = avatarRef.current;
        if (!who || Math.hypot(me.x - who.x, (me.y - who.y) * 1.3) <= TALK_REACH) {
          walkingTo.current = null;
          target.current = null;
          if (who) openTalkRef.current?.(i);
        }
      }

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

  /** 入口ごとの、あやとからの遠さ。斜め見下ろしなので縦の距離は重く数える。 */
  const spotNear = useMemo(() => {
    const out: Record<string, number> = {};
    for (const sp of SPOTS) {
      out[sp.id] = Math.hypot(avatar.x - sp.x, (avatar.y - sp.y) * 1.35);
    }
    return out;
  }, [avatar.x, avatar.y]);

  /** 名前を出すのは、いちばん近い1つだけ。全部に名札が出ると島が字で埋まる。
      スマホの「島ぜんぶ」は地図として見る画面なので、近さでは出さない。 */
  const nearestId = useMemo(() => {
    if (mode === "phone" && wide) return null;
    let best: SpotId | null = null;
    let bestD = HERE;
    for (const sp of SPOTS) {
      if (spotNear[sp.id] < bestD) {
        bestD = spotNear[sp.id];
        best = sp.id;
      }
    }
    return best;
  }, [spotNear, mode, wide]);

  /** 入口の見え方。idle=小さく灯る / near=強く灯る / on=名前が出る */
  const spotState = useMemo(() => {
    const out = {} as Record<SpotId, "idle" | "near" | "on">;
    for (const sp of SPOTS) {
      const d = spotNear[sp.id];
      out[sp.id] =
        selected?.id === sp.id || hover === sp.id || nearestId === sp.id
          ? "on"
          : d < NEAR
            ? "near"
            : "idle";
    }
    return out;
  }, [spotNear, nearestId, hover, selected]);

  /** 場所を選んで、あやとをそこまで歩かせる。目印からも下のバーからも呼ぶ。 */
  const goTo = (s: Spot) => {
    setSelected(s);
    target.current = { x: s.x, y: s.y + 30 };
    setHint(false);
    if (wide) setWide(false);
  };

  /** 吹き出しを開く。開けるのは一度にひとりだけ。 */
  const openTalk = useCallback(
    (i: number) => {
      villagers.forEach((o) => {
        if (o.says) hush(o);
      });
      talkTo(villagers[i], linesOf(villagers[i].icon));
      setTalking(i);
    },
    [villagers],
  );
  const openTalkRef = useRef<((i: number) => void) | null>(null);
  openTalkRef.current = openTalk;

  /** 吹き出しを閉じる。閉じるまで消えないのが決まり。 */
  const closeTalk = useCallback(() => {
    setTalking((cur) => {
      if (cur !== null && villagers[cur]) hush(villagers[cur]);
      return null;
    });
  }, [villagers]);

  /** 住人に話しかける。遠ければまず歩いて近づいてから。 */
  const approach = useCallback(
    (i: number) => {
      const v = villagers[i];
      const me = avatarRef.current;
      setHint(false);
      setSelected(null);
      if (Math.hypot(me.x - v.x, (me.y - v.y) * 1.3) <= TALK_REACH) {
        openTalk(i);
        return;
      }
      // 近づいている間、相手には待っていてもらう
      v.mood = "stand";
      v.left = 9000;
      walkingTo.current = i;
      target.current = { x: v.x + (me.x > v.x ? 40 : -40), y: v.y + 8 };
    },
    [villagers, openTalk],
  );

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    const r = hostRef.current!.getBoundingClientRect();
    const wx = vbX + ((e.clientX - r.left) / r.width) * vbW;
    const wy = vbY + ((e.clientY - r.top) / r.height) * vbH;
    setHint(false);
    setSelected(null);
    // 読んでいる途中で地面を押しても閉じない。閉じるのは×だけ。
    // 住人を押したら、まず歩いて近づいてから話しかける
    const who = villagerAt(villagers, wx, wy, RESIDENT_H * 0.6);
    if (who) {
      approach(villagers.indexOf(who));
      return;
    }
    walkingTo.current = null;
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

  // data-view / data-mode は、ロゴなど島の外のUIが寄り・引きを知るための出口。
  return (
    <div
      className={`stage${arriving ? " is-arriving" : ""}`}
      data-view={follow ? "close" : "wide"}
      data-mode={mode}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg className="stage-svg" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <IslandScene />
        {/* 入口の灯り。押せる物には必ず灯りを置いて、近づくほど強くする。 */}
        <defs>
          <radialGradient id="spotG">
            <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#ffd979" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffcf5e" stopOpacity="0" />
          </radialGradient>
        </defs>
        {SPOTS.map((sp) => {
          const w = Math.max(46, spriteWidth(sp.icon, sp.size));
          return (
            <ellipse
              key={`g${sp.id}`}
              className={`spot-glow is-${spotState[sp.id]}`}
              cx={sp.x}
              cy={sp.y - 2}
              rx={w * 0.78}
              ry={w * 0.34}
              fill="url(#spotG)"
              style={{ animationDelay: `${(sp.x % 7) * 0.31}s` }}
            />
          );
        })}
        {layers.map((l) => {
          if (l.kind === "prop") {
            const p: Item = l.p;
            const art = <Sprite key={l.key} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />;
            // 入口の建物は、近づいたときに軽く弾ませて「反応した」と分からせる
            if (!p.spot) return art;
            return (
              <g
                key={l.key}
                className={`spot-art is-${spotState[p.spot]}`}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              >
                {art}
              </g>
            );
          }
          if (l.kind === "villager") {
            const { v, pose } = l;
            // 島に住んでいるのは視聴者さん本人のキャラクター。
            // 絵が読めるまでは出さない(壊れた画像の枠を出さないため)。
            if (!v.icon || !readyIcons.has(v.icon)) return null;
            return (
              <g key={l.key} transform={`translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)})`}>
                <ellipse cx={0} cy={-pose.dy} rx={17} ry={6} fill="#134a2c" opacity={0.18} />
                <g transform={`rotate(${pose.rot.toFixed(1)})`}>
                  <image
                    href={residentIconUrl(v.icon)}
                    x={-RESIDENT_H / 2}
                    y={-RESIDENT_H}
                    width={RESIDENT_H}
                    height={RESIDENT_H}
                    preserveAspectRatio="xMidYMax meet"
                  />
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
        {/* きらめき。どうぶつの森が「ここに何かある」を伝えるやり方をそのまま借りる。
            輪郭線を足さずに済むので、島の絵を壊さない。 */}
        {SPOTS.map((sp) => {
          const w = Math.max(46, spriteWidth(sp.icon, sp.size));
          const r = Math.min(11, Math.max(5, w * 0.13));
          const at: [number, number, number][] = [
            [-w * 0.44, -sp.size * 0.72, 1],
            [w * 0.46, -sp.size * 0.44, 0.78],
            [w * 0.08, -sp.size * 1.04, 0.62],
          ];
          return (
            <g key={`s${sp.id}`} className={`spot-spark is-${spotState[sp.id]}`}>
              {at.map(([dx, dy, k], i) => (
                <path
                  key={i}
                  d="M0,-6 Q0.9,-0.9 6,0 Q0.9,0.9 0,6 Q-0.9,0.9 -6,0 Q-0.9,-0.9 0,-6 Z"
                  fill="#fff6cf"
                  transform={`translate(${(sp.x + dx).toFixed(1)} ${(sp.y + dy).toFixed(1)}) scale(${((r / 6) * k).toFixed(2)})`}
                  style={{ animationDelay: `${i * 0.72 + (sp.x % 5) * 0.19}s` }}
                />
              ))}
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

      {/* 入口。押す場所は建物の絵そのもの。
          絵の四隅をそのまま当たり判定にして、指で押せる最小の大きさまで広げる。 */}
      <div className="labels">
        {SPOTS.map((sp) => {
          const w = spriteWidth(sp.icon, sp.size);
          const tl = toScreen(sp.x - w / 2, sp.y - sp.size);
          const br = toScreen(sp.x + w / 2, sp.y);
          const cx = (tl.left + br.left) / 2;
          const cy = (tl.top + br.top) / 2;
          const bw = Math.max(TAP_MIN, br.left - tl.left);
          const bh = Math.max(TAP_MIN, br.top - tl.top);
          const pad = 90;
          if (cx < -pad || cx > box.w + pad || cy < -pad || cy > box.h + pad) return null;

          const state = spotState[sp.id];
          const named = state === "on";

          return (
            <div key={sp.id} className={`spot is-${state}`}>
              <button
                data-ui
                className="spot-hit"
                style={{ left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh }}
                onClick={() => goTo(sp)}
                onMouseEnter={() => setHover(sp.id)}
                onMouseLeave={() => setHover((v) => (v === sp.id ? null : v))}
                onFocus={() => setHover(sp.id)}
                onBlur={() => setHover((v) => (v === sp.id ? null : v))}
                aria-label={`${sp.label}へ行く`}
              />
              {/* 名札。近づいた時だけ出して、そのまま入口にもする */}
              <Link
                data-ui
                href={sp.href}
                className="spot-name"
                style={{ left: cx, top: tl.top - 10 }}
                tabIndex={named ? 0 : -1}
                aria-hidden={!named}
              >
                <b>{sp.label}</b>
                <i>{UI.enter}</i>
              </Link>
            </div>
          );
        })}
      </div>

      {/* 住人まわり。名前・話しかけての合図・吹き出し。
          吹き出しは勝手に消えない。読み終わったら×で閉じてもらう。 */}
      <div className="labels">
        {villagers.map((v, i) => {
          const head = toScreen(v.x, v.y - RESIDENT_H - 10);
          const foot = toScreen(v.x, v.y + 6);
          const off = head.left < -180 || head.left > box.w + 180 || head.top < -140 || head.top > box.h + 140;
          if (off || !v.icon || !readyIcons.has(v.icon)) return null;
          return (
            <div key={`v${i}`}>
              {/* 住人を押す所。建物の当たり判定より手前に置く。
                  建物の前に立っている人が押せない、が起きないようにするため。 */}
              <button
                data-ui
                className="who-hit"
                style={{
                  left: head.left - Math.max(22, RESIDENT_H * 0.42),
                  top: head.top - 6,
                  width: Math.max(44, RESIDENT_H * 0.84),
                  height: Math.max(44, foot.top - head.top + 12),
                }}
                onClick={() => approach(i)}
                aria-label={UI.talkTo}
              />
              {/* 名前と YouTube のアイコン。本人が「出す」と決めた人だけ出る。 */}
              {v.name && (
                <span className="who" style={{ left: foot.left, top: foot.top }}>
                  {v.photo && <img src={v.photo} alt="" loading="lazy" />}
                  <b>{v.name}</b>
                </span>
              )}
              {/* 話しかけて、の合図。数人ずつ順番に出す。 */}
              {v.invite && !v.says && (
                <button
                  data-ui
                  className="who-call"
                  style={{ left: head.left, top: head.top }}
                  onClick={() => approach(i)}
                  aria-label={UI.talkTo}
                >
                  !
                </button>
              )}
              {v.says && (
                <div className="chatter" data-ui style={{ left: head.left, top: head.top }}>
                  <p>{v.says}</p>
                  <button className="chatter-x" onClick={closeTalk} aria-label={UI.close}>
                    ×
                  </button>
                  <button className="chatter-more" onClick={() => openTalk(i)}>
                    {UI.moreTalk}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* スマホ: 選んだ場所のカード。下の場所バーの上に積む */}
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

      {/* スマホ: 島の上に名札を並べると島が隠れるので、行き先は下のバーにまとめる */}
      {mode === "phone" && (
        <div className="island-bar" data-ui>
          <div className="island-bar-scroll">
            {SPOTS.map((s) => (
              <button
                key={s.id}
                className={`bar-spot${selected?.id === s.id ? " is-on" : ""}`}
                onClick={() => goTo(s)}
              >
                <img src={`/sprites/${s.icon}.webp`} alt="" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <button className="bar-zoom" onClick={() => setWide((v) => !v)}>
            {wide ? UI.comeDown : UI.lookAround}
          </button>
        </div>
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
