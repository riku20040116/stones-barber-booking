/**
 * 予約関連のサーバー側クエリ。
 *  - メニュー一覧
 *  - 指定日の予約 + 例外日設定
 *  - 空き枠の生成
 */
import "server-only";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  effectiveDayCalendar,
  generateAvailableSlots,
  type HolidayOverride,
} from "@/lib/calendar";
import { formatDateJst } from "@/lib/timezone";
import type { Database } from "@/types/database";

/**
 * 公開向け空き枠計算では、reservations テーブルの (start_at, end_at, status) を
 * 読む必要がある。anon クライアントには RLS で SELECT 権限がないため、
 * service_role を使った admin クライアントで読み出す。
 *
 * service_role 未設定なら null を返し、呼び出し元は「予約=空」として fall back する。
 * 返るデータは時刻と状態のみで、PII は含まない。
 */
function tryGetAdminClient() {
  try {
    return createSupabaseAdminClient();
  } catch (e) {
    console.warn(
      "[queries] admin client unavailable, availability lookup will treat as no existing reservations:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

export type MenuRow = Database["public"]["Tables"]["menus"]["Row"];

/**
 * Supabase の PostgrestError は標準 Error 派生ではなく、プロパティが
 * non-enumerable な形で持っているため、そのまま console.error すると `{}` に
 * 見えてしまう。実際の message / code / details / hint を引き出して文字列化する。
 */
function formatSupabaseError(err: unknown): string {
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

/**
 * ネットワーク / DNS / 接続拒否のような「Supabase に到達できない」種類の
 * エラーかを判定する。プロジェクト一時停止・WiFi 切断・URL 誤設定など、
 * 「コードのバグではない環境問題」を console.warn に降格して dev オーバーレイを
 * 鳴らさないために使う。
 */
function isNetworkUnreachable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = ((err as { message?: string }).message ?? "").toLowerCase();
  const details = (
    (err as { details?: string }).details ?? ""
  ).toLowerCase();
  const blob = msg + " " + details;
  return (
    blob.includes("fetch failed") ||
    blob.includes("enotfound") ||
    blob.includes("econnrefused") ||
    blob.includes("etimedout") ||
    blob.includes("getaddrinfo") ||
    blob.includes("network")
  );
}

function logSupabaseError(
  label: string,
  err: unknown,
): void {
  const formatted = formatSupabaseError(err);
  if (isNetworkUnreachable(err)) {
    console.warn(
      `[queries] ${label}: Supabase 到達不能（${formatted}）。`
      + " プロジェクトが一時停止/削除されていないか、ネットワークが正常かをご確認ください。",
    );
    return;
  }
  console.error(`${label}:`, formatted);
}

/** 公開メニュー一覧（is_active=true）。Server Component から呼ぶ。 */
export async function fetchActiveMenus(): Promise<MenuRow[]> {
  if (!isSupabaseConfigured()) {
    console.warn("[queries] Supabase 未設定のため fetchActiveMenus を空で返します");
    return [];
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("menus")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      logSupabaseError("fetchActiveMenus error", error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    logSupabaseError("fetchActiveMenus exception", e);
    return [];
  }
}

/** 1ヶ月分の holiday_overrides を取得 */
export async function fetchHolidayOverridesInRange(
  fromDateStr: string,
  toDateStr: string,
): Promise<HolidayOverride[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("holiday_overrides")
      .select("date, type, open_time, close_time, reason")
      .gte("date", fromDateStr)
      .lte("date", toDateStr);
    if (error) {
      logSupabaseError("fetchHolidayOverridesInRange error", error);
      return [];
    }
    return (data ?? []) as HolidayOverride[];
  } catch (e) {
    logSupabaseError("fetchHolidayOverridesInRange exception", e);
    return [];
  }
}

/**
 * 指定日の空き枠を計算。
 *
 * @param dateStr "YYYY-MM-DD" (JST)
 * @param totalDurationMin 合計施術時間（分）
 * @param leadTimeMin 直前予約のブロック時間（分）
 */
export async function fetchAvailableSlotsForDate(params: {
  dateStr: string;
  totalDurationMin: number;
  leadTimeMin?: number;
}): Promise<{ startIso: string; endIso: string; label: string }[]> {
  const { dateStr, totalDurationMin, leadTimeMin = 60 } = params;

  if (totalDurationMin <= 0) return [];

  try {
    // anon クライアント（RLS 適用）: 公開可能な menus / holiday_overrides 用
    const supabase = await createSupabaseServerClient();
    // admin クライアント（RLS bypass）: 既存予約の読み出し用（時刻と状態のみ取得）
    const admin = tryGetAdminClient();

    // その日 0:00〜23:59 JST に start_at が含まれる予約を検索
    // （end_at がはみ出ても重複判定で吸収される）
    const dayStartUtc = new Date(`${dateStr}T00:00:00+09:00`);
    const dayEndUtc = new Date(`${dateStr}T23:59:59+09:00`);

    const [reservationsRes, overridesRes] = await Promise.all([
      admin
        ? admin
            .from("reservations")
            .select("start_at, end_at, status")
            .gte("start_at", dayStartUtc.toISOString())
            .lte("start_at", dayEndUtc.toISOString())
            .in("status", ["pending", "confirmed"])
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("holiday_overrides")
        .select("date, type, open_time, close_time, reason")
        .eq("date", dateStr),
    ]);

    if (reservationsRes.error) {
      logSupabaseError("availability reservations error", reservationsRes.error);
    }
    if (overridesRes.error) {
      logSupabaseError("availability overrides error", overridesRes.error);
    }

    const slots = generateAvailableSlots({
      dateStr,
      totalDurationMin,
      existingReservations: (reservationsRes.data ?? []).map((r) => ({
        start: new Date(r.start_at),
        end: new Date(r.end_at),
      })),
      overrides: (overridesRes.data ?? []) as HolidayOverride[],
      leadTimeMin,
    });

    return slots.map((s) => ({
      startIso: s.start.toISOString(),
      endIso: s.end.toISOString(),
      label: s.label,
    }));
  } catch (e) {
    logSupabaseError("fetchAvailableSlotsForDate exception", e);
    return [];
  }
}

/** 表 UI 1日分のサマリ */
export type DayAvailability =
  | {
      date: string; // YYYY-MM-DD
      isOpen: true;
      open: string; // "HH:mm"
      close: string; // "HH:mm"
      slots: { startIso: string; endIso: string; label: string }[];
    }
  | {
      date: string;
      isOpen: false;
      reason: string;
      slots: never[];
    };

/**
 * 期間指定で空き枠を取得（表形式 UI 用）。
 * 1回のクエリで reservations + holiday_overrides を取得し、各日ごとに枠を計算する。
 */
export async function fetchAvailableSlotsForRange(params: {
  fromDateStr: string;
  toDateStr: string;
  totalDurationMin: number;
  leadTimeMin?: number;
}): Promise<DayAvailability[]> {
  const { fromDateStr, toDateStr, totalDurationMin, leadTimeMin = 60 } = params;
  if (totalDurationMin <= 0) return [];

  // 日付範囲を生成（UTC 12:00 を基準にすれば DST 跨ぎでもズレない）
  const fromAnchor = new Date(`${fromDateStr}T12:00:00+09:00`);
  const toAnchor = new Date(`${toDateStr}T12:00:00+09:00`);
  const dateStrs: string[] = [];
  for (
    let cursor = new Date(fromAnchor);
    cursor.getTime() <= toAnchor.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    dateStrs.push(formatDateJst(cursor));
  }
  if (dateStrs.length === 0) return [];

  // Supabase 未設定なら overrides=空・予約=空として枠を生成（営業時間情報だけは表示できる）
  if (!isSupabaseConfigured()) {
    return dateStrs.map((dateStr) =>
      buildDayAvailability(dateStr, [], [], totalDurationMin, leadTimeMin),
    );
  }

  try {
    // anon クライアント（RLS 適用）: holiday_overrides 用
    const supabase = await createSupabaseServerClient();
    // admin クライアント（RLS bypass）: 既存予約の読み出し用
    const admin = tryGetAdminClient();
    const dayStartUtc = new Date(`${fromDateStr}T00:00:00+09:00`);
    const dayEndUtc = new Date(`${toDateStr}T23:59:59+09:00`);

    const [reservationsRes, overridesRes] = await Promise.all([
      admin
        ? admin
            .from("reservations")
            .select("start_at, end_at, status")
            .gte("start_at", dayStartUtc.toISOString())
            .lte("start_at", dayEndUtc.toISOString())
            .in("status", ["pending", "confirmed"])
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("holiday_overrides")
        .select("date, type, open_time, close_time, reason")
        .gte("date", fromDateStr)
        .lte("date", toDateStr),
    ]);

    if (reservationsRes.error) {
      logSupabaseError(
        "fetchAvailableSlotsForRange reservations error",
        reservationsRes.error,
      );
    }
    if (overridesRes.error) {
      logSupabaseError(
        "fetchAvailableSlotsForRange overrides error",
        overridesRes.error,
      );
    }

    const reservations = (reservationsRes.data ?? []).map((r) => ({
      start: new Date(r.start_at),
      end: new Date(r.end_at),
    }));
    const overrides = (overridesRes.data ?? []) as HolidayOverride[];

    return dateStrs.map((dateStr) =>
      buildDayAvailability(
        dateStr,
        reservations,
        overrides,
        totalDurationMin,
        leadTimeMin,
      ),
    );
  } catch (e) {
    logSupabaseError("fetchAvailableSlotsForRange exception", e);
    // ネットワーク不通時は overrides・予約とも空として営業時間ベースの枠を返す
    return dateStrs.map((dateStr) =>
      buildDayAvailability(dateStr, [], [], totalDurationMin, leadTimeMin),
    );
  }
}

function buildDayAvailability(
  dateStr: string,
  allReservations: { start: Date; end: Date }[],
  overrides: HolidayOverride[],
  totalDurationMin: number,
  leadTimeMin: number,
): DayAvailability {
  const cal = effectiveDayCalendar(dateStr, overrides);
  if (!cal.isOpen) {
    return {
      date: dateStr,
      isOpen: false,
      reason: cal.reason,
      slots: [] as never[],
    };
  }

  // 当日の予約だけにフィルタ（start_at の JST 日付が一致）
  const dayReservations = allReservations.filter(
    (r) => formatDateJst(r.start) === dateStr,
  );

  const slots = generateAvailableSlots({
    dateStr,
    totalDurationMin,
    existingReservations: dayReservations,
    overrides,
    leadTimeMin,
  });

  return {
    date: dateStr,
    isOpen: true,
    open: cal.open,
    close: cal.close,
    slots: slots.map((s) => ({
      startIso: s.start.toISOString(),
      endIso: s.end.toISOString(),
      label: s.label,
    })),
  };
}
