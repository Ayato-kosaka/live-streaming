"use client";

/**
 * キッチンカーの着せ替え（3D）の舞台。
 *
 * - 先に描くのは静止画（`stills/<組>-<day|open|dusk|peek>.webp`）と押しどころ（HTML・48px）だけ。3D の束は、
 *   舞台が画面の 600px 手前まで来たか、初めて押したときに、WebGL2 を確かめてから読む。無ければ静止画のまま
 *   （投げない・console.error を出さない）。通信を節約している人には、近づいただけでは読まない
 * - 文脈が失われたら静止画へ戻る。画面から離れたら場面を捨て、文脈も返す
 * - 字は全部 props で受ける（押しどころの字・組の名前・区画の名前）。押してから出る字も、書体に入るよう隠して置く
 * - 撮る口: `?van=<組>&state=<day|open|dusk|peek>&still=1`（`w`・`h`・`view` も）。その姿で止めて `window.__vanReady` を立てる。
 *   撮るための字は出さない
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_ORDER, moved } from "./van3d/layout";
import type { VanHandle, VanLook, VanState } from "./van3d/scene";
import "./van3d/stage.css";

export type VanStill = "day" | "open" | "dusk" | "peek";
export type VanStageLook = VanLook & {
  /** 組の名前（札の字） */
  name: string;
  /** 静止画（無い姿は出さない） */
  stills?: Partial<Record<VanStill, string>>;
};
export type VanStageLabels = {
  /** 組の札の並びの名前（読み上げ） */
  looks: string;
  open: string;
  close: string;
  dusk: string;
  day: string;
  peek: string;
  back: string;
  /** 並べ替えの一覧の名前（読み上げ） */
  order: string;
  /** ↑↓ の読み上げ（区画の名前のあとに続く） */
  up: string;
  down: string;
  /** 区画の名前（kitchen・fridge・tank・bed） */
  items: Record<string, string>;
  /** 静止画の説明 */
  alt: string;
};

type Mode = "still" | "loading" | "live" | "none";

