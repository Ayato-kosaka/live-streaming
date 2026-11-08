/**
 * 段の演出の動画（11月から。#1095）を、いつ読み、どの通知に渡すか。`index.tsx` が1回だけ呼ぶ。
 *
 * ## 3段に分ける（段の絵と同じ考え。`season/useSeason.ts` の頭）
 *
 * 1. **手元に持つ**: 貯金箱が出て 4 秒おいてから、その日に流す通りの動画を1本ずつ落として Blob で持つ（`fxHold.ts`）。
 *    順は `fxHoldOrder`（段の低い順に、登場と滞在を組で → 全段の締め）、量は `FX_HOLD_BUDGET`。
 *    持てなかった本（しくじり・手放した）は、5 分おきに取り直す
 * 2. **用意する**: 投げ銭が来たら、その段の動画の要素を作り、手元の URL を渡して登場が最後まで流せるところまで読む
 *    （`ensureFor`。index.tsx がアラートの頭で、段の絵と一緒に上限つきで待つ）。持っていなければ、その場で取り寄せる
 * 3. **渡す**: 用意できていれば、その通知の段取り（`planFor`）に要素ごと渡す。1回流したら捨てる。
 *    用意が間に合わなければ渡さない（その段は動画なしで出る。理由は `ensureFor` の答えにあり、index.tsx がログに残す）
 *
 * `still=1`（iPhone の日）・動画の段にしない日（季節の外・ハロウィン・旗 `?fx=off`・配信に出すと決めていないテーマ）は、
 * どれも何もしない。1バイトも落とさない
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { tierFor, type FxTier, type SeasonTheme } from "../../themes";
import { fxFlag } from "./lux";
import { dropFxHeldUnder, fxHoldDrops, fxHoldStats, fxHeldUrl, holdFxVideos } from "./fxHold";
import {
  fxHoldOrder,
  fxReadyTiers,
  fxUrl,
  fxVariantOf,
  layersFor,
  parseFxManifest,
  prepareFxKit,
  releaseFxKit,
  withFxVideo,
  type FxKit,
  type FxManifest,
  type VideoPlan,
} from "./fxVideo";

/** 投げ銭1件ぶんの用意の答え。index.tsx がログ（`fxPlan`）に載せる */
export type FxPrep = {
  ok: boolean;
  /** 段（manifest の名前）。動画の段にしない日は null */
  tier: string | null;
  /** 手元に全部あった（held）・その場で取り寄せた（fetched） */
  from: "held" | "fetched" | null;
  /**
   * 外した理由。`still`（iPhone の日）・`off`（動画の段にしない日）・`noTier`（その額の段に動画が無い）・
   * `manifest`（manifest が読めない・その段が無い）・`fetch` / `fetchTimeout`（取り寄せられない・間に合わない）・
   * `hold`（手元に置けない）・`load`（手元の動画が読めない）・`superseded`（用意のあいだに別の段の投げ銭が来た）
   */
  why: string | null;
  /** 用意にかかった ms */
  ms: number;
  /** 取り寄せた本数とバイト数（手元にあれば 0） */
  fetched: number;
  bytes: number;
};

export type FxHoldInfo = {
  files: number;
  bytes: number;
  /** 手元から流せる段 */
  ready: string[];
};

export type TierVideoState = {
  /** 段を動画の段に差し替えたテーマ。差し替えない日は、もらったテーマのまま */
  theme: SeasonTheme | null;
  /** その額の段の動画を用意する。答えの ok が true なら、planFor が段取りを返す */
  ensureFor: (yen: number) => Promise<FxPrep>;
  /** 用意できていれば、その段の段取り（要素ごと持っていく）。できていなければ null */
  planFor: (tier: FxTier) => VideoPlan | null;
  /** いま手元に持っているもの（ログ用） */
  held: () => FxHoldInfo;
};

