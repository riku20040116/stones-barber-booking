/**
 * 管理画面トップ（ダッシュボード）。
 *  - 今日の予約サマリ
 *  - 今週の予約数 / 未対応 (pending) 件数
 *  - 今日の予約リスト
 */
import Link from "next/link";
import {
  CalendarDaysIcon,
  ClockIcon,
  ArrowRightIcon,
  ListChecksIcon,
  CircleDollarSignIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  fetchAdminDashboardStats,
  fetchAdminReservations,
} from "@/lib/admin/reservations";
import { formatDateJst, formatTimeJst } from "@/lib/timezone";
import { requireAdmin } from "@/lib/auth/admin";
import { ReservationStatusBadge } from "../_components/status-badge";

export const metadata = {
  title: "ダッシュボード | 管理画面",
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const now = new Date();
  const todayStr = formatDateJst(now);
  const todayStartIso = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
  const todayEndIso = new Date(`${todayStr}T23:59:59+09:00`).toISOString();

  const [stats, todayReservations] = await Promise.all([
    fetchAdminDashboardStats(now),
    fetchAdminReservations({
      fromIso: todayStartIso,
      toIso: todayEndIso,
      statuses: ["pending", "confirmed", "completed"],
      limit: 50,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Dashboard
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          おかえりなさい、{admin.name ?? admin.email} さん
        </h1>
        <p className="text-sm text-zinc-600">
          今日 ({todayStr}) の状況をまとめています。
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          icon={<CalendarDaysIcon className="size-5" />}
          label="今日の予約"
          value={stats.todayCount}
          unit="件"
        />
        <StatCard
          icon={<CircleDollarSignIcon className="size-5" />}
          label="今日の売上見込み"
          value={stats.todayRevenue.toLocaleString("ja-JP")}
          unit="円"
        />
        <StatCard
          icon={<ClockIcon className="size-5" />}
          label="今日の未対応"
          value={stats.todayPending}
          unit="件"
          accent={stats.todayPending > 0}
        />
        <StatCard
          icon={<ListChecksIcon className="size-5" />}
          label="今週の予約"
          value={stats.weekCount}
          unit="件"
        />
        <StatCard
          icon={<ClockIcon className="size-5" />}
          label="受付中（全期間）"
          value={stats.pendingCount}
          unit="件"
          accent={stats.pendingCount > 0}
        />
      </section>

      <Card>
        <CardContent className="space-y-3 py-2">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-medium">
              本日の予約 ({todayReservations.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link
                  href={`/admin/reservations?from=${todayStr}&to=${todayStr}`}
                />
              }
            >
              一覧へ <ArrowRightIcon />
            </Button>
          </div>
          <Separator />
          {todayReservations.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              本日の予約はありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {todayReservations.map((r) => {
                const start = new Date(r.start_at);
                const end = new Date(r.end_at);
                return (
                  <li key={r.id} className="py-2.5">
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-50"
                    >
                      <span className="w-24 font-mono text-sm tabular-nums">
                        {formatTimeJst(start)}–{formatTimeJst(end)}
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {r.customer_name}
                      </span>
                      <span className="hidden text-xs text-zinc-500 md:inline">
                        {r.customer_phone}
                      </span>
                      <ReservationStatusBadge status={r.status} />
                      <span className="font-mono text-xs text-zinc-400">
                        {r.code}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          {icon}
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={
              accent
                ? "font-heading text-2xl font-bold text-amber-600"
                : "font-heading text-2xl font-bold tabular-nums"
            }
          >
            {value}
          </span>
          <span className="text-sm text-zinc-500">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
