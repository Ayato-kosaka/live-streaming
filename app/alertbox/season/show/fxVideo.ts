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
 * - `playing` が来るまで透明（届く前の `<video>` は Android の WebView が ▶ の板を描く）
 * - 3秒動かなければ、その層は出さない。全部の層が動かなければ、いまの段の見せ方（字とキャラ絵）に落ちる
 * - 同じ URL は二度落とさない（温めは1回きり。アラートでは控えから読む）
 * - `still=1`（iPhone の日）は動画を1回も出さず、1バイトも落とさない（呼ぶ側が止める）
 */
import type { FxTier, FxVideoVariant, SeasonTheme } from "../../themes";

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
    out[k] = { variants, revealAt, introDur, stayDur, outroDur, charBottom };
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

/* ---------------------------------------------------------------- 温める順と量 */

/**
 * 前もって落としておく量の上限（バイト）。**超えたら、そこから先の段は投げ銭が来たときに読む。**
 *
 * PRISM のウィジェットは Android の WebView で開いていて、WebView の HTTP の控えは 20MB ほどしかない
 * （Chromium の android_webview の既定。端末では測れていない）。控えは古いものから捨てられるので、
 * 7段ぶん（約束の目安で 1段 6MB＝42MB）を全部落とすと、**先に落とした段1〜3（いちばんよく来る段）が
 * 段7（年2回）に押し出されて、落としたこと自体が無駄になる。** 貯金箱の絵と JS（約3MB）を残して 12MB まで
 */
export const FX_WARM_BUDGET = 12 * 1024 * 1024;

/**
 * 温める順（ファイル名）。決め方は4つ:
 *
 * 1. **その日に流す通りだけ**（2通りのうち片方しか出ないので、もう片方は1バイトも落とさない）
 * 2. **全段の登場を先に、滞在はそのあと。** アラートの頭で読み終えていなければならないのは登場だけで、
 *    滞在は頭のコマが出れば始められる（残りは登場が流れている 1.4〜7 秒のあいだに読める）。
 *    段ごとに登場と滞在を組で落とすと、full では段1〜6 だけで上限に近づき、**いちばん大きい段7 の登場が
 *    上限の外に出る**（段4・5 の実の動画と、描く担当の書き出しの速さで数えた）。段7 は年2回なので、
 *    控えに無ければその日の1回目は動画なしで出てしまう
 * 3. 登場どうし・滞在どうしは **段の低い順**（段1 → 段7）。来る回数の順（〜999円は毎配信、1,000円〜は3日に1回、
 *    5,000円〜は月1、1万円〜は年2）。上限で切れるのは、高い段の滞在から
 * 4. 1段の中は back → front。締めは温めない:
 *    締めはアラートの終わりの0.6〜1.5秒で、要るのは投げ銭から 25 秒以上あと。アラートが出たときに読み始めれば間に合う
 */
export function fxWarmOrder(tiers: readonly FxTier[], m: FxManifest, variant: FxVideoVariant): string[] {
  const out: string[] = [];
  const keys = [...tiers].sort((a, b) => a.min - b.min).map((t) => t.video?.tier).filter((k): k is string => !!k);
  for (const part of ["intro", "stay"] as const) {
    for (const k of keys) {
      const e = m[k];
      const l = e && layersFor(e, variant);
      if (!l) continue;
      for (const name of FX_LAYERS) {
        const f = l[name]?.[part];
        if (f && !out.includes(f)) out.push(f);
      }
    }
  }
  return out;
}

/* 落とし終えた（落としている）URL。ページに1つ。**同じ URL は二度落とさない**（しくじったものだけ外して、次に試す） */
const warmed = new Set<string>();

/** 温め終えた URL（試験と道具が見る） */
export const fxWarmed = (): ReadonlySet<string> => warmed;

export const fxUrl = (dir: string, file: string) => `${dir}/${file}`;

/**
 * 順に1本ずつ落とす（HTTP の控えに乗せるだけ。展開しない）。配信しながら落とすので並べない（電波を取り合わない）。
 * `alive()` が false になったら止める（テーマが替わった・面を閉じた）。落としたバイト数を返す
 */
export async function warmFxVideos(
  dir: string,
  files: readonly string[],
  alive: () => boolean,
  budget = FX_WARM_BUDGET
): Promise<number> {
  let bytes = 0;
  for (const f of files) {
    if (!alive() || bytes >= budget) break;
    const url = fxUrl(dir, f);
    if (warmed.has(url)) continue;
    warmed.add(url);
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      bytes += (await res.arrayBuffer()).byteLength;
    } catch {
      // アラートのときにもう一度読みに行く
      warmed.delete(url);
    }
  }
  return bytes;
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
};

/** その段の動画を流す段取り（AlertStage が持つ） */
export type VideoPlan = {
  key: string;
  revealAt: number;
  headroom: number;
  /** キャラ絵の箱の下の端（面の高さに対する割合）。manifest に無ければ null（いつもの並べ方） */
  charBottom: number | null;
  text: "pop" | "don" | "count";
  kit: FxKit;
};

