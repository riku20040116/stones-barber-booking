/**
 * 高レベルなメール送信エントリポイント。
 *  - 予約に紐づく items を取得して ReservationEmailData を組み立て、
 *    用途別テンプレ → sendEmail() を呼ぶ。
 *  - すべて best-effort。送信に失敗しても呼び出し元の処理は継続する想定。
 *  - admin クライアントを使うため "server-only"。
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildAdminNoticeEmail,
  buildApprovedEmail,
  buildCancellationEmail,
  buildConfirmationEmail,
  buildReminderEmail,
  buildRescheduledEmail,
  type ReservationEmailData,
} from "./templates";
import {
  getAdminNotificationEmails,
  sendEmail,
  type SendEmailResult,
} from "./resend";
import { sendLinePush } from "@/lib/line";
import { formatHumanJst } from "@/lib/timezone";

async function loadReservationEmailData(
  reservationId: string,
): Promise<ReservationEmailData | null> {
  const admin = createSupabaseAdminClient();
  const [resvRes, itemsRes] = await Promise.all([
    admin.from("reservations").select("*").eq("id", reservationId).maybeSingle(),
    admin
      .from("reservation_items")
      .select("name_snapshot, price_snapshot, sort_order")
      .eq("reservation_id", reservationId)
      .order("sort_order", { ascending: true }),
  ]);
  if (resvRes.error) {
    console.error("[email] load reservation error:", resvRes.error);
    return null;
  }
  const r = resvRes.data;
  if (!r) return null;
  const items = (itemsRes.data ?? []).map((it) => ({
    name: it.name_snapshot,
    price: it.price_snapshot,
  }));
  return {
    code: r.code,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    totalPrice: r.total_price,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    items,
    notes: r.notes,
  };
}

/**
 * 予約作成時に呼ぶ。
 *  - お客様に「仮予約受付」メール
 *  - 管理者（オーナー等 ADMIN_EMAILS 全員）に「要承認」通知
 * を並列送信。
 */
export async function notifyReservationCreated(
  reservationId: string,
): Promise<{ customer: SendEmailResult; admin: SendEmailResult | null }> {
  const data = await loadReservationEmailData(reservationId);
  if (!data) {
    return {
      customer: { ok: false, error: "reservation_not_found" },
      admin: null,
    };
  }

  const customerTpl = buildConfirmationEmail(data);
  const adminAddrs = getAdminNotificationEmails();

  const customerPromise = sendEmail({
    to: data.customerEmail,
    subject: customerTpl.subject,
    html: customerTpl.html,
    text: customerTpl.text,
    type: "confirmation",
    reservationId,
  });

  const adminPromise: Promise<SendEmailResult | null> =
    adminAddrs.length > 0
      ? (() => {
          const tpl = buildAdminNoticeEmail(data);
          return sendEmail({
            to: adminAddrs,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            type: "admin_notice",
            reservationId,
          });
        })()
      : Promise.resolve(null);

  // オーナー LINE への push（設定時のみ・best-effort）
  const linePromise = sendLinePush(
    [
      "🔔 新しい予約が入りました",
      "",
      `お名前: ${data.customerName} 様`,
      `日時: ${formatHumanJst(data.startAt)}`,
      `メニュー: ${data.items.map((i) => i.name).join(" + ") || "（なし）"}`,
      `電話: ${data.customerPhone}`,
      `予約番号: ${data.code}`,
    ].join("\n"),
  ).catch((e) => {
    console.error("[line] notifyReservationCreated push threw:", e);
    return { ok: false as const, error: String(e) };
  });

  const [customer, admin] = await Promise.all([
    customerPromise,
    adminPromise,
  ]);
  await linePromise;
  return { customer, admin };
}

/**
 * オーナーが仮予約を承認（pending → confirmed）した時に呼ぶ。
 * お客様に「ご予約確定」メールを送信する。
 */
export async function notifyReservationApproved(
  reservationId: string,
): Promise<SendEmailResult> {
  const data = await loadReservationEmailData(reservationId);
  if (!data) return { ok: false, error: "reservation_not_found" };
  const tpl = buildApprovedEmail(data);
  return sendEmail({
    to: data.customerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    type: "confirmation",
    reservationId,
  });
}

/** 日時変更時に呼ぶ。お客様向けに変更通知。 */
export async function notifyReservationRescheduled(
  reservationId: string,
): Promise<SendEmailResult> {
  const data = await loadReservationEmailData(reservationId);
  if (!data) return { ok: false, error: "reservation_not_found" };
  const tpl = buildRescheduledEmail(data);
  return sendEmail({
    to: data.customerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    type: "confirmation",
    reservationId,
  });
}

/** 予約キャンセル時に呼ぶ。お客様向けにキャンセル通知。 */
export async function notifyReservationCancelled(
  reservationId: string,
): Promise<SendEmailResult> {
  const data = await loadReservationEmailData(reservationId);
  if (!data) return { ok: false, error: "reservation_not_found" };
  const tpl = buildCancellationEmail(data);
  return sendEmail({
    to: data.customerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    type: "cancellation",
    reservationId,
  });
}

/** リマインダー（cron から呼ぶ）。 */
export async function sendReservationReminder(
  reservationId: string,
): Promise<SendEmailResult> {
  const data = await loadReservationEmailData(reservationId);
  if (!data) return { ok: false, error: "reservation_not_found" };
  const tpl = buildReminderEmail(data);
  return sendEmail({
    to: data.customerEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    type: "reminder",
    reservationId,
  });
}
