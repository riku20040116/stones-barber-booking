/**
 * 管理画面 / 予約詳細。
 *  - 予約情報・お客様情報・メニュー内訳の閲覧
 *  - ステータス更新 / メモ編集 / キャンセル
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  fetchAdminReservationById,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/admin/reservations";
import { formatHumanJst, formatDateTimeJst } from "@/lib/timezone";
import { ReservationStatusBadge } from "../../../_components/status-badge";
import { ReservationDetailActions } from "./detail-actions";

export const metadata = {
  title: "予約詳細 | 管理画面",
};

type Params = Promise<{ id: string }>;

export default async function AdminReservationDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const reservation = await fetchAdminReservationById(id);
  if (!reservation) notFound();

  const start = new Date(reservation.start_at);
  const end = new Date(reservation.end_at);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin/reservations" />}
        >
          <ArrowLeftIcon /> 一覧へ戻る
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs text-zinc-500">{reservation.code}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {reservation.customer_name} 様の予約
        </h1>
        <p className="text-sm text-zinc-600">{formatHumanJst(start)}</p>
      </header>

      <ReservationDetailActions
        reservationId={reservation.id}
        currentStatus={reservation.status}
        notes={reservation.notes}
        startIso={reservation.start_at}
        endIso={reservation.end_at}
      />

      <Card>
        <CardContent className="space-y-5 py-2">
          <Section label="日時">
            <div className="grid gap-1 text-sm">
              <p>{formatHumanJst(start)} 〜</p>
              <p className="text-zinc-500">
                終了予定: {formatDateTimeJst(end)}
              </p>
            </div>
          </Section>

          <Separator />

          <Section label="お客様">
            <dl className="grid gap-1.5 text-sm">
              <Row label="お名前" value={reservation.customer_name} />
              <Row
                label="メール"
                value={reservation.customer_email}
                href={`mailto:${reservation.customer_email}`}
              />
              <Row
                label="電話"
                value={reservation.customer_phone}
                href={`tel:${reservation.customer_phone}`}
              />
            </dl>
          </Section>

          <Separator />

          <Section label="メニュー">
            <ul className="space-y-1.5 text-sm">
              {reservation.reservation_items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span>{it.name_snapshot}</span>
                  <span className="tabular-nums text-zinc-500">
                    {it.duration_snapshot}分 /{" "}
                    {it.price_snapshot.toLocaleString("ja-JP")}円
                  </span>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-zinc-600">合計</span>
              <span className="font-medium tabular-nums">
                {reservation.total_price.toLocaleString("ja-JP")}円
              </span>
            </div>
          </Section>

          <Separator />

          <Section label="決済">
            <dl className="grid gap-1.5 text-sm">
              <Row
                label="方法"
                value={PAYMENT_METHOD_LABELS[reservation.payment_method]}
              />
              <Row
                label="状況"
                value={PAYMENT_STATUS_LABELS[reservation.payment_status]}
              />
              {reservation.stripe_payment_intent && (
                <Row
                  label="Stripe"
                  value={reservation.stripe_payment_intent}
                />
              )}
            </dl>
          </Section>

          <Separator />

          <Section label="システム情報">
            <dl className="grid gap-1.5 text-xs text-zinc-500">
              <Row label="登録経路" value={reservation.source} />
              <Row
                label="作成"
                value={formatDateTimeJst(new Date(reservation.created_at))}
              />
              <Row
                label="更新"
                value={formatDateTimeJst(new Date(reservation.updated_at))}
              />
            </dl>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-baseline gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-all">
        {href ? (
          <a className="text-zinc-900 hover:underline" href={href}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
