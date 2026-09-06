import React, { useEffect, useRef } from "react";

type VideoCanvasRendererProps = {
  src: string;
  style: React.CSSProperties;
  onError: (reason: Record<string, unknown>) => void;
  onLoadStart: () => void;
  onLoadedMetadata: (meta: {
    duration: number;
    readyState: number;
    networkState: number;
  }) => void;
  onCanPlay: (meta: { readyState: number; networkState: number }) => void;
  onPlaying: () => void;
  onEnded: (meta: { duration: number }) => void;
};

export function VideoCanvasRenderer({
  src,
  style,
  onError,
  onLoadStart,
  onLoadedMetadata,
  onCanPlay,
  onPlaying,
  onEnded,
}: VideoCanvasRendererProps) {
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const video = hiddenVideoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) {
      onError({ reason: "missingCanvasContext" });
      return;
    }

    let ended = false;
    let hasRenderedFrame = false;
    let rafId = 0;
    let rvfcId = 0;

    const syncCanvasSize = () => {
      const width = video.videoWidth || canvas.clientWidth || 1;
      const height = video.videoHeight || canvas.clientHeight || 1;

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };

    const drawFrame = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      syncCanvasSize();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      hasRenderedFrame = true;
    };

    const startRafLoop = () => {
      const loop = () => {
        drawFrame();
        if (!ended) {
          rafId = window.requestAnimationFrame(loop);
        }
      };

      rafId = window.requestAnimationFrame(loop);
    };

    const startRvfcLoop = () => {
      if (!video.requestVideoFrameCallback) {
        startRafLoop();
        return;
      }

      const loop = () => {
        drawFrame();
        if (!ended) {
          rvfcId = video.requestVideoFrameCallback(loop);
        }
      };

      rvfcId = video.requestVideoFrameCallback(loop);
    };

    const renderTimeoutId = window.setTimeout(() => {
      if (!hasRenderedFrame) {
        onError({ reason: "renderStartTimeout", readyState: video.readyState });
      }
    }, 3000);

    const handleLoadedMetadata = () => {
      syncCanvasSize();
      onLoadedMetadata({
        duration: video.duration,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    const handleCanPlay = () => {
      onCanPlay({
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    const handlePlaying = () => {
      onPlaying();
      startRvfcLoop();
    };

    const handleEnded = () => {
      ended = true;
      drawFrame();
      onEnded({ duration: video.duration });
    };

    const handleError = () => {
      ended = true;
      const mediaError = video.error;
      onError({
        reason: "videoError",
        code: mediaError?.code,
        message: mediaError?.message,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    onLoadStart();

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => {
        ended = true;
        onError({
          reason: "playRejected",
          message: error instanceof Error ? error.message : String(error),
          name:
            typeof error === "object" && error && "name" in error
              ? String((error as { name?: string }).name)
              : undefined,
        });
      });
    }

    return () => {
      ended = true;
      window.clearTimeout(renderTimeoutId);
      window.cancelAnimationFrame(rafId);

      if (video.cancelVideoFrameCallback && rvfcId) {
        video.cancelVideoFrameCallback(rvfcId);
      }

      video.pause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, [onCanPlay, onEnded, onError, onLoadStart, onLoadedMetadata, onPlaying, src]);

  return (
    <>
      <video
        ref={hiddenVideoRef}
        autoPlay
        controls={false}
        loop={false}
        muted
        playsInline
        preload="auto"
        src={src}
        style={{ display: "none" }}
      />
      <canvas ref={canvasRef} style={style} />
    </>
  );
}
