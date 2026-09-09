import Pricing from "@/components/Pricing";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("en", "/pricing");
export default function Page() { return <Pricing locale="en" />; }
