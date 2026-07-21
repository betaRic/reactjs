import { getFacebookConfig, getPageIdentity, requirePublishAccess, toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const config = getFacebookConfig({ allowMissing: true });
    if (!config.configured) {
      return Response.json({ ok: true, configured: false, missing: config.missing, videoStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
    }
    requirePublishAccess(request, config);
    const page = await getPageIdentity(config);
    return Response.json({
      ok: true,
      configured: true,
      connected: true,
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
