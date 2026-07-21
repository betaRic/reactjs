import { resolveFacebookConfig } from "@/lib/facebook-request";
import { publishPhotoStory, toRouteError, uploadUnpublishedPhoto } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request) {
  try {
    const config = await resolveFacebookConfig(request);
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ ok: false, error: "A Story image is required." }, { status: 400 });
    if (!photo.type.startsWith("image/") || !photo.size || photo.size > MAX_IMAGE_BYTES) {
      return Response.json({ ok: false, error: "The prepared Story image must be smaller than 4 MB." }, { status: 413 });
    }
    const uploaded = await uploadUnpublishedPhoto(config, photo);
    const result = await publishPhotoStory(config, uploaded.id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return toRouteError(error);
  }
}
