/**
 * 管理画面 / メニュー関連クエリ。
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type MenuRow = Database["public"]["Tables"]["menus"]["Row"];

/** 全メニュー（is_active 問わず） */
export async function fetchAllMenus(): Promise<MenuRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("fetchAllMenus error:", error);
    return [];
  }
  return data ?? [];
}

export async function fetchMenuById(id: string): Promise<MenuRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    if (error) console.error("fetchMenuById error:", error);
    return null;
  }
  return data;
}
