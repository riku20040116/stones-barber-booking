/**
 * 判定用の「その日の営業時間」。既存の営業日ルール（calendar.ts）をそのまま使う。
 * 画面とサーバーの両方から使う。
 */
import { effectiveDayCalendar, type HolidayOverride } from "@/lib/calendar";
import type { DayHours } from "./types";

export function makeDayHours(overrides: HolidayOverride[]): (date: string) => DayHours {
  return (date) => {
    const cal = effectiveDayCalendar(date, overrides);
    if (!cal.isOpen) return { isOpen: false, reason: cal.reason.replace(/です$/, "") };
    // DB の時刻が "09:30:00" の形でも比べられるようにそろえる
    return { isOpen: true, open: cal.open.slice(0, 5), close: cal.close.slice(0, 5) };
  };
}
