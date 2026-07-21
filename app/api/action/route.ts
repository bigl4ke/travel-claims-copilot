import { NextResponse } from "next/server";

import cases from "../../../data/cases.json";
import policies from "../../../data/policies.json";
import scripts from "../../../data/scripts.json";
import { analyzeProviderFeedback, generateActionScript } from "../../../lib/actionAssistant";
import { buildAnalysisFromFacts } from "../../../lib/analyze";
import { parseClaimFacts } from "../../../lib/claimFacts";
import { MAX_REQUEST_BODY_BYTES } from "../../../lib/inputLimits";
import { createStructuredOutputClientFromEnv } from "../../../lib/llm";
import { assessHighRiskClaim } from "../../../lib/safety";
import type {
  ActionPlan,
  ActionScriptChannel,
  Case,
  HandlingContactRole,
  Policy,
  Script
} from "../../../lib/types";

const scriptChannels: ActionScriptChannel[] = [
  "front_desk",
  "airport_counter",
  "phone",
  "chat",
  "email",
  "corporate_escalation"
];
const contactRoles: HandlingContactRole[] = [
  "hotel_front_desk",
  "hotel_customer_care",
  "ticketing_airline",
  "ticketing_agent",
  "frequent_flyer_program",
  "disrupting_airline",
  "airline_customer_relations",
  "unknown"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noStoreJson(body: unknown, init?: ResponseInit): Response {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function boundedStrings(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const strings = value.map((item) => boundedString(item, 1_000));
  return strings.every((item): item is string => item !== null) ? strings : null;
}

function resolveCurrentAction(candidate: unknown, base: ActionPlan): ActionPlan {
  if (!isRecord(candidate) || candidate.notGuaranteed !== true) return base;
  const headline = boundedString(candidate.headline, 500);
  const primaryAsk =
    candidate.primaryAsk === null ? null : boundedString(candidate.primaryAsk, 1_000);
  const askNext = boundedStrings(candidate.askNext, 5);
  const evidenceNow = boundedStrings(candidate.evidenceNow, 8);
  const ifTheySayNo = boundedStrings(candidate.ifTheySayNo, 5);
  const uncertainties = boundedStrings(candidate.uncertainties, 5);
  const providerFeedbackPrompt = boundedString(candidate.providerFeedbackPrompt, 500);
  const contact = isRecord(candidate.contactNow) ? candidate.contactNow : null;
  const role = contactRoles.find((item) => item === contact?.role);
  const contactReason = boundedString(contact?.reason, 1_000);
  const contactName = contact?.name === null ? null : boundedString(contact?.name, 200);

  if (
    !headline ||
    (candidate.primaryAsk !== null && !primaryAsk) ||
    !askNext ||
    !evidenceNow ||
    !ifTheySayNo ||
    !uncertainties ||
    !providerFeedbackPrompt ||
    !role ||
    !contactReason ||
    (contact?.name !== null && !contactName)
  ) {
    return base;
  }

  return {
    ...base,
    headline,
    contactNow: { role, name: contactName, reason: contactReason },
    primaryAsk,
    askNext,
    evidenceNow,
    ifTheySayNo,
    uncertainties,
    providerFeedbackPrompt,
    // Source provenance is always rebuilt from server-owned retrieval data.
    references: base.references,
    sourceIds: base.sourceIds,
    notGuaranteed: true
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    return noStoreJson({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return noStoreJson({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return noStoreJson({ error: "Invalid request body." }, { status: 400 });
  }

  const parsedFacts = parseClaimFacts(body.facts);
  if (!parsedFacts.success) {
    return noStoreJson({ error: "Invalid structured claim facts." }, { status: 400 });
  }
  const analysis = buildAnalysisFromFacts(
    parsedFacts.data,
    policies as Policy[],
    cases as Case[],
    scripts as Script[]
  );
  if (!analysis.actionPlan) {
    return noStoreJson({ error: "No action plan is available." }, { status: 422 });
  }
  const currentAction = resolveCurrentAction(body.currentAction, analysis.actionPlan);
  const client = createStructuredOutputClientFromEnv();

  if (body.kind === "script") {
    const channel = scriptChannels.find((candidate) => candidate === body.channel);
    const language = body.language === "zh" ? "zh" : body.language === "en" ? "en" : null;
    const tone = ["polite", "polite_firm", "firm"].includes(body.tone as string)
      ? (body.tone as Script["tone"])
      : "polite_firm";
    if (!channel || !language) {
      return noStoreJson({ error: "Invalid script channel or language." }, { status: 400 });
    }
    const result = await generateActionScript({
      facts: parsedFacts.data,
      actionPlan: currentAction,
      channel,
      language,
      tone,
      client
    });
    return noStoreJson(result);
  }

  if (body.kind === "provider_feedback") {
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    if (!feedback || feedback.length > 4_000) {
      return noStoreJson(
        { error: "Provider response must be 1 to 4000 characters." },
        { status: 400 }
      );
    }
    const safety = assessHighRiskClaim(feedback);
    if (safety) {
      return noStoreJson({ error: safety.message, safety }, { status: 422 });
    }
    const result = await analyzeProviderFeedback({
      feedback,
      currentAction,
      client
    });
    return noStoreJson(result);
  }

  return noStoreJson({ error: "Unknown action request." }, { status: 400 });
}
