/**
 * 管理画面 / 手書き予約表の取り込み。
 * 予約表の写真から Google レンズでコピーした文字を貼り付け → 確認して登録。
 * 文字の読み取りはこのアプリの中だけで行う（有料の AI・サービスは使わない）。
 */
import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateJst } from "@/lib/timezone";
import { ImportFlow } from "./import-flow";

export const metadata = {
  title: "手書き予約表の取り込み | 管理画面",
};

export default function AdminImportPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight">手書き予約表の取り込み</h1>
        <p className="text-base text-zinc-600">
          予約表の文字を貼り付けると、予約の一覧にします。確かめてから登録します。
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<a href="/booking-sheet.pdf" target="_blank" rel="noopener noreferrer" />}
        >
          <DownloadIcon /> 予約表（印刷用 PDF・A4）
        </Button>
      </header>

      <ImportFlow today={formatDateJst(new Date())} />
    </div>
  );
}
