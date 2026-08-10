"use server";
/**
 * 管理画面 / 手動予約登録（電話・来店予約の記帳）。
 *  - 管理者が日付・時刻・所要時間・メニュー・顧客情報を入力して予約を作る。
 *  - service-role で直接 INSERT（RPC の重複チェック等は通さず、管理者判断を優先）。
 *  - ただし枠の重複は DB の EXCLUDE 制約で検知し、23P01 を握って警告する。
 *  - source は 'phone'（電話）/ 'walkin'（来店）を選べる。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jstWallToUtc } from "@/lib/timezone";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が不正です"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "時刻の形式が不正です"),
  durationMin: z.coerce.number().int().min(5).max(600),
  menuIds: z.array(z.string().uuid()).max(20),
  customerName: z.string().min(1, "お名前を入力してください").max(50),
  customerPhone: z.string().min(1, "電話番号を入力してください").max(20),
  customerEmail: z.string().max(120).optional().nullable(),
  source: z.enum(["phone", "walkin"]),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateManualResult =
  | { ok: true; id: string; code: string }
  | { ok: false; error: string };

export async function createManualReservation(input: {
  date: string;
  time: string;
  durationMin: number;
  menuIds: string[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  source: "phone" | "walkin";
  notes?: string | null;
}): Promise<CreateManualResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const p = parsed.data;

  const startAt = jstWallToUtc(p.date, p.time);
  const endAt = new Date(startAt.getTime() + p.durationMin * 60_000);

  const admin = createSupabaseAdminClient();

  // メニュー情報を取得（合計金額・スナップショット用）
  let totalPrice = 0;
  const items: {
    menu_id: string;
    name_snapshot: string;
    price_snapshot: number;
    duration_snapshot: number;
    sort_order: number;
  }[] = [];
  if (p.menuIds.length > 0) {
    const { data: menus, error: menuErr } = await admin
      .from("menus")
      .select("id, name, price, duration_min")
      .in("id", p.menuIds);
    if (menuErr) {
      console.error("createManualReservation menu fetch error:", menuErr);
      return { ok: false, error: "メニューの取得に失敗しました" };
    }
    const byId = new Map((menus ?? []).map((m) => [m.id, m]));
    p.menuIds.forEach((id, idx) => {
      const m = byId.get(id);
      if (m) {
        totalPrice += m.price;
        items.push({
          menu_id: m.id,
          name_snapshot: m.name,
          price_snapshot: m.price,
          duration_snapshot: m.duration_min,
          sort_order: idx + 1,
        });
      }
    });
  }

  // 予約本体を INSERT（確定）
  const { data: inserted, error } = await admin
    .from("reservations")
    .insert({
      customer_id: null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      customer_name: p.customerName,
      customer_email: (p.customerEmail || "").toLowerCase(),
      customer_phone: p.customerPhone,
      total_price: totalPrice,
      payment_method: "in_store",
      payment_status: "unpaid",
      stripe_payment_intent: null,
      status: "confirmed",
      source: p.source,
      notes: p.notes ?? null,
    })
    .select("id, code")
    .single();

  if (error) {
    const msg = error.message ?? "";
    if (error.code === "23P01" || msg.includes("exclusion")) {
      return {
        ok: false,
        error:
          "その時間帯には既に予約が入っています。別の時間をお選びください。",
      };
    }
    console.error("createManualReservation insert error:", error);
    return { ok: false, error: "予約の登録に失敗しました" };
  }

  // line items
  if (items.length > 0) {
    const { error: itemErr } = await admin.from("reservation_items").insert(
      items.map((it) => ({ ...it, reservation_id: inserted.id })),
    );
    if (itemErr) {
      console.error("createManualReservation items error:", itemErr);
      // 本体は作成済みなので致命傷にはしない
    }
  }

  revalidatePath("/admin/reservations");
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  return { ok: true, id: inserted.id, code: inserted.code };
}

// 手動登録は管理者自身の操作なので通知メール/LINE は送らない
// （必要になれば notifyReservationCreated(inserted.id) をここで呼ぶ）
