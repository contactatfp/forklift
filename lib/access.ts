import { NextResponse } from "next/server";

export function accessKeyConfigured(): boolean {
  return Boolean(process.env.FORKLIFT_ACCESS_KEY);
}

export function accessKeyOk(request: Request, bodyKey?: unknown): boolean {
  const expected = process.env.FORKLIFT_ACCESS_KEY;
  if (!expected) return true;
  const header = request.headers.get("x-forklift-key");
  const fromBody = typeof bodyKey === "string" ? bodyKey : "";
  return header === expected || fromBody === expected;
}

export function deny(): NextResponse {
  return NextResponse.json(
    { error: "Access key required. Send x-forklift-key." },
    { status: 401 },
  );
}