/** 動画の要素を1つ作る。音なし・インライン・最初は透明（`playing` で見せる） */
export function makeFxVideo(src: string | null, loop: boolean, name: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.setAttribute("disablepictureinpicture", "");
  v.setAttribute("disableremoteplayback", "");
  v.controls = false;
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

/** 要素を手放す（再生器と読んだ中身を放す）。DOM からも外す */
export function releaseFxKit(kit: FxKit) {
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

/**
 * その段の動画を用意する。**登場は最後まで流せるところまで（canplaythrough）、滞在は頭のコマまで**読んでから返す。
 * 締めはここでは読み始めない（`runFxShow` が滞在に入ってから読む。登場・滞在と電波を取り合わない）。
 * 読めなければ（しくじり・`timeoutMs` 切れ）null を返し、作った要素は捨てる
 */
export async function prepareFxKit(
  dir: string,
  key: string,
  layers: FxLayers,
  entry: FxTierEntry,
  timeoutMs: number
): Promise<FxKit | null> {
  const mk = (name: FxLayerName): FxLayerKit | null => {
    const parts = layers[name];
    if (!parts) return null;
    const outro = makeFxVideo(null, false, `${name}:outro`);
    outro.dataset.src = fxUrl(dir, parts.outro);
    return {
      intro: makeFxVideo(fxUrl(dir, parts.intro), false, `${name}:intro`),
      stay: makeFxVideo(fxUrl(dir, parts.stay), true, `${name}:stay`),
      outro,
    };
  };
  const kit: FxKit = { key, layers: { back: mk("back"), front: mk("front") }, entry, used: false };
  const waits: Promise<boolean>[] = [];
  for (const name of FX_LAYERS) {
    const L = kit.layers[name];
    if (!L) continue;
    waits.push(fxReady(L.intro, 4, timeoutMs), fxReady(L.stay, 2, timeoutMs));
  }
  const oks = await Promise.all(waits);
  if (!oks.every(Boolean)) {
    releaseFxKit(kit);
    return null;
  }
  return kit;
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
 * - 次の本は、前の本の最後のコマを出したまま始め、`playing` が来てから入れ替える（すき間に何も出ない、を作らない）
 * - 締め: 締めが終わりまでに収まる最後の滞在の輪の切れ目で、くり返しを止めて締めへ。切れ目が来なければ
 *   （止まった・読めない）終わりの outroDur 秒前に切り替える
 * - 3 秒動かない・しくじった層は消す。**全部の層が消えたら `onFail`（その秒）**
 */
export function runFxShow(
  kit: FxKit,
  hosts: Record<FxLayerName, HTMLElement>,
  durationSec: number,
  onFail: (sec: number) => void
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
    started: boolean;
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
    layers.push({ name, k, phase: "intro", shown: null, started: false, dead: false, noOutro: false, introEnded: false });
    for (const p of FX_PARTS) {
      // 作り方によらず、`playing` が来るまで透明（▶ の板を出さない）
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
    onFail(sec());
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
  const play = (L: Layer, part: FxPart) => {
    if (L.dead || stopped) return;
    L.phase = part;
    const v = L.k[part];
    if (!v.getAttribute("src") && v.dataset.src) v.src = v.dataset.src;
    try {
      if (v.currentTime > 0) v.currentTime = 0;
    } catch {
      // 頭出しできなくても流すのは続ける
    }
    const pr = v.play();
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
      /* その本の最初のコマが出た。いまの本だけを見せる（前の本は最後のコマのまま、ここまで出ている）。
         `playing` は止めて再開するたびに来るので、2回目からは何もしない */
      on(v, "playing", () => {
        if (L.dead || stopped || L.phase !== p || L.shown === p) return;
        for (const q of FX_PARTS) L.k[q].style.opacity = q === p ? "1" : "0";
        L.shown = p;
        if (p === "intro") L.started = true;
        if (p === "outro") L.k.stay.pause();
        mark(`fxv:${L.name}:${p}`, { t: sec() });
      });
      on(v, "error", () => {
        // 締めだけが読めないなら、締めを出さずに滞在のまま終わる（読み始めは滞在の頭なので、まだ締めの前）
        if (p === "outro" && L.phase !== "outro") {
          L.noOutro = true;
          L.k.stay.loop = true;
          mark(`fxv:${L.name}:noOutro`, { t: sec() });
          return;
        }
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
    // 締めは、滞在に入ったら読み始める（要るのは 25 秒以上あと）
    on(L.k.stay, "playing", () => {
      const o = L.k.outro;
      if (!o.getAttribute("src") && o.dataset.src) {
        o.src = o.dataset.src;
        o.load();
      }
    });
  }

  // 登場。ここがアラートの頭（キャラ絵と字の時計と同じ瞬間）
  mark("fxv:start", { key: kit.key, durationSec });
  for (const L of layers) play(L, "intro");

  // 3 秒動かなければ、その層は出さない
  timers.push(
    setTimeout(() => {
      for (const L of layers) if (!L.started) kill(L, "timeout");
    }, FX_START_TIMEOUT_MS)
  );

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
    timers.forEach(clearTimeout);
    offs.forEach((f) => f());
    releaseFxKit(kit);
  };
}
