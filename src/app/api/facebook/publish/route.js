import { resolveFacebookConfig } from "@/lib/facebook-request";
import { createPagePost, toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const config = await resolveFacebookConfig(request);
    const payload = await request.json();
    const message = String(payload?.message || "").trim();
    const mediaIds = Array.isArray(payload?.mediaIds)
      ? payload.mediaIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!message) return Response.json({ ok: false, error: "A caption is required." }, { status: 400 });
    if (!mediaIds.length || mediaIds.length > 8) return Response.json({ ok: false, error: "Add between 1 and 8 uploaded photos." }, { status: 400 });
    const result = await createPagePost(config, { message, mediaIds, scheduledFor: payload?.scheduledFor || "" });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return toRouteError(error);
  }
}
