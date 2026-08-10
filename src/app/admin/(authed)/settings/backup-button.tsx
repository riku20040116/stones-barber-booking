"use client";
/**
 * 手動バックアップ実行ボタン。
 * runBackup を Server Action 経由で呼び、結果をトーストで通知する。
 */
import * as React from "react";
import { DatabaseBackupIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runManualBackup } from "./backup-actions";

export function BackupButton() {
  const [pending, startTransition] = React.useTransition();

  function run() {
    startTransition(async () => {
      const res = await runManualBackup();
      if (res.ok) {
        toast.success(
          `バックアップを送信しました（${res.sentTo.join(", ")} 宛）`,
        );
      } else {
        toast.error(`バックアップに失敗: ${res.error}`);
      }
    });
  }

  return (
    <Button size="sm" onClick={run} disabled={pending}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" />
          送信中...
        </>
      ) : (
        <>
          <DatabaseBackupIcon />
          今すぐバックアップをメール送信
        </>
      )}
    </Button>
  );
}
