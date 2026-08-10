"use server";
/**
 * 管理画面 / 休業日・特別営業時間の Server Actions。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}(?::\d{2})?$/;

const upsertSchema = z
  .object({
    date: z.string().regex(dateRegex, "日付の形式が正しくありません"),
    type: z.enum(["closed", "special_hours"]),
    open_time: z.string().regex(timeRegex).nullable(),
    close_time: z.string().regex(timeRegex).nullable(),
    reason: z.string().max(200).nullable(),
  })
  .refine(
    (v) =>
      v.type === "closed" ||
      (v.open_time !== null && v.close_time !== null),
    {
      message: "特別営業の場合、開店・閉店時刻の入力が必要です",
      path: ["open_time"],
    },
  );

export type SaveHolidayResult = { ok: true } | { ok: false; error: string };

function nullIfBlank(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function ensureSeconds(t: string | null): string | null {
  if (!t) return null;
  return t.length === 5 ? `${t}:00` : t;
}

export async function upsertHoliday(
  _prev: SaveHolidayResult | null,
  fd: FormData,
): Promise<SaveHolidayResult> {
  await requireAdmin();
  const type = String(fd.get("type") ?? "closed");
  const parsed = upsertSchema.safeParse({
    date: String(fd.get("date") ?? "").trim(),
    type,
    open_time: type === "special_hours" ? nullIfBlank(fd.get("open_time")) : null,
    close_time: type === "special_hours" ? nullIfBlank(fd.get("close_time")) : null,
    reason: nullIfBlank(fd.get("reason")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("holiday_overrides").upsert(
    {
      date: parsed.data.date,
      type: parsed.data.type,
      open_time: ensureSeconds(parsed.data.open_time),
      close_time: ensureSeconds(parsed.data.close_time),
      reason: parsed.data.reason,
    },
    { onConflict: "date" },
  );
  if (error) {
    console.error("upsertHoliday error:", error);
    return { ok: false, error: "登録に失敗しました" };
  }
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function deleteHoliday(input: {
  date: string;
}): Promise<SaveHolidayResult> {
  await requireAdmin();
  if (!dateRegex.test(input.date)) {
    return { ok: false, error: "日付の形式が正しくありません" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("holiday_overrides")
    .delete()
    .eq("date", input.date);
  if (error) {
    console.error("deleteHoliday error:", error);
    return { ok: false, error: "削除に失敗しました" };
  }
  revalidatePath("/admin/holidays");
  return { ok: true };
}
