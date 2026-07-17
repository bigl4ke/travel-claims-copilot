import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildAnalysisFromFacts, buildAnalysisResult } from "../../../lib/analyze";
import { getMissingClaimFields, parseClaimFacts } from "../../../lib/claimFacts";
import { normalizeIssueType } from "../../../lib/issueTaxonomy";
import type { Case, Policy, Script } from "../../../lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    caseId?: unknown;
    description?: unknown;
    issueType?: unknown;
    selectedIssueType?: unknown;
    facts?: unknown;
  } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const caseId = typeof body?.caseId === "string" ? body.caseId.trim() : "";
  const issueType = normalizeIssueType(body?.issueType ?? body?.selectedIssueType);

  if (body?.facts !== undefined) {
    const parsedFacts = parseClaimFacts(body.facts);
    if (!parsedFacts.success) {
      return NextResponse.json(
        { error: "Invalid structured claim facts.", details: parsedFacts.errors },
        { status: 400 }
      );
    }

    const missingFields = getMissingClaimFields(parsedFacts.data);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Structured claim facts are incomplete.",
          facts: parsedFacts.data,
          missingFields
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      buildAnalysisFromFacts(
        parsedFacts.data,
        policies as Policy[],
        cases as Case[],
        scripts as Script[],
        description
      )
    );
  }

  if (!description && !issueType && !caseId) {
    return NextResponse.json(
      { error: "Please provide a travel dispute description, issueType, or caseId." },
      { status: 400 }
    );
  }

  const result = await buildAnalysisResult(
    description,
    policies as Policy[],
    cases as Case[],
    scripts as Script[],
    { caseId: caseId || undefined, issueType }
  );

  return NextResponse.json(result);
}
