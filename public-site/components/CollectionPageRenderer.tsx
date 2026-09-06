import Header from "./Header";
import Footer from "./Footer";
import { mediaUrl, fmtDateTh } from "@/lib/cms";
import { parseVideoUrl } from "@/lib/video";
import { brandCssVars } from "@/lib/brandColor";
import type { NavItem, Tenant, CollectionPageConfig } from "@/lib/cms";

// The detail-page pair to BlockRenderer.tsx's CollectionListBlock — same
// Header/main/Footer wrapper shape as PageRenderer.tsx, but one generic
// layout (back-link, hero, title, date, full body) driven entirely by the
// resolved field mapping instead of a dynamiczone of blocks. `entry` is
// whatever getCollectionEntry() returned — a raw Strapi row, field names
// picked in the Visual Builder (see VisualBuilder.tsx's field-mapping
// selects), same convention as CollectionListBlock's own card-plucking.
export default function CollectionPageRenderer({
  tenant, tenantKey, navItems, entry, config,
}: {
  tenant: Tenant;
  tenantKey: string;
  navItems?: NavItem[];
  entry: any;
  config: CollectionPageConfig;
}) {
  const orgName = tenant.brand?.orgName?.th || tenant.name;
  const primary = tenant.brand?.primaryColor;
  const title = config.titleField ? entry[config.titleField] : "";
  const img = config.imageField ? mediaUrl(entry[config.imageField]) : "";
  const date = config.dateField ? entry[config.dateField] : "";
  const body = config.bodyField ? entry[config.bodyField] : "";
  const video = config.videoUrlField ? parseVideoUrl(entry[config.videoUrlField]) : null;

  return (
    <>
      {primary && <style dangerouslySetInnerHTML={{ __html: brandCssVars(primary) }} />}
      <Header tenant={tenant} logoAlt={orgName} navItems={navItems} />
      <main id="main">
        <article className="block cp-block">
          <a className="cp-back" href={"/" + tenantKey + "/" + config.sourceSlug}>← กลับ</a>
          {video ? (
            <div className="cp-video">
              {video.type === "youtube"
                ? <iframe src={video.embedUrl} title={title || ""} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                : <video controls poster={img || undefined} src={video.url} />}
            </div>
          ) : (
            img && <div className="cp-hero"><img src={img} alt="" /></div>
          )}
          <h1 className="cp-title">{title}</h1>
          {date && <p className="cp-meta">{fmtDateTh(date)}</p>}
          {body && <div className="cp-body" dangerouslySetInnerHTML={{ __html: String(body) }} />}
        </article>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
