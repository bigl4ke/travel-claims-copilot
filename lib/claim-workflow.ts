import { parseAnalyzeClaimRequest, type AnalyzeClaimRequest } from "./api/analyze-contract";
import type {
  AnalyzeClaimDomainResponse,
  AssessmentResult,
  ExtractionMetadata,
  FactDisplayItem,
  RawClaimFacts,
  RawFactPatch,
  RawFactPath,
  RawFactValue,
  RemedyAssessment,
  ResolvedClaimContext,
  RetrievalTrace
} from "./domain/claim-contract";
import { RAW_FACT_PATHS } from "./domain/claim-contract";
import { resolveClaimContext } from "./domain/context-resolver";
import { mergeRawFacts } from "./domain/fact-merge";
import { buildRemedyAssessment, topLevelStatus } from "./domain/remedy-assessment";
import { postMergeGuard, preflightGuard } from "./domain/safety-guard";
import { buildRetrievalTrace, regimesFromApplicability } from "./domain/policy-applicability";
import { evaluatorFor } from "./domain/scenario-evaluator";
import type { KnowledgeRepository, KnowledgeSnapshot } from "./knowledge/knowledge-contract";
import type {
  LocalRawFactExtractionInput,
  LocalRawFactExtractorPort,
  OpenAIRawFactExtractorPort
} from "./model/raw-fact-extractor";
import { buildOutboundExtractionInput } from "./privacy/outbound-payload";
import {
  createSafeTelemetryEvent,
  type SafeExtractionTelemetry,
  type SafeTelemetryEvent,
  type TelemetrySink
} from "./privacy/safe-telemetry";
import { resolveRetrievalLimits } from "./retrieval-limits";
import type { RetrievalLimits } from "./types";

export type ProcessClaimTurnInput = AnalyzeClaimRequest;

export type ProcessClaimDependencies = {
  localExtractor: LocalRawFactExtractorPort;
  openaiExtractor?: OpenAIRawFactExtractorPort;
  knowledgeRepository: KnowledgeRepository;
  now: () => string;
  retrievalLimits?: RetrievalLimits;
  telemetry?: {
    sink: TelemetrySink;
    requestId: string;
    nowMs: () => number;
  };
};

function localExtractionInput(request: AnalyzeClaimRequest): LocalRawFactExtractionInput {
  return { message: request.message };
}

function extractionTelemetry(metadata: ExtractionMetadata): SafeExtractionTelemetry {
  if (!metadata.performed) {
    return {
      extractionPerformed: false,
      requestedMode: metadata.requestedMode,
      provider: null,
      model: null,
      notRunReason: metadata.notRunReason
    };
  }
  if (metadata.provider === "openai") {
    return {
      extractionPerformed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    };
  }
  if (metadata.requestedMode === "local") {
    return {
      extractionPerformed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    };
  }
  return {
    extractionPerformed: true,
    requestedMode: "gpt",
    provider: "local",
    model: null,
    fallbackReason: metadata.fallbackReason
  };
}

function beginTelemetry(dependencies: ProcessClaimDependencies): number | undefined {
  if (!dependencies.telemetry) return undefined;
  try {
    return dependencies.telemetry.nowMs();
  } catch {
    return undefined;
  }
}

function recordTelemetry(
  dependencies: ProcessClaimDependencies,
  startedAt: number | undefined,
  extraction: ExtractionMetadata,
  category: SafeTelemetryEvent["category"],
  workflowStatus?: SafeTelemetryEvent["workflowStatus"]
): void {
  if (!dependencies.telemetry || startedAt === undefined) return;
  try {
    const event = createSafeTelemetryEvent({
      requestId: dependencies.telemetry.requestId,
      category,
      durationMs: dependencies.telemetry.nowMs() - startedAt,
      ...(workflowStatus ? { workflowStatus } : {}),
      ...extractionTelemetry(extraction)
    });
    dependencies.telemetry.sink.record(event);
  } catch {
    // Telemetry is best-effort and must never change claim processing.
  }
}

function readFact(facts: RawClaimFacts, path: RawFactPath): RawFactValue | null {
  const [parent, leaf] = path.split(".");
  const value = leaf
    ? (
        facts[parent as "origin" | "destination" | "assistance"] as unknown as Record<
          string,
          RawFactValue | null
        >
      )[leaf]
    : (facts[parent as keyof RawClaimFacts] as RawFactValue | null);
  if (Array.isArray(value)) return value.length > 0 ? [...value] : null;
  return value ?? null;
}

