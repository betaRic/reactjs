export const runtime = "nodejs";

export function GET() {
  return Response.json({
    ok: true,
    app: "DILG Social Studio",
    storage: "browser-local",
    timestamp: new Date().toISOString(),
  });
}
