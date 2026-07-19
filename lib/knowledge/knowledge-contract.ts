import type { CanonicalIncident } from "../domain/claim-contract";
import type { Case, Controllability, Policy, Script } from "../types";

export type CarrierCommitmentPredicate =
  | {
      kind: "event";
      field: "incidentType";
      operator: "one_of";
      values: Array<"airline_delay" | "airline_cancellation">;
    }
  | {
      kind: "controllability";
      field: "controllability";
      operator: "equals";
      value: "controllable";
    }
  | {
      kind: "minimum_wait_minutes";
      field: "waitMinutes";
      operator: "at_least";
      value: number;
    }
  | {
      kind: "overnight";
      field: "isOvernight";
      operator: "equals";
      value: true;
    };

export type CarrierCommitmentRemedy = {
  remedyId: "us_rerouting" | "us_meal" | "us_hotel" | "us_ground_transport";
  committed: boolean;
  predicates: CarrierCommitmentPredicate[];
  displayConditions: string[];
  rights: string[];
};

export type CarrierCommitment = {
  commitmentId: string;
  normalizedCarrier: string;
  applicableCarrierRole: "operating_carrier";
  sourceTitle: string;
  sourceProvider: string;
  sourceUrl: string;
  sourceType: "official_dashboard" | "official_policy";
  legalRegime: "US_AIRLINE_COMMITMENT";
  authority: "medium";
  lastChecked: string;
  reviewerNote: string;
  remedies: CarrierCommitmentRemedy[];
};

export type KnowledgeSnapshot = {
  policies: readonly Policy[];
  cases: readonly Case[];
  scripts: readonly Script[];
  carrierCommitments: readonly CarrierCommitment[];
  version: string;
};

export interface KnowledgeRepository {
  load(): Promise<KnowledgeSnapshot>;
}

export type PredicateEvaluation = "matched" | "missing" | "excluded";
export type CarrierCommitmentStatus = "supported" | "conditional" | "unavailable";

export type CarrierPredicateFacts = {
  incidentType?: CanonicalIncident | null;
  controllability?: Controllability | null;
  isOvernight?: boolean | null;
  finalArrivalDelayMinutes?: number | null;
};

export type CarrierCommitmentEvaluationInput = {
  normalizedCarrier?: string | null;
  carrierRole?: string | null;
  facts: CarrierPredicateFacts;
  asOf: string;
};

const FRESHNESS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDateEpoch(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const date = new Date(epoch);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return epoch;
}

export function evaluateCarrierCommitmentPredicate(
  predicate: CarrierCommitmentPredicate,
  facts: CarrierPredicateFacts
): PredicateEvaluation {
  if (predicate.kind === "minimum_wait_minutes") return "missing";
  if (predicate.kind === "event") {
    if (!facts.incidentType) return "missing";
    return predicate.values.includes(facts.incidentType as "airline_delay" | "airline_cancellation")
      ? "matched"
      : "excluded";
  }
  if (predicate.kind === "controllability") {
    if (!facts.controllability || facts.controllability === "unknown") return "missing";
    return facts.controllability === predicate.value ? "matched" : "excluded";
  }
  if (facts.isOvernight === null || facts.isOvernight === undefined) return "missing";
  return facts.isOvernight === predicate.value ? "matched" : "excluded";
}

export function evaluateCarrierCommitmentPredicates(
  predicates: readonly CarrierCommitmentPredicate[],
  facts: CarrierPredicateFacts
): CarrierCommitmentStatus {
  if (predicates.length === 0) return "conditional";
  const results = predicates.map((predicate) =>
    evaluateCarrierCommitmentPredicate(predicate, facts)
  );
  if (results.includes("excluded")) return "unavailable";
  if (results.includes("missing")) return "conditional";
  return "supported";
}

export function evaluateCarrierCommitment(
  commitment: CarrierCommitment,
  remedyId: CarrierCommitmentRemedy["remedyId"],
  input: CarrierCommitmentEvaluationInput
): CarrierCommitmentStatus {
  const remedy = commitment.remedies.find((candidate) => candidate.remedyId === remedyId);
  if (!remedy || !remedy.committed) return "unavailable";

  if (!input.normalizedCarrier) return "conditional";
  if (input.normalizedCarrier !== commitment.normalizedCarrier) return "unavailable";
  if (!input.carrierRole) return "conditional";
  if (input.carrierRole !== commitment.applicableCarrierRole) return "unavailable";

  const asOfEpoch = calendarDateEpoch(input.asOf);
  const checkedEpoch = calendarDateEpoch(commitment.lastChecked);
  if (
    asOfEpoch === null ||
    checkedEpoch === null ||
    checkedEpoch > asOfEpoch ||
    (asOfEpoch - checkedEpoch) / DAY_MS > FRESHNESS_DAYS
  ) {
    return "conditional";
  }

  const hasEvent = remedy.predicates.some((predicate) => predicate.kind === "event");
  const hasControllability = remedy.predicates.some(
    (predicate) => predicate.kind === "controllability"
  );
  if (!hasEvent || !hasControllability) return "conditional";

  return evaluateCarrierCommitmentPredicates(remedy.predicates, input.facts);
}
