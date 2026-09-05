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
import Today from "@/components/today/Today";
import { jstNow } from "@/lib/nightly";
import { useResidentShow } from "@/lib/liveStats";
import Icon from "@/components/ui/Icon";
import { daysUntil, nextPlan } from "@/content/plans";
import {
  createVillagers,
  stepVillagers,
  talkTo,
  hush,
  rotateInvites,
  villagerAt,
  villagerPose,
  type Resident,
  type Villager,
} from "./villagers";

export type { Resident };

const GRASS_R = inset(ISLAND.radii, GRASS_INSET - 6);
/** あやとの背丈。島の主人公なので、住人より必ず大きい。 */
const AYATO_H = 60;
/** 住人の背丈。あやとより小さく置く。主役はあやと。 */
const RESIDENT_H = 46;

/** 島に住んでいる人の絵(視聴者さんが作ったキャラクター)の置き場 */
const residentIconUrl = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s160`;

/* ---- 入口の見せ方 --------------------------------------------------------
   「押せる」の合図は1種類だけにする（`docs/island-design.md`）。
   光ときらめきと札を混ぜると、どれが合図でどれが飾りか分からなくなる。
   夜のランタンの光を「入口の合図」と取り違えられたので、光はやめて札に一本化した。

   6つの入口には、いつも札が立っている。
     遠い … 小さい札に「!」
     近い … 札が開いて名前と「はいる」が出る
   これで「どこを押せば次のページに行けるか」が、引きでも寄りでも一目で分かる。
   ------------------------------------------------------------------------ */
/** ここまで来たら札が開く距離(ワールド単位) */
const HERE = 150;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく。 */
const TALK_REACH = 74;

/** 島に着くまでの演出。船ではなく、カモメについて空から降りてくる。 */
const ARRIVE_SPAN = 3400;
/**
 * 最後に島へ降りた日（JST の YYYY-MM-DD）。到着演出を出すかどうかの判断に使う。
 *
 * 前は sessionStorage だったので、タブを閉じるたびに 3.4 秒の演出が入っていた。
 * 毎日来る人には毎日3.4秒の税で、1分の周回のうち 6% を占める。
 * いい演出ほど2回目からは邪魔になるので、localStorage に移して初回だけにした。
 * ただし長く空いた人にはもう一度見せる。帰ってきた感じがするので。
 */
const VISITED = "ayato-island-arrived";
/** これだけ空いたら、もう一度カモメと降りてもらう（日） */
const ARRIVE_AGAIN = 30;
/**
 * 建物に入る前にどこに立っていたか。
 *
 * 前は「島にもどる」で戻るたびに AYATO_HOME まで引き戻されていて、
 * 2軒目に行く気にならなかった。出た場所に立っていれば、島がハブとして働く。
 * タブを閉じたら忘れてよいので sessionStorage。
 */
const RETURN_AT = "ayato-island-at";

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

/** その日付から今日（日本時間）までの日数。日付として読めない値なら null。 */
function daysSince(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const t = jstNow();
  return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(y, m - 1, d)) / 86400000);
}

/** 入口の絵の、画面に出る四角。当たり判定と札の位置はここから作る。 */
function spotBox(sp: Spot) {
  const w = spriteWidth(sp.icon, sp.size);
  return { w, h: sp.size };
}

export default function IslandStage({ residents = [] }: { residents?: Resident[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const lampRef = useRef<SVGSVGElement>(null);
  const ayatoRef = useRef<SVGGElement>(null);
  const ayatoShadowRef = useRef<SVGEllipseElement>(null);
  const villagerRefs = useRef<(SVGGElement | null)[]>([]);
  const markRefs = useRef<(HTMLDivElement | null)[]>([]);
  const whoRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [box, setBox] = useState({ w: 1440, h: 900 });
  const [hint, setHint] = useState(true);
  const [wide, setWide] = useState(false); // スマホで「島ぜんぶ」
  const [hover, setHover] = useState<SpotId | null>(null);
  /** 名札が開いている入口。近さと hover から決まる。1フレームごとには更新しない。 */
  const [openSpot, setOpenSpot] = useState<SpotId | null>(null);
  const [arriving, setArriving] = useState(true);
  const [readyIcons, setReadyIcons] = useState<Set<string>>(new Set());
  /** いま吹き出しを出している住人。画面の上に固定で出る。 */
  const [talking, setTalking] = useState<{ i: number; text: string } | null>(null);
  /** 奥行きの並び順が変わったときだけ描き直す */
  const [order, setOrder] = useState<string>("");

  const avatar = useRef({ ...AYATO_HOME });
  const facing = useRef(1);
  const walkingNow = useRef(false);
  const target = useRef<{ x: number; y: number } | null>(null);
  const walkingTo = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camRef = useRef({ x: ISLAND.cx, y: ISLAND.cy - 30, span: ARRIVE_SPAN });
  /** 到着演出を飛ばす人。最初の1フレームでカメラを目的の位置に置く */
  const snapCam = useRef(false);
  /** 建物に入るときの立ち位置。戻ってきたらここから始める */
  const leaveAt = useRef<{ x: number; y: number } | null>(null);
  const dice = useRef(rng(777));
  const clock = useRef(0);
  const inviteSlot = useRef(-1);
  const boxRef = useRef(box);
  boxRef.current = box;

  const show = useResidentShow();
  const villagers = useMemo(() => createVillagers(residents), [residents]);
  for (const v of villagers) {
    const s = v.icon ? show.get(v.icon) : undefined;
    v.name = s?.name ?? undefined;
    v.photo = s?.photo ?? undefined;
  }

  /** 出発まであと何日。「これから」の札に付ける。 */
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    const p = nextPlan(new Date());
    setDays(daysUntil(p?.date, new Date()));
  }, []);

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

  /* 到着演出と、前に立っていた場所。どちらも降りた瞬間の話なのでまとめて置く。 */
  useEffect(() => {
    // さっき出ていった建物の前から始める。無ければ、いつもの家の前。
    try {
      const at = sessionStorage.getItem(RETURN_AT)?.split(",").map(Number);
      if (at?.length === 2 && Number.isFinite(at[0]) && Number.isFinite(at[1])) {
        const [x, y] = clampToIsland(at[0], at[1]);
        avatar.current.x = x;
        avatar.current.y = y;
      }
    } catch {
      /* 読めなければ家の前から。位置が戻らないだけなので気にしない */
    }

    let apart: number | null = null;
    try {
      // 日付になっていない値（前の版が入れていた "1" や、道具が入れる印）は
      // 「ついさっき来た」として扱う。演出を出す側に倒すと毎回出てしまう。
      const raw = localStorage.getItem(VISITED);
      apart = raw ? daysSince(raw) ?? 0 : null;
      localStorage.setItem(VISITED, jstNow().date);
    } catch {
      /* プライベートモードなどで読めなくても、演出を出すだけなので気にしない */
    }
    // 初めての人(null)には見せる。長く空いた人にも、もう一度。
    const again = apart === null || apart >= ARRIVE_AGAIN;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!again || still) {
      // 最初の1フレームでカメラを置く。ここで span を 0 にしてから ease で追わせると、
      // 極端に寄った絵を何十フレームも描いてから所定の位置に戻ることになる。
      snapCam.current = true;
      setArriving(false);
      return;
    }
    const t = setTimeout(() => setArriving(false), 3000);
    return () => clearTimeout(t);
  }, []);

  /* 島を出るとき、立っていた場所を残す。
     Next.js の画面遷移では pagehide が来ないので、消えるときに書く。 */
  useEffect(
    () => () => {
      const p = leaveAt.current ?? avatar.current;
      try {
        sessionStorage.setItem(RETURN_AT, `${Math.round(p.x)},${Math.round(p.y)}`);
      } catch {
        /* 書けなければ次は家の前から。それだけのこと */
      }
    },
    [],
  );

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
    if (mode === "phone") return wide ? 830 : 340;
    if (mode === "tablet") return Math.max(1120, 980 * aspect);
    return Math.max(1220, 880 * aspect);
  }, [mode, wide, box.w, box.h]);

  const camTarget = useCallback(() => {
    if (follow) return { x: avatar.current.x, y: avatar.current.y - 92 };
    if (mode === "phone") return { x: ISLAND.cx, y: ISLAND.cy - 40 };
    if (mode === "wide") return { x: ISLAND.cx - 40, y: ISLAND.cy + 6 };
    return { x: ISLAND.cx, y: ISLAND.cy - 40 };
  }, [follow, mode]);

  /* ---- 動きは React の外で ------------------------------------------------
     毎フレーム setState すると、160枚のスプライトを毎回作り直すことになって
     スマホで目に見えてカクつく（`docs/island-design.md`）。
     カメラ・あやと・住人・札の位置は、ref から DOM に直接書く。
     React が描き直すのは「奥行きの並びが変わったとき」と
     「札が開いた／閉じたとき」だけ。
     ---------------------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastOrder = "";
    let lastOpen: SpotId | null = null;

    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      clock.current = t;
      const b = boxRef.current;

      stepVillagers(villagers, dt, dice.current);
      const slot = Math.floor(t / 9000);
      if (slot !== inviteSlot.current) {
        inviteSlot.current = slot;
        rotateInvites(villagers, slot, (v) => hasVoice(v.icon));
      }

      // --- あやたを動かす ---
      const me = avatar.current;
      let vx = 0;
      let vy = 0;
      const k = keys.current;
      if (k.ArrowLeft || k.a) vx -= 1;
      if (k.ArrowRight || k.d) vx += 1;
      if (k.ArrowUp || k.w) vy -= 1;
      if (k.ArrowDown || k.s) vy += 1;
      if (vx || vy) target.current = null;
      else if (target.current) {
        const dx = target.current.x - me.x;
        const dy = target.current.y - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 7) target.current = null;
        else {
          vx = dx / d;
          vy = dy / d;
        }
      }
      const moving = !!(vx || vy);
      if (moving) {
        const n = Math.hypot(vx, vy) || 1;
        const sp = 4.2 * (dt / 16.67);
        const [nx, ny] = clampToIsland(me.x + (vx / n) * sp, me.y + (vy / n) * sp);
        me.x = nx;
        me.y = ny;
        // ayato.png は左を向いている絵。右へ歩くときに左右を反転する
        if (vx !== 0) facing.current = vx > 0 ? -1 : 1;
      }
      if (moving !== walkingNow.current) {
        walkingNow.current = moving;
        ayatoRef.current?.classList.toggle("walking", moving);
      }

      // --- 話しかけに行った相手のそばまで来たか ---
      if (walkingTo.current !== null) {
        const i = walkingTo.current;
        const who = villagers[i];
        if (!who || Math.hypot(me.x - who.x, (me.y - who.y) * 1.3) <= TALK_REACH) {
          walkingTo.current = null;
          target.current = null;
          if (who) openTalkRef.current?.(i);
        }
      }

      // --- カメラ ---
      const cam = camRef.current;
      const want = camTarget();
      if (snapCam.current) {
        // 到着演出を飛ばす人。寄りも位置も、最初の1フレームで所定の場所に置く
        snapCam.current = false;
        cam.x = want.x;
        cam.y = want.y;
        cam.span = span;
      } else {
        const ease = 0.09 * (dt / 16.67);
        cam.x += (want.x - cam.x) * ease;
        cam.y += (want.y - cam.y) * ease;
        const far = cam.span > span * 1.25;
        cam.span += (span - cam.span) * (far ? 0.019 : 0.09) * (dt / 16.67);
      }

      const vbW = cam.span;
      const vbH = (cam.span * b.h) / Math.max(1, b.w);
      const vbX = cam.x - vbW / 2;
      const vbY = cam.y - vbH / 2;
      const vb = `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;
      sceneRef.current?.setAttribute("viewBox", vb);
      lampRef.current?.setAttribute("viewBox", vb);
      const sx = (wx: number) => ((wx - vbX) / vbW) * b.w;
      const sy = (wy: number) => ((wy - vbY) / vbH) * b.h;

      // --- あやと ---
      if (ayatoRef.current) {
        ayatoRef.current.setAttribute(
          "transform",
          `translate(${me.x.toFixed(1)} ${me.y.toFixed(1)}) scale(${facing.current} 1)`,
        );
      }
      if (ayatoShadowRef.current) {
        ayatoShadowRef.current.setAttribute("cx", me.x.toFixed(1));
        ayatoShadowRef.current.setAttribute("cy", (me.y + 1).toFixed(1));
      }

      // --- 住人 ---
      for (let i = 0; i < villagers.length; i++) {
        const g = villagerRefs.current[i];
        if (!g) continue;
        const v = villagers[i];
        const pose = villagerPose(v, t);
        g.setAttribute(
          "transform",
          `translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)}) rotate(${pose.rot.toFixed(1)})`,
        );
        const w = whoRefs.current[i];
        if (w) {
          const off =
            v.x < vbX - 120 || v.x > vbX + vbW + 120 || v.y < vbY - 160 || v.y > vbY + vbH + 160;
          w.style.display = off ? "none" : "";
          if (!off) {
            w.style.transform = `translate(${sx(v.x).toFixed(1)}px, ${sy(v.y).toFixed(1)}px)`;
            w.classList.toggle("is-calling", !!v.invite);
          }
        }
      }

      // --- 入口の札 ---
      let best: SpotId | null = hover;
      if (!best) {
        let bd = HERE;
        for (const sp of SPOTS) {
          const d = Math.hypot(me.x - sp.x, (me.y - sp.y) * 1.35);
          if (d < bd) {
            bd = d;
            best = sp.id;
          }
        }
      }
      for (let i = 0; i < SPOTS.length; i++) {
        const el = markRefs.current[i];
        if (!el) continue;
        const sp = SPOTS[i];
        el.style.transform = `translate(${sx(sp.x).toFixed(1)}px, ${sy(sp.y).toFixed(1)}px)`;
        // 絵の大きさは倍率で変わるので、毎フレーム測り直す。
        // 当たり判定は指で押せる最小(48px)まで広げるが、
        // 札の高さは絵の実寸を使う。最小に合わせると、引きで札が建物から浮いてしまう。
        const k = b.w / vbW;
        const artW = spotBox(sp).w * k;
        const artH = sp.size * k;
        el.style.setProperty("--hw", `${Math.max(TAP_MIN, artW).toFixed(1)}px`);
        el.style.setProperty("--hh", `${Math.max(TAP_MIN, artH).toFixed(1)}px`);
        el.style.setProperty("--mh", `${Math.max(12, artH).toFixed(1)}px`);
      }
      if (best !== lastOpen) {
        lastOpen = best;
        setOpenSpot(best);
      }

      // --- 奥行きの並び。変わったときだけ描き直す ---
      const sig = villagers.map((v) => Math.round(v.y / 24)).join(",") + "|" + Math.round(me.y / 24);
      if (sig !== lastOrder) {
        lastOrder = sig;
        setOrder(sig);
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [camTarget, span, villagers, hover]);

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

  /** 入口へ歩く。押した瞬間に札が開くので、着く前から行き先が分かる。 */
  const goTo = (s: Spot) => {
    target.current = { x: s.x, y: s.y + 34 };
    walkingTo.current = null;
    setHint(false);
    setOpenSpot(s.id);
    if (wide) setWide(false);
  };

  const openTalk = useCallback(
    (i: number) => {
      villagers.forEach((o) => {
        if (o.says) hush(o);
      });
      talkTo(villagers[i], linesOf(villagers[i].icon));
      setTalking({ i, text: villagers[i].says ?? "" });
    },
    [villagers],
  );
  const openTalkRef = useRef<((i: number) => void) | null>(null);
  openTalkRef.current = openTalk;

  const closeTalk = useCallback(() => {
    setTalking((cur) => {
      if (cur && villagers[cur.i]) hush(villagers[cur.i]);
      return null;
    });
  }, [villagers]);

  /** 住人に話しかける。遠ければまず歩いて近づいてから。 */
  const approach = useCallback(
    (i: number) => {
      const v = villagers[i];
      const me = avatar.current;
      setHint(false);
      if (Math.hypot(me.x - v.x, (me.y - v.y) * 1.3) <= TALK_REACH) {
        openTalk(i);
        return;
      }
      v.mood = "stand";
      v.left = 9000;
      walkingTo.current = i;
      target.current = { x: v.x + (me.x > v.x ? 40 : -40), y: v.y + 8 };
    },
    [villagers, openTalk],
  );

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 吹き出しが出ているときは、どこを押しても閉じるだけ。ゲームと同じ作法。
    if (talking) {
      closeTalk();
      return;
    }
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    const host = hostRef.current!;
    const r = host.getBoundingClientRect();
    const cam = camRef.current;
    const vbW = cam.span;
    const vbH = (cam.span * r.height) / Math.max(1, r.width);
    const wx = cam.x - vbW / 2 + ((e.clientX - r.left) / r.width) * vbW;
    const wy = cam.y - vbH / 2 + ((e.clientY - r.top) / r.height) * vbH;
    setHint(false);
    const who = villagerAt(villagers, wx, wy, RESIDENT_H * 0.6);
    if (who) {
      approach(villagers.indexOf(who));
      return;
    }
    walkingTo.current = null;
    target.current = { x: wx, y: wy };
  };

  /* 景色・住人・あやとを、足元の y で並べ替えてから描く。
     こうしないと木の手前に立つべき住人が木の裏に隠れてしまう。
     order が変わったときだけ組み直す。 */
  const layers = useMemo(() => {
    const cast = villagers.map((v, i) => ({ kind: "villager" as const, y: v.y, key: `v${i}`, i, v }));
    const me = { kind: "ayato" as const, y: avatar.current.y, key: "me" };
    const scene = PROPS.map((p, i) => ({ kind: "prop" as const, y: p.y, key: `o${i}`, p }));
    return [...scene, ...cast, me].sort((a, b) => a.y - b.y);
    // order は「並びが変わった」ことだけを伝える合図
  }, [order, villagers]);

  const cam = camRef.current;
  const vbW0 = cam.span;
  const vbH0 = (cam.span * box.h) / Math.max(1, box.w);
  const vb0 = `${cam.x - vbW0 / 2} ${cam.y - vbH0 / 2} ${vbW0} ${vbH0}`;

  return (
    <div
      className={`stage has-today${arriving ? " is-arriving" : ""}${talking ? " is-talking" : ""}`}
      data-view={follow ? "close" : "wide"}
      data-mode={mode}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg ref={sceneRef} className="stage-svg" viewBox={vb0} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <IslandScene />
        {layers.map((l) => {
          if (l.kind === "prop") {
            const p: Item = l.p;
            const art = <Sprite key={l.key} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />;
            if (!p.spot) return art;
            // 入口の建物は、札が開いているときだけ軽く弾む
            return (
              <g
                key={l.key}
                className={`spot-art${openSpot === p.spot ? " is-on" : ""}`}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              >
                {art}
              </g>
            );
          }
          if (l.kind === "villager") {
            const v: Villager = l.v;
            if (!v.icon || !readyIcons.has(v.icon)) return null;
            return (
              <g
                key={l.key}
                ref={(el) => {
                  villagerRefs.current[l.i] = el;
                }}
                transform={`translate(${v.x.toFixed(1)} ${v.y.toFixed(1)})`}
              >
                <ellipse cx={0} cy={0} rx={13} ry={5} fill="#134a2c" opacity={0.18} />
                <image
                  href={residentIconUrl(v.icon)}
                  x={-RESIDENT_H / 2}
                  y={-RESIDENT_H}
                  width={RESIDENT_H}
                  height={RESIDENT_H}
                  preserveAspectRatio="xMidYMax meet"
                />
              </g>
            );
          }
          return (
            <g key={l.key}>
              <ellipse ref={ayatoShadowRef} cx={avatar.current.x} cy={avatar.current.y + 1} rx={22} ry={8} fill="#134a2c" opacity={0.22} />
              <g
                ref={ayatoRef}
                transform={`translate(${avatar.current.x} ${avatar.current.y}) scale(${facing.current} 1)`}
                className="ayato"
              >
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
      <svg ref={lampRef} className="stage-lamps" viewBox={vb0} preserveAspectRatio="xMidYMid slice" aria-hidden>
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

      {/* 入口の札。6つとも、いつも立っている。
          遠いときは小さく「!」、近づくと開いて名前と「はいる」が出る。 */}
      <div className="labels">
        {SPOTS.map((sp, i) => {
          const on = openSpot === sp.id;
          return (
            <div
              key={sp.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className={`spot${on ? " is-on" : ""}`}
            >
              <button
                data-ui
                className="spot-hit"
                onClick={() => goTo(sp)}
                onMouseEnter={() => setHover(sp.id)}
                onMouseLeave={() => setHover((v) => (v === sp.id ? null : v))}
                onFocus={() => setHover(sp.id)}
                onBlur={() => setHover((v) => (v === sp.id ? null : v))}
                aria-label={`${sp.label}へ行く`}
              />
              <Link
                data-ui
                href={sp.href}
                className="spot-mark"
                tabIndex={on ? 0 : -1}
                // 戻ってきたときに、この建物の前に立っていてほしい。
                // 遠くから札を押して入ることもあるので、あやとの現在地ではなく建物の足元を残す。
                onClick={() => {
                  leaveAt.current = { x: sp.x, y: sp.y + 34 };
                }}
              >
                <span className="spot-bang" aria-hidden>
                  !
                </span>
                {sp.countdown && days !== null && days >= 0 && (
                  <em className="spot-badge" aria-hidden>
                    {days === 0 ? "今日" : `あと${days}日`}
                  </em>
                )}
                <span className="spot-text">
                  <b>{sp.label}</b>
                  <i>{sp.blurb}</i>
                </span>
                <span className="spot-go">
                  {UI.enter}
                  <Icon name="right" size={12} />
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {/* 住人。押す所は建物の当たり判定より奥に置く。
          行き先を塞がないため、会話はあくまでおまけ。 */}
      <div className="labels is-cast">
        {villagers.map((v, i) => (
          <div
            key={`v${i}`}
            ref={(el) => {
              whoRefs.current[i] = el;
            }}
            className="who"
          >
            {v.icon && readyIcons.has(v.icon) && (
              <button data-ui className="who-hit" onClick={() => approach(i)} aria-label={UI.talkTo} />
            )}
            {v.name && (
              <span className="who-name">
                {v.photo && <img src={v.photo} alt="" loading="lazy" />}
                <b>{v.name}</b>
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 吹き出し。画面の上にどんと出して、どこを押しても閉じる。 */}
      {talking && (
        <div className="talkbox" role="status">
          <p>{talking.text}</p>
          <span className="talkbox-tap">画面のどこかを押すと閉じる</span>
        </div>
      )}

      {/* 今日の島。降りた瞬間に「今日は何が違うか」を1枚だけ渡す。
          PC・タブレットは島の隅に浮かせ、スマホは下バーの1段目に置く。
          出し分けは mode で決まるので、同時に2枚は出ない。 */}
      {mode !== "phone" && <Today place="corner" />}

      {/* スマホ: 行き先は下のバーにまとめる */}
      {mode === "phone" && (
        <div className="island-bar" data-ui>
          <Today place="bar" />
          <div className="island-bar-scroll">
            {SPOTS.map((s) => (
              <button
                key={s.id}
                className={`bar-spot${openSpot === s.id ? " is-on" : ""}`}
                onClick={() => goTo(s)}
              >
                <img src={`/sprites/${s.icon}.webp`} alt="" />
                <span>{s.label}</span>
                {s.countdown && days !== null && days >= 0 && (
                  <em>{days === 0 ? "今日" : `あと${days}日`}</em>
                )}
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

      {hint && <p className="walk-hint">{UI.walkHint}</p>}
    </div>
  );
}
