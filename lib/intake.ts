import type { AnalyzeClaimIntakeResponse, AnalyzeClaimRequest } from "./api/analyze-contract";
import { parseAnalyzeClaimRequest } from "./api/analyze-contract";
import {
  processClaimTurn as processCanonicalClaimTurn,
  type ProcessClaimDependencies
} from "./claim-workflow";
import {
  emptyClaimFacts,
  getMissingClaimFields,
  normalizeClaimFacts,
  parseClaimFacts,
  type ClaimFactField,
  type ClaimFacts
} from "./claimFacts";
import type { ClaimState, RawClaimFacts } from "./domain/claim-contract";
import { buildResolutionFacts, emptyRawClaimFacts } from "./domain/raw-fact-schema";
import { isBlockedWorkflowStatus } from "./domain/workflow-status";
import { createKnowledgeRepository } from "./knowledge/knowledge-repository";
import type { StructuredOutputClient } from "./llm";
import {
  LocalRawFactExtractor,
  OpenAIRawFactExtractor,
  type RawFactExtractor
} from "./model/raw-fact-extractor";

export type IntakeStatus = "needs_info" | "ready" | "out_of_scope" | "unsupported_high_risk";
export type IntakeExtractionMode = "llm" | "deterministic";

export type IntakeResult = {
  status: IntakeStatus;
  facts: ClaimFacts;
  missingFields: ClaimFactField[];
  question: string | null;
  extractionMode: IntakeExtractionMode;
  cautions: string[];
  warning?: "llm_not_configured" | "llm_fallback_used";
};

export type ProcessClaimTurnDependencies = {
  localExtractor: RawFactExtractor;
  openaiExtractor?: RawFactExtractor;
  knowledgeRepository?: ProcessClaimDependencies["knowledgeRepository"];
  now?: ProcessClaimDependencies["now"];
};

export type IntakeDependencies = {
  llmClient?: StructuredOutputClient | null;
  localExtractor?: RawFactExtractor;
  openaiExtractor?: RawFactExtractor;
};

export async function processClaimTurn(
  value: unknown,
  dependencies: ProcessClaimTurnDependencies
): Promise<AnalyzeClaimIntakeResponse> {
  const parsed = parseAnalyzeClaimRequest(value);
  if (!parsed.success) {
    throw new Error(`invalid_analyze_claim_request: ${parsed.errors.join("; ")}`);
  }
  const now = dependencies.now ?? (() => new Date().toISOString().slice(0, 10));
  const response = await processCanonicalClaimTurn(parsed.data, {
    localExtractor: dependencies.localExtractor,
    ...(dependencies.openaiExtractor ? { openaiExtractor: dependencies.openaiExtractor } : {}),
    knowledgeRepository:
      dependencies.knowledgeRepository ?? createKnowledgeRepository({ asOf: now() }),
    now
  });
  return {
    ...response,
    status: response.result.status
  };
}

function legacyFactsToState(facts: ClaimFacts): ClaimState {
  const empty = emptyRawClaimFacts();
  const raw: RawClaimFacts = {
    ...empty,
    incidentType: facts.issueType === "unknown" ? null : facts.issueType,
    providerType: facts.providerType === "unknown" ? null : facts.providerType,
    provider: facts.provider,
    operatingCarrier: facts.operatingCarrier,
    origin: {
      city: facts.origin.city,
      airport: facts.origin.airport,
      country: facts.origin.country
    },
    destination: {
      city: facts.destination.city,
      airport: facts.destination.airport,
      country: facts.destination.country
    },
    reasonCategory: facts.disruptionReason === "unknown" ? null : facts.disruptionReason,
    finalArrivalDelayMinutes: facts.arrivalDelayMinutes,
    isOvernight: facts.isOvernight,
    deniedBoardingKind: facts.deniedBoardingKind === "unknown" ? null : facts.deniedBoardingKind,
    bookingChannel: facts.bookingChannel === "unknown" ? null : facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus,
    expenses: [...facts.expenses],
    evidence: [...facts.evidence],
    userGoal: facts.userGoal
  };
  return {
    facts: raw,
    provenance: {},
    revision: 0,
    conflicts: [],
    unresolvedFields: []
  };
}

