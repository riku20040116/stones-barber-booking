/**
 * 全アプリで Asia/Tokyo を扱うためのヘルパ。
 *
 * 設計方針:
 *  - DB には常に UTC (timestamptz) で保存する。
 *  - UI / フォーム入力はすべて JST の壁時計時刻として扱う。
 *  - 変換はこのファイルに集約し、ad-hoc な new Date() の利用を避ける。
 */

import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, addMinutes, parseISO } from "date-fns";

export const TZ = "Asia/Tokyo";

/** "YYYY-MM-DD" 形式の日付文字列 */
export type DateString = string;
/** "HH:mm" 形式の時刻文字列 */
export type TimeString = string;

/**
 * JST の壁時計（"YYYY-MM-DD" + "HH:mm"）を UTC の Date に変換。
 * 例: ("2026-05-02", "14:30") → Date 2026-05-02T05:30:00Z
 */
export function jstWallToUtc(date: DateString, time: TimeString): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

// NOTE: 以前は date-fns-tz の `format`（= 変換しない整形関数）を使っていたが、
// これはサーバーのローカルタイムゾーン（Vercel = UTC）で時刻を出してしまい、
// JST 9:30 のスロットが本番では "00:30" ラベルになるバグの原因だった。
// `formatInTimeZone(date, TZ, fmt)` は内部で確実に JST へ変換してから整形するため、
// 実行環境のタイムゾーンに依存しない。

/** UTC Date → JST 表記の "YYYY-MM-DD" */
export function formatDateJst(date: Date): DateString {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

/** UTC Date → JST 表記の "HH:mm" */
export function formatTimeJst(date: Date): TimeString {
  return formatInTimeZone(date, TZ, "HH:mm");
}

/** UTC Date → JST 表記の "YYYY-MM-DD HH:mm" */
export function formatDateTimeJst(date: Date, withSeconds = false): string {
  return formatInTimeZone(
    date,
    TZ,
    withSeconds ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm",
  );
}

/** 表示用の整形（曜日付き） */
export function formatHumanJst(date: Date): string {
  const dow = ["日", "月", "火", "水", "木", "金", "土"][
    Number(formatInTimeZone(date, TZ, "i")) % 7
  ];
  return `${formatInTimeZone(date, TZ, "yyyy/MM/dd")}（${dow}）${formatInTimeZone(
    date,
    TZ,
    "HH:mm",
  )}`;
}

/** "YYYY-MM-DD" を JST 0:00 の UTC Date に */
export function dateStringToUtcMidnight(dateStr: DateString): Date {
  return jstWallToUtc(dateStr, "00:00");
}

/** UTC Date が JST で何曜日か (0=日, 6=土) */
export function getDowJst(date: Date): number {
  // date-fns-tz の format で 'i' は ISO 月曜=1...日曜=7。Sun=0 への変換が必要。
  const iso = Number(formatInTimeZone(date, TZ, "i"));
  return iso % 7; // ISO 7(日) → 0
}

/** JST 上の "今日" を UTC Date で */
export function todayJstStart(now: Date = new Date()): Date {
  const dateStr = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  return jstWallToUtc(dateStr, "00:00");
}

/** N 日後の JST 日付文字列 */
export function dateStringAfterDays(base: Date, days: number): DateString {
  return formatDateJst(addDays(base, days));
}

export { addMinutes, parseISO, addDays };
