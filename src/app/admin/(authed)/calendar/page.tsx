/**
 * 管理画面 / 予約カレンダー。
 *  - 月単位のグリッドで各日の予約件数と代表的なお名前を表示
 *  - 日付クリックでその日の予約詳細リストへ
 *  - 前月 / 翌月への切替リンク付き
 */
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminReservations,
  RESERVATION_STATUS_LABELS,
} from "@/lib/admin/reservations";
import { formatDateJst, formatTimeJst, getDowJst } from "@/lib/timezone";
import { effectiveDayCalendar } from "@/lib/calendar";
import { fetchHolidayOverridesInRange } from "@/lib/reservation/queries";

export const metadata = {
  title: "予約カレンダー | 管理画面",
};

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function clampMonth(m: number): { year: number; month: number } {
  // m: month index since year 0
  const year = Math.floor(m / 12);
  const month = (m % 12) + 1;
  return { year, month };
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

type SearchParams = Promise<{ y?: string; m?: string }>;

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const now = new Date();
  const todayStr = formatDateJst(now);
  const todayParts = todayStr.split("-").map(Number);
  const todayYear = todayParts[0] as number;
  const todayMonth = todayParts[1] as number;

  const year = params.y && /^\d{4}$/.test(params.y)
    ? Number(params.y)
    : todayYear;
  const month = params.m && /^\d{1,2}$/.test(params.m)
    ? Math.max(1, Math.min(12, Number(params.m)))
    : todayMonth;

  // 月の最初・最後（JST）
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = daysInMonth(year, month);
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    lastDay,
  ).padStart(2, "0")}`;
  const fromIso = new Date(`${monthStart}T00:00:00+09:00`).toISOString();
  const toIso = new Date(`${monthEnd}T23:59:59+09:00`).toISOString();

  const [reservations, overrides] = await Promise.all([
    fetchAdminReservations({ fromIso, toIso, limit: 1000 }),
    fetchHolidayOverridesInRange(monthStart, monthEnd),
  ]);

  // 日別にグルーピング
  const byDate = new Map<
    string,
    Array<{
      id: string;
      time: string;
      name: string;
      status: keyof typeof RESERVATION_STATUS_LABELS;
    }>
  >();
  for (const r of reservations) {
    const dateStr = formatDateJst(new Date(r.start_at));
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr)!.push({
      id: r.id,
      time: formatTimeJst(new Date(r.start_at)),
      name: r.customer_name,
      status: r.status,
    });
  }

  // 月のセル配列（先頭の空欄 + 1..lastDay、6行=42セルにパディング）
  const firstDow = getDowJst(new Date(`${monthStart}T12:00:00+09:00`));
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length < 42) cells.push(null);

  // 前後月
  const idx = monthIndex(year, month);
  const prev = clampMonth(idx - 1);
  const next = clampMonth(idx + 1);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            Calendar
          </p>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            予約カレンダー
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={`/admin/calendar?y=${prev.year}&m=${prev.month}`} />
            }
          >
            <ChevronLeftIcon className="size-4" />
            前月
          </Button>
          <p className="min-w-[8em] text-center font-heading text-lg font-bold tabular-nums">
            {year} 年 {month} 月
          </p>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={`/admin/calendar?y=${next.year}&m=${next.month}`} />
            }
          >
            翌月
            <ChevronRightIcon className="size-4" />
          </Button>
          {(year !== todayYear || month !== todayMonth) && (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/admin/calendar" />}
            >
              今月へ
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium">
            {DOW_LABELS.map((label, i) => (
              <div
                key={label}
                className={
                  "py-2 " +
                  (i === 0
                    ? "text-rose-600"
                    : i === 6
                      ? "text-sky-600"
                      : "text-foreground")
                }
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {cells.map((dateStr, i) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="aspect-square bg-muted/20 md:aspect-auto md:min-h-32"
                  />
                );
              }
              const cal = effectiveDayCalendar(dateStr, overrides);
              const dow = getDowJst(new Date(`${dateStr}T12:00:00+09:00`));
              const isToday = dateStr === todayStr;
              const day = Number(dateStr.slice(-2));
              const items = byDate.get(dateStr) ?? [];
              const activeCount = items.filter(
                (r) => r.status === "pending" || r.status === "confirmed",
              ).length;
              const cancelledCount = items.filter(
                (r) => r.status === "cancelled" || r.status === "no_show",
              ).length;
              return (
                <Link
                  key={dateStr}
                  href={`/admin/reservations?from=${dateStr}&to=${dateStr}`}
                  className={
                    "block min-h-24 bg-background p-1.5 transition-colors hover:bg-muted/30 md:min-h-32 " +
                    (!cal.isOpen
                      ? "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30"
                      : "")
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={
                        "text-xs font-semibold tabular-nums " +
                        (isToday
                          ? "rounded-full bg-primary px-1.5 text-primary-foreground"
                          : !cal.isOpen
                            ? "text-rose-700 dark:text-rose-300"
                            : dow === 0
                              ? "text-rose-600"
                              : dow === 6
                                ? "text-sky-600"
                                : "text-foreground")
                      }
                    >
                      {day}
                    </span>
                    {activeCount > 0 && (
                      <span className="rounded bg-foreground/10 px-1 text-[10px] font-bold tabular-nums">
                        {activeCount}件
                      </span>
                    )}
                  </div>
                  {!cal.isOpen && (
                    <p className="mt-1 text-[10px] text-rose-700 dark:text-rose-300">
                      {cal.reason ?? "定休"}
                    </p>
                  )}
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    {items
                      .filter(
                        (r) =>
                          r.status === "pending" || r.status === "confirmed",
                      )
                      .slice(0, 3)
                      .map((r) => (
                        <li key={r.id} className="truncate">
                          <span className="tabular-nums text-muted-foreground">
                            {r.time}
                          </span>{" "}
                          {r.name}
                        </li>
                      ))}
                    {activeCount > 3 && (
                      <li className="text-[10px] text-muted-foreground">
                        他 {activeCount - 3} 件
                      </li>
                    )}
                    {cancelledCount > 0 && (
                      <li className="text-[10px] text-zinc-400 line-through">
                        キャンセル {cancelledCount} 件
                      </li>
                    )}
                  </ul>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ul className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-background ring-1 ring-border" />
          営業日
        </li>
        <li className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-950/30" />
          定休・臨時休業
        </li>
        <li className="flex items-center gap-1">
          <span className="rounded bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            日
          </span>
          今日
        </li>
        <li className="flex items-center gap-1">
          <span className="rounded bg-foreground/10 px-1 text-[10px] font-bold">
            N件
          </span>
          アクティブ予約件数
        </li>
      </ul>
    </div>
  );
}
