"use server";
/**
 * 管理者による強制キャンセル Server Action。
 *  - キャンセル期限を無視して取消できる（電話連絡を受けた時のオペ用）
 *  - notifyReservationCancelled でお客様にメールも送る
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyReservationCancelled } from "@/lib/email/notifications";

const forceCancelSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type ForceCancelResult =
  | { ok: true }
  | { ok: false; error: string };

export async function forceCancelReservation(input: {
  id: string;
  notes?: string;
}): Promise<ForceCancelResult> {
  await requireAdmin();
  const parsed = forceCancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容が正しくありません" };
  }
  const supabase = await createSupabaseServerClient();

  // 既存の予約を取得（既にキャンセルされていないか確認）
  const { data: existing, error: fetchErr } = await supabase
    .from("reservations")
    .select("id, status, notes")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchErr) {
    console.error("forceCancel fetch error:", fetchErr);
    return { ok: false, error: "予約の取得に失敗しました" };
  }
  if (!existing) {
    return { ok: false, error: "予約が見つかりませんでした" };
  }
  if (existing.status === "cancelled") {
    return { ok: false, error: "この予約は既にキャンセル済みです" };
  }

  // メモを足してキャンセル
  const prevNotes = existing.notes ?? "";
  const addNote = parsed.data.notes
    ? `\n[管理者キャンセル] ${parsed.data.notes}`
    : "\n[管理者キャンセル]";
  const newNotes = (prevNotes + addNote).slice(0, 1900);

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", notes: newNotes })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("forceCancel update error:", error);
    return { ok: false, error: "キャンセル処理に失敗しました" };
  }

  // お客様にキャンセル通知メール（best-effort）
  try {
    const result = await notifyReservationCancelled(parsed.data.id);
    if (!result.ok) {
      console.warn("[email] force cancel notify failed:", result.error);
    }
  } catch (e) {
    console.error("[email] force cancel notify threw:", e);
  }

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${parsed.data.id}`);
  revalidatePath("/admin/reservations/force-cancel");
  revalidatePath("/admin");
  return { ok: true };
}
