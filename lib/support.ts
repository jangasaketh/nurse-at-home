"use client";

// SUPPORT AND SOS (launch, version 1.8.0). Signed-in apps send reports to the team's Support page and read
// the replies; SOS during a visit sends an urgent report with the location (supabase/008_launch.sql).

import { db } from "./supabase";
import { uploadFile } from "./files";
import { currentPosition } from "./maps";
import type { PhotoFile } from "./prescription";

type App = "patient" | "caregiver";

export async function sendTicket(app: App, userId: string, topic: string, message: string, opts: { bookingId?: string | null; photo?: PhotoFile | null } = {}) {
  const photoPath = opts.photo ? await uploadFile(app, "tickets", userId, "report", opts.photo) : null;
  const { data, error } = await db(app).rpc("send_ticket", { p_topic: topic, p_message: message, p_booking: opts.bookingId ?? null, p_photo: photoPath });
  if (error) throw error;
  return String(data);
}

export type MyTicket = { id: string; code: string; topic: string; message: string; status: "open" | "resolved"; at: number; replies: { text: string; at: number }[] };
export async function myTickets(app: App): Promise<MyTicket[]> {
  const { data, error } = await db(app).rpc("my_tickets");
  if (error) throw error;
  return ((data as Record<string, unknown>[]) ?? []).map((t) => ({
    id: String(t.id), code: String(t.code), topic: String(t.topic), message: String(t.message), status: t.status as MyTicket["status"],
    at: new Date(String(t.at)).getTime(), replies: ((t.replies as { text: string; at: string }[]) ?? []).map((r) => ({ text: r.text, at: new Date(r.at).getTime() })),
  }));
}

/** SOS: tell the support team at once, with where the phone is (if it can say within 6 seconds). */
export async function sosAlert(app: App, bookingId: string | null): Promise<string> {
  const where = await Promise.race([currentPosition().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
  const { data, error } = await db(app).rpc("sos_alert", { p_booking: bookingId, p_lat: where?.lat ?? null, p_lng: where?.lng ?? null });
  if (error) throw error;
  return String(data);
}
