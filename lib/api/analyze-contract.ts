import {
  RAW_FACT_PATHS,
  type ClaimState,
  type ExtractionMode,
  type FactConflict,
  type FactProvenance,
  type FactSource,
  type RawFactPath,
  type RawFactValue,
  type UserFactEdit
} from "../domain/claim-contract";
import { parseRawClaimFacts, parseRawFactPatch } from "../domain/raw-fact-schema";

export type AnalyzeClaimRequest = {
  message: string;
  prior: ClaimState;
  correction?: UserFactEdit;
  baseRevision: number;
  requestedMode?: ExtractionMode;
  privacyAcknowledged?: boolean;
};

export type AnalyzeClaimIntakeResponse = {
  baseRevision: number;
  claimState: ClaimState;
  status: "needs_information" | "ready";
};

export type AnalyzeClaimRequestParseResult =
  | { success: true; data: AnalyzeClaimRequest }
  | { success: false; errors: string[] };

const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);
const factSources: readonly FactSource[] = [
  "user_correction",
  "user_message",
  "deterministic_extraction",
  "openai_extraction"
];
const conflictSources = ["deterministic_extraction", "openai_extraction"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
) {
  const allowedSet = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!allowedSet.has(key)) errors.push(`${path}.${key} is not allowed`);
  });
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseProvenance(
  value: unknown,
  stateRevision: number,
  errors: string[]
): Partial<Record<RawFactPath, FactProvenance>> {
  if (!isRecord(value)) {
    errors.push("prior.provenance must be an object");
    return {};
  }
  const provenance: Partial<Record<RawFactPath, FactProvenance>> = {};
  Object.entries(value).forEach(([candidatePath, candidate]) => {
    if (!rawFactPathSet.has(candidatePath)) {
      errors.push(`prior.provenance.${candidatePath} is not an allowed raw fact path`);
    } else if (!isRecord(candidate)) {
      errors.push(`prior.provenance.${candidatePath} must be an object`);
    } else {
      hasOnlyKeys(
        candidate,
        ["source", "factsRevision"],
        `prior.provenance.${candidatePath}`,
        errors
      );
      if (!factSources.includes(candidate.source as FactSource)) {
        errors.push(`prior.provenance.${candidatePath}.source is invalid`);
      } else if (
        !isNonNegativeInteger(candidate.factsRevision) ||
        candidate.factsRevision > stateRevision
      ) {
        errors.push(`prior.provenance.${candidatePath}.factsRevision is invalid`);
      } else {
        provenance[candidatePath as RawFactPath] = {
          source: candidate.source as FactSource,
          factsRevision: candidate.factsRevision
        };
      }
    }
  });
  return provenance;
}

function parseConflictCandidate(
  candidate: unknown,
  field: RawFactPath,
  path: string,
  errors: string[]
): FactConflict["candidates"][number] | undefined {
  if (!isRecord(candidate)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  hasOnlyKeys(candidate, ["value", "source"], path, errors);
  if (!conflictSources.includes(candidate.source as (typeof conflictSources)[number])) {
    errors.push(`${path}.source is invalid`);
    return undefined;
  }
  const parsedValue = parseRawFactPatch({ set: { [field]: candidate.value } });
  if (!parsedValue.success || parsedValue.data.set[field] === null) {
    errors.push(`${path}.value is invalid for ${field}`);
    return undefined;
  }
  const value = parsedValue.data.set[field] as RawFactValue;
  return {
    value: Array.isArray(value) ? [...value] : value,
    source: candidate.source as (typeof conflictSources)[number]
  };
}

function rawFactValuesEqual(left: RawFactValue, right: RawFactValue): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((item, index) => item === right[index])
    : left === right;
}

function parseConflicts(value: unknown, errors: string[]): FactConflict[] {
  if (!Array.isArray(value)) {
    errors.push("prior.conflicts must be an array");
    return [];
  }
  const conflicts: FactConflict[] = [];
  value.forEach((candidate, index) => {
    const path = `prior.conflicts.${index}`;
    if (!isRecord(candidate)) {
      errors.push(`${path} must be an object`);
    } else {
      hasOnlyKeys(candidate, ["field", "candidates"], path, errors);
      if (typeof candidate.field !== "string" || !rawFactPathSet.has(candidate.field)) {
        errors.push(`${path}.field is not an allowed raw fact path`);
      } else if (!Array.isArray(candidate.candidates) || candidate.candidates.length !== 2) {
        errors.push(`${path}.candidates must contain exactly two candidates`);
      } else {
        const field = candidate.field as RawFactPath;
        const parsedCandidates = candidate.candidates
          .map((item, candidateIndex) =>
            parseConflictCandidate(item, field, `${path}.candidates.${candidateIndex}`, errors)
          )
          .filter((item): item is FactConflict["candidates"][number] => item !== undefined);
        const candidateSources = new Set(parsedCandidates.map(({ source }) => source));
        const hasBothSources = conflictSources.every((source) => candidateSources.has(source));
        if (parsedCandidates.length === 2 && !hasBothSources) {
          errors.push(`${path}.candidates must contain one candidate from each extractor`);
        } else if (
          parsedCandidates.length === 2 &&
          rawFactValuesEqual(parsedCandidates[0].value, parsedCandidates[1].value)
        ) {
          errors.push(`${path}.candidates must contain different values`);
        } else if (parsedCandidates.length === candidate.candidates.length) {
          conflicts.push({ field, candidates: parsedCandidates });
        }
      }
    }
  });
  const seenFields = new Set<RawFactPath>();
  conflicts.forEach(({ field }) => {
    if (seenFields.has(field)) {
      errors.push(`prior.conflicts contains duplicate field ${field}`);
    }
    seenFields.add(field);
  });
  return conflicts;
}

