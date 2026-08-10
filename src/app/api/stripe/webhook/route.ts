/**
 * Stripe Webhook 受信エンドポイント。
 *  - checkout.session.completed → 予約を paid に更新
 *  - payment_intent.payment_failed → 予約を failed に
 *
 * Stripe ダッシュボードでこの URL に対して上記イベントを送るよう設定する。
 *   イベント: checkout.session.completed, checkout.session.async_payment_succeeded,
 *            checkout.session.async_payment_failed
 */
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    console.error("stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSucceeded(session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutFailed(session);
        break;
      }
      default:
        // unhandled
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler error:", err);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSucceeded(session: Stripe.Checkout.Session) {
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) return;

  const supabase = createSupabaseAdminClient();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const { error } = await supabase
    .from("reservations")
    .update({
      payment_status: "paid",
      payment_method: "stripe",
      stripe_payment_intent: paymentIntentId,
      // 決済完了をもって confirmed に進める
      status: "confirmed",
    })
    .eq("id", reservationId);
  if (error) {
    console.error("update reservation paid error:", error);
    throw error;
  }
}

async function handleCheckoutFailed(session: Stripe.Checkout.Session) {
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("reservations")
    .update({ payment_status: "failed" })
    .eq("id", reservationId);
  if (error) {
    console.error("update reservation failed error:", error);
    throw error;
  }
}
