"use client";

// ONLINE PAYMENT (phase 7) through Razorpay Checkout. The Razorpay secret key is only in the "payments"
// Edge Function (supabase/functions/payments); the app asks it for an order, opens Razorpay's own payment
// window (UPI, cards, net banking), and sends back Razorpay's answer to be checked by the function.

import { db, type AppName } from "./supabase";
import { PAYMENTS_ON } from "./data";

export { PAYMENTS_ON };

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = Record<string, unknown> & { handler: (r: RazorpayResult) => void; modal?: { ondismiss?: () => void } };
type RazorpayCtor = new (o: RazorpayOptions) => { open: () => void; on: (ev: string, fn: (r: unknown) => void) => void };

let loading: Promise<RazorpayCtor> | null = null;
/** Razorpay's script, loaded the first time someone pays. */
function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("checkout")));
      s.onerror = () => { loading = null; reject(new Error("checkout")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

async function call<T>(app: AppName, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db(app).functions.invoke("payments", { body });
  if (error) {
    // The function's own message, when there is one.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx && typeof ctx.json === "function" ? await ctx.json().then((j: { error?: string }) => j.error).catch(() => null) : null;
    throw new Error(msg || error.message || "payment");
  }
  return data as T;
}

export class PaymentCancelled extends Error { constructor() { super("cancelled"); } }

/**
 * Pay for a booking. Resolves when the payment is confirmed by the server. Rejects with PaymentCancelled
 * if the person closes the payment window, or an Error otherwise.
 */
export async function payBooking(bookingId: string, method: "upi" | "card", prefill: { name?: string; phone?: string }) {
  const [Razorpay, order] = await Promise.all([
    loadCheckout(),
    call<{ order_id: string; amount: number; currency: string; key_id: string; code: string; phone: string }>("patient", { action: "order", booking: bookingId, method }),
  ]);
  const result = await new Promise<RazorpayResult>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "Nurse at Home",
      description: `Booking ${order.code}`,
      prefill: { name: prefill.name ?? "", contact: prefill.phone || order.phone || "", method: method === "upi" ? "upi" : "card" },
      theme: { color: "#0F6E56" },
      handler: (r) => resolve(r),
      modal: { ondismiss: () => reject(new PaymentCancelled()) },
    });
    rzp.on("payment.failed", () => { /* Razorpay shows the reason and lets them try again; closing rejects */ });
    rzp.open();
  });
  await call("patient", { action: "verify", order_id: result.razorpay_order_id, payment_id: result.razorpay_payment_id, signature: result.razorpay_signature });
}

/** Send back what is owed for a booking (after a cancel, a missed or stopped visit, or a team decision). */
export const refundBooking = (app: AppName, bookingId: string) => call<{ refunded: number }>(app, { action: "refund", booking: bookingId });