function rawFactsToLegacyFacts(facts: RawClaimFacts): ClaimFacts {
  const disruptionTypeByIncident: Record<
    NonNullable<RawClaimFacts["incidentType"]>,
    ClaimFacts["disruptionType"]
  > = {
    hotel_walk: "hotel_walk",
    airline_delay: "delay",
    airline_cancellation: "cancellation",
    denied_boarding: "denied_boarding"
  };
  return normalizeClaimFacts({
    ...emptyClaimFacts(),
    issueType: facts.incidentType ?? "unknown",
    providerType: facts.providerType ?? "unknown",
    provider: facts.provider,
    operatingCarrier: facts.operatingCarrier,
    origin: { ...facts.origin, region: null },
    destination: { ...facts.destination, region: null },
    disruptionType: facts.incidentType ? disruptionTypeByIncident[facts.incidentType] : "unknown",
    disruptionReason:
      facts.reasonCategory === "other_uncontrollable"
        ? "unknown"
        : (facts.reasonCategory ?? "unknown"),
    arrivalDelayMinutes: facts.finalArrivalDelayMinutes,
    isOvernight: facts.isOvernight,
    deniedBoardingKind: facts.deniedBoardingKind ?? "unknown",
    bookingChannel: facts.bookingChannel ?? "unknown",
    loyaltyStatus: facts.loyaltyStatus,
    expenses: [...facts.expenses],
    evidence: [...facts.evidence],
    userGoal: facts.userGoal,
    confidence: facts.incidentType ? "high" : "low"
  });
}

function isChinese(text: string): boolean {
  return /[\p{Script=Han}]/u.test(text);
}

function questionForMissingFields(
  fields: ClaimFactField[],
  chinese: boolean,
  facts: ClaimFacts
): string {
  const selected = fields.slice(0, 3);
  if (selected.includes("issueType")) {
    return chinese
      ? "具体发生了什么：酒店到店无房、航班延误或取消，还是航班超售拒载？"
      : "What happened: a hotel had no room, a flight was delayed or cancelled, or you were bumped from an oversold flight?";
  }
  const needsOrigin = selected.includes("origin");
  const needsDestination = selected.includes("destination");
  if (needsOrigin && needsDestination) {
    return chinese
      ? "这趟航班从哪里出发、飞往哪里？请提供城市或机场代码。"
      : "Where did the flight depart from and fly to? City names or airport codes are enough.";
  }
  if (needsOrigin) {
    return chinese
      ? "这趟航班从哪里出发？请提供城市或机场代码。"
      : "Where did the flight depart from? A city name or airport code is enough.";
  }
  if (needsDestination) {
    return chinese
      ? "这趟航班飞往哪里？请提供城市或机场代码。"
      : "Where did the flight fly to? A city name or airport code is enough.";
  }
  if (selected.includes("provider")) {
    if (facts.providerType === "hotel" || facts.issueType === "hotel_walk") {
      return chinese ? "是哪家酒店或酒店集团？" : "Which hotel or hotel group was involved?";
    }
    if (facts.providerType === "airline") {
      return chinese
        ? "实际承运这趟航班的是哪家航司？"
        : "Which airline actually operated the flight?";
    }
    return chinese
      ? "是哪家酒店或实际承运航司？"
      : "Which hotel or operating airline was involved?";
  }
  if (selected.includes("deniedBoardingKind")) {
    return chinese
      ? "你是自愿接受改签条件，还是在没有自愿的情况下被拒绝登机？"
      : "Did you volunteer to take another flight, or were you denied boarding involuntarily?";
  }
  const needsArrivalDelay = selected.includes("arrivalDelayMinutes");
  const needsDisruptionReason = selected.includes("disruptionReason");
  if (needsArrivalDelay && needsDisruptionReason) {
    return chinese
      ? "你最终晚到多久？航司给出的延误或取消原因是什么？"
      : "How late did you reach your destination, and what reason did the airline give?";
  }
  if (needsArrivalDelay)
    return chinese ? "你最终晚到多久？" : "How late did you reach your destination?";
  if (needsDisruptionReason) {
    return chinese ? "航司给出的延误或取消原因是什么？" : "What reason did the airline give?";
  }
  if (selected.includes("disruptionType")) {
    return chinese
      ? "航班是延误、取消，还是拒绝登机？"
      : "Was the flight delayed, cancelled, or denied boarding?";
  }
  return chinese
    ? "请再补充一些事情经过。"
    : "Please add a little more detail about what happened.";
}

