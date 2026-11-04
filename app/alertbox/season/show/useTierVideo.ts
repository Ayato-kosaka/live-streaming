/**
 * 段の演出の動画（11月から。#1095）を、いつ読み、どの通知に渡すか。`index.tsx` が1回だけ呼ぶ。
 *
 * ## 3段に分ける（段の絵と同じ考え。`season/useSeason.ts` の頭）
 *
 * 1. **温める**: 貯金箱が出て 4 秒おいてから、その日に流す通りの動画を順に落とすだけ（HTTP の控えに乗せる）。
 *    順と量は `fxWarmOrder` / `FX_WARM_BUDGET`（段の低い順・登場と滞在だけ・12MB まで）
 * 2. **用意する**: 投げ銭が来たら、その段の動画の要素を作り、登場が最後まで流せるところまで読む（`ensureFor`。
 *    index.tsx がアラートの頭で、段の絵と一緒に上限つきで待つ）。控えにあれば数百 ms で済む
 * 3. **渡す**: 用意できていれば、その通知の段取り（`planFor`）に要素ごと渡す。1回流したら捨てる。
 *    用意が間に合わなければ渡さない（その段は動画なしで、字とキャラ絵だけ出る）
 *
 * `still=1`（iPhone の日）・動画の段にしない日（旗が無い・配信に出すと決めていない）は、どれも何もしない。
 * 1バイトも落とさない
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { tierFor, type FxTier, type SeasonTheme } from "../../themes";
import { fxFlag } from "./lux";
import {
  fxVariantOf,
  fxWarmOrder,
  layersFor,
  parseFxManifest,
  prepareFxKit,
  releaseFxKit,
  warmFxVideos,
  withFxVideo,
  type FxKit,
  type FxManifest,
  type VideoPlan,
} from "./fxVideo";

export type TierVideoState = {
  /** 段を動画の段に差し替えたテーマ。差し替えない日は、もらったテーマのまま */
  theme: SeasonTheme | null;
  /** その額の段の動画を用意する。用意できれば true */
  ensureFor: (yen: number) => Promise<boolean>;
  /** 用意できていれば、その段の段取り（要素ごと持っていく）。できていなければ null */
  planFor: (tier: FxTier) => VideoPlan | null;
};

/** 貯金箱が出てから、動画を落とし始めるまで（段の絵と同じ間） */
const WARM_AFTER_MS = 4000;
/** 1件ぶんの用意を諦めるまで（アラートはこれより前に、待つのをやめて動画なしで出ている） */
const KIT_TIMEOUT_MS = 15000;

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
  }
): TierVideoState {
  const variant = fxVariantOf(theme, fxFlag());
  const fxTheme = useMemo(() => withFxVideo(theme, variant), [theme, variant]);
  const on = Platform.OS === "web" && !opts.still && !!fxTheme?.fxVariant && !!fxTheme.fxVideo;
  const cur = useRef({ fxTheme, on });
  cur.current = { fxTheme, on };

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

  /* 用意した1件ぶん（使われるまで1つだけ持つ。ほかの段を用意するときは手放す） */
  const slot = useRef<FxKit | null>(null);
  const pending = useRef<{ key: string; p: Promise<boolean> } | null>(null);
  const wantKey = useRef<string | null>(null);

  const ensureFor = useCallback(
    async (yen: number): Promise<boolean> => {
      const { fxTheme: th, on } = cur.current;
      if (!on || !th?.fxVideo || !th.fxVariant) return false;
      const tv = tierFor(th, yen).video;
      if (!tv) return false;
      const dir = th.fxVideo.dir;
      const m = await manifest(dir);
      const entry = m?.[tv.tier];
      const layers = entry && layersFor(entry, th.fxVariant);
      if (!entry || !layers) return false;
      const key = `${tv.tier}-${th.fxVariant}`;
      wantKey.current = key;
      const s = slot.current;
      if (s && !s.used && s.key === key) return true;
      if (s && !s.used) {
        releaseFxKit(s);
        slot.current = null;
      }
      if (pending.current?.key === key) return pending.current.p;
      const p = prepareFxKit(dir, key, layers, entry, KIT_TIMEOUT_MS).then((kit) => {
        if (pending.current?.p === p) pending.current = null;
        if (!kit) return false;
        // 用意しているあいだに別の段の投げ銭が来ていたら、これは使われない
        if (wantKey.current !== key) {
          releaseFxKit(kit);
          return false;
        }
        if (slot.current && !slot.current.used && slot.current !== kit) releaseFxKit(slot.current);
        slot.current = kit;
        return true;
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
    const s = slot.current;
    if (!s || s.used || s.key !== `${tv.tier}-${th.fxVariant}`) return null;
    // この通知が持っていく（1回流したら捨てる。同じ要素を2件で使い回さない）
    slot.current = null;
    return { key: s.key, revealAt: s.entry.revealAt, headroom: tv.headroom, text: tv.text, kit: s };
  }, []);

  /* 1. 温める。貯金箱が出て 4 秒おいてから、1本ずつ */
  useEffect(() => {
    const th = fxTheme;
    const fv = th?.fxVideo;
    const v = th?.fxVariant;
    if (!on || !fv || !v || !opts.bankReady) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const m = await manifest(fv.dir);
      if (!alive || !m) return;
      await warmFxVideos(fv.dir, fxWarmOrder(th.tiers, m, v), () => alive);
    }, WARM_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fxTheme, on, opts.bankReady, manifest]);

  // 面を閉じたら、使われなかった1件ぶんを手放す
  useEffect(
    () => () => {
      if (slot.current && !slot.current.used) releaseFxKit(slot.current);
      slot.current = null;
    },
    []
  );

  return useMemo(() => ({ theme: fxTheme, ensureFor, planFor }), [fxTheme, ensureFor, planFor]);
}
