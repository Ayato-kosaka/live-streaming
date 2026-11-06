/**
 * アラートで使う `<video>` を、**中身を持つ前に何も描かせない**ための守り（#1133）。
 *
 * Android の WebView（スマホの PRISM）は、poster の無い `<video>` がコマを持つまでのあいだ、
 * **灰色の地に大きな ▶** を描く（WebView の既定の poster）。11月の7段を動画にしてから、アラートの頭と
 * 登場 → 滞在 → 締めの替わり目でそれが一瞬出ていた（1,000円で2回）。作業箱の Chromium（Linux）には
 * 既定の poster が無いので、録画では写らない。だから**仕組みで潰す**:
 *
 * 1. どの `<video>` にも透明の poster（1×1 の透明 GIF）を持たせる。既定の絵の代わりに透明が出る。**▶ はこれで消える**
 * 2. 見せるのは「見せてよい」の合図のどれか早いもの（`onShowable`。呼ぶ側はそれまで opacity 0 のまま）
 * 3. 替わり目では、次の動画が見せてよくなるまで前の動画を見せたまま（呼ぶ側。`fxVideo.ts` の `runFxShow`）
 *
 * ## 1つの合図に頼らない（#1137）
 *
 * #1134 は「requestVideoFrameCallback の合図まで透明」にした。11/6 の配信（Android の WebView）で7段の動画が
 * 1つも出なかった。opacity 0 の `<video>` には合図が来ず、readyState も 2 に届かない端末がある（描かない要素の
 * コマは作らない）。見せないと来ない合図を、見せる条件にしていた。だから合図は4つのどれか早いもの。
 * poster が透明なので、コマより先に見せても ▶ は出ない（出るのは透明）。
 *
 * **`<video>` を作るのは `newVideo()` だけ、JSX の `<video>` は `{...VIDEO_ATTRS}` を必ず付ける。**
 * `__tests__/videoGuard.test.ts` が app/alertbox の中を読んで、外れた書き方を落とす。
 */

/** 1×1 の透明 GIF。既定の poster（灰色の地と ▶）の代わりに描かれる */
export const CLEAR_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** JSX の `<video>` に付ける属性（`newVideo` と同じ守り）。音なし・インライン・コントロールも窓も出させない */
export const VIDEO_ATTRS = {
  poster: CLEAR_POSTER,
  controls: false,
  disablePictureInPicture: true,
  disableRemotePlayback: true,
  playsInline: true,
  muted: true,
} as const;

/** 要素に守りを付ける（poster・コントロールを出させない・音なし・インライン） */
export function guardVideo(v: HTMLVideoElement): HTMLVideoElement {
  v.setAttribute("poster", CLEAR_POSTER);
  v.controls = false;
  v.removeAttribute("controls");
  v.setAttribute("disablepictureinpicture", "");
  v.setAttribute("disableremoteplayback", "");
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  return v;
}

/** アラートの `<video>` はここで作る（守りの付いていない要素を作らない） */
export function newVideo(): HTMLVideoElement {
  return guardVideo(document.createElement("video"));
}

type FrameCallback = (now: number, meta: unknown) => void;
type WithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: FrameCallback) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** `play()` が解けてから、ほかの合図が無くても見せるまで（ms） */
export const SHOW_AFTER_PLAY_MS = 250;

/**
 * 再生を始めた `v` を**見せてよくなったら** `cb` を1回呼ぶ。やめる関数を返す。合図は次の**どれか早いもの**:
 *
 * 1. `requestVideoFrameCallback`（コマが描画に渡った）
 * 2. `playing` が来ていて、読めたところ（readyState）が 2 以上
 * 3. 時計（currentTime）が、呼んだ時より進んだ（描くたびと `timeupdate` で読む）
 * 4. `play()` が解けてから 250ms（`opts.played` を渡したとき）
 *
 * どれか1つが来ない端末でも、ほかで見せる。1〜3 がどれも opacity 0 のあいだは来ない端末（#1137）でも、4 で見せる
 * （見せると描き始めて、ほかの合図も来る）。poster は透明なので、コマより先に見せても ▶ は出ない。
 *
 * `opts.playing`: もう `playing` が来たあとに呼ぶとき（JSX の `onPlaying` から）
 */
export function onShowable(
  v: HTMLVideoElement,
  cb: () => void,
  opts: { playing?: boolean; played?: Promise<unknown> | void } = {}
): () => void {
  const el = v as WithRvfc;
  let done = false;
  let played = !!opts.playing;
  let handle: number | null = null;
  let tick: ReturnType<typeof setTimeout> | number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ct = () => {
    try {
      return Number(el.currentTime) || 0;
    } catch {
      return 0;
    }
  };
  const ct0 = ct();
  const offs: (() => void)[] = [];
  const on = (ev: string, fn: () => void) => {
    if (typeof el.addEventListener !== "function") return;
    el.addEventListener(ev, fn);
    offs.push(() => el.removeEventListener(ev, fn));
  };
  const raf = typeof requestAnimationFrame === "function";
  const stop = () => {
    done = true;
    offs.splice(0).forEach((f) => f());
    if (handle != null) {
      try {
        el.cancelVideoFrameCallback?.(handle);
      } catch {
        // もう呼ばれたあとでも構わない
      }
      handle = null;
    }
    /* rAF の番号は rAF でだけ取り消す。clearTimeout に渡すと、同じ番号の**別の** setTimeout を消してしまう
       （番号は rAF と setTimeout で別々に 1 から数える）。#1138 で、アラートの時計や道具の待ちが黙って止まった */
    if (tick != null) {
      if (raf) cancelAnimationFrame(tick as number);
      else clearTimeout(tick as ReturnType<typeof setTimeout>);
      tick = null;
    }
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const fire = () => {
    if (done) return;
    stop();
    cb();
  };
  // 1. コマの合図
  if (typeof el.requestVideoFrameCallback === "function") {
    try {
      handle = el.requestVideoFrameCallback(() => {
        handle = null;
        fire();
      });
    } catch {
      handle = null;
    }
  }
  // 2. `playing` と readyState
  const ready = () => {
    if (played && el.readyState >= 2) fire();
  };
  on("playing", () => {
    played = true;
    ready();
  });
  on("loadeddata", ready);
  on("canplay", ready);
  // 3. 時計が進んだ
  const moved = () => {
    if (ct() > ct0) fire();
  };
  on("timeupdate", moved);
  const poll = () => {
    tick = null;
    if (done) return;
    moved();
    if (!done) tick = raf ? requestAnimationFrame(poll) : setTimeout(poll, 16);
  };
  tick = raf ? requestAnimationFrame(poll) : setTimeout(poll, 16);
  // 4. play() が解けてから 250ms
  const pr = opts.played;
  if (pr && typeof (pr as Promise<unknown>).then === "function")
    (pr as Promise<unknown>).then(
      () => {
        if (!done) timer = setTimeout(fire, SHOW_AFTER_PLAY_MS);
      },
      () => {
        // 止められたときは呼ぶ側が層を消す
      }
    );
  ready();
  return stop;
}
