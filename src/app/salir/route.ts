import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/web-session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return new Response("Solicitud no autorizada", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== req.nextUrl.host) return new Response("Solicitud no autorizada", { status: 403 }); }
    catch { return new Response("Solicitud no autorizada", { status: 403 }); }
  }
  const response = NextResponse.redirect(new URL("/acceso", req.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
