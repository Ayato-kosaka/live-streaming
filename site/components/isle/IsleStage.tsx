"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rng } from "@/components/island/geometry";
import { Sprite, spriteWidth } from "@/components/island/Sprite";
import Icon from "@/components/ui/IconCore";
import { hasVoice, linesOf } from "@/content/chatter";
import IsleGround, { Building } from "./IsleGround";
import IsleSheet from "./IsleSheet";
import {
  callOut,
  createFolk,
  folkAt,
  folkPose,
  hush,
  resetTalk,
  rotateInvites,
  stepFolk,
  talkTo,
  type Folk,
  type Ground,
} from "./folk";
import { useFund } from "@/components/nordic/fund";
import { FUND_GOAL_YEN } from "@/content/chapters";
import type { IsleSpec } from "./spec";
import { buildWorld, clampTo, type IsleWorld, type Placed } from "./world";

/**
 * 歩ける島ひとつ。
 *
 * ## いまの島（`components/island/IslandStage.tsx`）とどう違うか
 *
 * **触りごこちは同じにしてある。** 押したところまで歩く、カメラが付いてくる、
 * 近づくと札が開く、住人に話しかけると吹き出しが出る、引いて島ぜんぶを見る。
 * あやとの言葉「コーカサス周遊と同じぐらいのクオリティに」がここ。
 *
 * 違うのは**中身が章から作られている**ことだけ。あちらは 1200四方に 300要素を
 * 手で置いた1枚もので、章ごとに輪郭も草木も建物も変えられない。
 * **あちらのファイルは1文字も触っていない**（同時に別の担当が直しているため）。
 *
 * ## 値段
 *
 * 島は5つあるが、**見えているのは常に1つ**なので、払うのも1つぶん。
 * そのために、いまの島で効いた3つをそのまま持ってきた。
 *
 * 1. **`viewBox` を書き換えない。** 書き換えると SVG の中身が全部塗り直される
 *    （いまの島で 23.3 → 4.8ms）。画面より広く焼いておいて、ズレは
 *    CSS の `transform` で見せる。ズレが余白を使い切ったときだけ焼き直す
 * 2. **同じ値を書かない。** 属性に書けば、値が同じでもその要素は塗り直される。
 *    カメラ・あやと・住人、どれも文字にして同じなら触らない
 * 3. **見えていないあいだは動かさない。** 画面の外／別のタブでは rAF を止める
 *
 * SMIL（`<animate>`）は1つも使っていない。あれは中身を全部塗り直す
 * （`CLAUDE.md`。`/nordic/sweden` で3秒 3,180ms を1つ払っていた）。
 */

