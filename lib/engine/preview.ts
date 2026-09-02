/**
 * previewUrl() hands back `https://<host>?pt_token=…`. The token has to stay in
 * the query string on every request, and `new URL("/health", that)` throws it
 * away — the gateway then answers 401 "invalid preview token", which is what
 * Forklift recorded on its first two live screenshots.
 */
export function previewPath(previewUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = new URL(previewUrl);
  const rel = new URL(path || "/", base.origin);
  const out = new URL(base.origin);
  out.pathname = rel.pathname;
  out.search = base.search;
  rel.searchParams.forEach((value, key) => out.searchParams.set(key, value));
  out.hash = rel.hash;
  return out.toString();
}
