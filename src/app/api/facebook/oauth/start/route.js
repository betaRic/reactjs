import { NextResponse } from "next/server";
import { createOpaqueValue, FACEBOOK_OAUTH_STATE_COOKIE, getFacebookOAuthSettings } from "@/lib/facebook-connections";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const settings = getFacebookOAuthSettings(request);
    const state = createOpaqueValue();
    const url = new URL(`https://www.facebook.com/${settings.graphVersion}/dialog/oauth`);
    url.searchParams.set("client_id", settings.appId);
    url.searchParams.set("redirect_uri", settings.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "pages_show_list,pages_manage_posts,pages_read_engagement");
    const response = NextResponse.redirect(url);
    response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return toRouteError(error);
  }
}
