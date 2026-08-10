/**
 * 翌日のご予約リマインダー一括送信エンドポイント。
 *
 * 想定: Vercel Cron (vercel.json) から毎日 18:00 JST 頃に呼ぶ。
 *   {
 *     "crons": [
 *       { "path": "/api/cron/reminder", "schedule": "0 9 * * *" }  // 09:00 UTC = 18:00 JST
 *     ]
 *   }
 *
 * 認証:
 *  - Vercel Cron は Authorization: Bearer ${CRON_SECRET} を自動付与する。
 *  - 手動実行や開発時は同じヘッダで叩く。
 *
 * ロジック:
 *  - JST の "明日" 0:00 〜 23:59 に start_at が含まれる
 *    confirmed / pending な予約を抽出。
 *  - 既に同 reservation_id + type=reminder の email_log があるものはスキップ（冪等）。
 *  - 1件ずつ sendReservationReminder() を呼ぶ。
 */
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // 未設定時は本番では拒否、dev では許容（ログ出力）
    if (process.env.NODE_ENV === "production") return false;
    console.warn("[cron] CRON_SECRET not set; allowing in non-production");
    return true;
  }
  const header = req.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReminders();
  return NextResponse.json({ ok: true, ...result });
}
