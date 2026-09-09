import Home from "@/components/Home";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("th", "/");
export default function Page() { return <Home locale="th" />; }
