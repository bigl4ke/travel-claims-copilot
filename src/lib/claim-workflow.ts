import type { AnalysisViewModel } from "../../lib/analysis-view-model";
import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import {
  CANONICAL_INCIDENTS,
  RAW_FACT_PATHS,
  type ClaimState,
  type ExtractionMode,
  type RawFactPath,
  type RawFactValue,
  type UserFactEdit,
  type WorkflowStatus
} from "../../lib/domain/claim-contract";
import { emptyRawClaimFacts, parseRawFactPatch } from "../../lib/domain/raw-fact-schema";
import type { AnalysisApiError } from "./analysis-api-client";

export type ClaimPhase =
  | "idle"
  | "submitting"
  | "needs_information"
  | "reviewing_facts"
  | "ready"
  | "revising"
  | "blocked"
  | "error";

export type ActiveRequest = {
  token: number;
  baseRevision: number;
  kind: "message" | "correction";
};

export type ClaimWorkflowState = {
  phase: ClaimPhase;
  claimState: ClaimState;
  result: AnalysisViewModel | null;
  activeRequest: ActiveRequest | null;
  error: AnalysisApiError | null;
};

export type ClaimWorkflowAction =
  | {
      type: "request_started";
      token: number;
      baseRevision: number;
      kind: ActiveRequest["kind"];
    }
  | { type: "response_received"; token: number; response: AnalyzeClaimResponse }
  | { type: "failed"; token: number; error: AnalysisApiError }
  | { type: "request_cancelled"; token: number }
  | { type: "review_started" }
  | { type: "review_cancelled" }
  | { type: "reset" };

export type FactFieldDefinition = {
  path: RawFactPath;
  label: string;
  input:
    | { kind: "text" }
    | { kind: "number"; min: 0 }
    | { kind: "boolean" }
    | { kind: "string_list"; maxItems: 20 }
    | { kind: "enum"; options: readonly string[] };
  section: "trip" | "disruption" | "boarding" | "hotel" | "assistance" | "evidence";
};

export type FactFormValue = string | number | boolean | string[];

const rawFactPathSet: ReadonlySet<string> = new Set(RAW_FACT_PATHS);
const integerPaths: ReadonlySet<RawFactPath> = new Set([
  "finalArrivalDelayMinutes",
  "cancellationNoticeHours",
  "replacementArrivalDelayMinutes"
]);
const listPaths: ReadonlySet<RawFactPath> = new Set(["expenses", "evidence"]);
const booleanPaths: ReadonlySet<RawFactPath> = new Set([
  "userInitiatedChange",
  "isOvernight",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant",
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided"
]);
const enumOptions: Partial<Record<RawFactPath, readonly string[]>> = {
  incidentType: CANONICAL_INCIDENTS,
  providerType: ["hotel", "airline"],
  reasonCategory: [
    "crew",
    "mechanical",
    "oversales",
    "weather",
    "late_inbound_aircraft",
    "other_controllable",
    "other_uncontrollable"
  ],
  deniedBoardingKind: ["voluntary", "involuntary"],
  bookingChannel: ["direct", "ota", "portal"]
};

function labelForPath(path: RawFactPath): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function sectionForPath(path: RawFactPath): FactFieldDefinition["section"] {
  if (path.startsWith("assistance.")) return "assistance";
  if (
    path === "deniedBoardingKind" ||
    path === "oversalesConfirmed" ||
    path === "confirmedReservation" ||
    path === "checkedInOnTime" ||
    path === "atGateOnTime" ||
    path === "documentsCompliant" ||
    path === "replacementArrivalDelayMinutes"
  ) {
    return "boarding";
  }
  if (
    path === "brandOrProperty" ||
    path === "confirmedHotelReservation" ||
    path === "qualifyingHotelReservation" ||
    path === "membershipAttached" ||
    path === "wasWalked" ||
    path === "replacementLodgingProvided"
  ) {
    return "hotel";
  }
  if (path === "expenses" || path === "evidence" || path === "userGoal") return "evidence";
  if (
    path === "incidentType" ||
    path === "statedReason" ||
    path === "reasonCategory" ||
    path === "userInitiatedChange" ||
    path === "finalArrivalDelayMinutes" ||
    path === "isOvernight" ||
    path === "cancellationNoticeHours"
  ) {
    return "disruption";
  }
  return "trip";
}

function inputForPath(path: RawFactPath): FactFieldDefinition["input"] {
  const options = enumOptions[path];
  if (options) return { kind: "enum", options };
  if (integerPaths.has(path)) return { kind: "number", min: 0 };
  if (booleanPaths.has(path)) return { kind: "boolean" };
  if (listPaths.has(path)) return { kind: "string_list", maxItems: 20 };
  return { kind: "text" };
}

export const FACT_FIELD_DEFINITIONS: FactFieldDefinition[] = RAW_FACT_PATHS.map((path) => ({
  path,
  label: labelForPath(path),
  input: inputForPath(path),
  section: sectionForPath(path)
}));

export function createInitialClaimWorkflowState(claimState?: ClaimState): ClaimWorkflowState {
  return {
    phase: "idle",
    claimState: claimState
      ? structuredClone(claimState)
      : {
          facts: emptyRawClaimFacts(),
          provenance: {},
          revision: 0,
          conflicts: [],
          unresolvedFields: []
        },
    result: null,
    activeRequest: null,
    error: null
  };
}

