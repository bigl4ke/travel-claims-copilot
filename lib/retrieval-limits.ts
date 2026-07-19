import type { RetrievalLimits } from "./types";

const DEFAULT_RETRIEVAL_LIMITS: Required<RetrievalLimits> = {
  policyLimit: 3,
  caseLimit: 3,
  scriptLimit: 2
};

function validLimit(value: number | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative integer.`);
  }
  return value;
}

export function resolveRetrievalLimits(limits: RetrievalLimits = {}): Required<RetrievalLimits> {
  return {
    policyLimit: validLimit(
      limits.policyLimit,
      "policyLimit",
      DEFAULT_RETRIEVAL_LIMITS.policyLimit
    ),
    caseLimit: validLimit(limits.caseLimit, "caseLimit", DEFAULT_RETRIEVAL_LIMITS.caseLimit),
    scriptLimit: validLimit(limits.scriptLimit, "scriptLimit", DEFAULT_RETRIEVAL_LIMITS.scriptLimit)
  };
}
