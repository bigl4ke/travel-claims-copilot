import type { WorkflowStatus } from "../domain/claim-contract";

export type SafeExtractionTelemetry =
  | {
      extractionPerformed: false;
      requestedMode: "local" | "gpt";
      provider: null;
      model: null;
      notRunReason: "preflight_guard" | "correction_only";
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "local";
      provider: "local";
      model: null;
      notRunReason?: never;
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "gpt";
      provider: "openai";
      model: "gpt-5.6-luna";
      notRunReason?: never;
      fallbackReason?: never;
    }
  | {
      extractionPerformed: true;
      requestedMode: "gpt";
      provider: "local";
      model: null;
      notRunReason?: never;
      fallbackReason: string;
    };

export type SafeTelemetryEvent = SafeExtractionTelemetry & {
  requestId: string;
  category:
    | "success"
    | "fallback"
    | "refusal"
    | "invalid_request"
    | "rate_limited"
    | "upstream_failure";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  workflowStatus?: WorkflowStatus;
};

export interface TelemetrySink {
  record(event: SafeTelemetryEvent): void;
}

const eventKeys: ReadonlySet<string> = new Set([
  "requestId",
  "category",
  "durationMs",
  "inputTokens",
  "outputTokens",
  "workflowStatus",
  "extractionPerformed",
  "requestedMode",
  "provider",
  "model",
  "notRunReason",
  "fallbackReason"
]);
const categories: ReadonlySet<string> = new Set([
  "success",
  "fallback",
  "refusal",
  "invalid_request",
  "rate_limited",
  "upstream_failure"
]);
const workflowStatuses: ReadonlySet<string> = new Set([
  "ready",
  "needs_information",
  "out_of_scope",
  "unsupported_high_risk"
]);
const canonicalFallbackReasons: ReadonlySet<string> = new Set([
  "openai_extractor_unavailable",
  "model_timeout",
  "upstream_rate_limited",
  "upstream_unavailable",
  "invalid_model_json",
  "invalid_model_schema"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isSafeTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasValidCommonFields(value: Record<string, unknown>): boolean {
  if (Object.keys(value).some((key) => !eventKeys.has(key))) return false;
  if (
    typeof value.requestId !== "string" ||
    value.requestId.trim().length === 0 ||
    value.requestId.length > 128
  ) {
    return false;
  }
  if (
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    !categories.has(value.category as string)
  ) {
    return false;
  }
  if (hasOwn(value, "inputTokens") && !isSafeTokenCount(value.inputTokens)) return false;
  if (hasOwn(value, "outputTokens") && !isSafeTokenCount(value.outputTokens)) return false;
  if (hasOwn(value, "workflowStatus") && !workflowStatuses.has(value.workflowStatus as string)) {
    return false;
  }
  return true;
}

function hasValidExtractionArm(value: Record<string, unknown>): boolean {
  if (value.extractionPerformed === false) {
    return (
      (value.requestedMode === "local" || value.requestedMode === "gpt") &&
      value.provider === null &&
      value.model === null &&
      (value.notRunReason === "preflight_guard" || value.notRunReason === "correction_only") &&
      !hasOwn(value, "fallbackReason")
    );
  }
  if (value.extractionPerformed !== true || hasOwn(value, "notRunReason")) return false;
  if (value.requestedMode === "local") {
    return value.provider === "local" && value.model === null && !hasOwn(value, "fallbackReason");
  }
  if (value.requestedMode !== "gpt") return false;
  if (value.provider === "openai") {
    return value.model === "gpt-5.6-luna" && !hasOwn(value, "fallbackReason");
  }
  return (
    value.provider === "local" &&
    value.model === null &&
    typeof value.fallbackReason === "string" &&
    canonicalFallbackReasons.has(value.fallbackReason)
  );
}

export function createSafeTelemetryEvent(input: SafeTelemetryEvent): SafeTelemetryEvent {
  const value: unknown = input;
  if (!isRecord(value) || !hasValidCommonFields(value) || !hasValidExtractionArm(value)) {
    throw new Error("invalid_safe_telemetry_event");
  }

  const common = {
    requestId: value.requestId as string,
    category: value.category as SafeTelemetryEvent["category"],
    durationMs: value.durationMs as number,
    ...(hasOwn(value, "inputTokens") ? { inputTokens: value.inputTokens as number } : {}),
    ...(hasOwn(value, "outputTokens") ? { outputTokens: value.outputTokens as number } : {}),
    ...(hasOwn(value, "workflowStatus")
      ? { workflowStatus: value.workflowStatus as WorkflowStatus }
      : {})
  };
  if (value.extractionPerformed === false) {
    return {
      ...common,
      extractionPerformed: false,
      requestedMode: value.requestedMode as "local" | "gpt",
      provider: null,
      model: null,
      notRunReason: value.notRunReason as "preflight_guard" | "correction_only"
    };
  }
  if (value.requestedMode === "local") {
    return {
      ...common,
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    };
  }
  if (value.provider === "openai") {
    return {
      ...common,
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    };
  }
  return {
    ...common,
    extractionPerformed: true,
    requestedMode: "gpt",
    provider: "local",
    model: null,
    fallbackReason: value.fallbackReason as string
  };
}
