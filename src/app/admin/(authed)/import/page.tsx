/**
 * 管理画面 / 手書き予約表の取り込み。
 * 予約表を写真に撮ってアップロード → AI が読み取り → 確認して登録。
 */
import Link from "next/link";
import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isSheetReaderConfigured } from "@/lib/sheet/extract";
import { ImportFlow } from "./import-flow";

export const metadata = {
  title: "手書き予約表の取り込み | 管理画面",
};

// 写真 2 枚の読み取りに 1〜2 分かかることがあるため、処理時間の上限を延ばす
export const maxDuration = 300;

export default function AdminImportPage() {
  const configured = isSheetReaderConfigured();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Import
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          手書き予約表の取り込み
        </h1>
        <p className="text-sm text-zinc-600">
          予約表を写真に撮って選ぶと、AI が読み取って予約の一覧にします。
          内容を確認・修正してから登録してください（読み取っただけでは登録されません）。
        </p>
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            render={<a href="/booking-sheet.pdf" target="_blank" rel="noopener noreferrer" />}
          >
            <DownloadIcon /> 予約表（印刷用 PDF）
          </Button>
        </div>
      </header>

      {!configured && (
        <Alert variant="destructive">
          <AlertDescription>
            写真の読み取り機能がまだ設定されていません（ANTHROPIC_API_KEY が未設定）。
            設定が済むまでは、
            <Link href="/admin/reservations/new" className="underline">
              手動予約登録
            </Link>
            から 1 件ずつ登録してください。
          </AlertDescription>
        </Alert>
      )}

      <ImportFlow configured={configured} />
    </div>
  );
}
