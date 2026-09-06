"use client";
// Preview-only twin of public-site/components/LocationMapClient.tsx —
// loaded via next/dynamic(..., {ssr:false}) from blocks.tsx (already
// "use client"), same reason: Leaflet touches window/document at import
// time and would throw during webx-studio's own SSR render otherwise.
//
// One addition this copy needs that the real one doesn't: RealPreview.tsx
// renders via ReactDOM.createPortal into a cross-document <iframe srcDoc>.
// This module's code executes in the PARENT window, but the map's DOM ends
// up owned by the IFRAME's document — so Leaflet's own resize listener
// (bound to the wrong `window`) never fires when only the iframe's own
// layout changes (e.g. VisualBuilder's device-width toggle). A
// ResizeObserver on the map's own container sidesteps the wrong-window
// problem entirely, since it observes the element itself regardless of
// which document owns it.
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as any).src ?? markerIcon2x,
  iconUrl: (markerIcon as any).src ?? markerIcon,
  shadowUrl: (markerShadow as any).src ?? markerShadow,
});

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

type LocationEntry = { documentId?: string; name?: string; lat?: number; lng?: number; address?: string; phone?: string };

export default function LocationMapPreview({ entries }: { entries: LocationEntry[] }) {
  const pts = (entries || []).filter((e) => typeof e.lat === "number" && typeof e.lng === "number");
  if (!pts.length) return null;
  const sig = pts.map((p) => p.documentId || p.lat + "," + p.lng).join("|");
  return (
    <MapContainer key={sig} center={[pts[0].lat!, pts[0].lng!]} zoom={12} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <InvalidateOnResize />
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
