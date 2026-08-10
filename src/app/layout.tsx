import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Shippori_Mincho_B1, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { STORE } from "@/lib/constants";
import "./globals.css";

const sans = Noto_Sans_JP({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

const heading = Shippori_Mincho_B1({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100",
  ),
  title: {
    default: `${STORE.name} Web予約`,
    // 各ページが "Web予約" などを名乗るので、テンプレートには店名だけを足す。
    // ここに "Web予約" を入れると「Web予約 | STONE'S BARBER Web予約」と重複する。
    template: `%s | ${STORE.name}`,
  },
  description: `${STORE.name}（福岡市東区若宮）のWeb予約ページ。24時間いつでも空き時間を確認してご予約いただけます。`,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: `${STORE.name} Web予約`,
    title: `${STORE.name} Web予約`,
    description: "24時間いつでもご予約いただけます。",
  },
  // 予約専用アプリなので検索エンジンには載せない（入口は紹介サイト側から）。
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${sans.variable} ${heading.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
