import { del } from "@vercel/blob";
import { resolveFacebookConfig } from "@/lib/facebook-request";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await resolveFacebookConfig(request);
    const { url } = await request.json();
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      return Response.json({ ok: false, error: "That is not an approved video storage URL." }, { status: 400 });
    }
    await del(parsed.href);
    return Response.json({ ok: true });
  } catch (error) {
    return toRouteError(error);
  }
}
