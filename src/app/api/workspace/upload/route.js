import { handleUpload } from "@vercel/blob/client";
import { getEditorBlobToken, getEditorStorageReadiness, getWorkspaceContext } from "@/lib/workspace-server";
import { FacebookApiError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export async function POST(request) {
  try {
    const token = getEditorBlobToken();
    if (!token) throw new FacebookApiError("Private editor media storage is not configured.", 503, getEditorStorageReadiness());
    const body = await request.json();
    const response = await handleUpload({
      token,
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = safeJson(clientPayload);
        const permission = payload.kind === "template" ? "template:write" : "campaign:write";
        const context = await getWorkspaceContext(request, { permission, pageId: payload.pageId });
        const prefix = `office-media/${context.officeId}/`;
        if (!pathname.startsWith(prefix)) throw new FacebookApiError("Invalid office media upload path.", 400);
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ officeId: context.officeId, kind: payload.kind || "campaign" }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({
      error: error?.message || "The workspace image upload could not be authorized.",
      details: error?.details || null,
    }, { status: Number(error?.status) || 400 });
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