function parseUnresolvedFields(value: unknown, errors: string[]): RawFactPath[] {
  if (!Array.isArray(value)) {
    errors.push("prior.unresolvedFields must be an array");
    return [];
  }
  const unresolvedFields: RawFactPath[] = [];
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    if (typeof candidate !== "string" || !rawFactPathSet.has(candidate)) {
      errors.push(`prior.unresolvedFields.${index} is not an allowed raw fact path`);
    } else if (seen.has(candidate)) {
      errors.push(`prior.unresolvedFields.${index} is duplicated`);
    } else {
      seen.add(candidate);
      unresolvedFields.push(candidate as RawFactPath);
    }
  });
  return RAW_FACT_PATHS.filter((path) => unresolvedFields.includes(path));
}

function parseClaimState(value: unknown, errors: string[]): ClaimState | undefined {
  if (!isRecord(value)) {
    errors.push("prior must be an object");
    return undefined;
  }
  hasOnlyKeys(
    value,
    ["facts", "provenance", "revision", "conflicts", "unresolvedFields"],
    "prior",
    errors
  );
  const facts = parseRawClaimFacts(value.facts);
  if (!facts.success) errors.push(...facts.errors.map((error) => `prior.${error}`));
  if (!isNonNegativeInteger(value.revision)) {
    errors.push("prior.revision must be a non-negative integer");
  }
  const revision = isNonNegativeInteger(value.revision) ? value.revision : 0;
  const provenance = parseProvenance(value.provenance, revision, errors);
  const conflicts = parseConflicts(value.conflicts, errors);
  const unresolvedFields = parseUnresolvedFields(value.unresolvedFields, errors);
  conflicts.forEach(({ field }) => {
    if (!unresolvedFields.includes(field)) {
      errors.push(`prior conflict field ${field} must be unresolved`);
    }
  });
  if (!facts.success || !isNonNegativeInteger(value.revision)) return undefined;
  return { facts: facts.data, provenance, revision, conflicts, unresolvedFields };
}

function parseCorrection(value: unknown, errors: string[]): UserFactEdit | undefined {
  if (!isRecord(value)) {
    errors.push("correction must be an object");
    return undefined;
  }
  hasOnlyKeys(value, ["set", "clear"], "correction", errors);
  const parsedSet = parseRawFactPatch({ set: value.set });
  if (!parsedSet.success) {
    errors.push(...parsedSet.errors.map((error) => `correction.${error}`));
  }
  if (!Array.isArray(value.clear)) {
    errors.push("correction.clear must be an array");
  }
  const clear: RawFactPath[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value.clear)) {
    value.clear.forEach((candidate, index) => {
      if (typeof candidate !== "string" || !rawFactPathSet.has(candidate)) {
        errors.push(`correction.clear.${index} is not an allowed raw fact path`);
      } else if (seen.has(candidate)) {
        errors.push(`correction.clear.${index} is duplicated`);
      } else {
        seen.add(candidate);
        clear.push(candidate as RawFactPath);
      }
    });
  }
  if (!parsedSet.success) return undefined;
  if (Object.values(parsedSet.data.set).some((candidate) => candidate === null)) {
    errors.push("correction.set cannot contain null; use correction.clear");
  }
  clear.forEach((path) => {
    if (Object.prototype.hasOwnProperty.call(parsedSet.data.set, path)) {
      errors.push(`correction path ${path} cannot be set and cleared together`);
    }
  });
  if (Object.keys(parsedSet.data.set).length === 0 && clear.length === 0) {
    errors.push("correction must contain at least one set or clear operation");
  }
  return {
    set: parsedSet.data.set as UserFactEdit["set"],
    clear
  };
}

export function parseAnalyzeClaimRequest(value: unknown): AnalyzeClaimRequestParseResult {
  if (!isRecord(value)) {
    return { success: false, errors: ["request must be an object"] };
  }
  const errors: string[] = [];
  hasOnlyKeys(
    value,
    ["message", "prior", "correction", "baseRevision", "requestedMode", "privacyAcknowledged"],
    "request",
    errors
  );
  if (typeof value.message !== "string") errors.push("message must be a string");
  if (!isNonNegativeInteger(value.baseRevision)) {
    errors.push("baseRevision must be a non-negative integer");
  }
  const prior = parseClaimState(value.prior, errors);
  const correction = Object.prototype.hasOwnProperty.call(value, "correction")
    ? parseCorrection(value.correction, errors)
    : undefined;
  if (
    value.requestedMode !== undefined &&
    value.requestedMode !== "local" &&
    value.requestedMode !== "gpt"
  ) {
    errors.push("requestedMode must be local or gpt");
  }
  if (value.privacyAcknowledged !== undefined && typeof value.privacyAcknowledged !== "boolean") {
    errors.push("privacyAcknowledged must be a boolean");
  }

  if (typeof value.message === "string") {
    if (correction) {
      if (value.message !== "") errors.push("correction intent requires exactly an empty message");
    } else if (value.message.trim().length === 0) {
      errors.push("message intent requires a nonblank message");
    }
  }
  if (prior && isNonNegativeInteger(value.baseRevision) && prior.revision !== value.baseRevision) {
    errors.push("stale_base_revision");
  }
  if (
    errors.length > 0 ||
    !prior ||
    typeof value.message !== "string" ||
    !isNonNegativeInteger(value.baseRevision)
  ) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      message: correction ? "" : value.message,
      prior,
      ...(correction ? { correction } : {}),
      baseRevision: value.baseRevision,
      ...(value.requestedMode ? { requestedMode: value.requestedMode as ExtractionMode } : {}),
      ...(typeof value.privacyAcknowledged === "boolean"
        ? { privacyAcknowledged: value.privacyAcknowledged }
        : {})
    }
  };
}
