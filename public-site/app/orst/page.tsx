import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import HomePage from "@/templates/orst/HomePage";
import { getWpPage, getWpFaqs, getTenant } from "@/lib/cms";

// ORST's homepage (Phase 8) — hand-written in the source (not JSON-block
// driven, see app/orst/[page]/page.tsx for the 5 pages that are).
export default async function Page() {
  const [hero, faqs, tenant] = await Promise.all([getWpPage("orst", "home"), getWpFaqs("orst"), getTenant("orst")]);
  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <Header active="home" />
      <HomePage hero={hero} faqs={faqs} />
      <Footer tenant={tenant} />
    </>
  );
}