function factDisplayItems(
  context: ResolvedClaimContext,
  assessments: readonly RemedyAssessment[]
): FactDisplayItem[] {
  const used = new Set(assessments.flatMap(({ factsUsed }) => factsUsed));
  return RAW_FACT_PATHS.filter((path) => used.has(path)).map((path) => ({
    path,
    label: path.replaceAll(".", " "),
    value: readFact(context.resolutionFacts, path),
    provenance: context.raw.provenance[path] ? { ...context.raw.provenance[path] } : null
  }));
}

function missingFacts(
  context: ResolvedClaimContext,
  assessments: readonly RemedyAssessment[]
): RawFactPath[] {
  const missing = new Set<RawFactPath>([
    ...context.raw.unresolvedFields,
    ...context.scenarios.missingFacts
  ]);
  assessments.forEach((assessment) => {
    assessment.missingConditions.forEach((condition) => {
      condition.factFields.forEach((path) => {
        if (readFact(context.resolutionFacts, path) === null) missing.add(path);
      });
    });
  });
  return RAW_FACT_PATHS.filter((path) => missing.has(path));
}

function emptyRetrieval(): RetrievalTrace {
  return {
    policyApplicability: [],
    displayedPolicies: [],
    displayedCases: [],
    displayedScripts: []
  };
}

function blockedResult(input: {
  status: "out_of_scope" | "unsupported_high_risk";
  revision: number;
  extraction: ExtractionMetadata;
  caution: string;
}): AssessmentResult {
  return {
    status: input.status,
    primaryScenario: null,
    scenarioIds: [],
    factsRevision: input.revision,
    factsUsed: [],
    missingFacts: [],
    legalRegimes: [],
    extraction: input.extraction,
    assessments: [],
    retrieval: emptyRetrieval(),
    cautions: [input.caution],
    nextActions: []
  };
}

export function evaluateActiveScenarios(input: {
  context: ResolvedClaimContext;
  knowledge: KnowledgeSnapshot;
  asOf: string;
}): RemedyAssessment[] {
  return input.context.scenarios.decisions
    .filter((decision) => decision.status === "active")
    .flatMap((decision) => {
      const evaluation = evaluatorFor(decision.scenarioId).evaluateConditions(input.context);
      return evaluation.remedies.map((remedy) =>
        buildRemedyAssessment({
          context: input.context,
          knowledge: input.knowledge,
          scenarioId: decision.scenarioId,
          evaluation: remedy,
          asOf: input.asOf
        })
      );
    });
}

async function extractPatches(
  request: AnalyzeClaimRequest,
  dependencies: ProcessClaimDependencies,
  providerArmFailed: (metadata: ExtractionMetadata) => void
): Promise<{
  deterministicPatch: RawFactPatch;
  openaiPatch?: RawFactPatch;
  extraction: ExtractionMetadata;
}> {
  const requestedMode = request.requestedMode ?? "local";
  if (request.correction) {
    return {
      deterministicPatch: { set: {} },
      extraction: {
        performed: false,
        requestedMode,
        provider: null,
        model: null,
        notRunReason: "correction_only"
      }
    };
  }
  let deterministicPatch: RawFactPatch;
  try {
    deterministicPatch = await dependencies.localExtractor.extract(localExtractionInput(request));
  } catch (error) {
    if (requestedMode === "local") {
      providerArmFailed({
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      });
    }
    throw error;
  }
  if (requestedMode === "local") {
    return {
      deterministicPatch,
      extraction: {
        performed: true,
        requestedMode: "local",
        provider: "local",
        model: null
      }
    };
  }
  if (!dependencies.openaiExtractor) {
    return {
      deterministicPatch,
      extraction: {
        performed: true,
        requestedMode: "gpt",
        provider: "local",
        model: null,
        fallbackReason: "openai_extractor_unavailable"
      }
    };
  }
  const outbound = buildOutboundExtractionInput({
    message: request.message,
    claimState: request.prior
  });
  let openaiPatch: RawFactPatch;
  try {
    openaiPatch = await dependencies.openaiExtractor.extract(outbound);
  } catch (error) {
    providerArmFailed({
      performed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    });
    throw error;
  }
  return {
    deterministicPatch,
    openaiPatch,
    extraction: {
      performed: true,
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    }
  };
}

