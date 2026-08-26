import HomePage from "@/components/HomePage";

// The default tenant (dga.or.th's own root today) — a direct render rather
// than a redirect to /dga, since static export has no server to redirect
// with at request time.
export default function Page() {
  return <HomePage tenantKey="dga" />;
}
