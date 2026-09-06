"use client";
// The real Leaflet + OpenStreetMap implementation — only ever loaded in the
// browser (see LocationMap.tsx's ssr:false dynamic import; this module
// touches `window`/`document` at import time, which throws if evaluated
// during output:"export"'s build-time Node render).
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon points at relative image paths that resolve
// against the page's own origin, not the leaflet package — breaks under
// every bundler including Next.js unless explicitly reconfigured. Safe at
// module scope here since this module only ever loads client-side.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as any).src ?? markerIcon2x,
  iconUrl: (markerIcon as any).src ?? markerIcon,
  shadowUrl: (markerShadow as any).src ?? markerShadow,
});

type LocationEntry = { documentId?: string; name?: string; lat?: number; lng?: number; address?: string; phone?: string };

export default function LocationMapClient({ entries }: { entries: LocationEntry[] }) {
  const pts = (entries || []).filter((e) => typeof e.lat === "number" && typeof e.lng === "number");
  if (!pts.length) return null;
  const center: [number, number] = [pts[0].lat!, pts[0].lng!];
  // key forces a full remount (and thus a real re-center) whenever the
  // entry set changes — MapContainer only honors center/zoom on first
  // mount, silently ignoring later prop changes.
  const sig = pts.map((p) => p.documentId || p.lat + "," + p.lng).join("|");
  return (
    <MapContainer key={sig} center={center} zoom={12} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pts.map((e, i) => (
        <Marker key={e.documentId || i} position={[e.lat!, e.lng!]}>
          <Popup>
            <b>{e.name}</b>
            {e.address && <div>{e.address}</div>}
            {e.phone && <div>{e.phone}</div>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
