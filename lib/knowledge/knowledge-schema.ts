import { createHash } from "node:crypto";

import { findProviderMatch } from "../provider";
import type { Case, Policy, Script } from "../types";
import { caseSourceDisclosureError } from "./case-source-disclosure";
import type {
  CarrierCommitment,
  CarrierCommitmentPredicate,
  CarrierCommitmentRemedy,
  KnowledgeSnapshot
} from "./knowledge-contract";

type JsonObject = Record<string, unknown>;

export type RawKnowledgeSnapshot = {
  policies: unknown;
  cases: unknown;
  scripts: unknown;
  carrierCommitments: unknown;
};

export type ParseKnowledgeOptions = {
  asOf: string;
};

const MVP_INCIDENTS = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding"
] as const;
const CASE_INCIDENTS = [
  ...MVP_INCIDENTS,
  "baggage_delay",
  "airline_delay_trip_insurance",
  "airline_baggage_not_checked",
  "airline_rebooking_mixed_carrier_delay",
  "hotel_billing_dispute",
  "hotel_service_issue",
  "hotel_property_loss",
  "hotel_relocation_before_opening",
  "hotel_room_feature_mismatch",
  "hotel_elite_benefit_closure"
] as const;
const LEGACY_LEGAL_CASE_LABELS = [
  "controllable_airline_delay",
  "controllable_airline_cancellation",
  "eu261_delay_or_cancellation"
] as const;
const POLICY_REGIONS = ["EU_EEA_CH", "UK", "US", "CA", "AU", "CN", "other", "global"] as const;
const LEGAL_REGIMES = [
  "provider_policy",
  "EU261",
  "UK261",
  "US_DOT_REFUND",
  "US_DOT_DENIED_BOARDING",
  "US_AIRLINE_COMMITMENT",
  "CA_APPR",
  "AU_ACL",
  "CN_FLIGHT_REGULATION"
] as const;
const APPLICABILITY_RULES = [
  "any_route",
  "listed_provider",
  "origin_region",
  "origin_or_destination_region",
  "eu261_route",
  "uk261_route",
  "australia_consumer_law",
  "china_flight_regulation"
] as const;
const CONTROLLABILITY = ["controllable", "uncontrollable", "unknown", "any"] as const;
const POLICY_SOURCE_TYPES = [
  "official_policy",
  "government_regulation",
  "regulator_guidance",
  "official_dashboard",
  "terms"
] as const;
const REMEDY_IDS = ["us_rerouting", "us_meal", "us_hotel", "us_ground_transport"] as const;
const FRESHNESS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringValue(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`${label} must be a${allowEmpty ? "" : " non-empty"} string.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} has invalid value: ${String(value)}.`);
  }
  return value as T;
}

function stringArray(value: unknown, label: string): string[] {
  return arrayValue(value, label).map((item, index) => stringValue(item, `${label}[${index}]`));
}

function requireFields(record: JsonObject, fields: readonly string[], label: string): void {
  fields.forEach((field) => {
    if (!(field in record)) throw new Error(`${label} is missing required field ${field}.`);
  });
}

function requireUnique(records: JsonObject[], field: string, label: string): void {
  const seen = new Set<string>();
  records.forEach((record) => {
    const value = stringValue(record[field], `${label}.${field}`);
    if (seen.has(value)) throw new Error(`${label} has duplicate ${field}: ${value}.`);
    seen.add(value);
  });
}

