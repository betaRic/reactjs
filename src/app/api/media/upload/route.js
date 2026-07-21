import { handleUpload } from "@vercel/blob/client";
import { getFacebookConfig, verifyPublishKeyValue } from "@/lib/facebook-server";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export async function POST(request) {
  try {
    const body = await request.json();
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = safeJson(clientPayload);
        verifyPublishKeyValue(payload.publishKey, getFacebookConfig());
        if (!pathname.startsWith("campaign-videos/")) throw new Error("Invalid video upload path.");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind: "campaign-video" }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message || "The video could not be uploaded." }, { status: Number(error?.status) || 400 });
  }
}

function safeJson(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