async function processParsedClaimTurn(
  request: AnalyzeClaimRequest,
  dependencies: ProcessClaimDependencies,
  providerArmFailed: (metadata: ExtractionMetadata) => void
): Promise<AnalyzeClaimDomainResponse> {
  const preflight = preflightGuard(request.message);
  if (preflight.status !== "pass") {
    const extraction: ExtractionMetadata = {
      performed: false,
      requestedMode: request.requestedMode ?? "local",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    };
    return {
      baseRevision: request.baseRevision,
      claimState: request.prior,
      result: blockedResult({
        status: preflight.status,
        revision: request.prior.revision,
        extraction,
        caution: preflight.message
      }),
      context: null
    };
  }
  const extracted = await extractPatches(request, dependencies, providerArmFailed);
  const merged = mergeRawFacts({
    prior: request.prior,
    baseRevision: request.baseRevision,
    ...(request.correction ? { correction: request.correction } : {}),
    deterministicPatch: extracted.deterministicPatch,
    ...(extracted.openaiPatch ? { openaiPatch: extracted.openaiPatch } : {})
  });
  const postMerge = postMergeGuard(request.message, merged.state.facts);
  if (postMerge.status !== "pass") {
    return {
      baseRevision: merged.baseRevision,
      claimState: merged.state,
      result: blockedResult({
        status: postMerge.status,
        revision: merged.state.revision,
        extraction: extracted.extraction,
        caution: postMerge.message
      }),
      context: null
    };
  }
  const context = resolveClaimContext({ state: merged.state });
  if (context.scenarios.status === "out_of_scope") {
    return {
      baseRevision: merged.baseRevision,
      claimState: merged.state,
      result: blockedResult({
        status: "out_of_scope",
        revision: merged.state.revision,
        extraction: extracted.extraction,
        caution: "This competition build cannot assess this journey."
      }),
      context: null
    };
  }

  const asOf = dependencies.now();
  const knowledge = await dependencies.knowledgeRepository.load();
  const assessments = evaluateActiveScenarios({ context, knowledge, asOf });
  const retrieval = buildRetrievalTrace(
    context,
    knowledge,
    resolveRetrievalLimits(dependencies.retrievalLimits)
  );
  const unresolvedScenario =
    context.scenarios.status === "needs_information" ||
    context.raw.unresolvedFields.length > 0 ||
    context.raw.conflicts.length > 0;
  const result: AssessmentResult = {
    status: topLevelStatus(assessments, unresolvedScenario),
    primaryScenario: context.scenarios.primaryScenario,
    scenarioIds: [...context.scenarios.scenarioIds],
    factsRevision: merged.state.revision,
    factsUsed: factDisplayItems(context, assessments),
    missingFacts: missingFacts(context, assessments),
    legalRegimes: regimesFromApplicability(retrieval.policyApplicability),
    extraction: extracted.extraction,
    assessments,
    retrieval,
    cautions: [
      "This is an informational condition assessment, not legal advice or a promise of compensation."
    ],
    nextActions: [...new Set(assessments.map(({ nextAction }) => nextAction))]
  };
  return {
    baseRevision: merged.baseRevision,
    claimState: merged.state,
    result,
    context
  };
}

export async function processClaimTurn(
  input: ProcessClaimTurnInput,
  dependencies: ProcessClaimDependencies
): Promise<AnalyzeClaimDomainResponse> {
  const telemetryStartedAt = beginTelemetry(dependencies);
  const parsed = parseAnalyzeClaimRequest(input);
  if (!parsed.success) {
    throw new Error(`invalid_analyze_claim_request: ${parsed.errors.join("; ")}`);
  }
  const response = await processParsedClaimTurn(parsed.data, dependencies, (extraction) => {
    recordTelemetry(dependencies, telemetryStartedAt, extraction, "upstream_failure");
  });
  const { extraction } = response.result;
  const isFallback =
    extraction.performed && extraction.requestedMode === "gpt" && extraction.provider === "local";
  recordTelemetry(
    dependencies,
    telemetryStartedAt,
    extraction,
    isFallback ? "fallback" : "success",
    response.result.status
  );
  return response;
}
