import {
  emptyClaimFacts,
  getMissingClaimFields,
  normalizeClaimFacts,
  parseClaimFacts,
  type ClaimFactField,
  type ClaimFacts,
  type ClaimLocation
} from "./claimFacts";
import { classifyInput } from "./classifier";
import { isMvpIssueType } from "./issueTaxonomy";
import { assessEu261Candidate, inferRouteLocations } from "./jurisdiction";
import {
  createStructuredOutputClientFromEnv,
  type StructuredOutputClient
} from "./llm";
import { claimFactsJsonSchema } from "./claimFacts";

export type IntakeStatus = "needs_info" | "ready";
export type IntakeExtractionMode = "llm" | "deterministic";

export type IntakeResult = {
  status: IntakeStatus;
  facts: ClaimFacts;
  missingFields: ClaimFactField[];
  question: string | null;
  extractionMode: IntakeExtractionMode;
  warning?: "llm_not_configured" | "llm_fallback_used";
};

export type IntakeDependencies = {
  llmClient?: StructuredOutputClient | null;
};

const intakeInstructions = `Role: Extract and merge facts for a travel disruption intake.

Goal: Return one complete ClaimFacts object that incorporates the prior facts and the user's latest message.

Rules:
- Use only the issue types and enum values allowed by the JSON Schema.
- Preserve prior facts unless the user clearly corrects them.
- Extract facts the user stated. Common geographic inference is allowed, but do not decide legal eligibility.
- Use unknown or null when the user did not provide enough information. Never invent a provider, route, reason, expense, evidence item, or delay duration.
- A hotel with no room for a confirmed guest is hotel_walk.
- Airline oversales or bumping is denied_boarding; distinguish voluntary from involuntary when stated.
- Weather is not a controllable airline reason.
- A late inbound aircraft is a reported reason, not by itself a finding that the circumstances were within airline control.
- EU261 is a candidate issue for a disrupted flight departing the EU/EEA/Switzerland, or arriving there on a qualifying operating carrier. Do not promise compensation.
- Return only the schema-defined structured output.`;

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

function isChinese(text: string): boolean {
  return /[\p{Script=Han}]/u.test(text);
}

function mergeLocation(current: ClaimLocation, incoming?: ClaimLocation): ClaimLocation {
  if (!incoming) {
    return current;
  }

  return {
    city: incoming.city ?? current.city,
    airport: incoming.airport ?? current.airport,
    country: incoming.country ?? current.country,
    region: incoming.region ?? current.region
  };
}

function extractArrivalDelayMinutes(text: string): number | null {
  const normalized = text.toLowerCase();
  const digitHours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|小时)/);
  if (digitHours) {
    return Math.round(Number(digitHours[1]) * 60);
  }

  const wordHours = normalized.match(
    new RegExp(`\\b(${Object.keys(numberWords).join("|")})\\s+hours?\\b`)
  );
  if (wordHours) {
    return numberWords[wordHours[1]] * 60;
  }

  const minutes = normalized.match(/(\d+)\s*(?:minutes?|mins?|分钟)/);
  return minutes ? Number(minutes[1]) : null;
}

function inferDisruptionType(text: string): ClaimFacts["disruptionType"] {
  const normalized = text.toLowerCase();
  if (/cancelled|canceled|cancellation|取消/.test(normalized)) {
    return "cancellation";
  }
  if (/denied boarding|bumped|oversold|overbooked|拒载|超售/.test(normalized)) {
    return "denied_boarding";
  }
  if (/delayed|delay|late|延误|晚点/.test(normalized)) {
    return "delay";
  }
  if (/no room|hotel walk|酒店超售|没有房间|到店没房/.test(normalized)) {
    return "hotel_walk";
  }
  return "unknown";
}

function mergeDeterministicFacts(message: string, current: ClaimFacts): ClaimFacts {
  const extracted = classifyInput(message);
  const route = inferRouteLocations(message);
  const disruptionType = inferDisruptionType(message);
  const delayMinutes = extractArrivalDelayMinutes(message);
  const incomingIssue = isMvpIssueType(extracted.issueType)
    ? extracted.issueType
    : current.issueType;

  let merged = normalizeClaimFacts({
    ...current,
    issueType: incomingIssue,
    providerType:
      extracted.providerType === "hotel" || extracted.providerType === "airline"
        ? extracted.providerType
        : current.providerType,
    provider: extracted.provider ?? current.provider,
    origin: mergeLocation(current.origin, route.origin),
    destination: mergeLocation(current.destination, route.destination),
    disruptionType: disruptionType === "unknown" ? current.disruptionType : disruptionType,
    disruptionReason:
      extracted.disruptionReason && extracted.disruptionReason !== "unknown"
        ? extracted.disruptionReason
        : current.disruptionReason,
    arrivalDelayMinutes: delayMinutes ?? current.arrivalDelayMinutes,
    isOvernight: extracted.isOvernight ?? current.isOvernight,
    deniedBoardingKind:
      extracted.deniedBoardingKind && extracted.deniedBoardingKind !== "unknown"
        ? extracted.deniedBoardingKind
        : current.deniedBoardingKind,
    bookingChannel: extracted.bookingChannel ?? current.bookingChannel,
    loyaltyStatus: extracted.loyaltyStatus ?? current.loyaltyStatus,
    confidence: extracted.confidence === "high" ? "high" : current.confidence
  });

  if (
    merged.issueType === "unknown" &&
    (merged.disruptionType === "delay" || merged.disruptionType === "cancellation") &&
    assessEu261Candidate(merged).isCandidate
  ) {
    merged = normalizeClaimFacts({
      ...merged,
      issueType: "eu261_delay_or_cancellation",
      providerType: "airline",
      confidence: "medium"
    });
  }

  return merged;
}