export async function processIntake(
  message: string,
  currentFacts: ClaimFacts = emptyClaimFacts(),
  dependencies: IntakeDependencies = {}
): Promise<IntakeResult> {
  const localExtractor = dependencies.localExtractor ?? new LocalRawFactExtractor();
  const configuredOpenAIExtractor =
    dependencies.openaiExtractor ??
    (dependencies.llmClient ? new OpenAIRawFactExtractor(dependencies.llmClient) : undefined);
  const request: AnalyzeClaimRequest = {
    message,
    prior: legacyFactsToState(currentFacts),
    baseRevision: 0,
    requestedMode: configuredOpenAIExtractor ? "gpt" : "local"
  };
  let response: AnalyzeClaimIntakeResponse;
  let extractionMode: IntakeExtractionMode = configuredOpenAIExtractor ? "llm" : "deterministic";
  let warning: IntakeResult["warning"] = configuredOpenAIExtractor
    ? undefined
    : "llm_not_configured";
  try {
    response = await processClaimTurn(request, {
      localExtractor,
      ...(configuredOpenAIExtractor ? { openaiExtractor: configuredOpenAIExtractor } : {})
    });
  } catch (error) {
    if (!configuredOpenAIExtractor) throw error;
    response = await processClaimTurn({ ...request, requestedMode: "local" }, { localExtractor });
    extractionMode = "deterministic";
    warning = "llm_fallback_used";
  }
  const facts = rawFactsToLegacyFacts(buildResolutionFacts(response.claimState));
  if (isBlockedWorkflowStatus(response.result.status)) {
    return {
      status: response.result.status,
      facts,
      missingFields: [],
      question: null,
      extractionMode,
      cautions: [...response.result.cautions]
    };
  }
  const missingFields = getMissingClaimFields(facts);
  const needsInformation =
    missingFields.length > 0 || response.claimState.unresolvedFields.length > 0;
  return {
    status: needsInformation ? "needs_info" : "ready",
    facts,
    missingFields,
    question: needsInformation
      ? questionForMissingFields(missingFields, isChinese(message), facts)
      : null,
    extractionMode,
    cautions: [...response.result.cautions],
    ...(warning ? { warning } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isCanonicalShape(body: Record<string, unknown>): boolean {
  return ["prior", "baseRevision", "correction", "requestedMode", "privacyAcknowledged"].some(
    (key) => hasOwn(body, key)
  );
}

export function createIntakePostHandler(dependencies: ProcessClaimTurnDependencies) {
  return async function intakePost(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return Response.json({ error: "Invalid JSON request." }, { status: 400 });
    }
    if (isCanonicalShape(body)) {
      const parsed = parseAnalyzeClaimRequest(body);
      if (!parsed.success) {
        return Response.json({ error: "Invalid canonical intake request." }, { status: 400 });
      }
      try {
        return Response.json(await processClaimTurn(parsed.data, dependencies));
      } catch {
        return Response.json({ error: "Intake processing failed." }, { status: 500 });
      }
    }
    if (!hasOwn(body, "facts")) {
      return Response.json({ error: "Invalid intake request shape." }, { status: 400 });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return Response.json({ error: "Please provide a message." }, { status: 400 });
    }
    let currentFacts = emptyClaimFacts();
    if (body.facts !== null) {
      const parsed = parseClaimFacts(body.facts);
      if (!parsed.success) {
        return Response.json({ error: "Invalid existing claim facts." }, { status: 400 });
      }
      currentFacts = parsed.data;
    }
    try {
      return Response.json(
        await processIntake(message, currentFacts, {
          llmClient: null,
          localExtractor: dependencies.localExtractor
        })
      );
    } catch {
      return Response.json({ error: "Intake processing failed." }, { status: 500 });
    }
  };
}
