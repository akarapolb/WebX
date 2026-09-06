import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import SearchResults from "@/templates/royalsociety/SearchResults";
import { getTenant } from "@/lib/cms";

// Real site search (TOR gap audit) — see templates/royalsociety/SearchResults.tsx.
// Same "reserved slug, not a real content page" pattern as
// app/royalsociety/preview (see that route's own comment).
export const metadata = { robots: { index: false, follow: false } };

export default async function RoyalSocietySearchPage() {
  const tenant = await getTenant("royalsociety");
  return (
    <>
      <Header active="" />
      <main id="main-content">
        <div id="app-content">
          <SearchResults />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
