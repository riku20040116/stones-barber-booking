/**
 * 管理画面用の認証ヘルパ。
 * Server Component / Server Action から呼んで、ログイン済 admin かを保証する。
 */
import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AdminProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "name" | "email" | "role"
>;

/**
 * ログイン済み admin を要求する。それ以外は /admin/login へリダイレクト。
 * Server Component / Server Action 専用。
 */
export async function requireAdmin(): Promise<AdminProfile> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    redirect("/admin/login?error=forbidden");
  }
  return profile;
}

/**
 * ログイン済み admin の取得（リダイレクトしない）。
 * /admin/login ページで「既ログインなら /admin にリダイレクト」用。
 */
export async function getOptionalAdmin(): Promise<AdminProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return profile;
}
