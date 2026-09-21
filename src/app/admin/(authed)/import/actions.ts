"use server";
/**
 * 管理画面 / 手書き予約表の取り込み。
 *
 *   1. readSheetAction   写真を AI で読み取り、確認用の行を返す（まだ登録しない）
 *   2. recheckAction     画面で直した内容を検証し直す（重複・警告・候補）
 *   3. commitImportAction 登録する。解決していない重複があれば登録せずに返し、
 *                         画面側でポップアップを出して解決方法を入力してもらう
 */
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateJst, jstWallToUtc } from "@/lib/timezone";
import { extractSheet, type SheetImage } from "@/lib/sheet/extract";
import {
  buildDraftRows,
  fetchMenusBySlug,
  menusForCodes,
  normalizeTime,
  recheckRows,
} from "@/lib/sheet/resolve";
import type {
  CommitResult,
  CommitRowResult,
  DraftRow,
  ReadSheetResult,
  RecheckResult,
} from "@/lib/sheet/types";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 3;

export async function readSheetAction(input: {
  images: SheetImage[];
  fallbackWeekStart: string | null;
}): Promise<ReadSheetResult> {
  await requireAdmin();

  const images = input.images.slice(0, MAX_IMAGES);
  if (images.length === 0) return { ok: false, error: "写真を選んでください。" };
  if (images.some((i) => !ALLOWED_TYPES.has(i.mediaType))) {
    return { ok: false, error: "写真は JPEG / PNG / WebP でお願いします。" };
  }
  const fallback =
    input.fallbackWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(input.fallbackWeekStart)
      ? input.fallbackWeekStart
      : null;

  const res = await extractSheet(images);
  if (!res.ok) return res;

  try {
    const { rows, weekStart, sheetWarnings } = await buildDraftRows(res.extraction, fallback);
    return { ok: true, rows, meta: { weekStart, sheetWarnings, model: res.model } };
  } catch (e) {
    console.error("[import] build rows error:", e);
    return { ok: false, error: errorMessage(e, "読み取り結果の確認に失敗しました。") };
  }
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export async function recheckAction(rows: DraftRow[]): Promise<RecheckResult> {
  await requireAdmin();
  try {
    return { ok: true, rows: await recheckRows(rows) };
  } catch (e) {
    console.error("[import] recheck error:", e);
    return { ok: false, error: errorMessage(e, "内容の確認に失敗しました。もう一度お試しください。") };
  }
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMin(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** まだ登録できない理由（重複以外）。1 つでもあれば登録させない。 */
function blockingProblems(row: DraftRow): string[] {
  const p: string[] = [];
  if (!row.date) p.push("日付");
  if (!row.start || !row.end || toMin(row.end) <= toMin(row.start)) p.push("時刻");
  if (!row.name.trim()) p.push("名前");
  if (row.customer.mode === "unset") p.push("お客様の選択");
  return p;
}

export async function commitImportAction(input: DraftRow[]): Promise<CommitResult> {
  await requireAdmin();

  // 送られてきた内容を信用せず、登録直前の最新状態で検証し直す
  let rows: DraftRow[];
  try {
    rows = await recheckRows(input);
  } catch (e) {
    console.error("[import] commit recheck error:", e);
    return { ok: false, error: errorMessage(e, "登録前の確認に失敗しました。") };
  }
  const targets = rows.filter((r) => r.include);
  if (targets.length === 0) {
    return { ok: false, error: "登録する予約がありません。" };
  }

  const problems = targets
    .map((r) => ({ r, p: blockingProblems(r) }))
    .filter((x) => x.p.length > 0);
  if (problems.length > 0) {
    const first = problems[0]!;
    return {
      ok: false,
      error: `${first.r.name || "（名前なし）"} 様（${first.r.date} ${first.r.start}）の${first.p.join("・")}を確認してください。ほか ${problems.length - 1} 件。`,
    };
  }

  // 解決方法が決まっていない重複がある → 画面でポップアップを出す
  const unresolved = targets.filter((r) => r.conflicts.length > 0 && !r.resolution);
  if (unresolved.length > 0) {
    return { ok: false, needsResolution: true, rows };
  }

  const admin = createSupabaseAdminClient();
  const bySlug = await fetchMenusBySlug();
  const today = formatDateJst(new Date());
  const results: CommitRowResult[] = [];

  // --- 1) システム側の予約を先に動かす（空けてから手書き分を入れる）-------------
  for (const row of targets) {
    const res = row.resolution;
    if (!res || res.target !== "system") continue;

    const { data: existing, error: fetchErr } = await admin
      .from("reservations")
      .select("id, code, start_at, end_at")
      .eq("id", res.reservationId)
      .maybeSingle();
    if (fetchErr || !existing) {
      results.push({ key: row.key, ok: false, message: "変更対象の予約が見つかりませんでした" });
      row.include = false;
      continue;
    }

    if (res.action === "cancel") {
      const { error } = await admin
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", existing.id);
      if (error) {
        results.push({ key: row.key, ok: false, message: `${existing.code} のキャンセルに失敗しました` });
        row.include = false;
      }
    } else {
      const start = normalizeTime(res.start);
      const durationMs =
        new Date(existing.end_at).getTime() - new Date(existing.start_at).getTime();
      const startAt = jstWallToUtc(res.date, start);
      const { error } = await admin
        .from("reservations")
        .update({
          start_at: startAt.toISOString(),
          end_at: new Date(startAt.getTime() + durationMs).toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        const msg =
          error.code === "23P01"
            ? `${existing.code} の移動先（${res.date} ${start}）にも予約が入っています`
            : `${existing.code} の日時変更に失敗しました`;
        results.push({ key: row.key, ok: false, message: msg });
        row.include = false;
      }
    }
  }

  // --- 2) 手書きの予約を登録する ---------------------------------------------
  for (const row of targets) {
    if (!row.include) continue;
    const res = row.resolution;

    if (res?.target === "sheet" && res.action === "skip") {
      results.push({ key: row.key, ok: true, message: "登録しませんでした（重複のため）" });
      continue;
    }

    let date = row.date;
    let start = row.start;
    let end = row.end;
    if (res?.target === "sheet" && res.action === "move") {
      const len = toMin(end) - toMin(start);
      date = res.date;
      start = normalizeTime(res.start);
      end = fromMin(toMin(start) + len);
    }

    // お客様を決める
    let customerId: string;
    let customerName = row.name.trim();
    let customerPhone = row.memoPhone.trim();
    let customerEmail = "";

    if (row.customer.mode === "existing") {
      const { data: c, error } = await admin
        .from("customers")
        .select("id, name, phone, email")
        .eq("id", row.customer.id)
        .maybeSingle();
      if (error || !c) {
        results.push({ key: row.key, ok: false, message: "選んだお客様が顧客リストに見つかりません" });
        continue;
      }
      customerId = c.id;
      customerName = c.name;
      customerPhone = c.phone ?? customerPhone;
      customerEmail = c.email ?? "";
    } else if (row.customer.mode === "new") {
      const name = row.customer.name.trim() || row.name.trim();
      const phone = row.customer.phone.trim() || row.memoPhone.trim();
      const { data: c, error } = await admin
        .from("customers")
        .insert({ name, phone: phone || null, source: "handwritten" })
        .select("id")
        .single();
      if (error || !c) {
        console.error("[import] customer insert error:", error);
        results.push({ key: row.key, ok: false, message: "顧客リストへの追加に失敗しました" });
        continue;
      }
      customerId = c.id;
      customerName = name;
      customerPhone = phone;
    } else {
      results.push({ key: row.key, ok: false, message: "お客様が選ばれていません" });
      continue;
    }

    const menus = menusForCodes(row.codes, bySlug);
    const startAt = jstWallToUtc(date, start);
    const endAt = jstWallToUtc(date, end);

    const { data: inserted, error } = await admin
      .from("reservations")
      .insert({
        customer_id: null,
        customer_record_id: customerId,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        total_price: menus.reduce((s, m) => s + m.price, 0),
        payment_method: "in_store",
        payment_status: "unpaid",
        stripe_payment_intent: null,
        status: "confirmed",
        source: "handwritten",
        notes: `手書き予約表から取り込み（${today}）／記入: ${row.name} ${row.courseText}`.trim(),
      })
      .select("id, code")
      .single();

    if (error || !inserted) {
      const msg =
        error?.code === "23P01"
          ? "その時間帯には別の予約が入っているため登録できませんでした"
          : "予約の登録に失敗しました";
      if (error?.code !== "23P01") console.error("[import] insert error:", error);
      results.push({ key: row.key, ok: false, message: msg });
      continue;
    }

    if (menus.length > 0) {
      const { error: itemErr } = await admin.from("reservation_items").insert(
        menus.map((m, i) => ({
          reservation_id: inserted.id,
          menu_id: m.id,
          name_snapshot: m.name,
          price_snapshot: m.price,
          duration_snapshot: m.duration_min,
          sort_order: i + 1,
        })),
      );
      if (itemErr) console.error("[import] items insert error:", itemErr);
    }

    results.push({
      key: row.key,
      ok: true,
      message: "登録しました",
      reservationCode: inserted.code,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/customers");
  return { ok: true, results };
}
