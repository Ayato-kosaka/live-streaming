/**
 * アラートで使う `<video>` を、**中身を持つ前に何も描かせない**ための守り（#1133）。
 *
 * Android の WebView（スマホの PRISM）は、poster の無い `<video>` がコマを持つまでのあいだ、
 * **灰色の地に大きな ▶** を描く（WebView の既定の poster）。11月の7段を動画にしてから、アラートの頭と
 * 登場 → 滞在 → 締めの替わり目でそれが一瞬出ていた（1,000円で2回）。作業箱の Chromium（Linux）には
 * 既定の poster が無いので、録画では写らない。だから**仕組みで潰す**:
 *
 * 1. どの `<video>` にも透明の poster（1×1 の透明 GIF）を持たせる。既定の絵の代わりに透明が出る
 * 2. 最初のコマが実際に描かれるまで見せない（`onFirstFrame`。呼ぶ側が opacity 0 のまま待つ）
 * 3. 替わり目では、次の動画のコマが出るまで前の動画を見せたまま（呼ぶ側。`fxVideo.ts` の `runFxShow`）
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

/**
 * 再生を始めた `v` の**最初のコマが実際に描かれたら** `cb` を1回呼ぶ。やめる関数を返す。
 *
 * - `requestVideoFrameCallback` があれば、その合図（コマが描画に渡った瞬間）で。`playing` はまだ
 *   コマを描いていないことがある（「再生が始まった」であって「描いた」ではない）
 *   - 合図が来ない端末のための保険: 再生中に時計が 0 を越えたら（`timeupdate`）、コマは出ている。
 *     poster が透明なので、ここで見せても板は出ない
 * - 無ければ `playing` が来ていて、読めたところ（readyState）が 2 以上なら
 *
 * `opts.playing`: もう `playing` が来たあとに呼ぶとき（JSX の `onPlaying` から）
 */
export function onFirstFrame(v: HTMLVideoElement, cb: () => void, opts: { playing?: boolean } = {}): () => void {
  const el = v as WithRvfc;
  let done = false;
  let played = !!opts.playing;
  let handle: number | null = null;
  const offs: (() => void)[] = [];
  const on = (ev: string, fn: () => void) => {
    if (typeof el.addEventListener !== "function") return;
    el.addEventListener(ev, fn);
    offs.push(() => el.removeEventListener(ev, fn));
  };
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
  };
  const fire = () => {
    if (done) return;
    stop();
    cb();
  };
  if (typeof el.requestVideoFrameCallback === "function") {
    handle = el.requestVideoFrameCallback(() => {
      handle = null;
      fire();
    });
    on("timeupdate", () => {
      if (!el.paused && el.readyState >= 2 && el.currentTime > 0) fire();
    });
    return stop;
  }
  const check = () => {
    if (played && el.readyState >= 2) fire();
  };
  on("playing", () => {
    played = true;
    check();
  });
  on("loadeddata", check);
  on("canplay", check);
  on("timeupdate", check);
  check();
  return stop;
}
