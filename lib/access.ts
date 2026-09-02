import { NextResponse } from "next/server";

export function accessKeyConfigured(): boolean {
  return Boolean(process.env.FORKLIFT_ACCESS_KEY);
}

/**
 * Production with no key fails closed. Anyone who can reach the deploy could
 * otherwise spend the Solari balance. Local dev without a key stays open.
 */
export function writesLocked(): boolean {
  return process.env.NODE_ENV === "production" && !accessKeyConfigured();
}

export function accessKeyOk(request: Request, bodyKey?: unknown): boolean {
  if (writesLocked()) return false;
  const expected = process.env.FORKLIFT_ACCESS_KEY;
  if (!expected) return true;
  const header = request.headers.get("x-forklift-key");
  const fromBody = typeof bodyKey === "string" ? bodyKey : "";
  return header === expected || fromBody === expected;
}

export function deny(): NextResponse {
  if (writesLocked()) {
    return NextResponse.json(
      { error: "FORKLIFT_ACCESS_KEY is not set on this deploy. Reviews are disabled until it is." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Access key required. Send x-forklift-key." },
    { status: 401 },
  );
}
