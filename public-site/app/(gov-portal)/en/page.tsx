import HomePage from "@/components/HomePage";

// English homepage of the default tenant (Thai lives at "/").
export default function Page() {
  return <HomePage tenantKey="dga" locale="en" />;
}
