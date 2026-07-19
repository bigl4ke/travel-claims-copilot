import { createAnalyzeRouteHandler } from "../../../lib/api/analyze-route-handler";

const analyzePost = createAnalyzeRouteHandler();

export async function POST(request: Request): Promise<Response> {
  const response = await analyzePost(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
