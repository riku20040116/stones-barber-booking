/**
 * 管理画面 / 顧客の詳細（連絡先の編集・予約の履歴）。
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchCustomer, fetchCustomerReservations } from "@/lib/admin/customers";
import { formatDateJst, formatTimeJst } from "@/lib/timezone";
import { ReservationStatusBadge } from "../../../_components/status-badge";
import { CustomerForm } from "../customer-form";

export const metadata = {
  title: "顧客の詳細 | 管理画面",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Web予約",
  phone: "電話",
  walkin: "来店",
  handwritten: "手書き",
  admin: "管理画面",
};

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await fetchCustomer(id);
  if (!customer) notFound();
  const reservations = await fetchCustomerReservations(id);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/customers" />}>
          <ArrowLeftIcon /> 顧客リストへ戻る
        </Button>
      </div>

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">Customer</p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">{customer.name} 様</h1>
        <p className="text-sm text-zinc-600">
          来店 {customer.visit_count} 回 ／ 登録元: {SOURCE_LABEL[customer.source] ?? customer.source}
        </p>
      </header>

      <Card>
        <CardContent className="py-2">
          <CustomerForm
            initial={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              notes: customer.notes ?? "",
            }}
          />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700">ご予約の履歴</h2>
        {reservations.length === 0 ? (
          <p className="text-sm text-zinc-500">ご予約はまだありません。</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-zinc-100 text-sm">
                {reservations.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-zinc-50"
                    >
                      <span className="tabular-nums font-medium">
                        {formatDateJst(new Date(r.start_at))} {formatTimeJst(new Date(r.start_at))}
                      </span>
                      <ReservationStatusBadge status={r.status} />
                      <Badge variant="outline">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
                      <span className="text-zinc-600">{r.items.join(" + ") || "（メニュー未設定）"}</span>
                      <span className="ml-auto tabular-nums text-zinc-700">
                        {r.total_price.toLocaleString()}円
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
