/**
 * サーバー専用の Stripe クライアント。
 * STRIPE_SECRET_KEY をモジュール初期化時に必須とし、誤って公開されないようにする。
 */
import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure it in .env.local before using Stripe features.",
    );
  }
  _stripe = new Stripe(key, {
    typescript: true,
  });
  return _stripe;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  return secret;
}

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set.");
  }
  return url.replace(/\/$/, "");
}

/**
 * Stripe Checkout セッションを作成して URL を返す。
 * line_items は予約の reservation_items から構築する。
 */
export async function createCheckoutSessionForReservation(params: {
  reservationId: string;
  reservationCode: string;
  customerEmail: string;
  items: { name: string; amount: number; quantity: number }[];
}): Promise<{ id: string; url: string }> {
  const stripe = getStripeClient();
  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    line_items: params.items.map((it) => ({
      price_data: {
        currency: "jpy",
        product_data: { name: it.name },
        unit_amount: it.amount,
      },
      quantity: it.quantity,
    })),
    metadata: {
      reservation_id: params.reservationId,
      reservation_code: params.reservationCode,
    },
    payment_intent_data: {
      metadata: {
        reservation_id: params.reservationId,
        reservation_code: params.reservationCode,
      },
    },
    success_url: `${appUrl}/reservations/${params.reservationCode}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/reservations/${params.reservationCode}/pay?cancelled=1`,
    locale: "ja",
  });

  if (!session.url) {
    throw new Error("Stripe did not return a session URL");
  }
  return { id: session.id, url: session.url };
}
