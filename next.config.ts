import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // メニュー画像に外部 URL（画像 CDN 等）を使えるように許可する。
    // 自前の /public 配下の画像はこの設定に関係なく使える。
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
