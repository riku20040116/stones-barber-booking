/**
 * 週次バックアップエンドポイント。
 * Vercel Cron から毎週月曜 04:00 JST（日曜 19:00 UTC）に呼ばれる。
 * 認証は /api/cron/reminder と同じく Authorization: Bearer ${CRON_SECRET}。
 */
import { NextResponse, type NextRequest } from "next/server";
import { runBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    console.warn("[cron/backup] CRON_SECRET not set; allowing in non-production");
    return true;
  }
  const header = req.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runBackup();
  if (!result.ok) {
    console.error("[cron/backup] failed:", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