/** あやとの背丈。島の主人公なので、住人より必ず大きい */
const AYATO_H = 60;
/** 住人の背丈 */
const FOLK_H = 52;
const folkIconUrl = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s128`;

/** 画面の外に余分に焼いておく幅(px)。`--scene-pad` と必ず同じ値にする */
const SCENE_PAD = 140;
/** 焼いた絵を、これ以上の倍率で引き伸ばして見せない */
const ZOOM_Q = 1.12;
/** ここまで来たら札が開く距離(ワールド単位) */
const HERE = 150;
/** 指で押せる最小の大きさ(画面px) */
const TAP_MIN = 48;
/** 話しかけられる距離。これより遠いと、まず歩いて近づく */
const TALK_REACH = 74;
/** 案内を出しておく時間(ミリ秒) */
const HINT_SPAN = 5600;
/** 一度でも島を歩いたか。覚えていることを毎回出さない */
const WALKED = "ayato-island-walked";

const modeOf = (w: number) => (w < 640 ? "phone" : w < 1024 ? "tablet" : "wide");

export default function IsleStage({ spec }: { spec: IsleSpec }) {
  const world = useMemo(() => buildWorld(spec), [spec]);
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const ayatoRef = useRef<SVGGElement>(null);
  const ayatoShadowRef = useRef<SVGEllipseElement>(null);
  const folkRefs = useRef<(SVGGElement | null)[]>([]);
  const whoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const markRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const signBox = useRef<{ w: number; h: number }[]>([]);
  const edgeAt = useRef<string[]>([]);
  const platesDirty = useRef(true);
  const uiBoxes = useRef<{ x: number; y: number; w: number; h: number }[]>([]);

  const [box, setBox] = useState({ w: 1440, h: 820 });
  const [wide, setWide] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [talking, setTalking] = useState<{ i: number; text: string } | null>(null);
  const [order, setOrder] = useState("");
  /** 出発までの日数。**画面が出てから数える**（静的書き出しに焼かない） */
  const [left, setLeft] = useState<number | null>(null);

  const avatar = useRef({ ...world.dock });
  const facing = useRef(1);
  const walkingNow = useRef(false);
  const target = useRef<{ x: number; y: number } | null>(null);
  const walkingTo = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const camRef = useRef({ x: world.dock.x, y: world.dock.y - 40, span: 0 });
  const anchor = useRef({ x: 0, y: 0, span: 0, w: 0, h: 0 });
  const sceneVb = useRef("");
  const sceneTf = useRef("");
  const snapCam = useRef(true);
  const landedAt = useRef(performance.now());
  const spokeFirst = useRef(false);
  const dice = useRef(rng(4711));
  const inviteSlot = useRef(-1);
  const boxRef = useRef(box);
  boxRef.current = box;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  /** 島の草地。住人もあやとも、ここから出ない */
  const ground: Ground = useMemo(
    () => ({ cx: world.cx, cy: world.cy, squash: world.squash, radii: world.grass, places: world.places }),
    [world],
  );
  const folk = useMemo(() => createFolk(spec.folk, ground, world.r), [spec.folk, ground, world.r]);
  /* 島を移ったら、挨拶と声かけの控えをまっさらにする。
     ここを持ち越すと、前の島で誰かと話した人は、次の島では誰にも声をかけられない */
  useEffect(() => resetTalk(), [spec.slug]);

  /* 島の外周は寄りの度合いを決めるのに何度も要る。島ごとに1回で足りる */
  const fullSpan = useCallback(
    (w: number, h: number) => {
      const rx = world.r * Math.max(...world.art.radii) * 1.16;
      const ry = rx * world.squash;
      return Math.max(rx * 2, (ry * 2 * w) / Math.max(1, h));
    },
    [world],
  );
  const spanOf = useCallback(
    (w: number, h: number, all: boolean) => {
      if (all) return fullSpan(w, h);
      const m = modeOf(w);
      // 寄りは「1ワールド単位あたり何 px か」で決める。画面の幅で割ると、
      // 大きな画面ほど引いてしまって、住人の大きさが機種で変わる
      const near = m === "phone" ? 340 : m === "tablet" ? Math.max(430, w / 1.75) : Math.max(560, w / 2.05);
      // 小さい島では、寄りすぎると島より海のほうが広く映る
      return Math.min(near, fullSpan(w, h) * 0.92);
    },
    [fullSpan],
  );

  /** 建物の並びのまん中。カメラはあやとを追いつつ、ここへ引き戻す */
  const mid = useMemo(() => {
    const xs = world.places.map((p) => p.x);
    const ys = world.places.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }, [world]);

  /* --- 住人の絵。外から取ってくるので先に読んでおく ---
     SVG の image に直接 URL を入れると、失敗したとき壊れた画像の枠が出る */
  useEffect(() => {
    let alive = true;
    for (const v of folk) {
      const img = new Image();
      img.src = folkIconUrl(v.icon);
      img.onload = () => {
        if (alive) setReady((prev) => (prev.has(v.icon) ? prev : new Set(prev).add(v.icon)));
      };
    }
    return () => {
      alive = false;
    };
  }, [folk]);

  /* --- 画面の大きさ --- */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      // 幅が分かった＝寄りの度合いが決まる。ease で詰めると、いちばん重い絵を
      // 何十枚も描いてから所定の位置に着くことになる。1フレームで置く
      snapCam.current = true;
      setBox({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  /* --- 札の実寸。縁へ寄せるときに要る ---
     毎フレーム測らない（offsetWidth は layout を起こす）。変わったときだけ */
  useEffect(() => {
    const ro = new ResizeObserver((es) => {
      for (const e of es) {
        const i = Number((e.target as HTMLElement).dataset.i);
        const bs = e.borderBoxSize?.[0];
        signBox.current[i] = bs
          ? { w: bs.inlineSize, h: bs.blockSize }
          : { w: e.contentRect.width, h: e.contentRect.height };
      }
      platesDirty.current = true;
    });
    for (let i = 0; i < world.places.length; i++) {
      const el = markRefs.current[i]?.querySelector<HTMLElement>(".isle-mark");
      if (!el) continue;
      el.dataset.i = String(i);
      signBox.current[i] = { w: el.offsetWidth, h: el.offsetHeight };
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [world]);

  /* --- 島の隅の道具。札がこの上に乗らないようにする --- */
  useEffect(() => {
    const host = hostRef.current;
    const hb = host?.getBoundingClientRect();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    if (host && hb)
      for (const el of host.querySelectorAll<HTMLElement>(".isle-view, .isle-atlas, .isle-sign")) {
        const r = el.getBoundingClientRect();
        boxes.push({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height });
      }
    uiBoxes.current = boxes;
    platesDirty.current = true;
  }, [openSpot, box.w, box.h, left]);

  /* --- 出発までの日数。1分ごとに数え直す ---
     静的書き出しなので、ビルド時の「今日」を焼き込まない（`CLAUDE.md`） */
  const until = spec.places.find((p) => p.countdown)?.countdown;
  useEffect(() => {
    if (!until) return;
    const read = () => {
      const t = Date.parse(until);
      if (!Number.isFinite(t)) return;
      setLeft(Math.ceil((t - Date.now()) / 86_400_000));
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, [until]);

  /* --- 歩きかたの案内。初めての人にだけ、数秒だけ --- */
  const hintDone = useRef(false);
  const dismissHint = useCallback(() => {
    if (hintDone.current) return;
    hintDone.current = true;
    setHint(false);
    try {
      localStorage.setItem(WALKED, "1");
    } catch {
      /* 覚えられなくても、次にもう一度出るだけ */
    }
  }, []);
  useEffect(() => {
    if (hintDone.current) return;
    let walked = false;
    try {
      walked = !!localStorage.getItem(WALKED);
    } catch {
      /* 読めないときは初めての人として扱う */
    }
    if (walked) {
      hintDone.current = true;
      return;
    }
    setHint(true);
    const t = setTimeout(() => dismissHint(), HINT_SPAN);
    return () => clearTimeout(t);
  }, [dismissHint]);

  const openTalk = useCallback(
    (i: number) => {
      folk.forEach((o) => {
        if (o.says) hush(o);
      });
      const v = folk[i];
      if (!v) return;
      /* 1言目の「はじめまして／久しぶり」はここではやらない。
         あれはいまの島（トップ）が `ayato-island-met` で覚えているもので、
         過去の島でも書き込むと、**同じ日にトップへ行った人が挨拶されなくなる。**
         過去の島は振り返る場所なので、その人のいつものセリフだけでいい */
      talkTo(v, linesOf(v.icon));
      setTalking({ i, text: v.says ?? "" });
    },
    [folk],
  );
  const openTalkRef = useRef<((i: number) => void) | null>(null);
  openTalkRef.current = openTalk;

  const closeTalk = useCallback(() => {
    setTalking((cur) => {
      if (cur && folk[cur.i]) hush(folk[cur.i]);
      return null;
    });
  }, [folk]);

  const camWant = useCallback(() => {
    const b = boxRef.current;
    if (wideRef.current) return { x: world.cx, y: world.cy };
    /* 寄っているあいだはあやとを追う。ただし**追いきらない。**
       あやとだけを見て寄ると、島の骨格（建物の並び）が画面から外れる。
       まん中から離れてよい量に上限を決めて、その範囲では建物のまん中を見る */
    const ex = avatar.current.x;
    const ey = avatar.current.y - (modeOf(b.w) === "phone" ? 92 : 70);
    const s = spanOf(b.w, b.h, false);
    const vh = (s * b.h) / Math.max(1, b.w);
    const pull = (d: number, max: number) => (d > max ? max : d < -max ? -max : d);
    return { x: ex + pull(mid.x - ex, s * 0.22), y: ey + pull(mid.y - ey, vh * 0.18) };
  }, [mid, spanOf, world]);

  /* ---- 動きは React の外で ------------------------------------------------
     毎フレーム setState すると、島のスプライトを毎回作り直すことになる
     （`docs/island-design.md` 3章）。カメラ・あやと・住人・札の位置は
     ref から DOM に直接書く。React が描き直すのは「奥行きの並びが変わった」
     「札が開いた／閉じた」ときだけ。
     ---------------------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastOrder = "";
    let lastOpen: string | null = null;
    let lastVb = "";
    let lastK = 0;
    let lastMe = "";
    const lastPose: string[] = [];
    let castWait = 0;
    let camBusy = true;
    let movingLast = false;
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const step = (t: number) => {
      const dt = Math.min(48, t - last);
      last = t;
      const b = boxRef.current;

      /* 住人を動かす値段。**カメラもあやとも止まっているあいだだけ 24fps に落とす。**
         住人は1秒に数 px しか歩かない。60回書いても24回書いても目に見えるものは
         変わらないのに、書いた要素の外接矩形ぶん島が塗り直される */
      const busy = camBusy || movingLast || !!target.current || walkingTo.current !== null;
      castWait += dt;
      const stepCast = !still && folk.length > 0 && (busy || castWait >= 40);
      if (stepCast) {
        stepFolk(folk, castWait, ground, dice.current);
        castWait = 0;
      }
      const slot = Math.floor(t / 9000);
      if (slot !== inviteSlot.current) {
        inviteSlot.current = slot;
        rotateInvites(folk, slot, (v) => hasVoice(v.icon));
      }

      // --- あやと ---
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
        const [nx, ny] = clampTo(ground, world.grass, me.x + (vx / n) * sp, me.y + (vy / n) * sp, 10);
        me.x = nx;
        me.y = ny;
        // ayato.webp は左を向いている絵。右へ歩くときに左右を反転する
        if (vx !== 0) facing.current = vx > 0 ? -1 : 1;
      }
      if (moving !== walkingNow.current) {
        walkingNow.current = moving;
        ayatoRef.current?.classList.toggle("walking", moving);
      }

      /* そばに来た人に、住人のほうから声をかける（`docs/island-play.md`）。
         条件がそろった1回だけで、あとは毎回 null が返る */
      if (!spokeFirst.current && folk.length) {
        const who = callOut(folk, me, t - landedAt.current);
        if (who) {
          spokeFirst.current = true;
          openTalkRef.current?.(folk.indexOf(who));
        }
      }

      // --- 話しかけに行った相手のそばまで来たか ---
      if (walkingTo.current !== null) {
        const i = walkingTo.current;
        const who = folk[i];
        if (!who || Math.hypot(me.x - who.x, (me.y - who.y) * 1.3) <= TALK_REACH) {
          walkingTo.current = null;
          target.current = null;
          if (who) openTalkRef.current?.(i);
        }
      }

      // --- カメラ ---
      const cam = camRef.current;
      const want = camWant();
      const spanNow = spanOf(b.w, b.h, wideRef.current);
      if (snapCam.current || !cam.span) {
        snapCam.current = false;
        cam.x = want.x;
        cam.y = want.y;
        cam.span = spanNow;
      } else {
        const ease = 0.09 * (dt / 16.67);
        cam.x += (want.x - cam.x) * ease;
        cam.y += (want.y - cam.y) * ease;
        cam.span += (spanNow - cam.span) * 0.09 * (dt / 16.67);
        // 追いつく手前で止める。放っておくと、目に見えない差を永遠に詰め続けて、
        // そのあいだ島を塗り直し続ける
        if (Math.abs(want.x - cam.x) < 0.05) cam.x = want.x;
        if (Math.abs(want.y - cam.y) < 0.05) cam.y = want.y;
        if (Math.abs(spanNow - cam.span) < 0.05) cam.span = spanNow;
      }

      const vbW = cam.span;
      const vbH = (cam.span * b.h) / Math.max(1, b.w);
      const vbX = cam.x - vbW / 2;
      const vbY = cam.y - vbH / 2;
      const vb = `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;
      const camMoved = vb !== lastVb;
      /* カメラが止まったのに、絵が引き伸ばされたまま残ることがある。
         止まった1回だけ焼き直して等倍に戻す。**止まっている絵がいちばん長く見られる** */
      if (!camMoved && sceneTf.current) anchor.current.span = 0;
      if (camMoved || sceneTf.current) {
        lastVb = vb;
        const a = anchor.current;
        const kd = b.w / cam.span;
        let s = a.span / cam.span;
        let tx = -(cam.x - a.x) * kd;
        let ty = -(cam.y - a.y) * kd;
        if (
          a.w !== b.w ||
          a.h !== b.h ||
          s > ZOOM_Q ||
          s < 1 / ZOOM_Q ||
          Math.abs(tx) > SCENE_PAD * 0.85 ||
          Math.abs(ty) > SCENE_PAD * 0.85
        ) {
          a.x = cam.x;
          a.y = cam.y;
          a.span = cam.span;
          a.w = b.w;
          a.h = b.h;
          sceneVb.current = anchorVb(cam.x, cam.y, cam.span, b.w, b.h);
          sceneRef.current?.setAttribute("viewBox", sceneVb.current);
          s = 1;
          tx = 0;
          ty = 0;
        }
        const tf =
          s === 1 && tx === 0 && ty === 0
            ? ""
            : `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
        if (tf !== sceneTf.current) {
          sceneTf.current = tf;
          if (sceneRef.current) sceneRef.current.style.transform = tf;
        }
      }
      const sx = (wx: number) => ((wx - vbX) / vbW) * b.w;
      const sy = (wy: number) => ((wy - vbY) / vbH) * b.h;

      // --- あやとの位置。文字にして同じなら書かない ---
      const meTf = `translate(${me.x.toFixed(1)} ${me.y.toFixed(1)}) scale(${facing.current} 1)`;
      if (meTf !== lastMe) {
        lastMe = meTf;
        ayatoRef.current?.setAttribute("transform", meTf);
        ayatoShadowRef.current?.setAttribute("cx", me.x.toFixed(1));
        ayatoShadowRef.current?.setAttribute("cy", (me.y + 1).toFixed(1));
      }

      // --- 住人 ---
      const castWrite = stepCast || camMoved;
      for (let i = 0; castWrite && i < folk.length; i++) {
        const v = folk[i];
        // 画面の外の人は書かない。書けば、そのぶん島が塗り直される
        const off =
          v.x < vbX - 120 || v.x > vbX + vbW + 120 || v.y < vbY - 160 || v.y > vbY + vbH + 160;
        const gEl = folkRefs.current[i];
        if (gEl && !off && stepCast) {
          const pose = folkPose(v, t);
          /* 左右は反転しない。住人の絵は視聴者さんが作った正面向きのマスコットで、
             反転すると持ち物（お玉・ウクレレ・花）だけが裏返る */
          const tf = `translate(${v.x.toFixed(1)} ${(v.y + pose.dy).toFixed(1)}) rotate(${pose.rot.toFixed(1)})`;
          if (tf !== lastPose[i]) {
            lastPose[i] = tf;
            gEl.setAttribute("transform", tf);
          }
        }
        const wEl = whoRefs.current[i];
        if (wEl) {
          wEl.style.display = off ? "none" : "";
          if (!off) wEl.style.transform = `translate(${sx(v.x).toFixed(1)}px, ${sy(v.y).toFixed(1)}px)`;
        }
      }

      // --- 建物の札 ---
      let best: string | null = hoverRef.current;
      if (!best) {
        let bd = HERE;
        for (const sp of world.places) {
          const d = Math.hypot(me.x - sp.x, (me.y - sp.y) * 1.35);
          if (d < bd) {
            bd = d;
            best = sp.id;
          }
        }
      }
      if (camMoved || platesDirty.current) {
        platesDirty.current = false;
        const kk = b.w / vbW;
        if (kk !== lastK) {
          lastK = kk;
          // 住人の当たりを絵の大きさに合わせる。倍率で 53〜94px まで伸び縮みするので、
          // 固定にすると寄ったときに絵の下半分が押せない
          hostRef.current?.style.setProperty("--ws", `${Math.max(TAP_MIN, FOLK_H * kk).toFixed(1)}px`);
        }
        placePlates(world.places, {
          b,
          kk,
          sx,
          sy,
          marks: markRefs.current,
          pins: pinRefs.current,
          sizes: signBox.current,
          edges: edgeAt.current,
          taken: uiBoxes.current,
          open: lastOpen,
        });
      }
      if (best !== lastOpen) {
        lastOpen = best;
        setOpenSpot(best);
      }

      /* 奥行きの並び。変わったときだけ描き直す */
      if (stepCast || moving) {
        const sig = folk.map((v) => Math.round(v.y / 24)).join(",") + "|" + Math.round(me.y / 24);
        if (sig !== lastOrder) {
          lastOrder = sig;
          setOrder(sig);
        }
      }

      camBusy = camMoved;
      movingLast = moving;
      raf = requestAnimationFrame(step);
    };

    /* --- 見えていないあいだは動かさない --- */
    let alive = false;
    let onScreen = true;
    const run = () => {
      if (alive || document.hidden || !onScreen) return;
      alive = true;
      last = performance.now();
      hostRef.current?.classList.remove("is-away");
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      hostRef.current?.classList.add("is-away");
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) run();
      else stop();
    }, { rootMargin: "80px" });
    if (hostRef.current) io.observe(hostRef.current);
    const vis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", vis);
    run();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [camWant, folk, ground, spanOf, world]);

  /* --- キーボード --- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) {
        keys.current[k] = true;
        dismissHint();
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
  }, [dismissHint]);

  /** 建物へ歩く。押した瞬間に札が開くので、着く前から行き先が分かる */
  const goTo = (s: Placed) => {
    target.current = { x: s.x, y: s.y + 34 };
    walkingTo.current = null;
    dismissHint();
    setOpenSpot(s.id);
    if (wide) setWide(false);
  };

  /** 住人に話しかける。遠ければまず歩いて近づいてから */
  const approach = useCallback(
    (i: number) => {
      const v = folk[i];
      const me = avatar.current;
      dismissHint();
      if (Math.hypot(me.x - v.x, (me.y - v.y) * 1.3) <= TALK_REACH) {
        openTalk(i);
        return;
      }
      v.mood = "stand";
      v.left = 9000;
      walkingTo.current = i;
      target.current = { x: v.x + (me.x > v.x ? 40 : -40), y: v.y + 8 };
    },
    [folk, openTalk, dismissHint],
  );

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 吹き出しが出ているときは、どこを押しても閉じるだけ。ゲームと同じ作法
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
    dismissHint();
    const who = folkAt(folk, wx, wy, FOLK_H * 0.6);
    if (who) {
      approach(folk.indexOf(who));
      return;
    }
    walkingTo.current = null;
    target.current = { x: wx, y: wy };
  };

  /* 景色は島に置いたら二度と動かない。要素を1度だけ作って使い回す。
     並び替えのたびに作り直すと、住人が木を1本またぐたびに
     React が草木を全部見に行くことになる */
  const scenery = useMemo(
    () =>
      world.plants.map((p, i) => ({
        y: p.y,
        key: `p${i}`,
        art: <Sprite key={`p${i}`} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} sway={p.sway} />,
      })),
    [world],
  );
  const houses = useMemo(
    () =>
      world.places.map((p) => ({
        y: p.y,
        key: `h${p.id}`,
        id: p.id,
        x: p.x,
        art: <Sprite name={p.icon} x={p.x} y={p.y} size={p.size} />,
      })),
    [world],
  );

  /** 足元の y で並べ替えてから描く。木の手前に立つべき人が裏に隠れないように */
  const layers = useMemo(() => {
    const cast = folk.map((v, i) => ({ kind: "folk" as const, y: v.y, key: `v${i}`, i, v }));
    const props = scenery.map((s) => ({ kind: "prop" as const, y: s.y, key: s.key, art: s.art }));
    const homes = houses.map((h) => ({ kind: "house" as const, y: h.y, key: h.key, id: h.id, x: h.x, art: h.art }));
    const me = { kind: "ayato" as const, y: avatar.current.y, key: "me" };
    return [...props, ...homes, ...cast, me].sort((a, b) => a.y - b.y);
    // order は「並びが変わった」ことだけを伝える合図
  }, [order, folk, scenery, houses]);

  /* 島の絵の viewBox は毎フレーム rAF が ref に書いている。
     React が描き直したときも同じ値を書かないと、次のフレームまで絵が飛ぶ */
  if (!sceneVb.current) {
    const cam = camRef.current;
    cam.span = cam.span || spanOf(box.w, box.h, false);
    anchor.current = { x: cam.x, y: cam.y, span: cam.span, w: box.w, h: box.h };
    sceneVb.current = anchorVb(cam.x, cam.y, cam.span, box.w, box.h);
  }

  const openPlace = world.places.find((p) => p.id === sheet) ?? null;

  return (
    <div
      className={`isle${talking ? " is-talking" : ""}`}
      data-theme={spec.theme}
      data-mode={modeOf(box.w)}
      ref={hostRef}
      onClick={onStageClick}
    >
      <svg
        ref={sceneRef}
        className="isle-svg"
        viewBox={sceneVb.current}
        style={sceneTf.current ? { transform: sceneTf.current } : undefined}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <IsleGround w={world} />
        {spec.building && <Buildsite world={world} opensAt={spec.building} />}
        {layers.map((l) => {
          if (l.kind === "prop") return l.art;
          if (l.kind === "house")
            return (
              <g
                key={l.key}
                className={`isle-art${openSpot === l.id ? " is-on" : ""}`}
                style={{ transformOrigin: `${l.x}px ${l.y}px` }}
              >
                {l.art}
              </g>
            );
          if (l.kind === "folk") {
            const v: Folk = l.v;
            if (!ready.has(v.icon)) return null;
            return (
              <g
                key={l.key}
                ref={(el) => {
                  folkRefs.current[l.i] = el;
                }}
                transform={`translate(${v.x.toFixed(1)} ${v.y.toFixed(1)})`}
              >
                <ellipse cx={0} cy={0} rx={13} ry={5} fill="#134a2c" opacity={0.18} />
                <image
                  href={folkIconUrl(v.icon)}
                  x={-FOLK_H / 2}
                  y={-FOLK_H}
                  width={FOLK_H}
                  height={FOLK_H}
                  preserveAspectRatio="xMidYMax meet"
                />
              </g>
            );
          }
          return (
            <g key={l.key}>
              <ellipse
                ref={ayatoShadowRef}
                cx={avatar.current.x}
                cy={avatar.current.y + 1}
                rx={22}
                ry={8}
                fill="#134a2c"
                opacity={0.22}
              />
              <g
                ref={ayatoRef}
                transform={`translate(${avatar.current.x} ${avatar.current.y}) scale(${facing.current} 1)`}
                className="ayato"
              >
                <image
                  href="/characters/ayato.webp"
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

      {/* 建物の札。近づくと開いて、名前と一言と「みる」が出る */}
      <div className="isle-labels">
        {world.places.map((sp, i) => {
          const on = openSpot === sp.id;
          /* 押したら何が起きるか。
             **中身のある建物は、島から出ない。** 島の上に板が開いて、その中に一覧が出る
             （あやとの「やぐらみたいな感じで…が見れて」）。
             行き先が1つしかないもの（旅のしおり・掲示板）だけ、そのまま外へ出る */
          const enter = () => {
            dismissHint();
            if (sp.items || sp.facts) setSheet(sp.id);
            else if (sp.href) router.push(sp.href);
          };
          return (
            <div
              key={sp.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className={`isle-spot${on ? " is-on" : ""}${sp.sign ? " is-sign" : ""}`}
            >
              {/* 建物の当たり。**まず歩く。** 島を歩くのがこの画面のいちばんの手ざわりで、
                  着けば札が開いて、そこから中に入れる。もうそばに立っているなら、そのまま入る */}
              <button
                data-ui
                className="isle-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  if (on) enter();
                  else goTo(sp);
                }}
                aria-label={`${sp.label}をみる`}
              />
              <span
                className="isle-pin"
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
                <PlaceMark place={sp} left={left} onOpen={enter} />
              </span>
            </div>
          );
        })}
      </div>

      {/* 住人。押す所は建物の当たりより奥に置く（会話はおまけ。行き先を塞がない） */}
      <div className="isle-labels is-cast">
        {folk.map((v, i) => (
          <div
            key={`v${i}`}
            ref={(el) => {
              whoRefs.current[i] = el;
            }}
            className="isle-who"
          >
            {ready.has(v.icon) && (
              <button
                data-ui
                className="isle-who-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  approach(i);
                }}
                aria-label="話しかける"
              />
            )}
          </div>
        ))}
      </div>

      {/* 吹き出し。画面の上にどんと出して、どこを押しても閉じる */}
      {talking && (
        <div className="isle-talk" role="status">
          <p>{talking.text}</p>
          <span className="isle-talk-tap">画面のどこかを押すと閉じる</span>
        </div>
      )}

      {/* 建物の中。押した建物の一覧が、島の上に開く */}
      {openPlace && <IsleSheet place={openPlace} onClose={() => setSheet(null)} />}

      {/* この島の名前。島に降りた人が最初に読むもの */}
      <div className="isle-sign" data-ui>
        <b>{spec.name}</b>
        <i>{spec.note}</i>
      </div>

      <button className="isle-view" data-ui onClick={() => setWide((v) => !v)}>
        <Icon name={wide ? "walk" : "island"} size={15} />
        {wide ? "島におりる" : "島ぜんぶ"}
      </button>

      <Link className="isle-atlas" data-ui href="/atlas" prefetch={false}>
        <Icon name="map" size={15} />
        島の地図
      </Link>

      {hint && <p className="isle-hint">押したところまで歩いていくよ。建物に近づくと、中が見られる</p>}
    </div>
  );
}

/** 島の絵の viewBox。画面より各辺 SCENE_PAD だけ広く取る */
function anchorVb(cx: number, cy: number, span: number, w: number, h: number): string {
  const k = Math.max(1, w) / span;
  const vw = (w + SCENE_PAD * 2) / k;
  const vh = (h + SCENE_PAD * 2) / k;
  return `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}

