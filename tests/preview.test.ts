import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPreview, previewPath } from "@/lib/engine/preview";

const base = "https://abc123-5173.preview.getsolari.com?pt_token=tok.en";

describe("previewPath", () => {
  it("keeps the gateway token when a path is appended", () => {
    expect(previewPath(base, "/")).toBe("https://abc123-5173.preview.getsolari.com/?pt_token=tok.en");
    expect(previewPath(base, "/api/health")).toBe(
      "https://abc123-5173.preview.getsolari.com/api/health?pt_token=tok.en",
    );
  });

  it("merges the path's own query on top of the token", () => {
    expect(previewPath(base, "/search?q=x")).toBe(
      "https://abc123-5173.preview.getsolari.com/search?pt_token=tok.en&q=x",
    );
  });

  it("keeps same-origin absolute paths and still merges the token", () => {
    expect(previewPath(base, "https://abc123-5173.preview.getsolari.com/x?q=1")).toBe(
      "https://abc123-5173.preview.getsolari.com/x?pt_token=tok.en&q=1",
    );
  });

  it("pins off-origin http(s) paths to the preview host", () => {
    expect(previewPath(base, "https://example.com/x")).toBe(
      "https://abc123-5173.preview.getsolari.com/?pt_token=tok.en",
    );
    expect(previewPath(base, "http://169.254.169.254/latest/meta-data/")).toBe(
      "https://abc123-5173.preview.getsolari.com/?pt_token=tok.en",
    );
  });

  it("pins protocol-relative URLs to the preview host", () => {
    expect(previewPath(base, "//evil.example/phish")).toBe(
      "https://abc123-5173.preview.getsolari.com/?pt_token=tok.en",
    );
  });
});

describe("fetchPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function redirect(to: string) {
    return new Response(null, { status: 302, headers: { Location: to } });
  }

  it("follows redirects that stay on the preview origin", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/go")) {
        return redirect("https://abc123-5173.preview.getsolari.com/ok?pt_token=tok.en");
      }
      return new Response("up", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPreview("https://abc123-5173.preview.getsolari.com/go?pt_token=tok.en");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not follow an off-origin Location", async () => {
    const fetchMock = vi.fn(async () => redirect("http://169.254.169.254/"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPreview("https://abc123-5173.preview.getsolari.com/?pt_token=tok.en");
    expect(res.status).toBe(302);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
