import { RAW_FACT_PATHS, type RawFactPath, type ScenarioId } from "./domain/claim-contract";

export type FeedbackDraft =
  | { kind: "helpful" }
  | { kind: "fact_error"; factPaths: RawFactPath[] }
  | { kind: "source_mismatch"; sourceIds: string[] };

export type FeedbackKind = FeedbackDraft["kind"];

export type FeedbackRecordData = {
  schemaVersion: 1;
  feedbackId: string;
  createdAt: string;
  factsRevision: number;
  scenarioIds: ScenarioId[];
  feedback: FeedbackDraft;
};

const VALIDATED_FEEDBACK_RECORD: unique symbol = Symbol("validated-feedback-record");

export type FeedbackRecord = Readonly<FeedbackRecordData> & {
  readonly [VALIDATED_FEEDBACK_RECORD]: true;
};

export type FeedbackRecordInput = Omit<FeedbackRecordData, "schemaVersion" | "feedback"> & {
  draft: FeedbackDraft;
};

export type FeedbackValidationContext = {
  allowedFactPaths: ReadonlySet<RawFactPath>;
  allowedSourceIds: ReadonlySet<string>;
};

const scenarioIds: readonly ScenarioId[] = [
  "marriott_hotel_walk",
  "us_airline_disruption",
  "us_denied_boarding",
  "eu_uk_air_disruption"
];
const scenarioIdSet: ReadonlySet<string> = new Set(scenarioIds);
const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const MAX_SELECTIONS = 20;
const MAX_ID_CODE_POINTS = 128;

function invalidRecord(): never {
  throw new Error("invalid_feedback_record");
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function assertSafeId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    [...value].length === 0 ||
    [...value].length > MAX_ID_CODE_POINTS ||
    !SAFE_ID_PATTERN.test(value)
  ) {
    invalidRecord();
  }
}

function assertCreatedAt(value: unknown): asserts value is string {
  if (typeof value !== "string") invalidRecord();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) invalidRecord();
}

function assertFactsRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalidRecord();
}

function copyScenarioIds(value: unknown): ScenarioId[] {
  if (
    !Array.isArray(value) ||
    value.length > scenarioIds.length ||
    new Set(value).size !== value.length
  ) {
    invalidRecord();
  }
  value.forEach((scenarioId) => {
    assertSafeId(scenarioId);
    if (!scenarioIdSet.has(scenarioId)) invalidRecord();
  });
  return [...value] as ScenarioId[];
}

function copySelections(
  value: unknown,
  allowed: ReadonlySet<string>,
  globallyAllowed?: ReadonlySet<string>
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_SELECTIONS ||
    new Set(value).size !== value.length
  ) {
    invalidRecord();
  }
  value.forEach((selection) => {
    assertSafeId(selection);
    if (!allowed.has(selection) || (globallyAllowed && !globallyAllowed.has(selection))) {
      invalidRecord();
    }
  });
  return [...value];
}

function copyDraft(value: unknown, context: FeedbackValidationContext): FeedbackDraft {
  if (!isRecord(value) || typeof value.kind !== "string") invalidRecord();
  if (value.kind === "helpful") {
    if (!hasExactKeys(value, ["kind"])) invalidRecord();
    return { kind: "helpful" };
  }
  if (value.kind === "fact_error") {
    if (!hasExactKeys(value, ["kind", "factPaths"])) invalidRecord();
    return {
      kind: "fact_error",
      factPaths: copySelections(
        value.factPaths,
        context.allowedFactPaths,
        rawFactPathSet
      ) as RawFactPath[]
    };
  }
  if (value.kind === "source_mismatch") {
    if (!hasExactKeys(value, ["kind", "sourceIds"])) invalidRecord();
    return {
      kind: "source_mismatch",
      sourceIds: copySelections(value.sourceIds, context.allowedSourceIds)
    };
  }
  return invalidRecord();
}

function freezeDraft(draft: FeedbackDraft): FeedbackDraft {
  if (draft.kind === "fact_error") Object.freeze(draft.factPaths);
  if (draft.kind === "source_mismatch") Object.freeze(draft.sourceIds);
  return Object.freeze(draft);
}

export function createFeedbackRecord(
  input: FeedbackRecordInput,
  context: FeedbackValidationContext
): FeedbackRecord {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["draft", "factsRevision", "scenarioIds", "feedbackId", "createdAt"])
  ) {
    invalidRecord();
  }
  assertSafeId(input.feedbackId);
  assertCreatedAt(input.createdAt);
  assertFactsRevision(input.factsRevision);
  const record = {
    schemaVersion: 1,
    feedbackId: input.feedbackId,
    createdAt: input.createdAt,
    factsRevision: input.factsRevision,
    scenarioIds: Object.freeze(copyScenarioIds(input.scenarioIds)),
    feedback: freezeDraft(copyDraft(input.draft, context))
  } as FeedbackRecordData;
  Object.defineProperty(record, VALIDATED_FEEDBACK_RECORD, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return Object.freeze(record) as FeedbackRecord;
}

function hasValidBrand(value: object): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, VALIDATED_FEEDBACK_RECORD);
  return Boolean(
    descriptor &&
      descriptor.value === true &&
      descriptor.enumerable === false &&
      descriptor.writable === false &&
      descriptor.configurable === false
  );
}

function assertSerializableRecord(value: unknown): asserts value is FeedbackRecord {
  if (!isRecord(value) || !hasValidBrand(value)) throw new Error("unvalidated_feedback_record");
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "feedbackId",
      "createdAt",
      "factsRevision",
      "scenarioIds",
      "feedback"
    ]) ||
    value.schemaVersion !== 1 ||
    !Object.isFrozen(value) ||
    !Array.isArray(value.scenarioIds) ||
    !Object.isFrozen(value.scenarioIds) ||
    !Object.isFrozen(value.feedback)
  ) {
    invalidRecord();
  }
  assertSafeId(value.feedbackId);
  assertCreatedAt(value.createdAt);
  assertFactsRevision(value.factsRevision);
  const checkedScenarios = copyScenarioIds(value.scenarioIds);
  const { feedback } = value;
  if (!isRecord(feedback) || typeof feedback.kind !== "string") invalidRecord();
  const context: FeedbackValidationContext = {
    allowedFactPaths: new Set(RAW_FACT_PATHS),
    allowedSourceIds:
      feedback.kind === "source_mismatch" && Array.isArray(feedback.sourceIds)
        ? new Set(feedback.sourceIds.filter((item): item is string => typeof item === "string"))
        : new Set()
  };
  const checkedFeedback = copyDraft(feedback, context);
  if (
    checkedScenarios.length !== value.scenarioIds.length ||
    checkedFeedback.kind !== feedback.kind ||
    (feedback.kind === "fact_error" && !Object.isFrozen(feedback.factPaths)) ||
    (feedback.kind === "source_mismatch" && !Object.isFrozen(feedback.sourceIds))
  ) {
    invalidRecord();
  }
}

export function serializeFeedback(records: readonly FeedbackRecord[]): string {
  if (!Array.isArray(records)) invalidRecord();
  records.forEach(assertSerializableRecord);
  return `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`;
}

export function downloadFeedback(records: readonly FeedbackRecord[], documentRef: Document): void {
  const json = serializeFeedback(records);
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "travel-claims-feedback.json";
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    queueMicrotask(() => URL.revokeObjectURL(objectUrl));
  }
}
