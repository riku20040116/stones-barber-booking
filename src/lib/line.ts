/**
 * LINE Messaging API 連携（オーナー向けプッシュ通知）。
 *  - 新規予約が入ったとき、オーナーの LINE に通知を送る。
 *  - メールより気づきやすいオーナー向けの補助チャネル。
 *
 * 必要な環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN  … Messaging API チャネルの長期アクセストークン
 *   LINE_TO_USER_ID            … 送信先（オーナーの userId / group / room id）
 *
 * いずれか未設定なら no-op（送信スキップ）。設定は docs/line-setup.md 参照。
 */
import "server-only";

const PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export function isLineConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_TO_USER_ID,
  );
}

export type LinePushResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/**
 * オーナーの LINE にテキストを push する。
 * 未設定なら skipped:true で返す（呼び出し元は無視してよい）。
 */
export async function sendLinePush(text: string): Promise<LinePushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TO_USER_ID;
  if (!token || !to) {
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: text.slice(0, 4900) }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[line] push failed:", res.status, body);
      return { ok: false, error: `LINE push ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[line] push threw:", msg);
    return { ok: false, error: msg };
  }
}
