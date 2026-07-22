import { getFacebookOAuthReadiness } from "@/lib/facebook-connections";
import { resolveFacebookConfig } from "@/lib/facebook-request";
import { getPageIdentity, toRouteError } from "@/lib/facebook-server";
import { getBlobStorageReadiness } from "@/lib/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const videoStorage = getBlobStorageReadiness();
    const config = await resolveFacebookConfig(request, { allowMissing: true, requirePublish: false });
    if (!config.configured) {
      const oauth = getFacebookOAuthReadiness();
      return Response.json({ ok: true, configured: false, missing: config.missing, oauthAvailable: oauth.available, oauthMissing: oauth.missing, connectionRequired: config.connectionRequired, videoStorageConfigured: videoStorage.configured, videoStorageMode: videoStorage.mode });
    }
    const page = await getPageIdentity(config);
    return Response.json({
      ok: true,
      configured: true,
      connected: true,
      mode: config.mode,
      oauthAvailable: config.oauthAvailable,
      graphVersion: config.graphVersion,
      videoStorageConfigured: videoStorage.configured,
      videoStorageMode: videoStorage.mode,
      page: {
        id: page.id,
        name: page.name,
        link: page.link || "",
        picture: page.picture?.data?.url || "",
      },
    });
  } catch (error) {
    return toRouteError(error);
  }
}
