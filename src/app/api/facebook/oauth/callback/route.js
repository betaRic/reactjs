import { NextResponse } from "next/server";
import {
  createOpaqueValue,
  FACEBOOK_OAUTH_STATE_COOKIE,
  FACEBOOK_SESSION_COOKIE,
  FACEBOOK_SESSION_SECONDS,
  getFacebookOAuthSettings,
  readRequestCookie,
  safeValueEqual,
  saveFacebookConnections,
} from "@/lib/facebook-connections";
import { FacebookApiError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  let settings;
  try {
    settings = getFacebookOAuthSettings(request);
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const expectedState = readRequestCookie(request, FACEBOOK_OAUTH_STATE_COOKIE);
    const code = url.searchParams.get("code") || "";
    if (!code || !state || !expectedState || !safeValueEqual(state, expectedState)) {
      throw new FacebookApiError("The Facebook connection request expired. Please try again.", 400);
    }

    const shortToken = await exchangeAuthorizationCode(settings, code);
    const userToken = await exchangeLongLivedToken(settings, shortToken);
    const [user, pageResponse] = await Promise.all([
      graphGet(settings, "me", userToken, { fields: "id,name" }),
      graphGet(settings, "me/accounts", userToken, { fields: "id,name,access_token,picture.type(square),tasks", limit: "100" }),
    ]);
    const pages = (pageResponse.data || []).filter(canCreatePageContent).map((page) => ({
      id: String(page.id || ""),
      name: String(page.name || "Facebook Page"),
      accessToken: String(page.access_token || ""),
      picture: String(page.picture?.data?.url || ""),
      tasks: Array.isArray(page.tasks) ? page.tasks : [],
    }));
    const currentSession = readRequestCookie(request, FACEBOOK_SESSION_COOKIE);
    const sessionId = /^[A-Za-z0-9_-]{32,128}$/.test(currentSession) ? currentSession : createOpaqueValue(36);
    await saveFacebookConnections({ sessionId, user, pages });

    const response = NextResponse.redirect(`${settings.origin}/?facebook=connected`);
    response.cookies.set(FACEBOOK_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: FACEBOOK_SESSION_SECONDS,
    });
    response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch {
    const origin = settings?.origin || new URL(request.url).origin;
    const response = NextResponse.redirect(`${origin}/?facebook=error`);
    response.cookies.set(FACEBOOK_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }
}

async function exchangeAuthorizationCode(settings, code) {
  const url = new URL(`https://graph.facebook.com/${settings.graphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("client_secret", settings.appSecret);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("code", code);
  const payload = await fetchJson(url, "Facebook authorization");
  if (!payload.access_token) throw new FacebookApiError("Facebook did not return an access token.", 502);
  return payload.access_token;
}

async function exchangeLongLivedToken(settings, token) {
  const url = new URL(`https://graph.facebook.com/${settings.graphVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("client_secret", settings.appSecret);
  url.searchParams.set("fb_exchange_token", token);
  const payload = await fetchJson(url, "Facebook long-lived authorization");
  if (!payload.access_token) throw new FacebookApiError("Facebook did not return a long-lived access token.", 502);
  return payload.access_token;
}

async function graphGet(settings, path, token, search) {
  const url = new URL(`https://graph.facebook.com/${settings.graphVersion}/${path}`);
  Object.entries(search).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new FacebookApiError(payload.error?.message || "Facebook connection failed.", response.status >= 400 && response.status < 500 ? response.status : 502);
  return payload;
}

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new FacebookApiError(payload.error?.message || `${label} failed.`, response.status >= 400 && response.status < 500 ? response.status : 502);
  return payload;
}

function canCreatePageContent(page) {
  if (!page?.id || !page?.access_token) return false;
  const tasks = Array.isArray(page.tasks) ? page.tasks : [];
  return !tasks.length || tasks.some((task) => ["CREATE_CONTENT", "MANAGE", "FULL_CONTROL", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL", "PROFILE_PLUS_MANAGE"].includes(task));
}
