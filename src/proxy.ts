import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login$/, /^\/offline$/, /^\/api\/auth\/login$/, /^\/api\/health$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/favicon/, /^\/robots\.txt$/];

/**
 * Cheap gate: redirect to /login when no session cookie is present. The
 * session itself is fully validated server-side in every page and API route.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const has = req.cookies.has("cp_session") || req.cookies.has("__Host-cp_session");
  if (has) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
