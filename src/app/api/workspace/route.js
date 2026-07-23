import { getOfficeWorkspace, importOfficeWorkspace } from "@/lib/workspace-server";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request) {
  try {
    return Response.json(await getOfficeWorkspace(request));
  } catch (error) {
    return toRouteError(error);
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    return Response.json(await importOfficeWorkspace(request, payload));
  } catch (error) {
    return toRouteError(error);
  }
}
