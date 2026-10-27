"use client";

// Files waiting to be uploaded, and uploading them to private storage (Supabase Storage).
// Photos are kept in the app as small data URLs, so they can be turned back into a file at any time.
// A PDF cannot be kept in the browser's storage (too big), so it is held in memory until it is uploaded;
// after a page reload it has to be chosen again.

import type { PhotoFile } from "./prescription";
import { db, type AppName } from "./supabase";

const pending = new Map<string, Blob>();
const keyOf = (p: Pick<PhotoFile, "addedAt" | "name">) => `${p.addedAt}:${p.name}`;

export function rememberFile(p: Pick<PhotoFile, "addedAt" | "name">, blob: Blob) {
  pending.set(keyOf(p), blob);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  if (head.includes(";base64")) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/** The file to upload, or null if it is no longer available (a PDF after a reload). */
export function blobFor(p: PhotoFile): Blob | null {
  if (p.dataUrl?.startsWith("data:")) return dataUrlToBlob(p.dataUrl);
  return pending.get(keyOf(p)) ?? null;
}

export class FileGone extends Error {
  constructor(public what: string) { super(`${what} must be added again`); }
}

/**
 * Upload into the person's own folder in a private bucket: "<user id>/<kind>-<time>.<ext>".
 * Returns the storage path. Already uploaded files are not uploaded again.
 */
export async function uploadFile(app: AppName, bucket: "kyc" | "prescriptions" | "tickets", userId: string, kind: string, p: PhotoFile): Promise<string> {
  if (p.path) return p.path;
  const blob = blobFor(p);
  if (!blob) throw new FileGone(kind);
  const ext = p.kind === "pdf" ? "pdf" : blob.type === "image/png" ? "png" : blob.type === "image/svg+xml" ? "svg" : "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const contentType = p.kind === "pdf" ? "application/pdf" : blob.type === "image/svg+xml" ? "image/png" : blob.type || "image/jpeg";
  const { error } = await db(app).storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  pending.delete(keyOf(p));
  return path;
}

/** Short-lived links (10 minutes) to look at stored files. Missing ones are left out. */
export async function viewLinks(app: AppName, bucket: "kyc" | "prescriptions" | "tickets", paths: string[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await db(app).storage.from(bucket).createSignedUrls(list, 600);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const d of data) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}
