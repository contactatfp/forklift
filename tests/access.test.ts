import { afterEach, describe, expect, it } from "vitest";
import { accessKeyOk } from "@/lib/access";

describe("accessKeyOk", () => {
  const prevKey = process.env.FORKLIFT_ACCESS_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.FORKLIFT_ACCESS_KEY;
    else process.env.FORKLIFT_ACCESS_KEY = prevKey;
  });

  function req(headers: Record<string, string>) {
    return new Request("http://local/api/jobs", { headers });
  }

  it("is open when no key is configured (non-production)", () => {
    delete process.env.FORKLIFT_ACCESS_KEY;
    expect(accessKeyOk(req({}))).toBe(true);
  });

  it("accepts a matching x-forklift-key header", () => {
    process.env.FORKLIFT_ACCESS_KEY = "secret-key";
    expect(accessKeyOk(req({ "x-forklift-key": "secret-key" }))).toBe(true);
  });

  it("rejects a wrong header", () => {
    process.env.FORKLIFT_ACCESS_KEY = "secret-key";
    expect(accessKeyOk(req({ "x-forklift-key": "nope" }))).toBe(false);
  });

  it("ignores a key that only appears as a request body field", () => {
    process.env.FORKLIFT_ACCESS_KEY = "secret-key";
    expect(accessKeyOk(req({}))).toBe(false);
  });
});
