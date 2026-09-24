import { timingSafeEqual } from "node:crypto";

// The browser extension authenticates with a shared token from .env. A web page can't send
// this custom header without a CORS preflight, which these routes never approve.
export function checkExtensionToken(req: Request): string | null {
  const expected = process.env.EXTENSION_TOKEN?.trim();
  if (!expected) {
    return "Set EXTENSION_TOKEN in .env to connect the browser extension.";
  }

  const provided = req.headers.get("x-tracker-token")?.trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return "The extension token does not match EXTENSION_TOKEN.";
  }

  return null;
}

// Job URLs differ between the posting, the form, and the confirmation page on the same job
// (Lever adds /apply and /thanks, Greenhouse adds query strings), so compare a trimmed form.
export function normalizeJobUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const path = url.pathname
      .replace(/\/(apply|application|thanks|confirmation|submitted)\/?$/i, "")
      .replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return null;
  }
}