/** 札1枚。名前・一言・「みる」。開いていないあいだは名前だけ */
function PlaceMark({
  place,
  left,
  onOpen,
}: {
  place: Placed;
  left: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      data-ui
      className="isle-mark"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {place.countdown && left !== null && left >= 0 && (
        <em className="isle-badge" aria-hidden>
          {left === 0 ? "今日" : `あと${left}日`}
        </em>
      )}
      <span className="isle-text">
        <b>{place.label}</b>
        <i>{place.blurb}</i>
      </span>
      <span className="isle-go">
        みる
        <Icon name="right" size={12} />
      </span>
    </button>
  );
}

/**
 * 建設中の島（`docs/island-atlas.md` 5章）。
 *
 * **豚の貯金箱の集まりぐあいで、次の島の建設が進む。** 進捗バーではない。
 * 出発の日を過ぎたら、もう「これから建つ島」ではないので消す。
 */
function Buildsite({ world, opensAt }: { world: IsleWorld; opensAt: string }) {
  const fund = useFund();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    // 静的書き出しに焼かない。画面が出てから、出発したかどうかを見る
    setGone(Date.now() >= Date.parse(opensAt));
  }, [opensAt]);
  if (gone) return null;
  const pct = fund ? Math.min(100, (fund.total / FUND_GOAL_YEN) * 100) : 0;
  const stage = pct >= 100 ? "done" : pct >= 50 ? "walls" : pct >= 10 ? "frame" : "bare";
  return <Building x={world.cx} y={world.cy + world.r * 0.06} r={world.r} stage={stage} />;
}

