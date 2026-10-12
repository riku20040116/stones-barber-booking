/**
 * 貼り付け取り込み: データベースから読む部分（サーバー専用）。
 *   - メニュー（読み取り用の表を作る）
 *   - 判定に使う、すでにある予約・臨時休業
 */
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { HolidayOverride } from "@/lib/calendar";
import { formatDateJst, formatTimeJst, jstWallToUtc } from "@/lib/timezone";
import codeDefs from "@/lib/sheet/menu-codes.json";
import { MENU_ALIASES } from "./aliases.ts";
import { buildCatalog } from "./parse.ts";
import type { Catalog, CodeDefsInput, ExistingReservation, MenuEntry } from "./types";

export async function loadCatalog(): Promise<Catalog> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("menus")
    .select("id, slug, name, price, duration_min, is_option")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`メニューを読めませんでした（${error.message}）`);
  const menus: MenuEntry[] = (data ?? []).map((m) => ({
    slug: m.slug,
    id: m.id,
    name: m.name,
    price: m.price,
    durationMin: m.duration_min,
    isOption: m.is_option,
    code: null,
  }));
  return buildCatalog(menus, codeDefs as CodeDefsInput, MENU_ALIASES);
}

export type JudgeData = {
  existing: ExistingReservation[];
  overrides: HolidayOverride[];
};

/** fromDate〜toDate（日本時間・両端を含む）の有効な予約と臨時休業 */
export async function loadJudgeData(fromDate: string, toDate: string): Promise<JudgeData> {
  const admin = createSupabaseAdminClient();
  const fromUtc = jstWallToUtc(fromDate, "00:00");
  const toUtc = new Date(jstWallToUtc(toDate, "00:00").getTime() + 24 * 60 * 60 * 1000);

  const [resv, hol] = await Promise.all([
    admin
      .from("reservations")
      .select("id, code, start_at, end_at, customer_name")
      .in("status", ["pending", "confirmed"])
      .lt("start_at", toUtc.toISOString())
      .gt("end_at", fromUtc.toISOString())
      .order("start_at", { ascending: true }),
    admin
      .from("holiday_overrides")
      .select("date, type, open_time, close_time, reason")
      .gte("date", fromDate)
      .lte("date", toDate),
  ]);
  if (resv.error) throw new Error(`予約を読めませんでした（${resv.error.message}）`);
  if (hol.error) throw new Error(`お休みの設定を読めませんでした（${hol.error.message}）`);

  return {
    existing: (resv.data ?? []).map((r) => {
      const s = new Date(r.start_at);
      const e = new Date(r.end_at);
      return {
        id: r.id,
        code: r.code,
        date: formatDateJst(s),
        start: formatTimeJst(s),
        // 日をまたぐ予約は無い前提。念のため 23:59 で止める
        end: formatDateJst(e) === formatDateJst(s) ? formatTimeJst(e) : "23:59",
        name: r.customer_name,
      };
    }),
    overrides: (hol.data ?? []) as HolidayOverride[],
  };
}

/** 今の日本時間 */
export function nowJst(now: Date = new Date()): { date: string; time: string } {
  return { date: formatDateJst(now), time: formatTimeJst(now) };
}
