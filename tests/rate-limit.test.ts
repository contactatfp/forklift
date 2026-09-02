import { afterEach, describe, expect, it } from "vitest";
import { resetRateLimitsForTests, takeToken } from "@/lib/rate-limit";

describe("takeToken", () => {
  afterEach(() => {
    resetRateLimitsForTests();
  });

  function req(ip = "1.2.3.4") {
    return new Request("http://local/", { headers: { "x-forwarded-for": ip } });
  }

  it("allows up to the limit then returns retry-after", () => {
    const a = req("10.0.0.1");
    expect(takeToken(a, "jobs", 2, 60_000)).toBeNull();
    expect(takeToken(a, "jobs", 2, 60_000)).toBeNull();
    const retry = takeToken(a, "jobs", 2, 60_000);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it("isolates IPs", () => {
    expect(takeToken(req("10.0.0.1"), "jobs", 1, 60_000)).toBeNull();
    expect(takeToken(req("10.0.0.2"), "jobs", 1, 60_000)).toBeNull();
    expect(takeToken(req("10.0.0.1"), "jobs", 1, 60_000)).not.toBeNull();
  });

  it("uses the first x-forwarded-for hop", () => {
    const r = new Request("http://local/", {
      headers: { "x-forwarded-for": "  8.8.8.8, 10.0.0.1" },
    });
    expect(takeToken(r, "jobs", 1, 60_000)).toBeNull();
    const again = new Request("http://local/", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    expect(takeToken(again, "jobs", 1, 60_000)).not.toBeNull();
  });
});
