"use server";
/**
 * 管理画面 / メニューの CRUD Server Actions。
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MenuCategoryDb } from "@/types/database";

const CATEGORY_VALUES: MenuCategoryDb[] = [
  "cut",
  "course",
  "color",
  "perm",
  "straighten",
  "option",
];

const menuSchema = z.object({
  slug: z
    .string()
    .min(1, "slug は必須です")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "英数字とハイフンのみ使用できます"),
  category: z.enum(CATEGORY_VALUES as [MenuCategoryDb, ...MenuCategoryDb[]]),
  name: z.string().min(1, "メニュー名は必須です").max(80),
  description: z.string().max(500).nullable(),
  price: z.coerce.number().int().min(0).max(1_000_000),
  price_label: z.string().max(40).nullable(),
  duration_min: z.coerce.number().int().min(0).max(600),
  note: z.string().max(200).nullable(),
  is_option: z.coerce.boolean(),
  age_group: z.string().max(40).nullable(),
  image_url: z.string().max(500).nullable(),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.coerce.boolean(),
});

export type SaveMenuResult = { ok: true } | { ok: false; error: string };

function nullIfBlank(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function parseFormData(fd: FormData) {
  return menuSchema.safeParse({
    slug: String(fd.get("slug") ?? "").trim(),
    category: fd.get("category"),
    name: String(fd.get("name") ?? "").trim(),
    description: nullIfBlank(fd.get("description")),
    price: fd.get("price") ?? 0,
    price_label: nullIfBlank(fd.get("price_label")),
    duration_min: fd.get("duration_min") ?? 0,
    note: nullIfBlank(fd.get("note")),
    is_option: fd.get("is_option") === "on",
    age_group: nullIfBlank(fd.get("age_group")),
    image_url: nullIfBlank(fd.get("image_url")),
    sort_order: fd.get("sort_order") ?? 0,
    is_active: fd.get("is_active") === "on",
  });
}

export async function createMenu(
  _prev: SaveMenuResult | null,
  fd: FormData,
): Promise<SaveMenuResult> {
  await requireAdmin();
  const parsed = parseFormData(fd);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("menus").insert(parsed.data);
  if (error) {
    console.error("createMenu error:", error);
    if (error.code === "23505") {
      return { ok: false, error: "同じ slug が既に存在します" };
    }
    return { ok: false, error: "メニューの作成に失敗しました" };
  }
  revalidatePath("/admin/menus");
  redirect("/admin/menus");
}

export async function updateMenu(
  id: string,
  _prev: SaveMenuResult | null,
  fd: FormData,
): Promise<SaveMenuResult> {
  await requireAdmin();
  const parsed = parseFormData(fd);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("menus")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    console.error("updateMenu error:", error);
    if (error.code === "23505") {
      return { ok: false, error: "同じ slug が既に存在します" };
    }
    return { ok: false, error: "メニューの更新に失敗しました" };
  }
  revalidatePath("/admin/menus");
  revalidatePath(`/admin/menus/${id}`);
  redirect("/admin/menus");
}

const toggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleMenuActive(input: {
  id: string;
  isActive: boolean;
}): Promise<SaveMenuResult> {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容が正しくありません" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("menus")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("toggleMenuActive error:", error);
    return { ok: false, error: "公開状態の切替に失敗しました" };
  }
  revalidatePath("/admin/menus");
  return { ok: true };
}
