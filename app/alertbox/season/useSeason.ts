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
 * ## 絵は先に読んでおく
 *
 * 最初のアラートで絵が欠けないように、テーマが決まった時点で全部読む。
 * **読めなかった絵は出さない**（壊れた絵の印を配信に出さない）。
 * 貯金箱のコマが1枚でも読めなければ、いつもの豚で出す。
 * 読めなかったものは 10分おきに黙って読み直す（あとから絵が置かれた日にも、
 * 開き直さずに出るように）。
 */
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  THEMES,
  bankFrameUrl,
  fxUrl,
  manifestUrl,
  readManifest,
  themeAt,
  themeFromParam,
  type Rect,
  type SeasonTheme,
  type ThemeManifest,
} from "../themes";

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
      const ok = () =>
        img.naturalWidth > 0
          ? finish({ url, width: img.naturalWidth, height: img.naturalHeight })
          : finish(null);
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

const EMPTY: ReadonlyMap<string, LoadedImage> = new Map();

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
  const [fx, setFx] = useState<ReadonlyMap<string, LoadedImage>>(EMPTY);

  useEffect(() => {
    if (!theme || !isWeb) {
      setBank(null);
      setFx(EMPTY);
      return;
    }
    let alive = true;
    setBank("loading");
    setFx(EMPTY);

    const files = new Set<string>(theme.fx.map((f) => f.file));
    theme.finale?.files.forEach((f) => files.add(f));

    const loadAll = async () => {
      const manifest = await loadManifest(theme);
      const frames = (layer: "base" | "fill") =>
        Promise.all(
          Array.from({ length: theme.bank.frames }, (_, i) =>
            loadImage(bankFrameUrl(theme, layer, i))
          )
        );
      const [base, fill, fxList] = await Promise.all([
        frames("base"),
        frames("fill"),
        Promise.all(
          [...files].map(async (f) => [f, await loadImage(fxUrl(theme, f))] as const)
        ),
      ]);
      if (!alive) return false;

      const bankOk = [...base, ...fill].every((v) => v);
      setBank((prev) => {
        if (bankOk) {
          // 読めているなら差し替えない（10分ごとの読み直しで描き直さない）
          if (prev && prev !== "loading") return prev;
          return {
            base: base as LoadedImage[],
            fill: fill as LoadedImage[],
            bbox: bankBox(theme, manifest, base[0]!),
          };
        }
        return prev && prev !== "loading" ? prev : null;
      });
      setFx((prev) => {
        const next = new Map(prev);
        for (const [f, img] of fxList) if (img) next.set(f, img);
        return next.size === prev.size ? prev : next;
      });
      return bankOk && fxList.every(([, img]) => img);
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () =>
      loadAll().then((all) => {
        if (alive && !all) timer = setTimeout(run, RETRY_MS);
      });
    run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [theme]);

  return useMemo(() => ({ theme, bank, fx }), [theme, bank, fx]);
}
