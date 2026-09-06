import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import SearchResults from "@/templates/orst/SearchResults";
import { getTenant, getNavItems } from "@/lib/cms";

// Real site search (TOR gap audit) — see templates/orst/SearchResults.tsx.
// Same "reserved slug, not a real content page" pattern as app/orst/preview
// (see that route's own comment) — "search" may not be used as a WordPress
// page slug for the same reason.
export const metadata = { robots: { index: false, follow: false } };

export default async function OrstSearchPage() {
  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst")]);
  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <Header active="" navItems={navItems} />
      <main id="main-content">
        <div id="app-content">
          <SearchResults />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
