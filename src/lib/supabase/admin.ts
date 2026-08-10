/**
 * サービスロール用 Supabase クライアント（RLS bypass）。
 *
 * 用途:
 *   - ゲスト予約の作成（顧客はログインしない）
 *   - 予約照会（code + email でマッチ）
 *   - cron からのリマインドメール送信
 *   - Stripe Webhook での予約ステータス更新
 *
 * 重要:
 *   - サーバーサイドでのみ import 可能（"server-only" を上に置いてある）
 *   - クライアントには絶対に流出させない（ENVキー名でも誤って NEXT_PUBLIC_ をつけない）
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  cached = createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
