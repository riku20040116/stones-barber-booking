"use client";
/**
 * 当月＋翌月の月別カレンダー。
 *  - 公開ページ・予約フォーム両方で使えるように切り出した。
 *  - `onSelectDate` を渡すとクリック可能。渡さなければ表示のみ。
 *  - `weekStart` を渡すと該当週をハイライト（予約フォーム連動用）。
 */
import * as React from "react";
import {
  effectiveDayCalendar,
  type HolidayOverride,
} from "@/lib/calendar";
import { formatDateJst, getDowJst, jstWallToUtc } from "@/lib/timezone";

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function todayStr(): string {
  return formatDateJst(new Date());
}

function shiftDate(dateStr: string, days: number): string {
  const anchor = new Date(`${dateStr}T12:00:00+09:00`);
  const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
  return formatDateJst(shifted);
}

function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

function addMonths(dateStr: string, n: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const totalIdx = (y as number) * 12 + ((m as number) - 1) + n;
  const ny = Math.floor(totalIdx / 12);
  const nm = (totalIdx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function dowOf(dateStr: string): number {
  return getDowJst(jstWallToUtc(dateStr, "12:00"));
}

function compare(a: string, b: string): number {
  return a.localeCompare(b);
}

export type MonthlyCalendarProps = {
  overrides: HolidayOverride[];
  /** 強調表示する週（先頭日）。省略するとハイライトなし。 */
  weekStart?: string;
  /** 渡すとクリック可能。日付を渡すコールバック。 */
  onSelectDate?: (dateStr: string) => void;
  /** 予約可能上限の "from" 日付。クリック対象日の上限制御に使う。省略時は当月＋翌月いっぱい。 */
  maxFrom?: string;
  /** カレンダーの表示月数。デフォルト 2（当月＋翌月）。 */
  months?: number;
  /** 選択中メニューで空き枠がゼロの日付（"YYYY-MM-DD"）。グレーアウト＆クリック不可にする。 */
  fullDates?: Set<string>;
  className?: string;
};

export function MonthlyCalendar({
  overrides,
  weekStart,
  onSelectDate,
  maxFrom,
  months = 2,
  fullDates,
  className,
}: MonthlyCalendarProps) {
  const today = todayStr();
  const monthStarts: string[] = [];
  const baseMonth = startOfMonth(today);
  for (let i = 0; i < months; i++) {
    monthStarts.push(addMonths(baseMonth, i));
  }

  return (
    <div className={"space-y-4 " + (className ?? "")}>
      <div className="grid gap-6 md:grid-cols-2">
        {monthStarts.map((m) => (
          <MonthGrid
            key={m}
            monthStart={m}
            overrides={overrides}
            weekStart={weekStart}
            today={today}
            maxFrom={maxFrom}
            onSelectDate={onSelectDate}
            fullDates={fullDates}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground">
        {weekStart && (
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded bg-primary" />
            選択中の週
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-rose-200 dark:bg-rose-900/60" />
          定休・臨時休業
        </span>
        {fullDates && (
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded bg-zinc-300 dark:bg-zinc-700" />
            満員（空きなし）
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded bg-muted" />
          空きあり
        </span>
      </div>
    </div>
  );
}

function MonthGrid({
  monthStart,
  overrides,
  weekStart,
  today,
  maxFrom,
  onSelectDate,
  fullDates,
}: {
  monthStart: string;
  overrides: HolidayOverride[];
  weekStart?: string;
  today: string;
  maxFrom?: string;
  onSelectDate?: (dateStr: string) => void;
  fullDates?: Set<string>;
}) {
  const [y, m] = monthStart.split("-").map(Number);
  const totalDays = daysInMonth(y as number, m as number);
  const firstDow = dowOf(monthStart);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length < 42) cells.push(null);

  const weekEnd = weekStart ? shiftDate(weekStart, 6) : null;
  const interactive = !!onSelectDate;

  return (
    <div>
      <div className="mb-2 text-center text-sm font-medium tabular-nums">
        {y} 年 {m} 月
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-[11px]">
        {DOW_LABELS.map((label, idx) => (
          <div
            key={label}
            className={
              "py-1 font-medium " +
              (idx === 0
                ? "text-rose-600"
                : idx === 6
                  ? "text-sky-600"
                  : "text-muted-foreground")
            }
          >
            {label}
          </div>
        ))}
        {cells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }
          const cal = effectiveDayCalendar(dateStr, overrides);
          const isPast = compare(dateStr, today) < 0;
          const beyondMax = maxFrom
            ? compare(dateStr, shiftDate(maxFrom, 6)) > 0
            : false;
          const inSelectedWeek =
            weekStart && weekEnd
              ? compare(dateStr, weekStart) >= 0 &&
                compare(dateStr, weekEnd) <= 0
              : false;
          const isToday = dateStr === today;
          const dow = dowOf(dateStr);
          const dayNum = Number(dateStr.slice(-2));

          const closed = !cal.isOpen;
          // 営業日だが選択メニューの空き枠がゼロ = 満員
          const isFull = !closed && !isPast && (fullDates?.has(dateStr) ?? false);
          const disabled = isPast || beyondMax || isFull || !interactive;

          let bgClass = "";
          let textClass = "";

          if (isPast) {
            bgClass = "bg-transparent";
            textClass = "text-muted-foreground/30";
          } else if (inSelectedWeek) {
            bgClass = "bg-primary text-primary-foreground";
            textClass = "";
          } else if (closed) {
            bgClass = "bg-rose-100 dark:bg-rose-950/40";
            textClass = "text-rose-700 dark:text-rose-300";
          } else if (isFull) {
            // 満員: グレーアウト
            bgClass = "bg-zinc-200 dark:bg-zinc-700/60";
            textClass = "text-zinc-400 dark:text-zinc-500";
          } else {
            bgClass = interactive ? "bg-muted/40 hover:bg-muted" : "bg-muted/40";
            textClass =
              dow === 0
                ? "text-rose-600"
                : dow === 6
                  ? "text-sky-600"
                  : "text-foreground";
          }

          const baseClass =
            "relative flex aspect-square items-center justify-center rounded text-[11px] font-medium transition-colors " +
            bgClass +
            " " +
            textClass +
            (isToday && !inSelectedWeek ? " ring-1 ring-primary" : "") +
            (disabled ? " cursor-default" : " cursor-pointer");

          const content = (
            <>
              <span
                className={(closed || isFull) && !isPast ? "text-[10px]" : ""}
              >
                {dayNum}
              </span>
              {closed && !isPast && !inSelectedWeek && (
                <span className="absolute inset-x-0 bottom-0 text-[10px] font-bold leading-none">
                  休
                </span>
              )}
              {isFull && !inSelectedWeek && (
                <span className="absolute inset-x-0 bottom-0 text-[9px] font-bold leading-none">
                  満
                </span>
              )}
            </>
          );

          if (!interactive) {
            return (
              <div
                key={dateStr}
                aria-label={`${dateStr}${closed ? "（休業）" : ""}`}
                className={baseClass}
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate?.(dateStr)}
              aria-label={`${dateStr}${
                closed ? "（休業）" : isFull ? "（満員）" : ""
              }を含む週へ`}
              className={baseClass}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
