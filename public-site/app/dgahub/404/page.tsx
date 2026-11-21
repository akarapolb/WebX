import { Shell, base, searchPath, site } from "@/templates/dgahub/Site";
import { notFoundMetadata, NOT_FOUND_TEXT as T } from "@/lib/site/notFound";

// Hub-styled "page not found". The static export writes /dgahub/404.html; a host
// serving only the hub uses it as its 404 page (see tools/webx/publish-dgahub.mjs).
export const metadata = { ...notFoundMetadata, icons: { icon: site.icon } };

export default function Page() {
  return (
    <Shell locale="th" path={base("th") + "/404"} otherHref={base("en")}>
      <div className="page-head">
        <div className="wrap">
          <p className="eyebrow" style={{ color: "var(--hero-accent)" }}>404</p>
          <h1>{T.th.title}</h1>
          <p lang="en">{T.en.title}</p>
        </div>
      </div>
      <section className="section">
        <div className="wrap prose">
          <p>{T.th.body}</p>
          <p lang="en">{T.en.body}</p>
          <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn" href={base("th")}>{T.th.home}</a>
            <a className="btn ghost" href={searchPath("th")}>{T.th.search}</a>
            <a className="btn ghost" href={base("en")} lang="en">{T.en.home}</a>
          </p>
        </div>
      </section>
    </Shell>
  );
}
