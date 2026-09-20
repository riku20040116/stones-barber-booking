/**
 * 営業日 / 営業時間 / 空き枠 のロジック。
 * STONE'S BARBER のビジネスルール:
 *   - 平日 9:30〜19:30
 *   - 土日祝 9:00〜19:00
 *   - 毎週月曜 定休
 *   - 第3月曜・火曜 は連休（つまり 第3火曜 も休み）
 *   - Web キャンセルは予約日の 7 日前 0:00 まで（isWebCancellable 参照）
 *   - 予約スロット粒度: 30 分
 *
 * 例外:
 *   - holidays テーブル（DB）で臨時休業 / 例外営業時間を上書き可能。
 *     ここでは「ベースのカレンダー」をハードコードし、DB の例外は別関数で重ねる。
 */

import {
  type DateString,
  type TimeString,
  formatDateJst,
  formatTimeJst,
  getDowJst,
  jstWallToUtc,
  parseISO,
} from "./timezone";

export const SLOT_GRANULARITY_MIN = 15;

// =============================================================================
// 予約ルール（DB 側の create_reservation とセットで維持すること）
//   supabase/migrations/20260920000002_booking_limits.sql
// ここを変えたら必ず同じ値にマイグレーションも直す。
// =============================================================================

/** 今日から何ヶ月先まで予約できるか */
export const BOOKING_HORIZON_MONTHS = 3;
/** 上の期間内に 1 人が持てる有効な予約の上限 */
export const MAX_RESERVATIONS_IN_HORIZON = 3;
/** 既存予約の前後この日数以内は予約できない（= 1 週間に 2 件入れられない） */
export const MIN_GAP_DAYS_BETWEEN_RESERVATIONS = 7;

/**
 * 予約可能な最終日（JST）を返す。
 *
 * 暦どおりに月を足す。月末は翌月の同日が無い場合に丸める。
 * 例: 11/30 → 2/28（うるう年なら 2/29）
 *
 * DB 側は `now() + interval '3 months'` で判定しているので、
 * 画面に出す上限がそれを超えないよう同じ数え方にしている。
 */
