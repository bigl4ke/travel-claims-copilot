import type { AnalyzeClaimRequest, AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import { claimState, type DeepPartial } from "./raw-claims";
import { sourceTransparencyFixture } from "./analysis-view-model";

function mergeDeep<T>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (overrides === undefined) return structuredClone(base);
  if (Array.isArray(base) || Array.isArray(overrides)) {
    return structuredClone(overrides) as T;
  }
  if (
    typeof base !== "object" ||
    base === null ||
    typeof overrides !== "object" ||
    overrides === null
  ) {
    return structuredClone(overrides) as T;
  }
  const output = structuredClone(base) as Record<string, unknown>;
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) return;
    output[key] = mergeDeep(output[key], value);
  });
  return output as T;
}

export function analyzeResponseFixture(
  overrides: DeepPartial<AnalyzeClaimResponse> = {}
): AnalyzeClaimResponse {
  const base = sourceTransparencyFixture() satisfies AnalyzeClaimResponse;
  return mergeDeep<AnalyzeClaimResponse>(base, overrides);
}

export function okAnalyzeResponse(overrides: DeepPartial<AnalyzeClaimResponse> = {}): Response {
  return Response.json(analyzeResponseFixture(overrides));
}

export function localRequest(overrides: Partial<AnalyzeClaimRequest> = {}): AnalyzeClaimRequest {
  const prior = claimState();
  return {
    message: "A bounded synthetic travel claim.",
    prior,
    baseRevision: prior.revision,
    requestedMode: "local",
    ...structuredClone(overrides)
  } satisfies AnalyzeClaimRequest;
}

export type { DeepPartial } from "./raw-claims";
