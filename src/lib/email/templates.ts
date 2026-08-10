/**
 * メール本文テンプレート。
 *  - 純粋関数（subject + html + text を返す）
 *  - HTML はインラインスタイルで最低限の整形のみ。Resend のレンダリングに任せる。
 *  - メールクライアントの互換性のため <table> ベースにはせず、簡易テキスト風にする。
 */
import { STORE } from "@/lib/constants";
import { formatHumanJst } from "@/lib/timezone";

export type ReservationEmailData = {
  code: string;
  startAt: Date;
  endAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalPrice: number;
  paymentMethod: "in_store" | "stripe";
  paymentStatus: "unpaid" | "paid" | "refunded" | "failed";
  items: { name: string; price: number }[];
  notes?: string | null;
};

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const lookupUrl = APP_URL ? `${APP_URL}/reservations/lookup` : null;

function jpyFormat(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}

function paymentMethodLabel(m: ReservationEmailData["paymentMethod"]): string {
  return m === "stripe" ? "オンライン事前決済（Stripe）" : "店舗払い（現金/カード）";
}

function paymentStatusLabel(s: ReservationEmailData["paymentStatus"]): string {
  switch (s) {
    case "paid":
      return "お支払い済み";
    case "unpaid":
      return "未払い";
    case "refunded":
      return "返金済み";
    case "failed":
      return "決済失敗";
  }
}

function itemsTextBlock(items: ReservationEmailData["items"]): string {
  if (items.length === 0) return "（メニュー詳細なし）";
  return items.map((it) => `  ・${it.name}  ${jpyFormat(it.price)}`).join("\n");
}

function itemsHtmlBlock(items: ReservationEmailData["items"]): string {
  if (items.length === 0) return "<p>（メニュー詳細なし）</p>";
  return `<ul style="margin:0;padding-left:1.2em;">${items
    .map(
      (it) =>
        `<li>${escapeHtml(it.name)} <span style="color:#666">${jpyFormat(it.price)}</span></li>`,
    )
    .join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function htmlShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border-radius:8px;border:1px solid #e4e4e7;">
    <h1 style="margin:0 0 16px;font-size:18px;">${escapeHtml(STORE.name)}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;" />
    <p style="margin:0;font-size:12px;color:#777;line-height:1.7;">
      ${escapeHtml(STORE.name)}<br />
      ${escapeHtml(STORE.address.full)}<br />
      Tel ${escapeHtml(STORE.phone.display)}
    </p>
  </div>
</body>
</html>`;
}

