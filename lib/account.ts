"use client";

// "Delete my account" (1.9.0) for the patient and caregiver apps. The "account" Edge Function removes the
// person's files and then their details (supabase/009_accounts.sql). Without it, only the database part runs.

import { db } from "./supabase";

type App = "patient" | "caregiver";

/** What stops deleting right now, in English (the screen translates it), or null. */
export async function accountBlocker(app: App): Promise<string | null> {
  const { data, error } = await db(app).rpc("account_blocker");
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function deleteMyAccount(app: App): Promise<void> {
  const client = db(app);
  const { error } = await client.functions.invoke("account", { body: {} });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx?.status === 404) { // the server program is not deployed: the database part still removes the details
      const r = await client.rpc("delete_my_account");
      if (r.error) throw new Error(r.error.message);
    } else {
      const body = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error((body as { error?: string } | null)?.error ?? error.message);
    }
  }
  await client.auth.signOut({ scope: "local" }).catch(() => {});
}
