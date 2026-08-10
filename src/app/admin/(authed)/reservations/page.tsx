/**
 * 管理画面 / 予約一覧。
 *  - GET クエリ ?from=&to=&status=&q= でフィルタ
 *  - 行クリックで詳細へ
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  fetchAdminReservations,
  RESERVATION_STATUS_OPTIONS,
} from "@/lib/admin/reservations";
import { formatDateJst, formatTimeJst } from "@/lib/timezone";
import type { ReservationStatus } from "@/types/database";
import { ReservationStatusBadge } from "../../_components/status-badge";

export const metadata = {
  title: "予約管理 | 管理画面",
};

const STATUS_VALUES = new Set<ReservationStatus>([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

function isStatus(s: string): s is ReservationStatus {
  return STATUS_VALUES.has(s as ReservationStatus);
}

type SearchParams = Promise<{
  from?: string;
  to?: string;
  status?: string | string[];
  q?: string;
}>;

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const fromStr = typeof params.from === "string" ? params.from : "";
  const toStr = typeof params.to === "string" ? params.to : "";
  const q = typeof params.q === "string" ? params.q : "";
  const statusRaw = Array.isArray(params.status)
    ? params.status
    : params.status
      ? [params.status]
      : [];
  const statuses = statusRaw.filter(isStatus) as ReservationStatus[];

  const fromIso = fromStr
    ? new Date(`${fromStr}T00:00:00+09:00`).toISOString()
    : undefined;
  const toIso = toStr
    ? new Date(`${toStr}T23:59:59+09:00`).toISOString()
    : undefined;

  const reservations = await fetchAdminReservations({
    fromIso,
    toIso,
    statuses: statuses.length > 0 ? statuses : undefined,
    q,
    limit: 1000,
  });

  // 「フィルタ無し」のヒントとして、デフォルトは今日〜+30日を例示するが、ユーザの空指定は尊重
  const hasAnyFilter =
    fromStr.length > 0 ||
    toStr.length > 0 ||
    statuses.length > 0 ||
    q.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            Reservations
          </p>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            予約管理
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            render={<Link href="/admin/reservations/new" />}
          >
            + 手動で予約登録
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={`/admin/reservations?from=${formatDateJst(new Date())}`}
              />
            }
          >
            今日以降
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={(() => {
                  const today = new Date();
                  const yearAgo = new Date(today);
                  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                  return `/admin/reservations?from=${formatDateJst(
                    yearAgo,
                  )}&to=${formatDateJst(today)}`;
                })()}
              />
            }
          >
            過去 1 年
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={(() => {
                  const today = new Date();
                  const monthAgo = new Date(today);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  return `/admin/reservations?from=${formatDateJst(
                    monthAgo,
                  )}&to=${formatDateJst(today)}`;
                })()}
              />
            }
          >
            過去 1 ヶ月
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-3 py-2">
          <FilterForm
            from={fromStr}
            to={toStr}
            q={q}
            statuses={statuses}
            hasAnyFilter={hasAnyFilter}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-700">
              {reservations.length} 件
            </h2>
          </div>
          {reservations.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              該当する予約がありません。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">日付</TableHead>
                  <TableHead className="w-28">時間</TableHead>
                  <TableHead>お名前</TableHead>
                  <TableHead className="hidden md:table-cell">電話</TableHead>
                  <TableHead className="w-24">ステータス</TableHead>
                  <TableHead className="w-24 text-right">金額</TableHead>
                  <TableHead className="hidden w-36 md:table-cell">予約番号</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r) => {
                  const start = new Date(r.start_at);
                  const end = new Date(r.end_at);
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={undefined}
                    >
                      <TableCell>
                        <Link
                          href={`/admin/reservations/${r.id}`}
                          className="block"
                        >
                          {formatDateJst(start)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/reservations/${r.id}`}
                          className="block tabular-nums"
                        >
                          {formatTimeJst(start)}–{formatTimeJst(end)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/reservations/${r.id}`}
                          className="block font-medium"
                        >
                          {r.customer_name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-xs text-zinc-500 md:table-cell">
                        {r.customer_phone}
                      </TableCell>
                      <TableCell>
                        <ReservationStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.total_price.toLocaleString("ja-JP")}円
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-zinc-500 md:table-cell">
                        {r.code}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterForm({
  from,
  to,
  q,
  statuses,
  hasAnyFilter,
}: {
  from: string;
  to: string;
  q: string;
  statuses: ReservationStatus[];
  hasAnyFilter: boolean;
}) {
  return (
    <form
      action={filterAction}
      className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr_auto]"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="from" className="text-xs text-zinc-600">
          開始日
        </Label>
        <Input
          id="from"
          name="from"
          type="date"
          defaultValue={from}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="to" className="text-xs text-zinc-600">
          終了日
        </Label>
        <Input id="to" name="to" type="date" defaultValue={to} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="q" className="text-xs text-zinc-600">
          氏名・電話・メール・予約番号
        </Label>
        <Input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="例: 山田 / 09012345678 / SB-..."
        />
      </div>
      <div className="grid gap-1.5">
        <span className="text-xs text-zinc-600">ステータス</span>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-input bg-transparent px-2 py-1.5 text-xs">
          {RESERVATION_STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                name="status"
                value={opt.value}
                defaultChecked={statuses.includes(opt.value)}
                className="size-3.5 accent-zinc-900"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
        {hasAnyFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            render={<Link href="/admin/reservations" />}
          >
            クリア
          </Button>
        )}
        <Button type="submit" size="sm">
          検索
        </Button>
      </div>
    </form>
  );
}

async function filterAction(formData: FormData) {
  "use server";
  const sp = new URLSearchParams();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const q = String(formData.get("q") ?? "").trim();
  const statuses = formData
    .getAll("status")
    .map((v) => String(v))
    .filter(isStatus);

  if (from) sp.set("from", from);
  if (to) sp.set("to", to);
  if (q) sp.set("q", q);
  for (const s of statuses) sp.append("status", s);

  const qs = sp.toString();
  redirect(qs ? `/admin/reservations?${qs}` : "/admin/reservations");
}
