"use server";
/**
 * 手動バックアップの Server Action。
 * requireAdmin で管理者のみ実行可能。
 */
import { requireAdmin } from "@/lib/auth/admin";
import { runBackup, type BackupResult } from "@/lib/backup";

export async function runManualBackup(): Promise<BackupResult> {
  await requireAdmin();
  return runBackup();
}
