"use server";
/**
 * 管理画面 / 手書き予約表の取り込み（貼り付け）。
 *
 *   1. analyzePasteAction  貼り付けた文字を予約の候補に分ける（まだ登録しない）。
 *                          判定に使う「すでにある予約」「お休みの設定」も一緒に返す
 *   2. commitPasteAction   チェックした行を登録する。登録の直前に最新の予約で判定し直し、
 *                          データベースの関数でまとめて登録する（1 件でも失敗したら全部取り消し）
 *
 * 取り込んだ予約: 確定・店頭払い・未払い・source='handwritten'。メールは送らない。
 * 有料のサービス・AI は使わない（文字の読み取りはこのアプリの中だけで行う）。
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { HolidayOverride } from "@/lib/calendar";
import { jstWallToUtc } from "@/lib/timezone";
import { parsePastedText } from "@/lib/paste-import/parse";
import { toDraftRows } from "@/lib/paste-import/draft";
import { judgeRows } from "@/lib/paste-import/judge";
import { makeDayHours } from "@/lib/paste-import/hours";
import { loadCatalog, loadJudgeData, nowJst } from "@/lib/paste-import/server";
import type { DraftRow, ExistingReservation, MenuEntry } from "@/lib/paste-import/types";

const MAX_TEXT = 20_000;
const MAX_ROWS = 100;
/** 判定に使う予約を読む範囲（今日から） */
const LOOKAHEAD_DAYS = 200;

export type AnalyzeResult =
  | {
      ok: true;
      rows: DraftRow[];
      unreadLines: string[];
      ignoredLines: string[];
      menus: MenuEntry[];
      existing: ExistingReservation[];
      overrides: HolidayOverride[];
      now: { date: string; time: string };
    }
  | { ok: false; error: string };

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function analyzePasteAction(input: {
  text: string;
  baseDate: string;
}): Promise<AnalyzeResult> {
  await requireAdmin();

  const text = String(input.text ?? "");
  if (!text.trim()) return { ok: false, error: "文字が貼り付けられていません。" };
  if (text.length > MAX_TEXT) {
    return { ok: false, error: "文字が長すぎます。予約表 1 枚分ずつ貼り付けてください。" };
  }
  const now = nowJst();
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(input.baseDate) ? input.baseDate : now.date;

  try {
    const catalog = await loadCatalog();
    const parsed = parsePastedText(text, { baseDate, today: now.date, catalog });
    const rows = toDraftRows(parsed.rows.slice(0, MAX_ROWS), catalog);

    // 判定用のデータ: 今日から先（読み取った日付がもっと先ならそこまで）
    const lastRowDate = rows.reduce((m, r) => (r.date > m ? r.date : m), now.date);
    const until = [addDays(now.date, LOOKAHEAD_DAYS), lastRowDate].sort().at(-1)!;
    const { existing, overrides } = await loadJudgeData(now.date, until);

    return {
      ok: true,
      rows,
      unreadLines: parsed.unreadLines,
      ignoredLines: parsed.ignoredLines,
      menus: catalog.menus,
      existing,
      overrides,
      now,
    };
  } catch (e) {
    console.error("[paste-import] analyze error:", e);
    return { ok: false, error: "読み込みに失敗しました。少し待ってから、もう一度お試しください。" };
  }
}

/** 判定に使う予約・お休みの設定を読み直す（登録できなかったあとに、最新の状態で判定し直すため） */
export async function refreshJudgeDataAction(input: { until: string }): Promise<
  | { ok: true; existing: ExistingReservation[]; overrides: HolidayOverride[] }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const now = nowJst();
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(input.until) ? input.until : now.date;
  const until = [addDays(now.date, LOOKAHEAD_DAYS), asked].sort().at(-1)!;
  try {
    return { ok: true, ...(await loadJudgeData(now.date, until)) };
  } catch (e) {
    console.error("[paste-import] refresh error:", e);
    return { ok: false, error: "最新の予約を読めませんでした。" };
  }
}

// -----------------------------------------------------------------------------
// 登録
// -----------------------------------------------------------------------------

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const rowSchema = z.object({
  key: z.string().max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: hhmm,
  end: hhmm,
  endSource: z.enum(["written", "menu", "manual"]),
  writtenEnd: z.string().max(5),
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().max(20),
  notes: z.string().trim().max(500),
  mainSlug: z.string().max(60),
  optionSlugs: z.array(z.string().max(60)).max(15),
  menuNotice: z.string().max(1000),
  unknownCodes: z.array(z.string().max(10)).max(20),
  sourceText: z.string().max(2000),
  checked: z.boolean(),
  lastStatus: z.enum(["ok", "check", "error"]).nullable(),
});

