import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "../_components/admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // 管理画面をスマホのホーム画面に「アプリ」として追加できるようにする（PWA）
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "STONE'S 管理",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export const dynamic = "force-dynamic";

export default async function AdminAuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
