import { NextResponse, type NextRequest } from "next/server";

/** v1 gate: HTTP basic auth in front of the whole console. Swap for SSO before scaling the ops team. */
export function middleware(req: NextRequest) {
  const user = process.env.CONSOLE_USER;
  const pass = process.env.CONSOLE_PASSWORD;
  if (!user || !pass) return new NextResponse("Console auth not configured", { status: 503 });
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = atob(encoded).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Embryo Console"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
