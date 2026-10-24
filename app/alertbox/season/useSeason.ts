/**
 * 今日の季節テーマと、その絵を読んだ結果。`index.tsx` が1回だけ呼んで、
 * 貯金箱とアラートの両方に渡す。
 *
 * ## テーマは画面が出てから、日付で決める
 *
 * 書き出しは日付を焼くので、最初の描画は「テーマなし」で始めて、出たあとに決める。
 * OBS は開きっぱなしなので **1分ごとに見直す**（10/31 から 11/1 に変わった晩に、
 * あやとが開き直さなくても豚に戻る）。見直すのは時刻の比べっこだけで、
 * テーマが変わらなければ描き直さない。
 *
 * ## 絵は、貯金箱だけ先に読む。段の絵は落としておき、使う段のぶんだけ展開する
 *
 * スマホの WebView は記憶が小さい。段の絵（主役のポーズ絵・切り絵・小物）を全部展開して
 * 持っておくと、それだけで数十 MB を食う。なので3段に分ける（2026-10-24 の決め）:
 *
 * 1. 開いたら**貯金箱の切り絵だけ**読んで展開する（`decode()` まで）。読めなければ前の
 *    コマ送りの貯金箱を読み、それも読めなければ豚
 * 2. 貯金箱が出て数秒おいてから、ほかの段の絵を順に**落とすだけ**（HTTP の控えに乗せる。
 *    展開はしない）。rig.json / poses.json / items.json はここで読んでおく
 * 3. 投げ銭が来たら、**その段のぶんだけ**展開する（`ensureFor`。index.tsx がアラートの頭で待つ）。
 *    待つ上限を過ぎても展開が終わらなければ、その段は台本に乗らない（欠けた絵を出さない）
 *
 * **読めなかった絵は出さない**（壊れた絵の印を配信に出さない）。切り絵の部品が1枚でも読めなければ、
 * その組は無かったことにする（片腕の無い主役を配信に出さない）。使う側は、組が無ければ
 * 前の作り（小物の演出）に落ちる。読めなかった貯金箱は 10分おきに黙って読み直す。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  THEMES,
  bankFrameUrl,
  fxUrl,
  itemsDir,
  manifestUrl,
  readManifest,
  posesDir,
  rigDir,
  themeAt,
  themeFromParam,
  themeItems,
  themePoses,
  themeRigs,
  tierFor,
  type Rect,
  type SeasonTheme,
  type ThemeManifest,
} from "../themes";
import { parseRig, rigFiles, type RigDef } from "./rig/rig";
import type { LoadedRig } from "./rig/RigView";
import { parsePoses, type LoadedPoses, type PoseDef } from "./show/poses";
import { parseItems, type ItemDef, type LoadedItems } from "./show/items";

/** 読めた絵。大きさは実物から取る */
export type LoadedImage = { url: string; width: number; height: number };

export type SeasonBank = {
  base: LoadedImage[];
  fill: LoadedImage[];
  /** 絵の中で中身が描かれている四角（絵の px） */
  bbox: Rect;
};

export type Season = {
  theme: SeasonTheme | null;
  /**
   * 貯金箱のコマ。
   * - `"loading"` … 読んでいる途中（豚を一瞬出してから差し替える、をしないために何も出さない）
   * - `null` … 読めなかった。豚で出す
   */
  bank: SeasonBank | "loading" | null;
  /** 読めた小物（ファイル名 → 絵） */
  fx: ReadonlyMap<string, LoadedImage>;
  /** 読めた切り絵の組（名前 → 組）。読めなかった組は入っていない */
  rigs: ReadonlyMap<string, LoadedRig>;
  /** 読めたポーズ絵の組（仮装の名前 → 組）。読めなかった組は入っていない */
  poses: ReadonlyMap<string, LoadedPoses>;
  /** 読めた小物の組（仮装の名前 → 組）。読めなかった組は入っていない */
  items: ReadonlyMap<string, LoadedItems>;
  /** 貯金箱の切り絵を一度は読みに行き終えたか（読めたかどうかは問わない） */
  rigsSettled: boolean;
  /**
   * その額の段で使う絵を展開する（台本の切り絵・ポーズ絵。台本が無いか読めなければ小物）。
   * 全部そろえば true。index.tsx がアラートを出す前に、上限つきで待つ
   */
  ensureFor: (yen: number) => Promise<boolean>;
};

