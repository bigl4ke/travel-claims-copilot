import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  const contents = await readFile(resolve(projectRoot, relativePath), "utf8");
  const value = JSON.parse(contents);

  if (!Array.isArray(value)) {
    throw new Error(`${relativePath} must contain a top-level array.`);
  }

  return value;
}

function requireFields(record, fields, label) {
  fields.forEach((field) => {
    if (!(field in record)) {
      throw new Error(`${label} is missing required field ${field}.`);
    }
  });
}

function requireUnique(records, field, label) {
  const seen = new Set();

  records.forEach((record) => {
    const value = record[field];
    if (seen.has(value)) {
      throw new Error(`${label} has duplicate ${field}: ${value}`);
    }
    seen.add(value);
  });
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} has invalid value: ${String(value)}`);
  }
}

const mvpIncidentTypes = ["hotel_walk", "airline_delay", "airline_cancellation", "denied_boarding"];
const legacyLegalIssueTypes = [
  "controllable_airline_delay",
  "controllable_airline_cancellation",
  "eu261_delay_or_cancellation"
];
const policyRegions = ["EU_EEA_CH", "UK", "US", "CA", "AU", "CN", "other", "global"];
const legalRegimes = [
  "provider_policy",
  "EU261",
  "UK261",
  "US_DOT_REFUND",
  "US_DOT_DENIED_BOARDING",
  "US_AIRLINE_COMMITMENT",
  "CA_APPR",
  "AU_ACL",
  "CN_FLIGHT_REGULATION"
];
const policyApplicabilityRules = [
  "any_route",
  "listed_provider",
  "origin_region",
  "origin_or_destination_region",
  "eu261_route",
  "uk261_route",
  "australia_consumer_law",
  "china_flight_regulation"
];

const [cases, policies, scripts] = await Promise.all([
  readJson("data/cases.json"),
  readJson("data/policies.json"),
  readJson("data/scripts.json")
]);

const caseFields = [
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
];

requireUnique(cases, "case_id", "cases.json");

const communityUrls = new Set();
cases.forEach((item) => {
  const label = `case ${item.case_id ?? "<unknown>"}`;
  requireFields(item, caseFields, label);
  requireEnum(item.source_type, ["community_dp", "user_submitted", "synthetic_example"], label);
  requireEnum(item.provider_type, ["hotel", "airline", "credit_card", "ota"], label);
  requireEnum(item.booking_channel, ["direct", "ota", "portal", "unknown"], label);
  requireEnum(item.reservation_type, ["paid", "points", "award", "unknown"], label);
  requireEnum(item.confidence, ["high", "medium", "low"], label);
  requireEnum(item.review_status, ["approved", "needs_review", "excluded"], label);
  if (legacyLegalIssueTypes.includes(item.issue_type)) {
    throw new Error(`${label}.issue_type must describe the incident, not a legal regime.`);
  }

  ["requested_compensation", "evidence_used", "escalation_path", "review_notes"].forEach(
    (field) => {
      if (!Array.isArray(item[field])) {
        throw new Error(`${label}.${field} must be an array.`);
      }
    }
  );

  if (item.source_type === "community_dp") {
    if (!item.source_url.startsWith("https://")) {
      throw new Error(`${label} must have an HTTPS source URL.`);
    }
    if (communityUrls.has(item.source_url)) {
      throw new Error(`${label} duplicates community source URL ${item.source_url}.`);
    }
    communityUrls.add(item.source_url);
  }

  if (item.review_status !== "approved" && item.review_notes.length === 0) {
    throw new Error(`${label} must explain why it is not approved.`);
  }

  if (item.review_status === "approved" && item.issue_type === "unknown") {
    throw new Error(`${label} cannot be approved with an unknown issue type.`);
  }
});

requireUnique(policies, "policy_id", "policies.json");
policies.forEach((policy) => {
  requireFields(
    policy,
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
    `policy ${policy.policy_id ?? "<unknown>"}`
  );
  const label = `policy ${policy.policy_id ?? "<unknown>"}`;
  ["incident_types", "applicable_regions", "applicable_providers"].forEach((field) => {
    if (!Array.isArray(policy[field])) {
      throw new Error(`${label}.${field} must be an array.`);
    }
  });
  policy.incident_types.forEach((incidentType) => {
    requireEnum(incidentType, mvpIncidentTypes, label);
  });
  policy.applicable_regions.forEach((region) => {
    requireEnum(region, policyRegions, label);
  });
  requireEnum(policy.legal_regime, legalRegimes, label);
  requireEnum(policy.applicability_rule, policyApplicabilityRules, label);
  requireEnum(
    policy.source_type,
    [
      "official_policy",
      "government_regulation",
      "regulator_guidance",
      "official_dashboard",
      "terms"
    ],
    label
  );
  requireEnum(policy.authority_level, ["high", "medium", "low"], label);
  if (!policy.source_url.startsWith("https://")) {
    throw new Error(`${label}.source_url must be an HTTPS URL.`);
  }
  requireEnum(
    policy.required_controllability,
    ["controllable", "uncontrollable", "unknown", "any"],
    label
  );
});

requireUnique(scripts, "script_id", "scripts.json");
scripts.forEach((script) => {
  const label = `script ${script.script_id ?? "<unknown>"}`;
  requireFields(
    script,
    [
      "script_id",
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
  ["incident_types", "applicable_regions"].forEach((field) => {
    if (!Array.isArray(script[field])) {
      throw new Error(`${label}.${field} must be an array.`);
    }
  });
  script.incident_types.forEach((incidentType) => {
    requireEnum(incidentType, mvpIncidentTypes, label);
  });
  script.applicable_regions.forEach((region) => {
    requireEnum(region, policyRegions, label);
  });
  requireEnum(script.applicability_rule, policyApplicabilityRules, label);
  requireEnum(
    script.required_controllability,
    ["controllable", "uncontrollable", "unknown", "any"],
    label
  );
  requireEnum(
    script.channel,
    [
      "front_desk",
      "airport_counter",
      "phone",
      "chat",
      "email",
      "corporate_escalation",
      "regulator_complaint"
    ],
    label
  );
});

const statusCounts = Object.fromEntries(
  ["approved", "needs_review", "excluded"].map((status) => [
    status,
    cases.filter((item) => item.review_status === status).length
  ])
);

process.stdout.write(
  `Validated ${policies.length} policies, ${cases.length} cases (${Object.entries(statusCounts)
    .map(([status, count]) => `${count} ${status}`)
    .join(", ")}), and ${scripts.length} scripts.\n`
);
