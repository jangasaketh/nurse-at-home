"use client";

// A small map (Leaflet + OpenStreetMap). Two uses:
//   <MapBox pin={...} onPin={...} />    pick a place: tap or drag the pin (patient address)
//   <MapBox pin={home} other={caregiver} />   show places (caregiver directions, patient tracking)
// Leaflet is loaded only when a map is on screen, so the apps stay quick to open.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/maps";
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/maps";

type Props = {
  pin: LatLng | null;
  centre: LatLng;
  onPin?: (p: LatLng) => void;
  other?: LatLng | null;
  label: string;
  height?: number;
};

// A coloured dot instead of Leaflet's image pins (no image files to host).
const dot = (L: typeof import("leaflet"), colour: string, size: number) =>
  L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${colour};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>` });

export function MapBox({ pin, centre, onPin, other, label, height = 220 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const pinMarker = useRef<import("leaflet").Marker | null>(null);
  const otherMarker = useRef<import("leaflet").Marker | null>(null);
  const Lref = useRef<typeof import("leaflet") | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  // The latest places, for when Leaflet finishes loading after they changed.
  const latest = useRef({ pin, other });
  latest.current = { pin, other };

  // Create the map once.
  useEffect(() => {
    let gone = false;
    import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof import("leaflet") }).default ?? mod;
      if (gone || !box.current || map.current) return;
      Lref.current = L;
      const start = pin ?? centre;
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], pin ? 16 : 12);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
      if (onPinRef.current) {
        m.on("click", (e: import("leaflet").LeafletMouseEvent) => onPinRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      }
      map.current = m;
      (box.current as unknown as { __map?: unknown }).__map = m; // for tests
      sync();
    });
    return () => { gone = true; map.current?.remove(); map.current = null; pinMarker.current = null; otherMarker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the markers in step with the props.
  const sync = () => {
    const L = Lref.current, m = map.current;
    if (!L || !m) return;
    const { pin, other } = latest.current;
    if (pin) {
      if (!pinMarker.current) {
        pinMarker.current = L.marker([pin.lat, pin.lng], { icon: dot(L, "#0F6E56", 22), draggable: !!onPinRef.current, keyboard: false }).addTo(m);
        pinMarker.current.on("dragend", () => { const p = pinMarker.current!.getLatLng(); onPinRef.current?.({ lat: p.lat, lng: p.lng }); });
      } else pinMarker.current.setLatLng([pin.lat, pin.lng]);
    } else if (pinMarker.current) { pinMarker.current.remove(); pinMarker.current = null; }
    if (other) {
      if (!otherMarker.current) otherMarker.current = L.marker([other.lat, other.lng], { icon: dot(L, "#1D5FBF", 18), keyboard: false }).addTo(m);
      else otherMarker.current.setLatLng([other.lat, other.lng]);
    } else if (otherMarker.current) { otherMarker.current.remove(); otherMarker.current = null; }
    if (pin && other) m.fitBounds(L.latLngBounds([[pin.lat, pin.lng], [other.lat, other.lng]]), { padding: [36, 36], maxZoom: 16 });
    else if (pin && !m.getBounds().pad(-0.2).contains([pin.lat, pin.lng])) m.setView([pin.lat, pin.lng], Math.max(m.getZoom(), 15));
  };
  useEffect(sync, [pin?.lat, pin?.lng, other?.lat, other?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moving to another city before a pin is set: follow it.
  useEffect(() => { if (!pin && map.current) map.current.setView([centre.lat, centre.lng], 12); }, [centre.lat, centre.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="map-box" role="region" aria-label={label} style={{ height, borderRadius: 14, overflow: "hidden", zIndex: 0, position: "relative" }} />;
}
