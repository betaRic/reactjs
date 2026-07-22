import { applyAdminAction, getAdminDirectory } from "@/lib/access-control";
import { getFacebookSessionIdentity } from "@/lib/facebook-connections";
import { FacebookApiError, toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const identity = await requireIdentity(request);
    return Response.json({ ok: true, ...(await getAdminDirectory(identity.metaUserId)) });
  } catch (error) {
    return toRouteError(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const identity = await requireIdentity(request);
    const input = await request.json().catch(() => ({}));
    const result = await applyAdminAction(identity.metaUserId, input);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return toRouteError(error);
  }
}

async function requireIdentity(request) {
  const identity = await getFacebookSessionIdentity(request);
  if (!identity) throw new FacebookApiError("Sign in before opening staff administration.", 401);
  return identity;
}

function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin.replace(/\/$/, "");
  const canonicalOrigin = String(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const allowedOrigins = new Set([requestOrigin, canonicalOrigin].filter(Boolean));
  if (origin && !allowedOrigins.has(origin.replace(/\/$/, ""))) {
    throw new FacebookApiError("That administrator request came from an untrusted origin.", 403);
  }
}
