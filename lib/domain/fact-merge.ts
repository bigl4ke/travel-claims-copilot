import {
  RAW_FACT_PATHS,
  type FactConflict,
  type FactSource,
  type MergeRawFactsInput,
  type MergeRawFactsResult,
  type RawClaimFacts,
  type RawFactPatch,
  type RawFactPath,
  type RawFactValue,
  type UserFactEdit
} from "./claim-contract";
import { parseRawFactPatch } from "./raw-fact-schema";

const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);

function normalizePatch(patch: RawFactPatch): RawFactPatch {
  const parsed = parseRawFactPatch(patch);
  if (parsed.success) return parsed.data;
  if (parsed.errors.some((error) => error.includes("not an allowed raw fact path"))) {
    throw new Error("invalid_raw_fact_path");
  }
  throw new Error("invalid_raw_fact_patch");
}

function normalizeCorrection(correction: UserFactEdit | undefined): UserFactEdit | undefined {
  if (!correction) return undefined;
  if (
    typeof correction !== "object" ||
    correction === null ||
    Array.isArray(correction) ||
    typeof correction.set !== "object" ||
    correction.set === null ||
    Array.isArray(correction.set) ||
    !Array.isArray(correction.clear)
  ) {
    throw new Error("invalid_user_fact_edit");
  }
  const correctionKeys = Object.keys(correction as unknown as Record<string, unknown>);
  if (correctionKeys.some((key) => key !== "set" && key !== "clear")) {
    throw new Error("invalid_user_fact_edit");
  }

  const parsedSet = parseRawFactPatch({ set: correction.set });
  if (!parsedSet.success) {
    if (parsedSet.errors.some((error) => error.includes("not an allowed raw fact path"))) {
      throw new Error("invalid_raw_fact_path");
    }
    throw new Error("invalid_user_fact_edit");
  }
  if (Object.values(parsedSet.data.set).some((value) => value === null)) {
    throw new Error("user_correction_null_requires_clear");
  }

  const clear: RawFactPath[] = [];
  const seen = new Set<string>();
  (correction.clear as unknown[]).forEach((candidate) => {
    if (typeof candidate !== "string" || !rawFactPathSet.has(candidate)) {
      throw new Error("invalid_raw_fact_path");
    }
    if (seen.has(candidate)) throw new Error("duplicate_clear_path");
    if (Object.prototype.hasOwnProperty.call(parsedSet.data.set, candidate)) {
      throw new Error("set_clear_overlap");
    }
    seen.add(candidate);
    clear.push(candidate as RawFactPath);
  });

  return {
    set: parsedSet.data.set as UserFactEdit["set"],
    clear
  };
}

function patchEntries(patch: RawFactPatch): Array<[RawFactPath, RawFactValue | null]> {
  return Object.entries(patch.set).map(([candidatePath, value]) => {
    if (!rawFactPathSet.has(candidatePath)) throw new Error("invalid_raw_fact_path");
    return [candidatePath as RawFactPath, value ?? null];
  });
}

function readPatchValue(patch: RawFactPatch | undefined, path: RawFactPath): RawFactValue | null {
  if (!patch || !Object.prototype.hasOwnProperty.call(patch.set, path)) return null;
  return patch.set[path] ?? null;
}

function allPatchPaths(...patches: Array<RawFactPatch | undefined>): RawFactPath[] {
  return RAW_FACT_PATHS.filter((path) =>
    patches.some((patch) => patch && Object.prototype.hasOwnProperty.call(patch.set, path))
  );
}

function clearedValue(path: RawFactPath): RawFactValue | null {
  return path === "expenses" || path === "evidence" ? [] : null;
}

function isEqual(left: RawFactValue, right: RawFactValue): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

function cloneValue(value: RawFactValue | null): RawFactValue | null {
  return Array.isArray(value) ? [...value] : value;
}