function stillOf(look: VanStageLook | undefined, s: { open: boolean; dusk: boolean; peek: boolean }): string | undefined {
  const st = look?.stills ?? {};
  const want: VanStill = s.peek ? "peek" : s.dusk ? "dusk" : s.open ? "open" : "day";
  return st[want] ?? st.day;
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function VanStage({ looks, labels, first }: { looks: VanStageLook[]; labels: VanStageLabels; first?: string }) {
  const [look, setLook] = useState(first && looks.some((l) => l.id === first) ? first : looks[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [dusk, setDusk] = useState(false);
  const [peek, setPeek] = useState(false);
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [mode, setMode] = useState<Mode>("still");
  const [noGl, setNoGl] = useState(false);
  const [still, setStill] = useState<null | { w: number; h: number }>(null);
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const handle = useRef<VanHandle | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const busy = useRef(false);
  const lost = useRef(false);
  const state = useRef<VanState>({ look, open, dusk, peek, order });
  state.current = { look, open, dusk, peek, order };

  const teardown = useCallback(() => {
    const h = handle.current;
    handle.current = null;
    try {
      h?.dispose();
    } catch {
      /* 捨てるときの失敗は静止画に戻るだけ */
    }
    canvas.current?.remove();
    canvas.current = null;
    busy.current = false;
  }, []);

  const activate = useCallback(
    async (shoot?: { view: string }) => {
      if (handle.current || busy.current || lost.current || !holder.current) return;
      busy.current = true;
      const c = document.createElement("canvas");
      c.className = "kc-van-canvas";
      c.setAttribute("aria-hidden", "true");
      let gl: WebGL2RenderingContext | null = null;
      try {
        gl = c.getContext("webgl2", {
          antialias: true,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "low-power",
          preserveDrawingBuffer: !!shoot,
        });
      } catch {
        gl = null;
      }
      if (!gl) {
        busy.current = false;
        setNoGl(true);
        return;
      }
      holder.current.appendChild(c);
      canvas.current = c;
      setMode("loading");
      try {
        const { mountVan } = await import("./van3d/scene");
        if (canvas.current !== c) return;
        const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
        const h = mountVan(c, state.current, {
          gl,
          looks,
          still: !!shoot,
          view: shoot?.view,
          small: Math.min(window.innerWidth, window.innerHeight) < 700,
          reduced,
          onReady: () => {
            if (handle.current === h) setMode("live");
          },
          onLost: () => {
            lost.current = true;
            teardown();
            setMode("still");
          },
        });
        handle.current = h;
        busy.current = false;
        await h.ready;
        if (shoot && handle.current === h) {
          const { attachProbe } = await import("./van3d/probe");
          attachProbe(h);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              (window as unknown as { __vanReady?: boolean }).__vanReady = true;
            }),
          );
        }
      } catch {
        // 束が届かない・場面が作れない: 静止画のまま
        teardown();
        setMode("still");
      }
    },
    [looks, teardown],
  );

  // 撮る口
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("still") !== "1" || !q.get("van")) return;
    const s = q.get("state") ?? "day";
    const id = q.get("van")!;
    if (looks.some((l) => l.id === id)) setLook(id);
    setOpen(s === "open" || s === "dusk");
    setDusk(s === "dusk");
    setPeek(s === "peek");
    setStill({ w: Number(q.get("w")) || 800, h: Number(q.get("h")) || 600 });
    state.current = { look: looks.some((l) => l.id === id) ? id : state.current.look, open: s === "open" || s === "dusk", dusk: s === "dusk", peek: s === "peek", order: DEFAULT_ORDER };
    requestAnimationFrame(() => void activate({ view: q.get("view") ?? s }));
  }, [looks, activate]);

  // 近づいたら読む・離れたら捨てる
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const save = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (new URLSearchParams(window.location.search).get("still") === "1") return;
          if (e.isIntersecting) {
            if (!save) void activate();
          } else if (handle.current) {
            teardown();
            setMode("still");
          }
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activate, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  // 状態を場面へ（毎コマではなく、押したときだけ）
  useEffect(() => {
    handle.current?.update({ look, open, dusk, peek, order });
  }, [look, open, dusk, peek, order]);

  const press = (f: () => void) => () => {
    f();
    if (!handle.current) void activate();
  };

  const cur = looks.find((l) => l.id === look);
  const img = stillOf(cur, { open, dusk, peek });
  const anyStill = looks.some((l) => l.stills && Object.keys(l.stills).length);
  if (noGl && !anyStill) return null;

  const live = mode === "live";
  return (
    <div
      className={`kc-van${still ? " is-shot" : ""}`}
      data-mode={mode}
      style={still ? { width: still.w, height: still.h } : undefined}
    >
      <div className="kc-van-box" ref={box}>
        {img ? <img className="kc-van-img" src={img} alt={labels.alt} width={800} height={600} loading="lazy" decoding="async" /> : null}
        <div className="kc-van-holder" ref={holder} />
      </div>
      {still ? null : (
        <>
          <div className="kc-van-looks" role="group" aria-label={labels.looks}>
            {looks.map((l) => (
              <button key={l.id} type="button" className="kc-van-chip" aria-pressed={l.id === look} onClick={press(() => setLook(l.id))}>
                <span
                  className="kc-van-sw"
                  aria-hidden="true"
                  style={{ background: `linear-gradient(135deg, ${l.colors?.body ?? "#fff"} 0 48%, ${l.colors?.accent ?? "#ccc"} 48% 100%)` }}
                />
                {l.name}
              </button>
            ))}
          </div>
          <div className="kc-van-tools">
            <button type="button" className="kc-van-btn" aria-pressed={open} onClick={press(() => setOpen(!open))}>
              {open ? labels.close : labels.open}
            </button>
            <button type="button" className="kc-van-btn" aria-pressed={dusk} onClick={press(() => setDusk(!dusk))}>
              {dusk ? labels.day : labels.dusk}
            </button>
            <button type="button" className="kc-van-btn" aria-pressed={peek} onClick={press(() => setPeek(!peek))}>
              {peek ? labels.back : labels.peek}
            </button>
          </div>
          {live && peek ? (
            <ol className="kc-van-order" aria-label={labels.order}>
              {order.map((id, i) => {
                const name = labels.items[id] ?? id;
                const up = moved(order, i, -1);
                const down = moved(order, i, 1);
                return (
                  <li key={id}>
                    <span className="kc-van-item">{name}</span>
                    <button type="button" className="kc-van-move" disabled={!up} aria-label={`${name} ${labels.up}`} onClick={() => up && setOrder(up)}>
                      <Chevron up />
                    </button>
                    <button type="button" className="kc-van-move" disabled={!down} aria-label={`${name} ${labels.down}`} onClick={() => down && setOrder(down)}>
                      <Chevron up={false} />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {/* 押してから出る字（書体に入れるため。見えない） */}
          <span hidden>
            {labels.close}
            {labels.day}
            {labels.back}
            {Object.values(labels.items).join("")}
          </span>
        </>
      )}
    </div>
  );
}
