import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/web-session";
import { appRedirect, sameSiteForm } from "@/server/auth/public-origin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sameSiteForm(req)) return new Response("Solicitud no autorizada", { status: 403 });
  const response = NextResponse.redirect(appRedirect(req, "/acceso"), { status: 303 });
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
