"use server";
/**
 * 予約フォーム関連の Server Actions。
 *  - getAvailableSlots: 日付＋合計時間に対する空き枠を返す
 *  - submitReservation: create_reservation RPC を呼び、予約コードを返す
 *    （paymentMethod === "stripe" の場合は Checkout Session URL も返す）
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAvailableSlotsForDate,
  fetchAvailableSlotsForRange,
  type DayAvailability,
} from "@/lib/reservation/queries";
import {
  createReservationInputSchema,
  type CreateReservationInput,
} from "@/lib/reservation/schema";
import { createCheckoutSessionForReservation } from "@/lib/stripe/server";
import { notifyReservationCreated } from "@/lib/email/notifications";
import { dateStringAfterDays } from "@/lib/timezone";

/** PostgrestError は標準 Error 派生でないため、message/code/details/hint を引き出す */
function formatRpcError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  const parts: string[] = [];
  if (e.message) parts.push(`message="${e.message}"`);
  if (e.code) parts.push(`code=${e.code}`);
  if (e.details) parts.push(`details="${e.details}"`);
  if (e.hint) parts.push(`hint="${e.hint}"`);
  if (parts.length === 0) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return parts.join(" ");
}

export async function getAvailableSlots(input: {
  dateStr: string;
  totalDurationMin: number;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateStr)) {
    return { ok: false as const, error: "日付の形式が不正です", slots: [] };
  }
  if (input.totalDurationMin <= 0 || input.totalDurationMin > 600) {
    return {
      ok: false as const,
      error: "施術時間が不正です",
      slots: [],
    };
  }
  const slots = await fetchAvailableSlotsForDate(input);
  return { ok: true as const, slots };
}

export type GetAvailableSlotsRangeResult =
  | { ok: true; days: DayAvailability[] }
  | { ok: false; error: string };

/**
 * 表形式 UI 用: 開始日から N 日分（最大31日）の空き枠を返す。
 */
export async function getAvailableSlotsRange(input: {
  fromDateStr: string;
  days: number;
  totalDurationMin: number;
}): Promise<GetAvailableSlotsRangeResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDateStr)) {
    return { ok: false, error: "日付の形式が不正です" };
  }
  if (input.days < 1 || input.days > 31) {
    return { ok: false, error: "表示日数が不正です" };
  }
  if (input.totalDurationMin <= 0 || input.totalDurationMin > 600) {
    return { ok: false, error: "施術時間が不正です" };
  }
  const fromAnchor = new Date(`${input.fromDateStr}T12:00:00+09:00`);
  const toDateStr = dateStringAfterDays(fromAnchor, input.days - 1);
  const days = await fetchAvailableSlotsForRange({
    fromDateStr: input.fromDateStr,
    toDateStr,
    totalDurationMin: input.totalDurationMin,
  });
  return { ok: true, days };
}

export type GetUnavailableDatesResult =
  | { ok: true; fullDates: string[] }
  | { ok: false; error: string };

/**
 * 月別カレンダー用: 指定期間で「営業日だが選択メニューの空き枠がゼロ」の日付一覧を返す。
 * （休業日は別途カレンダー側で判定するので、ここでは "営業しているのに満員" の日のみ）
 */
export async function getUnavailableDates(input: {
  fromDateStr: string;
  days: number;
  totalDurationMin: number;
}): Promise<GetUnavailableDatesResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDateStr)) {
    return { ok: false, error: "日付の形式が不正です" };
  }
  if (input.days < 1 || input.days > 70) {
    return { ok: false, error: "表示日数が不正です" };
  }
  if (input.totalDurationMin <= 0 || input.totalDurationMin > 600) {
    return { ok: false, error: "施術時間が不正です" };
  }
  const fromAnchor = new Date(`${input.fromDateStr}T12:00:00+09:00`);
  const toDateStr = dateStringAfterDays(fromAnchor, input.days - 1);
  const days = await fetchAvailableSlotsForRange({
    fromDateStr: input.fromDateStr,
    toDateStr,
    totalDurationMin: input.totalDurationMin,
  });
  // 営業日 (isOpen=true) かつ slots が空 = 満員
  const fullDates = days
    .filter((d) => d.isOpen && d.slots.length === 0)
    .map((d) => d.date);
  return { ok: true, fullDates };
}

export type SubmitReservationResult =
  | { ok: true; code: string; id: string; checkoutUrl?: string }
  | { ok: false; error: string };

