/**
 * 読み取り結果（AI の出力）を、確認画面の行（DraftRow）に組み立てる。
 *
 *  - 列の日付を決める（手書きの月日 → 用紙の週 → 画面で指定した週 の順に採用）
 *  - メニュー記号を menus に対応づけ、金額・所要時間を出す
 *  - 名前から顧客リストの候補を探す
 *  - すでに入っている予約・今回の他の行との重複を調べる
 *  - 人が確認すべき点を warnings にまとめる
 *
 * ここでは何も登録しない。登録は import の commit アクションで行う。
 */
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  effectiveDayCalendar,
  type HolidayOverride,
} from "@/lib/calendar";
import { fetchHolidayOverridesInRange } from "@/lib/reservation/queries";
import { formatDateJst, formatTimeJst, jstWallToUtc } from "@/lib/timezone";

import type { SheetExtraction } from "./extract";
import { findCode, parseCourseText } from "./menu-codes";
import {
  SHEET_COLUMNS,
  type Confidence,
  type CustomerCandidate,
  type CustomerChoice,
  type DraftRow,
  type SheetColumn,
} from "./types";

// -----------------------------------------------------------------------------
// 文字列の正規化
// -----------------------------------------------------------------------------

/** DB の customer_name_key と同じ規則（全角半角の揺れと空白を無視） */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").normalize("NFKC").replace(/\D/g, "");
}

