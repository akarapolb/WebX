import { getAgentThread, deleteAgentThread } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => getAgentThread(id));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => deleteAgentThread(id));
}
