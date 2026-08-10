/**
 * メール送信レイヤー。
 *  - サーバー専用（"server-only"）
 *  - トランスポートは 2 系統をサポートし、環境変数で自動選択する:
 *      1) SMTP（nodemailer）… SMTP_HOST / SMTP_USER / SMTP_PASS が揃っていれば優先。
 *         Yahoo! メール (smtp.mail.yahoo.co.jp:465) や Gmail (smtp.gmail.com:465) の
 *         アプリパスワードでそのまま使える。ドメイン検証不要で任意の宛先に送れる。
 *      2) Resend … RESEND_API_KEY が設定されていれば使用。
 *         ※ Resend はドメイン検証を済ませないと自分のアカウントのメール以外に
 *           送信できない点に注意。
 *  - どちらも未設定の場合は no-op（警告ログ + email_log 記録のみ）。
 *  - email_log テーブルへの記録はここで吸収する。
 */
import "server-only";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EmailType } from "@/types/database";

// ---------------------------------------------------------------------------
// トランスポート
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

let _smtp: Transporter | null = null;

function getSmtpTransport(): Transporter | null {
  if (_smtp) return _smtp;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  _smtp = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  });
  return _smtp;
}

/**
 * 送信元アドレス。
 * MAIL_FROM > RESEND_FROM_EMAIL > SMTP_USER > Resend の onboarding の順で決まる。
 * "STONE'S BARBER <owner@example.com>" 形式も可。
 */
export function getEmailFromAddress(): string {
  return (
    process.env.MAIL_FROM ??
    process.env.RESEND_FROM_EMAIL ??
    (process.env.SMTP_USER
      ? `STONE'S BARBER <${process.env.SMTP_USER}>`
      : "STONE'S BARBER <onboarding@resend.dev>")
  );
}

/** Reply-To アドレス（任意） */
export function getReplyToAddress(): string | undefined {
  return process.env.MAIL_REPLY_TO || process.env.RESEND_REPLY_TO || undefined;
}

/**
 * 管理者通知メールの宛先一覧。
 * ADMIN_EMAILS=owner@yahoo.co.jp,dev@gmail.com のようにカンマ区切りで複数可。
 */
export function getAdminNotificationEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 後方互換: 先頭 1 件だけ返す旧 API */
export function getAdminNotificationEmail(): string | null {
  return getAdminNotificationEmails()[0] ?? null;
}

// ---------------------------------------------------------------------------
// 送信
// ---------------------------------------------------------------------------

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  type: EmailType;
  reservationId?: string | null;
  /** 添付ファイル（バックアップ JSON など）。content はテキスト文字列 */
  attachments?: { filename: string; content: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * メール送信 + email_log への記録。
 *  - SMTP → Resend → no-op の順にフォールバック。
 *  - 失敗時もログを残してから ok:false を返す（呼び出し元の処理は中断しない想定）。
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const from = getEmailFromAddress();
  const replyTo = getReplyToAddress();
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const toJoined = toList.join(", ");

  let providerId: string | null = null;
  let errorMsg: string | null = null;

  const smtp = getSmtpTransport();
  const resend = getResendClient();

  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from,
        to: toJoined,
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(replyTo ? { replyTo } : {}),
        ...(params.attachments
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      });
      providerId = info.messageId ?? null;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[email] SMTP send failed to=${toJoined}:`, errorMsg);
    }
  } else if (resend) {
    try {
      const res = await resend.emails.send({
        from,
        to: toList,
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(replyTo ? { replyTo } : {}),
        ...(params.attachments
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content, "utf-8"),
              })),
            }
          : {}),
      });
      if (res.error) {
        errorMsg = res.error.message ?? String(res.error);
      } else {
        providerId = res.data?.id ?? null;
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.warn(
      `[email] メール送信設定なし (SMTP_* / RESEND_API_KEY いずれも未設定); skip to=${toJoined} type=${params.type}`,
    );
  }

  // email_log へ best-effort で記録
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("email_log").insert({
      reservation_id: params.reservationId ?? null,
      type: params.type,
      to_email: toJoined,
      subject: params.subject,
      provider_message_id: providerId,
      error: errorMsg,
    });
  } catch (e) {
    console.warn("[email] email_log insert failed:", e);
  }

  if (errorMsg) {
    return { ok: false, error: errorMsg };
  }
  return { ok: true, id: providerId };
}
