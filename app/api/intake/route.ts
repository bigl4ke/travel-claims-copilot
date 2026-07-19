import { createIntakeRouteHandler } from "../../../lib/api/intake-route-handler";

const intakePost = createIntakeRouteHandler();

export async function POST(request: Request): Promise<Response> {
  const response = await intakePost(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