function writeFactPath(
  facts: RawClaimFacts,
  path: RawFactPath,
  value: RawFactValue | null
): RawClaimFacts {
  if (!rawFactPathSet.has(path)) throw new Error("invalid_raw_fact_path");
  const [parent, leaf, extra] = path.split(".");
  if (extra) throw new Error("invalid_raw_fact_depth");
  const clonedValue = cloneValue(value);
  if (!leaf) return { ...facts, [parent]: clonedValue } as RawClaimFacts;
  if (parent !== "origin" && parent !== "destination" && parent !== "assistance") {
    throw new Error("invalid_raw_fact_parent");
  }
  return {
    ...facts,
    [parent]: { ...facts[parent], [leaf]: clonedValue }
  } as RawClaimFacts;
}

function cloneConflicts(conflicts: FactConflict[]): FactConflict[] {
  return conflicts.map((conflict) => ({
    ...conflict,
    candidates: conflict.candidates.map((candidate) => ({
      ...candidate,
      value: cloneValue(candidate.value) as RawFactValue
    }))
  }));
}

export function mergeRawFacts(input: MergeRawFactsInput): MergeRawFactsResult {
  if (input.prior.revision !== input.baseRevision) {
    throw new Error("stale_base_revision");
  }

  const correction = normalizeCorrection(input.correction);
  const deterministicPatch = normalizePatch(input.deterministicPatch);
  const openaiPatch = input.openaiPatch ? normalizePatch(input.openaiPatch) : undefined;
  let facts = structuredClone(input.prior.facts);
  const provenance = Object.fromEntries(
    Object.entries(input.prior.provenance).map(([path, value]) => [
      path,
      value ? { ...value } : value
    ])
  );
  let conflicts = cloneConflicts(input.prior.conflicts);
  const unresolved = new Set(input.prior.unresolvedFields);
  const changed = new Set<RawFactPath>();

  const resolveConflict = (path: RawFactPath) => {
    conflicts = conflicts.filter(({ field }) => field !== path);
    unresolved.delete(path);
  };

  const applyCandidate = (path: RawFactPath, value: RawFactValue, source: FactSource) => {
    facts = writeFactPath(facts, path, value);
    provenance[path] = { source, factsRevision: input.baseRevision + 1 };
    resolveConflict(path);
    changed.add(path);
  };

  (correction?.clear ?? []).forEach((path) => {
    facts = writeFactPath(facts, path, clearedValue(path));
    provenance[path] = {
      source: "user_correction",
      factsRevision: input.baseRevision + 1
    };
    resolveConflict(path);
    changed.add(path);
  });
  patchEntries({ set: correction?.set ?? {} }).forEach(([path, value]) => {
    if (value === null) throw new Error("user_correction_null_requires_clear");
    applyCandidate(path, value, "user_correction");
  });

  allPatchPaths(deterministicPatch, openaiPatch).forEach((path) => {
    if (changed.has(path)) return;
    const deterministic = readPatchValue(deterministicPatch, path);
    const openai = readPatchValue(openaiPatch, path);
    if (deterministic !== null && openai !== null && !isEqual(deterministic, openai)) {
      conflicts = conflicts.filter(({ field }) => field !== path);
      conflicts.push({
        field: path,
        candidates: [
          { value: cloneValue(deterministic) as RawFactValue, source: "deterministic_extraction" },
          { value: cloneValue(openai) as RawFactValue, source: "openai_extraction" }
        ]
      });
      unresolved.add(path);
      changed.add(path);
      return;
    }
    const value = openai ?? deterministic;
    if (value !== null) {
      applyCandidate(
        path,
        value,
        openai !== null ? "openai_extraction" : "deterministic_extraction"
      );
    }
  });

  const changedFields = RAW_FACT_PATHS.filter((path) => changed.has(path));
  const unresolvedFields = RAW_FACT_PATHS.filter((path) => unresolved.has(path));
  const revision = changedFields.length > 0 ? input.baseRevision + 1 : input.baseRevision;
  const state = {
    facts,
    provenance,
    revision,
    conflicts,
    unresolvedFields
  };

  return {
    state,
    baseRevision: input.baseRevision,
    changedFields,
    conflicts: cloneConflicts(conflicts),
    unresolvedFields: [...unresolvedFields]
  };
}
