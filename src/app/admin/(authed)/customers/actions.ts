"use server";
/**
 * 管理画面 / 顧客リストの編集。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "お名前を入力してください").max(50),
  phone: z.string().trim().max(20),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "メールアドレスの形式が正しくありません"),
  notes: z.string().max(1000),
});

export type SaveCustomerResult = { ok: true } | { ok: false; error: string };

export async function saveCustomer(input: z.input<typeof schema>): Promise<SaveCustomerResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const p = parsed.data;
  const phone = p.phone || null;
  const email = p.email ? p.email.toLowerCase() : null;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("customers")
    .update({ name: p.name, phone, email, notes: p.notes || null })
    .eq("id", p.id);
  if (error) {
    console.error("[customers] save error:", error);
    return { ok: false, error: "保存に失敗しました" };
  }

  // これからのご予約で連絡先が空のものを埋める（リマインドメールや当日の連絡に使うため）。
  // 既に入っている連絡先は上書きしない。
  const nowIso = new Date().toISOString();
  if (phone) {
    await admin
      .from("reservations")
      .update({ customer_phone: phone })
      .eq("customer_record_id", p.id)
      .eq("customer_phone", "")
      .gte("start_at", nowIso);
  }
  if (email) {
    await admin
      .from("reservations")
      .update({ customer_email: email })
      .eq("customer_record_id", p.id)
      .eq("customer_email", "")
      .gte("start_at", nowIso);
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${p.id}`);
  return { ok: true };
}
