/**
 * Stripe Checkout 成功時のランディングページ。
 *  - Webhook 受信前に到達する可能性があるため、ステータスはあくまで参考表示。
 *  - 詳細は予約照会ページから code + email で確認してもらう。
 */
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata = {
  title: "ご決済ありがとうございました",
  description: "Web予約の事前決済が完了しました。",
};

export const dynamic = "force-dynamic";

export default async function PaidPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const safeCode = code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);

  return (
    <section className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
      <div className="flex flex-col items-center text-center">
        <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2Icon className="size-10" />
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
          Payment
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight md:text-4xl">
          ご決済ありがとうございました
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          オンライン事前決済を受け付けました。
          <br />
          ご予約の詳細は、お送りしたメールおよび予約照会ページからご確認いただけます。
        </p>

        {safeCode && (
          <div className="mt-8 w-full rounded-lg border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              予約番号
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-widest">
              {safeCode}
            </p>
          </div>
        )}

        <Alert className="mt-6 text-left">
          <AlertDescription>
            ご決済のステータス反映には数十秒かかる場合があります。
            予約照会ページに即時反映されない場合は、少し時間をおいてから再度ご確認ください。
          </AlertDescription>
        </Alert>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button render={<Link href="/reservations/lookup" />}>
            予約照会へ
          </Button>
          <Button render={<Link href="/" />} variant="outline">
            トップへ
          </Button>
        </div>
      </div>
    </section>
  );
}
