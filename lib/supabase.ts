"use client";

// THE CONNECTION TO THE DATABASE (Supabase). Used from the browser only.
// The project URL and the publishable key are meant to be public: the access rules in the database
// (supabase/001_setup.sql) decide what each signed-in person can read or change.
// Never put the secret key (sb_secret_...) or the database password in the apps.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hglhijvvbbmmsjoakvfz.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_DTSf3sBH1uy9fDqFRcmIkA_4kyM3QxT";

export type AppName = "patient" | "caregiver" | "admin";

const clients: Partial<Record<AppName, SupabaseClient>> = {};

/** One client per app, each with its own saved sign-in, so the same phone can use the patient and caregiver apps separately. */
export function db(app: AppName): SupabaseClient {
  if (!clients[app]) {
    clients[app] = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: `nah-auth-${app}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return clients[app]!;
}

/** "+919876543210" for Supabase from the 10 digits typed. */
export const intlPhone = (tenDigits: string) => `+91${tenDigits}`;

/** A short, plain reason for a failed sign-in, in English (the screen translates the known ones). */
export function authProblem(error: unknown): "provider" | "code" | "rate" | "network" | "other" {
  const e = error as { message?: string; code?: string; status?: number } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (/provider|sms_send_failed|phone.*(disabled|not enabled)|unsupported phone/.test(text)) return "provider";
  if (e?.status === 429 || /rate|too many|security purposes/.test(text)) return "rate";
  if (/expired|invalid|otp|token/.test(text)) return "code";
  if (/fetch|network|failed to/.test(text)) return "network";
  return "other";
}
