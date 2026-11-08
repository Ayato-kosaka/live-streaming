/**
 * 段の演出を、透明つきの動画で流す（11月から。#1095）。**決めること・読むこと・流す順番**を持つ。
 * 描くのは `VideoShow.tsx`、いつ読むかは `useTierVideo.ts`。
 *
 * ## 1段の動画（約束。3人で共通）
 *
 * 登場（intro。1回）→ 滞在（stay。くり返す）→ 締め（outro。1回）の3本を、層ごとに持つ。
 * 層は back（キャラ絵の後ろ）と front（キャラ絵の前。光と粒だけ。無くてもよい）。
 * 名前は `t{段}-{full|light}-{back|front}-{intro|stay|outro}.webm`、秒は `manifest.json`。
 *
 * ## 流す順番
 *
 * - アラートが出た瞬間に登場を流す。キャラ絵と字は `revealAt` 秒に出す（index.tsx の時計。登場と同じ瞬間に始まる）
 * - 登場が終わったら滞在をくり返す（`loop`。頭と尻がつながるように作ってある）
 * - 締めは**滞在の輪の切れ目から**始める。輪の途中で切ると、粒が一瞬で飛ぶ。締めが終わりの手前に収まる
 *   最後の切れ目を選ぶので、締めは「終わりの outroDur 秒前」から最大で滞在1周ぶん早く始まる
 * - アラートの長さは動画で変えない（ハロウィン2版目と同じ 30・45・60 秒。あやと「合計演出時間は少なくしたくない」）
 *
 * ## #438 の教え（動画の人のキャラ動画と同じ守り）
 *
 * - poster は透明（届く前の `<video>` は Android の WebView が灰色の地と ▶ を描く。#1133。守りは `../../videoGuard.ts`）。
 *   見せるのは「見せてよい」の合図のどれか早いもの（`onShowable`。1つの合図に頼らない。#1137）
 * - 動いているか・キャラ絵と札を出す秒は、動画の時計（currentTime）の進みで決める。コマの合図には頼らない（#1137）
 * - 3秒動かなければ、その層は出さない。全部の層が動かなければ、いまの段の見せ方（字とキャラ絵）に落ちる
 * - `still=1`（iPhone の日）は動画を1回も出さず、1バイトも落とさない（呼ぶ側が止める）
 *
 * ## 動画は手元（Blob）から流す（2026-11-08 の配信から）
 *
 * `<video>` に渡すのは、いつも手元の URL（`fxHold.ts`）。元の URL を `<video>` に読ませない（HTTP の控えに頼らない。
 * 11/8 は控えが使えず、7段とも黙って動画なしで出た）。持っていない段は、投げ銭が来たらその場で取り寄せる
 */
import type { FxTier, FxVideoVariant, SeasonTheme } from "../../themes";
import { newVideo, onShowable } from "../../videoGuard";
import { dropFxHeld, fxHeldUrl, needFxVideos, revokeFxUrl } from "./fxHold";

export type FxPart = "intro" | "stay" | "outro";
export const FX_PARTS: readonly FxPart[] = ["intro", "stay", "outro"];
export type FxLayerName = "back" | "front";
export const FX_LAYERS: readonly FxLayerName[] = ["back", "front"];

/** 1層の3本（ファイル名。置き場は `fxVideo.dir`） */
export type FxParts = Record<FxPart, string>;
export type FxLayers = Record<FxLayerName, FxParts | null>;

/** `manifest.json` の1段 */
export type FxTierEntry = {
  variants: Partial<Record<FxVideoVariant, FxLayers>>;
  /** 登場の動画の何秒目に、投げた人のキャラ絵と字を出すか */
  revealAt: number;
  introDur: number;
  stayDur: number;
  outroDur: number;
  /**
   * 投げた人のキャラ絵の箱の下の端（面の高さに対する割合）。書いていない段は null で、いつもの 0.98
   * （`stage.ts` の `PLAIN_CHAR_BOTTOM`）。〜999円の3段は、下の隅の猫の家族がキャラ絵の後ろに隠れないように上げる
   */
  charBottom: number | null;
  /**
   * 運ばれてくる札（段7）が落ちてくる道の、いちばん上（動画の枠の高さに対する割合）。札の字の上の端は、
   * 降りてくるあいだずっとこれより下を通る。主役（あやと）の顔の箱の下の端＋2%（#1141）。書いていない段は無し（いつもの 40vh から落ちる）
   */
  plateTop?: number;
};
export type FxManifest = Record<string, FxTierEntry>;

