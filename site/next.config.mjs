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
};

export default nextConfig;
