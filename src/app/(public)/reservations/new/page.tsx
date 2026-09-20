import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  fetchActiveMenus,
  fetchHolidayOverridesInRange,
} from "@/lib/reservation/queries";
import { dateStringAfterDays, todayJstStart } from "@/lib/timezone";
import { ReservationWizard } from "./reservation-wizard";

export const metadata = {
  title: "Web予約",
  description: "STONE'S BARBER のWeb予約フォーム。",
};

export const dynamic = "force-dynamic";

export default async function NewReservationPage() {
  // 表は週単位で動的取得するが、月別カレンダー（当月＋3 ヶ月）に休業日を
  // 描画するため、休業日例外も先読みしてクライアントに渡す。
  const today = todayJstStart();
  const fromDateStr = dateStringAfterDays(today, 0);
  // 3 ヶ月先まで予約できるうえ、カレンダーはその月の月末まで描画するので、
  // 余裕を見て 130 日分の休業日を先読みする。
  const toDateStr = dateStringAfterDays(today, 130);

  const [menus, overrides] = await Promise.all([
    fetchActiveMenus(),
    fetchHolidayOverridesInRange(fromDateStr, toDateStr),
  ]);

  if (menus.length === 0) {
    return (
      <section className="container mx-auto max-w-3xl px-4 py-20">
        <p className="text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
          Reservation
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight md:text-5xl">
          Web予約
        </h1>
        <p className="mt-6 text-muted-foreground">
          現在、メニュー情報を取得できませんでした。
          <br />
          お手数ですが、お電話にてお問い合わせください。
        </p>
        <div className="mt-8">
          <Button render={<Link href="/" />} variant="outline">
            トップに戻る
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
      <p className="text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
        Reservation
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight md:text-4xl">
        Web予約
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        メニュー → 日時 → お客様情報 → 確認 の順にお進みください。
      </p>
      <div className="mt-10">
        <ReservationWizard menus={menus} overrides={overrides} />
      </div>
    </section>
  );
}
