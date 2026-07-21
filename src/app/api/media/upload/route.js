import { handleUpload } from "@vercel/blob/client";
import { authorizeMediaUpload } from "@/lib/facebook-request";
import { FacebookApiError } from "@/lib/facebook-server";

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
        const config = await authorizeMediaUpload(request, payload.pageId);
        if (!pathname.startsWith(`campaign-videos/${config.pageId}/`)) throw new Error("Invalid video upload path.");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind: "campaign-video", pageId: config.pageId }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    const message = error instanceof FacebookApiError ? error.message : "The video upload could not be authorized.";
    return Response.json({ error: message }, { status: Number(error?.status) || 400 });
  }
}

function safeJson(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}
