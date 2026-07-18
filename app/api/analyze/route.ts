import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { buildAnalysisFromFacts, buildAnalysisResult } from "../../../lib/analyze";
import { getMissingClaimFields, parseClaimFacts } from "../../../lib/claimFacts";
import { normalizeIncidentInput } from "../../../lib/domain/incident-taxonomy";
import type { ScenarioId, WorkflowStatus } from "../../../lib/domain/claim-contract";
import { isMvpIssueType, normalizeIssueType } from "../../../lib/issueTaxonomy";
import type { Case, Policy, Script } from "../../../lib/types";

type LegacySafeScopeResponse = {
  status: Extract<WorkflowStatus, "needs_information" | "out_of_scope">;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  missingFacts: string[];
  assessments: unknown[];
  cautions: string[];
  nextActions: string[];
};

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
  const incidentInput = body?.issueType ?? body?.selectedIssueType;
  const incidentNormalization = normalizeIncidentInput(incidentInput);
  const issueType = incidentNormalization?.incident ?? normalizeIssueType(incidentInput);

  if (incidentNormalization?.needsSubtype) {
    const response: LegacySafeScopeResponse = {
      status: "needs_information",
      primaryScenario: null,
      scenarioIds: [],
      missingFacts: ["incidentType"],
      assessments: [],
      cautions: ["Specify whether the EU/UK airline disruption was a delay or cancellation."],
      nextActions: []
    };

    return Response.json(response);
  }

  if (issueType && issueType !== "unknown" && !isMvpIssueType(issueType)) {
    const response: LegacySafeScopeResponse = {
      status: "out_of_scope",
      primaryScenario: null,
      scenarioIds: [],
      missingFacts: [],
      assessments: [],
      cautions: ["This competition build supports four frozen travel-disruption journeys."],
      nextActions: []
    };

    return Response.json(response);
  }

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
