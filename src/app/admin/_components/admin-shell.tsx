"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  CalendarIcon,
  ExternalLinkIcon,
  GaugeIcon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  Settings2Icon,
  SquareMenuIcon,
  XCircleIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOutAdmin } from "../login/actions";
import type { AdminProfile } from "@/lib/auth/admin";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

/**
 * ナビは「Web予約画面に関係するもの」だけに絞っている。
 *   予約管理 / カレンダー / 休業日 / メニュー = 予約画面に出る内容を決める4つ。
 * 顧客管理・店舗情報など予約画面に出ないものはこのアプリには置かない。
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "ダッシュボード", icon: GaugeIcon, exact: true },
  { href: "/admin/reservations", label: "予約管理", icon: ListChecksIcon },
  { href: "/admin/calendar", label: "カレンダー", icon: CalendarIcon },
  {
    href: "/admin/reservations/force-cancel",
    label: "強制キャンセル",
    icon: XCircleIcon,
  },
  { href: "/admin/menus", label: "メニュー", icon: SquareMenuIcon },
  { href: "/admin/holidays", label: "休業日", icon: CalendarDaysIcon },
  { href: "/admin/settings", label: "営業設定", icon: Settings2Icon },
];

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminProfile;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* デスクトップサイドバー */}
      <aside className="hidden w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 md:flex md:flex-col">
        <SidebarBrand />
        <NavList />
        <SidebarFooter admin={admin} />
      </aside>

      {/* モバイル: トップバー */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="メニュー" />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 border-zinc-800 bg-zinc-950 text-zinc-100"
            >
              <SheetHeader>
                <SheetTitle className="text-zinc-100">
                  STONE&apos;S BARBER Admin
                </SheetTitle>
              </SheetHeader>
              <NavList className="px-2" />
              <SidebarFooter admin={admin} />
            </SheetContent>
          </Sheet>
          <span className="font-heading text-sm font-bold tracking-tight">
            STONE&apos;S Admin
          </span>
          <form action={signOutAdmin}>
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="ログアウト"
            >
              <LogOutIcon />
            </Button>
          </form>
        </header>

        <main className="flex-1 bg-zinc-100 text-zinc-900 dark:bg-zinc-100">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 shrink-0 items-center px-4">
      <p className="font-heading text-base font-bold tracking-tight">
        STONE&apos;S BARBER
      </p>
    </div>
  );
}

function NavList({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex-1 space-y-0.5 px-2 py-2", className)}>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-zinc-800 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}

      {/* お客様が見る予約画面に戻る導線 */}
      <Link
        href="/"
        className="mt-3 flex items-center gap-2 rounded-md border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
      >
        <ExternalLinkIcon className="size-4" />
        Web予約画面を見る
      </Link>
    </nav>
  );
}

function SidebarFooter({ admin }: { admin: AdminProfile }) {
  return (
    <div className="mt-auto border-t border-zinc-800 p-3">
      <div className="mb-2 px-1 text-xs text-zinc-500">
        <p className="truncate text-zinc-300">{admin.name ?? admin.email}</p>
        <p className="truncate">{admin.email}</p>
      </div>
      <form action={signOutAdmin}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-zinc-300 hover:text-zinc-50"
        >
          <LogOutIcon />
          ログアウト
        </Button>
      </form>
    </div>
  );
}
