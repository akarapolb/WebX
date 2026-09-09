import Pricing from "@/components/Pricing";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("th", "/pricing");
export default function Page() { return <Pricing locale="th" />; }
