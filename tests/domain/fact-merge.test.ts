import { describe, expect, it } from "vitest";

import type { RawFactPath } from "../../lib/domain/claim-contract";
import { mergeRawFacts } from "../../lib/domain/fact-merge";
import {
  buildResolutionFacts,
  parseRawFactPatch,
  rawFactPatchJsonSchema
} from "../../lib/domain/raw-fact-schema";
import { claimState } from "../fixtures/raw-claims";

describe("strict raw fact patches", () => {
  it("publishes a sparse raw-only schema for every allowlisted path", () => {
    const setSchema = rawFactPatchJsonSchema.properties.set;

    expect(rawFactPatchJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["set"]
    });
    expect(setSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(Object.keys(setSchema.properties)).toHaveLength(50);
    expect(Object.keys(setSchema.properties)).not.toEqual(
      expect.arrayContaining([
        "region",
        "origin.region",
        "operatingCarrierRegion",
        "legalRegime",
        "controllability",
        "scenarioId",
        "issueType"
      ])
    );
  });

  it("parses sparse null, false, zero, and cloned bounded arrays without mutation", () => {
    const expenses = [" taxi ", "taxi", "meal"];
    const input = {
      set: {
        provider: "  Air France  ",
        finalArrivalDelayMinutes: 0,
        isOvernight: false,
        deniedBoardingKind: null,
        expenses
      }
    };

    const parsed = parseRawFactPatch(input);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data).toEqual({
      set: {
        provider: "Air France",
        finalArrivalDelayMinutes: 0,
        isOvernight: false,
        deniedBoardingKind: null,
        expenses: ["taxi", "meal"]
      }
    });
    expect(parsed.data.set.expenses).not.toBe(expenses);
    expect(expenses).toEqual([" taxi ", "taxi", "meal"]);
  });

  it.each([
    ["unknown path", { set: { mystery: "value" } }],
    ["derived region", { set: { "origin.region": "EU_EEA_CH" } }],
    ["derived carrier region", { set: { operatingCarrierRegion: "EU_EEA_CH" } }],
    ["derived legal regime", { set: { legalRegime: "EU261" } }],
    ["derived controllability", { set: { controllability: "controllable" } }],
    ["derived scenario", { set: { scenarioId: "eu_uk_air_disruption" } }],
    ["legacy complete-object field", { set: { issueType: "airline_delay" } }],
    ["extra top-level field", { set: {}, narrative: "ignored?" }],
    ["missing set", {}]
  ])("rejects %s", (_label, value) => {
    expect(parseRawFactPatch(value).success).toBe(false);
  });

  it("rejects invalid values using the path's actual type", () => {
    const parsed = parseRawFactPatch({
      set: {
        incidentType: "baggage_delay",
        finalArrivalDelayMinutes: -1,
        isOvernight: "false",
        evidence: ["valid", 42]
      }
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid patch");
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("incidentType"),
        expect.stringContaining("finalArrivalDelayMinutes"),
        expect.stringContaining("isOvernight"),
        expect.stringContaining("evidence")
      ])
    );
  });
});

