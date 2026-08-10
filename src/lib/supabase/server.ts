/**
 * サーバー用 Supabase クライアント。
 * Server Component / Server Action / Route Handler で使う。
 *
 * Anon Key + cookies() でユーザーセッションを引き継ぐ。
 * 管理操作（ロール判定済の上で）でも基本はこれを使い、
 * 真にRLSを跨ぐ必要があるときだけ ./admin の service-role を使う。
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * env の Supabase URL/key が「実際に使える形」で揃っているかを判定する。
 *  - 未設定 / 空 / プレースホルダ (`__YOUR_*__`) を弾く。
 *  - 公開ページのデータ取得層はこれをチェックして、未設定時は空配列にフォールバックする。
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  if (url.includes("__YOUR_") || anonKey.includes("__YOUR_")) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase が未設定です。.env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を実際の値に書き換え、dev サーバーを再起動してください。",
    );
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component から呼ばれた場合 set は不可。middleware で更新するため握りつぶし。
          }
        },
      },
    },
  );
}
