/**
 * @jest-environment jsdom
 */

/**
 * アラートの `<video>` が、**中身を持つ前に何も描かない**ことを見る（#1133）。
 *
 *   npx jest app/alertbox/__tests__/videoGuard.test.ts
 *
 * スマホの PRISM（Android の WebView）は、poster の無い `<video>` がコマを持つ前に、灰色の地と大きな ▶ を描く。
 * 作業箱の Chromium（Linux）にはこの既定の絵が無いので、録画では一度も写らなかった。だから目では守れない。
 * 守るのは構造の3つ:
 *
 *   1. アラートで作られる `<video>` は全部、透明の poster を持ち、コントロールを持たない
 *      （作り方を `newVideo()` と `{...VIDEO_ATTRS}` に絞り、ソースを読んで外れた書き方を落とす）
 *   2. 見せるのは「見せてよい」の合図のどれか早いもの（コマの合図・`playing` と readyState 2 以上・
 *      時計が進んだ・play() が解けて 250ms）。**1つの合図に頼らない**（#1137。opacity 0 の `<video>` には
 *      コマの合図が来ず、readyState も 2 に届かない端末で、11/6 の配信の7段が1つも出なかった）
 *   3. 替わり目は `fxvideo.test.ts` の 7節（次の本が見せてよくなるまで前の本が見えたまま）
 *
 * **対照を先に置く**（`island-misses.md` #99）。読む道具が、守りの無い書き方を本当に拾えるかを先に見る。
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { CLEAR_POSTER, SHOW_AFTER_PLAY_MS, VIDEO_ATTRS, guardVideo, newVideo, onShowable } from "../videoGuard";
import { makeFxVideo, prepareFxKit, releaseFxKit, runFxShow, type FxTierEntry } from "../season/show/fxVideo";

const ROOT = join(__dirname, "..");
const PUBLIC_ALERT = join(__dirname, "../../../public/alert");

/** 守りを持たない `<video>` か（poster が透明でない・コントロールが出る） */
function unguarded(v: HTMLVideoElement): string[] {
  const why: string[] = [];
  if (v.getAttribute("poster") !== CLEAR_POSTER) why.push("poster が透明でない");
  if (v.hasAttribute("controls") || v.controls) why.push("controls がある");
  if (!v.hasAttribute("disablepictureinpicture")) why.push("disablepictureinpicture が無い");
  if (!v.hasAttribute("disableremoteplayback")) why.push("disableremoteplayback が無い");
  if (!v.hasAttribute("playsinline")) why.push("playsinline が無い");
  if (!v.muted) why.push("音がある");
  return why;
}

/* ---------------------------------------------------------------- 1. poster とコントロール */

describe("1. アラートの `<video>` は全部、透明の poster を持ち、コントロールを持たない", () => {
  it("対照: 守りを通していない素の `<video>` は、見張りが拾う", () => {
    const raw = document.createElement("video");
    expect(unguarded(raw)).toEqual(
      expect.arrayContaining(["poster が透明でない", "disablepictureinpicture が無い", "disableremoteplayback が無い", "playsinline が無い"])
    );
    raw.controls = true;
    expect(unguarded(raw)).toContain("controls がある");
  });

  it("透明の poster は 1×1 の透明 GIF", () => {
    expect(CLEAR_POSTER.startsWith("data:image/gif;base64,")).toBe(true);
    const gif = Buffer.from(CLEAR_POSTER.split(",")[1], "base64");
    expect(gif.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(gif.readUInt16LE(6)).toBe(1);
    expect(gif.readUInt16LE(8)).toBe(1);
    // 透明色を持つ（Graphic Control Extension の透明の旗）
    const gce = gif.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
    expect(gce).toBeGreaterThan(0);
    expect(gif[gce + 3] & 1).toBe(1);
  });

  it("newVideo・guardVideo・makeFxVideo の要素は守りを持つ", () => {
    expect(unguarded(newVideo())).toEqual([]);
    const v = document.createElement("video");
    v.controls = true;
    expect(unguarded(guardVideo(v))).toEqual([]);
    expect(unguarded(makeFxVideo("/fx/a.webm", true, "back:stay"))).toEqual([]);
    expect(unguarded(makeFxVideo(null, false, "back:outro"))).toEqual([]);
  });

  it("JSX に付ける属性も同じ守り", () => {
    expect(VIDEO_ATTRS).toEqual({
      poster: CLEAR_POSTER,
      controls: false,
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      playsInline: true,
      muted: true,
    });
  });

  it("段の動画を用意して流して止めるまでに作られる `<video>` は、全部守りを持つ（作った数が 0 でないこと）", async () => {
    const made: HTMLVideoElement[] = [];
    const orig = document.createElement.bind(document);
    const spy = jest.spyOn(document, "createElement").mockImplementation(((tag: string, o?: ElementCreationOptions) => {
      const el = orig(tag, o);
      if (String(tag).toLowerCase() === "video") made.push(el as HTMLVideoElement);
      return el;
    }) as typeof document.createElement);
    // jsdom は読み込まない。用意（prepareFxKit）が待つ readyState を「最後まで流せる」にして、load は何もしない
    const rs = jest.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
    const ld = jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const pl = jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const pa = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    try {
      const parts = (L: string) => ({ intro: `t5-full-${L}-intro.webm`, stay: `t5-full-${L}-stay.webm`, outro: `t5-full-${L}-outro.webm` });
      const entry: FxTierEntry = { variants: {}, revealAt: 2, introDur: 3, stayDur: 3, outroDur: 1, charBottom: null };
      const kit = await prepareFxKit("/fx", "5-full", { back: parts("back"), front: parts("front") }, entry, 1000);
      expect(kit).not.toBeNull();
      const back = document.createElement("div");
      const front = document.createElement("div");
      document.body.append(back, front);
      const stop = runFxShow(kit!, { back, front }, 30, () => {});
      const placed = [...document.querySelectorAll("video")];
      expect(placed).toHaveLength(6);
      stop();
      const spare = await prepareFxKit("/fx", "5-full", { back: parts("back"), front: null }, entry, 1000);
      releaseFxKit(spare!);
      back.remove();
      front.remove();
    } finally {
      spy.mockRestore();
      rs.mockRestore();
      ld.mockRestore();
      pl.mockRestore();
      pa.mockRestore();
    }
    expect(made.length).toBe(9);
    expect(made.map((v) => [v.dataset.fxPart, unguarded(v)]).filter(([, w]) => (w as string[]).length)).toEqual([]);
  });
});

/* ---------------------------------------------------------------- 1'. ソースを読んで、守りを通さない書き方を落とす */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|html|js)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * 1ファイルの中の、守りを通さない `<video>` の書き方:
 * - `createElement("video")`（`videoGuard.ts` の外。`.html` は、5行以内に poster を置いていなければ）
 * - JSX の `<video`（開きの5行以内に `{...VIDEO_ATTRS}` が無い）
 */
