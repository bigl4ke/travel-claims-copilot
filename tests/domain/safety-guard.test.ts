import { describe, expect, it, vi } from "vitest";

import { processClaimTurn } from "../../lib/claim-workflow";
import type { ClaimState, RawClaimFacts, RawFactPatch } from "../../lib/domain/claim-contract";
import { postMergeGuard, preflightGuard, projectGuardText } from "../../lib/domain/safety-guard";
import type { KnowledgeRepository } from "../../lib/knowledge/knowledge-contract";
import type { RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState, rawFacts, type DeepPartial } from "../fixtures/raw-claims";

const cautionByCategory = {
  acute_medical_or_safety:
    "This may require immediate emergency or medical help; this tool cannot analyze it as an ordinary travel claim.",
  personal_injury:
    "Personal-injury claims need qualified medical and legal support beyond this tool.",
  litigation_strategy:
    "Litigation strategy requires a qualified lawyer; this tool will not provide ordinary claim analysis for it.",
  significant_property_loss:
    "Significant property loss may require police, insurer, or legal assistance beyond this tool.",
  complex_insurance:
    "Complex insurance interpretation requires a qualified insurance or legal professional."
} as const;

const riskyMessages = [
  ["I swallowed a cleaning chemical at the hotel", "acute_medical_or_safety"],
  ["There is an active fire and I need emergency help", "acute_medical_or_safety"],
  ["I was injured and need compensation for medical harm", "personal_injury"],
  ["Tell me how to sue and run the litigation", "litigation_strategy"],
  ["The hotel lost jewelry worth $50,000", "significant_property_loss"],
  ["I lost a camera worth $50,000", "significant_property_loss"],
  ["My $5,000 laptop was stolen", "significant_property_loss"],
  ["Interpret this complex travel-insurance coverage denial", "complex_insurance"],
  ["酒店清洁剂让我中毒了", "acute_medical_or_safety"],
  ["我在机场受伤需要处理人身伤害", "personal_injury"],
  ["帮我制定起诉航司的诉讼策略", "litigation_strategy"],
  ["酒店弄丢了价值很高的珠宝", "significant_property_loss"],
  ["价值很高的珠宝被盗", "significant_property_loss"],
  ["帮我解释复杂的旅行保险拒赔条款", "complex_insurance"]
] as const;

function workflowHarness(
  input: {
    deterministicSet?: RawFactPatch["set"];
    openaiSet?: RawFactPatch["set"];
  } = {}
) {
  const localExtract = vi.fn().mockResolvedValue({ set: input.deterministicSet ?? {} });
  const openaiExtract = vi.fn().mockResolvedValue({ set: input.openaiSet ?? {} });
  const load = vi.fn().mockResolvedValue(knowledgeSnapshotFixture());
  const now = vi.fn(() => "2026-07-18");
  const localExtractor = {
    provider: "local",
    model: null,
    extract: localExtract
  } satisfies RawFactExtractor;
  const openaiExtractor = {
    provider: "openai",
    model: "gpt-5.6-luna",
    extract: openaiExtract
  } satisfies RawFactExtractor;
  const knowledgeRepository = { load } satisfies KnowledgeRepository;

  return {
    dependencies: { localExtractor, openaiExtractor, knowledgeRepository, now },
    localExtract,
    openaiExtract,
    load,
    now
  };
}

function frozenAirlineState(overrides: DeepPartial<RawClaimFacts> = {}, revision = 0): ClaimState {
  return claimState(
    {
      incidentType: "airline_cancellation",
      providerType: "airline",
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" },
      reasonCategory: "crew",
      userInitiatedChange: false,
      ...overrides
    },
    revision
  );
}

function expectEmptyBlockedPresentation(
  response: Awaited<ReturnType<typeof processClaimTurn>>,
  caution: string
) {
  expect(response.context).toBeNull();
  expect(response.result).toMatchObject({
    status: "unsupported_high_risk",
    primaryScenario: null,
    scenarioIds: [],
    factsUsed: [],
    missingFacts: [],
    legalRegimes: [],
    assessments: [],
    retrieval: {
      policyApplicability: [],
      displayedPolicies: [],
      displayedCases: [],
      displayedScripts: []
    },
    cautions: [caution],
    nextActions: []
  });
}

