import { NextResponse } from "next/server";

import { emptyClaimFacts, parseClaimFacts } from "../../../lib/claimFacts";
import { processIntake } from "../../../lib/intake";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    facts?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Please provide a message." }, { status: 400 });
  }

  let currentFacts = emptyClaimFacts();
  if (body?.facts !== undefined && body.facts !== null) {
    const parsed = parseClaimFacts(body.facts);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid existing claim facts.", details: parsed.errors },
        { status: 400 }
      );
    }
    currentFacts = parsed.data;
  }

  return NextResponse.json(await processIntake(message, currentFacts));
}

