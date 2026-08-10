"use client";
/**
 * 予約アプリ共通ヘッダー。
 *  - ナビは予約に関係する導線のみ。
 *  - 予約フロー中（/reservations/new）は「予約する」ボタンを隠す（二重導線を避ける）。
 *  - 管理者画面への遷移ボタンを常に置く。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STORE } from "@/lib/constants";

export function SiteHeader() {
  const pathname = usePathname() ?? "";
  // Web 予約フロー中は「予約する」ボタンを隠す。
  // ただし /reservations/lookup（予約照会）は通常導線として残すので表示。
  const hideReservationCta =
    pathname.startsWith("/reservations/new") ||
    /^\/reservations\/[^/]+\/(pay|paid)/.test(pathname);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-heading text-base font-bold tracking-tight sm:text-lg"
          aria-label={`${STORE.name} Web予約 ホーム`}
        >
          <span className="inline-block size-2 shrink-0 rounded-full bg-foreground" />
          <span className="truncate">{STORE.name}</span>
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            Web予約
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden font-medium sm:inline-flex"
            render={<Link href="/reservations/lookup" />}
          >
            予約確認
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-semibold"
            render={<Link href="/admin" />}
            aria-label="管理者画面へ"
          >
            <ShieldCheckIcon className="size-4" />
            <span className="hidden sm:inline">管理者画面</span>
            <span className="sm:hidden">管理</span>
          </Button>
          {!hideReservationCta && (
            <Button
              size="sm"
              className="font-bold"
              render={<Link href="/reservations/new" />}
            >
              予約する
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
