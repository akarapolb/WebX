import { notFound } from "next/navigation";
import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import AboutPage from "@/templates/royalsociety/AboutPage";
import KnowledgePage from "@/templates/royalsociety/KnowledgePage";
import ServicesPage from "@/templates/royalsociety/ServicesPage";
import PublicationsPage from "@/templates/royalsociety/PublicationsPage";
import ActivitiesPage from "@/templates/royalsociety/ActivitiesPage";
import ContactPage from "@/templates/royalsociety/ContactPage";
import {
  getWpServices,
  getWpPublications,
  getWpNews,
  getWpFaqs,
  getWpResources,
  getWpPage,
  getWpTimeline,
  getWpMissionItems,
  getWpOrgUnits,
  getTenant,
} from "@/lib/cms";

const PAGES = ["about", "knowledge", "activities", "publications", "services", "contact"];

export function generateStaticParams() {
  return PAGES.map((page) => ({ page }));
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!PAGES.includes(page)) return notFound();

  const tenant = await getTenant("royalsociety");

  return (
    <>
      <Header active={page} />
      {page === "about" && (
        <AboutPage
          about={await getWpPage("royalsociety", "about")}
          timeline={await getWpTimeline("royalsociety")}
          missionItems={await getWpMissionItems("royalsociety")}
          orgUnits={await getWpOrgUnits("royalsociety")}
        />
      )}
      {page === "knowledge" && <KnowledgePage resources={await getWpResources("royalsociety")} />}
      {page === "services" && (
        <ServicesPage
          services={await getWpServices("royalsociety")}
          faqs={await getWpFaqs("royalsociety")}
        />
      )}
      {page === "publications" && <PublicationsPage publications={await getWpPublications("royalsociety")} />}
      {page === "activities" && <ActivitiesPage activities={await getWpNews("royalsociety")} />}
      {page === "contact" && <ContactPage />}
      <Footer tenant={tenant} />
    </>
  );
}
