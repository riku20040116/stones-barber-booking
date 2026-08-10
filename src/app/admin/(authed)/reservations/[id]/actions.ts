"use server";
/**
 * 管理画面 / 予約詳細の Server Actions。
 *  - 予約のステータス変更
 *  - メモ編集
 *  - キャンセル（管理者は期限を無視できる）
 *
 * RLS は admin ロールに対し全件 update を許可している前提。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  notifyReservationApproved,
  notifyReservationCancelled,
  notifyReservationRescheduled,
} from "@/lib/email/notifications";
import { jstWallToUtc } from "@/lib/timezone";
import type { ReservationStatus } from "@/types/database";

const STATUS_VALUES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUS_VALUES as [ReservationStatus, ...ReservationStatus[]]),
});

export type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateReservationStatus(
  input: { id: string; status: ReservationStatus },
): Promise<UpdateResult> {
  await requireAdmin();
  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容が正しくありません" };
  }
  const supabase = await createSupabaseServerClient();

  // 遷移前のステータスを取得（承認判定に使う）
  const { data: before, error: fetchErr } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchErr || !before) {
    console.error("updateReservationStatus fetch error:", fetchErr);
    return { ok: false, error: "予約の取得に失敗しました" };
  }

  const { error } = await supabase
    .from("reservations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("updateReservationStatus error:", error);
    return { ok: false, error: "ステータス更新に失敗しました" };
  }

  // オーナー承認（仮確定 → 本確定）: お客様に「ご予約確定」メールを送る。best-effort。
  if (before.status === "pending" && parsed.data.status === "confirmed") {
    try {
      const result = await notifyReservationApproved(parsed.data.id);
      if (!result.ok) {
        console.warn("[email] approval notify failed:", result.error);
      }
    } catch (e) {
      console.error("[email] approval notify threw:", e);
    }
  }

  // 管理者がキャンセルした場合はお客様にもキャンセルメールを送る。best-effort。
  if (parsed.data.status === "cancelled") {
    try {
      const result = await notifyReservationCancelled(parsed.data.id);
      if (!result.ok) {
        console.warn("[email] admin cancel notify failed:", result.error);
      }
    } catch (e) {
      console.error("[email] admin cancel notify threw:", e);
    }
  }

  revalidatePath(`/admin/reservations/${parsed.data.id}`);
  revalidatePath("/admin/reservations");
  revalidatePath("/admin");
  return { ok: true };
}

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

export async function updateReservationNotes(
  input: { id: string; notes: string | null },
): Promise<UpdateResult> {
  await requireAdmin();
  const parsed = updateNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容が正しくありません" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("reservations")
    .update({ notes: parsed.data.notes })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("updateReservationNotes error:", error);
    return { ok: false, error: "メモの更新に失敗しました" };
  }
  revalidatePath(`/admin/reservations/${parsed.data.id}`);
  return { ok: true };
}

const rescheduleSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.coerce.number().int().min(5).max(600),
  notify: z.boolean().optional(),
});

/**
 * 予約の日時を変更する（キャンセル → 取り直し不要にする）。
 *  - 所要時間は現状維持もしくは指定分。
 *  - 枠重複は EXCLUDE 制約で検知（23P01）。
 *  - notify=true でお客様に変更通知メール。
 */
export async function rescheduleReservation(input: {
  id: string;
  date: string;
  time: string;
  durationMin: number;
  notify?: boolean;
}): Promise<UpdateResult> {
  await requireAdmin();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "入力内容が正しくありません" };
  }
  const { id, date, time, durationMin, notify } = parsed.data;
  const startAt = jstWallToUtc(date, time);
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("reservations")
    .update({
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .eq("id", id);
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "23P01" || msg.includes("exclusion")) {
      return {
        ok: false,
        error: "変更先の時間帯には既に別の予約が入っています。",
      };
    }
    console.error("rescheduleReservation error:", error);
    return { ok: false, error: "日時の変更に失敗しました" };
  }

  if (notify) {
    try {
      const result = await notifyReservationRescheduled(id);
      if (!result.ok) {
        console.warn("[email] reschedule notify failed:", result.error);
      }
    } catch (e) {
      console.error("[email] reschedule notify threw:", e);
    }
  }

  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  return { ok: true };
}
