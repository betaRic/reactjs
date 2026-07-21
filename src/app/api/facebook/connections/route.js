import { NextResponse } from "next/server";
import { deleteFacebookConnection, FACEBOOK_SESSION_COOKIE, getFacebookConnections } from "@/lib/facebook-connections";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json({ ok: true, ...(await getFacebookConnections(request)) });
  } catch (error) {
    return toRouteError(error);
  }
}

export async function DELETE(request) {
  try {
    await deleteFacebookConnection(request);
    const response = NextResponse.json({ ok: true, available: true, connected: false, pages: [], selectedPageId: "" });
    response.cookies.set(FACEBOOK_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return toRouteError(error);
  }
}
