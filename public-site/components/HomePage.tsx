import Header from "./Header";
import Footer from "./Footer";
import Hero from "./Hero";
import Stats from "./Stats";
import Services from "./Services";
import Highlights from "./Highlights";
import NewsPanels from "./NewsPanels";
import VideoChannel from "./VideoChannel";
import Awards from "./Awards";
import Faqs from "./Faqs";
import Featured from "./Featured";
import { getHomeData, getTenant, type Tenant } from "@/lib/cms";

const FALLBACK_TENANT: Tenant = { key: "dga", name: "สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.)" };

// Same hex/shade/rgba math as assets/tenant.js's brand-color logic, ported
// to run once at build time instead of on every client-side page load.
function hex(c: string): [number, number, number] {
  let h = c.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(c: string, pct: number): string {
  const [r, g, b] = hex(c);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round((x * (100 + pct)) / 100)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

// Shared by app/page.tsx (the default "dga" tenant, served at /) and
// app/[tenant]/page.tsx (every other tenant, one static page each at build
// time — see generateStaticParams there). This is the actual proof: the
// same CMS-driven sections cms.js renders client-side today, rendered here
// server-side/at-build-time instead, with real per-tenant data baked in.
export default async function HomePage({ tenantKey }: { tenantKey: string }) {
  // Sequential, not Promise.all: getHomeData needs to know the tenant's own
  // engine (Phase 6) before it knows which backend to fetch content from.
  // Build-time static generation, not a user-facing request — fine to pay
  // the extra round trip here.
  const tenantData = await getTenant(tenantKey);
  const data = await getHomeData(tenantKey, tenantData?.engine);
  const tenant = tenantData || FALLBACK_TENANT;
  const orgName = tenant.brand?.orgName?.th || tenant.name;
  const primary = tenant.brand?.primaryColor;

  return (
    <>
      {primary && (
        <style dangerouslySetInnerHTML={{ __html: `:root{--c-primary:${primary};--c-primary-700:${shade(primary, -22)};--c-primary-50:${rgba(primary, 0.1)}}` }} />
      )}
      <Header tenant={tenant} logoAlt={orgName + " — หน้าแรก"} />
      <main id="main">
        <Hero home={data.home} />
        <Services items={data.services} />
        <Highlights items={data.banners} />
      </main>
      <Stats />
      <NewsPanels articles={data.articles} />
      <VideoChannel items={data.videos} />
      <Awards items={data.awards} />
      <Faqs items={data.faqs} />
      <Featured home={data.home} />
      <Footer tenant={tenant} />
    </>
  );
}
