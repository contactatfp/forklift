/**
 * previewUrl() hands back `https://<host>?pt_token=…`. The token has to stay in
 * the query string on every request, and `new URL("/health", that)` throws it
 * away — the gateway then answers 401 "invalid preview token", which is what
 * Forklift recorded on its first two live screenshots.
 *
 * Paths are forced onto the preview origin. A guest forklift.yaml used to be
 * able to put https://… in health/demo and the host would fetch it (SSRF), or
 * the recorder would walk off-site.
 */
export function previewPath(previewUrl: string, path: string): string {
  const base = new URL(previewUrl);
  let rel: URL;
  try {
    rel = new URL(path || "/", base.origin);
  } catch {
    rel = new URL("/", base.origin);
  }
  if (rel.origin !== base.origin) rel = new URL("/", base.origin);
  const out = new URL(base.origin);
  out.pathname = rel.pathname;
  out.search = base.search;
  rel.searchParams.forEach((value, key) => out.searchParams.set(key, value));
  out.hash = rel.hash;
  return out.toString();
}

const MAX_HOPS = 5;

/**
 * Host-side poll of a Solari preview URL. Follow redirects only while they
 * stay on that preview origin — a guest 302 to an internal IP is not a fetch
 * we want to make from Railway.
 */
export async function fetchPreview(url: string): Promise<Response> {
  let current = url;
  const origin = new URL(url).origin;
  let res = await fetch(current, { redirect: "manual" });
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    let next: URL;
    try {
      next = new URL(loc, current);
    } catch {
      return res;
    }
    if (next.origin !== origin) return res;
    current = next.toString();
    res = await fetch(current, { redirect: "manual" });
  }
  return res;
}