export async function submitReservation(
  input: CreateReservationInput,
): Promise<SubmitReservationResult> {
  const parsed = createReservationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "入力内容にエラーがあります",
    };
  }

  const { menuIds, startAtIso, endAtIso, customer, paymentMethod } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_reservation", {
    p_start_at: startAtIso,
    p_end_at: endAtIso,
    p_customer_name: customer.name,
    p_customer_email: customer.email,
    p_customer_phone: customer.phone,
    p_menu_ids: menuIds,
    p_payment_method: paymentMethod,
    p_notes: customer.notes ?? null,
  });

  if (error) {
    // RPC 内で raise されたエラーメッセージを日本語に変換
    const msg = error.message ?? "";
    const code = (error as { code?: string }).code ?? "";
    if (msg.includes("slot_taken")) {
      return {
        ok: false,
        error:
          "ご指定の時間帯はちょうど他のお客様にご予約いただきました。別の時間をお選びください。",
      };
    }
    if (msg.includes("menu_not_available")) {
      return { ok: false, error: "選択されたメニューが無効です。" };
    }
    if (msg.includes("duration_mismatch") || msg.includes("duration_too_short")) {
      return {
        ok: false,
        error: "施術時間と枠の長さが合いません。最初からやり直してください。",
      };
    }
    if (msg.includes("duration_too_long")) {
      return {
        ok: false,
        error: "施術時間に対して枠が長すぎます。最初からやり直してください。",
      };
    }
    if (msg.includes("invalid_time_range")) {
      return { ok: false, error: "予約時間の指定が不正です。" };
    }
    if (msg.includes("no_menu_selected")) {
      return { ok: false, error: "メニューを1つ以上選択してください。" };
    }
    if (msg.includes("duplicate_active_reservation")) {
      return {
        ok: false,
        error:
          "同じメールアドレスで既に有効なご予約があります。"
          + "予約の変更・キャンセルは「予約確認」ページからお願いします。",
      };
    }
    if (msg.includes("invalid_customer_name")) {
      return { ok: false, error: "お名前を入力してください。" };
    }
    if (msg.includes("invalid_email")) {
      return { ok: false, error: "メールアドレスの形式が正しくありません。" };
    }
    // 関数自体が見つからない場合（マイグレーション未適用）
    if (
      code === "PGRST202" ||
      msg.includes("could not find the function") ||
      msg.includes("Could not find the function") ||
      msg.includes("function") && msg.includes("does not exist")
    ) {
      console.error(
        "submitReservation rpc error (function missing):",
        formatRpcError(error),
      );
      return {
        ok: false,
        error:
          "予約用の関数が Supabase に存在しません。スキーマのマイグレーションが完了しているかご確認ください。",
      };
    }
    console.error("submitReservation rpc error:", formatRpcError(error));
    // 開発用に詳細メッセージを混ぜる（本番でも害は少ない: PostgREST が返す内容のサマリのみ）
    return {
      ok: false,
      error: `予約処理に失敗しました。${
        msg ? `(${msg})` : ""
      } しばらくしてからお試しください。`,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id || !row?.code) {
    return { ok: false, error: "予約処理に失敗しました（応答が不正）。" };
  }

  // 予約確認メール（お客様）+ 管理者通知メールを並行送信。失敗しても予約処理は継続。
  try {
    const result = await notifyReservationCreated(row.id);
    if (!result.customer.ok) {
      console.warn("[email] confirmation send failed:", result.customer.error);
    }
    if (result.admin && !result.admin.ok) {
      console.warn("[email] admin notice send failed:", result.admin.error);
    }
  } catch (e) {
    console.error("[email] notifyReservationCreated threw:", e);
  }

  // Stripe 決済を選択している場合は、Checkout Session を作成して URL を返す
  if (paymentMethod === "stripe") {
    try {
      // 予約に紐づく items を取得して line_items を構築
      const { data: items } = await supabase
        .from("reservation_items")
        .select("name_snapshot, price_snapshot")
        .eq("reservation_id", row.id)
        .order("sort_order", { ascending: true });

      const lineItems =
        (items ?? []).length > 0
          ? (items ?? []).map((it) => ({
              name: it.name_snapshot,
              amount: it.price_snapshot,
              quantity: 1,
            }))
          : [
              {
                name: `予約 ${row.code}`,
                amount: 0,
                quantity: 1,
              },
            ];

      const session = await createCheckoutSessionForReservation({
        reservationId: row.id,
        reservationCode: row.code,
        customerEmail: customer.email,
        items: lineItems,
      });

      return {
        ok: true,
        id: row.id,
        code: row.code,
        checkoutUrl: session.url,
      };
    } catch (e) {
      console.error("createCheckoutSession error:", e);
      // 予約自体は作成済みなので ok を返しつつ、エラー警告は出さない（後で /pay から再試行可能）
      return { ok: true, id: row.id, code: row.code };
    }
  }

  return { ok: true, id: row.id, code: row.code };
}
