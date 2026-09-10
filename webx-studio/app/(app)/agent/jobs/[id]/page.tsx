import AgentWorkspace from "@/components/agent/AgentWorkspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentWorkspace view="jobs" jobId={id} />;
}
