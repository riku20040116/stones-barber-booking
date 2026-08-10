/**
 * 月次売上レポート。
 *  - 前月（JST）の予約を集計し、管理者メールへ送る。
 *  - 毎月 1 日の日次 cron から呼ばれる。
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminNotificationEmails, sendEmail } from "@/lib/email/resend";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/timezone";

export type MonthlyReportResult =
  | { ok: true; month: string; sentTo: string[]; totalRevenue: number }
  | { ok: false; error: string; skipped?: boolean };

/**
 * 前月のレポートを送信する。
 * @param now 基準日時（テスト用）。省略時は現在。
 */
export async function runMonthlyReport(
  now: Date = new Date(),
): Promise<MonthlyReportResult> {
  // JST の「今月 1 日 0:00」を求め、その 1 秒前 = 前月末、から前月範囲を出す
  const jstYmd = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const [y, m] = jstYmd.split("-").map(Number);
  const thisMonthStart = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+09:00`);
  // 前月
  const prevMonthStart = new Date(thisMonthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const fromIso = prevMonthStart.toISOString();
  const toIso = thisMonthStart.toISOString();
  const monthLabel = formatInTimeZone(prevMonthStart, TZ, "yyyy年M月");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("reservations")
    .select("status, total_price, start_at, source")
    .gte("start_at", fromIso)
    .lt("start_at", toIso);
  if (error) {
    console.error("[report] fetch error:", error.message);
    return { ok: false, error: error.message };
  }

  const rows = data ?? [];
  const active = rows.filter(
    (r) => r.status === "confirmed" || r.status === "completed",
  );
  const cancelled = rows.filter(
    (r) => r.status === "cancelled" || r.status === "no_show",
  );
  const totalRevenue = active.reduce((s, r) => s + (r.total_price ?? 0), 0);
  const webCount = active.filter((r) => r.source === "web").length;
  const phoneCount = active.filter(
    (r) => r.source === "phone" || r.source === "walkin",
  ).length;
  const cancelRate =
    rows.length > 0
      ? Math.round((cancelled.length / rows.length) * 100)
      : 0;

  const recipients = getAdminNotificationEmails();
  if (recipients.length === 0) {
    return { ok: false, error: "ADMIN_EMAILS 未設定", skipped: true };
  }

  const lines = [
    `${monthLabel} の予約レポート`,
    "",
    `■ 売上見込み合計: ${totalRevenue.toLocaleString("ja-JP")}円`,
    `■ 成立した予約: ${active.length}件（Web ${webCount} / 電話・来店 ${phoneCount}）`,
    `■ キャンセル・未来店: ${cancelled.length}件（キャンセル率 ${cancelRate}%）`,
    "",
    "※ 売上見込みは予約時点のメニュー金額の合計です（実際の会計額とは異なる場合があります）。",
  ];

  const result = await sendEmail({
    to: recipients,
    subject: `[月次レポート] ${monthLabel} STONE'S BARBER 予約実績`,
    text: lines.join("\n"),
    html: `<h2 style="font-size:18px;">${monthLabel} の予約レポート</h2>
<ul style="line-height:1.9;font-size:15px;">
  <li>売上見込み合計: <strong>${totalRevenue.toLocaleString("ja-JP")}円</strong></li>
  <li>成立した予約: <strong>${active.length}件</strong>（Web ${webCount} / 電話・来店 ${phoneCount}）</li>
  <li>キャンセル・未来店: ${cancelled.length}件（キャンセル率 ${cancelRate}%）</li>
</ul>
<p style="font-size:12px;color:#666;">※ 売上見込みは予約時点のメニュー金額の合計です。</p>`,
    type: "admin_notice",
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, month: monthLabel, sentTo: recipients, totalRevenue };
}
