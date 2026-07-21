import { resolveFacebookConfig } from "@/lib/facebook-request";
import { FacebookApiError, publishVideo, publishVideoStory, toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const config = await resolveFacebookConfig(request);
    const payload = await request.json();
    const videoUrl = validateVideoUrl(payload?.videoUrl);
    const destinations = Array.isArray(payload?.destinations)
      ? [...new Set(payload.destinations.filter((item) => ["feed", "story"].includes(item)))]
      : [];
    if (!destinations.length) return Response.json({ ok: false, error: "Choose Feed, My Day, or both." }, { status: 400 });
    if (payload?.scheduledFor && destinations.includes("story")) {
      return Response.json({ ok: false, error: "Facebook Stories cannot be scheduled through this connection. Clear the schedule or choose Feed only." }, { status: 400 });
    }

    const operations = [];
    if (destinations.includes("feed")) operations.push(["feed", publishVideo(config, { videoUrl, message: payload?.message, title: payload?.title, scheduledFor: payload?.scheduledFor })]);
    if (destinations.includes("story")) operations.push(["story", publishVideoStory(config, videoUrl)]);
    const settled = await Promise.allSettled(operations.map(([, operation]) => operation));
    const result = { ok: true, feed: null, story: null, errors: [] };
    settled.forEach((item, index) => {
      const destination = operations[index][0];
      if (item.status === "fulfilled") result[destination] = item.value;
      else result.errors.push({ destination, message: item.reason?.message || `${destination} publishing failed.` });
    });
    if (!result.feed && !result.story) throw settled.find((item) => item.status === "rejected")?.reason || new Error("Video publishing failed.");
    return Response.json({ ...result, partial: result.errors.length > 0 });
  } catch (error) {
    return toRouteError(error);
  }
}

function validateVideoUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new FacebookApiError("The video must be uploaded through the campaign composer.", 400);
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new FacebookApiError("The video must be uploaded through the campaign composer.", 400);
  }
  return url.href;
}
