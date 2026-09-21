import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // メニュー画像に外部 URL（画像 CDN 等）を使えるように許可する。
    // 自前の /public 配下の画像はこの設定に関係なく使える。
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      // 手書き予約表の写真を Server Action で受け取るため、既定の 1MB から広げる。
      // 画面側で長辺 2576px の JPEG に縮めてから送るので、2 枚でも 5MB 程度に収まる。
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