/** テーマを見直す間隔。分の単位で切り替われば足りる */
const THEME_CHECK_MS = 60 * 1000;
/** 読めなかった絵を読み直す間隔 */
const RETRY_MS = 10 * 60 * 1000;
/** 1枚を待つ上限。過ぎたら「読めなかった」に倒す（貯金箱が出ないまま、にしない） */
const IMAGE_TIMEOUT_MS = 15 * 1000;

const isWeb = Platform.OS === "web";

/* 読んだ絵はページに1つずつ持つ。テーマを見直しても、同じ絵を二度落とさない。
   読めなかったものは控えない（次の読み直しでもう一度試す）。 */
const loaded = new Map<string, Promise<LoadedImage | null>>();
/** 読み終わった絵の要素（解読済み）。絵の中身の外形を測るときに使う */
const elements = new Map<string, HTMLImageElement>();

/** 読み終わった絵の要素。まだ読めていなければ null */
export const loadedElement = (url: string): HTMLImageElement | null => elements.get(url) ?? null;

export function loadImage(url: string): Promise<LoadedImage | null> {
  if (!isWeb || typeof window === "undefined" || typeof window.Image !== "function") {
    return Promise.resolve(null);
  }
  const hit = loaded.get(url);
  if (hit) return hit;
  const p = new Promise<LoadedImage | null>((resolve) => {
    const img = new window.Image();
    let done = false;
    const finish = (v: LoadedImage | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (!v) loaded.delete(url);
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), IMAGE_TIMEOUT_MS);
    img.onload = () => {
      const ok = () => {
        if (img.naturalWidth > 0) {
          elements.set(url, img);
          finish({ url, width: img.naturalWidth, height: img.naturalHeight });
        } else finish(null);
      };
      /* 解読まで済ませておく。済ませないと、初めて出す瞬間に解読が走って
         コマ送りの1周目が引っかかる */
      if (typeof img.decode === "function") img.decode().then(ok, ok);
      else ok();
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
  loaded.set(url, p);
  return p;
}

async function loadManifest(th: SeasonTheme): Promise<ThemeManifest> {
  try {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), IMAGE_TIMEOUT_MS);
    const res = await fetch(manifestUrl(th), { signal: ctl?.signal });
    clearTimeout(timer);
    if (!res.ok) return {};
    return readManifest(await res.json());
  } catch {
    // 無くても描ける（中身の四角は絵の全体とみなす）
    return {};
  }
}

/** 中身の四角。manifest に無ければ絵の全体。絵からはみ出す値は絵の中に収める */
function bankBox(
  th: SeasonTheme,
  manifest: ThemeManifest,
  first: LoadedImage
): Rect {
  const name = `bank-base-0.png`;
  const m = manifest[name] ?? manifest["bank-fill-0.png"];
  const all = manifest.bank?.bbox;
  const W = first.width || th.bank.fallbackSize.width;
  const H = first.height || th.bank.fallbackSize.height;
  const b = all ?? m?.bbox;
  if (!b) return { x: 0, y: 0, width: W, height: H };
  /* manifest が別の大きさの絵で測ってあったら、いまの絵の大きさに合わせて伸ばす */
  const sx = m?.width ? W / m.width : 1;
  const sy = m?.height ? H / m.height : 1;
  const x = Math.max(0, Math.min(W - 1, b.x * sx));
  const y = Math.max(0, Math.min(H - 1, b.y * sy));
  return {
    x,
    y,
    width: Math.max(1, Math.min(W - x, b.width * sx)),
    height: Math.max(1, Math.min(H - y, b.height * sy)),
  };
}

