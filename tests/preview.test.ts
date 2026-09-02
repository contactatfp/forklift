import { describe, expect, it } from "vitest";
import { previewPath } from "@/lib/engine/preview";

const base = "https://abc123-5173.preview.getsolari.com?pt_token=tok.en";

describe("previewPath", () => {
  it("keeps the gateway token when a path is appended", () => {
    expect(previewPath(base, "/")).toBe("https://abc123-5173.preview.getsolari.com/?pt_token=tok.en");
    expect(previewPath(base, "/api/health")).toBe("https://abc123-5173.preview.getsolari.com/api/health?pt_token=tok.en");
  });

  it("merges the path's own query on top of the token", () => {
    expect(previewPath(base, "/search?q=x")).toBe(
      "https://abc123-5173.preview.getsolari.com/search?pt_token=tok.en&q=x",
    );
  });

  it("leaves absolute demo URLs alone", () => {
    expect(previewPath(base, "https://example.com/x")).toBe("https://example.com/x");
  });
});
