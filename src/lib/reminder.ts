/**
 * 翌日予約リマインダーの一括送信ロジック。
 * cron から呼ばれる。冪等（email_log で送信済みをスキップ）。
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendReservationReminder } from "@/lib/email/notifications";
import { dateStringAfterDays, jstWallToUtc, todayJstStart } from "@/lib/timezone";

export type ReminderRunResult = {
  target: string;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  errors?: { code: string; error: string }[];
};

export async function runReminders(): Promise<ReminderRunResult> {
  const today = todayJstStart();
  const tomorrowStr = dateStringAfterDays(today, 1);
  const dayAfterStr = dateStringAfterDays(today, 2);
  const fromUtc = jstWallToUtc(tomorrowStr, "00:00");
  const toUtc = jstWallToUtc(dayAfterStr, "00:00");

  const admin = createSupabaseAdminClient();
  const { data: reservations, error } = await admin
    .from("reservations")
    .select("id, code, customer_email, status, start_at")
    .gte("start_at", fromUtc.toISOString())
    .lt("start_at", toUtc.toISOString())
    .in("status", ["pending", "confirmed"]);

  if (error) {
    console.error("[reminder] fetch error:", error.message);
    return { target: tomorrowStr, total: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const targets = reservations ?? [];
  if (targets.length === 0) {
    return { target: tomorrowStr, total: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const ids = targets.map((r) => r.id);
  const { data: alreadySent } = await admin
    .from("email_log")
    .select("reservation_id")
    .in("reservation_id", ids)
    .eq("type", "reminder")
    .is("error", null);
  const alreadyIds = new Set((alreadySent ?? []).map((r) => r.reservation_id));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { code: string; error: string }[] = [];

  for (const r of targets) {
    if (alreadyIds.has(r.id)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await sendReservationReminder(r.id);
      if (res.ok) sent += 1;
      else {
        failed += 1;
        errors.push({ code: r.code, error: res.error });
      }
    } catch (e) {
      failed += 1;
      errors.push({
        code: r.code,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    target: tomorrowStr,
    total: targets.length,
    sent,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}
