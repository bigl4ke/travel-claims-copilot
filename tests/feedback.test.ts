import { describe, expect, it, vi } from "vitest";

import {
  createFeedbackRecord,
  downloadFeedback,
  serializeFeedback,
  type FeedbackDraft,
  type FeedbackRecord
} from "../lib/feedback";

const createdAt = "2026-07-18T12:00:00.000Z";
const allowedFactPaths = new Set(["operatingCarrier"] as const);
const allowedSourceIds = new Set(["eu261_regulation_261_2004"]);

function record(draft: FeedbackDraft = { kind: "helpful" }): FeedbackRecord {
  return createFeedbackRecord(
    {
      draft,
      factsRevision: 4,
      scenarioIds: ["eu_uk_air_disruption"],
      feedbackId: "feedback-1",
      createdAt
    },
    { allowedFactPaths, allowedSourceIds }
  );
}

function downloadHarness() {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn()
  };
  const append = vi.fn();
  const documentRef = {
    createElement: vi.fn(() => anchor),
    body: { append }
  } as unknown as Document;
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:feedback-test");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  return { anchor, append, createObjectURL, documentRef, revokeObjectURL };
}

describe("private feedback records", () => {
  it("serializes bounded feedback without narrative, facts, or credentials", () => {
    const feedback = record({
      kind: "source_mismatch",
      sourceIds: ["eu261_regulation_261_2004"]
    });
    const json = serializeFeedback([feedback]);

    expect(json).toContain("source_mismatch");
    ["message", "rawFacts", "accessCode", "ticketNumber"].forEach((forbidden) => {
      expect(json).not.toContain(forbidden);
    });
    expect(json.endsWith("\n")).toBe(true);
  });

  it("copies, brands, and deeply freezes factory output without exporting the symbol", () => {
    const factPaths = ["operatingCarrier"] as Array<"operatingCarrier">;
    const scenarioIds = ["eu_uk_air_disruption"] as Array<"eu_uk_air_disruption">;
    const feedback = createFeedbackRecord(
      {
        draft: { kind: "fact_error", factPaths: [...factPaths] },
        factsRevision: 2,
        scenarioIds: [...scenarioIds],
        feedbackId: "feedback-frozen",
        createdAt
      },
      { allowedFactPaths, allowedSourceIds }
    );

    expect(Object.isFrozen(feedback)).toBe(true);
    expect(Object.isFrozen(feedback.scenarioIds)).toBe(true);
    expect(Object.isFrozen(feedback.feedback)).toBe(true);
    expect(
      Object.isFrozen(feedback.feedback.kind === "fact_error" && feedback.feedback.factPaths)
    ).toBe(true);
    expect(Object.getOwnPropertySymbols(feedback)).toHaveLength(1);
    expect(serializeFeedback([feedback])).not.toContain("validated-feedback-record");
    factPaths.length = 0;
    scenarioIds.length = 0;
    expect(feedback.scenarioIds).toEqual(["eu_uk_air_disruption"]);
    expect(feedback.feedback).toEqual({ kind: "fact_error", factPaths: ["operatingCarrier"] });
  });

  it("preserves the factory's historical allowlist decision without a mutable registry", () => {
    const dynamicSources = new Set(["eu261_regulation_261_2004"]);
    const feedback = createFeedbackRecord(
      {
        draft: { kind: "source_mismatch", sourceIds: ["eu261_regulation_261_2004"] },
        factsRevision: 1,
        scenarioIds: ["eu_uk_air_disruption"],
        feedbackId: "feedback-history",
        createdAt
      },
      { allowedFactPaths, allowedSourceIds: dynamicSources }
    );
    dynamicSources.clear();

    expect(serializeFeedback([feedback])).toContain("eu261_regulation_261_2004");
  });

  it("rejects more than twenty selections", () => {
    const sourceIds = Array.from({ length: 21 }, (_value, index) => `source-${index + 1}`);
    expect(() =>
      createFeedbackRecord(
        {
          draft: { kind: "source_mismatch", sourceIds },
          factsRevision: 1,
          scenarioIds: ["us_airline_disruption"],
          feedbackId: "feedback-too-many",
          createdAt
        },
        { allowedFactPaths, allowedSourceIds: new Set(sourceIds) }
      )
    ).toThrow("invalid_feedback_record");
  });

  it.each([
    ["negative revision", { factsRevision: -1 }],
    ["non-integer revision", { factsRevision: 1.5 }],
    ["unknown scenario", { scenarioIds: ["insurance_claim"] }],
    ["unsafe feedback id", { feedbackId: "feedback with spaces" }],
    ["invalid date", { createdAt: "yesterday" }]
  ])("rejects %s", (_name, override) => {
    expect(() =>
      createFeedbackRecord(
        {
          draft: { kind: "helpful" },
          factsRevision: 1,
          scenarioIds: ["us_airline_disruption"],
          feedbackId: "feedback-1",
          createdAt,
          ...override
        } as Parameters<typeof createFeedbackRecord>[0],
        { allowedFactPaths, allowedSourceIds }
      )
    ).toThrow("invalid_feedback_record");
  });

  it.each([
    ["empty fact selection", { kind: "fact_error", factPaths: [] }],
    [
      "duplicate fact selection",
      { kind: "fact_error", factPaths: ["operatingCarrier", "operatingCarrier"] }
    ],
    ["disallowed fact selection", { kind: "fact_error", factPaths: ["origin.airport"] }],
    ["empty source selection", { kind: "source_mismatch", sourceIds: [] }],
    [
      "duplicate source selection",
      {
        kind: "source_mismatch",
        sourceIds: ["eu261_regulation_261_2004", "eu261_regulation_261_2004"]
      }
    ],
    ["disallowed source selection", { kind: "source_mismatch", sourceIds: ["unknown-source"] }],
    ["oversized source id", { kind: "source_mismatch", sourceIds: ["a".repeat(129)] }],
    ["unknown draft key", { kind: "helpful", sourceIds: ["eu261_regulation_261_2004"] }]
  ])("rejects %s", (_name, draft) => {
    expect(() =>
      createFeedbackRecord(
        {
          draft: draft as FeedbackDraft,
          factsRevision: 1,
          scenarioIds: ["eu_uk_air_disruption"],
          feedbackId: "feedback-invalid",
          createdAt
        },
        { allowedFactPaths, allowedSourceIds }
      )
    ).toThrow("invalid_feedback_record");
  });

  it("rejects a structural lookalike during serialization and download", () => {
    const lookalike = {
      schemaVersion: 1,
      feedbackId: "feedback-lookalike",
      createdAt,
      factsRevision: 1,
      scenarioIds: ["eu_uk_air_disruption"],
      feedback: { kind: "helpful" }
    } as unknown as FeedbackRecord;
    const harness = downloadHarness();

    expect(() => serializeFeedback([lookalike])).toThrow("unvalidated_feedback_record");
    expect(() => downloadFeedback([lookalike], harness.documentRef)).toThrow(
      "unvalidated_feedback_record"
    );
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("feedback download", () => {
  it("downloads JSON explicitly, cleans the anchor, and revokes the object URL", async () => {
    const harness = downloadHarness();

    downloadFeedback([record()], harness.documentRef);

    expect(harness.documentRef.createElement).toHaveBeenCalledWith("a");
    expect(harness.createObjectURL).toHaveBeenCalledOnce();
    const blob = harness.createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("feedback_blob_missing");
    expect(blob.type).toBe("application/json");
    expect(harness.anchor.download).toBe("travel-claims-feedback.json");
    expect(harness.append).toHaveBeenCalledWith(harness.anchor);
    expect(harness.anchor.click).toHaveBeenCalledOnce();
    expect(harness.anchor.remove).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    expect(harness.revokeObjectURL).toHaveBeenCalledWith("blob:feedback-test");
  });
});
