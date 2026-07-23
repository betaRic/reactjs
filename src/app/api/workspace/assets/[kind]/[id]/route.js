import { streamOfficeAsset } from "@/lib/workspace-server";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    return await streamOfficeAsset(request, resolved.kind, resolved.id);
  } catch (error) {
    return toRouteError(error);
  }
}
