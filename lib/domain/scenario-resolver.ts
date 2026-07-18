import type {
  RawFactPath,
  ResolvedContextWithoutScenarios,
  ScenarioDecision,
  ScenarioId,
  ScenarioResolution
} from "./claim-contract";

function activeDecision(scenarioId: ScenarioId): ScenarioDecision {
  return {
    scenarioId,
    status: "active",
    reasons: ["admission_rule_matched"],
    missingFacts: []
  };
}

function unresolvedDecision(scenarioId: ScenarioId, missingFacts: RawFactPath[]): ScenarioDecision {
  if (missingFacts.length === 0) throw new Error("unresolved_scenario_requires_missing_fact");
  return {
    scenarioId,
    status: "unresolved",
    reasons: ["parallel_scenario_admission_unknown"],
    missingFacts: [...new Set(missingFacts)]
  };
}

function unresolvedParallelScenarios(
  active: ScenarioDecision[],
  unresolved: ScenarioDecision[]
): ScenarioResolution {
  const missingFacts = [...new Set(unresolved.flatMap((decision) => decision.missingFacts))];
  return {
    status: "needs_information",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [...active, ...unresolved],
    missingFacts
  };
}

function resolved(scenarioIds: ScenarioId[]): ScenarioResolution {
  if (scenarioIds.length === 0) throw new Error("resolved_scenario_set_cannot_be_empty");
  return {
    status: "resolved",
    scenarioIds,
    primaryScenario: scenarioIds[0],
    decisions: scenarioIds.map(activeDecision),
    missingFacts: []
  };
}

function needsInformation(scenarioId: ScenarioId, paths: RawFactPath[]): ScenarioResolution {
  const missingFacts = [...new Set(paths)];
  return {
    status: "needs_information",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [
      {
        scenarioId,
        status: "unresolved",
        reasons: ["required_admission_fact_missing"],
        missingFacts
      }
    ],
    missingFacts
  };
}

function outOfScope(scenarioId: ScenarioId): ScenarioResolution {
  return {
    status: "out_of_scope",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [
      {
        scenarioId,
        status: "excluded",
        reasons: ["admission_rule_not_matched"],
        missingFacts: []
      }
    ],
    missingFacts: []
  };
}

function missingRouteOrCarrierPaths(input: ResolvedContextWithoutScenarios): RawFactPath[] {
  const paths: RawFactPath[] = [];
  if (input.jurisdiction.originRegion.value === null) paths.push("origin.airport");
  if (input.jurisdiction.destinationRegion.value === null) paths.push("destination.airport");
  if (
    (input.jurisdiction.eu261.value === "unknown" ||
      input.jurisdiction.uk261.value === "unknown") &&
    input.jurisdiction.operatingCarrierRegion.value === null
  ) {
    paths.push("operatingCarrier");
  }
  return [...new Set(paths)];
}

function missingUsRoutePaths(input: ResolvedContextWithoutScenarios): RawFactPath[] {
  const paths: RawFactPath[] = [];
  if (input.jurisdiction.originRegion.value === null) paths.push("origin.airport");
  if (input.jurisdiction.destinationRegion.value === null) paths.push("destination.airport");
  return paths;
}

export function resolveScenarioSet(input: ResolvedContextWithoutScenarios): ScenarioResolution {
  const facts = input.resolutionFacts;
  const originRegion = input.jurisdiction.originRegion.value;
  const destinationRegion = input.jurisdiction.destinationRegion.value;
  const decisions: ScenarioDecision[] = [];

  if (facts.incidentType === "hotel_walk") {
    if (!facts.provider && !facts.brandOrProperty) {
      return needsInformation("marriott_hotel_walk", ["provider"]);
    }
    if (input.normalizedProvider.value !== "Marriott") {
      return outOfScope("marriott_hotel_walk");
    }
    const admissionCandidates: Array<RawFactPath | null> = [
      facts.confirmedHotelReservation === null ? "confirmedHotelReservation" : null,
      facts.wasWalked === null ? "wasWalked" : null
    ];
    const admissionMissing = admissionCandidates.filter(
      (path): path is RawFactPath => path !== null
    );
    if (admissionMissing.length > 0) {
      return needsInformation("marriott_hotel_walk", admissionMissing);
    }
    if (!facts.confirmedHotelReservation || !facts.wasWalked) {
      return outOfScope("marriott_hotel_walk");
    }
    return resolved(["marriott_hotel_walk"]);
  }

  if (facts.incidentType === "denied_boarding") {
    if (originRegion === null) {
      return needsInformation("us_denied_boarding", ["origin.airport"]);
    }
    return originRegion === "US"
      ? resolved(["us_denied_boarding"])
      : outOfScope("us_denied_boarding");
  }

  if (facts.incidentType !== "airline_delay" && facts.incidentType !== "airline_cancellation") {
    return needsInformation("us_airline_disruption", ["incidentType"]);
  }

  const euUkActive =
    input.jurisdiction.eu261.value === "applies" || input.jurisdiction.uk261.value === "applies";
  const usActive = originRegion === "US" || destinationRegion === "US";
  if (euUkActive) decisions.push(activeDecision("eu_uk_air_disruption"));
  if (usActive) decisions.push(activeDecision("us_airline_disruption"));

  const unresolvedDecisions: ScenarioDecision[] = [];
  if (
    !euUkActive &&
    (input.jurisdiction.eu261.value === "unknown" || input.jurisdiction.uk261.value === "unknown")
  ) {
    unresolvedDecisions.push(
      unresolvedDecision("eu_uk_air_disruption", missingRouteOrCarrierPaths(input))
    );
  }
  if (!usActive && (originRegion === null || destinationRegion === null)) {
    unresolvedDecisions.push(
      unresolvedDecision("us_airline_disruption", missingUsRoutePaths(input))
    );
  }
  if (unresolvedDecisions.length > 0) {
    return unresolvedParallelScenarios(decisions, unresolvedDecisions);
  }
  if (decisions.length > 0) {
    const scenarioIds = decisions.map((decision) => decision.scenarioId);
    return {
      status: "resolved",
      scenarioIds,
      primaryScenario: scenarioIds[0],
      decisions,
      missingFacts: []
    };
  }
  return outOfScope("us_airline_disruption");
}
