/**
 * データバックアップ。
 *  - Supabase の主要テーブルを JSON 化し、管理者メールに添付で送る。
 *  - Supabase Free tier には自動バックアップが無いため、これが実質の
 *    オフサイトバックアップになる（コードは GitHub、データはメール受信箱）。
 *  - 週次 cron（/api/cron/backup）と管理画面の手動ボタンの両方から呼ばれる。
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminNotificationEmails, sendEmail } from "@/lib/email/resend";
import { formatDateTimeJst } from "@/lib/timezone";

/** バックアップ対象テーブル（依存の少ない順） */
const BACKUP_TABLES = [
  "menus",
  "holiday_overrides",
  "settings",
  "reservations",
  "reservation_items",
] as const;

export type BackupResult =
  | {
      ok: true;
      counts: Record<string, number>;
      sentTo: string[];
      bytes: number;
    }
  | { ok: false; error: string };

/**
 * 全テーブルを JSON にまとめ、管理者メールへ添付送信する。
 */
export async function runBackup(): Promise<BackupResult> {
  const admin = createSupabaseAdminClient();
  const counts: Record<string, number> = {};
  const dump: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    const { data, error } = await admin.from(table).select("*").limit(10000);
    if (error) {
      console.error(`[backup] ${table} fetch error:`, error.message);
      return { ok: false, error: `${table} の取得に失敗: ${error.message}` };
    }
    dump[table] = data ?? [];
    counts[table] = data?.length ?? 0;
  }

  const recipients = getAdminNotificationEmails();
  if (recipients.length === 0) {
    return { ok: false, error: "ADMIN_EMAILS が未設定のため送信先がありません" };
  }

  const now = new Date();
  const stamp = formatDateTimeJst(now).replace(/[: ]/g, "-");
  const payload = JSON.stringify(
    {
      exported_at: now.toISOString(),
      exported_at_jst: formatDateTimeJst(now),
      app: "stones-barber",
      tables: dump,
    },
    null,
    2,
  );

  const summaryLines = BACKUP_TABLES.map(
    (t) => `  ・${t}: ${counts[t]} 件`,
  ).join("\n");

  const result = await sendEmail({
    to: recipients,
    subject: `[バックアップ] STONE'S BARBER 予約データ (${formatDateTimeJst(now)})`,
    text: `STONE'S BARBER 予約システムの定期バックアップです。

添付の JSON ファイルに全データが含まれています。
このメールは削除せず保管してください（データ復旧時に使用します）。

【件数】
${summaryLines}

復旧手順は docs/backup-and-recovery.md を参照してください。
`,
    html: `<p>STONE'S BARBER 予約システムの定期バックアップです。</p>
<p>添付の JSON ファイルに全データが含まれています。<br />
<strong>このメールは削除せず保管してください</strong>（データ復旧時に使用します）。</p>
<p>【件数】<br />${BACKUP_TABLES.map((t) => `・${t}: ${counts[t]} 件`).join("<br />")}</p>`,
    type: "admin_notice",
    attachments: [
      {
        filename: `stones-barber-backup-${stamp}.json`,
        content: payload,
      },
    ],
  });

  if (!result.ok) {
    return { ok: false, error: `メール送信に失敗: ${result.error}` };
  }

  return {
    ok: true,
    counts,
    sentTo: recipients,
    bytes: Buffer.byteLength(payload, "utf-8"),
  };
}