type RigInfo = { def: RigDef; base: string };
type PoseInfo = { base: string; faceW: number; poses: Record<string, PoseDef> };
type ItemsInfo = { base: string; items: Record<string, ItemDef> };

async function fetchJson(url: string): Promise<unknown> {
  try {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), IMAGE_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctl?.signal });
    clearTimeout(timer);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** 切り絵の組の約束（rig.json）だけを読む。絵はまだ読まない */
async function fetchRigDef(th: SeasonTheme, name: string): Promise<RigInfo | null> {
  const base = rigDir(th, name);
  const def = parseRig(await fetchJson(`${base}/rig.json`));
  return def ? { def, base } : null;
}

/** 切り絵の組の絵を読んで展開する。部品が1枚でも読めなければ null */
async function decodeRig(info: RigInfo): Promise<LoadedRig | null> {
  const files = rigFiles(info.def);
  const imgs = await Promise.all(files.map((f) => loadImage(`${info.base}/${f}`)));
  if (!imgs.every((v) => v)) return null;
  return { def: info.def, base: info.base, images: new Map(files.map((f, i) => [f, imgs[i]!])) };
}

/** ポーズ絵の組の約束（poses.json）だけを読む */
async function fetchPoseDef(th: SeasonTheme, name: string): Promise<PoseInfo | null> {
  const base = posesDir(th, name);
  const def = parsePoses(await fetchJson(`${base}/poses.json`));
  return def ? { base, faceW: def.faceW, poses: def.poses } : null;
}

/** ポーズ絵を読んで展開する。1枚でも読めなければ null */
async function decodePoses(info: PoseInfo): Promise<LoadedPoses | null> {
  const names = Object.keys(info.poses);
  const imgs = await Promise.all(names.map((n) => loadImage(`${info.base}/${info.poses[n].file}`)));
  if (!imgs.every((v) => v)) return null;
  return { base: info.base, faceW: info.faceW, poses: new Map(names.map((n, i) => [n, { ...info.poses[n], img: imgs[i]! }])) };
}

/** 小物の組の約束（items.json）だけを読む */
async function fetchItemsDef(th: SeasonTheme, name: string): Promise<ItemsInfo | null> {
  const base = itemsDir(th, name);
  const items = parseItems(await fetchJson(`${base}/items.json`));
  return items ? { base, items } : null;
}

/** 小物の組を読んで展開する。1枚でも読めなければ null（欠けた古城・じゅうたんを出さない） */
async function decodeItems(info: ItemsInfo): Promise<LoadedItems | null> {
  const names = Object.keys(info.items);
  const imgs = await Promise.all(names.map((n) => loadImage(`${info.base}/${info.items[n].file}`)));
  if (!imgs.every((v) => v)) return null;
  return { base: info.base, items: new Map(names.map((n, i) => [n, { ...info.items[n], img: imgs[i]! }])) };
}

/** 落とすだけ（HTTP の控えに乗せる。展開しない）。しくじっても何もしない */
async function prefetch(url: string): Promise<void> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    await res.arrayBuffer();
  } catch {
    // 使うときにもう一度読みに行く
  }
}

/** 貯金箱が出てから、段の絵を落とし始めるまでの間 */
const PREFETCH_AFTER_MS = 4000;

