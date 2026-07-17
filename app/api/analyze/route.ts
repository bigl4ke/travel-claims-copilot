import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildAnalysisResult } from "../../../lib/analyze";
import { normalizeIssueType } from "../../../lib/issueTaxonomy";
import type { Case, Policy, Script } from "../../../lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    caseId?: unknown;
    description?: unknown;
    issueType?: unknown;
    selectedIssueType?: unknown;
  } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const caseId = typeof body?.caseId === "string" ? body.caseId.trim() : "";
  const issueType = normalizeIssueType(body?.issueType ?? body?.selectedIssueType);

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
