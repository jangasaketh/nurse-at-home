"use client";

// MAPS AND CALLS (phase 9, version 1.7.0)
//
// Maps: Leaflet with OpenStreetMap tiles (free, no key). For many users, set NEXT_PUBLIC_MAP_TILES to a tile
// provider's address (for example MapTiler or Stadia, with their key) in the deploy workflow; OpenStreetMap's
// own tiles are meant for light use.
// Calls: the "call" Edge Function connects the patient and the caregiver through Exotel, numbers hidden.

import { useEffect, useState } from "react";
import { db, type AppName } from "./supabase";

export type LatLng = { lat: number; lng: number };

export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

/** Rough centre of each launch city, where the map opens before a pin is set. */
export const CITY_CENTRES: Record<string, LatLng> = {
  hyd: { lat: 17.385, lng: 78.4867 },
  blr: { lat: 12.9716, lng: 77.5946 },
  bom: { lat: 19.076, lng: 72.8777 },
  maa: { lat: 13.0827, lng: 80.2707 },
  trv: { lat: 8.5241, lng: 76.9366 },
};
export const cityCentre = (cityId: string): LatLng => CITY_CENTRES[cityId] ?? CITY_CENTRES.hyd;

export const inIndia = (p: LatLng | null | undefined): p is LatLng =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 6 && p.lat <= 37 && p.lng >= 68 && p.lng <= 98;

/** Straight-line distance in km. */
export function kmBetween(a: LatLng, b: LatLng) {
  const r = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Google Maps directions: to the pin when there is one, else to the written address. Opens the Maps app on phones. */
export const directionsTo = (pin: LatLng | null | undefined, address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(inIndia(pin) ? `${pin.lat},${pin.lng}` : address)}&travelmode=driving`;

/** The phone's position, once. Rejects with "denied", "unavailable" or "timeout". */
export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

/** Follow the phone's position while `on` is true (caregiver on the way). null until known or if not allowed. */
export function useMyPosition(on: boolean) {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!on || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setDenied(false); },
      (e) => { if (e.code === 1) setDenied(true); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);
  return { pos, denied };
}

// ---------- Caregiver: share where I am while on the way ----------
export const shareLocation = async (bookingId: string, p: LatLng) => {
  const { error } = await db("caregiver").rpc("share_location", { p_booking: bookingId, p_lat: p.lat, p_lng: p.lng });
  if (error) throw error;
};

// ---------- Patient: where is the caregiver ----------
export type CaregiverWhere = { at: LatLng | null; seenAt: number | null; home: LatLng | null };
export async function caregiverLocation(bookingId: string): Promise<CaregiverWhere> {
  const { data, error } = await db("patient").rpc("caregiver_location", { p_booking: bookingId });
  if (error) throw error;
  const d = (data ?? {}) as { lat?: number | null; lng?: number | null; at?: string | null; home_lat?: number | null; home_lng?: number | null };
  const at = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
  const home = d.home_lat != null && d.home_lng != null ? { lat: d.home_lat, lng: d.home_lng } : null;
  return { at, seenAt: d.at ? new Date(d.at).getTime() : null, home };
}

// ---------- Private calls ----------
export type CallResult = "calling" | "not-set-up" | "not-allowed" | "failed";
export async function privateCall(app: AppName, bookingId: string): Promise<CallResult> {
  const { error } = await db(app).functions.invoke("call", { body: { booking: bookingId } });
  if (!error) return "calling";
  const status = (error as { context?: Response }).context?.status;
  return status === 503 ? "not-set-up" : status === 403 || status === 401 ? "not-allowed" : "failed";
}
