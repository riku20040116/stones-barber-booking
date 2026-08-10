/**
 * 統合日次 cron。Vercel Hobby は cron 2 本まで（かつ最短 1日 1回）のため、
 * 日次タスクをこの 1 本に集約する。
 *
 * 実行内容（毎日 09:00 UTC = 18:00 JST 想定）:
 *   1. 翌日予約リマインダー … 毎日
 *   2. 週次バックアップ     … 月曜のみ
 *   3. 月次売上レポート     … 毎月 1 日のみ
 *
 * 認証: Authorization: Bearer ${CRON_SECRET}
 */
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminder";
import { runBackup } from "@/lib/backup";
import { runMonthlyReport } from "@/lib/report";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    console.warn("[cron/daily] CRON_SECRET not set; allowing in non-production");
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dow = Number(formatInTimeZone(now, TZ, "i")); // 1=Mon .. 7=Sun
  const dom = Number(formatInTimeZone(now, TZ, "d")); // 1..31

  const out: Record<string, unknown> = {};

  // 1) リマインダー（毎日）
  try {
    out.reminder = await runReminders();
  } catch (e) {
    out.reminder = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2) バックアップ（月曜）
  if (dow === 1) {
    try {
      out.backup = await runBackup();
    } catch (e) {
      out.backup = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 3) 月次レポート（1 日）
  if (dom === 1) {
    try {
      out.monthlyReport = await runMonthlyReport(now);
    } catch (e) {
      out.monthlyReport = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), ...out });
}