describe("two-stage high-risk guard", () => {
  it.each(riskyMessages)("blocks %s before normal analysis", async (message, category) => {
    const harness = workflowHarness();
    const prior = claimState();

    const response = await processClaimTurn(
      { message, prior, baseRevision: 0, requestedMode: "local" },
      harness.dependencies
    );

    expectEmptyBlockedPresentation(response, cautionByCategory[category]);
    expect(response.baseRevision).toBe(0);
    expect(response.claimState).toEqual(prior);
    expect(response.result.factsRevision).toBe(0);
    expect(response.result.extraction).toEqual({
      performed: false,
      requestedMode: "local",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    });
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
    expect(harness.now).not.toHaveBeenCalled();
  });

  it("preserves the requested GPT mode when preflight blocks both extractors", async () => {
    const harness = workflowHarness();

    const response = await processClaimTurn(
      {
        message: "There is an active fire and I need emergency help",
        prior: claimState(),
        baseRevision: 0,
        requestedMode: "gpt"
      },
      harness.dependencies
    );

    expect(response.result.extraction).toEqual({
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "preflight_guard"
    });
    expect(harness.localExtract).not.toHaveBeenCalled();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
  });

  it("blocks a high-risk goal revealed only by the merged extractor patch", async () => {
    const harness = workflowHarness({ deterministicSet: { userGoal: "Prepare my lawsuit" } });

    const response = await processClaimTurn(
      {
        message: "Please update only my requested outcome.",
        prior: frozenAirlineState(),
        baseRevision: 0,
        requestedMode: "local"
      },
      harness.dependencies
    );

    expectEmptyBlockedPresentation(response, cautionByCategory.litigation_strategy);
    expect(response.claimState.facts.userGoal).toBe("Prepare my lawsuit");
    expect(response.claimState.revision).toBe(1);
    expect(response.result.factsRevision).toBe(1);
    expect(response.result.extraction).toEqual({
      performed: true,
      requestedMode: "local",
      provider: "local",
      model: null
    });
    expect(harness.localExtract).toHaveBeenCalledOnce();
    expect(harness.openaiExtract).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
    expect(harness.now).not.toHaveBeenCalled();
  });

  it.each([
    ["statedReason", "There is an active fire at the airport", "acute_medical_or_safety"],
    ["provider", "I was injured and need personal injury help", "personal_injury"],
    ["evidence", ["Tell me how to sue and run the litigation"], "litigation_strategy"],
    ["expenses", ["The hotel lost jewelry worth $50,000"], "significant_property_loss"]
  ] as const)(
    "post-checks correction-only high-risk text in %s without extraction",
    async (path, value, category) => {
      const harness = workflowHarness();

      const response = await processClaimTurn(
        {
          message: "",
          prior: frozenAirlineState({}, 3),
          baseRevision: 3,
          requestedMode: "gpt",
          correction: { set: { [path]: value }, clear: [] }
        },
        harness.dependencies
      );

      expectEmptyBlockedPresentation(response, cautionByCategory[category]);
      expect(response.baseRevision).toBe(3);
      expect(response.claimState.revision).toBe(4);
      expect(response.result.factsRevision).toBe(4);
      expect(response.result.extraction).toEqual({
        performed: false,
        requestedMode: "gpt",
        provider: null,
        model: null,
        notRunReason: "correction_only"
      });
      expect(harness.localExtract).not.toHaveBeenCalled();
      expect(harness.openaiExtract).not.toHaveBeenCalled();
      expect(harness.load).not.toHaveBeenCalled();
      expect(harness.now).not.toHaveBeenCalled();
    }
  );

  it("does not reuse derived scenario presentation from a previously complete state", async () => {
    const harness = workflowHarness();
    const prior = frozenAirlineState({}, 5);

    const response = await processClaimTurn(
      {
        message: "Interpret this complex travel-insurance coverage denial",
        prior,
        baseRevision: 5
      },
      harness.dependencies
    );

    expectEmptyBlockedPresentation(response, cautionByCategory.complex_insurance);
    expect(response.claimState).toEqual(prior);
    expect(response.result.factsRevision).toBe(5);
  });

  it.each([
    "I want to file a DOT complaint",
    "I need a meal voucher",
    "酒店不给我房间",
    "The airline lost my baggage",
    "I lost an ordinary item at the hotel",
    "This jewelry was not stolen",
    "No jewelry was stolen",
    "No $5,000 laptop was stolen",
    "No valuable property was stolen",
    "没有任何珠宝被盗",
    "珠宝未被盗",
    "无珠宝被盗",
    "无高价值珠宝被盗",
    "酒店有高价值珠宝展览，没有丢失"
  ])("does not block the ordinary frozen-scope message: %s", async (message) => {
    const harness = workflowHarness();

    const response = await processClaimTurn(
      { message, prior: frozenAirlineState(), baseRevision: 0 },
      harness.dependencies
    );

    expect(response.result.status).not.toBe("unsupported_high_risk");
    expect(response.context).not.toBeNull();
    expect(harness.localExtract).toHaveBeenCalledOnce();
    expect(harness.load).toHaveBeenCalledOnce();
    expect(harness.now).toHaveBeenCalledOnce();
  });

  it("keeps ordinary out-of-scope resolution ahead of repository access", async () => {
    const harness = workflowHarness();

    const response = await processClaimTurn(
      {
        message: "No additional facts.",
        prior: claimState({
          incidentType: "hotel_walk",
          providerType: "hotel",
          provider: "Hyatt",
          confirmedHotelReservation: true,
          wasWalked: true
        }),
        baseRevision: 0
      },
      harness.dependencies
    );

    expect(response.result.status).toBe("out_of_scope");
    expect(response.context).toBeNull();
    expect(harness.localExtract).toHaveBeenCalledOnce();
    expect(harness.load).not.toHaveBeenCalled();
    expect(harness.now).not.toHaveBeenCalled();
  });
});

