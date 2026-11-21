import { dataFiles, dataFile } from "@/templates/dgahub/openData";

// Static open-data files (th), written at export time (see openData.ts).
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await dataFiles("th")).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  return dataFile("th", (await params).file);
}
