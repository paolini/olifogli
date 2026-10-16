import type { NextRequest } from "next/server";

// Accept only root-relative paths. Inspect encoded forms as well, but preserve
// the original encoding in the redirect so query parameters keep their meaning.
export function safeRedirectUrl(req: NextRequest, destination: string | null): URL {
  const origin = req.nextUrl.origin;
  const fallback = new URL("/", origin);
  if (!destination) return fallback;

  let candidate = destination;
  for (let depth = 0; depth < 8; depth++) {
    if (!candidate.startsWith("/") || candidate.startsWith("//") ||
        /[\\\u0000-\u001f\u007f]/.test(candidate)) return fallback;
    try {
      const parsed = new URL(candidate, origin);
      if (parsed.origin !== origin || parsed.pathname.startsWith("//")) return fallback;
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return new URL(destination, origin);
      candidate = decoded;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
