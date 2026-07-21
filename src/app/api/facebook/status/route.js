import { getFacebookOAuthReadiness } from "@/lib/facebook-connections";
import { resolveFacebookConfig } from "@/lib/facebook-request";
import { getPageIdentity, toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const config = await resolveFacebookConfig(request, { allowMissing: true });
    if (!config.configured) {
      const oauth = getFacebookOAuthReadiness();
      return Response.json({ ok: true, configured: false, missing: config.missing, oauthAvailable: oauth.available, oauthMissing: oauth.missing, connectionRequired: config.connectionRequired, videoStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
    }
    const page = await getPageIdentity(config);
    return Response.json({
      ok: true,
      configured: true,
      connected: true,
      mode: config.mode,
      oauthAvailable: config.oauthAvailable,
      graphVersion: config.graphVersion,
      videoStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
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
