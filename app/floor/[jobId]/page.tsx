import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { FloorClient } from "./floor-client";

export const dynamic = "force-dynamic";

export default async function FloorPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const store = await getStore();
  const job = await store.getJob(jobId);
  if (!job) notFound();
  const bays = await store.listBays(jobId);
  return <FloorClient jobId={jobId} initialJob={job} initialBays={bays} />;
}
