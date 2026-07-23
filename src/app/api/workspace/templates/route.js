import { deleteOfficeTemplate, saveOfficeTemplate } from "@/lib/workspace-server";
import { toRouteError } from "@/lib/facebook-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const payload = await request.json();
    return Response.json({ ok: true, template: await saveOfficeTemplate(request, payload) });
  } catch (error) {
    return toRouteError(error);
  }
}

export async function DELETE(request) {
  try {
    return Response.json(await deleteOfficeTemplate(request, await request.json()));
  } catch (error) {
    return toRouteError(error);
  }
}