function parseCalendarDate(value: unknown, label: string): { value: string; epoch: number } {
  const text = stringValue(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
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
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return { value: text, epoch };
}

function validateCheckedDate(
  value: unknown,
  label: string,
  asOfEpoch: number,
  critical: boolean
): string {
  const checked = parseCalendarDate(value, label);
  if (checked.epoch > asOfEpoch) throw new Error(`${label} cannot be in the future.`);
  if (critical && (asOfEpoch - checked.epoch) / DAY_MS > FRESHNESS_DAYS) {
    throw new Error(`${label} is stale; critical sources must be reviewed within 30 days.`);
  }
  return checked.value;
}

function validateHttps(value: unknown, label: string): string {
  const text = stringValue(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must be an HTTPS URL.`);
  return text;
}

function parsePolicies(value: unknown, asOfEpoch: number): Policy[] {
  const records = arrayValue(value, "policies").map((item, index) =>
    objectValue(item, `policy[${index}]`)
  );
  requireUnique(records, "policy_id", "policies");
  return records.map((record) => {
    const label = `policy ${String(record.policy_id ?? "<unknown>")}`;
    requireFields(
      record,
      [
        "policy_id",
        "provider_type",
        "provider",
        "policy_name",
        "legal_regime",
        "applicability_rule",
        "incident_types",
        "applicable_regions",
        "applicable_providers",
        "required_controllability",
        "source_url",
        "source_type",
        "authority_level",
        "applicable_conditions",
        "compensation_or_rights",
        "summary",
        "last_checked"
      ],
      label
    );
    stringValue(record.policy_id, `${label}.policy_id`);
    enumValue(
      record.provider_type,
      ["hotel", "airline", "credit_card", "ota", "government"],
      `${label}.provider_type`
    );
    stringValue(record.provider, `${label}.provider`);
    stringValue(record.policy_name, `${label}.policy_name`);
    enumValue(record.legal_regime, LEGAL_REGIMES, `${label}.legal_regime`);
    const rule = enumValue(
      record.applicability_rule,
      APPLICABILITY_RULES,
      `${label}.applicability_rule`
    );
    const incidents = arrayValue(record.incident_types, `${label}.incident_types`);
    incidents.forEach((incident, index) =>
      enumValue(incident, MVP_INCIDENTS, `${label}.incident_types[${index}]`)
    );
    const regions = arrayValue(record.applicable_regions, `${label}.applicable_regions`);
    regions.forEach((region, index) =>
      enumValue(region, POLICY_REGIONS, `${label}.applicable_regions[${index}]`)
    );
    const providers = stringArray(record.applicable_providers, `${label}.applicable_providers`);
    if (rule === "listed_provider" && providers.length === 0) {
      throw new Error(`${label}.applicable_providers must name at least one listed provider.`);
    }
    enumValue(
      record.required_controllability,
      CONTROLLABILITY,
      `${label}.required_controllability`
    );
    validateHttps(record.source_url, `${label}.source_url`);
    enumValue(record.source_type, POLICY_SOURCE_TYPES, `${label}.source_type`);
    enumValue(record.authority_level, ["high", "medium", "low"], `${label}.authority_level`);
    stringArray(record.applicable_conditions, `${label}.applicable_conditions`);
    stringArray(record.compensation_or_rights, `${label}.compensation_or_rights`);
    stringValue(record.summary, `${label}.summary`);
    validateCheckedDate(record.last_checked, `${label}.last_checked`, asOfEpoch, true);

    return structuredClone(record) as Policy;
  });
}

function parseCases(value: unknown): Case[] {
  const records = arrayValue(value, "cases").map((item, index) =>
    objectValue(item, `case[${index}]`)
  );
  requireUnique(records, "case_id", "cases");
  const communityUrls = new Set<string>();
  return records.map((record) => {
    const label = `case ${String(record.case_id ?? "<unknown>")}`;
    requireFields(
      record,
      [
        "case_id",
        "source_type",
        "source_name",
        "source_url",
        "provider_type",
        "provider",
        "brand_or_airline",
        "issue_type",
        "location_country",
        "booking_channel",
        "loyalty_status",
        "reservation_type",
        "facts",
        "requested_compensation",
        "actual_outcome",
        "evidence_used",
        "escalation_path",
        "reusable_lesson",
        "confidence",
        "notes",
        "review_status",
        "review_notes"
      ],
      label
    );
    stringValue(record.case_id, `${label}.case_id`);
    const sourceType = enumValue(
      record.source_type,
      ["community_dp", "user_submitted", "synthetic_example"],
      `${label}.source_type`
    );
    stringValue(record.source_name, `${label}.source_name`);
    const sourceUrl = stringValue(
      record.source_url,
      `${label}.source_url`,
      sourceType === "synthetic_example"
    );
    enumValue(
      record.provider_type,
      ["hotel", "airline", "credit_card", "ota"],
      `${label}.provider_type`
    );
    [
      "provider",
      "brand_or_airline",
      "issue_type",
      "location_country",
      "loyalty_status",
      "facts",
      "actual_outcome",
      "reusable_lesson",
      "notes"
    ].forEach((field) => stringValue(record[field], `${label}.${field}`, field === "notes"));
    enumValue(
      record.booking_channel,
      ["direct", "ota", "portal", "unknown"],
      `${label}.booking_channel`
    );
    enumValue(
      record.reservation_type,
      ["paid", "points", "award", "unknown"],
      `${label}.reservation_type`
    );
    enumValue(record.confidence, ["high", "medium", "low"], `${label}.confidence`);
    const reviewStatus = enumValue(
      record.review_status,
      ["approved", "needs_review", "excluded"],
      `${label}.review_status`
    );
    const reviewNotes = stringArray(record.review_notes, `${label}.review_notes`);
    ["requested_compensation", "evidence_used", "escalation_path"].forEach((field) =>
      stringArray(record[field], `${label}.${field}`)
    );
    if (sourceType === "community_dp") {
      if (communityUrls.has(sourceUrl))
        throw new Error(`${label} has a duplicate community source URL.`);
      communityUrls.add(sourceUrl);
    }
    if (reviewStatus !== "approved" && reviewNotes.length === 0) {
      throw new Error(`${label} must explain why it is not approved.`);
    }
    const issueType = stringValue(record.issue_type, `${label}.issue_type`);
    if (LEGACY_LEGAL_CASE_LABELS.includes(issueType as (typeof LEGACY_LEGAL_CASE_LABELS)[number])) {
      throw new Error(`${label}.issue_type must describe the incident, not a legal regime.`);
    }
    if (
      reviewStatus === "approved" &&
      !CASE_INCIDENTS.includes(issueType as (typeof CASE_INCIDENTS)[number])
    ) {
      throw new Error(`${label} cannot be approved with an unknown issue type.`);
    }
    const parsed = structuredClone(record) as Case;
    const disclosureError = caseSourceDisclosureError(parsed);
    if (disclosureError === "source_url") {
      throw new Error(`${label}.source_url must be an HTTPS URL.`);
    }
    if (disclosureError === "synthetic_label") {
      throw new Error(`${label} synthetic source requires an unmistakable synthetic label.`);
    }
    if (disclosureError === "masquerade") {
      throw new Error(`${label} is a synthetic case masquerading as a real report.`);
    }
    if (disclosureError !== null) {
      throw new Error(`${label}.source_type has invalid value.`);
    }
    return parsed;
  });
}

function parseScripts(value: unknown): Script[] {
  const records = arrayValue(value, "scripts").map((item, index) =>
    objectValue(item, `script[${index}]`)
  );
  requireUnique(records, "script_id", "scripts");
  return records.map((record) => {
    const label = `script ${String(record.script_id ?? "<unknown>")}`;
    requireFields(
      record,
      [
        "script_id",
        "source_ids",
        "incident_types",
        "applicable_regions",
        "applicability_rule",
        "required_controllability",
        "provider",
        "channel",
        "tone",
        "language",
        "template",
        "when_to_use"
      ],
      label
    );
    stringValue(record.script_id, `${label}.script_id`);
    const sourceIds = stringArray(record.source_ids, `${label}.source_ids`);
    if (sourceIds.length < 1 || sourceIds.length > 8) {
      throw new Error(`${label}.source_ids must contain 1..8 policy IDs.`);
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error(`${label} has duplicate source_ids.`);
    }
    const incidents = arrayValue(record.incident_types, `${label}.incident_types`);
    incidents.forEach((incident, index) =>
      enumValue(incident, MVP_INCIDENTS, `${label}.incident_types[${index}]`)
    );
    const regions = arrayValue(record.applicable_regions, `${label}.applicable_regions`);
    regions.forEach((region, index) =>
      enumValue(region, POLICY_REGIONS, `${label}.applicable_regions[${index}]`)
    );
    enumValue(record.applicability_rule, APPLICABILITY_RULES, `${label}.applicability_rule`);
    enumValue(
      record.required_controllability,
      CONTROLLABILITY,
      `${label}.required_controllability`
    );
    stringValue(record.provider, `${label}.provider`);
    enumValue(
      record.channel,
      [
        "front_desk",
        "airport_counter",
        "phone",
        "chat",
        "email",
        "corporate_escalation",
        "regulator_complaint"
      ],
      `${label}.channel`
    );
    enumValue(record.tone, ["polite", "polite_firm", "firm"], `${label}.tone`);
    enumValue(record.language, ["en", "zh"], `${label}.language`);
    stringValue(record.template, `${label}.template`);
    stringValue(record.when_to_use, `${label}.when_to_use`);
    return structuredClone(record) as Script;
  });
}

function parsePredicate(value: unknown, label: string): CarrierCommitmentPredicate {
  const predicate = objectValue(value, label);
  const kind = stringValue(predicate.kind, `${label}.kind`);
  if (kind === "event") {
    if (predicate.field !== "incidentType")
      throw new Error(`${label} predicate field must be incidentType.`);
    if (predicate.operator !== "one_of")
      throw new Error(`${label} predicate operator must be one_of.`);
    const values = arrayValue(predicate.values, `${label}.values`).map((item, index) =>
      enumValue(
        item,
        ["airline_delay", "airline_cancellation"] as const,
        `${label}.values[${index}]`
      )
    );
    if (values.length === 0) throw new Error(`${label}.values must not be empty.`);
    return { kind, field: "incidentType", operator: "one_of", values };
  }
  if (kind === "controllability") {
    if (predicate.field !== "controllability")
      throw new Error(`${label} predicate field must be controllability.`);
    if (predicate.operator !== "equals")
      throw new Error(`${label} predicate operator must be equals.`);
    if (predicate.value !== "controllable") throw new Error(`${label}.value must be controllable.`);
    return { kind, field: "controllability", operator: "equals", value: "controllable" };
  }
  if (kind === "minimum_wait_minutes") {
    if (predicate.field !== "waitMinutes")
      throw new Error(`${label} predicate field must be waitMinutes.`);
    if (predicate.operator !== "at_least")
      throw new Error(`${label} predicate operator must be at_least.`);
    if (!Number.isInteger(predicate.value) || Number(predicate.value) <= 0) {
      throw new Error(`${label}.value must be a positive integer.`);
    }
    return { kind, field: "waitMinutes", operator: "at_least", value: Number(predicate.value) };
  }
  if (kind === "overnight") {
    if (predicate.field !== "isOvernight")
      throw new Error(`${label} predicate field must be isOvernight.`);
    if (predicate.operator !== "equals")
      throw new Error(`${label} predicate operator must be equals.`);
    if (predicate.value !== true) throw new Error(`${label}.value must be true.`);
    return { kind, field: "isOvernight", operator: "equals", value: true };
  }
  throw new Error(`${label} has unknown predicate kind ${kind}.`);
}

function parseCarrierCommitments(value: unknown, asOfEpoch: number): CarrierCommitment[] {
  const records = arrayValue(value, "carrier_commitments").map((item, index) =>
    objectValue(item, `carrier_commitment[${index}]`)
  );
  requireUnique(records, "commitment_id", "carrier commitments");
  return records.map((record) => {
    const label = `carrier commitment ${String(record.commitment_id ?? "<unknown>")}`;
    requireFields(
      record,
      [
        "commitment_id",
        "normalized_carrier",
        "applicable_carrier_role",
        "source_title",
        "source_provider",
        "source_url",
        "source_type",
        "legal_regime",
        "authority",
        "last_checked",
        "reviewer_note",
        "remedies"
      ],
      label
    );
    const commitmentId = stringValue(record.commitment_id, `${label}.commitment_id`);
    const normalizedCarrier = stringValue(record.normalized_carrier, `${label}.normalized_carrier`);
    const providerMatch = findProviderMatch(normalizedCarrier, "airline");
    if (!providerMatch) throw new Error(`${label} has an unknown canonical carrier.`);
    if (providerMatch.provider !== normalizedCarrier) {
      throw new Error(
        `${label}.normalized_carrier must use the canonical carrier name ${providerMatch.provider}.`
      );
    }
    if (record.applicable_carrier_role !== "operating_carrier")
      throw new Error(`${label}.applicable_carrier_role must be operating_carrier.`);
    const sourceTitle = stringValue(record.source_title, `${label}.source_title`);
    const sourceProvider = stringValue(record.source_provider, `${label}.source_provider`);
    const sourceUrl = validateHttps(record.source_url, `${label}.source_url`);
    const sourceType = enumValue(
      record.source_type,
      ["official_dashboard", "official_policy"],
      `${label}.source_type`
    );
    if (record.legal_regime !== "US_AIRLINE_COMMITMENT")
      throw new Error(`${label}.legal_regime must be US_AIRLINE_COMMITMENT.`);
    if (record.authority !== "medium") throw new Error(`${label}.authority must be medium.`);
    const lastChecked = validateCheckedDate(
      record.last_checked,
      `${label}.last_checked`,
      asOfEpoch,
      true
    );
    const reviewerNote = stringValue(record.reviewer_note, `${label}.reviewer_note`);
    const remedyRecords = arrayValue(record.remedies, `${label}.remedies`).map((item, index) =>
      objectValue(item, `${label}.remedies[${index}]`)
    );
    requireUnique(remedyRecords, "remedy_id", `${label}.remedies`);
    const remedies: CarrierCommitmentRemedy[] = remedyRecords.map((remedy, index) => {
      const remedyLabel = `${label}.remedies[${index}]`;
      requireFields(
        remedy,
        ["remedy_id", "committed", "predicates", "display_conditions", "rights"],
        remedyLabel
      );
      const remedyId = enumValue(remedy.remedy_id, REMEDY_IDS, `${remedyLabel}.remedy_id`);
      const committed = booleanValue(remedy.committed, `${remedyLabel}.committed`);
      const predicates = arrayValue(remedy.predicates, `${remedyLabel}.predicates`).map(
        (predicate, predicateIndex) =>
          parsePredicate(predicate, `${remedyLabel}.predicates[${predicateIndex}]`)
      );
      if (committed) {
        const hasEvent = predicates.some((predicate) => predicate.kind === "event");
        const hasControllability = predicates.some(
          (predicate) => predicate.kind === "controllability"
        );
        if (!hasEvent || !hasControllability) {
          throw new Error(
            `${remedyLabel} committed remedy requires both event and controllability predicates.`
          );
        }
      }
      return {
        remedyId,
        committed,
        predicates,
        displayConditions: stringArray(
          remedy.display_conditions,
          `${remedyLabel}.display_conditions`
        ),
        rights: stringArray(remedy.rights, `${remedyLabel}.rights`)
      };
    });
    return {
      commitmentId,
      normalizedCarrier,
      applicableCarrierRole: "operating_carrier",
      sourceTitle,
      sourceProvider,
      sourceUrl,
      sourceType,
      legalRegime: "US_AIRLINE_COMMITMENT",
      authority: "medium",
      lastChecked,
      reviewerNote,
      remedies
    };
  });
}

function assertDisjointNamespaces(
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  commitments: CarrierCommitment[]
): void {
  const owners = new Map<string, string>();
  const collections: Array<[string, string[]]> = [
    ["policy", policies.map((item) => item.policy_id)],
    ["case", cases.map((item) => item.case_id)],
    ["script", scripts.map((item) => item.script_id)],
    ["commitment", commitments.map((item) => item.commitmentId)]
  ];
  collections.forEach(([namespace, ids]) => {
    ids.forEach((id) => {
      const prior = owners.get(id);
      if (prior)
        throw new Error(
          `Identifier namespace collision: ${id} belongs to both ${prior} and ${namespace}.`
        );
      owners.set(id, namespace);
    });
  });
}

function assertScriptReferences(
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  commitments: CarrierCommitment[]
): void {
  const policyIds = new Set(policies.map((item) => item.policy_id));
  const caseIds = new Set(cases.map((item) => item.case_id));
  const scriptIds = new Set(scripts.map((item) => item.script_id));
  const commitmentIds = new Set(commitments.map((item) => item.commitmentId));
  scripts.forEach((script) => {
    script.source_ids.forEach((sourceId) => {
      if (!policyIds.has(sourceId)) {
        if (caseIds.has(sourceId))
          throw new Error(
            `script ${script.script_id} source_id ${sourceId} resolves to the case namespace.`
          );
        if (commitmentIds.has(sourceId))
          throw new Error(
            `script ${script.script_id} source_id ${sourceId} resolves to the commitment namespace.`
          );
        if (scriptIds.has(sourceId))
          throw new Error(
            `script ${script.script_id} source_id ${sourceId} resolves to the script namespace.`
          );
        throw new Error(
          `script ${script.script_id} source_id ${sourceId} references an unknown policy.`
        );
      }
    });
  });
}

function compareCanonicalKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => compareCanonicalKeys(left, right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as JsonObject).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

export function parseKnowledgeSnapshot(
  raw: RawKnowledgeSnapshot,
  options: ParseKnowledgeOptions
): KnowledgeSnapshot {
  const asOf = parseCalendarDate(options.asOf, "asOf");
  const policies = parsePolicies(raw.policies, asOf.epoch);
  const cases = parseCases(raw.cases);
  const scripts = parseScripts(raw.scripts);
  const carrierCommitments = parseCarrierCommitments(raw.carrierCommitments, asOf.epoch);
  assertDisjointNamespaces(policies, cases, scripts, carrierCommitments);
  assertScriptReferences(policies, cases, scripts, carrierCommitments);
  const validatedContent = { policies, cases, scripts, carrierCommitments };
  const version = createHash("sha256")
    .update(JSON.stringify(canonicalize(validatedContent)), "utf8")
    .digest("hex");
  return deepFreeze({ ...validatedContent, version });
}