function mergeLlmFactsWithDeterministic(
  llmFacts: ClaimFacts,
  deterministicFacts: ClaimFacts
): ClaimFacts {
  return normalizeClaimFacts({
    ...deterministicFacts,
    issueType:
      llmFacts.issueType === "unknown" ? deterministicFacts.issueType : llmFacts.issueType,
    providerType:
      llmFacts.providerType === "unknown"
        ? deterministicFacts.providerType
        : llmFacts.providerType,
    provider: llmFacts.provider ?? deterministicFacts.provider,
    operatingCarrier: llmFacts.operatingCarrier ?? deterministicFacts.operatingCarrier,
    origin: mergeLocation(deterministicFacts.origin, llmFacts.origin),
    destination: mergeLocation(deterministicFacts.destination, llmFacts.destination),
    disruptionType:
      llmFacts.disruptionType === "unknown"
        ? deterministicFacts.disruptionType
        : llmFacts.disruptionType,
    disruptionReason:
      llmFacts.disruptionReason === "unknown"
        ? deterministicFacts.disruptionReason
        : llmFacts.disruptionReason,
    arrivalDelayMinutes:
      llmFacts.arrivalDelayMinutes ?? deterministicFacts.arrivalDelayMinutes,
    isOvernight: llmFacts.isOvernight ?? deterministicFacts.isOvernight,
    deniedBoardingKind:
      llmFacts.deniedBoardingKind === "unknown"
        ? deterministicFacts.deniedBoardingKind
        : llmFacts.deniedBoardingKind,
    bookingChannel:
      llmFacts.bookingChannel === "unknown"
        ? deterministicFacts.bookingChannel
        : llmFacts.bookingChannel,
    loyaltyStatus: llmFacts.loyaltyStatus ?? deterministicFacts.loyaltyStatus,
    expenses: Array.from(new Set([...deterministicFacts.expenses, ...llmFacts.expenses])),
    evidence: Array.from(new Set([...deterministicFacts.evidence, ...llmFacts.evidence])),
    userGoal: llmFacts.userGoal ?? deterministicFacts.userGoal,
    confidence: llmFacts.confidence
  });
}

function questionForMissingFields(fields: ClaimFactField[], chinese: boolean): string {
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
  if (needsArrivalDelay) {
    return chinese ? "你最终晚到多久？" : "How late did you reach your destination?";
  }
  if (needsDisruptionReason) {
    return chinese
      ? "航司给出的延误或取消原因是什么？"
      : "What reason did the airline give?";
  }
  if (selected.includes("disruptionType")) {
    return chinese ? "航班是延误、取消，还是拒绝登机？" : "Was the flight delayed, cancelled, or denied boarding?";
  }

  return chinese ? "请再补充一些事情经过。" : "Please add a little more detail about what happened.";
}

async function extractWithLlm(
  client: StructuredOutputClient,
  message: string,
  currentFacts: ClaimFacts
): Promise<ClaimFacts> {
  const raw = await client.generate<unknown>({
    schemaName: "travel_claim_facts",
    schema: claimFactsJsonSchema as unknown as Record<string, unknown>,
    instructions: intakeInstructions,
    input: JSON.stringify({ priorFacts: currentFacts, latestUserMessage: message })
  });
  const parsed = parseClaimFacts(raw);
  if (!parsed.success) {
    throw new Error(`LLM returned invalid claim facts: ${parsed.errors.join("; ")}`);
  }

  return parsed.data;
}

export async function processIntake(
  message: string,
  currentFacts: ClaimFacts = emptyClaimFacts(),
  dependencies: IntakeDependencies = {}
): Promise<IntakeResult> {
  const configuredClient = dependencies.llmClient === undefined
    ? createStructuredOutputClientFromEnv()
    : dependencies.llmClient ?? undefined;
  const deterministicFacts = mergeDeterministicFacts(message, currentFacts);
  let facts: ClaimFacts;
  let extractionMode: IntakeExtractionMode = "deterministic";
  let warning: IntakeResult["warning"];

  if (configuredClient) {
    try {
      const llmFacts = await extractWithLlm(configuredClient, message, currentFacts);
      facts = mergeLlmFactsWithDeterministic(llmFacts, deterministicFacts);
      extractionMode = "llm";
    } catch {
      facts = deterministicFacts;
      warning = "llm_fallback_used";
    }
  } else {
    facts = deterministicFacts;
    warning = "llm_not_configured";
  }

  const missingFields = getMissingClaimFields(facts);
  return {
    status: missingFields.length === 0 ? "ready" : "needs_info",
    facts,
    missingFields,
    question: missingFields.length > 0 ? questionForMissingFields(missingFields, isChinese(message)) : null,
    extractionMode,
    ...(warning ? { warning } : {})
  };
}
