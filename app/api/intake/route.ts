import { NextResponse } from "next/server";

import { emptyClaimFacts, parseClaimFacts } from "../../../lib/claimFacts";
import {
  MAX_INTAKE_MESSAGE_LENGTH,
  requestBodyExceedsLimit
} from "../../../lib/inputLimits";
import { processIntake } from "../../../lib/intake";

export async function POST(request: Request) {
  if (requestBodyExceedsLimit(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    facts?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Please provide a message." }, { status: 400 });
  }
  if (message.length > MAX_INTAKE_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_INTAKE_MESSAGE_LENGTH} characters or fewer.` },
      { status: 413 }
    );
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
