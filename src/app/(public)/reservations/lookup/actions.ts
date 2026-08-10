"use server";
/**
 * 予約照会・キャンセル用 Server Actions。
 *  - lookupReservation: code + email で reservation + items を返す
 *  - cancelReservation: cancel_reservation RPC を呼び出す
 *
 * 公開関数（lookup_reservation / cancel_reservation）は SECURITY DEFINER で
 * 定義されているため、anon クライアントから直接実行できる。
 * reservation_items は RLS で customer_id = auth.uid() のみ可視のため、
 * lookup 成功後に admin クライアントで取得する（コード+メール一致検証済み）。
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  lookupReservationSchema,
  type LookupReservationInput,
} from "@/lib/reservation/schema";
import { notifyReservationCancelled } from "@/lib/email/notifications";
import type { Database } from "@/types/database";

type ReservationRow =
  Database["public"]["Functions"]["lookup_reservation"]["Returns"][number];

type ReservationItemRow = Pick<
  Database["public"]["Tables"]["reservation_items"]["Row"],
  "id" | "name_snapshot" | "price_snapshot" | "duration_snapshot" | "sort_order"
>;

export type LookupReservationResult =
  | {
      ok: true;
      reservation: ReservationRow;
      items: ReservationItemRow[];
    }
  | { ok: false; error: string };

export async function lookupReservation(
  input: LookupReservationInput,
): Promise<LookupReservationResult> {
  const parsed = lookupReservationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容にエラーがあります",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lookup_reservation", {
    p_code: parsed.data.code,
    p_email: parsed.data.email,
  });

  if (error) {
    console.error("lookup_reservation rpc error:", error);
    return {
      ok: false,
      error: "予約照会に失敗しました。しばらくしてからお試しください。",
    };
  }
  const list = (data ?? []) as ReservationRow[];
  if (list.length === 0) {
    return {
      ok: false,
      error:
        "ご指定の予約番号とメールアドレスの組み合わせでは予約が見つかりませんでした。",
    };
  }
  const reservation = list[0]!;

  let items: ReservationItemRow[] = [];
  try {
    const admin = createSupabaseAdminClient();
    const { data: itemRows, error: itemErr } = await admin
      .from("reservation_items")
      .select("id, name_snapshot, price_snapshot, duration_snapshot, sort_order")
      .eq("reservation_id", reservation.id)
      .order("sort_order", { ascending: true });
    if (itemErr) {
      console.error("reservation_items fetch error:", itemErr);
    } else {
      items = itemRows ?? [];
    }
  } catch (e) {
    // admin env が未設定の場合などは items 取得をスキップして続行
    console.warn("admin client unavailable for items fetch:", e);
  }

  return { ok: true, reservation, items };
}

export type CancelReservationResult =
  | { ok: true; status: "cancelled" }
  | { ok: false; error: string };

export async function cancelReservation(
  input: LookupReservationInput,
): Promise<CancelReservationResult> {
  const parsed = lookupReservationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容にエラーがあります",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_code: parsed.data.code,
    p_email: parsed.data.email,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_found")) {
      return { ok: false, error: "予約が見つかりませんでした。" };
    }
    if (msg.includes("not_cancellable")) {
      return {
        ok: false,
        error: "このご予約はキャンセルできない状態です。",
      };
    }
    if (msg.includes("cancel_deadline_passed")) {
      return {
        ok: false,
        error:
          "Webキャンセル期限（予約日の7日前）を過ぎています。お手数ですが店舗（092-231-8037）までお電話ください。",
      };
    }
    console.error("cancel_reservation rpc error:", error);
    return {
      ok: false,
      error: "キャンセル処理に失敗しました。しばらくしてからお試しください。",
    };
  }
  void data;

  // キャンセル通知メールを best-effort で送信。
  // cancel_reservation RPC は id を返さないため、code+email で再ルックアップして id を取得する。
  try {
    const admin = createSupabaseAdminClient();
    const { data: lookup } = await admin
      .from("reservations")
      .select("id")
      .eq("code", parsed.data.code)
      .eq("customer_email", parsed.data.email)
      .maybeSingle();
    if (lookup?.id) {
      const result = await notifyReservationCancelled(lookup.id);
      if (!result.ok) {
        console.warn("[email] cancellation send failed:", result.error);
      }
    }
  } catch (e) {
    console.error("[email] notifyReservationCancelled threw:", e);
  }

  return { ok: true, status: "cancelled" };
}