/** "9:30" "09：30" "0930" → "09:30"。解釈できなければ "" */
export function normalizeTime(raw: string): string {
  const s = raw.normalize("NFKC").trim();
  let m = s.match(/^(\d{1,2})\s*[:時.]\s*(\d{2})/);
  if (!m) m = s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) {
    const h = s.match(/^(\d{1,2})\s*時(半)?/);
    if (h) return `${h[1]!.padStart(2, "0")}:${h[2] ? "30" : "00"}`;
    return "";
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  return formatDateJst(new Date(d.getTime() + days * 86_400_000));
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------
// 日付
// -----------------------------------------------------------------------------

/**
 * A 列の日付（週の始まり）を決める。
 *   用紙に書かれた「この用紙の週」 → 画面で指定された週 → A 列の手書きの月日
 */
function resolveWeekStart(
  ex: SheetExtraction,
  fallbackWeekStart: string | null,
): string {
  const y = ex.week_year;
  const m = ex.week_month;
  const d = ex.week_day;
  if (y && m && d && isValidDate(y, m, d)) return ymd(y, m, d);
  if (fallbackWeekStart) return fallbackWeekStart;

  const colA = ex.columns.find((c) => c.column.trim().toUpperCase() === "A");
  if (colA?.month && colA.day) {
    const year = Number(formatDateJst(new Date()).slice(0, 4));
    if (isValidDate(year, colA.month, colA.day)) return ymd(year, colA.month, colA.day);
  }
  return "";
}

/** 列ごとの日付。手書きの月日を優先し、読めなければ 週の始まり + 列番号 */
function resolveColumnDate(
  weekStart: string,
  column: SheetColumn,
  month: number | null,
  day: number | null,
): { date: string; warning: string | null } {
  const idx = SHEET_COLUMNS.indexOf(column);
  const byWeek = weekStart ? addDays(weekStart, idx) : "";

  if (month && day) {
    // 年は週の始まりから取る。12 月の週に 1 月の日付が出てきたら翌年。
    const baseYear = Number((weekStart || formatDateJst(new Date())).slice(0, 4));
    const baseMonth = Number((weekStart || formatDateJst(new Date())).slice(5, 7));
    const year = baseMonth === 12 && month === 1 ? baseYear + 1 : baseYear;
    if (isValidDate(year, month, day)) {
      const written = ymd(year, month, day);
      if (byWeek && written !== byWeek) {
        return {
          date: written,
          warning: `列 ${column} の日付（${month}/${day}）が週の並び（${byWeek.slice(5).replace("-", "/")}）と合いません`,
        };
      }
      return { date: written, warning: null };
    }
  }
  if (byWeek) return { date: byWeek, warning: null };
  return { date: "", warning: `列 ${column} の日付が読めません` };
}

// -----------------------------------------------------------------------------
// メニュー
// -----------------------------------------------------------------------------

export type MenuLite = {
  id: string;
  slug: string;
  name: string;
  price: number;
  duration_min: number;
  is_option: boolean;
};

export async function fetchMenusBySlug(): Promise<Map<string, MenuLite>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("menus")
    .select("id, slug, name, price, duration_min, is_option")
    .eq("is_active", true);
  if (error) {
    console.error("[sheet] menus fetch error:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((m) => [m.slug, m]));
}

export function menusForCodes(
  codes: readonly string[],
  bySlug: Map<string, MenuLite>,
): MenuLite[] {
  const out: MenuLite[] = [];
  for (const code of codes) {
    const def = findCode(code);
    const menu = def ? bySlug.get(def.slug) : undefined;
    if (menu) out.push(menu);
  }
  return out;
}

// -----------------------------------------------------------------------------
// 顧客の候補
// -----------------------------------------------------------------------------

export type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export async function fetchAllCustomers(): Promise<CustomerLite[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id, name, phone, email")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) {
    // マイグレーション未適用でも取り込み自体は進められるようにする
    console.error("[sheet] customers fetch error:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * 手書きの名前（姓だけのことが多い）から顧客リストの候補を探す。
 *  - 電話番号が一致          → 最有力
 *  - 名前が完全一致          → 有力
 *  - 姓だけ一致（前方一致）  → 候補
 */
export function findCandidates(
  writtenName: string,
  memoPhone: string,
  customers: readonly CustomerLite[],
): CustomerCandidate[] {
  const key = nameKey(writtenName);
  const digits = phoneDigits(memoPhone);
  const out: CustomerCandidate[] = [];

  for (const c of customers) {
    const ck = nameKey(c.name);
    let score = 0;
    let reason = "";
    if (digits.length >= 10 && phoneDigits(c.phone) === digits) {
      score = 10;
      reason = "電話番号が一致";
    } else if (key && ck === key) {
      score = 5;
      reason = "名前が一致";
    } else if (key.length >= 1 && ck.startsWith(key)) {
      score = 3;
      reason = "姓が一致";
    } else if (ck.length >= 1 && key.startsWith(ck)) {
      score = 2;
      reason = "名前の一部が一致";
    }
    if (score > 0) {
      out.push({ id: c.id, name: c.name, phone: c.phone, email: c.email, reason, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

/**
 * 最初の選択状態を決める。迷う場合は「未選択」にして人に選んでもらう。
 *   - 最有力の候補が 1 人だけ → その人
 *   - 候補なし                → 新規登録
 *   - 同点の候補が複数        → 未選択（画面で選ぶ）
 */
export function defaultChoice(
  writtenName: string,
  memoPhone: string,
  candidates: readonly CustomerCandidate[],
): CustomerChoice {
  if (candidates.length === 0) {
    return { mode: "new", name: writtenName.trim(), phone: memoPhone };
  }
  const top = candidates[0]!;
  const tied = candidates.filter((c) => c.score === top.score).length;
  if (tied === 1 && top.score >= 3) return { mode: "existing", id: top.id };
  return { mode: "unset" };
}

// -----------------------------------------------------------------------------
// 重複
// -----------------------------------------------------------------------------

type ExistingReservation = {
  id: string;
  code: string;
  start_at: string;
  end_at: string;
  customer_name: string;
  customer_record_id: string | null;
  source: string;
};

async function fetchActiveReservations(
  fromDate: string,
  toDate: string,
): Promise<ExistingReservation[]> {
  const admin = createSupabaseAdminClient();
  // 列を名指しすると、customer_record_id が無い環境（顧客リストのマイグレーション前）で
  // クエリごと失敗する。"*" なら列が無くても取れる。
  const { data, error } = await admin
    .from("reservations")
    .select("*")
    .in("status", ["pending", "confirmed"])
    .gte("start_at", jstWallToUtc(fromDate, "00:00").toISOString())
    .lt("start_at", jstWallToUtc(addDays(toDate, 1), "00:00").toISOString());
  if (error) {
    // 重複を確認できないまま「重複なし」と見せるのは危ないので、呼び出し元に止めてもらう
    console.error("[sheet] reservations fetch error:", error.message);
    throw new Error("既存の予約を確認できませんでした。時間をおいてもう一度お試しください。");
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    start_at: r.start_at,
    end_at: r.end_at,
    customer_name: r.customer_name,
    customer_record_id: r.customer_record_id ?? null,
    source: r.source,
  }));
}

function sameCustomer(row: DraftRow, r: ExistingReservation): boolean {
  if (row.customer.mode === "existing" && r.customer_record_id === row.customer.id) {
    return true;
  }
  const a = nameKey(row.name);
  const b = nameKey(r.customer_name);
  return a.length > 0 && (b === a || b.startsWith(a) || a.startsWith(b));
}

/** 行ごとの重複を計算して rows に書き込む（rows を直接更新する） */
async function attachConflicts(rows: DraftRow[]): Promise<void> {
  const dated = rows.filter((r) => r.include && r.date && r.start && r.end);
  for (const r of rows) r.conflicts = [];
  if (dated.length === 0) return;

  const dates = dated.map((r) => r.date).sort();
  const existing = await fetchActiveReservations(dates[0]!, dates[dates.length - 1]!);

  for (const row of dated) {
    const s = jstWallToUtc(row.date, row.start).getTime();
    const e = jstWallToUtc(row.date, row.end).getTime();

    for (const r of existing) {
      const rs = new Date(r.start_at).getTime();
      const re = new Date(r.end_at).getTime();
      if (s < re && rs < e) {
        const rStart = formatTimeJst(new Date(r.start_at));
        row.conflicts.push({
          kind: "system",
          reservationId: r.id,
          reservationCode: r.code,
          otherRowKey: null,
          name: r.customer_name,
          date: formatDateJst(new Date(r.start_at)),
          start: rStart,
          end: formatTimeJst(new Date(r.end_at)),
          source: r.source,
          likelySame: sameCustomer(row, r) && rStart === row.start,
        });
      }
    }

    for (const other of dated) {
      if (other.key === row.key || other.date !== row.date) continue;
      const os = toMin(other.start);
      const oe = toMin(other.end);
      if (toMin(row.start) < oe && os < toMin(row.end)) {
        row.conflicts.push({
          kind: "sheet",
          reservationId: null,
          reservationCode: null,
          otherRowKey: other.key,
          name: other.name,
          date: other.date,
          start: other.start,
          end: other.end,
          source: "handwritten",
          likelySame: false,
        });
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 行の検証
// -----------------------------------------------------------------------------

function computeWarnings(
  row: DraftRow,
  overrides: HolidayOverride[],
  todayStr: string,
  columnClosed: boolean,
): string[] {
  const w: string[] = [];
  if (!row.date) w.push("日付が決まっていません");
  if (!row.start) w.push("開始時刻が読めません");
  if (row.start && toMin(row.start) % 15 !== 0) w.push("開始時刻が 15 分単位になっていません");
  if (row.start && row.end && toMin(row.end) <= toMin(row.start)) {
    w.push("終了時刻が開始時刻より前になっています");
  }
  if (row.writtenStart && row.start && row.writtenStart !== row.start) {
    w.push(`「開始」欄の時刻（${row.writtenStart}）と四角の位置（${row.start}）が違います`);
  }
  if (!row.name.trim()) w.push("名前が読めません");
  if (row.codes.filter((c) => !c.startsWith("+")).length === 0) {
    w.push("メニュー（C1〜T1）が読めません");
  }
  if (row.unknownCodes.length > 0) {
    w.push(`凡例にない記号があります: ${row.unknownCodes.join(" ")}`);
  }
  if (row.start && row.end && row.menuDuration > 0) {
    const boxMin = toMin(row.end) - toMin(row.start);
    if (boxMin < row.menuDuration) {
      w.push(`四角の長さ（${boxMin}分）がメニューの所要時間（${row.menuDuration}分）より短いです`);
    }
  }
  if (row.customer.mode === "unset") w.push("どのお客様か選んでください");
  if (row.confidence !== "high") {
    w.push(row.confidence === "low" ? "読み取りの自信が低い行です" : "読み取りに自信がない部分があります");
  }
  if (row.date) {
    if (columnClosed) w.push("この日は予約表で「休」になっています");
    const cal = effectiveDayCalendar(row.date, overrides);
    if (!cal.isOpen) {
      w.push(`この日は休業日です（${cal.reason}）`);
    } else if (row.start && row.end) {
      if (row.start < cal.open || row.end > cal.close) {
        w.push(`営業時間（${cal.open}〜${cal.close}）の外です`);
      }
    }
    if (row.date < todayStr) w.push("過去の日付です");
  }
  return w;
}

function recomputeMoney(row: DraftRow, bySlug: Map<string, MenuLite>): void {
  const menus = menusForCodes(row.codes, bySlug);
  row.totalPrice = menus.reduce((s, m) => s + m.price, 0);
  row.menuDuration = menus.reduce((s, m) => s + m.duration_min, 0);
}

// -----------------------------------------------------------------------------
// 公開関数
// -----------------------------------------------------------------------------

function normalizeConfidence(raw: string): Confidence {
  const s = raw.trim().toLowerCase();
  return s === "high" || s === "medium" || s === "low" ? s : "low";
}

function normalizeColumn(raw: string): SheetColumn | null {
  const s = raw.normalize("NFKC").trim().toUpperCase();
  return (SHEET_COLUMNS as readonly string[]).includes(s) ? (s as SheetColumn) : null;
}

/** AI の読み取り結果から確認画面の行を作る */
export async function buildDraftRows(
  ex: SheetExtraction,
  fallbackWeekStart: string | null,
): Promise<{ rows: DraftRow[]; weekStart: string; sheetWarnings: string[] }> {
  const sheetWarnings = [...ex.warnings];
  if (!ex.sheet_found) {
    sheetWarnings.unshift("写真から予約表を見つけられませんでした。写真を確認してください。");
  }

  const weekStart = resolveWeekStart(ex, fallbackWeekStart);
  const [bySlug, customers] = await Promise.all([fetchMenusBySlug(), fetchAllCustomers()]);

  // お客様メモ（2 ページ目）: 丸数字 → 電話番号
  const memoPhones = new Map<number, string>();
  for (const c of ex.contacts) {
    if (c.phone.trim()) memoPhones.set(c.no, c.phone.trim());
  }

  const rows: DraftRow[] = [];
  const closedByColumn = new Map<SheetColumn, boolean>();
  let seq = 0;

  for (const col of ex.columns) {
    const column = normalizeColumn(col.column);
    if (!column) {
      sheetWarnings.push(`列「${col.column}」は A〜F のどれにも当たらないため読み飛ばしました`);
      continue;
    }
    closedByColumn.set(column, col.closed);
    const { date, warning } = resolveColumnDate(weekStart, column, col.month, col.day);
    if (warning) sheetWarnings.push(warning);

    for (const b of col.bookings) {
      seq += 1;
      const start = normalizeTime(b.box_start) || normalizeTime(b.written_start);
      const writtenStart = normalizeTime(b.written_start);

      // AI が記号に直したものと、手書きの文字列を解釈し直したものを合わせる
      const fromText = parseCourseText(b.course_text);
      const aiCodes = b.course_codes
        .map((c) => c.normalize("NFKC").trim().toUpperCase().replace(/^＋/, "+"))
        .filter((c) => findCode(c));
      const codes = [...new Set([...aiCodes, ...fromText.codes])];

      const menus = menusForCodes(codes, bySlug);
      const menuDuration = menus.reduce((s, m) => s + m.duration_min, 0);
      let end = normalizeTime(b.box_end);
      if (!end && start) end = fromMin(toMin(start) + (menuDuration || 30));

      const memoPhone = b.memo_no != null ? memoPhones.get(b.memo_no) ?? "" : "";
      const candidates = findCandidates(b.name, memoPhone, customers);

      rows.push({
        key: `r${seq}`,
        include: true,
        column,
        date,
        start,
        end,
        writtenStart,
        name: b.name.trim(),
        courseText: b.course_text.trim(),
        codes,
        unknownCodes: fromText.unknown,
        memoNo: b.memo_no,
        memoPhone,
        confidence: normalizeConfidence(b.confidence),
        aiRemarks: b.remarks.trim(),
        customer: defaultChoice(b.name, memoPhone, candidates),
        candidates,
        warnings: [],
        conflicts: [],
        resolution: null,
        totalPrice: menus.reduce((s, m) => s + m.price, 0),
        menuDuration,
      });
    }
  }

  // 日付・時刻順に並べる
  rows.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

  await finalizeRows(rows, closedByColumn, bySlug);
  return { rows, weekStart, sheetWarnings };
}

/**
 * 画面で編集された行を検証し直す（重複・警告・金額・候補）。
 * 手書き表の「休」の情報は画面側に無いので、ここでは使わない。
 */
export async function recheckRows(input: DraftRow[]): Promise<DraftRow[]> {
  const rows: DraftRow[] = input.map((r) => ({
    ...r,
    start: normalizeTime(r.start),
    end: normalizeTime(r.end),
  }));
  const [bySlug, customers] = await Promise.all([fetchMenusBySlug(), fetchAllCustomers()]);

  for (const row of rows) {
    const parsed = parseCourseText(row.courseText);
    row.codes = parsed.codes;
    row.unknownCodes = parsed.unknown;
    row.candidates = findCandidates(row.name, row.memoPhone, customers);
    // 選んでいた既存顧客が候補から外れても、選択は尊重する（名前を直しただけのことが多い）
    if (row.customer.mode === "new") {
      row.customer = { mode: "new", name: row.name.trim(), phone: row.customer.phone };
    }
  }
  await finalizeRows(rows, new Map(), bySlug);
  return rows;
}

async function finalizeRows(
  rows: DraftRow[],
  closedByColumn: Map<SheetColumn, boolean>,
  bySlug: Map<string, MenuLite>,
): Promise<void> {
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const overrides =
    dates.length > 0
      ? await fetchHolidayOverridesInRange(dates[0]!, dates[dates.length - 1]!)
      : [];
  const todayStr = formatDateJst(new Date());

  for (const row of rows) recomputeMoney(row, bySlug);
  await attachConflicts(rows);

  for (const row of rows) {
    row.warnings = computeWarnings(row, overrides, todayStr, closedByColumn.get(row.column) ?? false);
    // 同じ予約を二重に書いただけなら、既定で「登録しない」にしておく
    if (
      !row.resolution &&
      row.conflicts.length > 0 &&
      row.conflicts.every((c) => c.kind === "system" && c.likelySame)
    ) {
      row.resolution = { target: "sheet", action: "skip" };
    }
    // 重複がなくなったら解決方法は不要
    if (row.conflicts.length === 0 && row.resolution?.target === "system") {
      row.resolution = null;
    }
  }
}
