import { NextResponse } from "next/server";
import { buildAuthUrl, metaConfigured, originFromRequest, STATE_COOKIE } from "@/lib/meta";

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  if (!metaConfigured()) {
    return NextResponse.redirect(`${origin}/?social=not_configured`);
  }

  const state = crypto.randomUUID();
  // Set the cookie on the redirect response itself so Set-Cookie is emitted.
  const res = NextResponse.redirect(buildAuthUrl(origin, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
