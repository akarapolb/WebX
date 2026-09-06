import { Suspense } from "react";
import VisualBuilder from "@/components/VisualBuilder";
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VisualBuilder />
    </Suspense>
  );
}