/**
 * `charBottom` として受ける幅。下の半分より上に箱の底を上げると、キャラ絵が小さくなりすぎる（上の帯は 0.2 まで
 * 空いている）ので受けない。範囲の外は書いていないのと同じ（いつもの並べ方）
 */
export const CHAR_BOTTOM_MIN = 0.5;
export const CHAR_BOTTOM_MAX = 1;

/** 動画が動き出すのを待つ上限（#438 と同じ 3 秒。アラートは 30 秒以上あるので、3 秒待っても残りは出る） */
export const FX_START_TIMEOUT_MS = 3000;

/* ---------------------------------------------------------------- 旗と、差し替えたテーマ */

/**
 * どちらの通りで流すか。**旗（`?fx=full` / `?fx=light`）が先。** 旗が無ければ、テーマが配信に出すと決めた通り
 * （11月の城は full。出すと決めていないテーマは null＝動画の段にしない）。`?fx=off` は配信に出すと決めたあとでも
 * 止める（見比べの物差し）
 */
export function fxVariantOf(th: SeasonTheme | null, flag: string | null): FxVideoVariant | null {
  const fv = th?.fxVideo;
  if (!fv) return null;
  if (flag === "full" || flag === "light") return flag;
  if (flag === "off") return null;
  return fv.live ? fv.variant : null;
}

/* 差し替えたテーマはテーマごとに1つ（描き直しのたびに別物にしない。useSeason は id で比べている） */
const swapped = new Map<string, SeasonTheme>();

/**
 * 段を動画の段（`fxVideo.tiers`）に差し替えたテーマ。通りが無ければそのまま返す。
 * **貯金箱は触らない**（差し替えるのは `tiers` だけ。貯金箱の絵・字・大きさは同じテーマのもの）
 */
export function withFxVideo(th: SeasonTheme | null, variant: FxVideoVariant | null): SeasonTheme | null {
  if (!th || !variant || !th.fxVideo) return th;
  const key = `${th.id}:${variant}`;
  let t = swapped.get(key);
  if (!t || t.fxVideo !== th.fxVideo) {
    t = { ...th, tiers: th.fxVideo.tiers, fxVariant: variant };
    swapped.set(key, t);
  }
  return t;
}

/* ---------------------------------------------------------------- manifest.json */

const FILE = /^[A-Za-z0-9._-]+\.webm$/;
const pos = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

function readParts(v: unknown): FxParts | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = {} as FxParts;
  for (const p of FX_PARTS) {
    const f = o[p];
    // 置き場の外を指せないように、ファイル名だけを受ける
    if (typeof f !== "string" || !FILE.test(f)) return null;
    out[p] = f;
  }
  return out;
}

function readLayers(v: unknown): FxLayers | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const back = o.back == null ? null : readParts(o.back);
  const front = o.front == null ? null : readParts(o.front);
  // 書いてあるのに読めない層があれば、その通りは無かったことにする（片方だけの演出を黙って出さない）
  if ((o.back != null && !back) || (o.front != null && !front)) return null;
  if (!back && !front) return null;
  return { back, front };
}

/**
 * `manifest.json` を読む。**読めない段は入れない**（その段は動画なしで出る）。
 * 秒が数でない・登場の外で `revealAt` を言っている段も、入れない（キャラ絵の出る瞬間がずれる）
 */
export function parseFxManifest(json: unknown): FxManifest {
  const out: FxManifest = {};
  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const tiers = root?.tiers && typeof root.tiers === "object" ? (root.tiers as Record<string, unknown>) : null;
  if (!tiers) return out;
  for (const [k, raw] of Object.entries(tiers)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const introDur = pos(o.introDur);
    const stayDur = pos(o.stayDur);
    const outroDur = pos(o.outroDur);
    const revealAt = typeof o.revealAt === "number" && Number.isFinite(o.revealAt) ? o.revealAt : null;
    if (!introDur || !stayDur || !outroDur || revealAt == null || revealAt < 0 || revealAt > introDur) continue;
    const vs = o.variants && typeof o.variants === "object" ? (o.variants as Record<string, unknown>) : {};
    const variants: FxTierEntry["variants"] = {};
    for (const name of ["full", "light"] as const) {
      const l = readLayers(vs[name]);
      if (l) variants[name] = l;
    }
    if (!variants.full && !variants.light) continue;
    const cb = o.charBottom;
    const charBottom = typeof cb === "number" && Number.isFinite(cb) && cb >= CHAR_BOTTOM_MIN && cb <= CHAR_BOTTOM_MAX ? cb : null;
    const pt = o.plateTop;
    const plateTop = typeof pt === "number" && Number.isFinite(pt) && pt > 0 && pt < 0.5 ? pt : null;
    out[k] = { variants, revealAt, introDur, stayDur, outroDur, charBottom, ...(plateTop != null ? { plateTop } : {}) };
  }
  return out;
}

