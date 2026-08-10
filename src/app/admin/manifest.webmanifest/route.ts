/**
 * 管理画面用の PWA マニフェスト。
 * スマホの「ホーム画面に追加」でアプリのように開けるようにする。
 * start_url を /admin にしておくことで、起動時に管理ダッシュボードへ。
 */
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      name: "STONE'S BARBER 管理",
      short_name: "STONE'S 管理",
      description: "STONE'S BARBER 予約システムの管理画面",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#18181b",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icons/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
      },
    },
  );
}
