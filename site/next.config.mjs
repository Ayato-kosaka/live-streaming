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
  // 並列で何人も dev サーバを立てていると、Next が tsconfig.json の include を
  // 書き換え合って、消えた型ファイルを掴んだままビルドが落ちる。
  // 型は別に `npx tsc --noEmit` で見ているので、そのときだけ逃がせるようにする。
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TS === "1" },
};

export default nextConfig;