/**
 * その通りの層。light が無ければ full を使う（〜999円の3段は初めから full だけ。11月は light をやめたので、
 * manifest から light が外れたあとは、旗 `?fx=light` が来ても全段 full で流れる）
 */
export function layersFor(entry: FxTierEntry, variant: FxVideoVariant): FxLayers | null {
  return entry.variants[variant] ?? entry.variants.full ?? null;
}

/* ---------------------------------------------------------------- 手元に持つ順 */

/**
 * 手元に持つ順（ファイル名）。量の上限は `fxHold.ts` の `FX_HOLD_BUDGET`。決め方は4つ:
 *
 * 1. **その日に流す通りだけ**（2通りのうち片方しか出ないので、もう片方は1バイトも落とさない）
 * 2. **段ごとに、登場と滞在を組で。** 段を手元から流せるのは、その段の登場と滞在（層ぜんぶ）がそろってから。
 *    前は全段の登場を先に落としていた（滞在は登場が流れているあいだに回線で読める、という前提）。
 *    11/8 はその前提が崩れて、滞在が読めずに7段とも外れた。いまは回線で読む本を流しながら待たない
 * 3. 段は **低い順**（段1 → 段7）。来る回数の順（〜999円は毎配信、1,000円〜は3日に1回、5,000円〜は月1、1万円〜は年2）。
 *    上限で切れるのは高い段から。開き直した直後に来た投げ銭も、安い段から先に手元から出せる
 * 4. 1段の中は back → front。**締めは全段の登場と滞在のあと**（要るのは投げ銭から 25 秒以上あと。
 *    持っていなければ、アラートが出てから取り寄せて間に合う）
 */
export function fxHoldOrder(tiers: readonly FxTier[], m: FxManifest, variant: FxVideoVariant): string[] {
  const out: string[] = [];
  const keys = [...tiers].sort((a, b) => a.min - b.min).map((t) => t.video?.tier).filter((k): k is string => !!k);
  const push = (k: string, parts: readonly FxPart[]) => {
    const e = m[k];
    const l = e && layersFor(e, variant);
    if (!l) return;
    for (const name of FX_LAYERS)
      for (const part of parts) {
        const f = l[name]?.[part];
        if (f && !out.includes(f)) out.push(f);
      }
  };
  for (const k of keys) push(k, ["intro", "stay"]);
  for (const k of keys) push(k, ["outro"]);
  return out;
}

export const fxUrl = (dir: string, file: string) => `${dir}/${file}`;

/** 手元から流せる段（登場と滞在が層ぜんぶ手元にある段）。ログが見る */
export function fxReadyTiers(dir: string, m: FxManifest, variant: FxVideoVariant): string[] {
  return Object.keys(m)
    .sort((a, b) => Number(a) - Number(b))
    .filter((k) => {
      const l = layersFor(m[k], variant);
      if (!l) return false;
      return FX_LAYERS.every((name) => !l[name] || (["intro", "stay"] as const).every((p) => !!fxHeldUrl(fxUrl(dir, l[name]![p]))));
    });
}

/* ---------------------------------------------------------------- 1件ぶんの動画（要素）を用意する */

export type FxLayerKit = Record<FxPart, HTMLVideoElement>;

/**
 * 投げ銭1件ぶんの動画の要素。**投げ銭が来てから作り、登場の頭が流せるところまで読んでから**アラートを出す
 * （その段の絵だけを展開する、と同じ考え。前もって作っておくと、7段ぶんの再生器がスマホの記憶を食う）。
 * 1回流したら捨てる（`used`）
 */
export type FxKit = {
  /** `{段}-{通り}` */
  key: string;
  layers: Record<FxLayerName, FxLayerKit | null>;
  entry: FxTierEntry;
  used: boolean;
  /** 締めの流す URL（滞在に入ったら読ませる）。持っていなければ取り寄せている。読めなければ null（締めなしで終わる） */
  outro?: Record<FxLayerName, FxOutro | null>;
  /** 上限の外で、この1件だけに渡した URL（手放すときに一緒に手放す） */
  transient?: string[];
  released?: boolean;
};

