"use client";
// Thin ssr:false boundary — Next 15 App Router requires dynamic(...,
// {ssr:false}) to be called from a Client Component module; BlockRenderer.tsx
// (which imports this) is a Server Component, so the real Leaflet code lives
// in a separate module (LocationMapClient.tsx) loaded only via this wrapper.
import dynamic from "next/dynamic";

const Inner = dynamic(() => import("./LocationMapClient"), {
  ssr: false,
  loading: () => <div className="cl-map cl-map--loading" />,
});

export default function LocationMap({ entries }: { entries: any[] }) {
  return (
    <div className="cl-map">
      <Inner entries={entries} />
    </div>
  );
}
