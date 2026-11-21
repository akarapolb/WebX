import { dataFiles, dataFile } from "@/templates/dgahub/openData";

// Static open-data files (en), written at export time (see openData.ts).
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await dataFiles("en")).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  return dataFile("en", (await params).file);
}
