/**
 * 管理画面の予約関連クエリ・整形ヘルパ。
 * RLS は admin ロールに対し全件アクセスを許可している前提で、通常の server client を使う。
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, ReservationStatus } from "@/types/database";

export type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
export type ReservationItemRow =
  Database["public"]["Tables"]["reservation_items"]["Row"];

export type ReservationWithItems = ReservationRow & {
  reservation_items: ReservationItemRow[];
};

export const RESERVATION_STATUS_LABELS: Record<
  ReservationStatus,
  { label: string; tone: "ok" | "warn" | "danger" | "muted" }
> = {
  pending: { label: "受付中", tone: "warn" },
  confirmed: { label: "確定", tone: "ok" },
  completed: { label: "完了", tone: "muted" },
  cancelled: { label: "キャンセル", tone: "danger" },
  no_show: { label: "未来店", tone: "danger" },
};

export const RESERVATION_STATUS_OPTIONS: {
  value: ReservationStatus;
  label: string;
}[] = (
  ["pending", "confirmed", "completed", "cancelled", "no_show"] as const
).map((s) => ({ value: s, label: RESERVATION_STATUS_LABELS[s].label }));

export const PAYMENT_METHOD_LABELS = {
  in_store: "店舗払い",
  stripe: "オンライン決済",
} as const;

export const PAYMENT_STATUS_LABELS = {
  unpaid: "未決済",
  paid: "決済済",
  refunded: "返金済",
  failed: "失敗",
} as const;

/**
 * 管理画面用の予約一覧。日付範囲・ステータスでフィルタ可能。
 */
export async function fetchAdminReservations(params: {
  fromIso?: string;
  toIso?: string;
  statuses?: ReservationStatus[];
  q?: string;
  limit?: number;
}): Promise<ReservationRow[]> {
  const { fromIso, toIso, statuses, q, limit = 100 } = params;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("reservations")
    .select("*")
    .order("start_at", { ascending: true })
    .limit(limit);

  if (fromIso) query = query.gte("start_at", fromIso);
  if (toIso) query = query.lte("start_at", toIso);
  if (statuses && statuses.length > 0) query = query.in("status", statuses);
  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    query = query.or(
      [
        `code.ilike.${term}`,
        `customer_name.ilike.${term}`,
        `customer_email.ilike.${term}`,
        `customer_phone.ilike.${term}`,
      ].join(","),
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchAdminReservations error:", error);
    return [];
  }
  return data ?? [];
}

/** 予約 1 件 + reservation_items を取得（Relationships が未宣言なので 2 クエリ） */
export async function fetchAdminReservationById(
  id: string,
): Promise<ReservationWithItems | null> {
  const supabase = await createSupabaseServerClient();
  const [reservationRes, itemsRes] = await Promise.all([
    supabase.from("reservations").select("*").eq("id", id).single(),
    supabase
      .from("reservation_items")
      .select("*")
      .eq("reservation_id", id)
      .order("sort_order", { ascending: true }),
  ]);
  if (reservationRes.error || !reservationRes.data) {
    if (reservationRes.error)
      console.error("fetchAdminReservationById error:", reservationRes.error);
    return null;
  }
  if (itemsRes.error) {
    console.error("fetchAdminReservationItems error:", itemsRes.error);
  }
  return {
    ...reservationRes.data,
    reservation_items: itemsRes.data ?? [],
  };
}

/** ダッシュボード用の集計（今日 / 今週 / 未対応 / 今日の売上見込み） */
export async function fetchAdminDashboardStats(now: Date = new Date()): Promise<{
  todayCount: number;
  todayPending: number;
  weekCount: number;
  pendingCount: number;
  todayRevenue: number;
}> {
  const supabase = await createSupabaseServerClient();

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayStartIso = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
  const todayEndIso = new Date(`${todayStr}T23:59:59+09:00`).toISOString();

  // 今週（今日から+7日）
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekEndStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(weekEnd);
  const weekEndIso = new Date(`${weekEndStr}T23:59:59+09:00`).toISOString();

  const [todayRes, weekRes, pendingRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, status, total_price", { count: "exact", head: false })
      .gte("start_at", todayStartIso)
      .lte("start_at", todayEndIso)
      .in("status", ["pending", "confirmed", "completed"]),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .gte("start_at", todayStartIso)
      .lte("start_at", weekEndIso)
      .in("status", ["pending", "confirmed"]),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const todayRows = todayRes.data ?? [];
  return {
    todayCount: todayRows.length,
    todayPending: todayRows.filter((r) => r.status === "pending").length,
    weekCount: weekRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    todayRevenue: todayRows.reduce((sum, r) => sum + (r.total_price ?? 0), 0),
  };
}