export type CommitResult =
  | { ok: true; count: number; codes: string[] }
  | { ok: false; error: string; rowErrors?: { key: string; reasons: string[] }[] };

const RPC_REASON: Record<string, string> = {
  invalid_time: "時刻が正しくありません",
  invalid_name: "お名前がありません",
  invalid_menu: "メニューが見つかりません（販売をやめたメニューかもしれません）",
  past: "過去の日時です",
  duplicate: "同じ予約がすでに登録されています",
  slot_taken: "この時間には、すでに別の予約があります",
};

function rowLabel(r: Pick<DraftRow, "name" | "date" | "start">): string {
  const [, m, d] = r.date.split("-");
  return `${r.name || "（お名前なし）"}様（${Number(m)}/${Number(d)} ${r.start.replace(/^0/, "")}）`;
}

export async function commitPasteAction(input: { rows: DraftRow[] }): Promise<CommitResult> {
  await requireAdmin();

  const parsed = z.array(rowSchema).min(1).max(MAX_ROWS).safeParse(input.rows);
  if (!parsed.success) {
    return { ok: false, error: "登録する内容に、正しくない所があります。画面を確かめてください。" };
  }
  const rows = parsed.data as DraftRow[];

  try {
    const catalog = await loadCatalog();
    const bySlug = new Map(catalog.menus.map((m) => [m.slug, m]));
    const now = nowJst();

    // 最新の予約で判定し直す（画面を開いている間に Web 予約が入ったかもしれない）
    const dates = rows.map((r) => r.date).sort();
    const { existing, overrides } = await loadJudgeData(dates[0]!, dates.at(-1)!);
    const judged = judgeRows(rows, { nowDate: now.date, nowTime: now.time, dayHours: makeDayHours(overrides), existing });

    const rowErrors = rows
      .map((r, i) => ({ key: r.key, status: judged[i]!.status, reasons: judged[i]!.reasons }))
      .filter((x) => x.status === "error")
      .map(({ key, reasons }) => ({ key, reasons }));
    if (rowErrors.length > 0) {
      return {
        ok: false,
        error: `登録できない予約が ${rowErrors.length} 件ありました。赤い所を直すか、チェックを外してください。（まだ 1 件も登録していません）`,
        rowErrors,
      };
    }

    // メニューの id（コース → オプションの順。同じものは 1 つに）
    const payload = [];
    for (const r of rows) {
      const ids = [...new Set([r.mainSlug, ...r.optionSlugs].filter(Boolean))].map((s) => bySlug.get(s)?.id);
      if (ids.length === 0 || ids.some((id) => !id)) {
        return {
          ok: false,
          error: `${rowLabel(r)}のメニューが見つかりません。メニューを選び直してください。（まだ 1 件も登録していません）`,
          rowErrors: [{ key: r.key, reasons: ["メニューを選び直してください"] }],
        };
      }
      payload.push({
        start_at: jstWallToUtc(r.date, r.start).toISOString(),
        end_at: jstWallToUtc(r.date, r.end).toISOString(),
        name: r.name.trim(),
        phone: r.phone.trim(),
        notes: r.notes.trim(),
        menu_ids: ids as string[],
      });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("import_handwritten_reservations", { p_rows: payload });

    if (error) {
      const m = /import_row_error:(\d+):(\w+)/.exec(error.message ?? "");
      if (m) {
        const r = rows[Number(m[1]) - 1];
        const reason = RPC_REASON[m[2]!] ?? "登録できませんでした";
        return {
          ok: false,
          error: `${r ? rowLabel(r) : "ある予約"}: ${reason}。（まだ 1 件も登録していません）`,
          rowErrors: r ? [{ key: r.key, reasons: [reason] }] : undefined,
        };
      }
      console.error("[paste-import] rpc error:", error);
      if (error.code === "PGRST202" || /import_handwritten_reservations/.test(error.message ?? "")) {
        return {
          ok: false,
          error: "取り込みの準備（データベースの更新）がまだ済んでいません。システムの担当者に連絡してください。",
        };
      }
      return { ok: false, error: "登録に失敗しました。何も登録していません。もう一度お試しください。" };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/reservations");
    revalidatePath("/admin/calendar");
    return { ok: true, count: data?.length ?? 0, codes: (data ?? []).map((d) => d.reservation_code) };
  } catch (e) {
    console.error("[paste-import] commit error:", e);
    return { ok: false, error: "登録に失敗しました。何も登録していません。もう一度お試しください。" };
  }
}