describe("deterministic guard contract", () => {
  it.each(riskyMessages)("classifies %s as %s", (message, category) => {
    expect(preflightGuard(message)).toEqual({
      status: "unsupported_high_risk",
      category,
      message: cautionByCategory[category]
    });
  });

  it("projects every mutable free-text field in a fixed order and no controlled values", () => {
    const facts = rawFacts({
      incidentType: "hotel_walk",
      providerType: "hotel",
      provider: "provider-text",
      brandOrProperty: "brand-text",
      operatingCarrier: "carrier-text",
      origin: {
        city: "origin-city-text",
        airport: "origin-airport-text",
        country: "origin-country-text"
      },
      destination: {
        city: "destination-city-text",
        airport: "destination-airport-text",
        country: "destination-country-text"
      },
      statedReason: "reason-text",
      reasonCategory: "crew",
      scheduledFinalArrival: "scheduled-text",
      actualFinalArrival: "actual-text",
      bookingChannel: "direct",
      loyaltyStatus: "loyalty-text",
      wasWalked: true,
      expenses: ["expense-one-text", "expense-two-text"],
      evidence: ["evidence-one-text", "evidence-two-text"],
      userGoal: "goal-text"
    });

    expect(projectGuardText(facts).split("\n")).toEqual([
      "provider-text",
      "brand-text",
      "carrier-text",
      "origin-city-text",
      "origin-airport-text",
      "origin-country-text",
      "destination-city-text",
      "destination-airport-text",
      "destination-country-text",
      "reason-text",
      "scheduled-text",
      "actual-text",
      "loyalty-text",
      "expense-one-text",
      "expense-two-text",
      "evidence-one-text",
      "evidence-two-text",
      "goal-text"
    ]);
    expect(projectGuardText(facts)).not.toContain("hotel_walk");
    expect(projectGuardText(facts)).not.toContain("crew");
    expect(projectGuardText(facts)).not.toContain("direct");
    expect(projectGuardText(facts)).not.toContain("true");
  });

  it("post-checks the explicit projection without serializing controlled fields", () => {
    expect(
      postMergeGuard("No direct risk phrase.", rawFacts({ userGoal: "Prepare my lawsuit" }))
    ).toMatchObject({ status: "unsupported_high_risk", category: "litigation_strategy" });
    expect(
      postMergeGuard(
        "No direct risk phrase.",
        rawFacts({ incidentType: "hotel_walk", reasonCategory: "crew", wasWalked: true })
      )
    ).toEqual({ status: "pass" });
  });
});
