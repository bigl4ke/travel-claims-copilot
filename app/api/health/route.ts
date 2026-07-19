import { buildHealthPayload } from "../../../lib/release/release-metadata";

export async function GET(): Promise<Response> {
  return Response.json(await buildHealthPayload(), {
    headers: { "Cache-Control": "no-store" }
  });
}
