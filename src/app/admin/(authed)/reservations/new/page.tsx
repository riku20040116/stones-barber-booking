/**
 * 管理画面 / 手動予約登録ページ。
 * 電話・来店で受けた予約を管理者が記帳する。
 */
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchAllMenus } from "@/lib/admin/menus";
import { ManualReservationForm } from "./manual-form";

export const metadata = {
  title: "手動予約登録 | 管理画面",
};

export default async function AdminNewReservationPage() {
  const menus = (await fetchAllMenus()).filter((m) => m.is_active);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin/reservations" />}
        >
          <ArrowLeftIcon /> 予約一覧へ戻る
        </Button>
      </div>

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Manual Booking
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          手動予約登録
        </h1>
        <p className="text-sm text-zinc-600">
          電話やご来店で受けたご予約をこちらから登録できます。
          メニューを選ぶと所要時間・金額が自動計算されます（手動でも上書き可能）。
        </p>
      </header>

      <ManualReservationForm
        menus={menus.map((m) => ({
          id: m.id,
          name: m.name,
          price: m.price,
          duration_min: m.duration_min,
          is_option: m.is_option,
        }))}
      />
    </div>
  );
}