export function useSeason(param: string | string[] | undefined): Season {
  const forced = themeFromParam(param);
  // `undefined`（日付で決める）と `null`（豚に固定）を分けて持つ
  const forcedKey = forced === undefined ? "" : forced === null ? "none" : forced.id;

  const [theme, setTheme] = useState<SeasonTheme | null>(null);

  useEffect(() => {
    if (forced !== undefined) {
      setTheme(forced);
      return;
    }
    /* 配信に出してよいテーマが1つも無ければ、日付の見直しも回さない。
       豚の日（いまはこれ）に、季節の仕組みが何も動かず何も持たないように */
    if (!THEMES.some((t) => t.live !== false)) {
      setTheme(null);
      return;
    }
    const check = () =>
      setTheme((prev) => {
        const next = themeAt(new Date(), THEMES);
        return next?.id === prev?.id ? prev : next;
      });
    check();
    const timer = setInterval(check, THEME_CHECK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedKey]);

  const [bank, setBank] = useState<Season["bank"]>(null);
  const [rigsSettled, setRigsSettled] = useState(false);
  /* 読めた絵の組は ref に持つ（アラートの頭で `ensureFor` が足したものを、描き直しを待たずに
     index.tsx が使う）。描き直しのきっかけは `version` */
  const rigsRef = useRef(new Map<string, LoadedRig>());
  const posesRef = useRef(new Map<string, LoadedPoses>());
  const itemsRef = useRef(new Map<string, LoadedItems>());
  const fxRef = useRef(new Map<string, LoadedImage>());
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  /** いまのテーマで読んだ約束（rig.json / poses.json）。テーマが変われば作り直す */
  const ctlRef = useRef<{
    theme: SeasonTheme;
    rigDefs: Map<string, Promise<RigInfo | null>>;
    poseDefs: Map<string, Promise<PoseInfo | null>>;
    itemDefs: Map<string, Promise<ItemsInfo | null>>;
    decoding: Map<string, Promise<boolean>>;
  } | null>(null);

  const rigDef = (name: string) => {
    const c = ctlRef.current!;
    let p = c.rigDefs.get(name);
    if (!p) c.rigDefs.set(name, (p = fetchRigDef(c.theme, name)));
    return p;
  };
  const poseDef = (name: string) => {
    const c = ctlRef.current!;
    let p = c.poseDefs.get(name);
    if (!p) c.poseDefs.set(name, (p = fetchPoseDef(c.theme, name)));
    return p;
  };
  const itemDef = (name: string) => {
    const c = ctlRef.current!;
    let p = c.itemDefs.get(name);
    if (!p) c.itemDefs.set(name, (p = fetchItemsDef(c.theme, name)));
    return p;
  };
  /** 1つの組（切り絵・ポーズ絵・小物の組・小物1枚）を展開する。同じものは一度だけ */
  const decodeOne = (kind: "rig" | "pose" | "item" | "fx", name: string): Promise<boolean> => {
    const c = ctlRef.current;
    if (!c) return Promise.resolve(false);
    const key = `${kind}:${name}`;
    if (kind === "rig" && rigsRef.current.has(name)) return Promise.resolve(true);
    if (kind === "pose" && posesRef.current.has(name)) return Promise.resolve(true);
    if (kind === "item" && itemsRef.current.has(name)) return Promise.resolve(true);
    if (kind === "fx" && fxRef.current.has(name)) return Promise.resolve(true);
    let p = c.decoding.get(key);
    if (p) return p;
    p = (async () => {
      if (kind === "rig") {
        const info = await rigDef(name);
        const r = info && (await decodeRig(info));
        if (r && ctlRef.current === c) rigsRef.current.set(name, r);
        return !!r;
      }
      if (kind === "pose") {
        const info = await poseDef(name);
        const r = info && (await decodePoses(info));
        if (r && ctlRef.current === c) posesRef.current.set(name, r);
        return !!r;
      }
      if (kind === "item") {
        const info = await itemDef(name);
        const r = info && (await decodeItems(info));
        if (r && ctlRef.current === c) itemsRef.current.set(name, r);
        return !!r;
      }
      const img = await loadImage(fxUrl(c.theme, name));
      if (img && ctlRef.current === c) fxRef.current.set(name, img);
      return !!img;
    })();
    // しくじったものは控えない（次の投げ銭でもう一度試す）
    c.decoding.set(key, p);
    p.then((ok) => {
      if (!ok) c.decoding.delete(key);
    });
    return p;
  };

  useEffect(() => {
    rigsRef.current = new Map();
    posesRef.current = new Map();
    itemsRef.current = new Map();
    fxRef.current = new Map();
    setRigsSettled(false);
    bump();
    if (!theme || !isWeb) {
      ctlRef.current = null;
      setBank(null);
      return;
    }
    const ctl = { theme, rigDefs: new Map(), poseDefs: new Map(), itemDefs: new Map(), decoding: new Map() };
    ctlRef.current = ctl;
    let alive = true;
    setBank("loading");
    const timers: ReturnType<typeof setTimeout>[] = [];

    /* 1. 貯金箱だけ読んで展開する。切り絵が読めなければ前のコマ送り（それも読めなければ豚） */
    const loadBank = async (): Promise<boolean> => {
      const rb = theme.rigBank;
      const names = rb ? [rb.mascot, rb.bucket, ...(rb.visitor ? [rb.visitor] : [])] : [];
      const oks = await Promise.all(names.map((n) => decodeOne("rig", n)));
      if (!alive) return false;
      const rigOk = !!rb && oks[0] && oks[1];
      if (rigOk) {
        setBank(null);
      } else {
        const manifest = await loadManifest(theme);
        const frames = (layer: "base" | "fill") =>
          Promise.all(Array.from({ length: theme.bank.frames }, (_, i) => loadImage(bankFrameUrl(theme, layer, i))));
        const [base, fill] = await Promise.all([frames("base"), frames("fill")]);
        if (!alive) return false;
        const ok = [...base, ...fill].every((v) => v);
        setBank(ok ? { base: base as LoadedImage[], fill: fill as LoadedImage[], bbox: bankBox(theme, manifest, base[0]!) } : null);
      }
      setRigsSettled(true);
      bump();
      return rigOk;
    };

    /* 2. 段の絵を落とすだけ（展開しない）。約束の json はここで読んでおく。1枚ずつ順に */
    const prefetchAll = async () => {
      const urls: string[] = [];
      for (const n of themeRigs(theme)) {
        const info = await rigDef(n);
        if (info) for (const f of rigFiles(info.def)) urls.push(`${info.base}/${f}`);
      }
      for (const n of themePoses(theme)) {
        const info = await poseDef(n);
        if (info) for (const p of Object.values(info.poses)) urls.push(`${info.base}/${p.file}`);
      }
      for (const n of themeItems(theme)) {
        const info = await itemDef(n);
        if (info) for (const p of Object.values(info.items)) urls.push(`${info.base}/${p.file}`);
      }
      const fxFiles = new Set<string>(theme.fx.map((f) => f.file));
      theme.finale?.files.forEach((f) => fxFiles.add(f));
      for (const f of fxFiles) urls.push(fxUrl(theme, f));
      for (const u of urls) {
        if (!alive) return;
        await prefetch(u);
      }
    };

    const run = () =>
      loadBank().then((ok) => {
        if (!alive) return;
        timers.push(setTimeout(prefetchAll, PREFETCH_AFTER_MS));
        if (!ok && theme.rigBank) timers.push(setTimeout(run, RETRY_MS));
      });
    run();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  /* 3. 投げ銭が来たら、その段のぶんだけ展開する。台本の絵がそろえば台本、そろわなければ小物 */
  const ensureFor = useCallback(async (yen: number): Promise<boolean> => {
    const c = ctlRef.current;
    if (!c) return false;
    const tier = tierFor(c.theme, yen);
    const show = tier.show;
    if (show) {
      const oks = await Promise.all([
        ...show.rigs.map((n) => decodeOne("rig", n)),
        ...(show.poses ?? []).map((n) => decodeOne("pose", n)),
        ...(show.items ?? []).map((n) => decodeOne("item", n)),
      ]);
      if (oks.every(Boolean)) {
        bump();
        return true;
      }
    }
    const files = new Set(tier.files);
    c.theme.finale?.files.forEach((f) => files.add(f));
    const oks = await Promise.all([...files].map((f) => decodeOne("fx", f)));
    bump();
    return oks.every(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      theme,
      bank,
      fx: fxRef.current,
      rigs: rigsRef.current,
      poses: posesRef.current,
      items: itemsRef.current,
      rigsSettled,
      ensureFor,
    }),
    // version: ref の中身が増えたら描き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, bank, rigsSettled, ensureFor, version]
  );
}