function offences(file: string, src: string): string[] {
  const bad: string[] = [];
  const lines = src.split("\n");
  const isHtml = file.endsWith(".html");
  lines.forEach((line, i) => {
    if (/createElement\(\s*["']video["']\s*\)/.test(line)) {
      if (isHtml) {
        if (!lines.slice(i, i + 6).some((l) => /poster/.test(l))) bad.push(`${file}:${i + 1} poster の無い createElement("video")`);
      } else if (!file.endsWith("videoGuard.ts")) bad.push(`${file}:${i + 1} newVideo() を通さない createElement("video")`);
    }
    // JSX の開き（`<video` のあとに空白か改行。文の中の `<video>` は拾わない）
    for (const m of line.matchAll(/<video(?=\s|$)/g)) {
      const head = lines.slice(i, i + 6).join("\n").slice(m.index ?? 0);
      if (!/\{\s*\.\.\.VIDEO_ATTRS\s*\}/.test(head)) bad.push(`${file}:${i + 1} {...VIDEO_ATTRS} の無い <video>`);
    }
  });
  return bad;
}

describe("1'. app/alertbox と public/alert の `<video>` は、守りを通して作る（ソースを読む）", () => {
  it("対照: 守りを通さない書き方は拾う（素の createElement・属性の無い JSX・poster の無い html）", () => {
    expect(offences("a.ts", `const v = document.createElement("video");`)).toHaveLength(1);
    expect(offences("a.tsx", `return (\n  <video\n    ref={r}\n    autoPlay\n  />\n);`)).toHaveLength(1);
    expect(offences("a.html", `var v = document.createElement("video");\nv.muted = true;`)).toHaveLength(1);
    // 守りを通した書き方は拾わない
    expect(offences("a.tsx", `<video\n  ref={r}\n  {...VIDEO_ATTRS}\n  autoPlay\n/>`)).toEqual([]);
    expect(offences("a.html", `var v = document.createElement("video");\nv.setAttribute("poster", "data:...");`)).toEqual([]);
    expect(offences("videoGuard.ts", `return guardVideo(document.createElement("video"));`)).toEqual([]);
    // 文の中の `<video>` は JSX ではない
    expect(offences("a.ts", "/* 届く前の `<video>` は ▶ を描く */")).toEqual([]);
  });

  it("外れた書き方が 0（読んだファイルと、`<video>` を作る所の数が 0 でないこと）", () => {
    const files = [...walk(ROOT), ...walk(PUBLIC_ALERT).filter((f) => f.endsWith(".html"))];
    let sites = 0;
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      sites += (src.match(/createElement\(\s*["']video["']\s*\)|<video(?=\s)/g) ?? []).length;
      bad.push(...offences(relative(join(ROOT, "../.."), f), src));
    }
    expect(files.length).toBeGreaterThan(20);
    // videoGuard.ts の1つ・index.tsx の JSX・perf.html。増えたら数を直す（減ったら、読む道具が外れていないか見る）
    expect(sites).toBeGreaterThanOrEqual(3);
    expect(bad).toEqual([]);
  });
});

/* ---------------------------------------------------------------- 2. 見せてよい合図（どれか早いもの） */

type Rvfc = (now: number, meta: unknown) => void;
/** jsdom の `<video>` に再生の出来事を手で起こせる仕掛けと、コマの合図（あれば）を付ける */
function fake(opts: { rvfc: boolean; ready?: number }) {
  const v = document.createElement("video");
  const q: Rvfc[] = [];
  const st = { paused: true, ready: opts.ready ?? 4, t: 0 };
  Object.defineProperty(v, "paused", { configurable: true, get: () => st.paused });
  Object.defineProperty(v, "readyState", { configurable: true, get: () => st.ready });
  Object.defineProperty(v, "currentTime", { configurable: true, get: () => st.t, set: (x: number) => (st.t = x) });
  const cancel = jest.fn();
  if (opts.rvfc)
    Object.assign(v, {
      requestVideoFrameCallback: jest.fn((cb: Rvfc) => q.push(cb)),
      cancelVideoFrameCallback: cancel,
    });
  return {
    v,
    st,
    cancel,
    /** 再生を始めた（play() の直後の状態）・`playing` が来た */
    playing() {
      st.paused = false;
      v.dispatchEvent(new Event("playing"));
    },
    /** コマが描画に渡った（requestVideoFrameCallback の合図） */
    present() {
      q.splice(0).forEach((cb) => cb(0, {}));
    },
    fire(ev: string) {
      v.dispatchEvent(new Event(ev));
    },
  };
}
/** 呼ばれない約束（play() が解けない端末） */
const never = () => new Promise<void>(() => {});

describe("2. 見せてよい合図は4つのどれか早いもの（onShowable。#1137）", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("対照: どの合図も来なければ呼ばない（`playing` だけ・読めたところ 1・時計 0・play() が解けない）", () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: never() });
    f.playing();
    f.fire("timeupdate");
    jest.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("1. コマの合図（requestVideoFrameCallback）で。1回だけ", () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: never() });
    f.present();
    expect(cb).toHaveBeenCalledTimes(1);
    f.st.ready = 4;
    f.playing();
    f.st.t = 1;
    jest.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("2. `playing` が来ていて、読めたところが 2 以上で（2 未満なら読めるまで待つ）", () => {
    const f = fake({ rvfc: false, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: never() });
    f.fire("loadeddata"); // `playing` の前
    expect(cb).not.toHaveBeenCalled();
    f.playing();
    expect(cb).not.toHaveBeenCalled();
    f.st.ready = 2;
    f.fire("canplay");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("3. 時計が、呼んだ時より進んだら（コマの合図を呼び返さない・readyState 1 のままの端末でも）", () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: never() });
    jest.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();
    f.st.t = 0.04; // timeupdate は来なくても、描くたびに読む
    jest.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("4. play() が解けてから 250ms（ほかの合図が何も来ない端末でも）", async () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: Promise.resolve() });
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(SHOW_AFTER_PLAY_MS - 10);
    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(20);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("play() が止められたら、250ms では呼ばない（層を消すのは呼ぶ側）", async () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    onShowable(f.v, cb, { played: Promise.reject(new Error("NotAllowedError")) });
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("`playing` のあとに呼ぶとき（JSX の onPlaying）: 読めたところが 2 以上ならその場で", () => {
    const a = fake({ rvfc: true });
    const ca = jest.fn();
    onShowable(a.v, ca, { playing: true });
    expect(ca).toHaveBeenCalledTimes(1);
    const b = fake({ rvfc: true, ready: 1 });
    const cbb = jest.fn();
    onShowable(b.v, cbb, { playing: true });
    expect(cbb).not.toHaveBeenCalled();
    b.present();
    expect(cbb).toHaveBeenCalledTimes(1);
  });

  it("止めるとき、rAF の番号を clearTimeout に渡さない（同じ番号の別の setTimeout を消してしまう。#1138）", () => {
    const RAF_ID = 987654;
    const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => RAF_ID);
    const caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const ct = jest.spyOn(global, "clearTimeout");
    try {
      const f = fake({ rvfc: true, ready: 1 });
      const stop = onShowable(f.v, jest.fn(), { played: never() });
      stop();
      expect(caf).toHaveBeenCalledWith(RAF_ID);
      // 見せてよくなったとき（中で止める）も同じ
      const g = fake({ rvfc: true, ready: 1 });
      onShowable(g.v, jest.fn(), { played: never() });
      g.present();
      expect(ct.mock.calls.map((c) => c[0])).not.toContain(RAF_ID);
    } finally {
      raf.mockRestore();
      caf.mockRestore();
      ct.mockRestore();
    }
  });

  it("やめたら呼ばない（合図も外す・時計も読まない）", async () => {
    const f = fake({ rvfc: true, ready: 1 });
    const cb = jest.fn();
    const stop = onShowable(f.v, cb, { played: Promise.resolve() });
    stop();
    expect(f.cancel).toHaveBeenCalled();
    await Promise.resolve();
    f.present();
    f.st.t = 1;
    f.st.ready = 4;
    f.playing();
    jest.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
  });
});
