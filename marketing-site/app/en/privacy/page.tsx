import Privacy from "@/components/Privacy";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("en", "/privacy");
export default function Page() { return <Privacy locale="en" />; }
