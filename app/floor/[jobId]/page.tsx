import { FloorClient } from "./floor-client";

export const dynamic = "force-dynamic";

export default async function FloorPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <FloorClient jobId={jobId} />;
}