/** 締めの手元の URL。`url` は取り寄せが済んだら入る（undefined = まだ・null = 読めなかった） */
export type FxOutro = { url?: string | null; p: Promise<string | null> };

/** 用意の結果。ログ（index.tsx の `fxPlan`）に、そのまま載せる */
export type FxKitResult = {
  kit: FxKit | null;
  /** 手元に全部あった（held）・その場で取り寄せた（fetched） */
  from: "held" | "fetched" | null;
  /** 外した理由（`fetch` 回線で読めない・`fetchTimeout` 取り寄せが間に合わない・`hold` 手元に置けない・`load` 手元の動画が読めない） */
  why: string | null;
  /** 取り寄せた本数・バイト数・かかった ms（手元にあれば 0） */
  fetched: number;
  bytes: number;
  fetchMs: number;
};

/** その段の動画を流す段取り（AlertStage が持つ） */
export type VideoPlan = {
  key: string;
  revealAt: number;
  headroom: number;
  /** キャラ絵の箱の下の端（面の高さに対する割合）。manifest に無ければ null（いつもの並べ方） */
  charBottom: number | null;
  /** 運ばれてくる札の道のいちばん上（動画の枠の高さに対する割合。`FxTierEntry.plateTop`）。無ければいつもの高さから */
  plateTop?: number;
  text: "pop" | "don" | "count";
  kit: FxKit;
};

/** 動画の要素を1つ作る。音なし・インライン・poster は透明・最初は透明（見せてよくなってから見せる。`onShowable`） */
export function makeFxVideo(src: string | null, loop: boolean, name: string): HTMLVideoElement {
  const v = newVideo();
  v.preload = "auto";
  v.loop = loop;
  // 道具（alert-overlap・録画の秒の確かめ）が、どの動画かを読む印
  v.dataset.fxPart = name;
  Object.assign(v.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    // 720×1280 を面いっぱいに（9:16 の面ならそのまま。はみ出す側を切る）
    objectFit: "cover",
    objectPosition: "50% 50%",
    opacity: "0",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  if (src) v.src = src;
  return v;
}

/** 読めたところ（readyState）が `level` に届くまで待つ。しくじり・時間切れは false */
export function fxReady(v: HTMLVideoElement, level: 2 | 4, timeoutMs: number): Promise<boolean> {
  if (v.readyState >= level) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ev = level >= 4 ? "canplaythrough" : "loadeddata";
    const done = (ok: boolean) => {
      clearTimeout(timer);
      v.removeEventListener(ev, onOk);
      v.removeEventListener("error", onErr);
      resolve(ok);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = setTimeout(() => done(v.readyState >= level), timeoutMs);
    v.addEventListener(ev, onOk);
    v.addEventListener("error", onErr);
  });
}

/** 要素を手放す（再生器と読んだ中身を放す）。DOM からも外す。この1件だけに渡した URL も手放す */
export function releaseFxKit(kit: FxKit) {
  kit.released = true;
  for (const u of kit.transient ?? []) revokeFxUrl(u);
  if (kit.transient) kit.transient.length = 0;
  for (const name of FX_LAYERS) {
    const L = kit.layers[name];
    if (!L) continue;
    for (const p of FX_PARTS) {
      const v = L[p];
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {
        // 放せなくても、外すのは続ける
      }
      v.remove();
    }
  }
}

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * その段の動画を用意する。**登場と滞在を手元の URL で渡し、登場は最後まで流せるところまで（canplaythrough）、
 * 滞在は頭のコマまで**読んでから返す。持っていない本は、ここで取り寄せる（`needFxVideos`）。
 * 締めは、登場と滞在がそろってから取り寄せ始める（`runFxShow` が滞在に入ってから読ませる。登場・滞在と電波を取り合わない）。
 * 読めなければ（しくじり・`timeoutMs` 切れ）kit は null で、理由を返す。作った要素は捨てる。
 * 手元の動画が読めなかったら、その本を手放す（次の温めで取り直す）
 */