describe("revisioned raw fact merge", () => {
  it("uses explicit clear but treats model null as no update", () => {
    const prior = claimState({ deniedBoardingKind: "voluntary", finalArrivalDelayMinutes: 240 }, 3);
    const result = mergeRawFacts({
      prior,
      correction: { set: {}, clear: ["deniedBoardingKind"] },
      deterministicPatch: { set: { finalArrivalDelayMinutes: null } },
      openaiPatch: { set: { deniedBoardingKind: null } },
      baseRevision: 3
    });

    expect(result.state.facts.deniedBoardingKind).toBeNull();
    expect(result.state.facts.finalArrivalDelayMinutes).toBe(240);
    expect(result.state.revision).toBe(4);
    expect(result.baseRevision).toBe(3);
    expect(result.changedFields).toEqual(["deniedBoardingKind"]);
    expect(result.state.provenance.deniedBoardingKind).toEqual({
      source: "user_correction",
      factsRevision: 4
    });
  });

  it("marks conflicting current-turn candidates unresolved without erasing an old value", () => {
    const result = mergeRawFacts({
      prior: claimState({ deniedBoardingKind: "voluntary" }),
      deterministicPatch: { set: { deniedBoardingKind: "voluntary" } },
      openaiPatch: { set: { deniedBoardingKind: "involuntary" } },
      baseRevision: 0
    });

    expect(result.conflicts).toEqual([
      {
        field: "deniedBoardingKind",
        candidates: [
          { value: "voluntary", source: "deterministic_extraction" },
          { value: "involuntary", source: "openai_extraction" }
        ]
      }
    ]);
    expect(result.unresolvedFields).toContain("deniedBoardingKind");
    expect(result.state.facts.deniedBoardingKind).toBe("voluntary");
    expect(buildResolutionFacts(result.state).deniedBoardingKind).toBeNull();
    expect(result.state.revision).toBe(1);
  });

  it("lets a Paris-to-London user correction win over both extractors", () => {
    const result = mergeRawFacts({
      prior: claimState(
        {
          origin: { city: "Paris", airport: "CDG", country: "France" },
          destination: { city: "New York", airport: "JFK", country: "United States" }
        },
        8
      ),
      correction: {
        set: {
          "destination.city": "London",
          "destination.airport": "LHR",
          "destination.country": "United Kingdom"
        },
        clear: []
      },
      deterministicPatch: {
        set: { "destination.city": "Paris", "destination.airport": "CDG" }
      },
      openaiPatch: {
        set: { "destination.city": "New York", "destination.airport": "JFK" }
      },
      baseRevision: 8
    });

    expect(result.state.facts.destination).toEqual({
      city: "London",
      airport: "LHR",
      country: "United Kingdom"
    });
    expect(result.changedFields).toEqual([
      "destination.city",
      "destination.airport",
      "destination.country"
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("accepts agreeing candidates once and preserves false, zero, and cloned arrays", () => {
    const expenses = ["taxi"];
    const evidence = ["receipt"];
    const result = mergeRawFacts({
      prior: claimState({ userGoal: "refund" }, 2),
      deterministicPatch: {
        set: {
          finalArrivalDelayMinutes: 0,
          isOvernight: false,
          expenses,
          evidence
        }
      },
      openaiPatch: {
        set: { finalArrivalDelayMinutes: 0, isOvernight: false, expenses: ["taxi"] }
      },
      baseRevision: 2
    });

    expect(result.state.facts).toMatchObject({
      finalArrivalDelayMinutes: 0,
      isOvernight: false,
      expenses: ["taxi"],
      evidence: ["receipt"],
      userGoal: "refund"
    });
    expect(result.state.facts.expenses).not.toBe(expenses);
    expect(result.state.facts.evidence).not.toBe(evidence);
    expect(result.state.revision).toBe(3);
    expect(result.changedFields).toEqual([
      "finalArrivalDelayMinutes",
      "isOvernight",
      "expenses",
      "evidence"
    ]);
  });

  it("preserves untouched facts, provenance, conflicts, unresolved fields, and arrays", () => {
    const prior = claimState(
      {
        expenses: ["meal"],
        evidence: ["email"],
        userGoal: "cash refund",
        deniedBoardingKind: "voluntary"
      },
      4,
      {
        provenance: {
          deniedBoardingKind: { source: "user_message", factsRevision: 3 }
        },
        conflicts: [
          {
            field: "deniedBoardingKind",
            candidates: [
              { value: "voluntary", source: "deterministic_extraction" },
              { value: "involuntary", source: "openai_extraction" }
            ]
          }
        ],
        unresolvedFields: ["deniedBoardingKind"]
      }
    );

    const result = mergeRawFacts({
      prior,
      deterministicPatch: { set: { provider: "Delta" } },
      baseRevision: 4
    });

    expect(result.state.facts.expenses).toEqual(["meal"]);
    expect(result.state.facts.evidence).toEqual(["email"]);
    expect(result.state.facts.userGoal).toBe("cash refund");
    expect(result.state.provenance.deniedBoardingKind).toEqual(prior.provenance.deniedBoardingKind);
    expect(result.state.conflicts).toEqual(prior.conflicts);
    expect(result.state.unresolvedFields).toEqual(prior.unresolvedFields);
  });

  it("rejects a stale base revision before changing prior state", () => {
    const prior = claimState({ provider: "United" }, 5);
    const before = structuredClone(prior);

    expect(() =>
      mergeRawFacts({
        prior,
        deterministicPatch: { set: { provider: "Delta" } },
        baseRevision: 4
      })
    ).toThrowError("stale_base_revision");
    expect(prior).toEqual(before);
  });

  it("counts same-value sets and empty clears as accepted edits but skips null-only turns", () => {
    const sameValue = mergeRawFacts({
      prior: claimState({ provider: "United" }, 1),
      deterministicPatch: { set: { provider: "United" } },
      baseRevision: 1
    });
    const emptyArrayClear = mergeRawFacts({
      prior: claimState({ expenses: [] }, 1),
      correction: { set: {}, clear: ["expenses"] },
      deterministicPatch: { set: {} },
      baseRevision: 1
    });
    const nullOnly = mergeRawFacts({
      prior: claimState({ provider: "United" }, 1),
      deterministicPatch: { set: { provider: null } },
      openaiPatch: { set: { finalArrivalDelayMinutes: null } },
      baseRevision: 1
    });

    expect(sameValue.state.revision).toBe(2);
    expect(sameValue.changedFields).toEqual(["provider"]);
    expect(emptyArrayClear.state.revision).toBe(2);
    expect(emptyArrayClear.state.facts.expenses).toEqual([]);
    expect(nullOnly.state.revision).toBe(1);
    expect(nullOnly.changedFields).toEqual([]);
  });

  it.each([
    [
      "a null user set",
      {
        set: { provider: null },
        clear: []
      }
    ],
    [
      "duplicate clears",
      {
        set: {},
        clear: ["provider", "provider"]
      }
    ],
    [
      "set-clear overlap",
      {
        set: { provider: "United" },
        clear: ["provider"]
      }
    ],
    [
      "an unknown clear path",
      {
        set: {},
        clear: ["origin.region"]
      }
    ]
  ])("rejects %s", (_label, correction) => {
    expect(() =>
      mergeRawFacts({
        prior: claimState(),
        correction: correction as never,
        deterministicPatch: { set: {} },
        baseRevision: 0
      })
    ).toThrow();
  });

  it("fails closed on unknown patch keys when callers bypass the parser", () => {
    expect(() =>
      mergeRawFacts({
        prior: claimState(),
        deterministicPatch: { set: { "origin.region": "EU_EEA_CH" } } as never,
        baseRevision: 0
      })
    ).toThrowError("invalid_raw_fact_path");
  });

  it("fails closed on unknown UserFactEdit keys when callers bypass the parser", () => {
    expect(() =>
      mergeRawFacts({
        prior: claimState(),
        correction: {
          set: { provider: "Delta" },
          clear: [],
          derivedOverride: true
        } as never,
        deterministicPatch: { set: {} },
        baseRevision: 0
      })
    ).toThrowError("invalid_user_fact_edit");
  });

  it("accepts current single-candidate evidence over a prior 20-minute value", () => {
    const result = mergeRawFacts({
      prior: claimState({ finalArrivalDelayMinutes: 20 }, 4),
      deterministicPatch: { set: { finalArrivalDelayMinutes: 240 } },
      baseRevision: 4
    });

    expect(result.state.facts.finalArrivalDelayMinutes).toBe(240);
    expect(result.state.revision).toBe(5);
    expect(result.changedFields).toEqual(["finalArrivalDelayMinutes"]);
    expect(result.state.provenance.finalArrivalDelayMinutes).toEqual({
      source: "deterministic_extraction",
      factsRevision: 5
    });
  });

  it("does not share mutable conflict or unresolved arrays across result views", () => {
    const result = mergeRawFacts({
      prior: claimState({ provider: "United" }),
      deterministicPatch: { set: { provider: "Delta" } },
      openaiPatch: { set: { provider: "Air France" } },
      baseRevision: 0
    });

    expect(result.conflicts).not.toBe(result.state.conflicts);
    expect(result.unresolvedFields).not.toBe(result.state.unresolvedFields);
    result.conflicts.splice(0);
    result.unresolvedFields.splice(0);
    expect(result.state.conflicts).toHaveLength(1);
    expect(result.state.unresolvedFields).toEqual(["provider"]);
  });

  it("preserves a conflict across a stateless JSON round trip and unrelated turn", () => {
    const turnOne = mergeRawFacts({
      prior: claimState({ deniedBoardingKind: "voluntary" }, 6),
      deterministicPatch: { set: { deniedBoardingKind: "voluntary" } },
      openaiPatch: { set: { deniedBoardingKind: "involuntary" } },
      baseRevision: 6
    });
    const prior = JSON.parse(JSON.stringify(turnOne.state)) as typeof turnOne.state;
    const serializedConflict = JSON.stringify(prior.conflicts);

    const turnTwo = mergeRawFacts({
      prior,
      deterministicPatch: { set: { provider: "Delta" } },
      baseRevision: 7
    });

    expect(JSON.stringify(turnTwo.state.conflicts)).toBe(serializedConflict);
    expect(turnTwo.state.unresolvedFields).toContain("deniedBoardingKind");
    expect(turnTwo.state.facts.deniedBoardingKind).toBe("voluntary");
    expect(buildResolutionFacts(turnTwo.state).deniedBoardingKind).toBeNull();
  });

  it("resolves an old conflict with either an explicit correction or one later candidate", () => {
    const conflicted = claimState({ deniedBoardingKind: "voluntary" }, 2, {
      conflicts: [
        {
          field: "deniedBoardingKind",
          candidates: [
            { value: "voluntary", source: "deterministic_extraction" },
            { value: "involuntary", source: "openai_extraction" }
          ]
        }
      ],
      unresolvedFields: ["deniedBoardingKind"]
    });
    const corrected = mergeRawFacts({
      prior: conflicted,
      correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] },
      deterministicPatch: { set: {} },
      baseRevision: 2
    });
    const extracted = mergeRawFacts({
      prior: conflicted,
      deterministicPatch: { set: { deniedBoardingKind: "involuntary" } },
      baseRevision: 2
    });

    [corrected, extracted].forEach((result) => {
      expect(result.state.facts.deniedBoardingKind).toBe("involuntary");
      expect(result.conflicts).toEqual([]);
      expect(result.unresolvedFields).not.toContain("deniedBoardingKind");
    });
  });

  it("replaces an old conflict with fresh current-turn candidates", () => {
    const result = mergeRawFacts({
      prior: claimState({ provider: "United" }, 3, {
        conflicts: [
          {
            field: "provider",
            candidates: [
              { value: "United", source: "deterministic_extraction" },
              { value: "Delta", source: "openai_extraction" }
            ]
          }
        ],
        unresolvedFields: ["provider"]
      }),
      deterministicPatch: { set: { provider: "Air France" } },
      openaiPatch: { set: { provider: "KLM" } },
      baseRevision: 3
    });

    expect(result.conflicts).toEqual([
      {
        field: "provider",
        candidates: [
          { value: "Air France", source: "deterministic_extraction" },
          { value: "KLM", source: "openai_extraction" }
        ]
      }
    ]);
    expect(result.state.facts.provider).toBe("United");
  });

  it("orders changed and unresolved paths by RAW_FACT_PATHS", () => {
    const result = mergeRawFacts({
      prior: claimState({}, 0, {
        unresolvedFields: ["evidence", "provider"] as RawFactPath[]
      }),
      deterministicPatch: {
        set: { evidence: ["email"], "origin.airport": "JFK", provider: "United" }
      },
      baseRevision: 0
    });

    expect(result.changedFields).toEqual(["provider", "origin.airport", "evidence"]);
    expect(result.unresolvedFields).toEqual([]);
  });

  it("does not mutate prior state, patches, correction, or nested string arrays", () => {
    const prior = claimState({ expenses: ["meal"] }, 2, {
      conflicts: [
        {
          field: "provider",
          candidates: [
            { value: "United", source: "deterministic_extraction" },
            { value: "Delta", source: "openai_extraction" }
          ]
        }
      ],
      unresolvedFields: ["provider"]
    });
    const correction = { set: { expenses: ["taxi"] }, clear: ["provider"] } as const;
    const deterministicPatch = { set: { evidence: ["email"] } };
    const openaiPatch = { set: { evidence: ["email"] } };
    const inputsBefore = structuredClone({ prior, correction, deterministicPatch, openaiPatch });

    const result = mergeRawFacts({
      prior,
      correction: correction as never,
      deterministicPatch,
      openaiPatch,
      baseRevision: 2
    });

    expect({ prior, correction, deterministicPatch, openaiPatch }).toEqual(inputsBefore);
    expect(result.state).not.toBe(prior);
    expect(result.state.facts).not.toBe(prior.facts);
    expect(result.state.facts.expenses).not.toBe(correction.set.expenses);
    expect(result.state.facts.evidence).not.toBe(deterministicPatch.set.evidence);
  });
});