export function bookingHorizonDateStr(now: Date = new Date()): DateString {
  const todayStr = formatDateJst(now);
  const [y, m, d] = todayStr.split("-").map(Number) as [number, number, number];
  const targetIdx = y * 12 + (m - 1) + BOOKING_HORIZON_MONTHS;
  const ty = Math.floor(targetIdx / 12);
  const tm = (targetIdx % 12) + 1;
  // 対象月の日数に丸める（3/31 の 3 ヶ月後は 6/30）
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}` as DateString;
}

// 昼食休憩のルール:
//   営業時間と LUNCH_ZONE の重なり区間に、必ず LUNCH_BREAK_MIN_MIN 以上
//   連続で空いているウィンドウが残るよう、新規予約候補をフィルタする。
//   時間帯は「決まった時間ではなく予約状況に合わせる」運用のため、
//   この時間内であればどこに昼休が入っても OK とみなす。
export const LUNCH_ZONE_OPEN: TimeString = "11:00";
export const LUNCH_ZONE_CLOSE: TimeString = "15:00";
export const LUNCH_BREAK_MIN_MIN = 60;

// 隙間ルール: 既存予約と新規予約の間に「実質 1 コマ or 2 コマ」しか空かない
//   配置は受け付けない（その隙間がほぼ予約不可になり店全体の効率が下がるため）。
//   0 コマ（バック・トゥ・バック）は許可、3 コマ以上も許可。
const GAP_FORBIDDEN_SLOTS: ReadonlySet<number> = new Set([1, 2]);

export type DayCalendar =
  | {
      isOpen: true;
      open: TimeString;
      close: TimeString;
      reason?: string;
    }
  | {
      isOpen: false;
      reason: string;
    };

/** day-of-month に対する 第N週判定 */
export function nthWeekOfMonth(dayOfMonth: number): number {
  return Math.ceil(dayOfMonth / 7);
}

/** 第3月曜・火曜の連休判定（火曜のみ。月曜は通常定休でカバー） */
export function isThirdTuesdayInJst(dateStr: DateString): boolean {
  const utc = jstWallToUtc(dateStr, "12:00");
  if (getDowJst(utc) !== 2) return false; // 火曜以外
  const dom = Number(dateStr.slice(-2));
  return nthWeekOfMonth(dom) === 3;
}

/** 「今日以降 / 当日含む？」を制御するためのフラグつき判定 */
export function isPastDate(dateStr: DateString, now: Date = new Date()): boolean {
  return dateStr < formatDateJst(now);
}

/** ハードコード済みの定休判定（DB 例外を含まない） */
export function defaultClosureReason(dateStr: DateString): string | null {
  const utc = jstWallToUtc(dateStr, "12:00");
  const dow = getDowJst(utc);
  if (dow === 1) return "毎週月曜は定休日です";
  if (isThirdTuesdayInJst(dateStr)) return "第3火曜は連休のため休業です";
  return null;
}

/** ベースカレンダー（DB 例外抜き） */
export function baseDayCalendar(dateStr: DateString): DayCalendar {
  const closure = defaultClosureReason(dateStr);
  if (closure) return { isOpen: false, reason: closure };

  const dow = getDowJst(jstWallToUtc(dateStr, "12:00"));
  // 0=日, 6=土 ... 平日は 1..5 だが月曜は除外済
  if (dow === 0 || dow === 6) {
    return { isOpen: true, open: "09:00", close: "19:00" };
  }
  return { isOpen: true, open: "09:30", close: "19:30" };
}

/** holiday_overrides の型（DB 由来） */
export type HolidayOverride = {
  date: DateString;
  type: "closed" | "special_hours";
  open_time?: TimeString | null;
  close_time?: TimeString | null;
  reason?: string | null;
};

/** ベースカレンダー + DB 例外のマージ */
export function effectiveDayCalendar(
  dateStr: DateString,
  overrides: HolidayOverride[],
): DayCalendar {
  const base = baseDayCalendar(dateStr);
  const override = overrides.find((o) => o.date === dateStr);
  if (!override) return base;

  if (override.type === "closed") {
    return { isOpen: false, reason: override.reason ?? "臨時休業" };
  }

  // special_hours: 営業時間を上書き（定休日でも営業可とする）
  return {
    isOpen: true,
    open: override.open_time ?? "09:30",
    close: override.close_time ?? "19:00",
    reason: override.reason ?? undefined,
  };
}

/**
 * 空き枠の候補を生成する。
 * 既存予約と所要時間を考慮して、施術が枠に収まる開始時刻のみ返す。
 *
 * 「busy」の判定ルール（UX 的に、既存予約の前の枠まで×にしない方針）:
 *   候補開始時刻 cursor が以下のいずれかにマッチしたら busy（× 表示）:
 *     - cursor が既存予約の時間帯 [r.start, r.end] の中
 *     - cursor === r.end（= 直後1枠分は予約済 / 空けておく）
 *   cursor < r.start の枠は、たとえ cursor + duration が r 内に食い込む長尺予約
 *   であっても ○ のまま（実際の重複は DB の EXCLUDE 制約で弾く）。
 *
 * @param dateStr 対象日 "YYYY-MM-DD"
 * @param totalDurationMin 必要な合計施術時間（分）
 * @param existingReservations 当日既存の予約 [start_at, end_at] の UTC Date 配列
 * @param overrides DB 由来の例外
 * @param now 現在時刻（テスト用）
 * @param leadTimeMin 直前予約の余裕（分）。当日予約 = 0 で許可、>0 でN分先までブロック
 */
export function generateAvailableSlots(params: {
  dateStr: DateString;
  totalDurationMin: number;
  existingReservations: { start: Date; end: Date }[];
  overrides: HolidayOverride[];
  now?: Date;
  leadTimeMin?: number;
  granularityMin?: number;
}): { start: Date; end: Date; label: string }[] {
  const {
    dateStr,
    totalDurationMin,
    existingReservations,
    overrides,
    now = new Date(),
    leadTimeMin = 0,
    granularityMin = SLOT_GRANULARITY_MIN,
  } = params;

  const cal = effectiveDayCalendar(dateStr, overrides);
  if (!cal.isOpen) return [];

  // 過去日付なら空
  if (dateStr < formatDateJst(now)) return [];

  const dayStart = jstWallToUtc(dateStr, cal.open);
  const dayEnd = jstWallToUtc(dateStr, cal.close);
  const earliest = new Date(now.getTime() + leadTimeMin * 60_000);

  // 昼食休憩用ウィンドウ。営業時間と LUNCH_ZONE の重なり区間で計算する。
  const lunchZoneStartTime: TimeString =
    cal.open > LUNCH_ZONE_OPEN ? cal.open : LUNCH_ZONE_OPEN;
  const lunchZoneEndTime: TimeString =
    cal.close < LUNCH_ZONE_CLOSE ? cal.close : LUNCH_ZONE_CLOSE;
  const hasLunchZone = lunchZoneStartTime < lunchZoneEndTime;
  const lunchZoneStartUtc = hasLunchZone
    ? jstWallToUtc(dateStr, lunchZoneStartTime)
    : null;
  const lunchZoneEndUtc = hasLunchZone
    ? jstWallToUtc(dateStr, lunchZoneEndTime)
    : null;

  type Slot = { start: Date; end: Date; label: string };

  // === フェーズ1: ハードルール（営業時間・lead time・既存予約との重複）のみ ===
  const hardSlots: Slot[] = [];
  let cursor = new Date(dayStart);
  while (true) {
    const slotEnd = new Date(cursor.getTime() + totalDurationMin * 60_000);
    if (slotEnd.getTime() > dayEnd.getTime()) break;

    if (cursor.getTime() < earliest.getTime()) {
      cursor = new Date(cursor.getTime() + granularityMin * 60_000);
      continue;
    }

    // 既存予約と直接重なるか? cursor が [r.start, r.end] に含まれる
    // （r.end も含むため "直後1枠" バッファになる）
    const busy = existingReservations.some(
      (r) =>
        cursor.getTime() >= r.start.getTime() &&
        cursor.getTime() <= r.end.getTime(),
    );
    if (!busy) {
      hardSlots.push({
        start: new Date(cursor),
        end: slotEnd,
        label: formatTimeJst(cursor),
      });
    }
    cursor = new Date(cursor.getTime() + granularityMin * 60_000);
  }

  if (hardSlots.length === 0) return [];

  // === フェーズ2: ソフトルール（隙間・昼食休憩）でさらに絞り込む ===
  const softSlots = hardSlots.filter((s) => {
    // ② 隙間ルール: 既存予約と新規予約の間に 1〜2 コマだけ空く配置を除外
    const prevEnd = closestEndAtOrBefore(existingReservations, s.start);
    const nextStart = closestStartAtOrAfter(existingReservations, s.end);
    if (prevEnd) {
      const usable =
        ((s.start.getTime() - prevEnd.getTime()) / 60_000 - granularityMin) /
        granularityMin;
      if (GAP_FORBIDDEN_SLOTS.has(usable)) return false;
    }
    if (nextStart) {
      const usable =
        ((nextStart.getTime() - s.end.getTime()) / 60_000 - granularityMin) /
        granularityMin;
      if (GAP_FORBIDDEN_SLOTS.has(usable)) return false;
    }

    // ③ 昼食休憩ルール: 候補予約を加えても LUNCH_ZONE 内に
    //   LUNCH_BREAK_MIN_MIN 以上連続で空くウィンドウが残ること
    if (lunchZoneStartUtc && lunchZoneEndUtc) {
      const largestFreeMs = largestFreeWindowMs(lunchZoneStartUtc, lunchZoneEndUtc, [
        ...existingReservations,
        { start: s.start, end: s.end },
      ]);
      if (largestFreeMs < LUNCH_BREAK_MIN_MIN * 60_000) return false;
    }
    return true;
  });

  // ソフトルールで全滅した場合は、店としてキャパがある日を完全に閉じてしまわない
  // よう、ハードルールのみの枠にフォールバックする（昼食・隙間は努力目標扱い）。
  return softSlots.length > 0 ? softSlots : hardSlots;
}

// -----------------------------------------------------------------------------
// 補助関数
// -----------------------------------------------------------------------------

/** at と同じか前に終わる予約のうち、最も at に近い終了時刻 */
function closestEndAtOrBefore(
  reservations: { start: Date; end: Date }[],
  at: Date,
): Date | null {
  let best: Date | null = null;
  for (const r of reservations) {
    if (r.end.getTime() <= at.getTime()) {
      if (!best || r.end.getTime() > best.getTime()) best = r.end;
    }
  }
  return best;
}

/** at と同じか後に始まる予約のうち、最も at に近い開始時刻 */
function closestStartAtOrAfter(
  reservations: { start: Date; end: Date }[],
  at: Date,
): Date | null {
  let best: Date | null = null;
  for (const r of reservations) {
    if (r.start.getTime() >= at.getTime()) {
      if (!best || r.start.getTime() < best.getTime()) best = r.start;
    }
  }
  return best;
}

/**
 * `[windowStart, windowEnd)` 区間内で、既存予約に重ならない連続空きの
 * 最大長（ミリ秒）を返す。
 */
function largestFreeWindowMs(
  windowStart: Date,
  windowEnd: Date,
  reservations: { start: Date; end: Date }[],
): number {
  if (windowStart.getTime() >= windowEnd.getTime()) return 0;
  const sorted = [...reservations].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  let largest = 0;
  let cursorMs = windowStart.getTime();
  for (const r of sorted) {
    const rStart = Math.max(r.start.getTime(), windowStart.getTime());
    const rEnd = Math.min(r.end.getTime(), windowEnd.getTime());
    if (rEnd <= windowStart.getTime()) continue;
    if (rStart >= windowEnd.getTime()) break;
    if (rStart > cursorMs) {
      largest = Math.max(largest, rStart - cursorMs);
    }
    cursorMs = Math.max(cursorMs, rEnd);
  }
  if (cursorMs < windowEnd.getTime()) {
    largest = Math.max(largest, windowEnd.getTime() - cursorMs);
  }
  return largest;
}

/**
 * Web からのキャンセル可否を判定する。
 *  - ルール: 予約日の 7 日前 0:00（JST）が締切。
 *  - 例: 6/15 14:00 の予約 → 6/8 0:00（JST）まで Web キャンセル可。それ以降は店舗へ電話連絡。
 */
export const WEB_CANCEL_DEADLINE_DAYS_BEFORE = 7;

export function isWebCancellable(
  reservationStart: Date,
  now: Date = new Date(),
): boolean {
  const dateStr = formatDateJst(reservationStart);
  // 予約日 0:00 - WEB_CANCEL_DEADLINE_DAYS_BEFORE 日 が締切
  const cutoff = new Date(
    jstWallToUtc(dateStr, "00:00").getTime()
      - WEB_CANCEL_DEADLINE_DAYS_BEFORE * 24 * 60 * 60 * 1000,
  );
  return now.getTime() < cutoff.getTime();
}

/** 1ヶ月分のカレンダー（営業可否を Bool で返す） */
export function buildMonthCalendar(
  year: number,
  month: number, // 1-12
  overrides: HolidayOverride[],
): { date: DateString; isOpen: boolean; reason?: string }[] {
  const result: { date: DateString; isOpen: boolean; reason?: string }[] = [];
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  // 月の最終日を取得
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2, "0")}`;
    const cal = effectiveDayCalendar(dateStr, overrides);
    result.push({
      date: dateStr,
      isOpen: cal.isOpen,
      reason: cal.isOpen ? undefined : cal.reason,
    });
  }
  void firstDay;
  return result;
}

export { parseISO };
