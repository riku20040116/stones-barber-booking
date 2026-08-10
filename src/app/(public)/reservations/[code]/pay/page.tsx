/**
 * Stripe Checkout キャンセル時の戻り先 / 事前決済の再試行ページ。
 *  - cancel_url=...?cancelled=1 で到達した場合は警告を表示。
 *  - 事前決済の再開には予約番号 + メールが必要なため、照会ページへ誘導する。
 */
import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata = {
  title: "決済のお手続き",
  description: "Web予約の事前決済ページです。",
};

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const cancelled = sp.cancelled === "1";
  const safeCode = code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);

  return (
    <section className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
      <p className="text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
        Payment
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight md:text-4xl">
        事前決済のお手続き
      </h1>

      {cancelled ? (
        <Alert className="mt-6">
          <AlertTriangleIcon className="size-4" />
          <AlertDescription>
            決済がキャンセルされました。ご予約自体はお取りしておりますので、
            あらためて事前決済を行うか、店舗払いに切り替える場合は店舗までご連絡ください。
          </AlertDescription>
        </Alert>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          事前決済は予約照会ページから再開いただけます。お手元の予約番号とメールアドレスをご用意ください。
        </p>
      )}

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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button render={<Link href="/reservations/lookup" />}>
          予約照会へ
        </Button>
        <Button render={<Link href="/" />} variant="outline">
          トップへ
        </Button>
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        ご不明点は店舗までお問い合わせください。
      </p>
    </section>
  );
}
