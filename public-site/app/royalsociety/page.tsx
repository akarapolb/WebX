import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import HomePage from "@/templates/royalsociety/HomePage";
import { getWpNews, getWpPage, getTenant } from "@/lib/cms";

// RoyalSociety's homepage (Phase 8/9). The news/activities preview section,
// the hero kicker/title (getWpPage("royalsociety","home")), and the footer's
// contact/columns/social (getTenant) are CMS-driven — see HomePage.tsx's and
// Footer.tsx's own file-header comments for what's still static within them.
export default async function Page() {
  const articles = await getWpNews("royalsociety");
  const hero = await getWpPage("royalsociety", "home");
  const tenant = await getTenant("royalsociety");
  return (
    <>
      <Header active="home" />
      <HomePage articles={articles} hero={hero} />
      <Footer tenant={tenant} />
    </>
  );
}
