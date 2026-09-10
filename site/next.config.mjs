import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
  // 開発サーバを動かしたまま書き出しを確かめたいときは、
  //   NEXT_DIST_DIR=.next-verify npm run build
  // とすると .next を壊さずに済む。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // リポジトリ直下にも package-lock.json があるので、Next が作業の根を
  // 取り違えて警告を出す。ここを site に固定して、書き出しの追跡を
  // この中だけで完結させる。
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // 並列で何人も dev サーバを立てていると、Next が tsconfig.json の include を
  // 書き換え合って、消えた型ファイルを掴んだままビルドが落ちる。
  // 型は別に `npx tsc --noEmit` で見ているので、そのときだけ逃がせるようにする。
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TS === "1" },
  /* 書き出した時刻。**焼いた HTML が「いつの答えか」を持たせるため。**
     `output: "export"` なので、企画が終わったかどうかは焼いた時点の答えしか
     持てない。持たせずに「全部これから」で焼くと、**去年終わった企画まで
     ずっと「これからの企画」に並ぶ**（あやと 2026-09-10。9月6日に終わった
     フード＆ワイン祭りが、9月10日の HTML でもそう並んでいた）。
     ここで埋めた値はサーバ側とブラウザ側の両方に**同じ文字**で入るので、
     最初の1枚がずれない。画面が出たあとは、本物の今日で数え直す。

     **外から渡せるようにしてある。** 焼いた答えと今日の答えがずれる日を作らないと、
     水あわせが落ちているかどうかを**差し込み無しの本物の時計で**確かめられない
     （時計を差し込むと、差し込みそのものが原因のずれと見分けがつかない。
     `docs/island-standards.md` 13／`docs/island-misses.md` #30）。
       NEXT_PUBLIC_BUILT_AT=2026-09-25T00:00:00Z NEXT_DIST_DIR=.next-x npx next build */
  env: { NEXT_PUBLIC_BUILT_AT: process.env.NEXT_PUBLIC_BUILT_AT || new Date().toISOString() },
};

export default nextConfig;
