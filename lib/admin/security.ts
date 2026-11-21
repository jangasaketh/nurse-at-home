"use client";

// ADMIN SIGN-IN SAFETY (1.9.0): forgotten password by email, and two-step sign-in with an authenticator app
// (Google Authenticator, Microsoft Authenticator, 1Password …). Once a team member has set it up, the
// database only opens the team pages after the 6-digit code (supabase/009_accounts.sql, is_admin).

import { db } from "@/lib/supabase";

const client = () => db("admin");

/** Where the reset link in the email comes back to: this admin page. */
export const adminUrl = () => (typeof window === "undefined" ? "" : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/admin/`);

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: adminUrl() });
  if (error) throw error;
}

/** The reset link opens the admin page with "#access_token=…&type=recovery". Sign in with it; true when it was one. */
export async function takeRecoveryLink(): Promise<boolean> {
  if (typeof window === "undefined" || !window.location.hash.includes("type=recovery")) return false;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const access = h.get("access_token"), refresh = h.get("refresh_token");
  history.replaceState(null, "", window.location.pathname + window.location.search); // the token must not stay in the address bar
  if (!access || !refresh) return false;
  const { error } = await client().auth.setSession({ access_token: access, refresh_token: refresh });
  return !error;
}
/** The reset link was opened but had expired or been used ("#error=…"). */
export function recoveryLinkFailed() {
  if (typeof window === "undefined" || !/error_code=|error=/.test(window.location.hash)) return false;
  const bad = /otp_expired|access_denied|error=/.test(window.location.hash);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return bad;
}

export async function setNewPassword(password: string) {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}

// ---------- two-step sign-in ----------
export type Level = { current: string | null; next: string | null };
export async function level(): Promise<Level> {
  const { data } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
}
/** True when this sign-in still needs the 6-digit code. */
export async function needsCode() {
  const l = await level();
  return l.next === "aal2" && l.current !== "aal2";
}
export async function verifiedFactor(): Promise<{ id: string; name: string } | null> {
  const { data } = await client().auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  return f ? { id: f.id, name: f.friendly_name ?? "Authenticator app" } : null;
}
export async function checkCode(code: string) {
  const f = await verifiedFactor();
  if (!f) throw new Error("No authenticator app is set up");
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
  if (error) throw error;
}

/** Start setting up: returns the QR code to scan and the key to type in by hand. */
export async function startSetup() {
  // Unfinished setups from earlier get in the way: remove them first.
  const { data: list } = await client().auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status !== "verified") await client().auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
  const { data, error } = await client().auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toLocaleDateString("en-IN")}` });
  if (error || !data) throw error ?? new Error("Could not start");
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
export async function finishSetup(factorId: string, code: string) {
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
}
export async function turnOff(factorId: string) {
  const { error } = await client().auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