/** 貯金箱が出てから、動画を落とし始めるまで（段の絵と同じ間） */
const WARM_AFTER_MS = 4000;
/** 持てなかった本を取り直す間隔 */
const REFILL_MS = 5 * 60 * 1000;
/** 1件ぶんの用意を諦めるまで（アラートはこれより前に、待つのをやめて動画なしで出ている）。取り寄せは諦めたあとも続けて持つ */
const KIT_TIMEOUT_MS = 15000;

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function useTierVideo(
  theme: SeasonTheme | null,
  opts: {
    /** `still=1`。動画を1回も出さない */
    still: boolean;
    /** 貯金箱を読み終えたか（温め始めるきっかけ） */
    bankReady: boolean;
    /** 手元に持ち終えた・しくじったときのログ（index.tsx の sendLog） */
    log?: (event: string, data: Record<string, unknown>) => void;
  }
): TierVideoState {
  const variant = fxVariantOf(theme, fxFlag());
  const fxTheme = useMemo(() => withFxVideo(theme, variant), [theme, variant]);
  const on = Platform.OS === "web" && !opts.still && !!fxTheme?.fxVariant && !!fxTheme.fxVideo;
  const cur = useRef({ fxTheme, on, still: opts.still });
  cur.current = { fxTheme, on, still: opts.still };
  const logRef = useRef(opts.log);
  logRef.current = opts.log;

  /* manifest.json は置き場ごとに1回読む。読めなかったら次の投げ銭でもう一度（置かれる前に開いた日のため） */
  const manifestRef = useRef<{ dir: string; p: Promise<FxManifest | null> } | null>(null);
  const manifest = useCallback((dir: string) => {
    const c = manifestRef.current;
    if (c && c.dir === dir) return c.p;
    const p = fetchJson(`${dir}/manifest.json`).then((j) => {
      const m = parseFxManifest(j);
      return Object.keys(m).length ? m : null;
    });
    manifestRef.current = { dir, p };
    p.then((m) => {
      if (!m && manifestRef.current?.p === p) manifestRef.current = null;
    });
    return p;
  }, []);
  const lastManifest = useRef<FxManifest | null>(null);

  /* 用意した1件ぶん（使われるまで1つだけ持つ。ほかの段を用意するときは手放す） */
  const slot = useRef<{ kit: FxKit; prep: FxPrep } | null>(null);
  const pending = useRef<{ key: string; p: Promise<FxPrep> } | null>(null);
  const wantKey = useRef<string | null>(null);
  /** 温めを今すぐ回し直す（手元の動画が読めなかったとき） */
  const kick = useRef<(() => void) | null>(null);

  const ensureFor = useCallback(
    async (yen: number): Promise<FxPrep> => {
      const t0 = nowMs();
      const { fxTheme: th, on, still } = cur.current;
      const no = (why: string, tier: string | null = null): FxPrep => ({ ok: false, tier, from: null, why, ms: Math.round(nowMs() - t0), fetched: 0, bytes: 0 });
      if (!on || !th?.fxVideo || !th.fxVariant) return no(still ? "still" : "off");
      const tv = tierFor(th, yen).video;
      if (!tv) return no("noTier");
      const dir = th.fxVideo.dir;
      const m = await manifest(dir);
      if (m) lastManifest.current = m;
      const entry = m?.[tv.tier];
      const layers = entry && layersFor(entry, th.fxVariant);
      if (!entry || !layers) return no("manifest", tv.tier);
      const key = `${tv.tier}-${th.fxVariant}`;
      wantKey.current = key;
      const s = slot.current;
      if (s && !s.kit.used && s.kit.key === key) return { ...s.prep, ms: Math.round(nowMs() - t0) };
      if (s && !s.kit.used) {
        releaseFxKit(s.kit);
        slot.current = null;
      }
      if (pending.current?.key === key) return pending.current.p;
      const p = prepareFxKit(dir, key, layers, entry, KIT_TIMEOUT_MS).then((r): FxPrep => {
        if (pending.current?.p === p) pending.current = null;
        const prep: FxPrep = { ok: !!r.kit, tier: tv.tier, from: r.from, why: r.why, ms: Math.round(nowMs() - t0), fetched: r.fetched, bytes: r.bytes };
        if (r.why === "load") kick.current?.();
        if (!r.kit) return prep;
        // 用意しているあいだに別の段の投げ銭が来ていたら、これは使われない
        if (wantKey.current !== key) {
          releaseFxKit(r.kit);
          return { ...prep, ok: false, why: "superseded" };
        }
        if (slot.current && !slot.current.kit.used && slot.current.kit !== r.kit) releaseFxKit(slot.current.kit);
        slot.current = { kit: r.kit, prep };
        return prep;
      });
      pending.current = { key, p };
      return p;
    },
    [manifest]
  );

  const planFor = useCallback((tier: FxTier): VideoPlan | null => {
    const { fxTheme: th, on } = cur.current;
    const tv = tier.video;
    if (!on || !tv || !th?.fxVariant) return null;
    const s = slot.current?.kit;
    if (!s || s.used || s.key !== `${tv.tier}-${th.fxVariant}`) return null;
    // この通知が持っていく（1回流したら捨てる。同じ要素を2件で使い回さない）
    slot.current = null;
    return {
      key: s.key,
      revealAt: s.entry.revealAt,
      headroom: tv.headroom,
      charBottom: s.entry.charBottom,
      ...(s.entry.plateTop != null ? { plateTop: s.entry.plateTop } : {}),
      text: tv.text,
      kit: s,
    };
  }, []);

  const held = useCallback((): FxHoldInfo => {
    const { fxTheme: th } = cur.current;
    const m = lastManifest.current;
    const st = fxHoldStats();
    return {
      ...st,
      ready: th?.fxVideo && th.fxVariant && m ? fxReadyTiers(th.fxVideo.dir, m, th.fxVariant) : [],
    };
  }, []);

  /* 1. 手元に持つ。貯金箱が出て 4 秒おいてから、1本ずつ。持てなかった本は 5 分おきに取り直す */
  useEffect(() => {
    const th = fxTheme;
    const fv = th?.fxVideo;
    const v = th?.fxVariant;
    if (!on || !fv || !v || !opts.bankReady) return;
    let alive = true;
    let wake: (() => void) | null = null;
    const nap = (ms: number) =>
      new Promise<void>((r) => {
        const t = setTimeout(() => {
          wake = null;
          r();
        }, ms);
        wake = () => {
          clearTimeout(t);
          wake = null;
          r();
        };
      });
    kick.current = () => wake?.();
    void (async () => {
      await nap(WARM_AFTER_MS);
      /* 上限に届いて止めたら、何かを手放すまで回し直さない（上限の外の1本を、5 分おきに落としては捨てることになる） */
      let fullAt: number | null = null;
      while (alive) {
        const m = await manifest(fv.dir);
        if (!alive) return;
        if (m) {
          lastManifest.current = m;
          const order = fxHoldOrder(th.tiers, m, v).map((f) => fxUrl(fv.dir, f));
          if (order.some((u) => !fxHeldUrl(u)) && fullAt !== fxHoldDrops()) {
            const t0 = nowMs();
            const r = await holdFxVideos(order, () => alive);
            fullAt = r.full ? fxHoldDrops() : null;
            if (alive && (r.got || r.failed))
              logRef.current?.("fxHeld", {
                got: r.got,
                bytes: r.bytes,
                failed: r.failed,
                full: r.full,
                ms: Math.round(nowMs() - t0),
                heldFiles: fxHoldStats().files,
                heldBytes: fxHoldStats().bytes,
                ready: fxReadyTiers(fv.dir, m, v),
                of: order.length,
              });
          }
        }
        await nap(REFILL_MS);
      }
    })();
    return () => {
      alive = false;
      kick.current = null;
      (wake as (() => void) | null)?.();
      // テーマが替わった・面を閉じた。持っていたものを手放す（手元を太らせない）
      dropFxHeldUnder(fv.dir);
    };
  }, [fxTheme, on, opts.bankReady, manifest]);

  // 面を閉じたら、使われなかった1件ぶんを手放す
  useEffect(
    () => () => {
      if (slot.current && !slot.current.kit.used) releaseFxKit(slot.current.kit);
      slot.current = null;
    },
    []
  );

  return useMemo(() => ({ theme: fxTheme, ensureFor, planFor, held }), [fxTheme, ensureFor, planFor, held]);
}
