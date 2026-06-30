import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCode,
  getLongLivedToken,
  MetaError,
  originFromRequest,
  STATE_COOKIE,
  TOKEN_COOKIE,
} from "@/lib/meta";

export async function GET(req: NextRequest) {
  const origin = originFromRequest(req);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  const errDesc = req.nextUrl.searchParams.get("error_description");

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  const fail = (social: string, reason?: string) => {
    const url = new URL(`${origin}/`);
    url.searchParams.set("social", social);
    if (reason) url.searchParams.set("reason", reason);
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (err) return fail("denied", errDesc ?? err);
  if (!code) return fail("error", "No authorization code was returned.");
  if (!state || state !== expectedState) {
    return fail(
      "bad_state",
      "Session check failed (the state cookie didn't survive the redirect).",
    );
  }

  try {
    const shortToken = await exchangeCode(origin, code);
    const longToken = await getLongLivedToken(shortToken).catch(() => shortToken);

    const url = new URL(`${origin}/`);
    url.searchParams.set("social", "connected");
    url.hash = "proof";
    const res = NextResponse.redirect(url);
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(TOKEN_COOKIE, longToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 24 * 60 * 60, // ~60 days
    });
    return res;
  } catch (e) {
    const reason = e instanceof MetaError ? e.message : "Token exchange failed.";
    return fail("error", reason);
  }
}