function reservationDetailsHtml(data: ReservationEmailData): string {
  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;">
      <tbody>
        <tr><td style="color:#666;width:28%;padding:4px 0;">予約番号</td><td style="font-family:ui-monospace,Menlo,monospace;font-weight:bold;letter-spacing:0.05em;">${escapeHtml(data.code)}</td></tr>
        <tr><td style="color:#666;padding:4px 0;">日時</td><td>${escapeHtml(formatHumanJst(data.startAt))} 〜 ${escapeHtml(formatHumanJst(data.endAt).split("）")[1] ?? "")}</td></tr>
        <tr><td style="color:#666;padding:4px 0;">お名前</td><td>${escapeHtml(data.customerName)} 様</td></tr>
        <tr><td style="color:#666;padding:4px 0;">電話</td><td>${escapeHtml(data.customerPhone)}</td></tr>
        <tr><td style="color:#666;padding:4px 0;vertical-align:top;">メニュー</td><td>${itemsHtmlBlock(data.items)}</td></tr>
        <tr><td style="color:#666;padding:4px 0;">合計</td><td>${jpyFormat(data.totalPrice)}〜</td></tr>
        <tr><td style="color:#666;padding:4px 0;">お支払い</td><td>${escapeHtml(paymentMethodLabel(data.paymentMethod))}（${escapeHtml(paymentStatusLabel(data.paymentStatus))}）</td></tr>
      </tbody>
    </table>
  `;
}

function reservationDetailsText(data: ReservationEmailData): string {
  return [
    `予約番号: ${data.code}`,
    `日時: ${formatHumanJst(data.startAt)} 〜 ${formatHumanJst(data.endAt).split("）")[1] ?? ""}`,
    `お名前: ${data.customerName} 様`,
    `電話: ${data.customerPhone}`,
    `メニュー:\n${itemsTextBlock(data.items)}`,
    `合計: ${jpyFormat(data.totalPrice)}〜`,
    `お支払い: ${paymentMethodLabel(data.paymentMethod)}（${paymentStatusLabel(data.paymentStatus)}）`,
  ].join("\n");
}

function lookupFooterHtml(): string {
  if (!lookupUrl) return "";
  return `<p style="margin:20px 0 0;font-size:14px;">予約の確認・キャンセルは <a href="${lookupUrl}">予約照会ページ</a> よりお願いします。</p>`;
}

function lookupFooterText(): string {
  if (!lookupUrl) return "";
  return `\n予約の確認・キャンセル: ${lookupUrl}\n`;
}

/**
 * お客様向け: 予約確定メール。
 * 予約直後に送信（即確定フロー）。変更が必要な場合は店舗からお客様へ連絡する運用。
 */
export function buildConfirmationEmail(data: ReservationEmailData): EmailContent {
  const subject = `【${STORE.name}】ご予約を承りました（${data.code}）`;
  const intro =
    data.paymentMethod === "stripe" && data.paymentStatus !== "paid"
      ? "ご予約と事前決済のお手続きを受け付けました。決済完了の反映には数分かかる場合があります。"
      : "ご予約を承りました。当日お気をつけてお越しください。";

  const text = `${data.customerName} 様

${intro}

※ 万一日程の調整が必要な場合は、店舗よりご連絡させていただきます。

${reservationDetailsText(data)}
${data.notes ? `\nご要望: ${data.notes}\n` : ""}
${lookupFooterText()}
${STORE.name}
${STORE.address.full}
Tel ${STORE.phone.display}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 12px;">${escapeHtml(data.customerName)} 様</p>
     <p style="margin:0 0 16px;line-height:1.7;padding:10px 12px;background:#d1fae5;border-radius:6px;font-size:15px;"><strong>${escapeHtml(intro)}</strong></p>
     <p style="margin:0 0 16px;font-size:13px;color:#666;line-height:1.7;">※ 万一日程の調整が必要な場合は、店舗よりご連絡させていただきます。</p>
     ${reservationDetailsHtml(data)}
     ${data.notes ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.7;"><span style="color:#666">ご要望:</span> ${escapeHtml(data.notes)}</p>` : ""}
     ${lookupFooterHtml()}`,
  );

  return { subject, html, text };
}

/**
 * お客様向け: 本確定メール。
 * オーナーが管理画面で承認（pending → confirmed）した時に送信。
 */
export function buildApprovedEmail(data: ReservationEmailData): EmailContent {
  const subject = `【${STORE.name}】ご予約が確定しました（${data.code}）`;

  const text = `${data.customerName} 様

ご予約が確定しました。
当日のご来店を心よりお待ちしております。

${reservationDetailsText(data)}
${lookupFooterText()}
${STORE.name}
${STORE.address.full}
Tel ${STORE.phone.display}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 12px;">${escapeHtml(data.customerName)} 様</p>
     <p style="margin:0 0 16px;line-height:1.7;padding:10px 12px;background:#d1fae5;border-radius:6px;font-size:15px;"><strong>ご予約が確定しました。</strong><br />当日のご来店を心よりお待ちしております。</p>
     ${reservationDetailsHtml(data)}
     ${lookupFooterHtml()}`,
  );

  return { subject, html, text };
}

/**
 * お客様向け: 日時変更のお知らせ。
 * 管理者が予約の日時を変更した時に送信。
 */
export function buildRescheduledEmail(data: ReservationEmailData): EmailContent {
  const subject = `【${STORE.name}】ご予約日時を変更しました（${data.code}）`;

  const text = `${data.customerName} 様

ご予約の日時を下記のとおり変更いたしました。
ご確認をお願いいたします。

${reservationDetailsText(data)}
${lookupFooterText()}
${STORE.name}
${STORE.address.full}
Tel ${STORE.phone.display}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 12px;">${escapeHtml(data.customerName)} 様</p>
     <p style="margin:0 0 16px;line-height:1.7;padding:10px 12px;background:#dbeafe;border-radius:6px;font-size:15px;"><strong>ご予約の日時を変更いたしました。</strong><br />下記の内容をご確認ください。</p>
     ${reservationDetailsHtml(data)}
     ${lookupFooterHtml()}`,
  );

  return { subject, html, text };
}

/** お客様向け: 前日リマインダー */
export function buildReminderEmail(data: ReservationEmailData): EmailContent {
  const subject = `【${STORE.name}】明日のご予約のご案内（${data.code}）`;

  const text = `${data.customerName} 様

明日のご予約のお時間が近づいてまいりました。
お忘れのないよう、お気をつけてお越しください。

${reservationDetailsText(data)}
${lookupFooterText()}
${STORE.name}
Tel ${STORE.phone.display}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 12px;">${escapeHtml(data.customerName)} 様</p>
     <p style="margin:0 0 16px;line-height:1.7;">明日のご予約のお時間が近づいてまいりました。<br />お気をつけてお越しください。</p>
     ${reservationDetailsHtml(data)}
     ${lookupFooterHtml()}`,
  );

  return { subject, html, text };
}

/** お客様向け: キャンセル受付メール */
export function buildCancellationEmail(data: ReservationEmailData): EmailContent {
  const subject = `【${STORE.name}】ご予約をキャンセルしました（${data.code}）`;

  const text = `${data.customerName} 様

下記のご予約をキャンセル受付いたしました。
またのご利用を心よりお待ちしております。

${reservationDetailsText(data)}
${lookupFooterText()}
${STORE.name}
Tel ${STORE.phone.display}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 12px;">${escapeHtml(data.customerName)} 様</p>
     <p style="margin:0 0 16px;line-height:1.7;">下記のご予約をキャンセル受付いたしました。<br />またのご利用を心よりお待ちしております。</p>
     ${reservationDetailsHtml(data)}
     ${lookupFooterHtml()}`,
  );

  return { subject, html, text };
}

/** 管理者向け: 新規予約のお知らせ（操作不要・確認のみ） */
export function buildAdminNoticeEmail(data: ReservationEmailData): EmailContent {
  const subject = `[新規予約] ${data.code} / ${data.customerName} 様 / ${formatHumanJst(data.startAt)}`;

  const text = `新しい予約が入りました（自動で確定済みです）。

内容をご確認ください。日程の調整が必要な場合は、お客様へ直接ご連絡のうえ、
管理画面からキャンセル等の操作をお願いします。

${reservationDetailsText(data)}
${data.notes ? `\nご要望: ${data.notes}\n` : ""}
管理画面: ${APP_URL ? APP_URL + "/admin/reservations" : "(NEXT_PUBLIC_APP_URL 未設定)"}
`;

  const html = htmlShell(
    subject,
    `<p style="margin:0 0 8px;font-weight:bold;font-size:16px;">新しい予約が入りました</p>
     <p style="margin:0 0 16px;line-height:1.7;font-size:14px;color:#666;">予約は自動で確定済みです。日程の調整が必要な場合は、お客様へ直接ご連絡のうえ、管理画面からキャンセル等の操作をお願いします。</p>
     ${reservationDetailsHtml(data)}
     ${data.notes ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.7;"><span style="color:#666">ご要望:</span> ${escapeHtml(data.notes)}</p>` : ""}
     ${APP_URL ? `<p style="margin:18px 0 0;font-size:15px;"><a href="${APP_URL}/admin/reservations" style="display:inline-block;padding:10px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">管理画面で確認する</a></p>` : ""}`,
  );

  return { subject, html, text };
}
