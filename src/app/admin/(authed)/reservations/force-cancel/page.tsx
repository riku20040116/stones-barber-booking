/**
 * 管理画面 / 強制キャンセル。
 *  - お客様から電話を受けた管理者が、期限を超えていても予約を取り消せる窓口
 *  - 検索 → 該当予約 → キャンセル の 1 画面フロー
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { fetchAdminReservations } from "@/lib/admin/reservations";
import { formatDateTimeJst } from "@/lib/timezone";
import { ReservationStatusBadge } from "../../../_components/status-badge";
import { ForceCancelButton } from "./force-cancel-button";

export const metadata = {
  title: "強制キャンセル | 管理画面",
};

type SearchParams = Promise<{ q?: string }>;

export default async function AdminForceCancelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  // 今日以降のアクティブな予約のみを対象に検索
  const todayIso = new Date(
    new Date().setHours(0, 0, 0, 0),
  ).toISOString();
  const reservations = q
    ? await fetchAdminReservations({
        fromIso: todayIso,
        statuses: ["pending", "confirmed"],
        q,
        limit: 50,
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Force Cancel
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          強制キャンセル
        </h1>
        <p className="text-sm text-zinc-600">
          Webキャンセル期限（予約日の7日前）を過ぎたお客様から電話を受けた際、
          管理者の判断でキャンセル処理を行う窓口です。
          通常の取消は予約詳細ページからも可能です。
        </p>
      </header>

      <Alert>
        <AlertDescription className="text-xs">
          キャンセル実行と同時に、お客様にもキャンセル受付メールが送信されます。
          理由がある場合は備考欄に簡潔に記録してください。
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-3 py-3">
          <form action={searchAction} className="flex flex-wrap items-end gap-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="q" className="text-xs text-zinc-600">
                氏名・電話・メール・予約番号で検索
              </Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="例: 山田 / 09012345678 / SB-..."
              />
            </div>
            <div className="flex items-center gap-2">
              {q && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  render={
                    <Link href="/admin/reservations/force-cancel" />
                  }
                >
                  クリア
                </Button>
              )}
              <Button type="submit" size="sm">
                検索
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-2">
          {!q && (
            <p className="py-8 text-center text-sm text-zinc-500">
              検索キーワードを入力してください。
            </p>
          )}
          {q && reservations.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              該当する有効な予約がありません。
              （対象は今日以降の受付中・確定済みの予約のみです）
            </p>
          )}
          {q && reservations.length > 0 && (
            <ul className="divide-y divide-zinc-100">
              {reservations.map((r) => (
                <li key={r.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {r.customer_name} 様
                      </p>
                      <p className="text-xs text-zinc-500">
                        {r.customer_email} ／ {r.customer_phone}
                      </p>
                    </div>
                    <ReservationStatusBadge status={r.status} />
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="text-zinc-500">日時:</span>
                    <span className="font-medium">
                      {formatDateTimeJst(new Date(r.start_at))}
                    </span>
                    <span className="text-zinc-500">合計:</span>
                    <span className="tabular-nums">
                      {r.total_price.toLocaleString("ja-JP")}円
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {r.code}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/admin/reservations/${r.id}`}
                      className="text-xs text-zinc-600 underline-offset-2 hover:underline"
                    >
                      予約詳細を開く →
                    </Link>
                    <ForceCancelButton id={r.id} customerName={r.customer_name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function searchAction(formData: FormData) {
  "use server";
  const q = String(formData.get("q") ?? "").trim();
  redirect(
    q
      ? `/admin/reservations/force-cancel?q=${encodeURIComponent(q)}`
      : "/admin/reservations/force-cancel",
  );
}
