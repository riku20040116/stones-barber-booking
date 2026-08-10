/**
 * 予約アプリのトップページ。
 *
 * 紹介サイト（stonesbarber.com）とは役割を分け、ここは「予約するための入口」だけを置く。
 *  1) Web予約を始める
 *  2) 予約の確認・キャンセル
 *  3) 営業日カレンダー（定休日・臨時休業をひと目で）
 *  4) 管理者画面への遷移
 */
import Link from "next/link";
import {
  CalendarCheckIcon,
  ClockIcon,
  PhoneIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthlyCalendar } from "@/components/public/monthly-calendar";
import { STORE } from "@/lib/constants";
import { formatPhoneForLink } from "@/lib/format";
import { fetchHolidayOverridesInRange } from "@/lib/reservation/queries";
import { dateStringAfterDays, todayJstStart } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 当月＋翌月の臨時休業を取得してカレンダーに反映する。
  const today = todayJstStart();
  const overrides = await fetchHolidayOverridesInRange(
    dateStringAfterDays(today, 0),
    dateStringAfterDays(today, 70),
  );

  return (
    <>
      {/* ── ヒーロー：予約導線だけを大きく置く ───────────────────────── */}
      <section className="border-b border-border bg-zinc-950 text-zinc-100">
        <div className="container mx-auto max-w-3xl px-4 py-16 text-center md:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
            Online Booking
          </p>
          <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight md:text-5xl">
            {STORE.name}
            <span className="mt-2 block text-xl font-semibold text-zinc-300 md:text-2xl">
              Web予約
            </span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-zinc-400 md:text-base">
            24時間いつでもご予約いただけます。
            <br className="hidden sm:block" />
            空いている時間から選んで、最短1分で完了します。
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="h-14 w-full bg-white px-10 text-base font-bold text-zinc-950 hover:bg-zinc-200 hover:text-zinc-950 sm:w-auto [a]:hover:bg-zinc-200 [a]:hover:text-zinc-950"
              render={<Link href="/reservations/new" />}
            >
              <CalendarCheckIcon className="size-5" />
              予約する
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 w-full border-zinc-600 bg-transparent px-8 text-base font-semibold text-zinc-100 hover:bg-zinc-800 hover:text-white sm:w-auto [a]:hover:bg-zinc-800 [a]:hover:text-white"
              render={<Link href="/reservations/lookup" />}
            >
              <SearchCheckIcon className="size-5" />
              予約の確認・キャンセル
            </Button>
          </div>

          <p className="mt-6 text-xs text-zinc-500">
            予約番号をお忘れの方は、予約時のお電話番号でも照会できます。
          </p>
        </div>
      </section>

      {/* ── 営業時間 / 電話 ─────────────────────────────────────────── */}
      <section className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <ClockIcon className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">営業時間</h2>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">火〜金</dt>
                  <dd className="font-medium tabular-nums">
                    {STORE.hours.weekday.open} 〜 {STORE.hours.weekday.close}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">土・日・祝</dt>
                  <dd className="font-medium tabular-nums">
                    {STORE.hours.weekend.open} 〜 {STORE.hours.weekend.close}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-2">
                  <dt className="text-muted-foreground">定休日</dt>
                  <dd className="text-right font-medium">
                    {STORE.closures.weekly}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {STORE.closures.monthly}
                    </span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <PhoneIcon className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">お電話でのご予約</h2>
              </div>
              <a
                href={formatPhoneForLink(STORE.phone.tel)}
                className="block font-heading text-2xl font-bold tracking-tight underline-offset-4 hover:underline"
              >
                {STORE.phone.display}
              </a>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {STORE.notes.soloOperator}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 営業日カレンダー ───────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30">
        <div className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
          <div className="mb-6 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              営業日カレンダー
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              グレーの日はお休みです。臨時休業もこちらに反映されます。
            </p>
          </div>
          <MonthlyCalendar overrides={overrides} />
          <div className="mt-8 text-center">
            <Button
              size="lg"
              className="h-12 px-8 text-base font-bold"
              render={<Link href="/reservations/new" />}
            >
              <CalendarCheckIcon className="size-5" />
              空き時間を見て予約する
            </Button>
          </div>
        </div>
      </section>

      {/* ── 管理者導線 ─────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="container mx-auto max-w-4xl px-4 py-10">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-2 text-center sm:flex-row sm:justify-between sm:text-left">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">店舗スタッフの方へ</p>
                  <p className="text-xs text-muted-foreground">
                    予約の確認・変更・休業日の設定は管理者画面から行えます。
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full shrink-0 px-6 font-bold sm:w-auto"
                render={<Link href="/admin" />}
              >
                管理者画面へ
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