export function phaseFromStatus(status: WorkflowStatus): ClaimPhase {
  if (status === "ready") return "ready";
  if (status === "needs_information") return "needs_information";
  return "blocked";
}

export function isLegalResponseRevision(active: ActiveRequest, responseRevision: number): boolean {
  if (!Number.isSafeInteger(responseRevision) || responseRevision < 0) return false;
  return active.kind === "correction"
    ? responseRevision === active.baseRevision + 1
    : responseRevision === active.baseRevision || responseRevision === active.baseRevision + 1;
}

export function claimWorkflowReducer(
  state: ClaimWorkflowState,
  action: ClaimWorkflowAction
): ClaimWorkflowState {
  if (action.type === "response_received") {
    const active = state.activeRequest;
    if (
      active === null ||
      action.token !== active.token ||
      action.response.baseRevision !== active.baseRevision ||
      state.claimState.revision !== active.baseRevision ||
      action.response.claimState.revision !== action.response.result.factsRevision ||
      !isLegalResponseRevision(active, action.response.claimState.revision)
    ) {
      return state;
    }
    return {
      ...state,
      phase: phaseFromStatus(action.response.result.status),
      claimState: structuredClone(action.response.claimState),
      result: structuredClone(action.response.result),
      activeRequest: null,
      error: null
    };
  }
  if (action.type === "request_started") {
    if (action.baseRevision !== state.claimState.revision) return state;
    return {
      ...state,
      phase: state.result ? "revising" : "submitting",
      activeRequest: {
        token: action.token,
        baseRevision: action.baseRevision,
        kind: action.kind
      },
      error: null
    };
  }
  if (action.type === "reset") return createInitialClaimWorkflowState();
  if (action.type === "review_started" && state.result) {
    return { ...state, phase: "reviewing_facts" };
  }
  if (action.type === "review_cancelled" && state.result) {
    return { ...state, phase: phaseFromStatus(state.result.status) };
  }
  if (action.type === "request_cancelled" && action.token === state.activeRequest?.token) {
    return {
      ...state,
      phase: state.result ? phaseFromStatus(state.result.status) : "idle",
      activeRequest: null
    };
  }
  if (action.type === "failed" && action.token === state.activeRequest?.token) {
    return { ...state, phase: "error", activeRequest: null, error: action.error };
  }
  return state;
}

function normalizedValue(
  definition: FactFieldDefinition,
  value: FactFormValue
): RawFactValue | undefined {
  if (definition.input.kind === "text") {
    if (typeof value !== "string") throw new Error("invalid_fact_edit");
    return value.trim() || undefined;
  }
  if (definition.input.kind === "number") {
    if (typeof value !== "number" && typeof value !== "string") {
      throw new Error("invalid_fact_edit");
    }
    if (typeof value === "string" && !value.trim()) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < definition.input.min) {
      throw new Error("invalid_fact_edit");
    }
    return parsed;
  }
  if (definition.input.kind === "boolean") {
    if (typeof value === "string" && !value.trim()) return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    if (typeof value !== "boolean") throw new Error("invalid_fact_edit");
    return value;
  }
  if (definition.input.kind === "enum") {
    if (typeof value !== "string") throw new Error("invalid_fact_edit");
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!definition.input.options.includes(trimmed)) throw new Error("invalid_fact_edit");
    return trimmed;
  }
  let candidates: string[] | null = null;
  if (Array.isArray(value)) candidates = value;
  if (typeof value === "string") candidates = value.split("\n");
  if (!candidates || candidates.some((item) => typeof item !== "string")) {
    throw new Error("invalid_fact_edit");
  }
  const items = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
  if (items.length > definition.input.maxItems) throw new Error("invalid_fact_edit");
  return items.length > 0 ? items : undefined;
}

export function editFromForm(
  values: Partial<Record<RawFactPath, FactFormValue>>,
  clearPaths: readonly RawFactPath[]
): UserFactEdit {
  const definitionByPath = new Map(FACT_FIELD_DEFINITIONS.map((item) => [item.path, item]));
  const rawValueEntries = Object.entries(values);
  if (
    rawValueEntries.some(([path]) => !rawFactPathSet.has(path)) ||
    clearPaths.some((path) => !rawFactPathSet.has(path))
  ) {
    throw new Error("invalid_fact_edit");
  }
  const clear = [...new Set(clearPaths)];
  const clearSet = new Set(clear);
  const set: Partial<Record<RawFactPath, RawFactValue>> = {};
  rawValueEntries.forEach(([candidatePath, formValue]) => {
    const path = candidatePath as RawFactPath;
    if (formValue === undefined || clearSet.has(path)) return;
    const definition = definitionByPath.get(path);
    if (!definition) throw new Error("invalid_fact_edit");
    const value = normalizedValue(definition, formValue);
    if (value !== undefined) set[path] = value;
  });
  const parsed = parseRawFactPatch({ set });
  if (!parsed.success || Object.values(parsed.data.set).some((value) => value === null)) {
    throw new Error("invalid_fact_edit");
  }
  return { set: parsed.data.set as UserFactEdit["set"], clear };
}

export type { ExtractionMode };
