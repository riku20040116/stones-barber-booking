/**
 * 管理画面 / 顧客リストの読み出し。
 * 顧客は予約が入るたびに DB のトリガで自動作成・更新される
 * （supabase/migrations/20260921000001_customers.sql）。
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type CustomerSummary = Database["public"]["Views"]["customer_summaries"]["Row"];
export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type CustomerListFilter = {
  q?: string;
  /** 電話番号かメールが空の人だけ */
  missingOnly?: boolean;
};

export type CustomerListResult =
  | { ok: true; customers: CustomerSummary[] }
  | { ok: false; error: string };

/** 検索語を PostgREST の or フィルタに安全に埋め込めるよう、区切り文字を落とす */
function sanitizeQuery(q: string): string {
  return q.replace(/[,()%*\\]/g, " ").trim();
}

export async function fetchCustomers(filter: CustomerListFilter): Promise<CustomerListResult> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("customer_summaries")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  const q = sanitizeQuery(filter.q ?? "");
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  const { data, error } = await query;
  if (error) {
    console.error("[customers] fetch error:", error.message);
    // テーブルが無い = マイグレーション未適用
    if (error.message.includes("customer_summaries") || error.code === "42P01") {
      return {
        ok: false,
        error:
          "顧客リストのテーブルがまだありません。Supabase で 20260921000001_customers.sql を実行してください。",
      };
    }
    return { ok: false, error: "顧客リストを読み込めませんでした。" };
  }
  // 「情報が足りない人だけ」は検索条件と AND で組み合わせる必要があり、
  // PostgREST の or を 2 つ重ねるより取得後に絞るほうが確実（件数も数百程度）。
  const customers = (data ?? []).filter(
    (c) => !filter.missingOnly || !c.phone || !c.email,
  );
  return { ok: true, customers };
}

/** 連絡先が欠けているか（一覧で色をつける判定） */
export function isMissing(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}

export async function fetchCustomer(id: string): Promise<CustomerSummary | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customer_summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[customers] fetch one error:", error.message);
    return null;
  }
  return data;
}

export type CustomerReservation = {
  id: string;
  code: string;
  status: Database["public"]["Tables"]["reservations"]["Row"]["status"];
  start_at: string;
  end_at: string;
  total_price: number;
  source: Database["public"]["Tables"]["reservations"]["Row"]["source"];
  items: string[];
};

export async function fetchCustomerReservations(customerId: string): Promise<CustomerReservation[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("reservations")
    .select("id, code, status, start_at, end_at, total_price, source")
    .eq("customer_record_id", customerId)
    .order("start_at", { ascending: false })
    .limit(100);
  if (error || !data) {
    if (error) console.error("[customers] reservations fetch error:", error.message);
    return [];
  }
  const ids = data.map((r) => r.id);
  const { data: items } = ids.length
    ? await admin
        .from("reservation_items")
        .select("reservation_id, name_snapshot, sort_order")
        .in("reservation_id", ids)
        .order("sort_order")
    : { data: [] };
  const byResv = new Map<string, string[]>();
  for (const it of items ?? []) {
    const list = byResv.get(it.reservation_id) ?? [];
    list.push(it.name_snapshot);
    byResv.set(it.reservation_id, list);
  }
  return data.map((r) => ({ ...r, items: byResv.get(r.id) ?? [] }));
}
