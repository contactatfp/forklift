import { timingSafeEqual } from "node:crypto";
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

function secretEqual(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Header only. A key in the JSON body is ignored. */
export function accessKeyOk(request: Request): boolean {
  if (writesLocked()) return false;
  const expected = process.env.FORKLIFT_ACCESS_KEY;
  if (!expected) return true;
  const header = request.headers.get("x-forklift-key") ?? "";
  return secretEqual(header, expected);
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
