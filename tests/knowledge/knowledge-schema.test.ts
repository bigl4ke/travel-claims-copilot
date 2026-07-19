import { describe, expect, it } from "vitest";

import policiesJson from "../../data/policies.json";
import scriptsJson from "../../data/scripts.json";
import { createKnowledgeRepository } from "../../lib/knowledge/knowledge-repository";
import { loadKnowledgeSnapshot, productionKnowledgeRaw } from "../../lib/knowledge/load-knowledge";
import { parseKnowledgeSnapshot } from "../../lib/knowledge/knowledge-schema";
import { validateKnowledgeData } from "../../scripts/validate-data";
import {
  invalidKnowledgeFixtures,
  validKnowledgeFixture
} from "../fixtures/knowledge/invalid-records";

const AS_OF = "2026-07-19";

describe("production knowledge", () => {
  it("preserves corrections from the reviewed official source pages", () => {
    const policyById = (policyId: string) =>
      policiesJson.find((policy) => policy.policy_id === policyId);
    const bumping = policyById("dot_bumping_oversales");
    const refunds = policyById("us_dot_automatic_ticket_refunds");
    const flightNormality = policyById("cn_flight_normality_regulation_2016");
    const passengerService = policyById("cn_public_air_transport_passenger_service_2021");
    const euGuidance = policyById("eu261_air_passenger_rights");
    const ukRegulation = policyById("uk261_assimilated_regulation_261_2004");
    const dashboardContext = policyById("dot_airline_cancellation_delay_dashboard");

    expect(dashboardContext?.compensation_or_rights).toEqual([]);
    expect(bumping?.compensation_or_rights).not.toContain("Confirmed alternate transportation");
    expect(refunds?.applicable_conditions.join(" ")).toContain("No alternative is offered");
    expect(flightNormality?.provider).toBe(
      "Ministry of Transport of the People's Republic of China"
    );
    expect(passengerService?.provider).toBe(
      "Ministry of Transport of the People's Republic of China"
    );
    expect(flightNormality?.compensation_or_rights.join(" ")).toContain("at least 2 hours");
    expect(passengerService?.compensation_or_rights.join(" ")).toContain("on passenger request");
    expect(euGuidance?.applicable_conditions.join(" ")).toContain(
      "Iceland, Norway, and Switzerland"
    );
    expect(ukRegulation?.provider).toBe("legislation.gov.uk / The National Archives");
    expect(ukRegulation?.applicable_conditions.join(" ")).toContain(
      "arriving in an EU Member State on a UK air carrier"
    );
  });

  it("gives every script one to eight policy source IDs", () => {
    scriptsJson.forEach((script) => {
      const sourceIds = (script as { script_id: string; source_ids?: unknown }).source_ids;

      expect(sourceIds, `${script.script_id} source_ids`).toBeInstanceOf(Array);
      if (Array.isArray(sourceIds)) {
        expect(sourceIds.length, `${script.script_id} source_ids length`).toBeGreaterThanOrEqual(1);
        expect(sourceIds.length, `${script.script_id} source_ids length`).toBeLessThanOrEqual(8);
      }
    });
  });

  it.each(invalidKnowledgeFixtures)("rejects $name", ({ expected, snapshot }) => {
    expect(() => parseKnowledgeSnapshot(snapshot, { asOf: AS_OF })).toThrow(expected);
  });

  it("does not mistake an explicit denial of synthetic provenance for a synthetic record", () => {
    const snapshot = validKnowledgeFixture();
    snapshot.cases[0].facts = "Synthetic identifiers are not used in this community report.";

    expect(() => parseKnowledgeSnapshot(snapshot, { asOf: AS_OF })).not.toThrow();
  });

  it("parses production snake-case carrier records exactly once", () => {
    const snapshot = parseKnowledgeSnapshot(validKnowledgeFixture(), { asOf: AS_OF });

    expect(snapshot.carrierCommitments[0]).toMatchObject({
      commitmentId: "united_verified_fixture",
      normalizedCarrier: "United",
      applicableCarrierRole: "operating_carrier",
      lastChecked: "2026-07-18"
    });
    expect(snapshot.carrierCommitments[0]?.remedies[0]).toMatchObject({
      remedyId: "us_hotel",
      displayConditions: ["Fixture condition"]
    });
  });

  it("hashes canonical validated content including script source IDs", () => {
    const original = validKnowledgeFixture();
    const reordered = structuredClone(original);
    reordered.policies[0] = Object.fromEntries(Object.entries(reordered.policies[0]).reverse());
    const changedCitation = validKnowledgeFixture();
    changedCitation.scripts[0].source_ids = ["policy_primary"];

    const originalVersion = parseKnowledgeSnapshot(original, { asOf: AS_OF }).version;
    const reorderedVersion = parseKnowledgeSnapshot(reordered, { asOf: AS_OF }).version;
    const changedVersion = parseKnowledgeSnapshot(changedCitation, { asOf: AS_OF }).version;

    expect(originalVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(reorderedVersion).toBe(originalVersion);
    expect(changedVersion).not.toBe(originalVersion);
  });

  it("returns recursively frozen data", () => {
    const snapshot = parseKnowledgeSnapshot(validKnowledgeFixture(), { asOf: AS_OF });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.scripts)).toBe(true);
    expect(Object.isFrozen(snapshot.scripts[0])).toBe(true);
    expect(Object.isFrozen(snapshot.scripts[0]?.source_ids)).toBe(true);
    expect(Object.isFrozen(snapshot.carrierCommitments[0]?.remedies[0]?.predicates)).toBe(true);
  });

  it.each(
    invalidKnowledgeFixtures.filter(({ name }) =>
      [
        "missing script source IDs",
        "empty script source IDs",
        "duplicate script source IDs",
        "unknown script source ID",
        "case ID used as policy source"
      ].includes(name)
    )
  )("keeps runtime and CLI rejection parity for $name", async ({ snapshot }) => {
    let runtimeMessage = "";
    let cliMessage = "";
    try {
      await loadKnowledgeSnapshot({ raw: snapshot, asOf: AS_OF });
    } catch (error) {
      runtimeMessage = error instanceof Error ? error.message : String(error);
    }
    try {
      validateKnowledgeData(snapshot, AS_OF);
    } catch (error) {
      cliMessage = error instanceof Error ? error.message : String(error);
    }

    expect(runtimeMessage).not.toBe("");
    expect(cliMessage).toBe(runtimeMessage);
  });

  it("returns fresh independently frozen snapshots from every repository load", async () => {
    const repository = createKnowledgeRepository({ raw: validKnowledgeFixture(), asOf: AS_OF });

    const first = await repository.load();
    const second = await repository.load();

    expect(second).not.toBe(first);
    expect(second.policies).not.toBe(first.policies);
    expect(second.scripts[0]).not.toBe(first.scripts[0]);
    expect(second.carrierCommitments[0]?.remedies[0]).not.toBe(
      first.carrierCommitments[0]?.remedies[0]
    );
    expect(second.version).toBe(first.version);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("does not expose shared mutable production raw data", () => {
    const first = productionKnowledgeRaw();
    const firstScripts = first.scripts as Array<{ source_ids: string[] }>;
    const originalSourceId = firstScripts[0]?.source_ids[0];
    firstScripts[0].source_ids[0] = "polluted_policy_id";

    const second = productionKnowledgeRaw();
    const secondScripts = second.scripts as Array<{ source_ids: string[] }>;
    expect(second).not.toBe(first);
    expect(secondScripts).not.toBe(firstScripts);
    expect(secondScripts[0]?.source_ids[0]).toBe(originalSourceId);
  });

  it("prevents one loaded snapshot from polluting the next load", async () => {
    const repository = createKnowledgeRepository({ raw: validKnowledgeFixture(), asOf: AS_OF });
    const first = await repository.load();
    const originalSourceId = first.scripts[0]?.source_ids[0];

    expect(() => {
      first.scripts[0].source_ids[0] = "polluted_policy_id";
    }).toThrow(TypeError);

    const second = await repository.load();
    expect(second.scripts[0]?.source_ids[0]).toBe(originalSourceId);
    expect(second.scripts[0]?.source_ids).not.toBe(first.scripts[0]?.source_ids);
  });
});