export async function prepareFxKit(
  dir: string,
  key: string,
  layers: FxLayers,
  entry: FxTierEntry,
  timeoutMs: number
): Promise<FxKitResult> {
  const t0 = nowMs();
  const res: FxKitResult = { kit: null, from: null, why: null, fetched: 0, bytes: 0, fetchMs: 0 };
  const want: string[] = [];
  for (const name of FX_LAYERS) {
    const parts = layers[name];
    if (parts) want.push(fxUrl(dir, parts.intro), fxUrl(dir, parts.stay));
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const need = await Promise.race([
    needFxVideos(want),
    new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  res.fetchMs = Math.round(nowMs() - t0);
  // 間に合わなくても、取り寄せは続けて手元に持つ（同じ段の次の投げ銭は手元から出る）
  if (need === "timeout") return { ...res, why: "fetchTimeout" };
  res.fetched = need.fetched;
  res.bytes = need.bytes;
  res.from = need.fetched ? "fetched" : "held";
  if (!need.urls) {
    for (const u of need.transient) revokeFxUrl(u);
    return { ...res, why: need.why ?? "fetch" };
  }
  const urls = need.urls;
  const mk = (name: FxLayerName): FxLayerKit | null => {
    const parts = layers[name];
    if (!parts) return null;
    const outro = makeFxVideo(null, false, `${name}:outro`);
    // 元の URL は印だけ（道具が読む）。流すのは手元の URL
    outro.dataset.src = fxUrl(dir, parts.outro);
    const intro = makeFxVideo(urls.get(fxUrl(dir, parts.intro))!, false, `${name}:intro`);
    intro.dataset.src = fxUrl(dir, parts.intro);
    const stay = makeFxVideo(urls.get(fxUrl(dir, parts.stay))!, true, `${name}:stay`);
    stay.dataset.src = fxUrl(dir, parts.stay);
    return { intro, stay, outro };
  };
  const kit: FxKit = { key, layers: { back: mk("back"), front: mk("front") }, entry, used: false, transient: [...need.transient] };
  const left = Math.max(0, timeoutMs - (nowMs() - t0));
  const waits: Promise<boolean>[] = [];
  const els: HTMLVideoElement[] = [];
  for (const name of FX_LAYERS) {
    const L = kit.layers[name];
    if (!L) continue;
    waits.push(fxReady(L.intro, 4, left), fxReady(L.stay, 2, left));
    els.push(L.intro, L.stay);
  }
  const oks = await Promise.all(waits);
  if (!oks.every(Boolean)) {
    // 手元の動画が読めない（壊れた・捨てられた）。その本を手放して、次の温めで取り直す
    oks.forEach((ok, i) => {
      if (!ok && els[i].error && els[i].dataset.src) dropFxHeld(els[i].dataset.src!);
    });
    releaseFxKit(kit);
    return { ...res, why: "load" };
  }
  // 締め。登場と滞在がそろってから取り寄せる（持っていればすぐ）
  const outroOf = (name: FxLayerName): FxOutro | null => {
    const parts = layers[name];
    if (!parts) return null;
    const src = fxUrl(dir, parts.outro);
    const o: FxOutro = {
      p: needFxVideos([src]).then((r) => {
        for (const u of r.transient) {
          if (kit.released) revokeFxUrl(u);
          else kit.transient!.push(u);
        }
        o.url = kit.released ? null : r.urls?.get(src) ?? null;
        return o.url;
      }),
    };
    return o;
  };
  kit.outro = { back: outroOf("back"), front: outroOf("front") };
  return { ...res, kit };
}

/* ---------------------------------------------------------------- 流す */

/**
 * 道具が読む印（User Timing）。`fxv:start`（流し始め）・`fxv:<層>:<本>`（その本の最初のコマが出た瞬間）・
 * `fxv:<層>:end`（締めが終わった）・`fxv:<層>:dead`・`fxv:fail`。`/alert/perf` の「11月 本物」もこれを読む
 */
function mark(name: string, detail: Record<string, unknown>) {
  try {
    performance.mark(name, { detail });
  } catch {
    // 測れない環境では何もしない
  }
}

const finite = (v: number) => (Number.isFinite(v) && v > 0 ? v : null);

/**
 * 用意した動画を、2つの層（`hosts`）に置いて流す。止める関数を返す（止めると要素も手放す）。
 *
 * - 層ごとに 登場 → 滞在（くり返し）→ 締め。**移るのは先導の層（奥。奥が無ければ手前）の切れ目で、全部の層いっしょに。**
 *   層ごとに自分の終わりで移らせると、展開の遅れとループの継ぎ目のぶんだけずれていき、締めの頭で奥と手前が
 *   0.1〜0.3 秒ずれた（この箱で測った）。手前が先に終わったら最後のコマのまま待ち、奥が先なら手前を切る
 * - 次の本は、前の本の最後のコマを出したまま始め、**次の本が見せてよくなってから**入れ替える（`onShowable`。
 *   コマの合図・`playing` と readyState 2 以上・時計が進んだ・play() が解けて 250ms のどれか早いもの。#1133 #1137）
 * - 締め: 締めが終わりまでに収まる最後の滞在の輪の切れ目で、くり返しを止めて締めへ。切れ目が来なければ
 *   （止まった・読めない）終わりの outroDur 秒前に切り替える
 * - 層を消すのは3つだけ: `error`・play() が止められた（`AbortError` 以外）・登場の時計が 3 秒進まない。
 *   **全部の層が消えたら `onFail`（その秒）**。合図が来ないだけでは消さない（#1137）
 */
export function runFxShow(
  kit: FxKit,
  hosts: Record<FxLayerName, HTMLElement>,
  durationSec: number,
  /** 全部の層が消えた（その秒と、最後に消えた層の理由） */
  onFail: (sec: number, why: string) => void,
  /** 先導の層の動画が `revealAt` に来た（キャラ絵と札を出してよい）。1回だけ */
  onReveal?: () => void
): () => void {
  kit.used = true;
  const t0 = performance.now();
  const sec = () => (performance.now() - t0) / 1000;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const offs: (() => void)[] = [];
  let stopped = false;
  let failed = false;
  const { entry } = kit;

  type Layer = {
    name: FxLayerName;
    k: FxLayerKit;
    phase: FxPart | "done";
    shown: FxPart | null;
    /** 登場の時計が 0 を越えた（消すときの理由の字だけに使う） */
    started: boolean;
    /** 登場の時計を最後に読んだ値と、最後に進んだ時刻（3 秒進まなければ消す） */
    lastCt: number;
    lastMove: number;
    dead: boolean;
    /** 締めが読めなかった。滞在をくり返したまま終わる（締めが無いだけで、層ごと消さない） */
    noOutro: boolean;
    /** 登場を流し終えた（先導が終わるのを、最後のコマのまま待っている） */
    introEnded: boolean;
  };
  const layers: Layer[] = [];
  for (const name of FX_LAYERS) {
    const k = kit.layers[name];
    if (!k) continue;
    layers.push({ name, k, phase: "intro", shown: null, started: false, lastCt: 0, lastMove: t0, dead: false, noOutro: false, introEnded: false });
    for (const p of FX_PARTS) {
      // 作り方によらず、見せてよくなるまで透明（poster も透明なので、▶ の板は出ない）
      k[p].style.opacity = "0";
      hosts[name].appendChild(k[p]);
    }
  }

  const on = (el: HTMLVideoElement, ev: string, fn: () => void) => {
    el.addEventListener(ev, fn);
    offs.push(() => el.removeEventListener(ev, fn));
  };
  const fail = (why: string) => {
    if (failed || stopped) return;
    failed = true;
    mark("fxv:fail", { t: sec(), why });
    onFail(sec(), why);
  };
  const alive = () => layers.filter((x) => !x.dead);
  /** 先導の層（奥。奥が消えたら手前）。移る切れ目はこの層が決める */
  const leader = (): Layer | null => alive()[0] ?? null;
  /** 締めの前の最後の輪に入った（先導のくり返しを止めた） */
  let armed = false;
  const kill = (L: Layer, why: string) => {
    if (L.dead) return;
    const wasLeader = L === leader();
    L.dead = true;
    for (const p of FX_PARTS) {
      L.k[p].style.opacity = "0";
      try {
        L.k[p].pause();
      } catch {
        // 止まらなくても、見えなくしてある
      }
    }
    mark(`fxv:${L.name}:dead`, { t: sec(), why });
    if (layers.every((x) => x.dead)) return fail(why);
    // 先導が消えたら、残った層が先導を継ぐ（待っていた登場の終わり・締めの前の輪を引き継ぐ）
    const N = leader();
    if (wasLeader && N) {
      if (N.phase === "intro" && N.introEnded) afterIntro();
      else if (N.phase === "stay" && armed && !N.noOutro) N.k.stay.loop = false;
    }
  };
  /* その本を見せてよくなった。いまの本だけを見せる（前の本は最後のコマのまま、ここまで出ている）。
     前の本を消すのは同じ瞬間（透明つきの動画なので、両方を見せると1コマだけ二重に重なる） */
  const shown = (L: Layer, p: FxPart) => {
    if (L.dead || stopped || L.phase !== p || L.shown === p) return;
    for (const q of FX_PARTS) L.k[q].style.opacity = q === p ? "1" : "0";
    L.shown = p;
    if (p === "outro") L.k.stay.pause();
    mark(`fxv:${L.name}:${p}`, { t: sec() });
  };
  /** 締めが読めない（取り寄せられなかった・まだ来ない）。滞在をくり返したまま終わる（層ごとは消さない） */
  const noOutro = (L: Layer) => {
    if (L.noOutro) return;
    L.noOutro = true;
    L.k.stay.loop = true;
    mark(`fxv:${L.name}:noOutro`, { t: sec() });
  };
  const play = (L: Layer, part: FxPart) => {
    if (L.dead || stopped) return;
    const v = L.k[part];
    /* 締めの手元の URL がまだ無い（取り寄せ中・読めなかった）。元の URL は読ませない（控えに頼らない）。
       滞在の最後のコマで止まっているので、滞在をもう一度くり返して終わる */
    if (part === "outro" && !v.getAttribute("src")) {
      noOutro(L);
      if (L.phase === "stay" && L.k.stay.paused) {
        try {
          L.k.stay.currentTime = 0;
        } catch {
          // 頭出しできなくても流すのは続ける
        }
        L.k.stay.play()?.catch?.(() => {});
      }
      return;
    }
    L.phase = part;
    try {
      if (v.currentTime > 0) v.currentTime = 0;
    } catch {
      // 頭出しできなくても流すのは続ける
    }
    const pr = v.play();
    offs.push(onShowable(v, () => shown(L, part), { played: pr }));
    /* 止められた（自動再生が許されない・形が読めない）ときだけ消す。`AbortError` は「始まる前に pause() か
       src の差し替えが来た」で、そのあと play() し直せば流れる（止めて撮る道具がそうする）ので、消さない */
    if (pr && typeof pr.catch === "function")
      pr.catch((e: unknown) => {
        if (stopped || (e as { name?: string } | null)?.name === "AbortError") return;
        kill(L, `rejected:${part}`);
      });
  };
  const toOutro = (L: Layer) => {
    if (L.dead || L.noOutro || L.phase === "outro" || L.phase === "done") return;
    play(L, "outro");
  };
  /** 締めへ。全部の層いっしょに（手前は輪の途中でも切る。光と粒なので、奥の切れ目に合わせるほうが目立たない） */
  const toOutroAll = () => alive().forEach(toOutro);
  /** 先導の登場が終わった。全部の層を滞在へ（締めの前の輪をもう過ぎていれば、締めへ） */
  function afterIntro() {
    if (armed) return toOutroAll();
    for (const L of alive()) if (L.phase === "intro") play(L, "stay");
  }

  for (const L of layers) {
    for (const p of FX_PARTS) {
      const v = L.k[p];
      on(v, "error", () => {
        // 締めだけが読めないなら、締めを出さずに滞在のまま終わる（読み始めは滞在の頭なので、まだ締めの前）
        if (p === "outro" && L.phase !== "outro") return noOutro(L);
        kill(L, `error:${p}`);
      });
    }
    on(L.k.intro, "ended", () => {
      L.introEnded = true;
      if (L === leader()) afterIntro();
    });
    // 滞在は `loop` なので、終わるのは締めの前に先導のくり返しを止めたときだけ
    on(L.k.stay, "ended", () => (L === leader() ? toOutroAll() : toOutro(L)));
    on(L.k.outro, "ended", () => {
      L.phase = "done";
      mark(`fxv:${L.name}:end`, { t: sec() });
    });
    // 締めは、滞在に入ったら読み始める（要るのは 25 秒以上あと）。流すのは手元の URL（`prepareFxKit` が取り寄せている）
    on(L.k.stay, "playing", () => {
      const o = L.k.outro;
      const want = kit.outro?.[L.name];
      if (o.getAttribute("src") || !want) return;
      const give = (u: string | null) => {
        if (stopped || o.getAttribute("src")) return;
        if (!u) return noOutro(L);
        o.src = u;
        o.load();
      };
      // 取り寄せが済んでいれば、すぐ（済んでいなければ、済んだときに）
      if (want.url !== undefined) give(want.url);
      else want.p.then(give);
    });
  }

  // 登場。ここがアラートの頭（キャラ絵と字の時計と同じ瞬間）
  mark("fxv:start", { key: kit.key, durationSec });
  for (const L of layers) play(L, "intro");

  /* 動いているかと、キャラ絵と札を出す合図は、**登場の時計（currentTime）の進み**で決める。描くたびに読む。
     コマの合図（requestVideoFrameCallback）にも、見せたかどうかにも頼らない。opacity 0 の `<video>` には合図が
     来ない端末があり（Android の WebView。#1137）、合図を「動き出した」にしていた #1134 は、11/6 の配信で
     7段とも 3 秒で消していた。
     - 登場の時計が 3 秒進まない層は消す（流れ始めも途中も同じ決まり。回線が細い日に登場が途中で止まり、
       待ちきれずに札を先に出していた。2026-11-05、往復 300ms・下り 4Mbps で5回中5回。#1131）
     - 先導の層の登場が revealAt に来たら onReveal（壁の時計ではなく動画の時計で。読み込みや展開で動画が遅れた日に、
       主役が出きる前に札が出ないように。alert-reveal.mjs が数える）。先導が消えたら次の層で見る。
       全部消えたら onFail（index.tsx が動画なしの見せ方に落とし、すぐ出す） */
  let revealed = !onReveal;
  let pgHandle: ReturnType<typeof setTimeout> | number | null = null;
  // rAF で回したものは rAF でだけ取り消す（止める関数を見る。videoGuard.ts の onShowable と同じ理由）
  const useRaf = typeof requestAnimationFrame === "function";
  const nextTick = (f: () => void) => (useRaf ? requestAnimationFrame(f) : setTimeout(f, 16));
  const clock = (v: HTMLVideoElement) => {
    try {
      return Number(v.currentTime) || 0;
    } catch {
      return 0;
    }
  };
  for (const L of layers) L.lastCt = clock(L.k.intro);
  const watch = () => {
    pgHandle = null;
    if (stopped || failed) return;
    const now = performance.now();
    for (const L of alive()) {
      if (failed) return;
      if (L.phase !== "intro" || L.introEnded) continue;
      const ct = clock(L.k.intro);
      if (ct !== L.lastCt) {
        L.lastCt = ct;
        L.lastMove = now;
        if (ct > 0) L.started = true;
      } else if (now - L.lastMove > FX_START_TIMEOUT_MS) kill(L, L.started ? "stalled" : "timeout");
    }
    if (stopped || failed) return;
    if (!revealed) {
      const Ld = leader();
      if (Ld && (Ld.phase !== "intro" || Ld.introEnded || clock(Ld.k.intro) >= entry.revealAt - 0.02)) {
        revealed = true;
        mark("fxv:reveal", { t: sec() });
        onReveal?.();
      }
    }
    if (!revealed || alive().some((L) => L.phase === "intro" && !L.introEnded)) pgHandle = nextTick(watch);
  };
  pgHandle = nextTick(watch);

  /* 締め。先導の層の、動画の実の長さ（読めなければ manifest の秒）で決める。
     arm: ここから先の滞在の輪の切れ目は、締めが終わりまでに収まる最後の切れ目（余裕 0.15 秒） */
  const L0 = leader();
  if (L0) {
    const stayLen = finite(L0.k.stay.duration) ?? entry.stayDur;
    const outroLen = entry.outroDur;
    const deadline = Math.max(0, durationSec - outroLen);
    const arm = Math.max(0, deadline - stayLen - 0.15);
    timers.push(
      setTimeout(() => {
        armed = true;
        const Ld = leader();
        if (Ld && Ld.phase === "stay" && !Ld.noOutro) Ld.k.stay.loop = false;
      }, arm * 1000)
    );
    // 切れ目が来なかったとき（止まった・読めなかった）の締め切り
    timers.push(setTimeout(toOutroAll, (deadline + 0.3) * 1000));
  }

  return () => {
    stopped = true;
    /* 番号は rAF と setTimeout で別々に数えるので、rAF の番号を clearTimeout に渡すと同じ番号の別の setTimeout を消す
       （#1131 から止めるたびに1つ消していた。#1138 で見せる合図が rAF を使うようになり、毎回の替わり目で起きていた） */
    if (pgHandle != null) {
      if (useRaf) cancelAnimationFrame(pgHandle as number);
      else clearTimeout(pgHandle as ReturnType<typeof setTimeout>);
    }
    timers.forEach(clearTimeout);
    offs.forEach((f) => f());
    releaseFxKit(kit);
  };
}