/* ---- 画面から出た札は、縁に寄せて名前だけ残す ---------------------------
   島の建物は「島に来た人が最初に読むもの」なので、建物が画面の外にあっても
   名前は読めていなければならない。**建物の当たりは動かさない。**
   ずらすのは札だけで、杭は「そっちに建っている」を指す矢に変わる。
   ------------------------------------------------------------------------ */
function placePlates(
  places: Placed[],
  o: {
    b: { w: number; h: number };
    kk: number;
    sx: (v: number) => number;
    sy: (v: number) => number;
    marks: (HTMLDivElement | null)[];
    pins: (HTMLSpanElement | null)[];
    sizes: { w: number; h: number }[];
    edges: string[];
    taken: { x: number; y: number; w: number; h: number }[];
    open: string | null;
  },
) {
  const pad = 8;
  const padTop = 30;
  const padBottom = 52;
  const taken = o.taken.slice();
  const plates: {
    i: number;
    el: HTMLDivElement;
    fx: number;
    fy: number;
    rect: { x: number; y: number; w: number; h: number };
    out: boolean;
  }[] = [];

  for (let i = 0; i < places.length; i++) {
    const el = o.marks[i];
    if (!el) continue;
    const sp = places[i];
    const px = o.sx(sp.x);
    const py = o.sy(sp.y);
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    // 絵の大きさは倍率で変わるので測り直す。当たりは指で押せる最小(48px)まで広げるが、
    // 札の高さは絵の実寸を使う（最小に合わせると、引きで札が建物から浮く）
    const artW = spriteWidth(sp.icon, sp.size) * o.kk;
    const artH = sp.size * o.kk;
    el.style.setProperty("--hw", `${Math.max(TAP_MIN, artW).toFixed(1)}px`);
    el.style.setProperty("--hh", `${Math.max(TAP_MIN, artH).toFixed(1)}px`);
    const mh = Math.max(12, artH);
    el.style.setProperty("--mh", `${mh.toFixed(1)}px`);

    const sz = o.sizes[i];
    if (sz && sz.w) {
      const gy = sp.countdown ? 26 : 6;
      const rect = { x: px - sz.w / 2 - 6, y: py - mh - 12 - sz.h - gy, w: sz.w + 12, h: sz.h + gy + 6 };
      const out =
        rect.x < pad ||
        rect.x + rect.w > o.b.w - pad ||
        rect.y < padTop ||
        rect.y + rect.h > o.b.h - padBottom ||
        // 島の隅の道具の下に入った札も、寄せ直す。半分隠れた札は読めない
        o.taken.some(
          (q) =>
            rect.x < q.x + q.w && rect.x + rect.w > q.x && rect.y < q.y + q.h && rect.y + rect.h > q.y,
        );
      if (!out) taken.push(rect);
      plates.push({ i, el, fx: px, fy: py, rect, out });
    }
  }

  for (const pl of plates) {
    const pin = o.pins[pl.i];
    if (!pin) continue;
    const { rect } = pl;
    let dx = 0;
    let dy = 0;
    let dir = "";
    if (pl.out) {
      let left = rect.x;
      let top = rect.y;
      if (left < pad) dx = pad - left;
      else if (left + rect.w > o.b.w - pad) dx = o.b.w - pad - (left + rect.w);
      if (top < padTop) dy = padTop - top;
      else if (top + rect.h > o.b.h - padBottom) dy = o.b.h - padBottom - (top + rect.h);
      left += dx;
      top += dy;
      /* 先に置いたものと重なるなら、下へ逃がす（縦に並べば両方読める）。
         **下へしか動かさない。** 上へ戻すと、避けたはずのものへ帰っていく */
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const q of taken) {
          if (left < q.x + q.w && left + rect.w > q.x && top < q.y + q.h && top + rect.h > q.y) {
            const push = q.y + q.h + 6 - top;
            if (push > 0) {
              top += push;
              dy += push;
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
      taken.push({ x: left, y: top, w: rect.w, h: rect.h });
      /* 矢は、寄せた先から見て**建物が実際にどっちにあるか**を指す */
      const ax = pl.fx - (left + rect.w / 2);
      const ay = pl.fy - (top + rect.h / 2);
      dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "l" : "r") : ay < 0 ? "u" : "d";
    }
    if (dir !== o.edges[pl.i]) {
      o.edges[pl.i] = dir;
      if (dir) pl.el.setAttribute("data-edge", dir);
      else pl.el.removeAttribute("data-edge");
    }
    pin.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : "";
  }
}
