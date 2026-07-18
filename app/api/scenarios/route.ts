import { NextResponse } from "next/server";

import { getPublicScenarioCatalog } from "../../../lib/scenarios";

export async function GET() {
  return NextResponse.json({ scenarios: getPublicScenarioCatalog() });
}
