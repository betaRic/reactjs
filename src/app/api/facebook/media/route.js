import { resolveFacebookConfig } from "@/lib/facebook-request";
import { toRouteError, uploadUnpublishedPhoto } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request) {
  try {
    const config = await resolveFacebookConfig(request);
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ ok: false, error: "An image file is required." }, { status: 400 });
    if (!ALLOWED_TYPES.has(photo.type)) return Response.json({ ok: false, error: "Use a JPG, PNG, or WebP image." }, { status: 415 });
    if (!photo.size || photo.size > MAX_IMAGE_BYTES) return Response.json({ ok: false, error: "Each prepared image must be smaller than 4 MB." }, { status: 413 });
    const result = await uploadUnpublishedPhoto(config, photo);
    return Response.json({ ok: true, mediaId: result.id });
  } catch (error) {
    return toRouteError(error);
  }
}
